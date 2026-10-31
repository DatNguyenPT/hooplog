# Performance and security testing

## Performance (k6 default)
```js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: { smoke: { executor: 'constant-vus', vus: 5, duration: '1m' } },
  thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<500'] },
};

export default function () {
  const r = http.get(`${__ENV.BASE_URL}/healthz`);
  check(r, { 'status 200': (x) => x.status === 200 });
  sleep(1);
}
```
Run `k6 run -e BASE_URL=https://staging.example.com script.js`. A breached threshold exits non-zero, so it gates CI.
- Types: smoke (does it work), load (expected peak), stress (find the limit), spike, soak (leaks, hours).
- Realistic data and think time; ramp up; baseline first, then compare; watch server CPU, DB, p95/p99 and error rate, not just client numbers.
- Test a prod-like staging with the load generator off the system under test. Never load-test production without written approval.

## Security testing: authorized targets only
Get written scope first (systems, dates, allowed techniques). Prefer local or staging environments you own. No denial-of-service, no destructive payloads, no real user data. Keep findings private until fixed.

### Fast checks in CI
| Check | Command |
|---|---|
| Secrets | `gitleaks dir .` or `gitleaks git` (older versions: `gitleaks detect`) |
| SAST | `semgrep scan --config auto --error` |
| Dependencies, files, IaC | `trivy fs --severity HIGH,CRITICAL --exit-code 1 .` and `trivy config .` |
| Images | `trivy image --severity HIGH,CRITICAL --exit-code 1 <image>` |
| Ecosystem audit | `npm audit --audit-level=high`, `pip-audit` |

### DAST baseline (passive, safe default)
`docker run --rm -v "$PWD:/zap/wrk:rw" -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t https://staging.example.com -r zap.html`
Active scans only on environments you own and with approval.

### Manual and scripted cases
- Authorization matrix (role x endpoint), IDOR on every id parameter, forced browsing, tenant isolation.
- Sessions and tokens: logout invalidates, JWT `alg`/`exp`/`aud` checked, refresh rotation, cookie flags.
- Input: injection payloads and path traversal against your own staging, file upload type and size limits, SSRF through URL parameters.
- Browser: CSP, HSTS, `X-Content-Type-Options`, CORS not wildcard with credentials.

### Reporting
Severity, repro steps, affected component, suggested fix, then a regression test so it stays fixed. Hand fixes to `swe`.
