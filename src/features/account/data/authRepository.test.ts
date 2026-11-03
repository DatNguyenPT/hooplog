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
  resetPasswordForEmail: jest.fn(),
  verifyOtp: jest.fn(),
  updateUser: jest.fn(),
};
const functions = { invoke: jest.fn() };
const repo = createAuthRepository(() => ({ auth, functions }) as unknown as SupabaseClient);

const credentials = { email: 'dat@example.com', password: 'correct horse' };
const user = {
  id: 'u1',
  email: 'dat@example.com',
  email_confirmed_at: '2026-11-02T08:00:00Z',
  app_metadata: {},
  user_metadata: {},
};
// An account whose confirmation link nobody has followed yet.
const unconfirmed = { ...user, email_confirmed_at: undefined };

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

  it('does not count a stored sign-in whose email was never confirmed', async () => {
    auth.getSession.mockResolvedValue({ data: { session: { user: unconfirmed } }, error: null });
    await expect(repo.getUser()).resolves.toBeNull();
  });

  it('accepts the older confirmation field too', async () => {
    const older = { ...unconfirmed, confirmed_at: '2026-11-02T08:00:00Z' };
    auth.getSession.mockResolvedValue({ data: { session: { user: older } }, error: null });
    await expect(repo.getUser()).resolves.toEqual({ id: 'u1', email: 'dat@example.com' });
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

  it('reports a sign-in with an unconfirmed email as nobody being signed in', () => {
    let emit!: (event: string, session: unknown) => void;
    auth.onAuthStateChange.mockImplementation((callback) => {
      emit = callback;
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    });
    const listener = jest.fn();

    repo.onChange(listener);
    emit('SIGNED_IN', { user: unconfirmed });
    expect(listener.mock.calls).toEqual([[null]]);
  });
});

