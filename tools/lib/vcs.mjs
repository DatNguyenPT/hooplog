// Small git/gh wrappers shared by tools/pr-preflight.mjs and tools/pr-create.mjs.
import { spawnSync } from 'node:child_process';

// stdout of a git command, or null when it exits non-zero.
export function git(cwd, args, { trim = true } = {}) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) return null;
  return trim ? r.stdout.trim() : r.stdout;
}

// HARNESS_GH may point at a .mjs script (used by the tests) or a gh binary.
export function gh(args, cwd) {
  const bin = process.env.HARNESS_GH || 'gh';
  const script = /\.m?js$/.test(bin);
  const r = spawnSync(script ? process.execPath : bin, script ? [bin, ...args] : args, {
    cwd, encoding: 'utf8', windowsHide: true,
  });
  return {
    ok: r.status === 0,
    missing: r.error?.code === 'ENOENT',
    stdout: (r.stdout || '').trim(),
    stderr: (r.stderr || '').trim(),
  };
}

export function pickRemote(cwd) {
  const remotes = (git(cwd, ['remote']) || '').split(/\s+/).filter(Boolean);
  return remotes.includes('origin') ? 'origin' : remotes[0] || null;
}

export function detectBase(cwd, remote, override) {
  if (override) return override;
  const head = remote && git(cwd, ['symbolic-ref', '--short', `refs/remotes/${remote}/HEAD`]);
  if (head) return head.slice(remote.length + 1);
  const has = (ref) => git(cwd, ['rev-parse', '--verify', '--quiet', ref]) !== null;
  return ['main', 'master', 'develop'].find((b) => has(b) || (remote && has(`${remote}/${b}`))) || null;
}

// Prefer the remote-tracking ref so "ahead" matches what the PR will show.
export function baseRef(cwd, remote, base) {
  const tracked = remote && git(cwd, ['rev-parse', '--verify', '--quiet', `${remote}/${base}`]) !== null;
  return tracked ? `${remote}/${base}` : base;
}

export function compareUrl(remoteUrl, base, branch) {
  const m = /github\.com[:/]+([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(remoteUrl || '');
  return m ? `https://github.com/${m[1]}/${m[2]}/compare/${encodeURI(base)}...${encodeURI(branch)}?expand=1` : null;
}
