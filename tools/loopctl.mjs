#!/usr/bin/env node
// Loop control CLI: fixed goal + check + budget + stuck rule, enforced in code.
// Contract and patterns: .claude/skills/agent-loop/SKILL.md
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import {
  STATE_FILE, NEXT, loadState, readState, writeState, newState, runCheck, recordResult, isStale, head, tail, statusLine,
} from './lib/loop.mjs';

const USAGE = `usage:
  loopctl init --goal "<text>" --check "<command>" [--max 6] [--stuck 3] [--owner main|sdet|swe] [--timeout 300] [--cwd dir] [--shell bash] [--force]
  loopctl check     run the check, update state, print verdict (exit 0 pass, 1 fail, 2 exhausted/stuck)
  loopctl status    one-line state
  loopctl stop --reason "<why>"
  loopctl reset     delete state`;

const die = (msg, code = 3) => { console.error(msg); process.exit(code); };
const CORRUPT = 'loop state is unreadable: run "node tools/loopctl.mjs reset", then start a new loop';
const clamp = (v, lo, hi, d) => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

const [cmd, ...rest] = process.argv.slice(2);
let values;
try {
  ({ values } = parseArgs({
    args: rest,
    options: {
      goal: { type: 'string' }, check: { type: 'string' }, max: { type: 'string' }, stuck: { type: 'string' },
      owner: { type: 'string' }, timeout: { type: 'string' }, cwd: { type: 'string' }, shell: { type: 'string' },
      reason: { type: 'string' }, force: { type: 'boolean' },
    },
  }));
} catch (e) {
  die(`${e.message}\n${USAGE}`, 64);
}

switch (cmd) {
  case 'init': {
    if (!values.goal || !values.check) die(`init needs --goal and --check\n${USAGE}`, 64);
    const cur = readState();
    if (cur?.status === 'running' && !isStale(cur) && !values.force) {
      die(`a loop is already running: ${statusLine(cur)}\nfinish it, run "loopctl stop", or pass --force`);
    }
    const state = newState({
      goal: values.goal,
      check: values.check,
      max: clamp(values.max, 1, 50, 6),
      stuck: clamp(values.stuck, 2, 10, 3),
      owner: values.owner || 'main',
      timeout: clamp(values.timeout, 5, 840, 300),
      cwd: values.cwd ? path.resolve(values.cwd) : undefined,
      shell: values.shell,
    });
    writeState(state);
    console.log(`loop started: max=${state.max} stuck=${state.stuck} owner=${state.owner} timeout=${state.timeout}s cwd=${state.cwd}\ncheck: ${state.check}\nNEXT: run "node tools/loopctl.mjs check" to reproduce (expect FAIL)`);
    break;
  }
  case 'check': {
    const { state: cur, corrupt } = loadState();
    if (corrupt) die(CORRUPT);
    if (!cur) die('no loop: run "loopctl init" first');
    if (cur.status !== 'running') die(`loop is ${cur.status}: ${NEXT[cur.status] ?? ''}. Run "loopctl init --force" for a new one.`);
    const result = runCheck(cur);
    const state = recordResult(cur.startedAt, result); // re-reads the state: a stop during the check is not undone
    if (!state) die('the loop was stopped, reset or replaced while the check ran: result discarded');
    const lines = [head(state, result.ok)];
    if (!result.ok) {
      lines.push('--- output tail ---', tail(result.output));
      if (state.status === 'running' && state.sameSig === state.stuck - 1) {
        lines.push('WARN: same failure twice - change hypothesis before the next attempt.');
      }
    }
    lines.push(`NEXT: ${NEXT[state.status]}`);
    console.log(lines.join('\n'));
    process.exitCode = result.ok ? 0 : state.status === 'running' ? 1 : 2; // not process.exit(): let stdout flush
    break;
  }
  case 'status': {
    const { state, corrupt } = loadState();
    console.log(corrupt ? CORRUPT : state ? statusLine(state) : 'no loop');
    break;
  }
  case 'stop': {
    const { state, corrupt } = loadState();
    if (corrupt) die(CORRUPT);
    if (!state) die('no loop');
    state.status = 'stopped';
    state.stopReason = values.reason || 'manual';
    writeState(state);
    console.log(`loop stopped: ${state.stopReason}`);
    break;
  }
  case 'reset': {
    fs.rmSync(STATE_FILE, { force: true });
    console.log('loop state cleared');
    break;
  }
  default:
    die(USAGE, 64);
}
