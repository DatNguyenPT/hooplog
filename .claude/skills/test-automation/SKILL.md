---
name: test-automation
description: "SDET playbook for designing, writing and stabilizing automated tests and frameworks across web, mobile, API, performance, security and infrastructure. Use when creating or fixing tests, scaffolding a test framework, or triaging flaky tests."
---
# Test automation

## Principles (all domains)
- Pyramid: most checks at unit and API level, few E2E for critical journeys. Use the lowest level that can catch the risk.
- A test must fail for the right reason first. Run it red (wrong value or broken code) before trusting green.
- Deterministic: no sleeps (wait on conditions), freeze time, seed randomness, no shared mutable state. Each test creates its own data through an API or DB seam and cleans up.
- Selectors: role, label or test id over CSS over XPath. Ask `swe` for `data-testid` and accessibility ids instead of coupling to layout.
- Layers: thin page/screen objects or fixtures, API clients, data builders. Assertions live in tests, not helpers.
- Tag suites: `@smoke` (under 5 min, gates PRs), `@regression` (nightly), `@slow`.
- On failure always keep artifacts (trace, screenshot, video, logs) and emit JUnit XML plus an HTML report.
- Flaky is a bug: quarantine with an owner and an expiry date, find the root cause (wait, data, order, environment), never add blind retries.
- Do not over-mock the system under test. Use contract tests at service boundaries.

## Pick the stack (the repo's existing tooling wins)
| Domain | Default | Alternatives |
|---|---|---|
| Web E2E | Playwright (TypeScript) | Cypress, Selenium/WebDriver for legacy or mandated grids |
| Mobile | Appium 2 + WebdriverIO | Maestro (fast flows), Detox (React Native), Espresso/XCUITest (native) |
| API | pytest + httpx, supertest or REST Assured, matching the backend | Schemathesis, Pact, newman |
| Performance | k6 | Gatling, JMeter, Locust |
| Security | Semgrep, Trivy, gitleaks, ZAP baseline (authorized targets only) | dependency audit tools per ecosystem |
| Infra | terraform validate/test, Checkov, conftest, kubeconform, hadolint | Terratest for real-environment tests |

## Load only the file for the task
- Web: references/web-e2e.md
- Mobile: references/mobile.md
- API and contracts: references/api-contract.md
- Performance and security: references/perf-security.md
- Infrastructure: references/infra-testing.md
- Pipelines, environments, deploys: `.claude/skills/cicd-deploy/SKILL.md`. Failing-check loops: `.claude/skills/agent-loop/SKILL.md`.

## Greenfield scaffold
`tests/{e2e,api,unit}/`, `src/{pages,clients,fixtures,data}/`, `config/` (env-driven, no secrets in code), `reports/` (gitignored), and a README with the run commands.

## Definition of done
Red-then-green evidence, passes 3 runs in a row (`--repeat-each=3` or equivalent) for UI tests, runs in CI, run command documented, failure artifacts verified once by breaking a test on purpose.
