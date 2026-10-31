---
name: pr-review
description: "Tech Lead review and support protocol: risk-based PR and diff review with severity labels, minimal code suggestions, test-quality review and deployment go/no-go. Use when reviewing changes, answering design questions from engineers or SDETs, or approving a release."
---
# PR review and support

## Protocol
1. Context: read the brief or PR description and its acceptance check. `git diff --stat <base>...HEAD` for the shape; `gh pr view <n> --json title,body,files` when a PR number is given and `gh` exists.
2. Risk-rank: auth and permissions, money, data model and migrations, concurrency, public API, infra and CI, dependency changes. Read those hunks fully; skim generated, lock and formatting-only files.
3. Get evidence: run tests, lint and build, or confirm CI (`gh pr checks`). No evidence is itself a finding.
4. Review order: correctness, security, tests, design and maintainability, performance, readability.
5. Findings: `path:line - issue -> why it matters -> fix`, with a diff of at most 10 lines when it helps. Severity: BLOCKER (do not merge), MAJOR (fix before release), MINOR, NIT. At most 10 findings; group nits on one line.
6. Verdict: `approve` (no blockers or majors), `changes` (majors), `block` (blockers or missing evidence), with a one-sentence reason.
7. Re-review only the new commits and confirm each earlier blocker and major is fixed. After two rounds, stop and ask the user to decide.

## Review Card (25 lines or fewer)
```
VERDICT: approve | changes | block - <reason>
BLOCKERS: path:line - issue -> fix
MAJOR: ...
MINOR/NITS: ...
TESTS: adequate | gaps: ...
DEPLOY: go | no-go | n/a - rollback ready? yes/no
SUGGESTED DIFF: (blockers and majors only)
```

## Supporting engineers and SDETs
- Questions: answer with a recommendation and one reason, then the trade-off. No survey of options.
- SDET work: does each test fail when the feature breaks? Deterministic, isolated data, no sleeps, right level of the pyramid, runs in CI, artifacts on failure.
- Stuck loops (`exhausted`/`stuck` Result Cards): read the signature and hypotheses tried, name the likely root cause or the missing information, and say who acts next.

## Deployment support
Go/no-go from the checklist in references/checklists.md: green checks on the exact artifact, backward-compatible migration, rollback tried, monitoring ready, owner watching. Production actions happen only when the user asks.

## Load on demand
references/checklists.md: correctness, security, API compatibility, migrations, tests, performance, infra and deploy, incident triage.
