# 0013: Password recovery by an emailed code, and change password

Status: proposed (M1 slice 7, 2026-11-03; the owner approved the slice plan the same day). Waiting for the owner's review of this ADR.

## Context

[ADR 0012](0012-site-pages-and-account-deletion.md) left password reset out on purpose. The cost is real: a player who forgets the password can neither sign in nor delete the account, and a signed-in player cannot change it either.

Supabase's standard reset email carries a link. A link needs a web page that can set the password (our site is static, so it would need script code that handles the token), a new Redirect URL in the dashboard, and it can be used up by a mail scanner that opens links before the player does ("Token has expired or is invalid"; Supabase's own docs warn about this). The same email can instead carry a short code, `{{ .Token }}`, 6 digits by default, which the player types into the app.

## Decision

- **Forgot password?** is a link under the sign-in form. It opens one flow: the player types the email, the app asks Supabase to send a code (`resetPasswordForEmail`), then one form takes the code, the new password and its confirmation.
- The form submits **in one repository call**, `completeRecovery`: `verifyOtp({ email, token, type: 'recovery' })`, then `updateUser({ password })`. A good code makes Supabase start a session, so the Account screen would switch to the signed-in view while the player is still typing; the form is therefore owned by the screen, not by the signed-out view, and stays on screen until the call is finished.
- The password rules, the show/hide toggle and the live rule list are the ones sign-up uses. The code field accepts 6 to 10 digits (spaces are ignored), because Supabase lets the owner change the code length and the app should not break when that happens.
- The message after "Send code" is the same whether or not the address has an account ("If that address has an account, a code is on its way"), like sign-up. A "Send a new code" button waits 60 seconds, which is the least Supabase accepts between two requests for one user.
- If the code is wrong or has expired, nothing changes and the player corrects the code. If Supabase answers that the new password equals the old one, the player is signed in with exactly the password they typed, so the app treats it as done.
- **Change password** is a button in the signed-in panel (Settings, Account). It follows the delete flow: the player types the current password (checked with `signInWithPassword`), then the new one and its confirmation, then `updateUser({ password })`. Nothing is added to the server.
- Failures use the existing `AccountError` keys, plus `invalidCode` (`otp_expired` and the other wrong-code answers) and `samePassword`.

## Trade-offs

- **Code or link.** The code needs no page, no deep link and no token handling, cannot be used up by a mail scanner, and works the same on iOS later. It costs the owner one dashboard edit (the Reset Password email template must show `{{ .Token }}`, and should not also contain the link) and the player types six digits by hand.
- **One call or two steps.** One call (code, password and confirmation together) is simple and leaves nothing half done. The cost: a wrong code is only found when the form is sent, and if saving the password fails after the code was accepted (a network drop, a server password rule) the code is already used, so the player asks for a new one. The app signs out locally in that case, so nobody is left signed in without having set a password. Only if the network is also gone does that sign-out fail; then the player stays signed in until they sign out and ask for a new code. Two steps would be friendlier but need state that survives the screen switching to "signed in".
- **Current password by sign-in or `current_password`.** The sign-in check is already written and tested for deleting an account, and it also leaves a fresh session, so Supabase's "secure password change" setting (if the owner turns it on) does not get in the way. The `current_password` option of `updateUser` is not described on Supabase's reference page, so the app does not rely on it.
- **Rate limits.** Supabase limits how often one client can try codes (`over_request_rate_limit`); the app only shows "try again later".

## Open risk: the email template may be locked

Since 2026-06-03, new Free-plan projects that use Supabase's built-in email sender cannot edit the email templates ("existing projects keep theirs", Supabase changelog). If the owner's dashboard shows the Reset Password template as locked, the code cannot be added and this flow would send an email with only a link. Then the options are: set up the custom email sender now (an M1.5 item pulled forward; it also lifts the 2-emails-an-hour limit), or build link-based recovery (a page on the site plus a Redirect URL entry; a new ADR). The app code and its tests stay the same for the first option. The owner checks this first; see [SUPABASE_AUTH_SETUP.md](../SUPABASE_AUTH_SETUP.md).

## Consequences

- A forgotten password no longer blocks sign-in or deleting an account.
- Nothing is verified on the live project until the owner has edited the template and tried one real email. The built-in sender mails only the project team and only about 2 emails an hour, which also limits testing.
- Not built (see the ROADMAP): changing the account's email, deleting through an email link, the server-side password check, the custom sender.
