import {
  bearerToken,
  deleteAccount,
  describeError,
  secretKeyFrom,
  type AdminAuth,
} from './deleteAccount.ts';

const USER_ID = '8c1e0f2a-6a52-4d0e-9b57-2b8e9b6d1c11';
const TOKEN = 'header.payload.signature';
const HEADER = `Bearer ${TOKEN}`;

const getUser = jest.fn();
const signOut = jest.fn();
const deleteUser = jest.fn();
const report = jest.fn();
const auth: AdminAuth = { getUser, admin: { signOut, deleteUser } };

beforeEach(() => {
  jest.resetAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  signOut.mockResolvedValue({ data: null, error: null });
  deleteUser.mockResolvedValue({ data: { user: null }, error: null });
});

describe('bearerToken', () => {
  it('reads the token from a Bearer header, whatever the casing or padding', () => {
    expect(bearerToken(HEADER)).toBe(TOKEN);
    expect(bearerToken(`bearer   ${TOKEN}`)).toBe(TOKEN);
    expect(bearerToken(`  ${HEADER}  `)).toBe(TOKEN);
  });

  it('finds no token in anything else', () => {
    expect(bearerToken(null)).toBeNull();
    expect(bearerToken('')).toBeNull();
    expect(bearerToken('Bearer')).toBeNull();
    expect(bearerToken('Bearer a b')).toBeNull();
    expect(bearerToken('Basic abc')).toBeNull();
    expect(bearerToken(TOKEN)).toBeNull();
  });
});

describe('describeError', () => {
  it('keeps only the name, code, status and message', () => {
    const details = describeError({
      name: 'AuthApiError',
      code: 'user_not_found',
      status: 404,
      message: 'User not found',
      jwt: TOKEN,
    });
    expect(details).toEqual({
      name: 'AuthApiError',
      code: 'user_not_found',
      status: 404,
      message: 'User not found',
    });
    expect(JSON.stringify(details)).not.toContain(TOKEN);
  });

  it('drops values of the wrong type and copes with non-objects', () => {
    expect(describeError({ name: 7, code: null, status: '500', message: {} })).toEqual({});
    expect(describeError('boom')).toEqual({});
    expect(describeError(null)).toEqual({});
    expect(describeError(undefined)).toEqual({});
  });
});

describe('secretKeyFrom', () => {
  const KEYS = JSON.stringify({ default: 'sb_secret_default', other: 'sb_secret_other' });

  it('takes the default key from the keys Supabase provides', () => {
    expect(secretKeyFrom(KEYS, 'legacy')).toBe('sb_secret_default');
  });

  it('falls back to the legacy key when there is no usable default', () => {
    expect(secretKeyFrom(undefined, 'legacy')).toBe('legacy');
    expect(secretKeyFrom('', 'legacy')).toBe('legacy');
    expect(secretKeyFrom('not json', 'legacy')).toBe('legacy');
    expect(secretKeyFrom('"text"', 'legacy')).toBe('legacy');
    expect(secretKeyFrom('null', 'legacy')).toBe('legacy');
    expect(secretKeyFrom('[]', 'legacy')).toBe('legacy');
    expect(secretKeyFrom('{"other":"x"}', 'legacy')).toBe('legacy');
    expect(secretKeyFrom('{"default":""}', 'legacy')).toBe('legacy');
    expect(secretKeyFrom('{"default":7}', 'legacy')).toBe('legacy');
  });

  it('finds no key when neither is set', () => {
    expect(secretKeyFrom(undefined, undefined)).toBeNull();
    expect(secretKeyFrom('{}', '')).toBeNull();
  });
});

