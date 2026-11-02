import { z } from 'zod';

/** The signed-in player, as far as the app needs to know. */
export type AccountUser = {
  id: string;
  email: string | null;
};

/** What is sent to sign in or to sign up. */
export type Credentials = { email: string; password: string };

/** Sign-up asks for the password twice, so a typo does not lock the player out of a new account. */
export type SignUpForm = Credentials & { confirmPassword: string };

/** Sign-up asks for a little more than the server's own minimum. Sign-in never checks the length. */
export const MIN_PASSWORD_LENGTH = 8;
/** Passwords are hashed with bcrypt, which only reads the first 72 bytes it is given. */
export const MAX_PASSWORD_BYTES = 72;
/** The longest address an email can have. */
export const MAX_EMAIL_LENGTH = 254;

export type EmailError = 'required' | 'invalid';
export type PasswordError = 'required' | 'tooShort' | 'tooLong' | 'needsLetter' | 'needsNumber';
export type ConfirmError = 'required' | 'mismatch';
export type CredentialsErrors = { email?: EmailError; password?: PasswordError };
export type SignUpErrors = CredentialsErrors & { confirmPassword?: ConfirmError };
export type CredentialsCheck =
  { ok: true; value: Credentials } | { ok: false; errors: CredentialsErrors };
export type SignUpCheck = { ok: true; value: Credentials } | { ok: false; errors: SignUpErrors };

const emailSchema = z.email();

/** Why an email cannot be used, if it cannot. Spaces around it are ignored. */
export function emailError(raw: string): EmailError | undefined {
  const email = raw.trim();
  if (email === '') return 'required';
  return email.length > MAX_EMAIL_LENGTH || !emailSchema.safeParse(email).success
    ? 'invalid'
    : undefined;
}

/** Signing in only needs a password to be there: an existing account may predate today's rules. */
export const signInPasswordError = (password: string): PasswordError | undefined =>
  password === '' ? 'required' : undefined;

/** What a new password needs besides staying short enough, so the form can tick them off as it is typed. */
export type PasswordChecks = { longEnough: boolean; hasLetter: boolean; hasNumber: boolean };

export function passwordChecks(password: string): PasswordChecks {
  return {
    longEnough: password.length >= MIN_PASSWORD_LENGTH,
    // A letter in any alphabet counts: digits, spaces and symbols look the same in upper and lower case.
    hasLetter: [...password].some((char) => char.toLowerCase() !== char.toUpperCase()),
    hasNumber: /[0-9]/.test(password),
  };
}

/** The size of the text as UTF-8, which is what the server hashes: accented letters and emoji take several bytes. */
function utf8Length(text: string): number {
  let bytes = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/** Why a new password cannot be used, if it cannot. Spaces are part of it, so nothing is trimmed. */
export function newPasswordError(password: string): PasswordError | undefined {
  if (password === '') return 'required';
  const { longEnough, hasLetter, hasNumber } = passwordChecks(password);
  if (!longEnough) return 'tooShort';
  if (utf8Length(password) > MAX_PASSWORD_BYTES) return 'tooLong';
  if (!hasLetter) return 'needsLetter';
  if (!hasNumber) return 'needsNumber';
  return undefined;
}

/** Why the second copy of a new password is wrong, if it is. */
export function confirmError(password: string, confirmation: string): ConfirmError | undefined {
  if (confirmation === '') return 'required';
  return confirmation === password ? undefined : 'mismatch';
}

/** Checks the sign-up form: a valid email, and a new password that meets the rules, typed twice the same. */
export function validateSignUp(raw: SignUpForm): SignUpCheck {
  const errors: SignUpErrors = {
    email: emailError(raw.email),
    password: newPasswordError(raw.password),
    confirmPassword: confirmError(raw.password, raw.confirmPassword),
  };
  return Object.values(errors).some((problem) => problem !== undefined)
    ? { ok: false, errors }
    : { ok: true, value: { email: raw.email.trim(), password: raw.password } };
}

/** Checks the sign-in form. An existing account may predate today's rules, so only presence counts. */
export function validateSignIn(raw: Credentials): CredentialsCheck {
  const errors: CredentialsErrors = {
    email: emailError(raw.email),
    password: signInPasswordError(raw.password),
  };
  return Object.values(errors).some((problem) => problem !== undefined)
    ? { ok: false, errors }
    : { ok: true, value: { email: raw.email.trim(), password: raw.password } };
}

/** What `signUp` did: the project may or may not require the email to be confirmed first. */
export type SignUpOutcome = 'confirmationSent' | 'signedIn';
