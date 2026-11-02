/* global describe, it, expect */
const { describeLanding } = require('./landing');

describe('describeLanding', () => {
  it('confirms when Supabase sent tokens after the #', () => {
    expect(describeLanding('#access_token=abc&refresh_token=def&type=signup', '')).toBe(
      'confirmed',
    );
  });

  it('confirms when Supabase sent a code after the ?', () => {
    expect(describeLanding('', '?code=abc')).toBe('confirmed');
  });

  it('reports a problem for an expired or used link, after the # or the ?', () => {
    const error = 'error=access_denied&error_code=otp_expired&error_description=Email+link+expired';
    expect(describeLanding(`#${error}`, '')).toBe('problem');
    expect(describeLanding('', `?${error}`)).toBe('problem');
  });

  it('treats any one error field as a problem', () => {
    expect(describeLanding('#error=access_denied', '')).toBe('problem');
    expect(describeLanding('#error_code=otp_expired', '')).toBe('problem');
    expect(describeLanding('#error_description=Something', '')).toBe('problem');
  });

  it('never confirms when an error comes with a token', () => {
    expect(describeLanding('#access_token=abc&error=access_denied', '')).toBe('problem');
    expect(describeLanding('#access_token=abc', '?error_code=otp_expired')).toBe('problem');
  });

  it('does not call a password-reset link an email confirmation', () => {
    expect(describeLanding('#access_token=abc&type=recovery', '')).toBe('nothing');
  });

  it('has nothing to confirm without a result in the address', () => {
    expect(describeLanding('', '')).toBe('nothing');
    expect(describeLanding('#', '?')).toBe('nothing');
    expect(describeLanding('#top', '?page=2')).toBe('nothing');
  });

  it('reads field names only, not words that happen to appear in a value', () => {
    expect(describeLanding('#note=error', '?topic=access_token')).toBe('nothing');
  });
});
