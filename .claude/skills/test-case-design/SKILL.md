---
name: test-case-design
description: "Manual QA playbook: turn a description, user story, business rules, project code or docs, Postman collections or OpenAPI into prioritized, traceable test cases (functional, negative, boundary, API, UI, security, regression) with test data. Use when designing or reviewing test cases, a test plan or a regression pack."
---
# Test case design

## Intake (before designing anything)
1. Name the scope in one line and list the sources you were given: description or story, acceptance criteria (AC), business rules, project code or docs, Postman collection or OpenAPI, screens, bug reports, existing cases.
2. Ask at most 3 questions, and only when the answer changes the cases. Otherwise list your assumptions at the top of the output and go.
3. Read narrowly: Grep for routes, validators, enums, feature flags, permissions and error messages, then read only the matching files. Postman: never open the JSON; run `node tools/postman-summary.mjs <file>` (see references/api-from-postman.md).

## Extract
Write a short model before any case: actors and roles; requirements and AC as `R1..Rn`; business rules (limits, formulas, statuses, permissions); states and transitions; data entities with types, ranges and formats; integrations and their failure modes; non-functional needs. Every case later cites at least one `R`. No stated rule for an expected result? Raise it as a question; do not guess.

## Design
Apply the techniques that fit (references/techniques.md): equivalence partitions, boundary values, decision tables, state transitions, pairwise for combinations, error guessing, scenario flows. Per requirement aim for one happy path, the main negatives, every boundary, every permission difference and the failure or recovery path. Then add the cross-cutting checks that apply from references/domain-checklists.md (forms, auth, files, payments, i18n, accessibility, compatibility, performance sanity).

## Write the cases
- Format, IDs, priorities, the coverage matrix and CSV export: references/test-case-template.md. One purpose per case, 8 steps or fewer, atomic steps, an observable expected result, concrete data (never "a valid email").
- Priority by risk (impact x likelihood): P0 blocks release or risks money, data or security; P1 core flow; P2 important edge; P3 nice to have. Mark `Smoke` for the 5 to 15 cases that prove a build is alive, and `Regression` for stable core flows.
- Set `Automate: yes` on stable, repeatable, high-value cases (API, data-driven, core journeys) so `sdet` can pick them up. Keep exploratory, visual and one-off checks manual.
- For risky or unclear areas write an exploratory charter instead of inventing detailed steps.

## Review before handing over
Every R has a positive and a negative case. Every boundary has below, on and above. Each role is covered. No two cases check the same thing. Steps are executable by someone who has never seen the app. Test data is stated. The coverage matrix has no empty row.

## Output
Write files, never paste suites into chat: `docs/test-cases/<feature>.md` unless the user names a location (split above about 60 cases). Reply with a Result Card: counts by priority and type, coverage (R covered of total), assumptions, open questions, file paths. Hand `Automate: yes` cases to `sdet` by file path. To load cases into TestRail, Xray or Zephyr Scale, run `node tools/testcases-export.mjs` instead of writing CSV by hand (references/test-case-template.md).

## Load on demand
- references/techniques.md: recipes with mini examples for each design technique.
- references/test-case-template.md: case format, IDs, coverage matrix, CSV export, charters, smoke and regression selection.
- references/api-from-postman.md: Postman collection or OpenAPI to API test cases, with a per-endpoint checklist.
- references/domain-checklists.md: ready checklists by feature type.
