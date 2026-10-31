import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const tool = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'testcases-export.mjs');
const HEAD = '| ID | Title | Pri | Type | Pre | Steps | Expected | Data | Refs | Auto |\n|---|---|---|---|---|---|---|---|---|---|';

const login = [
  '# Login test cases',
  'Sources: story',
  '## Coverage',
  '| Req | Cases | Gap |',
  '|---|---|---|',
  '| R1 | TC-LOGIN-001 | none |',
  '## Cases',
  HEAD,
  '| TC-LOGIN-001 | Sign in with valid credentials | P0 | Functional, Smoke | Active user | 1. Open /login<br>2. Enter email and password<br>3. Click Sign in | Redirected to /dashboard | alice@example.com | R1 | yes |',
  '| TC-LOGIN-002 | Reject a pipe \\| in the name, with "quotes" | p1 | Negative, Security | None | 1. Open /register<br>2. Submit a name with a pipe | 1. Error shown<br>2. No account created | a\\|b | R2 | no |',
  '### Password rules',
  HEAD,
  '| TC-LOGIN-003 | Reject a 7-character password | high | Negative, Boundary | None | 1. Open /register<br>2. Enter 7 characters | Inline error | `Abcdef1` | R3 | yes |',
  '',
  '```',
  '| ID | Title | Pri | Type | Pre | Steps | Expected |',
  '|---|---|---|---|---|---|---|',
  '| TC-FAKE-001 | Inside a code fence | P0 | x | x | 1. x | x |',
  '```',
].join('\n');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i += 1; } else if (c === '"') quoted = false; else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cur); cur = ''; } else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; } else if (c !== '\r') cur += c;
  }
  return rows;
}

function sandbox(files = { 'login.md': login }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-export-'));
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
  const run = (...args) => spawnSync(process.execPath, [tool, ...args], { cwd: dir, encoding: 'utf8' });
  return { dir, run, file: (n = 'login.md') => path.join(dir, n) };
}

test('generic CSV: one row per case, sections from headings, quoting survives, fenced and coverage tables ignored', () => {
  const sb = sandbox();
  const r = sb.run(sb.file());
  assert.equal(r.status, 0, r.stderr);
  const rows = parseCsv(r.stdout);
  assert.equal(rows.length, 4); // header + 3 cases
  assert.deepEqual(rows[0].slice(0, 4), ['ID', 'Title', 'Section', 'Priority']);
  assert.equal(rows[1][2], 'Login');
  assert.equal(rows[3][2], 'Login / Password rules');
  assert.equal(rows[1][6], '1. Open /login\n2. Enter email and password\n3. Click Sign in');
  assert.equal(rows[2][1], 'Reject a pipe | in the name, with "quotes"');
  assert.equal(rows[2][3], 'P1');
  assert.equal(rows[3][3], 'P1'); // "high" normalized
  assert.ok(!r.stdout.includes('TC-FAKE-001'));
  assert.match(r.stderr, /3 case\(s\), 3 row\(s\), format generic/);
});

test('testrail format maps priority and type names and prefixes the title with the ID', () => {
  const sb = sandbox();
  const rows = parseCsv(sb.run(sb.file(), '--format', 'testrail').stdout);
  assert.deepEqual(rows[0], ['Title', 'Section', 'Type', 'Priority', 'Preconditions', 'Steps', 'Expected Result', 'References']);
  assert.equal(rows[1][0], 'TC-LOGIN-001: Sign in with valid credentials');
  assert.deepEqual([rows[1][2], rows[1][3]], ['Smoke & Sanity', 'Critical']);
  assert.deepEqual([rows[2][2], rows[2][3]], ['Security', 'High']);
  assert.deepEqual([rows[3][2], rows[3][3]], ['Functional', 'High']);
});

test('steps format: one row per step, case fields on the first row, expected on the last step unless counts match', () => {
  const sb = sandbox();
  const rows = parseCsv(sb.run(sb.file(), '--format', 'steps').stdout);
  assert.equal(rows.length, 1 + 3 + 2 + 2);
  const [h, s1, s2, s3, t1, t2] = rows;
  assert.equal(h[6], 'Step No');
  assert.deepEqual([s1[0], s1[1], s1[6], s1[7]], ['TC-LOGIN-001', 'Sign in with valid credentials', '1', 'Open /login']);
  assert.deepEqual([s2[0], s2[1], s2[9]], ['TC-LOGIN-001', '', '']);
  assert.equal(s3[9], 'Redirected to /dashboard'); // single expected goes on the last step
  assert.deepEqual([t1[9], t2[9]], ['Error shown', 'No account created']); // counts match: per-step
  const filled = parseCsv(sb.run(sb.file(), '--format', 'steps', '--fill').stdout);
  assert.equal(filled[2][1], 'Sign in with valid credentials');
});

test('--out writes the file (with a BOM on request) and prints only a summary; directories are scanned', () => {
  const sb = sandbox({
    'login.md': login,
    'cart.md': ['# Cart test cases', HEAD, '| TC-CART-001 | Add an item | P2 | Functional | None | 1. Add | Item in cart | | R9 | no |'].join('\n'),
  });
  const out = path.join(sb.dir, 'export', 'all.csv');
  const r = sb.run(sb.dir, '--out', out, '--bom');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /4 case\(s\)/);
  assert.equal(fs.readFileSync(out, 'utf8').charCodeAt(0), 0xfeff);
  assert.ok(fs.readFileSync(out, 'utf8').includes('TC-CART-001'));
});

test('duplicate IDs, a table without Steps, and no tables at all are errors', () => {
  const dup = sandbox({ 'a.md': `${login}\n`, 'b.md': ['# B', HEAD, '| TC-LOGIN-001 | Dup | P1 | Functional | | 1. x | y | | | |'].join('\n') });
  const d = dup.run(dup.dir);
  assert.equal(d.status, 1);
  assert.match(d.stderr, /duplicate ID TC-LOGIN-001/);

  const nosteps = sandbox({ 'x.md': ['# X', '| ID | Title | Pri |', '|---|---|---|', '| TC-X-1 | T | P1 |'].join('\n') });
  assert.match(nosteps.run(nosteps.file('x.md')).stderr, /no Steps or no Expected/);

  const none = sandbox({ 'n.md': '# Nothing here\n\njust text\n' });
  assert.match(none.run(none.file('n.md')).stderr, /no test case tables found/);
});

test('warns about empty steps, unknown priorities and rows without an ID but still exports', () => {
  const sb = sandbox({
    'w.md': ['# W', HEAD, '| TC-W-001 | No steps | urgent | Functional | | | Something | | | |', '| | Row without id | P1 | x | | 1. a | b | | | |'].join('\n'),
  });
  const r = sb.run(sb.file('w.md'));
  assert.equal(r.status, 0);
  assert.match(r.stderr, /TC-W-001: no steps/);
  assert.match(r.stderr, /unknown priority "urgent"/);
  assert.match(r.stderr, /skipped a row with no ID/);
});
