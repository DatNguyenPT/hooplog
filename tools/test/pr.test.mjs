import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareUrl } from '../lib/vcs.mjs';

const tools = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NO_GH = path.join(os.tmpdir(), 'definitely-not-gh');

const git = (cwd, ...args) => {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};

// A work repo with an origin (bare) and a fake gh that logs its arguments.
function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-pr-'));
  const work = path.join(dir, 'work');
  const bare = path.join(dir, 'origin.git');
  fs.mkdirSync(work);
  git(work, 'init', '-b', 'main');
  fs.writeFileSync(path.join(work, 'a.txt'), 'a\n');
  git(work, 'add', '.');
  git(work, 'commit', '-m', 'init');
  git(dir, 'init', '--bare', '-b', 'main', bare);
  git(work, 'remote', 'add', 'origin', bare);
  git(work, 'push', '-u', 'origin', 'main');

  const log = path.join(dir, 'gh.log');
  const fake = path.join(dir, 'gh.mjs');
  fs.writeFileSync(fake, [
    "import fs from 'node:fs';",
    'const a = process.argv.slice(2);',
    `fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(a) + '\\n');`,
    "if (a[0] === 'pr' && a[1] === 'list') process.stdout.write(process.env.FAKE_EXISTING_PR || '');",
    "if (a[0] === 'pr' && a[1] === 'create') console.log('https://github.com/o/r/pull/7');",
  ].join('\n'));

  const body = path.join(dir, 'body.md');
  fs.writeFileSync(body, '## Summary\n- test\n');
  const run = (script, args, env = {}) =>
    spawnSync(process.execPath, [path.join(tools, script), ...args], { cwd: work, encoding: 'utf8', env: { ...process.env, HARNESS_GH: fake, ...env } });
  const ghCalls = () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);
  const feature = (name = 'feat/x') => {
    git(work, 'switch', '-c', name);
    fs.writeFileSync(path.join(work, 'b.txt'), 'b\n');
    git(work, 'add', '.');
    git(work, 'commit', '-m', 'feat: add b');
  };
  return { dir, work, bare, body, run, ghCalls, feature };
}

test('preflight outside a git repository reports the problem', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-nogit-'));
  const r = spawnSync(process.execPath, [path.join(tools, 'pr-preflight.mjs'), '--cwd', dir], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(r.stdout).problems, ['not a git repository']);
});

test('preflight describes a feature branch and flags files that must not be staged', () => {
  const sb = sandbox();
  sb.feature();
  fs.writeFileSync(path.join(sb.work, '.env'), 'SECRET=1\n');
  fs.writeFileSync(path.join(sb.work, 'c.txt'), 'c\n');
  const out = JSON.parse(sb.run('pr-preflight.mjs', [], { HARNESS_GH: NO_GH }).stdout);
  assert.equal(out.branch, 'feat/x');
  assert.equal(out.base, 'main');
  assert.equal(out.ahead, 1);
  assert.equal(out.needsBranch, false);
  assert.deepEqual(out.problems, []);
  assert.deepEqual(out.doNotStage, ['.env']);
  assert.equal(out.dirtyCount, 2);
  assert.equal(out.gh.installed, false);
  assert.match(out.warnings.join(' '), /gh is not installed/);
});

test('preflight says there is nothing to ship on a clean base branch', () => {
  const sb = sandbox();
  const out = JSON.parse(sb.run('pr-preflight.mjs', []).stdout);
  assert.equal(out.needsBranch, true);
  assert.match(out.problems.join(' '), /nothing to put in a PR/);
});

test('create refuses the base branch and a dirty tree', () => {
  const sb = sandbox();
  const args = ['--title', 't', '--body-file', sb.body];
  assert.match(sb.run('pr-create.mjs', args).stderr, /base branch/);
  sb.feature();
  fs.writeFileSync(path.join(sb.work, 'dirty.txt'), 'x');
  const r = sb.run('pr-create.mjs', args);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /uncommitted changes/);
  assert.equal(sb.ghCalls().length, 0);
});

test('dry run prints the plan and pushes nothing', () => {
  const sb = sandbox();
  sb.feature();
  const r = sb.run('pr-create.mjs', ['--title', 'Add b', '--body-file', sb.body, '--draft', '--dry-run']);
  const plan = JSON.parse(r.stdout);
  assert.equal(plan.branch, 'feat/x');
  assert.ok(plan.gh.includes('--draft'));
  assert.equal(git(sb.bare, 'branch', '--list', 'feat/x'), '');
});

test('create pushes the branch and calls gh with base, head, title, body file and flags', () => {
  const sb = sandbox();
  sb.feature();
  const r = sb.run('pr-create.mjs', ['--title', 'Add b', '--body-file', sb.body, '--draft', '--reviewer', 'bob', '--label', 'bug']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /pull\/7/);
  assert.match(git(sb.bare, 'branch', '--list', 'feat/x'), /feat\/x/);
  const create = sb.ghCalls().find((c) => c[1] === 'create');
  assert.deepEqual(create.slice(0, 8), ['pr', 'create', '--base', 'main', '--head', 'feat/x', '--title', 'Add b']);
  for (const flag of ['--draft', '--reviewer', 'bob', '--label', 'bug', '--body-file']) assert.ok(create.includes(flag), flag);
});

test('an open PR for the branch is reused, not duplicated', () => {
  const sb = sandbox();
  sb.feature();
  const r = sb.run('pr-create.mjs', ['--title', 't', '--body-file', sb.body], { FAKE_EXISTING_PR: 'https://github.com/o/r/pull/3' });
  assert.match(r.stdout, /already open.*pull\/3/);
  assert.equal(sb.ghCalls().filter((c) => c[1] === 'create').length, 0);
});

test('without gh the branch is still pushed and the exit code says the PR is missing', () => {
  const sb = sandbox();
  sb.feature();
  const r = sb.run('pr-create.mjs', ['--title', 't', '--body-file', sb.body], { HARNESS_GH: NO_GH });
  assert.equal(r.status, 3);
  assert.match(r.stdout, /gh is not installed/);
  assert.match(git(sb.bare, 'branch', '--list', 'feat/x'), /feat\/x/);
});

test('compare URLs are built for ssh and https GitHub remotes only', () => {
  assert.equal(compareUrl('git@github.com:o/r.git', 'main', 'feat/x'), 'https://github.com/o/r/compare/main...feat/x?expand=1');
  assert.equal(compareUrl('https://github.com/o/r', 'main', 'fix'), 'https://github.com/o/r/compare/main...fix?expand=1');
  assert.equal(compareUrl('/tmp/origin.git', 'main', 'x'), null);
});
