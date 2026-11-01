import { z } from 'zod';

/** The signed-in player, as far as the app needs to know. */
export type AccountUser = {
  id: string;
  email: string | null;
};

/** What the player typed to sign up or sign in. */
export type Credentials = { email: string; password: string };

/** Sign-up asks for a little more than the server's own minimum. Sign-in never checks the length. */
export const MIN_PASSWORD_LENGTH = 8;

export type EmailError = 'required' | 'invalid';
export type PasswordError = 'required' | 'tooShort';
export type CredentialsErrors = { email?: EmailError; password?: PasswordError };
export type CredentialsCheck =
  { ok: true; value: Credentials } | { ok: false; errors: CredentialsErrors };

const emailSchema = z.email();

function check(
  raw: Credentials,
  passwordError: (password: string) => PasswordError | undefined,
): CredentialsCheck {
  const email = raw.email.trim();
  const errors: CredentialsErrors = {};
  if (email === '') errors.email = 'required';
  else if (!emailSchema.safeParse(email).success) errors.email = 'invalid';
  // The password is used exactly as typed: spaces can be part of it.
  const problem = passwordError(raw.password);
  if (problem) errors.password = problem;
  return Object.keys(errors).length > 0
    ? { ok: false, errors }
    : { ok: true, value: { email, password: raw.password } };
}

/** Checks the sign-up form: a valid email and a password of at least `MIN_PASSWORD_LENGTH`. */
export const validateSignUp = (raw: Credentials): CredentialsCheck =>
  check(raw, (password) =>
    password === '' ? 'required' : password.length < MIN_PASSWORD_LENGTH ? 'tooShort' : undefined,
  );

/** Checks the sign-in form. An existing account may predate today's rules, so only presence counts. */
export const validateSignIn = (raw: Credentials): CredentialsCheck =>
  check(raw, (password) => (password === '' ? 'required' : undefined));

/** What `signUp` did: the project may or may not require the email to be confirmed first. */
export type SignUpOutcome = 'confirmationSent' | 'signedIn';
