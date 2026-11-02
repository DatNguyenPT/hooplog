import type { SupabaseClient } from '@supabase/supabase-js';

import { AccountError } from '../domain/accountError';
import { createAuthRepository } from './authRepository';

// The real client needs the app's storage and environment; these tests fake the few calls used.
jest.mock('@/shared/supabase/client', () => ({ getSupabase: jest.fn() }));

const auth = {
  getSession: jest.fn(),
  onAuthStateChange: jest.fn(),
  signUp: jest.fn(),
  signInWithPassword: jest.fn(),
  signOut: jest.fn(),
};
const functions = { invoke: jest.fn() };
const repo = createAuthRepository(() => ({ auth, functions }) as unknown as SupabaseClient);

const credentials = { email: 'dat@example.com', password: 'correct horse' };
const user = { id: 'u1', email: 'dat@example.com', app_metadata: {}, user_metadata: {} };

beforeEach(() => {
  jest.resetAllMocks();
  auth.signOut.mockResolvedValue({ error: null });
});

/** What the promise rejected with, so a test can look at its key. */
const rejection = async (promise: Promise<unknown>): Promise<AccountError> => {
  try {
    await promise;
  } catch (error) {
    return error as AccountError;
  }
  throw new Error('expected the call to fail');
};

describe('getUser', () => {
  it('returns the player from the stored sign-in', async () => {
    auth.getSession.mockResolvedValue({ data: { session: { user } }, error: null });
    await expect(repo.getUser()).resolves.toEqual({ id: 'u1', email: 'dat@example.com' });
  });

  it('returns null when nobody is signed in', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(repo.getUser()).resolves.toBeNull();
  });

  it('keeps a missing email as null', async () => {
    auth.getSession.mockResolvedValue({
      data: { session: { user: { ...user, email: undefined } } },
      error: null,
    });
    await expect(repo.getUser()).resolves.toEqual({ id: 'u1', email: null });
  });

  it('fails with the reason when the stored sign-in cannot be read', async () => {
    auth.getSession.mockResolvedValue({
      data: { session: null },
      error: { name: 'AuthRetryableFetchError', status: 0 },
    });
    expect((await rejection(repo.getUser())).key).toBe('network');
  });
});

describe('onChange', () => {
  it('reports each sign-in and sign-out, then stops when asked', () => {
    const unsubscribe = jest.fn();
    let emit!: (event: string, session: unknown) => void;
    auth.onAuthStateChange.mockImplementation((callback) => {
      emit = callback;
      return { data: { subscription: { unsubscribe } } };
    });
    const listener = jest.fn();

    const stop = repo.onChange(listener);
    emit('SIGNED_IN', { user });
    emit('SIGNED_OUT', null);
    expect(listener.mock.calls).toEqual([[{ id: 'u1', email: 'dat@example.com' }], [null]]);

    stop();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe('signUp', () => {
  it('says the confirmation email was sent when there is no session yet', async () => {
    auth.signUp.mockResolvedValue({ data: { user, session: null }, error: null });
    await expect(repo.signUp(credentials)).resolves.toBe('confirmationSent');
    expect(auth.signUp).toHaveBeenCalledWith(credentials);
  });

  it('says the player is signed in when the project does not ask for confirmation', async () => {
    auth.signUp.mockResolvedValue({ data: { user, session: { user } }, error: null });
    await expect(repo.signUp(credentials)).resolves.toBe('signedIn');
  });

  it('fails with the reason the server gave', async () => {
    auth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { name: 'AuthWeakPasswordError', code: 'weak_password', status: 422 },
    });
    expect((await rejection(repo.signUp(credentials))).key).toBe('weakPassword');
  });
});

describe('signIn', () => {
  it('signs in with the email and password', async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { user, session: {} }, error: null });
    await expect(repo.signIn(credentials)).resolves.toBeUndefined();
    expect(auth.signInWithPassword).toHaveBeenCalledWith(credentials);
  });

  it('fails with the reason the server gave', async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { name: 'AuthApiError', code: 'invalid_credentials', status: 400 },
    });
    expect((await rejection(repo.signIn(credentials))).key).toBe('invalidCredentials');
  });
});

describe('signOut', () => {
  it('signs out of this phone only', async () => {
    await repo.signOut();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('fails when the server cannot be reached, so the player knows they are still signed in', async () => {
    auth.signOut.mockResolvedValue({ error: { name: 'AuthRetryableFetchError', status: 0 } });
    expect((await rejection(repo.signOut())).key).toBe('network');
  });
});

describe('deleteAccount', () => {
  it('asks the cloud function to remove the account, then signs out here', async () => {
    functions.invoke.mockResolvedValue({ data: { deleted: true }, error: null });
    await repo.deleteAccount();
    expect(functions.invoke).toHaveBeenCalledWith('delete-account', { method: 'POST' });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it.each([
    [{ name: 'FunctionsHttpError', context: { status: 404 } }, 'notAvailable'],
    [{ name: 'FunctionsHttpError', context: { status: 401 } }, 'sessionExpired'],
    [{ name: 'FunctionsHttpError', context: { status: 500 } }, 'unknown'],
    [{ name: 'FunctionsHttpError' }, 'unknown'],
    [{ name: 'FunctionsFetchError', context: new TypeError('Network request failed') }, 'network'],
  ])(
    'fails with the reason when the function answers %j, and stays signed in',
    async (error, key) => {
      functions.invoke.mockResolvedValue({ data: null, error });
      expect((await rejection(repo.deleteAccount())).key).toBe(key);
      expect(auth.signOut).not.toHaveBeenCalled();
    },
  );
});

describe('when this build has no Supabase project', () => {
  const offline = createAuthRepository(() => null);

  it('says so, and does nothing else', async () => {
    expect(offline.isConfigured()).toBe(false);
    expect((await rejection(offline.getUser())).key).toBe('notConfigured');
    expect((await rejection(offline.signIn(credentials))).key).toBe('notConfigured');
    expect(offline.onChange(jest.fn())).toEqual(expect.any(Function));
  });

  it('is configured as soon as there is a client', () => {
    expect(repo.isConfigured()).toBe(true);
  });
});
