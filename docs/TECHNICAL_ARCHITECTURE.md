# HoopLog: Technical Architecture

Status: proposed, pending review. Versions are pinned when the project is scaffolded; check current compatibility then, not now.

## 1. Key decision: local-first, Supabase later

Since the app must work as a guest, the phone's own database is the source of truth. The MVP has **no backend at all**.

| | Local-first (chosen) | Supabase from day one |
|---|---|---|
| Cost | Zero | Free tier, but limits and a vendor to manage |
| Offline | Works naturally | Needs a sync layer immediately |
| Complexity | Low | Auth, RLS rules, network states everywhere |
| Later sync | Must be designed for (see below) | Already there |

Trade-off: we must write sync later instead of getting it free. We reduce that cost now by making every table sync-ready (below). Supabase (Auth, Postgres, Storage) is introduced in its own milestone via an ADR.

## 2. Stack

| Concern | Choice | Why / note |
|---|---|---|
| Framework | Expo (managed) + React Native + TypeScript strict | Handles native build complexity; works on Windows for Android |
| Navigation | Expo Router | File-based, deep links for free |
| Local DB | `expo-sqlite` | Relational data (sessions, sets, shots) suits SQL; aggregation for stats is easy |
| Validation | Zod | Parse imports/exports and later network data |
| i18n | `i18next` + `expo-localization` | Vietnamese later without refactor |
| Async state | Plain hooks over repositories first; TanStack Query if caching/sync justifies it | Avoid dependencies until needed |
| Tests | Jest (+ React Native Testing Library); Maestro for e2e smoke later | Free |
| CI | GitHub Actions: lint, typecheck, test | Free for small projects |
| Builds | Local Android builds and EAS free tier | Free tier queues are slower; acceptable |

Not yet chosen (each needs an ADR): Supabase client, Vision Camera, ML runtime, ORM (plain SQL repositories are the default; Drizzle only if migrations get painful), crash reporting.

Expo Go cannot run custom native code, so we use **development builds** from the start. This costs a one-time Android Studio setup but avoids a painful switch when the camera arrives.

## 3. Layers and folders

```
src/app/                   Expo Router screens: thin, only wiring
src/features/<feature>/
  domain/                  pure TypeScript rules + types (no React, no DB). Unit-tested.
  data/                    repositories (SQL) behind interfaces
  ui/                      components and hooks for this feature
src/shared/
  db/                      connection, migrations runner
  ui/                      design system: tokens, Button, Card, EmptyState, ErrorState, Skeleton
  i18n/  units/  utils/
docs/decisions/            ADRs, one short file per significant decision
```

Features: `training-plans`, `workouts`, `shooting`, `analytics`, `profile`, later `ai-camera`, `sync`.

Dependency rule: `ui -> data/domain`, `data -> domain`, `domain -> nothing`. Screens never contain SQL or formulas. This is what makes the code testable and lets us swap storage or add sync without touching screens.

## 4. Data model (sketch)

Every table: `id` (client-generated UUID), `created_at`, `updated_at`, `deleted_at` (soft delete), and later `synced_at`/`user_id` (nullable now). These make future sync merge-friendly without a rewrite.

- `profile` (single row: display name, unit and language preferences)
- `exercise` (library item; built-in seed + user-created; category, measurement type)
- `training_plan`, `plan_item` (weekly schedule: each item has an ISO weekday and its targets; no separate day table, see ADR 0005)
- `workout_session`, `workout_set` (exercise, reps, weight kg, duration s, distance m)
- `shooting_session` (date, location label optional, source: `manual` | `ai`)
- `shot` (session, timestamp, result `made|missed|uncertain`, zone optional, `source` manual|ai, `confidence` nullable, `corrected` boolean)
- Derived stats (FG%, volume, streaks, charts for a day, week, month or the last 8 weeks, personal bests) are computed from rows, not stored, until performance needs otherwise (see ADR 0006).

The `shot` table already has `uncertain`, `source`, `confidence`, `corrected`, so AI results later need no schema redesign. No video columns; the POC may add an optional local clip path later.

Migrations are versioned and forward-only, run on app start, and tested.

## 5. Cross-cutting rules

- **States:** every data-driven screen has loading, error, empty and (for later sync) offline states. Shared components enforce it.
- **Units:** store metric (kg, m, cm, seconds). Convert/format only in `shared/units`. Imperial can be added without data migration.
- **i18n:** all user-facing text through translation keys from the start; English resources only.
- **Accessibility:** labels and roles, 44dp+ touch targets, font scaling, sufficient contrast. Primary actions (Made/Missed) must be large and usable one-handed.
- **Monetization readiness:** a single `entitlements` module with a stub returning "all free". Premium features check it. No payment SDK.
- **Security/privacy:** no secrets in code; `.env.local` and EAS secrets; guest data stays on device; camera permission requested in context with a specific explanation.
- **Backup:** JSON export/import (validated with Zod) protects guests from losing data when changing phones, until sync exists. This is a real MVP risk worth covering.
- **Errors/crashes:** a crash reporter is a later ADR; prefer a privacy-friendly option and keep the data-safety form accurate.

## 6. Future sync design (not built now)

Supabase Auth + Postgres with Row Level Security so users only read their own rows. Sync is "last-write-wins by `updated_at`" per row, with soft deletes, which is adequate for single-user data on a few devices. Guest data is attached to the new account at sign-up. Storage is not used for video.

## 7. AI architecture seam

The AI camera lives in `features/ai-camera` and communicates with the rest of the app only by emitting shot events (`made|missed|uncertain`, timestamp, confidence) into the same `shooting` repository used by manual entry. The detection pipeline is isolated behind an interface (`ShotDetector`), so the model, runtime or even the whole approach can be replaced or removed with no effect on the app. See [AI_CAMERA_POC.md](AI_CAMERA_POC.md).

## 8. Quality gates

Per PR: lint, `tsc --noEmit`, unit tests (domain logic must be covered: FG%, volume, streaks, unit conversion, migrations), `tech-lead` review for non-trivial changes. Before beta: Maestro smoke flows on an emulator, manual test pass on the real phone, accessibility pass.

## 9. Risks specific to this architecture
- Local-only data can be lost with the phone: mitigated by JSON export now, sync later.
- Retrofit sync complexity: mitigated by sync-ready columns and repository interfaces.
- Expo/React Native upgrade churn, especially with native camera/ML plugins: pin versions, upgrade deliberately.
- Windows cannot build iOS: iOS is validated later through cloud builds and a borrowed or purchased iPhone.
