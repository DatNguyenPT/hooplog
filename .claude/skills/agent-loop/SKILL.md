---
name: agent-loop
description: "Run an act-then-verify loop with a fixed check, iteration budget and stuck rule using tools/loopctl.mjs. Use for fix-until-green, flaky-test hunts, review-revise rounds, deploy-verify, or any task that repeats until a command passes."
---
# Agent loop

A loop is only as good as its exit check. Fix three things before iteration 1 and never change them mid-loop:
1. **Check**: one command whose exit code is the truth (`npm test`, `npx playwright test e2e/login.spec.ts`, `pytest -q tests/api`, `terraform validate`, `curl -fsS $URL/healthz`). It must fail now, for the right reason.
2. **Budget** `--max`: default 6. Flaky hunt 3, deploy verify 3, perf regression 4.
3. **Stuck rule** `--stuck`: default 3 identical failure signatures in a row (the baseline run counts as 1).

## Procedure
1. `node tools/loopctl.mjs init --goal "<one line>" --check "<cmd>" [--max 6] [--owner sdet|swe] [--cwd dir]`. This stores a shell command, so the user approves it once.
2. `node tools/loopctl.mjs check` to reproduce. It must be red. Already green? Say so and stop.
3. Diagnose from the printed tail (do not re-run for more output), make the smallest fix, `check` again. Same failure twice means change hypothesis: read the code path, bisect, add a probe. Never retry unchanged.
4. Terminal states: `passed` write the Result Card. `exhausted` or `stuck` stop and report STATUS: blocked with the signature, hypotheses tried and what you would try next; escalate to `tech-lead`.
5. Need the user mid-loop: `node tools/loopctl.mjs stop --reason "<why>"`, then ask.

## Enforcement
While a loop is running its owner cannot finish: the Stop hook runs the check itself and blocks on red with the failure tail. Running `check` yourself after each fix is optional, but it saves a turn. Loops idle for 60 minutes are released. Delegating? `init --owner sdet|swe` and tell the subagent a loop is active.

## Patterns
| Pattern | check | max |
|---|---|---|
| fix-until-green | the failing test or build | 6 |
| flaky hunt | `npx playwright test <spec> --repeat-each=10` (pytest: `pytest <t> --count=10` with pytest-repeat); fix the root cause, never add retries | 3 |
| deploy-verify | `curl -fsS --retry 5 --retry-delay 3 --retry-connrefused $URL/healthz` plus smoke tests; red means roll back, not patch forward | 3 |
| review-revise | no command: at most 2 rounds between author and `tech-lead`, re-review only the new diff | 2 |

## Never
Weaken, skip or delete the failing test. Widen timeouts to hide a race. Add `|| true` to the check. Edit the check after seeing it fail. Re-read whole logs (the tail carries the signature). Continue past budget.
