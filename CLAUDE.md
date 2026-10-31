# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## HoopLog

Mobile app (Android first, iOS-compatible) for basketball players: training plans, workout and shooting tracking, analytics, and later AI shot tracking. Product owner is new to mobile: explain significant technical trade-offs in plain language before making major decisions.

## Docs (read before working in the area)
- [docs/PRODUCT_CONTEXT.md](docs/PRODUCT_CONTEXT.md): vision, users, scope, decisions made
- [docs/TECHNICAL_ARCHITECTURE.md](docs/TECHNICAL_ARCHITECTURE.md): stack, layers, data, trade-offs
- [docs/ROADMAP.md](docs/ROADMAP.md): milestones, estimates, gates
- [docs/AI_CAMERA_POC.md](docs/AI_CAMERA_POC.md): feasibility plan, recording protocol, metrics

## Decisions already made by the product owner
- Android first; keep iOS-compatible (no Android-only code outside platform adapters).
- Cheap and open source: no paid AI APIs, no paid EAS tier, no commercial model license until a clear need.
- Guest-first: the core app works with no account. Local SQLite is the source of truth; Supabase sync comes after the MVP.
- English UI, metric units; localization-ready for Vietnamese (no hardcoded user-facing strings).
- Free app. No payment or subscription code in the MVP; design so a freemium split can be added.
- Video is processed on-device and discarded. Store only structured shot events and session stats. Never upload continuous video by default.
- AI camera is a separate POC. It does not block or enter the MVP until it passes its go/no-go gate.

## Stack (MVP)
Expo (managed, development builds), React Native, TypeScript strict, Expo Router, expo-sqlite, TanStack Query only if needed, Zod, i18next, Jest. Supabase, Vision Camera and ML runtimes are NOT dependencies yet; add each through an ADR.

## Layout
`src/app/` thin Expo Router screens; `src/features/<name>/{domain,data,ui}`; `src/shared/`; `docs/decisions/` ADRs. Business rules (FG%, volume, streaks) are pure TypeScript in `domain/` with unit tests. No business logic in components.

## Rules
- TypeScript strict, no `any` without a comment. Validate external data with Zod.
- Every screen handles loading, error, empty and offline states, and works at small screen sizes with accessibility labels.
- IDs are client-generated UUIDs; rows carry `created_at`, `updated_at`, `deleted_at` (sync-ready).
- Store measurements in metric; convert at the UI edge only.
- No secrets in the repo. Env via `.env.local` (gitignored) and EAS secrets. Never commit footage or datasets.
- Add a dependency only if it is maintained, license-compatible with a closed-source store app (avoid AGPL/GPL), and clearly needed. Record it in an ADR.
- Do not assume generated code is correct: run lint, typecheck and tests before claiming done.
- Do not build ahead of the current milestone in the roadmap.

## Agents (existing harness; do not recreate)
`swe` builds features and CI; `sdet` owns tests; `tech-lead` reviews diffs and gates releases (read-only); `manual-tester` writes test cases. Use `/create-pr` to open PRs. Run `node tools/harness-lint.mjs` after editing `.claude/` or `tools/`.

## Commands
`npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check` (all run in CI). `npm run android` starts the dev server for the phone. Expo SDK 58: see [AGENTS.md](AGENTS.md) and fetch versioned Expo docs before using Expo APIs; use `npx expo install` to add packages.