describe('signUp', () => {
  it('says the confirmation email was sent when there is no session yet', async () => {
    auth.signUp.mockResolvedValue({ data: { user, session: null }, error: null });
    await expect(repo.signUp(credentials)).resolves.toBe('confirmationSent');
  });

  it('asks for the confirmation link to land on the confirm page of the site', async () => {
    auth.signUp.mockResolvedValue({ data: { user, session: null }, error: null });
    await repo.signUp(credentials);
    expect(auth.signUp).toHaveBeenCalledWith({
      ...credentials,
      options: { emailRedirectTo: 'https://datnguyenpt.github.io/hooplog/confirm/' },
    });
  });

  it('sends the link to another site when the build is set up for one', async () => {
    const elsewhere = createAuthRepository(
      () => ({ auth, functions }) as unknown as SupabaseClient,
      'https://hooplog.example',
    );
    auth.signUp.mockResolvedValue({ data: { user, session: null }, error: null });
    await elsewhere.signUp(credentials);
    expect(auth.signUp).toHaveBeenCalledWith({
      ...credentials,
      options: { emailRedirectTo: 'https://hooplog.example/confirm/' },
    });
  });

  it('says the player is signed in when the project does not ask for confirmation', async () => {
    auth.signUp.mockResolvedValue({ data: { user, session: { user } }, error: null });
    await expect(repo.signUp(credentials)).resolves.toBe('signedIn');
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('does not sign in an address nobody has confirmed, even when the project hands out a session', async () => {
    auth.signUp.mockResolvedValue({
      data: { user: unconfirmed, session: { user: unconfirmed } },
      error: null,
    });
    await expect(repo.signUp(credentials)).resolves.toBe('confirmationSent');
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('still asks for the confirmation when clearing that session fails', async () => {
    auth.signUp.mockResolvedValue({
      data: { user: unconfirmed, session: { user: unconfirmed } },
      error: null,
    });
    auth.signOut.mockResolvedValue({ error: { name: 'AuthRetryableFetchError', status: 0 } });
    await expect(repo.signUp(credentials)).resolves.toBe('confirmationSent');
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
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('fails with the reason the server gave', async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { name: 'AuthApiError', code: 'invalid_credentials', status: 400 },
    });
    expect((await rejection(repo.signIn(credentials))).key).toBe('invalidCredentials');
  });

  it('refuses an account whose email was never confirmed, and signs out again', async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { user: unconfirmed, session: { user: unconfirmed } },
      error: null,
    });
    expect((await rejection(repo.signIn(credentials))).key).toBe('emailNotConfirmed');
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('still says the email is unconfirmed when signing out again fails', async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { user: unconfirmed, session: { user: unconfirmed } },
      error: null,
    });
    auth.signOut.mockResolvedValue({ error: { name: 'AuthRetryableFetchError', status: 0 } });
    expect((await rejection(repo.signIn(credentials))).key).toBe('emailNotConfirmed');
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
  beforeEach(() => {
    auth.getSession.mockResolvedValue({ data: { session: { user } }, error: null });
    auth.signInWithPassword.mockResolvedValue({ data: { user, session: {} }, error: null });
    functions.invoke.mockResolvedValue({ data: { deleted: true }, error: null });
  });

  it('checks the password, asks the cloud function to remove the account, then signs out here', async () => {
    await repo.deleteAccount('correct horse');
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'dat@example.com',
      password: 'correct horse',
    });
    expect(functions.invoke).toHaveBeenCalledWith('delete-account', { method: 'POST' });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('removes nothing, and stays signed in, when the password is wrong', async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { name: 'AuthApiError', code: 'invalid_credentials', status: 400 },
    });
    expect((await rejection(repo.deleteAccount('nope'))).key).toBe('wrongPassword');
    expect(functions.invoke).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('removes nothing when the password cannot be checked', async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { name: 'AuthRetryableFetchError', status: 0 },
    });
    expect((await rejection(repo.deleteAccount('correct horse'))).key).toBe('network');
    expect(functions.invoke).not.toHaveBeenCalled();
  });

  it('asks for a new sign-in when this phone has none, without checking anything', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    expect((await rejection(repo.deleteAccount('correct horse'))).key).toBe('sessionExpired');
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
    expect(functions.invoke).not.toHaveBeenCalled();
  });

  it('does not delete on the strength of a sign-in whose email was never confirmed', async () => {
    auth.getSession.mockResolvedValue({ data: { session: { user: unconfirmed } }, error: null });
    expect((await rejection(repo.deleteAccount('correct horse'))).key).toBe('sessionExpired');
    expect(functions.invoke).not.toHaveBeenCalled();
  });

  it('fails when the stored sign-in cannot be read', async () => {
    auth.getSession.mockResolvedValue({
      data: { session: null },
      error: { name: 'AuthRetryableFetchError', status: 0 },
    });
    expect((await rejection(repo.deleteAccount('correct horse'))).key).toBe('network');
    expect(functions.invoke).not.toHaveBeenCalled();
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
      expect((await rejection(repo.deleteAccount('correct horse'))).key).toBe(key);
      expect(auth.signOut).not.toHaveBeenCalled();
    },
  );
});

describe('sendRecoveryCode', () => {
  it('asks Supabase to mail a code to the address', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    await expect(repo.sendRecoveryCode('dat@example.com')).resolves.toBeUndefined();
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('dat@example.com');
  });

  it.each([
    [{ name: 'AuthApiError', code: 'over_email_send_rate_limit', status: 429 }, 'emailRateLimit'],
    [{ name: 'AuthApiError', code: 'over_request_rate_limit', status: 429 }, 'tooManyRequests'],
    [{ name: 'AuthApiError', code: 'email_address_invalid', status: 400 }, 'emailInvalid'],
    [{ name: 'AuthRetryableFetchError', status: 0 }, 'network'],
  ])('fails with the reason when Supabase answers %j', async (error, key) => {
    auth.resetPasswordForEmail.mockResolvedValue({ data: null, error });
    expect((await rejection(repo.sendRecoveryCode('dat@example.com'))).key).toBe(key);
  });
});

