#!/usr/bin/env node
// SessionStart (startup|clear|compact): re-inject the rolling summary and any live loop,
// so /clear is cheap and nothing important rides on the transcript. Silent when there is nothing to say.
import fs from 'node:fs';
import { SUMMARY_FILE, readState, isStale } from '../../tools/lib/loop.mjs';

const MAX_CHARS = 2000;
const parts = [];

try {
  const summary = fs.readFileSync(SUMMARY_FILE, 'utf8').trim();
  if (summary) {
    const cut = summary.length > MAX_CHARS ? summary.slice(0, MAX_CHARS) + '\n[truncated - keep summary.md under 40 lines]' : summary;
    parts.push(`[harness] Rolling summary (.harness/state/summary.md):\n${cut}`);
  }
} catch { /* no summary yet */ }

const loop = readState();
if (loop && loop.status === 'running' && !isStale(loop)) {
  parts.push(`[harness] Active loop ${loop.iter}/${loop.max} owner=${loop.owner}: ${loop.goal} | check: ${loop.check}`);
}

if (parts.length) {
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: parts.join('\n') } }));
}
