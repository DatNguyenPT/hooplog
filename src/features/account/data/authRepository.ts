import type { Session, SupabaseClient, User } from '@supabase/supabase-js';

import { getSupabase } from '@/shared/supabase/client';
import type {
  AccountUser,
  Credentials,
  PasswordChange,
  Recovery,
  SignUpOutcome,
} from '../domain/account';
import { AccountError, accountErrorKey, type FailureLike } from '../domain/accountError';
import { confirmationUrl } from '../domain/accountLinks';

/** The optional account, kept by Supabase Auth. Everything here fails with an `AccountError`. */
export interface AuthRepository {
  /** False when this build has no Supabase URL and key: accounts are then simply not offered. */
  isConfigured(): boolean;
  /** The player signed in on this phone, from the stored sign-in. Null when signed out. */
  getUser(): Promise<AccountUser | null>;
  /** Calls `listener` when the player signs in or out. Returns the way to stop listening. */
  onChange(listener: (user: AccountUser | null) => void): () => void;
  signUp(credentials: Credentials): Promise<SignUpOutcome>;
  signIn(credentials: Credentials): Promise<void>;
  /** Signs out of this phone only; other phones stay signed in. Needs a connection. */
  signOut(): Promise<void>;
  /**
   * Removes the account and everything stored with it in the cloud, then signs out here. The
   * password is asked for again first, so a stray tap on an unlocked phone cannot erase it.
   */
  deleteAccount(password: string): Promise<void>;
  /**
   * Mails a code for choosing a new password. Supabase answers the same whether or not the address
   * has an account, so this never tells. It accepts one request per address a minute.
   */
  sendRecoveryCode(email: string): Promise<void>;
  /**
   * Finishes a reset: the code from the email proves the address, then the new password is saved
   * and the player is signed in. Supabase spends the code as soon as it is right, so if saving the
   * password then fails, the sign-in the code started is dropped again and a new code is needed.
   */
  completeRecovery(recovery: Recovery): Promise<void>;
  /** Changes the password of the signed-in player. The current one is asked for again first. */
  changePassword(change: PasswordChange): Promise<void>;
}

/**
 * Supabase stamps the moment the player followed the link in the confirmation email. An account
 * without that stamp has not shown that the address is theirs, whatever the project allows.
 */
const isConfirmed = ({ email_confirmed_at, confirmed_at }: User): boolean =>
  Boolean(email_confirmed_at ?? confirmed_at);

const toUser = ({ id, email }: User): AccountUser => ({ id, email: email ?? null });

/** Who a session stands for. Nobody when there is no session or its email is not confirmed. */
const userOf = (session: Session | null): AccountUser | null =>
  session && isConfirmed(session.user) ? toUser(session.user) : null;

const failure = (error: FailureLike) => new AccountError(accountErrorKey(error), { cause: error });

/** Checking the password again before a change or a deletion: "email and password do not match" is a wrong password. */
function passwordFailure(error: FailureLike): AccountError {
  const key = accountErrorKey(error);
  return new AccountError(key === 'invalidCredentials' ? 'wrongPassword' : key, { cause: error });
}

/** A function that answered with an error carries the HTTP response; the status is read off it. */
function functionFailure(error: { name: string; context?: unknown }): AccountError {
  const status = (error.context as { status?: unknown } | undefined)?.status;
  return failure({ name: error.name, status: typeof status === 'number' ? status : undefined });
}

/** Ends the sign-in kept on this phone. */
async function dropSession(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) throw failure(error);
}

/**
 * Signs in again with the password the player typed, which proves it is theirs. The email comes
 * from the stored sign-in, so with none (or an unconfirmed one) the player has to sign in first.
 */
async function proveCurrentPassword(supabase: SupabaseClient, password: string): Promise<void> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw failure(error);
  const email = userOf(data.session)?.email;
  if (!email) throw new AccountError('sessionExpired');
  const proof = await supabase.auth.signInWithPassword({ email, password });
  if (proof.error) throw passwordFailure(proof.error);
}

/**
 * `siteUrl` is where the HoopLog pages live (see `accountLinks`); without one, the public site.
 * The confirmation email sends the player to its confirm page, so Supabase must allow that address.
 */
export function createAuthRepository(
  getClient: () => SupabaseClient | null,
  siteUrl?: string,
): AuthRepository {
  const emailRedirectTo = confirmationUrl(siteUrl);

  const client = (): SupabaseClient => {
    const supabase = getClient();
    if (!supabase) throw new AccountError('notConfigured');
    return supabase;
  };

  return {
    isConfigured: () => getClient() !== null,

    async getUser() {
      const { data, error } = await client().auth.getSession();
      if (error) throw failure(error);
      return userOf(data.session);
    },

    onChange(listener) {
      const supabase = getClient();
      if (!supabase) return () => {};
      // Supabase asks for a plain, quick callback here: no awaiting other Supabase calls inside it.
      const { data } = supabase.auth.onAuthStateChange((_event, session) =>
        listener(userOf(session)),
      );
      return () => data.subscription.unsubscribe();
    },

    async signUp({ email, password }) {
      const supabase = client();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo },
      });
      if (error) throw failure(error);
      // No session yet means the project wants the email confirmed first.
      if (!data.session) return 'confirmationSent';
      if (isConfirmed(data.session.user)) return 'signedIn';
      // A session for an address nobody has confirmed is not a sign-in. Failing to clear it is
      // harmless: `userOf` never lets it count, and the next sign-in replaces it.
      await dropSession(supabase).catch(() => undefined);
      return 'confirmationSent';
    },

    async signIn({ email, password }) {
      const supabase = client();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw failure(error);
      if (data.user && !isConfirmed(data.user)) {
        await dropSession(supabase).catch(() => undefined);
        throw new AccountError('emailNotConfirmed');
      }
    },

    async signOut() {
      await dropSession(client());
    },

    async deleteAccount(password) {
      const supabase = client();
      // Nothing is removed unless the password is right.
      await proveCurrentPassword(supabase, password);
      const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
      if (error) throw functionFailure(error);
      // The server has already ended the sign-in; this clears what is left on the phone.
      await dropSession(supabase);
    },

    async sendRecoveryCode(email) {
      const { error } = await client().auth.resetPasswordForEmail(email);
      if (error) throw failure(error);
    },

    async completeRecovery({ email, code, password }) {
      const supabase = client();
      // Supabase spends the code as soon as it is right, and starts a sign-in with it.
      const verified = await supabase.auth.verifyOtp({ email, token: code, type: 'recovery' });
      if (verified.error) throw failure(verified.error);
      const { error } = await supabase.auth.updateUser({ password });
      // The same password as before leaves the player signed in with exactly what they typed.
      if (error && accountErrorKey(error) !== 'samePassword') {
        // Do not leave a sign-in behind that never got a new password. If signing out fails too
        // (no connection), it stays until the player signs out and asks for a new code.
        await dropSession(supabase).catch(() => undefined);
        throw failure(error);
      }
    },

    async changePassword({ currentPassword, newPassword }) {
      const supabase = client();
      // Nothing is changed unless the current password is right.
      await proveCurrentPassword(supabase, currentPassword);
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw failure(error);
    },
  };
}

const authRepository = createAuthRepository(getSupabase, process.env.EXPO_PUBLIC_SITE_URL);

/** One shared repository: unlike the local data, it needs nothing from the database context. */
export const useAuthRepository = (): AuthRepository => authRepository;