describe('completeRecovery', () => {
  const recovery = { email: 'dat@example.com', code: '123456', password: 'new password 1' };

  beforeEach(() => {
    auth.verifyOtp.mockResolvedValue({ data: { user, session: { user } }, error: null });
    auth.updateUser.mockResolvedValue({ data: { user }, error: null });
  });

  it('checks the code, then saves the new password and leaves the player signed in', async () => {
    await expect(repo.completeRecovery(recovery)).resolves.toBeUndefined();
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      email: 'dat@example.com',
      token: '123456',
      type: 'recovery',
    });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'new password 1' });
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('saves nothing, and signs nobody in, when the code is wrong or has expired', async () => {
    auth.verifyOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: { name: 'AuthApiError', code: 'otp_expired', status: 403 },
    });
    expect((await rejection(repo.completeRecovery(recovery))).key).toBe('invalidCode');
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('saves nothing when the code cannot be checked', async () => {
    auth.verifyOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: { name: 'AuthRetryableFetchError', status: 0 },
    });
    expect((await rejection(repo.completeRecovery(recovery))).key).toBe('network');
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('counts the old password typed again as done: the player is signed in with it', async () => {
    auth.updateUser.mockResolvedValue({
      data: { user: null },
      error: { name: 'AuthApiError', code: 'same_password', status: 422 },
    });
    await expect(repo.completeRecovery(recovery)).resolves.toBeUndefined();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it.each([
    [{ name: 'AuthWeakPasswordError', code: 'weak_password', status: 422 }, 'weakPassword'],
    [{ name: 'AuthRetryableFetchError', status: 0 }, 'network'],
  ])(
    'signs out again when saving fails with %j, so nobody stays signed in without a new password',
    async (error, key) => {
      auth.updateUser.mockResolvedValue({ data: { user: null }, error });
      expect((await rejection(repo.completeRecovery(recovery))).key).toBe(key);
      expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    },
  );

  it('still says why saving failed when signing out again fails too', async () => {
    auth.updateUser.mockResolvedValue({
      data: { user: null },
      error: { name: 'AuthWeakPasswordError', code: 'weak_password', status: 422 },
    });
    auth.signOut.mockResolvedValue({ error: { name: 'AuthRetryableFetchError', status: 0 } });
    expect((await rejection(repo.completeRecovery(recovery))).key).toBe('weakPassword');
  });
});

describe('changePassword', () => {
  const change = { currentPassword: 'correct horse', newPassword: 'new password 1' };

  beforeEach(() => {
    auth.getSession.mockResolvedValue({ data: { session: { user } }, error: null });
    auth.signInWithPassword.mockResolvedValue({ data: { user, session: {} }, error: null });
    auth.updateUser.mockResolvedValue({ data: { user }, error: null });
  });

  it('checks the current password, then saves the new one', async () => {
    await expect(repo.changePassword(change)).resolves.toBeUndefined();
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'dat@example.com',
      password: 'correct horse',
    });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'new password 1' });
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('changes nothing, and stays signed in, when the current password is wrong', async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { name: 'AuthApiError', code: 'invalid_credentials', status: 400 },
    });
    expect((await rejection(repo.changePassword(change))).key).toBe('wrongPassword');
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('changes nothing when the current password cannot be checked', async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { name: 'AuthRetryableFetchError', status: 0 },
    });
    expect((await rejection(repo.changePassword(change))).key).toBe('network');
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('asks for a new sign-in when this phone has none, without checking anything', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    expect((await rejection(repo.changePassword(change))).key).toBe('sessionExpired');
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('changes nothing on the strength of a sign-in whose email was never confirmed', async () => {
    auth.getSession.mockResolvedValue({ data: { session: { user: unconfirmed } }, error: null });
    expect((await rejection(repo.changePassword(change))).key).toBe('sessionExpired');
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('fails when the stored sign-in cannot be read', async () => {
    auth.getSession.mockResolvedValue({
      data: { session: null },
      error: { name: 'AuthRetryableFetchError', status: 0 },
    });
    expect((await rejection(repo.changePassword(change))).key).toBe('network');
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it.each([
    [{ name: 'AuthWeakPasswordError', code: 'weak_password', status: 422 }, 'weakPassword'],
    [{ name: 'AuthApiError', code: 'same_password', status: 422 }, 'samePassword'],
    [{ name: 'AuthApiError', code: 'reauthentication_needed', status: 400 }, 'sessionExpired'],
    [{ name: 'AuthRetryableFetchError', status: 0 }, 'network'],
  ])(
    'fails with the reason when saving is answered with %j, and stays signed in',
    async (error, key) => {
      auth.updateUser.mockResolvedValue({ data: { user: null }, error });
      expect((await rejection(repo.changePassword(change))).key).toBe(key);
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
