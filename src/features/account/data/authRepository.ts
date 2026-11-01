import type { SupabaseClient, User } from '@supabase/supabase-js';

import { getSupabase } from '@/shared/supabase/client';
import type { AccountUser, Credentials, SignUpOutcome } from '../domain/account';
import { AccountError, accountErrorKey, type FailureLike } from '../domain/accountError';

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
  /** Removes the account and everything stored with it in the cloud, then signs out here. */
  deleteAccount(): Promise<void>;
}

const toUser = ({ id, email }: User): AccountUser => ({ id, email: email ?? null });

const failure = (error: FailureLike) => new AccountError(accountErrorKey(error), { cause: error });

/** A function that answered with an error carries the HTTP response; the status is read off it. */
function functionFailure(error: { name: string; context?: unknown }): AccountError {
  const status = (error.context as { status?: unknown } | undefined)?.status;
  return failure({ name: error.name, status: typeof status === 'number' ? status : undefined });
}

export function createAuthRepository(getClient: () => SupabaseClient | null): AuthRepository {
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
      return data.session ? toUser(data.session.user) : null;
    },

    onChange(listener) {
      const supabase = getClient();
      if (!supabase) return () => {};
      // Supabase asks for a plain, quick callback here: no awaiting other Supabase calls inside it.
      const { data } = supabase.auth.onAuthStateChange((_event, session) =>
        listener(session ? toUser(session.user) : null),
      );
      return () => data.subscription.unsubscribe();
    },

    async signUp({ email, password }) {
      const { data, error } = await client().auth.signUp({ email, password });
      if (error) throw failure(error);
      // No session yet means the project wants the email confirmed first.
      return data.session ? 'signedIn' : 'confirmationSent';
    },

    async signIn({ email, password }) {
      const { error } = await client().auth.signInWithPassword({ email, password });
      if (error) throw failure(error);
    },

    async signOut() {
      const { error } = await client().auth.signOut({ scope: 'local' });
      if (error) throw failure(error);
    },

    async deleteAccount() {
      const supabase = client();
      const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
      if (error) throw functionFailure(error);
      // The server has already ended the sign-in; this clears what is left on the phone.
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
      if (signOutError) throw failure(signOutError);
    },
  };
}

const authRepository = createAuthRepository(getSupabase);

/** One shared repository: unlike the local data, it needs nothing from the database context. */
export const useAuthRepository = (): AuthRepository => authRepository;
