import {
  MAX_EMAIL_LENGTH,
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD_LENGTH,
  confirmError,
  emailError,
  newPasswordError,
  passwordChecks,
  signInPasswordError,
  validateSignIn,
  validateSignUp,
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