describe('deleteAccount', () => {
  it('ends every session, then deletes the account the token belongs to', async () => {
    const reply = await deleteAccount(HEADER, auth, report);

    expect(reply).toEqual({ status: 200, body: { deleted: true } });
    expect(getUser).toHaveBeenCalledWith(TOKEN);
    expect(signOut).toHaveBeenCalledWith(TOKEN);
    expect(deleteUser).toHaveBeenCalledWith(USER_ID);
    expect(deleteUser).toHaveBeenCalledTimes(1);
    // The token is checked first and the sessions are ended before the account goes.
    const order = (mock: jest.Mock) => mock.mock.invocationCallOrder[0];
    expect(order(getUser)).toBeLessThan(order(signOut));
    expect(order(signOut)).toBeLessThan(order(deleteUser));
    expect(report).not.toHaveBeenCalled();
  });

  it.each([
    ['no Authorization header', null],
    ['an empty one', ''],
    ['one that is not a Bearer token', 'Basic abc'],
  ])('refuses %s and touches nothing', async (_name, header) => {
    expect(await deleteAccount(header, auth, report)).toEqual({
      status: 401,
      body: { error: 'unauthorized' },
    });
    expect(getUser).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
  });

  it.each([400, 401, 403, 404])('refuses a token Supabase rejects with %i', async (status) => {
    getUser.mockResolvedValue({ data: { user: null }, error: { name: 'AuthApiError', status } });

    expect(await deleteAccount(HEADER, auth, report)).toEqual({
      status: 401,
      body: { error: 'unauthorized' },
    });
    expect(signOut).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
  });

  it('refuses a token that belongs to nobody', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    expect((await deleteAccount(HEADER, auth, report)).status).toBe(401);
    expect(signOut).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('fails, and deletes nothing, when Supabase cannot say who the token belongs to', async () => {
    const error = { name: 'AuthRetryableFetchError', status: 0, message: 'fetch failed' };
    getUser.mockResolvedValue({ data: { user: null }, error });

    expect(await deleteAccount(HEADER, auth, report)).toEqual({
      status: 500,
      body: { error: 'delete_failed' },
    });
    expect(signOut).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledWith('getUser', {
      name: 'AuthRetryableFetchError',
      status: 0,
      message: 'fetch failed',
    });
  });

  it('fails, and deletes nothing, when the sessions cannot be ended', async () => {
    signOut.mockResolvedValue({ data: null, error: { name: 'AuthApiError', status: 500 } });

    expect(await deleteAccount(HEADER, auth, report)).toEqual({
      status: 500,
      body: { error: 'delete_failed' },
    });
    expect(deleteUser).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledWith('signOut', { name: 'AuthApiError', status: 500 });
  });

  it('fails when the account cannot be deleted', async () => {
    deleteUser.mockResolvedValue({
      data: { user: null },
      error: { name: 'AuthApiError', code: 'unexpected_failure', status: 500 },
    });

    expect(await deleteAccount(HEADER, auth, report)).toEqual({
      status: 500,
      body: { error: 'delete_failed' },
    });
    expect(report).toHaveBeenCalledWith('deleteUser', {
      name: 'AuthApiError',
      code: 'unexpected_failure',
      status: 500,
    });
  });

  it('fails, naming the step, when a call throws', async () => {
    getUser.mockRejectedValue(new TypeError('network down'));
    expect((await deleteAccount(HEADER, auth, report)).status).toBe(500);
    expect(report).toHaveBeenLastCalledWith('getUser', {
      name: 'TypeError',
      message: 'network down',
    });

    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    signOut.mockRejectedValue(new Error('gone'));
    expect((await deleteAccount(HEADER, auth, report)).status).toBe(500);
    expect(report).toHaveBeenLastCalledWith('signOut', { name: 'Error', message: 'gone' });
    expect(deleteUser).not.toHaveBeenCalled();

    signOut.mockResolvedValue({ data: null, error: null });
    deleteUser.mockRejectedValue(new Error('locked'));
    expect((await deleteAccount(HEADER, auth, report)).status).toBe(500);
    expect(report).toHaveBeenLastCalledWith('deleteUser', { name: 'Error', message: 'locked' });
  });

  it('never puts the token in what it reports or replies', async () => {
    const leaky = { name: 'AuthApiError', status: 500, message: 'boom', jwt: TOKEN };
    signOut.mockResolvedValue({ data: null, error: leaky });

    const reply = await deleteAccount(HEADER, auth, report);

    expect(JSON.stringify(reply)).not.toContain(TOKEN);
    expect(JSON.stringify(report.mock.calls)).not.toContain(TOKEN);
  });

  it('works without a reporter', async () => {
    deleteUser.mockResolvedValue({ data: { user: null }, error: { status: 500 } });
    expect((await deleteAccount(HEADER, auth)).status).toBe(500);
  });
});
