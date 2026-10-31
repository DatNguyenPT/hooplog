# API test cases from a Postman collection or OpenAPI

## 1. Summarize, do not read
`node tools/postman-summary.mjs collection.json [--env env.json] [--folder orders] [--samples] [--json]`
One line per request: method, URL, auth, path and query names, body fields, test names, asserted status codes, saved examples, pre-request flag. The last line counts gaps (requests with no tests, no 4xx/5xx check). Use `--folder` to work one area at a time, `--samples` when you need example bodies for test data. Secret-looking variables and query values are masked; keep them out of the cases too (write `<admin token>`).

## 2. Treat the inventory as seeds
- Each request is a baseline happy-path case.
- `tests:` and `asserts:` are expectations already checked: strengthen them (schema, values, side effects), do not duplicate them.
- `examples:` are documented responses. A missing 4xx example is a documentation gap and a likely test gap.
- Gaps are the first things to cover and the first questions to raise.

## 3. Per-endpoint checklist (apply what fits)
- Happy path: status, response schema and types, key values equal to the request, headers (`Content-Type`, caching), reasonable response time.
- Auth: no token 401; expired or malformed token 401; wrong role or scope 403; another user's resource 403 or 404 (IDOR).
- Validation: required field missing, wrong type, null, empty string, too long, below and above a boundary, invalid enum, unknown extra field, duplicate of a unique value, malformed JSON, wrong `Content-Type`.
- Path and query: unknown id 404, malformed id 400, pagination edges (page 0, last page, huge limit), sort and filter combinations, special characters in search.
- Business rules: state-dependent behavior, idempotency (same POST twice, `Idempotency-Key`), conflicts 409, concurrent updates, quotas and limits, soft delete visibility.
- Side effects: record changed exactly once, events or emails sent, audit entry written, GET after POST/PUT/DELETE shows the change.
- Errors: one consistent error shape, correct 4xx versus 5xx, no stack traces or internals, 429 with `Retry-After` where limits exist.
- Security basics (own staging only): injection strings, mass assignment, sensitive fields never returned, CORS and security headers, HTTPS only.
- Performance sanity: list endpoint with a large page size, large payload, slow dependency.
- Compatibility: versioned paths, deprecated fields still honored.

## 4. Sequences
Folder order usually encodes a flow: log in, create, read, update, delete. Write those as scenario cases. Variables that carry state (`{{orderId}}`, tokens saved by a test script) and pre-request scripts become Preconditions; say which earlier step produces each value.

## 5. Case layout for APIs
Steps: the request line, the headers that matter, the body. Expected: status, the fields that must hold, the schema, the side effect.
```
| TC-ORD-012 | Reject order creation with a negative quantity | P1 | Negative, Boundary | Customer token; product 42 in stock | 1. POST /orders<br>2. Body: {"productId":42,"quantity":-1} | 422; error.code "INVALID_QUANTITY"; no order created (GET /orders unchanged) | quantity -1 | R4 | yes |
```

## 6. Run the baseline (only with permission, staging only)
`newman run collection.json -e env.json --reporters cli,junit` confirms the existing assertions pass before you document around them. Report pass and fail counts; never run it against production or with real customer data.

## 7. OpenAPI instead of Postman
Grep `paths:` or `operationId`, then read one path at a time. Derive validation and boundary cases from `required`, `enum`, `minLength`, `maxLength`, `minimum`, `maximum`, `pattern`, `format` and `nullable`; derive status cases from `responses`; derive auth cases from `security`. Then apply section 3.

## 8. Hand-off
API cases are good automation candidates: set `Automate: yes` and give `sdet` the file path. They can port the cases to newman, REST Assured or pytest.
