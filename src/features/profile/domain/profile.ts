/** What the app knows about the player. Every field is optional: the core app works with no name and no account. */
export type Profile = {
  /** Shown as a greeting on Home. Null until the player enters one. */
  displayName: string | null;
  /** When the welcome screen was completed or skipped (ISO-8601 UTC). Null until then. */
  onboardedAt: string | null;
};

/** A profile that was never saved. */
export const EMPTY_PROFILE: Profile = { displayName: null, onboardedAt: null };

/** The welcome screen is shown once: until it has been completed or skipped. */
export const needsWelcome = (profile: Profile): boolean => profile.onboardedAt === null;

export const MAX_DISPLAY_NAME_LENGTH = 40;
export type DisplayNameError = 'tooLong';

/**
 * Tidies a typed name: trimmed, runs of spaces collapsed. A blank name is allowed and means
 * "no name", so clearing the field removes the greeting.
 */
export function validateDisplayName(
  raw: string,
): { ok: true; name: string | null } | { ok: false; error: DisplayNameError } {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name === '') return { ok: true, name: null };
  if (name.length > MAX_DISPLAY_NAME_LENGTH) return { ok: false, error: 'tooLong' };
  return { ok: true, name };
}
