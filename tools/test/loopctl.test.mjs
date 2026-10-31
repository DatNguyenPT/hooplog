import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const tools = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(tools, '..');

function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-loop-'));
  const env = { ...process.env, HARNESS_ROOT: root };
  const run = (script, args, input) =>
    spawnSync(process.execPath, [script, ...args], { env, cwd: root, encoding: 'utf8', input });
  const script = (name, body) => fs.writeFileSync(path.join(root, name), body);
  script('pass.mjs', 'process.exit(0);');
  script('fail.mjs', "console.error('AssertionError: boom 42'); process.exit(1);");
  // Different message each run, so no two failures share a signature.
  script('vary.mjs', "import fs from 'node:fs'; const n = (fs.existsSync('n.txt') ? +fs.readFileSync('n.txt', 'utf8') : 0) + 1; fs.writeFileSync('n.txt', String(n)); console.error('Error: ' + 'x'.repeat(n)); process.exit(1);");
  script('flag.mjs', "import fs from 'node:fs'; if (!fs.existsSync('ok.flag')) { console.error('Error: flag missing'); process.exit(1); }");
  return {
    root,
    ctl: (...args) => run(path.join(tools, 'loopctl.mjs'), args),
    guard: (event, extra = {}) =>
      run(path.join(repo, '.claude', 'hooks', 'loop-guard.mjs'), [], JSON.stringify({ hook_event_name: event, ...extra })),
    session: () => run(path.join(repo, '.claude', 'hooks', 'session-context.mjs'), [], '{}'),
    statePath: path.join(root, '.harness', 'state', 'loop.json'),
    state() { return JSON.parse(fs.readFileSync(this.statePath, 'utf8')); },
  };
}

const init = (sb, script, ...more) => sb.ctl('init', '--goal', 'make it green', '--check', `node ${script}`, '--cwd', sb.root, ...more);

test('check passes and closes the loop', () => {
  const sb = sandbox();
  assert.equal(init(sb, 'pass.mjs').status, 0);
  const r = sb.ctl('check');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /PASS/);
  assert.equal(sb.state().status, 'passed');
});

test('failing check prints the tail and keeps the loop running', () => {
  const sb = sandbox();
  init(sb, 'fail.mjs', '--max', '5');
  const r = sb.ctl('check');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /AssertionError: boom/);
  assert.match(r.stdout, /status=running/);
  assert.equal(sb.state().iter, 1);
});

test('the same failure three times is stuck, with a warning on the second', () => {
  const sb = sandbox();
  init(sb, 'fail.mjs');
  sb.ctl('check');
  assert.match(sb.ctl('check').stdout, /change hypothesis/);
  const third = sb.ctl('check');
  assert.equal(third.status, 2);
  assert.equal(sb.state().status, 'stuck');
});

test('budget exhaustion ends a loop whose failures keep changing', () => {
  const sb = sandbox();
  init(sb, 'vary.mjs', '--max', '2', '--stuck', '5');
  assert.equal(sb.ctl('check').status, 1);
  assert.equal(sb.ctl('check').status, 2);
  assert.equal(sb.state().status, 'exhausted');
});

test('init refuses while a loop is running unless --force', () => {
  const sb = sandbox();
  init(sb, 'fail.mjs');
  assert.notEqual(init(sb, 'pass.mjs').status, 0);
  assert.equal(init(sb, 'pass.mjs', '--force').status, 0);
});

test('stop hook blocks on red, is bounded by the budget, then lets go', () => {
  const sb = sandbox();
  init(sb, 'fail.mjs', '--max', '3', '--stuck', '9');
  const first = sb.guard('Stop');
  assert.equal(JSON.parse(first.stdout).decision, 'block');
  assert.match(JSON.parse(first.stdout).reason, /Loop not done/);
  assert.equal(JSON.parse(sb.guard('Stop').stdout).decision, 'block');
  const third = JSON.parse(sb.guard('Stop').stdout); // budget spent: one final-report block
  assert.equal(third.decision, 'block');
  assert.match(third.reason, /Loop exhausted/);
  assert.equal(sb.guard('Stop').stdout.trim(), ''); // released
  assert.equal(sb.state().status, 'exhausted');
});

