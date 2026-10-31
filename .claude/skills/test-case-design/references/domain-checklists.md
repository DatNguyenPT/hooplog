# Checklists by feature type

Use the lists that match the feature. Each line is a prompt for one or more cases, not a case itself.

## Forms and validation
Required, optional, default values; each field's type, length, format, range; trimming; special characters and emoji; paste and autofill; inline versus on-submit messages and their wording; submit disabled until valid; double submit; unsaved-changes warning; keyboard-only completion; error focus.

## Search, list, filter, sort, pagination
Empty result, one result, many results; exact, partial, case-insensitive, accented and special-character queries; filter combinations and clearing; sort stability and direction; page edges (first, last, beyond last); page size changes; counts match rows; state kept after back or refresh; deep links.

## Sign-up, sign-in, session
Valid and invalid credentials; wrong password limits and lockout; case sensitivity of email; show or hide password; remember me; password reset (expired, reused, tampered link); email verification; MFA (wrong code, expiry, resend); logout everywhere; session timeout and refresh; two tabs; token reuse after logout.

## Roles and permissions
Each role against each action and screen; anonymous access; direct URL or API access to forbidden pages; role change takes effect; another user's or tenant's data; hidden versus disabled controls; audit of privileged actions.

## Files: upload, download, export
Allowed and disallowed types; size at, below and above the limit; empty file; wrong extension; duplicate name; special characters in names; many files; cancel and retry; progress; virus-scan result; download integrity; export content, encoding, large datasets, delimiters.

## Payments and checkout
Cart changes; totals, tax, discount and rounding; coupon rules (expired, stacked, limits); each payment method; declined, timeout and 3-D Secure paths; double click on pay; refund and partial refund; currency; receipts and emails; order status after each outcome; stock changes. Use the provider's test cards only.

## Notifications (email, SMS, push, in-app)
Trigger and non-trigger conditions; recipient correctness; content, links and placeholders; localization; unsubscribe and preferences; duplicates; delivery delay; retry on failure; quiet hours.

## Dates, time zones, money, locale
Daylight-saving changes, leap day, month ends, user versus server time zone, date formats, first day of week; decimal and thousand separators, rounding, currency symbols; right-to-left text; long translations that break layouts; pluralization.

## Accessibility
Keyboard-only path with visible focus; screen-reader names for controls and images; headings and landmarks; color contrast; error messages announced; zoom to 200%; no information by color alone; captions for media.

## Compatibility and responsiveness
Latest two versions of the main browsers plus any contractual older one; iOS and Android versions that matter; small, medium and large viewports; portrait and landscape; touch versus mouse; slow network; offline and reconnect.

## Performance sanity
Page load and key action times against a stated target; large lists; many concurrent users on the main flow (hand real load tests to `sdet`); memory growth in long sessions.

## Data: import, export, migration, audit
Mapping of every field; null and default handling; duplicates; partial failure and rollback; idempotent re-run; record counts and checksums before and after; audit trail of who changed what.

## Integrations and webhooks
Success, timeout, 4xx, 5xx and malformed responses from the partner; retries and backoff; duplicate and out-of-order events; signature verification; credentials rotation; what the user sees while the partner is down.

## Security basics
Authorization on every access path; input rendered safely (script and HTML injection); sensitive data absent from URLs, logs and errors; secure cookies; rate limits; password storage and reset flow; file-upload abuse. Probe only systems you own or are authorized to test.

## Resilience and errors
Friendly messages for every failure; no data loss on error; retry and resume; behavior when a dependency is slow; maintenance mode; graceful handling of expired links and deleted records.
