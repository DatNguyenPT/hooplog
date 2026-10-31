#!/usr/bin/env node
// One-shot Claude call with the token levers Claude Code does not expose: stop sequences, a hard
// max_tokens cap, a local response cache and prompt caching on a stable system prefix.
// For scripted work (CI log triage, summaries, classification), not a replacement for the agents.
import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.HARNESS_ROOT || path.resolve(here, '..');
const CACHE_DIR = path.join(ROOT, '.harness', 'cache');

const DEFAULT_MODEL = 'claude-opus-5-5';
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5-5']);
const WRAP_RULE = 'Reply with only your answer inside <result></result> tags, as short as the task allows. Write nothing after </result>.';

const USAGE = `usage: node tools/ask.mjs [options] (--prompt "<text>" | --file <path> | < stdin)
  --role <agent|file>   persona: text before the first "## " of .claude/agents/<name>.md (or a whole file)
  --context <file>      stable reference text for the cached system prefix (repeatable; order matters)
  --max-tokens <n>      hard output cap, thinking included (default 2048; exit 4 if hit)
  --stop <seq>          stop sequence (repeatable; default </result>)
  --no-wrap             do not ask for <result> tags or add the default stop sequence
  --model <id>          default $HARNESS_MODEL or ${DEFAULT_MODEL}
  --effort <level>      low|medium|high|xhigh|max|none (default low; none omits the field)
  --ttl <days>          response-cache lifetime (default 14);  --no-cache / --refresh to bypass / recompute
  --no-fallback         do not opt into server-side refusal fallbacks
  --dry-run             print the request and exit (no API key needed)`;

const die = (msg, code = 1) => { console.error(`[ask] ${msg}`); process.exit(code); };

let values;
try {
  ({ values } = parseArgs({
    options: {
      role: { type: 'string' }, context: { type: 'string', multiple: true }, prompt: { type: 'string' },
      file: { type: 'string' }, model: { type: 'string' }, 'max-tokens': { type: 'string' },
      stop: { type: 'string', multiple: true }, 'no-wrap': { type: 'boolean' }, effort: { type: 'string' },
      ttl: { type: 'string' }, 'no-cache': { type: 'boolean' }, refresh: { type: 'boolean' },
      'no-fallback': { type: 'boolean' }, 'dry-run': { type: 'boolean' }, help: { type: 'boolean' },
    },
  }));
} catch (e) {
  die(`${e.message}\n${USAGE}`, 64);
}
if (values.help) { console.log(USAGE); process.exit(0); }

// Roles are defined once, in the agent files: the persona is the text before the first "## ".
function loadRole(spec) {
  const agentFile = path.join(ROOT, '.claude', 'agents', `${spec}.md`);
  const isAgent = fs.existsSync(agentFile);
  const raw = fs.readFileSync(isAgent ? agentFile : spec, 'utf8').replace(/\r\n/g, '\n');
  const body = raw.replace(/^---\n[\s\S]*?\n---\n/, '');
  return (isAgent ? body.split(/\n## /)[0] : body).trim();
}

const wrap = !values['no-wrap'];
const systemText = [
  values.role ? loadRole(values.role) : '',
  ...(values.context ?? []).map((f) => `<context file="${path.basename(f)}">\n${fs.readFileSync(f, 'utf8').trim()}\n</context>`),
  wrap ? WRAP_RULE : '',
].filter(Boolean).join('\n\n');

let prompt = values.prompt ?? '';
if (values.file) prompt += (prompt ? '\n\n' : '') + fs.readFileSync(values.file, 'utf8');
if (!prompt && !process.stdin.isTTY) { try { prompt = fs.readFileSync(0, 'utf8'); } catch { /* no stdin */ } }
if (!prompt.trim()) die(`no prompt\n${USAGE}`, 64);

const model = values.model || process.env.HARNESS_MODEL || DEFAULT_MODEL;
const maxTokens = Number.parseInt(values['max-tokens'] ?? '2048', 10);
if (!(maxTokens > 0)) die('--max-tokens must be a positive integer', 64);
const effort = values.effort ?? 'low';
const stop = values.stop?.length ? values.stop : wrap ? ['</result>'] : [];
const useFallback = !values['no-fallback'] && FALLBACK_MODELS.has(model);

// Stable parts first (system), volatile part last (the prompt): the cache breakpoint sits on the system block.
const request = {
  model,
  max_tokens: maxTokens,
  ...(stop.length ? { stop_sequences: stop } : {}),
  ...(systemText ? { system: [{ type: 'text', text: systemText, cache_control: { type: 'ephemeral' } }] } : {}),
  messages: [{ role: 'user', content: prompt }],
  ...(effort !== 'none' ? { output_config: { effort } } : {}),
  ...(useFallback ? { fallbacks: 'default' } : {}),
};

if (values['dry-run']) {
  console.log(JSON.stringify({ ...request, ...(useFallback ? { betas: [FALLBACK_BETA] } : {}) }, null, 2));
  process.exit(0);
}

const key = createHash('sha256').update(JSON.stringify(request)).digest('hex').slice(0, 24);
const cacheFile = path.join(CACHE_DIR, `${key}.json`);
const ttlMs = Number(values.ttl ?? 14) * 86_400_000;

if (!values['no-cache'] && !values.refresh) {
  try {
    const hit = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    if (Date.now() - hit.createdAt < ttlMs) {
      console.error(`[ask] cache hit ${key} (0 tokens)`);
      process.stdout.write(hit.text + '\n');
      process.exit(0);
    }
  } catch { /* miss */ }
}

const client = new Anthropic({ maxRetries: Number(process.env.HARNESS_MAX_RETRIES ?? 2) });
let res;
try {
  res = useFallback
    ? await client.beta.messages.create({ ...request, betas: [FALLBACK_BETA] })
    : await client.messages.create(request);
} catch (e) {
  if (e instanceof Anthropic.AuthenticationError) die('authentication failed: set ANTHROPIC_API_KEY (or run `ant auth login`)', 2);
  if (e instanceof Anthropic.RateLimitError) die('rate limited; retry later', 2);
  if (e instanceof Anthropic.BadRequestError) die(`bad request: ${e.message}`, 2);
  if (e instanceof Anthropic.APIError) die(`API error ${e.status ?? ''}: ${e.message}`, 2);
  throw e;
}

const u = res.usage ?? {};
console.error(`[ask] model=${res.model ?? model} in=${u.input_tokens ?? 0} cache_read=${u.cache_read_input_tokens ?? 0} ` +
  `cache_write=${u.cache_creation_input_tokens ?? 0} out=${u.output_tokens ?? 0} stop=${res.stop_reason}`);
if (res.stop_reason === 'refusal') die(`refused (${res.stop_details?.category ?? 'unknown'}); not cached`, 3);

let text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
if (wrap) text = text.replace(/^\s*<result>\s*/, '').replace(/\s*<\/result>\s*$/, '');
text = text.trim();

const truncated = res.stop_reason === 'max_tokens';
if (!truncated && !values['no-cache']) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify({ createdAt: Date.now(), model, text, stop_reason: res.stop_reason, usage: u }));
}
process.stdout.write(text + '\n');
if (truncated) {
  console.error('[ask] truncated at --max-tokens (thinking counts toward the cap); raise it');
  process.exitCode = 4;
}
