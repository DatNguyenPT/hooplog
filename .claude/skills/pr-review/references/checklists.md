# Review and release checklists

Use the sections that match the diff. Do not recite them; flag only what applies.

## Correctness
Edge cases (empty, null, max, unicode, time zones, DST); error paths; concurrency and ordering; idempotency of retried operations; resource cleanup; numeric precision and money handling; off-by-one in pagination and ranges.

## Security
New or changed endpoint has authentication and object-level authorization; input validated at the boundary; queries parameterized; output encoded; no secrets or PII in code, logs or errors; new dependency vetted (maintenance, license, install scripts); SSRF/file/path handling; CORS and cookie flags unchanged or justified.

## API compatibility
Additive only? Removed or renamed fields, changed types, stricter validation or new required inputs break clients. Is there a version or deprecation plan? Are contract tests updated?

## Migrations
Backward compatible with the old code still running (expand, then contract)? Locks or table rewrites on large tables? Backfill batched and resumable? Down path or documented forward-fix? Deploy order stated (migration first, code second)?

## Tests
Fails without the change? Asserts behavior, not implementation? Covers the risky paths and negative cases? Deterministic and isolated? Not over-mocked? Fast enough for its tier? Added at the lowest useful level? Coverage dropped in touched code?

## Performance
New query paths indexed; N+1 avoided; unbounded lists paginated; hot paths allocation-light; caches have TTL and invalidation; frontend bundle and render cost checked; timeouts on outbound calls.

## Observability
Failures logged with context and ids, no secrets; metrics or traces for new critical paths; alerts for new failure modes; health endpoints reflect real readiness.

## Infra and CI
Least-privilege roles; no public exposure by default; resource requests/limits; secrets from the store; pipeline changes keep gates intact; pinned actions and images; cost impact understood.

## Deploy go/no-go
- Green checks on the exact artifact being deployed (not a rebuild).
- Migration plan and backward compatibility confirmed; feature flag or kill switch for risky behavior.
- Rollback command known and tried in staging; previous version retained.
- Monitoring and alerts ready; owner on call and watching; stakeholders informed.
- Strategy chosen by blast radius: rolling, canary (watch error rate and p95 for 15-30 min), blue/green.
- Post-deploy: smoke tests, error rate, latency, key business metric, new error signatures in logs.
- Roll back first, investigate second, when the error rate or latency crosses the agreed threshold.

## Incident triage order
Was there a recent deploy or config change? Roll it back if so. Scope (who, what, since when), then dashboards, logs and traces for that window, then dependencies. Communicate status on a fixed cadence. Capture a timeline for the follow-up.
