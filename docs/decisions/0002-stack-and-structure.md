# 0002: Stack and project structure

Status: accepted

**Decision.** Expo (SDK 58, managed workflow with development builds), React Native, strict TypeScript, Expo Router (routes in `src/app/`), `expo-sqlite`, `i18next`, `zod`, Jest (`jest-expo`) and Testing Library, ESLint (`eslint-config-expo`), Prettier. CI on GitHub Actions: lint, typecheck, tests, format check, harness lint.

**Structure.** `src/app` thin routes; `src/features/<feature>/{domain,data,ui}`; `src/shared`. Import alias `@/` maps to `src/`.

**Not adopted yet** (each needs its own ADR): Supabase client, TanStack Query, Vision Camera, any ML runtime, ORM, crash reporting, payments.

**Notes.** Expo Go cannot run native modules we will need later, so use development builds. `npm audit` reports advisories that sit in Expo's own tooling dependencies; do not run `npm audit fix --force` (it would downgrade Expo). Revisit on each SDK upgrade.

**Dev dependency.** `@types/node` (~24) is dev-only, used by test files that run real SQL via `node:sqlite`; it is loaded only through `tsconfig.test.json`. `package.json` requires Node >=24.
