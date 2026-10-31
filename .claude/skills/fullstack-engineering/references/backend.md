# Backend and API design

## HTTP API
- Resources are nouns; verbs are HTTP methods. Status codes: 200, 201 + `Location`, 204, 400 (malformed), 422 (valid shape, invalid semantics), 401 (not authenticated), 403 (not allowed), 404, 409 (conflict), 429 + `Retry-After`.
- Errors use one shape, preferably RFC 9457 `application/problem+json` (`type`, `title`, `status`, `detail`, `instance`).
- Pagination: cursor-based for large or changing sets; stable sort; a hard maximum page size.
- Idempotency: `Idempotency-Key` on POSTs that create money, orders or messages; store key + response. Optimistic concurrency with `ETag` and `If-Match`.
- Versioning: additive changes only; deprecate with dates; never reuse a field with a new meaning.
- Rate limit per identity and per IP; return limits in headers.

## Structure
Transport (controllers/routes) -> application services (use cases) -> domain logic -> repositories/adapters. Dependencies point inward; no business rules in controllers or SQL strings scattered around.

## Data
- Migrations in version control, run before the new code needs them, backward compatible (add column nullable, backfill, then enforce).
- Transactions around invariants; pick the isolation level on purpose; use unique constraints, not just checks in code.
- Indexes for each filter/sort path (confirm with `EXPLAIN`); watch N+1 (eager load or batch); pool connections; set statement timeouts.
- Soft delete only when a requirement says so; otherwise delete and audit-log.

## Async and integration
- Queues are at-least-once: consumers must be idempotent. Use the outbox pattern when a DB write and a message must agree. Dead-letter queues with alerts.
- Outbound calls: timeout, bounded retries with jittered backoff, circuit breaker, bulkhead. Never retry non-idempotent calls blindly.
- Caching: define TTL and invalidation up front; protect against stampedes; never cache per-user data under a shared key.

## Config and operations
Twelve-factor config (env vars), no secrets in images or repos, graceful shutdown (drain, then exit), `/healthz` and `/readyz`, structured JSON logs with request id, RED metrics (rate, errors, duration), traces for cross-service calls.
