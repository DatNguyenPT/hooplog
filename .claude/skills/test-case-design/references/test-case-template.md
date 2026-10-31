# Test case format

## File layout (`docs/test-cases/<feature>.md`)
```
# <Feature> test cases
Sources: <story, files, collection, links>
Assumptions: <A1 ..., A2 ...>
Open questions: <Q1 ...>

## Requirements
R1 <requirement or AC> ... R2 ...

## Coverage
| Req | Cases | Gap |
|---|---|---|
| R1 | TC-LOGIN-001, -002, -005 | none |

## Cases
| ID | Title | Pri | Type | Pre | Steps | Expected | Data | Refs | Auto |
|---|---|---|---|---|---|---|---|---|---|
```

## Row rules
- Steps are numbered and joined with `<br>`: `1. Open /login<br>2. Enter the email and password<br>3. Click Sign in`. Escape a pipe as `\|`.
- Expected is observable: the exact message, redirect, field value, status code or stored record.
- Pre lists the state that must already exist (account, role, flag, data). Data lists the exact values.
- Refs lists R ids (and bug or ticket ids). Auto is `yes`, `no` or `later`.

Example rows:
```
| TC-LOGIN-001 | Sign in with valid credentials | P0 | Functional, Smoke | Active user alice@example.com / Pa55word! | 1. Open /login<br>2. Enter email and password<br>3. Click Sign in | Redirected to /dashboard; header shows "alice" | alice@example.com / Pa55word! | R1 | yes |
| TC-LOGIN-004 | Reject a password one character short of the minimum | P1 | Negative, Boundary | None | 1. Open /register<br>2. Enter a 7-character password<br>3. Submit | Inline error "Password must be at least 8 characters"; no account created | `Abcdef1` | R3 | yes |
```
For a long or branching case, add a detail card under the table (`### TC-ID` with Preconditions, Steps, Expected per step, Postconditions).

## IDs, titles, types
- ID: `TC-<AREA>-<NNN>`, area of 3 to 5 letters. Never renumber; append new cases; mark removed ones `Deprecated`.
- Title: verb + object + condition, outcome if it helps: "Reject login with an expired password".
- Type: Functional, Negative, Boundary, Security, Usability, Accessibility, Compatibility, Performance, Regression, Smoke (combine with commas).
- Priority: P0 blocks release or risks money, data or security. P1 core flow. P2 important edge. P3 nice to have.

## Exploratory charter
`Explore <area> with <data, role, tool> to discover <risk or information>.` Timebox 60 to 90 minutes. Notes: what was tried, bugs found, questions raised, areas still untouched.

## Smoke and regression
- Smoke: 5 to 15 P0 cases proving the build is alive (sign in, create the main entity, read it back, pay, sign out, health). Runs on every build, under 15 minutes.
- Regression: stable P0 and P1 flows, grouped by area, run per release. Review after each release: add cases for escaped defects, drop cases for removed features.

## Importing into a test management tool
Never hand-write a large CSV. Run the exporter on the case files; it prints a summary and warns about empty steps, unknown priorities and rows without an ID:
```
node tools/testcases-export.mjs docs/test-cases --format testrail --out docs/test-cases/export/testrail.csv
node tools/testcases-export.mjs docs/test-cases --format steps --fill --out docs/test-cases/export/steps.csv
```
- `generic` (default): one row per case; steps and expected results are on separate lines inside one cell.
- `testrail`: one row per case. The title is `ID: title`, priority becomes Critical, High, Medium or Low, and type maps to TestRail's default names (Functional, Security, Smoke & Sanity and so on). Adjust the mapping in the importer if your instance customized them.
- `steps`: one row per step with `Test ID` on every row, for Xray and Zephyr Scale style importers. Case fields sit on the first row only; `--fill` repeats them on every row. An Expected cell with as many lines as there are steps is split per step; otherwise it goes on the last step.
- `--bom` helps Excel show non-ASCII text, `--section "<name>"` overrides the folder or section name, and a directory argument exports every `.md` file in it.

Column names still differ by tool and version, so map them in the importer and try a few cases first.

## Test plan skeleton (when asked for a plan)
Scope and out of scope; approach and levels; environments and data; roles and accounts; entry and exit criteria; risks and mitigations; schedule and owners; deliverables.
