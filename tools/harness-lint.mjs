#!/usr/bin/env node
// Structure + token-budget lint for the harness. Exit 1 on any error.
// Token figures are rough (chars / 4) - good for comparing changes, not for billing.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.HARNESS_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIMIT = { claude: 150, agent: 90, skill: 130, desc: 400 };
const MODELS = new Set(['sonnet', 'opus', 'haiku', 'fable', 'inherit']);

const errors = [];
const err = (m) => errors.push(m);
const abs = (...p) => path.join(ROOT, ...p);
const exists = (...p) => fs.existsSync(abs(...p));
const read = (...p) => fs.readFileSync(abs(...p), 'utf8').replace(/\r\n/g, '\n');
const lineCount = (s) => s.trimEnd().split('\n').length;
const tok = (s) => Math.ceil(s.length / 4);

function parse(text, label) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) { err(`${label}: missing frontmatter`); return { fm: {}, body: text }; }
  const fm = {};
  let key = null;
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    const item = line.match(/^\s+-\s+(.+)$/);
    if (kv) { key = kv[1]; fm[key] = kv[2] === '' ? [] : kv[2].replace(/^"(.*)"$/, '$1'); }
    else if (item && Array.isArray(fm[key])) fm[key].push(item[1]);
    else if (line.trim()) err(`${label}: unsupported frontmatter line "${line}"`);
  }
  return { fm, body: text.slice(m[0].length) };
}

function checkDescription(text, fm, label) {
  if (!fm.description) return err(`${label}: missing description`);
  if (!/^description: ".*"$/m.test(text)) err(`${label}: description must be one double-quoted line`);
  if (fm.description.includes('"')) err(`${label}: description contains a double quote`);
  if (fm.description.length > LIMIT.desc) err(`${label}: description is ${fm.description.length} chars (max ${LIMIT.desc})`);
}

// CLAUDE.md
let claudeMd = '';
if (!exists('CLAUDE.md')) err('CLAUDE.md missing');
else {
  claudeMd = read('CLAUDE.md');
  if (!claudeMd.startsWith('# CLAUDE.md\n\nThis file provides guidance to Claude Code (claude.ai/code)')) err('CLAUDE.md: required header missing');
  if (lineCount(claudeMd) > LIMIT.claude) err(`CLAUDE.md: ${lineCount(claudeMd)} lines (max ${LIMIT.claude})`);
}

// Skills
const skillDirs = exists('.claude', 'skills')
  ? fs.readdirSync(abs('.claude', 'skills')).filter((s) => fs.statSync(abs('.claude', 'skills', s)).isDirectory()).sort()
  : [];
const skillText = {};
let listing = 0;
for (const s of skillDirs) {
  const label = `skills/${s}`;
  if (!exists('.claude', 'skills', s, 'SKILL.md')) { err(`${label}: SKILL.md missing`); continue; }
  const text = read('.claude', 'skills', s, 'SKILL.md');
  skillText[s] = text;
  const { fm } = parse(text, label);
  if (fm.name !== s) err(`${label}: name "${fm.name}" must equal directory name`);
  checkDescription(text, fm, label);
  if (fm['disable-model-invocation'] !== 'true') listing += tok(fm.description || ''); // hidden skills cost no listing tokens
  if (lineCount(text) > LIMIT.skill) err(`${label}: ${lineCount(text)} lines (max ${LIMIT.skill}); move detail to references/`);
  // Only bare "references/x.md" counts as this skill's own link, not ".../other-skill/references/x.md".
  const linked = new Set([...text.matchAll(/(?<![\w./-])references\/([\w.-]+\.md)/g)].map((m) => m[1]));
  for (const r of linked) if (!exists('.claude', 'skills', s, 'references', r)) err(`${label}: links missing references/${r}`);
  const refDir = abs('.claude', 'skills', s, 'references');
  if (fs.existsSync(refDir)) for (const f of fs.readdirSync(refDir)) if (!linked.has(f)) err(`${label}: references/${f} is not linked from SKILL.md`);
}

// Agents
const rows = [];
const agentDir = abs('.claude', 'agents');
const agentFiles = fs.existsSync(agentDir) ? fs.readdirSync(agentDir).filter((f) => f.endsWith('.md')).sort() : [];
if (!agentFiles.length) err('no agents defined');
for (const f of agentFiles) {
  const name = f.replace(/\.md$/, '');
  const label = `agents/${f}`;
  const text = read('.claude', 'agents', f);
  const { fm, body } = parse(text, label);
  if (fm.name !== name) err(`${label}: name "${fm.name}" must equal file name`);
  checkDescription(text, fm, label);
  listing += tok(fm.description || '');
  for (const k of ['tools', 'model', 'maxTurns']) if (!fm[k]) err(`${label}: missing ${k}`);
  if (fm.model && !MODELS.has(fm.model) && !/^claude-/.test(fm.model)) err(`${label}: unknown model "${fm.model}"`);
  if (fm.maxTurns && !/^\d+$/.test(fm.maxTurns)) err(`${label}: maxTurns must be an integer`);
  if (lineCount(text) > LIMIT.agent) err(`${label}: ${lineCount(text)} lines (max ${LIMIT.agent})`);
  if (!body.split(/\n## /)[0].trim()) err(`${label}: no persona paragraph before the first "## "`);
  let preload = 0;
  for (const s of Array.isArray(fm.skills) ? fm.skills : []) {
    if (!skillText[s]) err(`${label}: skill "${s}" not found`);
    else preload += tok(skillText[s]);
  }
  rows.push([name, tok(claudeMd) + tok(text) + preload, preload]);
}

// Settings
try {
  const settings = JSON.parse(read('.claude', 'settings.json'));
  for (const list of Object.values(settings.hooks ?? {})) {
    for (const group of list) {
      for (const h of group.hooks ?? []) {
        for (const m of String(h.command ?? '').matchAll(/\.claude\/hooks\/[\w.-]+\.mjs/g)) {
          if (!exists(...m[0].split('/'))) err(`settings.json: hook script ${m[0]} not found`);
        }
      }
    }
  }
} catch (e) {
  err(`settings.json: ${e.message}`);
}

console.log('Token estimate (chars/4)');
console.log(`  CLAUDE.md, loaded by every session and every subagent : ${tok(claudeMd)}`);
console.log(`  skill + agent descriptions, listed in the main session : ${listing}`);
for (const [name, total, preload] of rows) {
  console.log(`  spawn ${name.padEnd(10)} = CLAUDE.md + agent + ${String(preload).padStart(4)} preloaded skill : ${total}`);
}
if (errors.length) {
  console.log(`\n${errors.length} problem(s):`);
  for (const e of errors) console.log(`  - ${e}`);
  process.exitCode = 1;
} else {
  console.log('\nOK');
}
