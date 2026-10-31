# API and contract testing

## Layers
Schema and contract checks (cheap, many), then functional tests per endpoint, then a few cross-service flows. Test business rules here, not through the UI.

## Tools (match the backend language)
Python `pytest` + `httpx`; Node `supertest` or Playwright's `request`; Java REST Assured; Postman collections via `newman run collection.json -e env.json --reporters cli,junit`. OpenAPI fuzzing: `schemathesis run <openapi-url> --checks all` (the base-URL flag differs by version; check `--help`).

## Cover per endpoint
- Happy path plus response schema: status, body shape, types, headers, error format.
- AuthN/AuthZ matrix: no token 401, wrong role 403, another tenant's id (IDOR) 403 or 404, expired token.
- Validation: missing or extra fields, types, boundaries, unicode, oversize, mass assignment.
- State: idempotent retries (same key twice), conflicts (409 or 412), pagination edges, sorting, filtering.
- Resilience: timeouts, 429 with `Retry-After`, partial failures of dependencies (use a stub).

## Data and isolation
Each test creates what it needs through the API with unique ids (`uuid4()`), cleans up in a finalizer, and never shares users or mutable fixtures. Seed read-only reference data once.

## Contracts (Pact)
The consumer test writes the pact, publish it to the broker, the provider's CI verifies it, and deploys are gated with `pact-broker can-i-deploy --pacticipant <name> --version <sha> --to-environment <env>`. Use contracts at service boundaries instead of heavy shared end-to-end environments.

## Dependencies
Stub external services with WireMock, MSW or Prism (`prism mock openapi.yaml`). Record real responses sparingly and refresh them on a schedule so stubs do not drift.

## GraphQL
POST to the single endpoint. Test authorization per field, depth and complexity limits, persisted queries, and introspection disabled in production.
