import {
  MAX_EMAIL_LENGTH,
  MAX_PASSWORD_BYTES,
  MAX_RECOVERY_CODE_LENGTH,
  MIN_PASSWORD_LENGTH,
  MIN_RECOVERY_CODE_LENGTH,
  RECOVERY_RESEND_SECONDS,
  confirmError,
  emailError,
  newPasswordError,
  normalizeRecoveryCode,
  passwordChecks,
  recoveryCodeError,
  resendWaitSeconds,
  signInPasswordError,
  validatePasswordChange,
  validateRecovery,
  validateSignIn,
  validateSignUp,
  type PasswordChangeForm,
  type RecoveryForm,
  type SignUpForm,
} from './account';

const email = 'dat@example.com';
// Exactly the minimum length, with one letter run and one digit.
const strong = `${'a'.repeat(MIN_PASSWORD_LENGTH - 1)}1`;
const signUp = (overrides: Partial<SignUpForm> = {}) =>
  validateSignUp({ email, password: strong, confirmPassword: strong, ...overrides });

describe('validateSignUp', () => {
  it('accepts a valid email and a good password typed twice, and sends on only the two', () => {
    expect(signUp()).toEqual({ ok: true, value: { email, password: strong } });
  });

  it('trims the email but leaves the password exactly as typed', () => {
    const spaced = ` ${strong} `;
    expect(
      signUp({ email: '  dat@example.com \n', password: spaced, confirmPassword: spaced }),
    ).toEqual({ ok: true, value: { email, password: spaced } });
  });

  it('asks for the email, the password and the confirmation when all are empty', () => {
    expect(signUp({ email: '   ', password: '', confirmPassword: '' })).toEqual({
      ok: false,
      errors: { email: 'required', password: 'required', confirmPassword: 'required' },
    });
  });

  it.each(['dat', 'dat@', '@example.com', 'dat@example', 'da t@example.com', 'dat@@example.com'])(
    'rejects "%s" as an email',
    (bad) => {
      expect(signUp({ email: bad })).toEqual({ ok: false, errors: { email: 'invalid' } });
    },
  );

  it('accepts an email of the longest allowed length and rejects one character more', () => {
    const domain = '@example.com';
    const longest = `${'a'.repeat(MAX_EMAIL_LENGTH - domain.length)}${domain}`;
    expect(longest).toHaveLength(MAX_EMAIL_LENGTH);
    expect(signUp({ email: longest }).ok).toBe(true);
    expect(signUp({ email: `a${longest}` })).toEqual({
      ok: false,
      errors: { email: 'invalid' },
    });
  });

  it('asks for the same password twice, exactly', () => {
    expect(signUp({ confirmPassword: `${strong}2` })).toEqual({
      ok: false,
      errors: { confirmPassword: 'mismatch' },
    });
    expect(signUp({ confirmPassword: strong.toUpperCase() })).toEqual({
      ok: false,
      errors: { confirmPassword: 'mismatch' },
    });
  });

  it('reports every problem at once', () => {
    expect(signUp({ email: 'dat', password: 'short', confirmPassword: 'other' })).toEqual({
      ok: false,
      errors: { email: 'invalid', password: 'tooShort', confirmPassword: 'mismatch' },
    });
  });
});

describe('emailError', () => {
  it('ignores spaces around the address', () => {
    expect(emailError(' dat@example.com ')).toBeUndefined();
  });

  it('tells a missing email from a malformed one', () => {
    expect(emailError('   ')).toBe('required');
    expect(emailError('dat@')).toBe('invalid');
  });
});

describe('newPasswordError', () => {
  it('accepts exactly the minimum length and rejects one character less', () => {
    expect(newPasswordError(strong)).toBeUndefined();
    expect(newPasswordError(strong.slice(1))).toBe('tooShort');
  });

  it('asks for a password before anything else, and for length before letters and numbers', () => {
    expect(newPasswordError('')).toBe('required');
    expect(newPasswordError('1')).toBe('tooShort');
  });

  it.each([
    ['12345678', 'needsLetter'],
    ['!!!!!!!!', 'needsLetter'],
    ['        ', 'needsLetter'],
    ['abcdefgh', 'needsNumber'],
    ['abc defg', 'needsNumber'],
  ])('rejects "%s": %s', (password, problem) => {
    expect(newPasswordError(password)).toBe(problem);
  });

  it.each(['élève123', 'пароль12', 'mậtkhẩu1'])(
    'counts a letter in any alphabet: %s',
    (password) => {
      expect(newPasswordError(password)).toBeUndefined();
    },
  );

  it('counts spaces as part of the password', () => {
    expect(newPasswordError(`a1${' '.repeat(MIN_PASSWORD_LENGTH - 2)}`)).toBeUndefined();
  });

  it('allows up to the byte limit and no more', () => {
    const room = MAX_PASSWORD_BYTES - 1;
    expect(newPasswordError(`${'a'.repeat(room)}1`)).toBeUndefined();
    expect(newPasswordError(`${'a'.repeat(room + 1)}1`)).toBe('tooLong');
  });

  it('counts bytes rather than characters, since accented letters and emoji take more than one', () => {
    const accent = 'é';
    const emoji = '\u{1F600}';
    const fitsAccents = `${accent.repeat((MAX_PASSWORD_BYTES - 2) / 2)}a1`;
    expect(newPasswordError(fitsAccents)).toBeUndefined();
    expect(newPasswordError(`${accent}${fitsAccents}`)).toBe('tooLong');

    const fitsEmoji = `a1${emoji.repeat((MAX_PASSWORD_BYTES - 2) / 4)}`;
    expect(newPasswordError(fitsEmoji)).toBeUndefined();
    expect(newPasswordError(`${emoji}${fitsEmoji}`)).toBe('tooLong');
  });
});

