# 0008: Optional accounts with Supabase Auth (email and password)

Status: proposed (M1 slice 6; the product owner pulled accounts forward from M4 on 2026-11-01). Waiting for the owner's review.

**Context.** Players should be able to sign up and sign in. The app stays guest-first: every feature works with no account, and the on-phone SQLite database stays the source of truth ([0001](0001-local-first-data.md)). The owner has created a Supabase project; it is the only backend and stays on the free tier.

**Decision.**
- Supabase Auth with email and password. Sign up, sign in, sign out and delete account are reached from an "Account" row in Settings. Nothing else in the app changes when signed in. No social login yet: each provider needs its own developer account and store setup.
- One new dependency, added in the implementation commit and pinned by the lockfile: `@supabase/supabase-js` (MIT, maintained by Supabase). No new native module. Supabase's older Expo guides also add `react-native-url-polyfill`; it is not needed here because Expo SDK 58's runtime already provides `URL` and `URLSearchParams`.
- The app reads `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from `.env.local` (gitignored) and EAS environment variables. The publishable key is built to ship inside an app and is safe only because every table has Row Level Security ([0009](0009-cloud-schema.md)). The secret key never enters the repo or the app.
- The login session (access and refresh tokens) is kept with the `expo-sqlite/localStorage` shim, the same as Supabase's own Expo guide, so no extra package is needed. It is not encrypted at rest. Encrypted storage (`expo-secure-store`) can replace it later behind one small adapter.
- Account deletion is a Supabase Edge Function, `delete-account`. It reads the caller from their login token and deletes only that user with the secret key, which Supabase gives to Edge Functions and never to the app. The user's rows go with them (`on delete cascade`). Google Play and the App Store both require in-app deletion for apps with sign-up.
- Settings and the sign-up screen say plainly that an account does not back up or sync anything yet. Guest data stays on the phone, signed in or not.

**Trade-offs.**
- Supabase's built-in email sender only mails addresses that belong to the project's team and allows about 2 emails per hour. Confirmation and password-reset emails therefore will not reach ordinary players. Before a public release a custom email sender on a domain the owner controls is needed (several providers have free tiers; the cost is DNS setup, not money). Until then only the owner can realistically sign up.
- Optional accounts give two states (guest and signed in) to test and explain, but keep the "no account needed" promise from the product vision.
- An account with no sync can confuse players. The wording in the screens matters more than the code here.
- Keeping the session in unencrypted storage is what Supabase recommends for Expo and is acceptable for low-sensitivity workout data. A rooted phone could read the tokens.

**Consequences.** The Stack line in `CLAUDE.md` gains Supabase Auth when this is accepted and the code lands. M4 shrinks to sync and guest-to-account migration. "Delete all data" must also offer to delete the cloud copy once sync exists. A small `auth` repository wraps the client so no test calls the network. Text goes through new `account.*` translation keys.
