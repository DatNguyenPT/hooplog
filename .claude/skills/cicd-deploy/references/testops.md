# TestOps

## Environments
local (Compose) -> ephemeral per PR -> shared staging. Ephemeral environments make tests independent of each other and of other teams; tear them down automatically (TTL label plus a nightly sweeper).

## Test data
- Seed scripts for reference data, API factories for per-test data, DB snapshot and restore for heavy fixtures.
- No production data in tests. If a copy is unavoidable, mask it and restrict access.
- Unique names (uuid suffix) so parallel runs and reruns never collide.

## Dependencies
Virtualize third parties (WireMock, MSW, Prism) in PR pipelines; run a small contract or sandbox check against the real provider on a schedule.

## Gates and cadence
| Stage | Runs | Budget |
|---|---|---|
| PR | lint, unit, API, `@smoke` E2E, security scans | under 10 min |
| Merge to main | full integration, deploy to staging, `@smoke` + critical journeys | under 20 min |
| Nightly | `@regression`, cross-browser, mobile matrix, perf smoke, dependency audit | under 2 h |
| Weekly | load/soak, full device matrix, chaos in staging | scheduled |

## Flaky management
- Detect: report tests that pass only on retry; track flake rate per test.
- Quarantine: tag plus issue plus owner plus 14-day expiry; quarantined tests still run but do not gate.
- Fix by cause: race (wait on state), shared data (isolate), order dependence (randomize order in CI), environment (pin versions, resources), time (freeze clock).
- Never solve flakiness with more retries or longer sleeps.

## Reporting
JUnit XML for the CI UI, HTML report or Allure for humans, traces and screenshots linked from the failure. Track: pass rate, flake rate, duration p50/p95, time to first failure. A red build links to the first failing test, its artifacts and the logs for the same time window.

## Cost control
Cancel stale runs, run affected tests first, shard to keep wall time flat, cache dependencies and browsers, schedule expensive suites off-peak, shut ephemeral environments down on PR close.
