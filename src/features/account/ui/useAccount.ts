import { useCallback, useEffect, useState } from 'react';

import { useAuthRepository } from '../data/authRepository';
import type { AccountUser } from '../domain/account';
import { AccountError, type AccountErrorKey } from '../domain/accountError';

export type AccountState =
  | { status: 'loading' }
  | { status: 'error'; key: AccountErrorKey }
  | { status: 'ready'; user: AccountUser | null };

/**
 * Who is signed in on this phone. It follows sign-ins and sign-outs as they happen, including
 * ones Supabase makes by itself, such as when a stored sign-in can no longer be renewed.
 *
 * `deleted` is true from the moment the player deletes their account until someone signs in
 * again, so the sign-in form that follows can say the account is gone.
 */
export function useAccount(): {
  state: AccountState;
  reload: () => void;
  deleted: boolean;
  markDeleted: () => void;
} {
  const auth = useAuthRepository();
  const [state, setState] = useState<AccountState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [deleted, setDeleted] = useState(false);

  useEffect(() => {
    let active = true;
    const show = (next: AccountState) => {
      if (!active) return;
      setState(next);
      if (next.status === 'ready' && next.user) setDeleted(false);
    };
    auth
      .getUser()
      .then((user) => show({ status: 'ready', user }))
      .catch((error: unknown) =>
        show({ status: 'error', key: error instanceof AccountError ? error.key : 'unknown' }),
      );
    const stop = auth.onChange((user) => show({ status: 'ready', user }));
    return () => {
      active = false;
      stop();
    };
    // `attempt` starts the load again when the player taps "Try again".
  }, [auth, attempt]);

  const reload = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  const markDeleted = useCallback(() => setDeleted(true), []);

  return { state, reload, deleted, markDeleted };
}
