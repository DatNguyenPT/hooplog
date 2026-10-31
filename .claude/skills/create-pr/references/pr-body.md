# PR title and body

## Title
Imperative, 70 characters or fewer, no trailing period. Follow the repo's convention if `lastSubjects` shows one (for example `feat(auth): add password reset`). Say what changed, not how.

## Body (use the repo's template instead when `template` is set)
```
## Summary
- What changed and why, in 1-3 bullets.

## Changes
- Key files or areas, grouped by purpose.

## Testing
- `npm test` -> 214 passed
- Not tested: <what and why>

## Risk and rollout
- Risk: low | medium | high - <why>
- Migration, feature flag, config change, rollback: <or "none">

## Review notes
- Where to look first. Tech Lead verdict and open MAJOR findings, if a review ran.

<attribution line from the session>
```

## Rules
- Facts only: every Testing line is a command that actually ran, with its result.
- Link, don't paste: reference issues, docs and logs. Keep the body under about 40 lines.
- No secrets, tokens, internal hostnames or customer data.
- UI changes need a screenshot or recording in the body; ask the user if none exists.
- Split an oversized change (over about 600 changed lines, or unrelated concerns) before opening.
