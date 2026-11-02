/** Why an account action failed, in terms the screen has a message for. */
export type AccountErrorKey =
  | 'invalidCredentials'
  | 'emailNotConfirmed'
  | 'cannotCreate'
  | 'weakPassword'
  | 'emailInvalid'
  | 'emailRateLimit'
  | 'tooManyRequests'
  | 'signUpDisabled'
  | 'sessionExpired'
  | 'network'
  | 'notConfigured'
  | 'notAvailable'
  | 'unknown';

/** The parts of a Supabase error the mapping looks at. */
export type FailureLike = { code?: string; status?: number; name?: string };

// Sign-up never says whether an email already has an account, so neither do the messages.
const BY_CODE = new Map<string, AccountErrorKey>([
  ['invalid_credentials', 'invalidCredentials'],
  ['email_not_confirmed', 'emailNotConfirmed'],
  ['user_already_exists', 'cannotCreate'],
  ['email_exists', 'cannotCreate'],
  ['weak_password', 'weakPassword'],
  ['email_address_invalid', 'emailInvalid'],
  ['over_email_send_rate_limit', 'emailRateLimit'],
  ['over_request_rate_limit', 'tooManyRequests'],
  ['signup_disabled', 'signUpDisabled'],
  ['bad_jwt', 'sessionExpired'],
  ['session_expired', 'sessionExpired'],
  ['session_not_found', 'sessionExpired'],
  ['request_timeout', 'network'],
]);

// Supabase's clients report a request that never got an answer under these names.
const NETWORK_ERRORS = new Set(['AuthRetryableFetchError', 'FunctionsFetchError']);

export function accountErrorKey({ code, status, name }: FailureLike): AccountErrorKey {
  const byCode = code === undefined ? undefined : BY_CODE.get(code);
  if (byCode) return byCode;
  if (name && NETWORK_ERRORS.has(name)) return 'network';
  if (status === 429) return 'tooManyRequests';
  if (status === 401) return 'sessionExpired';
  // A cloud function that has not been deployed yet answers "not found".
  if (status === 404) return 'notAvailable';
  return 'unknown';
}

/** Thrown by the account repository; `key` picks the message shown to the player. */
export class AccountError extends Error {
  readonly key: AccountErrorKey;

  constructor(key: AccountErrorKey, options?: { cause?: unknown }) {
    super(key, options);
    this.name = 'AccountError';
    this.key = key;
  }
}
