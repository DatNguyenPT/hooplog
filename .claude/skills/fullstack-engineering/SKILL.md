---
name: fullstack-engineering
description: "Engineering standards for building backend, frontend and mobile features with security and delivery in mind. Use when implementing or changing product code, designing APIs or data models, hardening security, or preparing a feature for deploy."
---
# Fullstack engineering

## Defaults (only for greenfield; repo conventions always win)
Backend: TypeScript (NestJS or Fastify) or Python (FastAPI) with PostgreSQL; add Redis only when a measured need appears. Web: React with Vite or Next.js, TypeScript strict. Mobile: React Native (Expo) or Flutter; native only for platform-specific needs. Delivery: Docker and GitHub Actions.

## Rules that always apply
- Validate at the boundary (request, config, env). Core logic stays pure and testable; side effects sit at the edges.
- Errors are structured, never swallowed, never leak internals, and carry a correlation id.
- Contracts first for APIs (OpenAPI or GraphQL schema or shared types). Only backward-compatible changes; version breaking ones.
- Data: reversible or expand/contract migrations, transactions around invariants, an index for every query path, no N+1.
- Security always: authorize every access path, parameterize queries, encode output, secrets from env or a secret store, audited and pinned dependencies (details in references/security.md).
- Observability: structured logs without PII or secrets, RED metrics, traces across services, health and readiness endpoints.
- Performance has a budget (p95 latency, query count, bundle size, LCP). Measure before optimizing.
- Testability: stable ids (`data-testid`, accessibility labels), seams for fakes, seed and reset scripts. Unit-test your logic; hand E2E depth to `sdet`.
- Small PRs: one concern, checks passing, risky migration and code split into separate steps.

## Load only what the task needs
- Backend, APIs, data, async: references/backend.md
- Web UI: references/frontend.md
- Mobile apps: references/mobile.md
- Security design and hardening: references/security.md
- Pipelines and deploys: `.claude/skills/cicd-deploy/SKILL.md`. A failing build you keep re-running: `.claude/skills/agent-loop/SKILL.md`.
