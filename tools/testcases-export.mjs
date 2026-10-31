#!/usr/bin/env node
// Convert test-case Markdown tables (format: .claude/skills/test-case-design/references/test-case-template.md)
// into CSV for test management tools. Deterministic, so no model tokens are spent on formatting.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const USAGE = 'usage: node tools/testcases-export.mjs <file.md|dir>... [--format generic|testrail|steps] [--out file.csv] [--section <name>] [--fill] [--bom]';
const die = (msg, code = 1) => { console.error(`[export] ${msg}`); process.exit(code); };

let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: {
      format: { type: 'string' }, out: { type: 'string' }, section: { type: 'string' },
      fill: { type: 'boolean' }, bom: { type: 'boolean' },
    },
  });
} catch (e) {
  die(`${e.message}\n${USAGE}`, 64);
}
const { values, positionals } = parsed;
const format = values.format ?? 'generic';
if (!['generic', 'testrail', 'steps'].includes(format) || !positionals.length) die(USAGE, 64);

const COLUMNS = {
  id: 'id', 'test id': 'id', title: 'title', name: 'title', summary: 'title',
  pri: 'priority', priority: 'priority', type: 'type',
  pre: 'pre', precondition: 'pre', preconditions: 'pre',
  steps: 'steps', step: 'steps', expected: 'expected', 'expected result': 'expected', 'expected results': 'expected',
  data: 'data', 'test data': 'data', refs: 'refs', references: 'refs', requirement: 'refs', requirements: 'refs',
  auto: 'auto', automate: 'auto', automation: 'auto',
};
const PRIORITY_WORDS = { critical: 'P0', high: 'P1', medium: 'P2', low: 'P3' };

const warnings = [];
const problems = [];

// Split a table row on unescaped pipes; "\|" is a literal pipe.
function cells(line) {
  const s = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const out = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') { cur += '|'; i += 1; } else if (s[i] === '|') { out.push(cur.trim()); cur = ''; } else cur += s[i];
  }
  out.push(cur.trim());
  return out;
}

const list = (s) => s.split(/<br\s*\/?>/i).map((x) => x.trim()).filter(Boolean);
const stripNo = (s) => s.replace(/^\d+[.)]\s*/, '');

function priority(raw, id) {
  const m = /^p?([0-3])$/i.exec(raw.trim());
  if (m) return `P${m[1]}`;
  if (PRIORITY_WORDS[raw.trim().toLowerCase()]) return PRIORITY_WORDS[raw.trim().toLowerCase()];
  warnings.push(`${id}: unknown priority "${raw}"`);
  return raw.trim();
}

function mdFiles(p) {
  if (!fs.existsSync(p)) die(`not found: ${p}`);
  if (fs.statSync(p).isFile()) return [p];
  return fs.readdirSync(p, { recursive: true }).map((f) => path.join(p, f)).filter((f) => f.endsWith('.md') && fs.statSync(f).isFile()).sort();
}

function parseFile(file) {
  const lines = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n');
  const cases = [];
  let title = path.basename(file, '.md');
  let sub = '';
  let fence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) { fence = !fence; continue; }
    if (fence) continue;
    const h = /^(#{1,3})\s+(.*?)\s*$/.exec(line);
    if (h) {
      if (h[1] === '#') { title = h[2].replace(/\s+test cases?$/i, ''); sub = ''; } else sub = /^(cases?|test cases?|coverage|requirements)$/i.test(h[2]) ? '' : h[2];
      continue;
    }
    if (!line.trimStart().startsWith('|') || !/^\s*\|?\s*:?-{3,}/.test(lines[i + 1] ?? '')) continue;
    const cols = cells(line).map((c) => COLUMNS[c.toLowerCase()]);
    let j = i + 2;
    while (j < lines.length && lines[j].trimStart().startsWith('|')) j += 1;
    const rows = lines.slice(i + 2, j);
    i = j - 1;
    if (!cols.includes('id') || !cols.includes('title')) continue; // coverage matrix or other table
    if (!cols.includes('steps') || !cols.includes('expected')) { problems.push(`${file}: a case table has no Steps or no Expected column`); continue; }
    for (const row of rows) {
      const rec = {};
      cells(row).forEach((v, idx) => { if (cols[idx]) rec[cols[idx]] = v; });
      if (!rec.id) { warnings.push(`${file}: skipped a row with no ID`); continue; }
      const c = {
        id: rec.id, title: rec.title ?? '', section: values.section ?? [title, sub].filter(Boolean).join(' / '),
        priority: priority(rec.priority ?? '', rec.id), type: rec.type ?? '', pre: rec.pre ?? '',
        steps: list(rec.steps ?? ''), expected: list(rec.expected ?? ''), data: rec.data ?? '', refs: rec.refs ?? '', auto: rec.auto ?? '',
      };
      if (!c.steps.length) warnings.push(`${c.id}: no steps`);
      if (!c.expected.length) warnings.push(`${c.id}: no expected result`);
      cases.push(c);
    }
  }
  return cases;
}

