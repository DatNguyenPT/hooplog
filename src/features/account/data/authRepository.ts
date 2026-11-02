import type { Session, SupabaseClient, User } from '@supabase/supabase-js';

import { getSupabase } from '@/shared/supabase/client';
import type { AccountUser, Credentials, SignUpOutcome } from '../domain/account';
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

/** Checking the password again before a deletion: "email and password do not match" is a wrong password. */
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
      const { data, error } = await supabase.auth.getSession();
      if (error) throw failure(error);
      const email = userOf(data.session)?.email;
      if (!email) throw new AccountError('sessionExpired');
      // Signing in again proves the password. Nothing is removed unless it is right.
      const proof = await supabase.auth.signInWithPassword({ email, password });
      if (proof.error) throw passwordFailure(proof.error);
      const { error: removalError } = await supabase.functions.invoke('delete-account', {
        method: 'POST',
      });
      if (removalError) throw functionFailure(removalError);
      // The server has already ended the sign-in; this clears what is left on the phone.
      await dropSession(supabase);
    },
  };
}

const authRepository = createAuthRepository(getSupabase, process.env.EXPO_PUBLIC_SITE_URL);

/** One shared repository: unlike the local data, it needs nothing from the database context. */
export const useAuthRepository = (): AuthRepository => authRepository;
