// Loop-control core shared by tools/loopctl.mjs and .claude/hooks/loop-guard.mjs.
// State lives in .harness/state/loop.json and is changed only through these functions.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = process.env.HARNESS_ROOT || path.resolve(here, '..', '..');
export const STATE_DIR = path.join(ROOT, '.harness', 'state');
export const STATE_FILE = path.join(STATE_DIR, 'loop.json');
export const SUMMARY_FILE = path.join(STATE_DIR, 'summary.md');

const TAIL_LINES = 40;
const TAIL_CHARS = 3000;
const STALE_MS = Number(process.env.HARNESS_LOOP_TTL_MIN || 60) * 60_000;
const ANSI = /\x1b\[[0-9;]*m/g;

export const NEXT = {
  running: 'fix the cause, then re-run the check',
  passed: 'done - write the Result Card',
  exhausted: 'budget spent - stop; Result Card STATUS: blocked, then escalate to tech-lead',
  stuck: 'same failure repeated - stop; Result Card STATUS: blocked with hypotheses tried',
  stopped: 'loop stopped manually',
};

// { state: null, corrupt: false } means "no loop"; { state: null, corrupt: true } means the file exists but is unreadable.
export function loadState() {
  let raw;
  try { raw = fs.readFileSync(STATE_FILE, 'utf8'); } catch { return { state: null, corrupt: false }; }
  try { return { state: JSON.parse(raw), corrupt: false }; } catch { return { state: null, corrupt: true }; }
}

export const readState = () => loadState().state;

// Park an unreadable state file so it cannot keep tripping the gate. Returns the parked path.
export function quarantineState() {
  const parked = `${STATE_FILE}.corrupt`;
  try { fs.renameSync(STATE_FILE, parked); } catch { fs.rmSync(STATE_FILE, { force: true }); }
  return parked;
}

// Write to a temp file, then rename over loop.json: readers see the old file or the new one, never half of one.
export function writeState(state) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  state.updatedAt = new Date().toISOString();
  const json = JSON.stringify(state, null, 2) + '\n';
  const tmp = `${STATE_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, json);
  try {
    fs.renameSync(tmp, STATE_FILE);
  } catch {
    // Windows refuses to replace a file another process holds open: fall back to an in-place write.
    fs.rmSync(tmp, { force: true });
    fs.writeFileSync(STATE_FILE, json);
  }
  return state;
}

export function newState({ goal, check, max = 6, stuck = 3, owner = 'main', timeout = 300, cwd, shell }) {
  return {
    goal, check, max, stuck, owner, timeout,
    cwd: cwd || process.cwd(), shell: shell || null,
    status: 'running', iter: 0, sameSig: 0, lastSig: null, reported: false, history: [],
    startedAt: new Date().toISOString(),
  };
}

// A running loop nobody has touched for an hour is abandoned; it must not gate unrelated sessions.
export function isStale(state) {
  return Date.now() - Date.parse(state.updatedAt || state.startedAt) > STALE_MS;
}

// Same failure => same signature: keep error-ish lines, blank out numbers/timestamps/ids,
// and include how many such lines there were so "fewer failures" counts as progress.
export function signature(output) {
  const lines = output.replace(ANSI, '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const errs = lines.filter((l) => /error|fail|assert|exception|expected|timeout|timed out/i.test(l));
  const basis = (errs.length ? errs.slice(0, 12) : lines.slice(-8))
    .map((l) => l
      .replace(/\d{4}-\d\d-\d\d[T ][\d:.]+Z?/g, '<ts>')
      .replace(/\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{8,40}\b/gi, '<id>')
      .replace(/\d+/g, '#'))
    .join('\n') + `|n=${errs.length}`;
  return createHash('sha1').update(basis).digest('hex').slice(0, 8);
}

export function tail(output) {
  const text = output.replace(ANSI, '').trimEnd().split(/\r?\n/).slice(-TAIL_LINES).join('\n');
  return text.length > TAIL_CHARS ? '...' + text.slice(-TAIL_CHARS) : text;
}

export function runCheck(state) {
  const r = spawnSync(state.check, {
    shell: state.shell || process.env.HARNESS_SHELL || true,
    cwd: state.cwd || ROOT,
    encoding: 'utf8',
    timeout: state.timeout * 1000,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
  });
  let output = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (r.error) output += `\n[${r.error.code === 'ETIMEDOUT' ? `timeout after ${state.timeout}s` : `spawn error: ${r.error.message}`}]`;
  return { ok: r.status === 0 && !r.error, output };
}

export function applyResult(state, { ok, output }) {
  state.iter += 1;
  state.lastSig = ok ? null : signature(output);
  const prev = state.history.at(-1);
  state.sameSig = ok ? 0 : prev && !prev.ok && prev.sig === state.lastSig ? state.sameSig + 1 : 1;
  state.history = [...state.history, { i: state.iter, ok, sig: state.lastSig }].slice(-5);
  if (ok) state.status = 'passed';
  else if (state.sameSig >= state.stuck) state.status = 'stuck';
  else if (state.iter >= state.max) state.status = 'exhausted';
  return state;
}

// Apply a finished check to the loop as it is on disk NOW, not to the copy read before a check that may
// have run for minutes. Returns the updated state, or null when the loop was stopped, reset or replaced
// while the check ran (the result is then discarded instead of undoing that decision).
export function recordResult(startedAt, result) {
  const fresh = readState();
  if (!fresh || fresh.status !== 'running' || fresh.startedAt !== startedAt) return null;
  applyResult(fresh, result);
  // Whoever ran this check shows the verdict, so nothing needs to force a separate report later.
  if (fresh.status === 'exhausted' || fresh.status === 'stuck') fresh.reported = true;
  return writeState(fresh);
}

export function head(state, ok) {
  const base = `[loop ${state.iter}/${state.max}] ${ok ? 'PASS' : 'FAIL'} status=${state.status}`;
  return ok ? base : `${base} sig=${state.lastSig} same=${state.sameSig}/${state.stuck}`;
}

const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '~' : s);

export function statusLine(state) {
  return `[loop ${state.iter}/${state.max}] status=${state.status} owner=${state.owner} same=${state.sameSig}/${state.stuck}` +
    ` goal="${clip(state.goal, 60)}" check="${clip(state.check, 60)}"`;
}
