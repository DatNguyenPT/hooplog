# 0001: Local-first data (SQLite), Supabase later

Status: accepted (product owner answers, 2026-10-31)

**Context.** The app must work as a guest, offline, at no cost. Accounts and sync are wanted later.

**Decision.** `expo-sqlite` on the phone is the source of truth. No backend in the MVP. Every table uses client-generated UUIDs, ISO-8601 UTC timestamps, `updated_at` and soft delete (`deleted_at`) so rows can be synced to Supabase later. Schema changes are forward-only migrations numbered 1..n, tracked with `PRAGMA user_version` (`src/shared/db`).

**Trade-offs.** Free and simple, works offline; but sync and guest-to-account merge must be built later, and data is lost with the phone unless exported (JSON export is an MVP requirement).

**Consequences.** Business rules live in `domain/` as pure TypeScript; screens use repositories, never SQL.
