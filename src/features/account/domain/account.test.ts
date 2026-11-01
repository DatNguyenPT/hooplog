import { MIN_PASSWORD_LENGTH, validateSignIn, validateSignUp } from './account';

const strong = 'a'.repeat(MIN_PASSWORD_LENGTH);

describe('validateSignUp', () => {
  it('accepts a valid email and a long enough password', () => {
    expect(validateSignUp({ email: 'dat@example.com', password: strong })).toEqual({
      ok: true,
      value: { email: 'dat@example.com', password: strong },
    });
  });

  it('trims the email but leaves the password exactly as typed', () => {
    const result = validateSignUp({ email: '  dat@example.com \n', password: ` ${strong} ` });
    expect(result).toEqual({
      ok: true,
      value: { email: 'dat@example.com', password: ` ${strong} ` },
    });
  });

  it('asks for the email and the password when both are empty', () => {
    expect(validateSignUp({ email: '   ', password: '' })).toEqual({
      ok: false,
      errors: { email: 'required', password: 'required' },
    });
  });

  it.each(['dat', 'dat@', '@example.com', 'dat@example', 'da t@example.com', 'dat@@example.com'])(
    'rejects "%s" as an email',
    (email) => {
      expect(validateSignUp({ email, password: strong })).toEqual({
        ok: false,
        errors: { email: 'invalid' },
      });
    },
  );

  it('accepts a password of exactly the minimum length and rejects one character less', () => {
    expect(validateSignUp({ email: 'dat@example.com', password: strong }).ok).toBe(true);
    expect(validateSignUp({ email: 'dat@example.com', password: strong.slice(1) })).toEqual({
      ok: false,
      errors: { password: 'tooShort' },
    });
  });

  it('counts spaces as part of the password length', () => {
    expect(validateSignUp({ email: 'dat@example.com', password: ' '.repeat(8) }).ok).toBe(true);
  });

  it('reports both problems at once', () => {
    expect(validateSignUp({ email: 'dat', password: 'short' })).toEqual({
      ok: false,
      errors: { email: 'invalid', password: 'tooShort' },
    });
  });
});

describe('validateSignIn', () => {
  it('accepts any non-empty password, so older accounts can still sign in', () => {
    expect(validateSignIn({ email: 'dat@example.com', password: 'abc' })).toEqual({
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