describe('passwordChecks', () => {
  it('reports the rules a password has met so far', () => {
    expect(passwordChecks('')).toEqual({ longEnough: false, hasLetter: false, hasNumber: false });
    expect(passwordChecks('abc')).toEqual({ longEnough: false, hasLetter: true, hasNumber: false });
    expect(passwordChecks('12345678')).toEqual({
      longEnough: true,
      hasLetter: false,
      hasNumber: true,
    });
    expect(passwordChecks(strong)).toEqual({ longEnough: true, hasLetter: true, hasNumber: true });
  });
});

describe('confirmError', () => {
  it('asks for the confirmation when it is empty, even next to an empty password', () => {
    expect(confirmError('', '')).toBe('required');
    expect(confirmError(strong, '')).toBe('required');
  });

  it('accepts only the same text, spaces and capitals included', () => {
    expect(confirmError(strong, strong)).toBeUndefined();
    expect(confirmError(strong, `${strong} `)).toBe('mismatch');
    expect(confirmError(strong, strong.toUpperCase())).toBe('mismatch');
  });
});

describe('validateSignIn', () => {
  it('accepts any non-empty password, so older accounts can still sign in', () => {
    expect(validateSignIn({ email: 'dat@example.com', password: 'abc' })).toEqual({
      ok: true,
      value: { email: 'dat@example.com', password: 'abc' },
    });
  });

  it('trims the email', () => {
    expect(validateSignIn({ email: ' dat@example.com ', password: 'abc' })).toEqual({
      ok: true,
      value: { email: 'dat@example.com', password: 'abc' },
    });
  });

  it('asks for what is missing', () => {
    expect(validateSignIn({ email: '', password: '' })).toEqual({
      ok: false,
      errors: { email: 'required', password: 'required' },
    });
  });

  it('still rejects a malformed email', () => {
    expect(validateSignIn({ email: 'dat@', password: 'abc' })).toEqual({
      ok: false,
      errors: { email: 'invalid' },
    });
  });
});

describe('signInPasswordError', () => {
  it('only asks for a password to be there', () => {
    expect(signInPasswordError('')).toBe('required');
    expect(signInPasswordError('a')).toBeUndefined();
  });
});

describe('normalizeRecoveryCode', () => {
  it('drops the spaces a mail app or a keyboard may add, non-breaking ones and tabs included', () => {
    expect(normalizeRecoveryCode(' 123 456 ')).toBe('123456');
    expect(normalizeRecoveryCode('123 456\t')).toBe('123456');
  });

  it('leaves everything else alone, so the check can still refuse it', () => {
    expect(normalizeRecoveryCode('12-3456')).toBe('12-3456');
  });
});

describe('recoveryCodeError', () => {
  it('asks for the code when it is empty or only spaces', () => {
    expect(recoveryCodeError('')).toBe('required');
    expect(recoveryCodeError('   ')).toBe('required');
  });

  it.each([
    '123456',
    '123 456',
    ' 123456 ',
    '0'.repeat(MIN_RECOVERY_CODE_LENGTH),
    '9'.repeat(MAX_RECOVERY_CODE_LENGTH),
  ])('accepts %j', (raw) => {
    expect(recoveryCodeError(raw)).toBeUndefined();
  });

  it.each([
    '12345',
    '1'.repeat(MAX_RECOVERY_CODE_LENGTH + 1),
    '12345a',
    'abcdef',
    '12-3456',
    // Digits from other scripts look right on screen but are not what the email holds.
    '１２３４５６',
    '١٢٣٤٥٦',
  ])('rejects %j', (raw) => {
    expect(recoveryCodeError(raw)).toBe('invalid');
  });
});

