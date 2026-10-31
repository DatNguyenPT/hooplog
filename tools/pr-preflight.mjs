#!/usr/bin/env node
// Read-only facts for opening a PR, in one call instead of six git commands.
// Prints JSON. A non-empty "problems" list means stop. See .claude/skills/create-pr/SKILL.md
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { git, gh, pickRemote, detectBase, baseRef } from './lib/vcs.mjs';

const { values } = parseArgs({ options: { base: { type: 'string' }, cwd: { type: 'string' } } });
const cwd = values.cwd ? path.resolve(values.cwd) : process.cwd();
const lines = (s) => (s ? s.split(/\r?\n/).filter(Boolean) : []);
const out = { problems: [], warnings: [] };
const done = () => { console.log(JSON.stringify(out, null, 2)); process.exit(0); };

if (git(cwd, ['rev-parse', '--is-inside-work-tree']) !== 'true') {
  out.problems.push('not a git repository');
  done();
}

out.root = git(cwd, ['rev-parse', '--show-toplevel']);
out.branch = git(cwd, ['branch', '--show-current']) || null; // null when HEAD is detached
out.remote = pickRemote(cwd);
out.remoteUrl = out.remote ? git(cwd, ['remote', 'get-url', out.remote]) : null;
out.base = detectBase(cwd, out.remote, values.base);
out.needsBranch = !out.branch || out.branch === out.base;
if (!out.remote) out.problems.push('no git remote configured');
if (!out.base) out.problems.push('cannot determine the base branch: pass --base');

// Changed files, with status codes. -z keeps paths unquoted; raw output keeps the leading space of " M".
const status = (git(cwd, ['status', '--porcelain', '-z'], { trim: false }) || '').split('\0').filter(Boolean);
out.dirtyCount = status.length;
out.dirty = status.slice(0, 40);
const RISKY = /(^|\/)(\.env($|\.)|id_rsa|id_ed25519|node_modules\/|dist\/|coverage\/|\.harness\/)|\.(pem|key|p12|pfx|keystore|log)$/;
out.doNotStage = status.map((e) => e.slice(3)).filter((f) => RISKY.test(f));

if (out.base) {
  const ref = baseRef(cwd, out.remote, out.base);
  const [behind, ahead] = (git(cwd, ['rev-list', '--left-right', '--count', `${ref}...HEAD`]) || '0\t0').split(/\s+/).map(Number);
  out.baseRef = ref;
  out.ahead = ahead;
  out.behind = behind;
  out.commits = lines(git(cwd, ['log', '--format=%h %s', `${ref}..HEAD`])).slice(0, 20);
  out.diffstat = git(cwd, ['diff', '--shortstat', `${ref}...HEAD`]) || '';
  out.files = lines(git(cwd, ['diff', '--name-status', `${ref}...HEAD`])).slice(0, 60);
  if (behind > 0) out.warnings.push(`branch is ${behind} commit(s) behind ${ref}: consider rebasing or merging first`);
  if (!ahead && !out.dirtyCount) out.problems.push('nothing to put in a PR: no commits ahead of base and no changes');
}

// Style hints so commit messages, branch names and the PR body match the repo.
out.lastSubjects = lines(git(cwd, ['log', '-8', '--format=%s']));
out.lastBranches = out.remote
  ? lines(git(cwd, ['for-each-ref', '--sort=-committerdate', '--count=8', '--format=%(refname:short)', `refs/remotes/${out.remote}`]))
      .filter((b) => !b.endsWith('/HEAD'))
  : [];
const templates = ['.github/pull_request_template.md', '.github/PULL_REQUEST_TEMPLATE.md', 'docs/pull_request_template.md', 'pull_request_template.md'];
out.template = out.root ? templates.find((t) => fs.existsSync(path.join(out.root, t))) || null : null;

const installed = gh(['--version'], cwd).ok;
out.gh = { installed, authed: installed && gh(['auth', 'status'], cwd).ok };
if (!installed) out.warnings.push('gh is not installed: pr-create will push and print a compare URL instead');
else if (!out.gh.authed) out.warnings.push('gh is not authenticated: run `gh auth login`');

done();
