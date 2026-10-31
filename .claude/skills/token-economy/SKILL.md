---
name: token-economy
description: "How this harness keeps token use low and how to apply it: context trimming, summaries over transcripts, output caps, stop sequences, response and prompt caching, model and effort routing. Use when planning a long task, before /clear or /compact, or when scripting Claude calls."
---
# Token economy

## Session habits
- One task per session. `/rename`, then `/clear` between unrelated tasks. The SessionStart hook re-injects `.harness/state/summary.md`, so nothing important rides on the transcript.
- Before `/clear`, or when context passes about 50%, rewrite `.harness/state/summary.md` (rewrite, never append; 40 lines max):
  `Goal | Acceptance (command) | Done | Decisions | Facts (how to run tests and build, entry points) | Open | Next`
- Prefer `/compact <what to keep>` over waiting for auto-compact (the window is 200k in settings). Check context and usage (`/context`, `/usage` where your client offers them) when a session feels heavy.
- Delegate verbose work (test runs, log digging, doc reading, scans) to a subagent and take back its Result Card, not its transcript.

## Reading and output
- Grep/Glob first, then Read with offset and limit. Never re-read a file you already hold. Cite `path:line` instead of pasting.
- Quiet tools: `pytest -q`, `playwright test --reporter=dot`, `vitest --reporter=dot`, `jest --silent`, `mvn -q`, `gradle -q --console=plain`, `dotnet test -v q`, `cargo test -q`. Narrow with `-k`, `--grep`, `-run` or a single spec.
- Do not pipe a loop check through `| tail`: loopctl already returns a capped tail and keeps the exit code honest.
- Final replies are Result Cards (15 lines). Write files in chunks of about 300 lines; `CLAUDE_CODE_MAX_OUTPUT_TOKENS` is 16000.

## Model and effort routing
| Work | Model | Effort |
|---|---|---|
| classify, extract, summarize logs | haiku, or `tools/ask.mjs --model claude-haiku-5-5` | low |
| implement, test, debug (sdet, swe) | sonnet | medium |
| review, architecture, hard debugging (tech-lead) | opus | high |
Raise effort only after a lower level fails: thinking tokens are billed as output.

## Scripted calls: tools/ask.mjs
Claude Code cannot set `stop_sequences`, so scripts use ask.mjs. Defaults: `max_tokens` 2048 (thinking counts toward the cap), stop sequence `</result>`, effort `low`, model `$HARNESS_MODEL` or `claude-opus-5-5`. Pass `--model claude-haiku-5-5` for cheap utility calls.
```
git diff main | node tools/ask.mjs --role tech-lead --prompt "Summarize risk in 5 bullets" --max-tokens 600
node tools/ask.mjs --context .claude/skills/pr-review/references/checklists.md --file ci.log --prompt "Why did CI fail?"
```
- Response cache: `.harness/cache/<hash>.json`, keyed on the full request, 14 days. `--no-cache` or `--refresh` bypass it.
- Prompt cache: stable text (role, `--context` files) goes in the system prefix, the variable part in the prompt. Never put dates, ids or run numbers in the prefix. Prefixes under about 512 tokens do not cache. Verify with `cache_read=` in the stderr line.
- Exit codes: 2 API error, 3 refusal, 4 truncated by `--max-tokens`.
- Headless Claude Code: bound runs with `claude -p ... --max-turns N --max-budget-usd X` (confirm with `claude -p --help` on your version).

## Cache hygiene in sessions
CLAUDE.md, agents, skills and settings form the stable prefix. Editing them mid-session, or toggling MCP servers or tools, rebuilds the cache. Batch harness edits, then restart the session.