const cases = positionals.flatMap(mdFiles).flatMap(parseFile);
const seen = new Set();
for (const c of cases) { if (seen.has(c.id)) problems.push(`duplicate ID ${c.id}`); seen.add(c.id); }
if (!cases.length) problems.push('no test case tables found (need a table with ID and Title columns)');
if (problems.length) die(problems.join('\n'));

const TESTRAIL_PRIORITY = { P0: 'Critical', P1: 'High', P2: 'Medium', P3: 'Low' };
function testrailType(t) {
  const s = t.toLowerCase();
  const map = [['security', 'Security'], ['accessib', 'Accessibility'], ['compat', 'Compatibility'], ['perform', 'Performance'],
    ['usab', 'Usability'], ['smoke', 'Smoke & Sanity'], ['regress', 'Regression']];
  return map.find(([needle]) => s.includes(needle))?.[1] ?? 'Functional';
}

let header;
let rows;
if (format === 'generic') {
  header = ['ID', 'Title', 'Section', 'Priority', 'Type', 'Preconditions', 'Steps', 'Expected Result', 'Test Data', 'Requirements', 'Automate'];
  rows = cases.map((c) => [c.id, c.title, c.section, c.priority, c.type, c.pre, c.steps.join('\n'), c.expected.join('\n'), c.data, c.refs, c.auto]);
} else if (format === 'testrail') {
  header = ['Title', 'Section', 'Type', 'Priority', 'Preconditions', 'Steps', 'Expected Result', 'References'];
  rows = cases.map((c) => [`${c.id}: ${c.title}`, c.section, testrailType(c.type), TESTRAIL_PRIORITY[c.priority] ?? c.priority, c.pre,
    c.steps.join('\n'), c.expected.join('\n'), c.refs]);
} else {
  // One row per step. Case-level fields sit on the first row unless --fill; the ID is on every row.
  header = ['Test ID', 'Summary', 'Folder', 'Priority', 'Type', 'Preconditions', 'Step No', 'Action', 'Test Data', 'Expected Result', 'Requirements', 'Automate'];
  rows = cases.flatMap((c) => {
    const steps = c.steps.length ? c.steps.map(stripNo) : [''];
    const exp = c.expected.map(stripNo);
    const perStep = exp.length === steps.length;
    return steps.map((action, i) => {
      const first = i === 0 || values.fill;
      return [c.id, first ? c.title : '', first ? c.section : '', first ? c.priority : '', first ? c.type : '', first ? c.pre : '',
        i + 1, action, i === 0 ? c.data : '', perStep ? exp[i] : i === steps.length - 1 ? exp.join('\n') : '', first ? c.refs : '', first ? c.auto : ''];
    });
  });
}

const esc = (v) => { const s = String(v ?? ''); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csv = (values.bom ? '﻿' : '') + [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';

if (values.out) {
  fs.mkdirSync(path.dirname(path.resolve(values.out)), { recursive: true });
  fs.writeFileSync(values.out, csv);
} else {
  process.stdout.write(csv);
}
const note = warnings.length ? `, ${warnings.length} warning(s):\n  - ${warnings.slice(0, 8).join('\n  - ')}` : '';
console.error(`[export] ${cases.length} case(s), ${rows.length} row(s), format ${format}${values.out ? ` -> ${values.out}` : ''}${note}`);
