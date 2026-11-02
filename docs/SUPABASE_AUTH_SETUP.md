# Supabase setup: the owner's checklist

These are the things only the project owner can do in the Supabase dashboard, or approve in chat. Nothing here has been applied: no setting, table or function on the live project was changed by the code in this repository. Dashboard menus get renamed from time to time; if one is missing, search the dashboard for its words.

The pages mentioned below are published by GitHub Pages from the `site/` folder once a change reaches `main`. Do the dashboard steps after the pull request that adds the pages has been merged and the "Pages" workflow has finished (see [0012](decisions/0012-site-pages-and-account-deletion.md)).

## 1. Tell Supabase where the pages are

Dashboard: Authentication, URL Configuration.

| Setting | Value |
|---|---|
| Site URL | `https://datnguyenpt.github.io/hooplog/` |
| Redirect URLs | `https://datnguyenpt.github.io/hooplog/confirm/` |

- The Site URL is where Supabase sends people when an email link does not say otherwise. It replaces the default `http://localhost:3000`, which is what showed a connection error after confirming.
- When someone signs up, the app asks Supabase to end the confirmation on the `confirm/` page. Supabase honours that only if the exact address is on the Redirect URLs list. Anything else falls back to the Site URL. Use exact addresses, not a wildcard such as `**`: a wildcard also allows addresses you did not mean.
- Optional entries for later: the home page itself, and `https://datnguyenpt.github.io/hooplog/account-deleted/`.
- Remove `http://localhost:3000` from the list if it is there.
- If the site ever moves (for example to a domain of your own), change both settings, set `EXPO_PUBLIC_SITE_URL` to the new `https` address in `.env.local` and in the EAS variables (see `.env.example`), and rebuild the app.

## 2. Keep "Confirm email" switched on

Dashboard: Authentication, Sign In / Providers, Email.

- With it on, a new account is saved immediately with the status "Waiting for verification" (Authentication, Users). That is normal, and it cannot sign in until the email link is opened.
- With it off, Supabase confirms every account on the spot, so anyone can sign in with an email address they do not own. The app cannot tell the difference, so this switch is the real lock.
- How to check: sign up with an address you can read, then look at the Users list before opening the link. It should say "Waiting for verification", and signing in should answer "Confirm your email first: open the link we sent you, then sign in." After you open the link the browser shows "Email confirmed" and signing in works. If the Users list shows the account as confirmed straight after sign-up, the switch is off.
- Accounts left over from earlier tests, confirmed or not, can be removed from the Users list.

## 3. Use your own email sender before real players

Dashboard: Authentication, Emails, SMTP Settings.

Supabase's built-in sender only mails addresses that belong to your project team and allows about 2 emails an hour, so ordinary players never receive the confirmation link. Before a closed beta, add an SMTP provider and a sender address on a domain you control (see [0008](decisions/0008-optional-accounts-supabase-auth.md)). Until then only you and your team can sign up.

## 4. Deploy the `delete-account` function

The function is written and tested (`supabase/functions/delete-account/`) but not deployed. Until it is, "Delete account" in the app answers "This is not available yet. Please try again later."

- Ask Claude Code to deploy it. It needs your yes in chat first, and the Supabase connection signed in through `/mcp` (or the Supabase command line logged in).
- Or do it yourself:

  ```bash
  npx supabase login
  npx supabase functions deploy delete-account --project-ref hgfjpybpqrjtlntguiit
  ```

  If the command line complains about Docker, add `--use-api`.
- It needs no secret from you: Supabase hands the function its own key.
- Test it with a throwaway account: sign up, confirm, sign in, then Settings, Account, Delete account. A wrong password should change nothing. The right one should show "Account deleted" and the user should disappear from the Users list.

## 5. Still waiting for your decision

- The cloud tables designed in [0009](decisions/0009-cloud-schema.md) are five migration files in `supabase/migrations/`. They are not applied. Nothing in the app needs them until sync (M4), so applying them can wait.
- Before real players: a contact address for deletion requests made without the app (Google Play asks for one). Tell Claude Code which address to publish on `delete-account/`; it will not invent one.

## Where each address is used

| Address | Used for |
|---|---|
| `https://datnguyenpt.github.io/hooplog/` | Supabase Site URL; shows the same messages as `confirm/` |
| `https://datnguyenpt.github.io/hooplog/confirm/` | Where the confirmation email ends; on the Redirect URLs list |
| `https://datnguyenpt.github.io/hooplog/delete-account/` | How to delete an account; the address for Google Play's account-deletion question |
| `https://datnguyenpt.github.io/hooplog/account-deleted/` | Nothing links to it yet; reserved for a deletion confirmed by email |