test('stop hook releases once the check goes green', () => {
  const sb = sandbox();
  init(sb, 'flag.mjs');
  assert.equal(JSON.parse(sb.guard('Stop').stdout).decision, 'block');
  fs.writeFileSync(path.join(sb.root, 'ok.flag'), '');
  const out = JSON.parse(sb.guard('Stop').stdout);
  assert.equal(out.decision, undefined);
  assert.match(out.systemMessage, /PASS/);
  assert.equal(sb.state().status, 'passed');
});

test('a check the model already saw exhaust does not trigger a second report block', () => {
  const sb = sandbox();
  init(sb, 'fail.mjs', '--max', '1');
  assert.equal(sb.ctl('check').status, 2);
  assert.equal(sb.guard('Stop').stdout.trim(), '');
});

test('only the loop owner is gated', () => {
  const sb = sandbox();
  init(sb, 'fail.mjs', '--owner', 'sdet');
  assert.equal(sb.guard('Stop').stdout.trim(), '');
  assert.equal(sb.guard('SubagentStop', { agent_type: 'tech-lead' }).stdout.trim(), '');
  assert.equal(sb.state().iter, 0);
  assert.equal(JSON.parse(sb.guard('SubagentStop', { agent_type: 'sdet' }).stdout).decision, 'block');
});

test('an abandoned loop is released instead of gating unrelated work', () => {
  const sb = sandbox();
  init(sb, 'fail.mjs');
  const s = sb.state();
  s.updatedAt = new Date(Date.now() - 3 * 3_600_000).toISOString();
  fs.writeFileSync(sb.statePath, JSON.stringify(s));
  assert.equal(sb.guard('Stop').stdout.trim(), '');
  assert.equal(sb.state().status, 'stopped');
});

test('session hook is silent when empty and injects summary plus live loop otherwise', () => {
  const sb = sandbox();
  assert.equal(sb.session().stdout.trim(), '');
  fs.mkdirSync(path.join(sb.root, '.harness', 'state'), { recursive: true });
  fs.writeFileSync(path.join(sb.root, '.harness', 'state', 'summary.md'), 'Goal: ship login\nNext: write e2e');
  init(sb, 'fail.mjs');
  const ctx = JSON.parse(sb.session().stdout).hookSpecificOutput;
  assert.equal(ctx.hookEventName, 'SessionStart');
  assert.match(ctx.additionalContext, /Rolling summary/);
  assert.match(ctx.additionalContext, /Active loop 0\/6/);
});

test('a corrupt state file is quarantined with a warning instead of silently opening the gate', () => {
  const sb = sandbox();
  init(sb, 'fail.mjs');
  fs.writeFileSync(sb.statePath, '{"goal": "half writ');
  assert.match(sb.ctl('status').stdout, /unreadable/);
  assert.match(JSON.parse(sb.guard('Stop').stdout).systemMessage, /unreadable/);
  assert.equal(fs.existsSync(sb.statePath), false);
  assert.equal(fs.existsSync(`${sb.statePath}.corrupt`), true);
  assert.equal(sb.guard('Stop').stdout.trim(), ''); // released: nothing left to gate
});

test('a stop that lands while the check runs is not undone by the hook or by loopctl check', () => {
  const sb = sandbox();
  const ctl = path.join(tools, 'loopctl.mjs');
  // The check itself stops the loop while it is running.
  fs.writeFileSync(path.join(sb.root, 'stopper.mjs'),
    "import { spawnSync } from 'node:child_process';\n" +
    `spawnSync(process.execPath, [${JSON.stringify(ctl)}, 'stop', '--reason', 'mid-check'], { stdio: 'inherit' });\n` +
    'process.exit(1);\n');

  init(sb, 'stopper.mjs');
  assert.equal(sb.guard('Stop').stdout.trim(), ''); // result discarded, no block
  const s = sb.state();
  assert.equal(s.status, 'stopped');
  assert.equal(s.stopReason, 'mid-check');
  assert.equal(s.iter, 0);

  init(sb, 'stopper.mjs');
  const r = sb.ctl('check');
  assert.equal(r.status, 3);
  assert.match(r.stderr, /discarded/);
  assert.equal(sb.state().status, 'stopped');
});

test('state writes leave no temp files behind', () => {
  const sb = sandbox();
  init(sb, 'fail.mjs');
  sb.ctl('check');
  sb.guard('Stop');
  assert.deepEqual(fs.readdirSync(path.dirname(sb.statePath)), ['loop.json']);
});
