#!/usr/bin/env node
// Compact inventory of a Postman collection (v2.0 / v2.1): read a few KB instead of a multi-MB JSON file.
// Used by .claude/skills/test-case-design. Prints text, or JSON with --json. Secret-looking values are masked.
import fs from 'node:fs';
import { parseArgs } from 'node:util';

const USAGE = 'usage: node tools/postman-summary.mjs <collection.json> [--env <environment.json>] [--folder <text>] [--limit <n>] [--samples] [--max-body <chars>] [--json]';
const die = (msg, code = 1) => { console.error(`[postman-summary] ${msg}`); process.exit(code); };

let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: {
      env: { type: 'string' }, folder: { type: 'string' }, limit: { type: 'string' }, 'max-body': { type: 'string' },
      samples: { type: 'boolean' }, json: { type: 'boolean' },
    },
  });
} catch (e) {
  die(`${e.message}\n${USAGE}`, 64);
}
const { values, positionals } = parsed;
if (!positionals[0]) die(USAGE, 64);

const load = (p) => {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return die(`cannot read ${p}: ${e.message}`); }
};
const col = load(positionals[0]);
if (!Array.isArray(col.item)) die('not a Postman collection: no "item" array');

const MAXBODY = Number(values['max-body'] ?? 160);
const SECRET = /token|secret|password|passwd|api[-_]?key|auth|bearer|credential/i;
const text = (x) => (Array.isArray(x) ? x.join('\n') : x ?? '');
const maskUrl = (u) => u.replace(/([?&][^=&]*(?:token|secret|key|password|auth)[^=&]*=)[^&\s]*/gi, '$1***');

const vars = {};
for (const v of col.variable ?? []) if (v.key) vars[v.key] = v.value;
if (values.env) for (const v of load(values.env).values ?? []) if (v.key && v.enabled !== false) vars[v.key] = v.value;
const shownVars = Object.entries(vars).map(([k, v]) => `${k}=${SECRET.test(k) ? '***' : String(v ?? '').slice(0, 60)}`);

function urlOf(req) {
  const u = req.url;
  if (!u) return '';
  if (typeof u === 'string') return maskUrl(u);
  if (u.raw) return maskUrl(u.raw);
  const host = Array.isArray(u.host) ? u.host.join('.') : u.host ?? '';
  return maskUrl(`${u.protocol ? `${u.protocol}://` : ''}${host}/${(u.path ?? []).join('/')}`);
}

function digest(item, folder) {
  const req = typeof item.request === 'string' ? { method: 'GET', url: item.request } : item.request ?? {};
  const url = urlOf(req);
  const u = req.url && typeof req.url === 'object' ? req.url : {};
  const b = req.body ?? {};
  let body = null;
  if (b.mode === 'raw') {
    const raw = text(b.raw);
    body = {
      mode: b.options?.raw?.language ?? 'raw',
      fields: [...new Set([...raw.matchAll(/"([\w.-]+)"\s*:/g)].map((m) => m[1]))].slice(0, 15),
      sample: raw.replace(/\s+/g, ' ').slice(0, MAXBODY),
    };
  } else if (b.mode === 'formdata' || b.mode === 'urlencoded') {
    body = { mode: b.mode, fields: (b[b.mode] ?? []).filter((f) => !f.disabled).map((f) => (f.type === 'file' ? `${f.key}(file)` : f.key)) };
  } else if (b.mode === 'graphql') {
    body = { mode: 'graphql', sample: text(b.graphql?.query).replace(/\s+/g, ' ').slice(0, MAXBODY) };
  } else if (b.mode) {
    body = { mode: b.mode };
  }
  const script = (kind) => (item.event ?? []).filter((e) => e.listen === kind).map((e) => text(e.script?.exec)).join('\n');
  const test = script('test');
  return {
    folder,
    name: item.name,
    method: (req.method ?? 'GET').toUpperCase(),
    url,
    auth: req.auth?.type ?? 'inherit',
    query: (u.query ?? []).filter((q) => !q.disabled).map((q) => q.key),
    pathVars: [...new Set([...(u.variable ?? []).map((v) => v.key), ...[...url.matchAll(/\/:([\w]+)/g)].map((m) => m[1])])],
    headers: (req.header ?? []).filter((h) => !h.disabled).map((h) => h.key),
    body,
    tests: [...test.matchAll(/pm\.test\(\s*(["'`])(.+?)\1/g)].map((m) => m[2]),
    asserts: [...new Set([...test.matchAll(/(?:status\(|\.code\)\.to\.(?:eql|equal)\(|\.code\s*===?\s*)(\d{3})/g)].map((m) => Number(m[1])))],
    examples: (item.response ?? []).map((r) => r.code).filter(Boolean),
    preRequest: Boolean(script('prerequest').trim()),
  };
}

const all = [];
let folders = 0;
(function walk(items, trail) {
  for (const it of items) {
    if (Array.isArray(it.item)) { folders += 1; walk(it.item, [...trail, it.name]); } else all.push(digest(it, trail.join(' / ')));
  }
})(col.item, []);

const needle = values.folder?.toLowerCase();
const filtered = needle ? all.filter((r) => `${r.folder} / ${r.name}`.toLowerCase().includes(needle)) : all;
const reqs = filtered.slice(0, Number(values.limit ?? 200));
const gaps = {
  noTests: all.filter((r) => !r.tests.length).length,
  noErrorCase: all.filter((r) => ![...r.asserts, ...r.examples].some((c) => c >= 400)).length,
};

if (values.json) {
  console.log(JSON.stringify({ name: col.info?.name, auth: col.auth?.type ?? 'none', variables: shownVars, folders, total: all.length, requests: reqs, gaps }, null, 2));
  process.exit(0);
}

const methods = Object.entries(all.reduce((m, r) => ({ ...m, [r.method]: (m[r.method] ?? 0) + 1 }), {})).map(([k, n]) => `${k} ${n}`).join(', ');
const lines = [
  `Collection: ${col.info?.name ?? '?'} | requests: ${all.length} | folders: ${folders}${needle || reqs.length < filtered.length ? ` | shown: ${reqs.length}` : ''} | ${methods}`,
  `Auth: ${col.auth?.type ?? 'none'}${shownVars.length ? ` | Vars: ${shownVars.join(', ')}` : ''}`,
];
let last = null;
reqs.forEach((r, i) => {
  if (r.folder !== last) { lines.push('', `## ${r.folder || '(root)'}`); last = r.folder; }
  const parts = [`${i + 1}. ${r.method} ${r.url}`];
  if (r.auth !== 'inherit') parts.push(`auth:${r.auth}`);
  if (r.pathVars.length) parts.push(`path:${r.pathVars.join(',')}`);
  if (r.query.length) parts.push(`query:${r.query.join(',')}`);
  if (r.body) parts.push(`body:${r.body.mode}${r.body.fields?.length ? ` {${r.body.fields.join(',')}}` : ''}`);
  if (values.samples && r.body?.sample) parts.push(`sample:${r.body.sample}`);
  if (r.tests.length) parts.push(`tests:${r.tests.map((t) => `"${t}"`).join(';')}`);
  if (r.asserts.length) parts.push(`asserts:${r.asserts.join(',')}`);
  if (r.examples.length) parts.push(`examples:${r.examples.join(',')}`);
  if (r.preRequest) parts.push('pre-request');
  lines.push(parts.join(' | '));
});
lines.push('', `Gaps: ${gaps.noTests} request(s) without tests; ${gaps.noErrorCase} without a 4xx/5xx assertion or example`);
console.log(lines.join('\n'));
