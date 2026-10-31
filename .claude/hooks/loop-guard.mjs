#!/usr/bin/env node
// Stop / SubagentStop gate. While a loop is running, its owner cannot finish until the loop's
// check is green: the hook runs the check itself and feeds a capped failure tail back.
// Bounded by the loop budget (each stop attempt costs one iteration), so it cannot spin.
import fs from 'node:fs';
import path from 'node:path';
import {
  NEXT, loadState, writeState, quarantineState, runCheck, recordResult, isStale, head, tail,
} from '../../tools/lib/loop.mjs';

let input = {};
try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { /* no stdin payload */ }

const block = (reason) => console.log(JSON.stringify({ decision: 'block', reason }));
const note = (systemMessage) => console.log(JSON.stringify({ systemMessage }));

const { state, corrupt } = loadState();
if (corrupt) {
  // Fail open, but loudly: an unreadable state cannot count a budget, so blocking could never end.
  const parked = quarantineState();
  note(`Loop state was unreadable, so the loop was released (kept as ${path.basename(parked)}). Start a new one with "node tools/loopctl.mjs init".`);
  process.exit(0);
}
if (!state) process.exit(0);

const sub = input.hook_event_name === 'SubagentStop';
if (sub ? input.agent_type !== state.owner : state.owner !== 'main') process.exit(0);

if (state.status === 'running' && isStale(state)) {
  state.status = 'stopped';
  state.stopReason = 'stale (no check for over an hour)';
  writeState(state);
  process.exit(0);
}

const reportBlock = (s) => block(
  `Loop ${s.status}: ${head(s, false)}. Goal: ${s.goal}\n` +
    'Do not attempt more fixes. Reply now with the Result Card: STATUS blocked, the failing signature, ' +
    'hypotheses tried, and the recommended next step (escalate to tech-lead).',
);

if (state.status === 'running') {
  const result = runCheck(state);
  const next = recordResult(state.startedAt, result);
  if (!next) process.exit(0); // stopped, reset or replaced while the check ran: leave that decision alone
  if (next.status === 'passed') {
    note(`${head(next, true)} - ${NEXT.passed}`);
  } else if (next.status === 'running') {
    block(
      `Loop not done: ${head(next, false)}. Goal: ${next.goal}\n${tail(result.output)}\n` +
        'Fix the cause; never edit the check or weaken tests. The check re-runs automatically when you stop. ' +
        'If you need the user, run `node tools/loopctl.mjs stop --reason "<why>"` and then stop.',
    );
  } else {
    reportBlock(next); // exhausted or stuck: one final report, already marked as reported
  }
} else if ((state.status === 'exhausted' || state.status === 'stuck') && !state.reported) {
  state.reported = true;
  writeState(state);
  reportBlock(state);
}
