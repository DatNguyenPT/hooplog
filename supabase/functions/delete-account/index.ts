/**
 * delete-account: removes the signed-in player's account, and with it everything stored under it.
 *
 * Only the server may delete a user, so the app calls this function instead of doing it itself.
 * Keep `verify_jwt` at its default (on) as a first gate; the logic then checks the token again
 * with Supabase Auth, so it never relies on that gate alone.
 *
 * The sessions are ended before the account is deleted, because deleting a user does not cancel
 * the access tokens already issued to them. If deleting then fails, the player is signed out
 * everywhere and has to sign in again before trying once more.
 *
 * The secret key below can do anything to the project's data. It stays inside this function:
 * never log it, return it, or hand the client built from it to anything the caller controls.
 *
 * Deploy only when you mean to: `supabase functions deploy delete-account`.
 */
import { createClient } from '@supabase/supabase-js';

import { deleteAccount, secretKeyFrom, type Report } from './deleteAccount.ts';

const url = Deno.env.get('SUPABASE_URL');
const secretKey = secretKeyFrom(
  Deno.env.get('SUPABASE_SECRET_KEYS'),
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
);

const admin =
  url && secretKey
    ? createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;

const report: Report = (stage, details) =>
  console.error(JSON.stringify({ function: 'delete-account', stage, ...details }));

const reply = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

// No CORS headers: the app calls this from the phone, not from a web page.
Deno.serve(async (request) => {
  if (request.method !== 'POST')
    return reply({ error: 'method_not_allowed' }, 405, { Allow: 'POST' });
  if (!admin) return reply({ error: 'delete_failed' }, 500);
  const result = await deleteAccount(request.headers.get('Authorization'), admin.auth, report);
  return reply(result.body, result.status);
});
