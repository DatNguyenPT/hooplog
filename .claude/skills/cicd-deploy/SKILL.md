---
name: cicd-deploy
description: "CI/CD, TestOps and simple app deployment playbook: pipeline design, test stages and gates, Docker, Compose and Kubernetes basics, environments, smoke tests and rollback. Use when creating or fixing pipelines, deploying an app, or wiring tests into CI."
---
# CI/CD and deployment

## Pipeline shape (fail fast, cheap first)
lint and format, unit, build one immutable artifact (image tagged with the commit SHA), API and integration, deploy to ephemeral or staging, smoke and E2E (`@smoke` gates the PR, `@regression` runs nightly), promote the same artifact, verify after deploy.

## Rules
- One build, many deploys: promote the artifact, never rebuild per environment. Config comes from env or a secret store.
- Cache dependencies keyed on the lockfile, shard slow suites, cancel superseded runs (`concurrency`), use path filters in monorepos, set a timeout on every job.
- Least privilege: read-only token by default, OIDC to the cloud instead of long-lived keys, protected environments for production, third-party actions pinned to a reviewed major or SHA.
- Always upload artifacts (JUnit XML, HTML report, traces, container logs) with `if: always()`.
- Gates: tests, lint, secrets and dependency scan, coverage delta (not an absolute number). Flaky tests go on a quarantine list with an owner and an expiry.
- Never echo secrets; no `set -x` around them.

## Deploy rules
- Expose `/healthz` (liveness) and `/readyz` (readiness). Smoke-test right after rollout; roll back automatically on failure.
- Strategy by blast radius: rolling (default), blue/green (instant rollback, double capacity), canary (weighted traffic).
- Database: expand, migrate, contract. Migrations stay backward compatible; never ship code and a destructive migration together.
- Know the rollback command before you deploy, and have tried it in staging.
- Production deploys, DNS, IAM and data deletion need the user's yes first.

## Load only what the task needs
- references/pipelines.md: GitHub Actions and GitLab CI skeletons (test, shard, build, deploy, reports).
- references/deploy.md: Dockerfile, Compose, minimal Kubernetes, smoke and rollback commands.
- references/testops.md: test environments and data, quality gates, flaky management, reporting, nightly regression.
- A failing pipeline step you keep re-running: `.claude/skills/agent-loop/SKILL.md`.
