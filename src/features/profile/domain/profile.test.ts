import {
  EMPTY_PROFILE,
  MAX_DISPLAY_NAME_LENGTH,
  needsWelcome,
  validateDisplayName,
} from './profile';

describe('validateDisplayName', () => {
  it('keeps a plain name as typed', () => {
    expect(validateDisplayName('Dat')).toEqual({ ok: true, name: 'Dat' });
  });

  it('trims the name and collapses runs of spaces', () => {
    expect(validateDisplayName('  Dat   Nguyen \n')).toEqual({ ok: true, name: 'Dat Nguyen' });
  });

  it('treats a blank name as no name, so the field can be cleared', () => {
    expect(validateDisplayName('')).toEqual({ ok: true, name: null });
    expect(validateDisplayName('   \t ')).toEqual({ ok: true, name: null });
  });

  it('accepts a name of exactly the maximum length and rejects one character more', () => {
    const longest = 'a'.repeat(MAX_DISPLAY_NAME_LENGTH);
    expect(validateDisplayName(longest)).toEqual({ ok: true, name: longest });
    expect(validateDisplayName(longest + 'a')).toEqual({ ok: false, error: 'tooLong' });
  });

  it('measures the length after tidying, not as typed', () => {
    const padded = `  ${'a'.repeat(MAX_DISPLAY_NAME_LENGTH)}  `;
    expect(validateDisplayName(padded)).toEqual({
      ok: true,
      name: 'a'.repeat(MAX_DISPLAY_NAME_LENGTH),
    });
  });

  it('keeps accents and other scripts', () => {
    expect(validateDisplayName('Nguyễn Tiến Đạt')).toEqual({ ok: true, name: 'Nguyễn Tiến Đạt' });
  });
});

describe('needsWelcome', () => {
  it('is true for a profile that was never saved', () => {
    expect(needsWelcome(EMPTY_PROFILE)).toBe(true);
  });

  it('is true when only a name was saved', () => {
    expect(needsWelcome({ displayName: 'Dat', onboardedAt: null })).toBe(true);
  });

  it('is false once the welcome screen was completed or skipped', () => {
    expect(needsWelcome({ displayName: null, onboardedAt: '2026-11-01T08:00:00.000Z' })).toBe(
      false,
    );
  });
});
