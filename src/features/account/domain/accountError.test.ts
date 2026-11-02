import { AccountError, accountErrorKey } from './accountError';

describe('accountErrorKey', () => {
  it.each([
    ['invalid_credentials', 'invalidCredentials'],
    ['email_not_confirmed', 'emailNotConfirmed'],
    ['weak_password', 'weakPassword'],
    ['email_address_invalid', 'emailInvalid'],
    ['over_email_send_rate_limit', 'emailRateLimit'],
    ['over_request_rate_limit', 'tooManyRequests'],
    ['signup_disabled', 'signUpDisabled'],
    ['bad_jwt', 'sessionExpired'],
    ['request_timeout', 'network'],
  ])('maps the server code %s to %s', (code, key) => {
    expect(accountErrorKey({ code, status: 400 })).toBe(key);
  });

  it('does not say whether an email already has an account', () => {
    expect(accountErrorKey({ code: 'user_already_exists', status: 422 })).toBe('cannotCreate');
    expect(accountErrorKey({ code: 'email_exists', status: 422 })).toBe('cannotCreate');
  });

  it('treats a request that never got an answer as a network problem', () => {
    expect(accountErrorKey({ name: 'AuthRetryableFetchError', status: 0 })).toBe('network');
    expect(accountErrorKey({ name: 'FunctionsFetchError' })).toBe('network');
  });

  it('falls back on the status when there is no known code', () => {
    expect(accountErrorKey({ status: 429 })).toBe('tooManyRequests');
    expect(accountErrorKey({ status: 401 })).toBe('sessionExpired');
    expect(accountErrorKey({ name: 'FunctionsHttpError', status: 404 })).toBe('notAvailable');
  });

  it('prefers a known code over the status', () => {
    expect(accountErrorKey({ code: 'invalid_credentials', status: 401 })).toBe(
      'invalidCredentials',
    );
  });

  it('gives "unknown" for anything else, including codes that match object internals', () => {
    expect(accountErrorKey({})).toBe('unknown');
    expect(accountErrorKey({ code: 'something_new', status: 500 })).toBe('unknown');
    expect(accountErrorKey({ code: 'constructor' })).toBe('unknown');
    expect(accountErrorKey({ code: '__proto__' })).toBe('unknown');
  });
});

describe('AccountError', () => {
  it('carries the key and the original failure', () => {
    const cause = new Error('boom');
    const error = new AccountError('network', { cause });
    expect(error).toBeInstanceOf(Error);
    expect(error.key).toBe('network');
    expect(error.cause).toBe(cause);
  });
});