describe('validateRecovery', () => {
  const code = '123456';
  const recovery = (overrides: Partial<RecoveryForm> = {}) =>
    validateRecovery({ email, code, password: strong, confirmPassword: strong, ...overrides });

  it('accepts an email, the code and a good new password typed twice, and sends on only the three', () => {
    expect(recovery()).toEqual({ ok: true, value: { email, code, password: strong } });
  });

  it('trims the email, drops the spaces in the code and leaves the password exactly as typed', () => {
    const spaced = ` ${strong} `;
    expect(
      recovery({
        email: '  dat@example.com \n',
        code: '123 456',
        password: spaced,
        confirmPassword: spaced,
      }),
    ).toEqual({ ok: true, value: { email, code, password: spaced } });
  });

  it('asks for everything when the form is empty', () => {
    expect(recovery({ email: ' ', code: '', password: '', confirmPassword: '' })).toEqual({
      ok: false,
      errors: {
        email: 'required',
        code: 'required',
        password: 'required',
        confirmPassword: 'required',
      },
    });
  });

  it('points at the one field that is wrong', () => {
    expect(recovery({ email: 'dat@' })).toEqual({ ok: false, errors: { email: 'invalid' } });
    expect(recovery({ code: '12345' })).toEqual({ ok: false, errors: { code: 'invalid' } });
    expect(recovery({ password: 'a1', confirmPassword: 'a1' })).toEqual({
      ok: false,
      errors: { password: 'tooShort' },
    });
    expect(recovery({ confirmPassword: `${strong}x` })).toEqual({
      ok: false,
      errors: { confirmPassword: 'mismatch' },
    });
  });
});

describe('resendWaitSeconds', () => {
  const sentAt = 1_000_000;

  it('starts at the full wait and counts down in whole seconds', () => {
    expect(resendWaitSeconds(sentAt, sentAt)).toBe(RECOVERY_RESEND_SECONDS);
    expect(resendWaitSeconds(sentAt, sentAt + 1_500)).toBe(RECOVERY_RESEND_SECONDS - 1);
    expect(resendWaitSeconds(sentAt, sentAt + 59_000)).toBe(1);
  });

  it('is 0 once the minute is over, and stays 0', () => {
    expect(resendWaitSeconds(sentAt, sentAt + 60_000)).toBe(0);
    expect(resendWaitSeconds(sentAt, sentAt + 3_600_000)).toBe(0);
  });

  it('never waits longer than the minute, even when the clock was set back', () => {
    expect(resendWaitSeconds(sentAt, sentAt - 5_000)).toBe(RECOVERY_RESEND_SECONDS);
  });
});

describe('validatePasswordChange', () => {
  const current = 'old password 1';
  const change = (overrides: Partial<PasswordChangeForm> = {}) =>
    validatePasswordChange({
      currentPassword: current,
      newPassword: strong,
      confirmPassword: strong,
      ...overrides,
    });

  it('accepts the current password and a good new one typed twice, and sends on only the two', () => {
    expect(change()).toEqual({
      ok: true,
      value: { currentPassword: current, newPassword: strong },
    });
  });

  it('takes any current password, so an account made under older rules can still change it', () => {
    expect(change({ currentPassword: 'abc' }).ok).toBe(true);
  });

  it('leaves both passwords exactly as typed', () => {
    const spaced = ` ${strong} `;
    expect(
      change({ currentPassword: ' abc ', newPassword: spaced, confirmPassword: spaced }),
    ).toEqual({
      ok: true,
      value: { currentPassword: ' abc ', newPassword: spaced },
    });
  });

  it('asks for all three when the form is empty', () => {
    expect(change({ currentPassword: '', newPassword: '', confirmPassword: '' })).toEqual({
      ok: false,
      errors: {
        currentPassword: 'required',
        newPassword: 'required',
        confirmPassword: 'required',
      },
    });
  });

  it('holds the new password to the sign-up rules', () => {
    expect(change({ newPassword: 'a1', confirmPassword: 'a1' })).toEqual({
      ok: false,
      errors: { newPassword: 'tooShort' },
    });
  });

  it('refuses a new password that is the current one', () => {
    expect(change({ currentPassword: strong })).toEqual({
      ok: false,
      errors: { newPassword: 'sameAsCurrent' },
    });
  });

  it('names the broken rule, not "same as current", when the new password is also too weak', () => {
    expect(change({ currentPassword: 'abc', newPassword: 'abc', confirmPassword: 'abc' })).toEqual({
      ok: false,
      errors: { newPassword: 'tooShort' },
    });
  });

  it('asks for the confirmation to match the new password', () => {
    expect(change({ confirmPassword: `${strong}x` })).toEqual({
      ok: false,
      errors: { confirmPassword: 'mismatch' },
    });
  });
});
