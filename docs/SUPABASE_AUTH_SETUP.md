# Supabase setup: the owner's checklist

These are the things only the project owner can do in the Supabase dashboard, or approve in chat. Apart from the `delete-account` function (section 4, deployed on 2026-11-03), nothing here has been applied: no setting or table on the live project was changed by the code in this repository. Dashboard menus get renamed from time to time; if one is missing, search the dashboard for its words.

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

## 4. The `delete-account` function

The function (`supabase/functions/delete-account/`) was deployed on 2026-11-03 (version 1, login check on). Only its front door was tested: a call without a login answers 401. Whether the code behind it works is shown by one real round trip (the last bullet below).

- To deploy a changed version, ask Claude Code. It needs your yes in chat first, and the Supabase connection signed in through `/mcp` (or the Supabase command line logged in).
- Or do it yourself:

  ```bash
  npx supabase login
  npx supabase functions deploy delete-account --project-ref hgfjpybpqrjtlntguiit
  ```

  If the command line complains about Docker, add `--use-api`.
- It needs no secret from you: Supabase hands the function its own key.
- Test it with a throwaway account: sign up, confirm, sign in, then Settings, Account, Delete account. A wrong password should change nothing. The right one should show "Account deleted" and the user should disappear from the Users list.

## 5. Make the password reset email show a code

Needed for "Forgot password?" in the app ([0013](decisions/0013-password-recovery-by-emailed-code.md)). The player types the code from the email into the app, so the email must contain it.

First check that you can edit the template. Dashboard: Authentication, Emails, Templates, "Reset password". Since 2026-06-03, new Free-plan projects that use Supabase's built-in sender cannot edit email templates ("existing projects keep theirs"). If the template is locked or will not save, stop and tell Claude Code. The options are then your own email sender (section 3, pulled forward) or a link-based reset (a bigger change).

If you can edit it:
1. Set the subject to `Your HoopLog password reset code`.
2. Replace the message body with the text below. Do not keep the `{{ .ConfirmationURL }}` link: a mail scanner that opens the link would use up the code.

   ```html
   <h2>Reset your HoopLog password</h2>
   <p>Type this code in the app:</p>
   <p style="font-size: 24px; letter-spacing: 4px"><strong>{{ .Token }}</strong></p>
   <p>The code works for a short time. If you did not ask for it, ignore this email.</p>
   ```

3. Save. Change nothing else.

Good to know:
- The code has 6 digits by default. The app accepts 6 to 10 digits, in case that is ever changed. How long it works is the "Email OTP Expiration" setting (Authentication, Sign In / Providers, Email).
- Supabase sends one reset email per address every 60 seconds. The built-in sender allows only about 2 emails an hour and mails only your project team, so test with an address of yours that is on the team, and do not try many times in a row.
- To test: sign out, tap "Forgot password?", type your address, tap "Send code", read the email, type the code and a new password. You should end up signed in with a "Your password was changed" notice. Then sign out and sign in with the new password.

## 6. Still waiting for your decision

- The cloud tables designed in [0009](decisions/0009-cloud-schema.md) are five migration files in `supabase/migrations/`. They are not applied. Nothing in the app needs them until sync (M4), so applying them can wait.
- Before real players: a contact address for deletion requests made without the app (Google Play asks for one). Tell Claude Code which address to publish on `delete-account/`; it will not invent one.

## Where each address is used

| Address | Used for |
|---|---|
| `https://datnguyenpt.github.io/hooplog/` | Supabase Site URL; shows the same messages as `confirm/` |
| `https://datnguyenpt.github.io/hooplog/confirm/` | Where the confirmation email ends; on the Redirect URLs list |
| `https://datnguyenpt.github.io/hooplog/delete-account/` | How to delete an account; the address for Google Play's account-deletion question |
| `https://datnguyenpt.github.io/hooplog/account-deleted/` | Nothing links to it yet; reserved for a deletion confirmed by email |
