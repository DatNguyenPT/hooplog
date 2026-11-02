# 0011: A static "Email confirmed" page on GitHub Pages

Status: proposed (M1 slice 6 follow-up, 2026-11-02; the product owner chose this option). Waiting for the owner's review.

**Context.** Sign-up sends a confirmation email ([0008](0008-optional-accounts-supabase-auth.md)). The link goes to Supabase first, which confirms the account, and then sends the browser to the project's Site URL. That setting defaults to `http://localhost:3000`, an address that only exists on a developer's own computer, so on a phone the player sees `ERR_CONNECTION_REFUSED` even though the account is confirmed. An address passed from the app is honoured only if it is on Supabase's allow-list, so a dashboard setting is needed either way, and it must point at a real public page.

**Decision.**

- A tiny static page in `site/` says what happened and asks the player to go back to the app. The workflow `.github/workflows/pages.yml` publishes it with GitHub Pages when `site/` changes on `main`. It uploads only `site/`, never `docs/` or the source. The repository is public, so this costs nothing.
- The product owner sets the page's address as Supabase's Site URL (dashboard, Authentication, URL Configuration). Expected address: `https://datnguyenpt.github.io/hooplog/` (confirm it after the first deploy). The app does not change: sign-up passes no redirect address, so the Site URL is used.
- The page reads the result Supabase put in the address and shows one of three messages: "Email confirmed" (a token or a code is there), "This link didn't work" (any error is there; an error always wins), or "Nothing to confirm here" (a plain visit, or a password-reset link, which this page does not handle). It shows only its own fixed text, never text taken from the address. It never uses the sign-in tokens Supabase attaches, and it removes them from the address bar and browser history once it has read the result.
- The page makes no requests to other sites, sets no cookies and has no analytics; a Content-Security-Policy in the page enforces the "no other sites" part. Without JavaScript it shows a general message. It follows the phone's light or dark setting. English only for now.
- Which message to show is a small pure function with unit tests (`site/landing.js`, `site/landing.test.js`).

**Trade-offs.**

- The address belongs to the owner's GitHub account and repository name. Renaming either breaks it. A domain of their own can replace it later by changing the Site URL.
- It goes live only once this change is on `main`, because GitHub's `github-pages` environment accepts deployments from `main` only by default. One-time setup by the repository owner: Settings, Pages, Source: GitHub Actions. Until both are done the old localhost redirect remains (accounts still get confirmed).
- No button opens the app. A link back into the app (a deep link) does not work in Expo Go and needs a development or production build, so it is a later improvement.
- Email scanners that open links in advance can use the single-use link before the player does. The account is then confirmed but the player's own tap shows "This link didn't work", so that message says to sign in if the email was already confirmed.
- The app has no "send the email again" action, and there is no password reset. A reset link would need its own landing page.
- Supabase's default email sender still only reaches the project team ([0008](0008-optional-accounts-supabase-auth.md)). A custom email sender stays a must-do before real players.

**Consequences.** The same site can later hold the privacy policy and the account-deletion page that Google Play asks for; list them in the beta preparation. Changing the page means changing `site/` on `main`; changing where Supabase sends players means changing the Site URL in the dashboard.
