#!/usr/bin/env node
// Push the current branch and open ONE pull request. Guardrails live in code, not in the prompt:
// never the base branch, never a dirty tree, never a force push. See .claude/skills/create-pr/SKILL.md
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { git, gh, pickRemote, detectBase, baseRef, compareUrl } from './lib/vcs.mjs';

const USAGE = 'usage: node tools/pr-create.mjs --title "<text>" --body-file <path> [--base <branch>] [--draft] [--reviewer <user>]... [--label <name>]... [--dry-run]';
const die = (msg, code = 1) => { console.error(`[pr-create] ${msg}`); process.exit(code); };

let values;
try {
  ({ values } = parseArgs({
    options: {
      title: { type: 'string' }, 'body-file': { type: 'string' }, base: { type: 'string' }, draft: { type: 'boolean' },
      reviewer: { type: 'string', multiple: true }, label: { type: 'string', multiple: true }, 'dry-run': { type: 'boolean' },
    },
  }));
} catch (e) {
  die(`${e.message}\n${USAGE}`, 64);
}

const cwd = process.cwd();
const title = (values.title || '').trim();
if (!title || title.length > 100) die(`--title is required and must be at most 100 characters\n${USAGE}`, 64);
const bodyFile = values['body-file'] ? path.resolve(values['body-file']) : null;
if (!bodyFile || !fs.existsSync(bodyFile) || !fs.readFileSync(bodyFile, 'utf8').trim()) die('--body-file must point to a non-empty file', 64);

const branch = git(cwd, ['branch', '--show-current']);
if (!branch) die('detached HEAD or not a git repository: switch to a feature branch first');
const remote = pickRemote(cwd);
if (!remote) die('no git remote configured');
const base = detectBase(cwd, remote, values.base);
if (!base) die('cannot determine the base branch: pass --base');
if (branch === base) die(`refusing to open a PR from the base branch "${base}": create a feature branch first`);
if (git(cwd, ['status', '--porcelain'])) die('uncommitted changes: commit or stash them so the PR matches what is pushed');
const ahead = Number(git(cwd, ['rev-list', '--count', `${baseRef(cwd, remote, base)}..HEAD`]) || 0);
if (!ahead) die(`no commits ahead of ${base}: nothing to open a PR for`);

const ghArgs = [
  'pr', 'create', '--base', base, '--head', branch, '--title', title, '--body-file', bodyFile,
  ...(values.draft ? ['--draft'] : []),
  ...(values.reviewer || []).flatMap((r) => ['--reviewer', r]),
  ...(values.label || []).flatMap((l) => ['--label', l]),
];

if (values['dry-run']) {
  console.log(JSON.stringify({ branch, base, remote, ahead, push: ['git', 'push', '-u', remote, branch], gh: ['gh', ...ghArgs] }, null, 2));
  process.exit(0);
}

const push = spawnSync('git', ['push', '-u', remote, branch], { cwd, stdio: 'inherit' });
if (push.status !== 0) die('git push failed (it is never forced): fix the cause and re-run');

// One PR per branch: reuse an open one instead of failing or duplicating.
const existing = gh(['pr', 'list', '--head', branch, '--state', 'open', '--json', 'url', '--jq', '.[0].url'], cwd);
if (existing.missing) {
  const url = compareUrl(git(cwd, ['remote', 'get-url', remote]), base, branch);
  console.log(`gh is not installed. Branch "${branch}" is pushed. Open the PR here and paste ${bodyFile}:\n${url ?? '(remote is not GitHub: open a PR in its web UI)'}`);
  process.exit(3);
}
if (existing.ok && existing.stdout) {
  console.log(`PR already open for ${branch}: ${existing.stdout}`);
  process.exit(0);
}

const created = gh(ghArgs, cwd);
if (!created.ok) die(`gh pr create failed: ${created.stderr || created.stdout}`);
console.log(created.stdout); // the PR URL
