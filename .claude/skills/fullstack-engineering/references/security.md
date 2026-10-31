# Security for builders

Use OWASP ASVS (level 1 as baseline, level 2 for sensitive data) as the checklist, and the OWASP Top 10 as the common-failure map.

## Before coding: five questions
What are we protecting? Who can touch it (roles, tenants, services)? How could it be abused? What happens on failure? How will we notice? Write the answers into the PR description for anything touching auth, money, personal data or file/URL handling.

## Authentication and sessions
- Passwords: Argon2id (or bcrypt/scrypt with sane cost), breached-password check, rate limiting and lockout with care for enumeration. Offer MFA.
- Sessions: `HttpOnly`, `Secure`, `SameSite` cookies; rotate on login/privilege change; invalidate on logout.
- JWT: short-lived access tokens, verify `alg`, `iss`, `aud`, `exp`; rotate and revoke refresh tokens; never put secrets in claims.

## Authorization
Deny by default; enforce on the server for every request and object (object-level checks stop IDOR); centralize policy; tenant id comes from the session, never from client input.

## Input and output
Allow-list validation at boundaries; parameterized queries/ORM binding only; output encoding for the target context; file uploads: type sniffing, size limits, random names, stored outside the web root, scanned if public.
SSRF: allow-list outbound hosts, block link-local and metadata ranges (169.254.169.254), no user-controlled redirects.

## Secrets and crypto
Secrets in a secret manager or env, never in git, images or logs; rotate; scan with gitleaks in CI and pre-commit. Use vetted libraries (TLS 1.2+, AES-GCM, libsodium); never invent crypto or reuse nonces.

## Dependencies and supply chain
Lockfiles committed, automated updates (Dependabot or Renovate), `npm audit` / `pip-audit` / `trivy` in CI, minimal base images, pinned CI actions, SBOM for releases.

## Platform hardening
Headers: CSP, HSTS, `X-Content-Type-Options: nosniff`, `frame-ancestors`. CORS allow-list (no wildcard with credentials). Containers non-root with read-only filesystem where possible. IAM least privilege; no public buckets; network segmentation; separate prod and non-prod accounts.

## Logging and response
Log security events (auth failures, permission denials, admin actions) with ids, never secrets or full PII. Alert on anomalies. Have an owner and a runbook for rotating a leaked secret.

## LLM features
Treat model output and retrieved content as untrusted input; constrain tool permissions to least privilege; require confirmation for irreversible actions; never place secrets in prompts; log prompts and tool calls for audit.

## Hand-off
For each fix, give `sdet` the abuse case as a test: the request, the expected denial, the role used.
