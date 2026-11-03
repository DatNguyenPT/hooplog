import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { AuthRepository } from '@/features/account/data/authRepository';
import '@/shared/i18n';
import type { AccountUser } from '../domain/account';
import { AccountError } from '../domain/accountError';
import { AccountScreen } from './AccountScreen';

const mockRepo: jest.Mocked<AuthRepository> = {
  isConfigured: jest.fn(),
  getUser: jest.fn(),
  onChange: jest.fn(),
  signUp: jest.fn(),
  signIn: jest.fn(),
  signOut: jest.fn(),
  deleteAccount: jest.fn(),
  sendRecoveryCode: jest.fn(),
  completeRecovery: jest.fn(),
  changePassword: jest.fn(),
};

jest.mock('@/features/account/data/authRepository', () => ({
  useAuthRepository: () => mockRepo,
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: jest.requireActual('react-native').View,
}));

const player: AccountUser = { id: 'u1', email: 'me@example.com' };
const EMAIL = 'me@example.com';
const CODE_SENT =
  'If me@example.com has an account, we emailed it a code. It can take a few minutes to arrive. Enter the code, then choose a new password.';
const INVALID_CODE = 'That code is not right or has expired. Ask for a new one.';
const WEAK = 'Choose a stronger password.';
const EMAIL_LIMIT = 'Too many emails were sent just now. Please wait a while and try again.';
const TOO_MANY = 'Too many attempts. Please wait a minute and try again.';
const NO_NETWORK = 'Could not reach the server. Check your internet connection and try again.';
const UNKNOWN = 'Something went wrong. Please try again.';
const MISMATCH = 'The passwords do not match.';
const BAD_CODE = 'The code is made of 6 to 10 digits.';
const NEW_PASSWORD = 'long-enough-pass1';

let emit: (user: AccountUser | null) => void = () => undefined;
const unsubscribe = jest.fn();

beforeEach(() => {
  // RNTL waits run outside act(); React logs a harmless notice for our promise-driven state updates.
  const consoleError = console.error;
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (String(args[0]).includes('not configured to support act')) return;
    consoleError(...args);
  });
  jest.clearAllMocks();
  mockRepo.isConfigured.mockReturnValue(true);
  mockRepo.getUser.mockResolvedValue(null);
  mockRepo.onChange.mockImplementation((listener) => {
    emit = listener;
    return unsubscribe;
  });
  mockRepo.signUp.mockResolvedValue('confirmationSent');
  mockRepo.signIn.mockResolvedValue(undefined);
  mockRepo.signOut.mockResolvedValue(undefined);
  mockRepo.deleteAccount.mockResolvedValue(undefined);
  mockRepo.sendRecoveryCode.mockResolvedValue(undefined);
  mockRepo.completeRecovery.mockResolvedValue(undefined);
  mockRepo.changePassword.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

/** Signed out, with the reset form open. An email, if given, is typed on the sign-in form first. */
async function openReset(email = '') {
  await render(<AccountScreen />);
  if (email) await fireEvent.changeText(await screen.findByLabelText('Email'), email);
  await fireEvent.press(await screen.findByLabelText('Forgot password?'));
}

/** The usual way to the code step: ask for a code. */
async function askForCode(email = EMAIL) {
  await openReset(email);
  await fireEvent.press(screen.getByLabelText('Send code'));
  await screen.findByLabelText('Code from the email');
}

async function fillIn(code: string, password: string, confirmation = password) {
  await fireEvent.changeText(screen.getByLabelText('Code from the email'), code);
  await fireEvent.changeText(screen.getByLabelText('New password'), password);
  await fireEvent.changeText(screen.getByLabelText('Confirm new password'), confirmation);
}

const save = () => fireEvent.press(screen.getByLabelText('Save new password'));

describe('Account screen: forgot password', () => {
  it('offers the link on the sign-in form and not on the sign-up form', async () => {
    await render(<AccountScreen />);
    expect(await screen.findByLabelText('Forgot password?')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('New here? Create an account'));
    expect(screen.queryByLabelText('Forgot password?')).toBeNull();
  });

  it('opens the reset form in place of the sign-in form, with the email typed so far', async () => {
    await openReset(EMAIL);
    expect(screen.getByText('Reset your password')).toBeTruthy();
    expect(screen.getByLabelText('Email').props.value).toBe(EMAIL);
    expect(screen.queryByLabelText('Password')).toBeNull();
    expect(mockRepo.sendRecoveryCode).not.toHaveBeenCalled();
  });

  it('goes back to the sign-in form with the email as it was left, sending nothing', async () => {
    await openReset(EMAIL);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'other@example.com');
    await fireEvent.press(screen.getByLabelText('Back to sign in'));
    expect((await screen.findByLabelText('Email')).props.value).toBe('other@example.com');
    expect(screen.getByLabelText('Sign in')).toBeTruthy();
    expect(mockRepo.sendRecoveryCode).not.toHaveBeenCalled();
  });

  it.each([
    { what: 'no email', email: '', message: 'Enter your email.' },
    {
      what: 'an email that is not one',
      email: 'not-an-email',
      message: 'Enter a valid email address.',
    },
  ])('does not send a code for $what', async ({ email, message }) => {
    await openReset(email);
    await fireEvent.press(screen.getByLabelText('Send code'));
    expect(screen.getByText(message)).toBeTruthy();
    expect(mockRepo.sendRecoveryCode).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Code from the email')).toBeNull();
  });

  it('asks for a usable email before moving on with a code the player already has', async () => {
    await openReset('not-an-email');
    await fireEvent.press(screen.getByLabelText('I already have a code'));
    expect(screen.getByText('Enter a valid email address.')).toBeTruthy();
    expect(screen.queryByLabelText('Code from the email')).toBeNull();
  });

  it('sends the code to the trimmed email, then says so without telling if there is an account', async () => {
    await openReset(`  ${EMAIL} `);
    await fireEvent.press(screen.getByLabelText('Send code'));
    expect(await screen.findByLabelText('Code from the email')).toBeTruthy();
    expect(mockRepo.sendRecoveryCode).toHaveBeenCalledTimes(1);
    expect(mockRepo.sendRecoveryCode).toHaveBeenCalledWith(EMAIL);
    expect(screen.getByText(CODE_SENT)).toBeTruthy();
  });

  it.each([
    {
      reason: 'too many emails were sent',
      error: new AccountError('emailRateLimit'),
      message: EMAIL_LIMIT,
    },
    { reason: 'there is no connection', error: new AccountError('network'), message: NO_NETWORK },
    { reason: 'something unexpected happens', error: new Error('boom'), message: UNKNOWN },
  ])('stays on the email step when $reason, ready to try again', async ({ error, message }) => {
    mockRepo.sendRecoveryCode.mockRejectedValueOnce(error);
    await openReset(EMAIL);
    await fireEvent.press(screen.getByLabelText('Send code'));
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByLabelText('Code from the email')).toBeNull();
    expect(screen.getByLabelText('Send code')).not.toBeDisabled();
    await fireEvent.press(screen.getByLabelText('Send code'));
    expect(await screen.findByLabelText('Code from the email')).toBeTruthy();
    expect(mockRepo.sendRecoveryCode).toHaveBeenCalledTimes(2);
  });

  it('moves on without sending when the player already has a code', async () => {
    await openReset(EMAIL);
    await fireEvent.press(screen.getByLabelText('I already have a code'));
    expect(await screen.findByLabelText('Code from the email')).toBeTruthy();
    expect(mockRepo.sendRecoveryCode).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Send a new code')).not.toBeDisabled();
  });
});

describe('Account screen: choosing a new password with a code', () => {
  it('asks the keyboard for digits and lets the phone offer the code from the email', async () => {
    await askForCode();
    const code = screen.getByLabelText('Code from the email');
    expect(code.props.keyboardType).toBe('number-pad');
    expect(code.props.autoComplete).toBe('one-time-code');
    expect(code.props.textContentType).toBe('oneTimeCode');
  });

  it.each([
    {
      what: 'no code',
      code: '',
      password: NEW_PASSWORD,
      confirmation: NEW_PASSWORD,
      message: 'Enter the code from the email.',
    },
    {
      what: 'a code with letters',
      code: '12ab56',
      password: NEW_PASSWORD,
      confirmation: NEW_PASSWORD,
      message: BAD_CODE,
    },
    {
      what: 'a code that is too short',
      code: '12345',
      password: NEW_PASSWORD,
      confirmation: NEW_PASSWORD,
      message: BAD_CODE,
    },
    {
      what: 'a code that is too long',
      code: '12345678901',
      password: NEW_PASSWORD,
      confirmation: NEW_PASSWORD,
      message: BAD_CODE,
    },
    {
      what: 'no password',
      code: '123456',
      password: '',
      confirmation: '',
      message: 'Enter your password.',
    },
    {
      what: 'no second password',
      code: '123456',
      password: NEW_PASSWORD,
      confirmation: '',
      message: 'Enter your password again.',
    },
    {
      what: 'two different passwords',
      code: '123456',
      password: NEW_PASSWORD,
      confirmation: 'different-pass1',
      message: MISMATCH,
    },
  ])('does not save with $what', async ({ code, password, confirmation, message }) => {
    await askForCode();
    await fillIn(code, password, confirmation);
    await save();
    expect(screen.getByText(message)).toBeTruthy();
    expect(mockRepo.completeRecovery).not.toHaveBeenCalled();
  });

  it('takes a message away as soon as its field is fixed', async () => {
    await askForCode();
    await fillIn('', NEW_PASSWORD);
    await save();
    expect(screen.getByText('Enter the code from the email.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Code from the email'), '123456');
    expect(screen.queryByText('Enter the code from the email.')).toBeNull();
  });

  it('keeps the form while the password is saved, then says it was changed', async () => {
    let finish!: () => void;
    mockRepo.completeRecovery.mockReturnValue(new Promise<void>((r) => (finish = r)));
    await askForCode();
    await fillIn('123 456', NEW_PASSWORD);
    const pressed = save();
    await waitFor(() => expect(mockRepo.completeRecovery).toHaveBeenCalledTimes(1));
    expect(mockRepo.completeRecovery).toHaveBeenCalledWith({
      email: EMAIL,
      code: '123456',
      password: NEW_PASSWORD,
    });

    // The right code signs the player in before the password is saved; the form has to stay.
    await act(async () => emit(player));
    expect(screen.getByLabelText('Save new password')).toBeDisabled();
    expect(screen.queryByLabelText('Sign out')).toBeNull();

    await act(async () => finish());
    await pressed;
    expect(await screen.findByLabelText('Signed in as me@example.com')).toBeTruthy();
    expect(screen.getByText('Password changed')).toBeTruthy();
    expect(screen.queryByLabelText('Save new password')).toBeNull();
    expect(screen.getByLabelText('Sign out')).toBeTruthy();

    // The notice lasts until the player signs out.
    await act(async () => emit(null));
    await act(async () => emit(player));
    expect(screen.queryByText('Password changed')).toBeNull();
  });

  it('saves from the Done key on the keyboard', async () => {
    await askForCode();
    await fillIn('123456', NEW_PASSWORD);
    await fireEvent(screen.getByLabelText('Confirm new password'), 'submitEditing');
    await waitFor(() => expect(mockRepo.completeRecovery).toHaveBeenCalledTimes(1));
  });

  it('blocks the buttons and a second save while the password is being saved', async () => {
    let finish!: () => void;
    mockRepo.completeRecovery.mockReturnValue(new Promise<void>((r) => (finish = r)));
    await askForCode();
    await fillIn('123456', NEW_PASSWORD);
    const pressed = save();
    await waitFor(() => expect(screen.getByLabelText('Save new password')).toBeDisabled());
    expect(screen.getByLabelText(/^Send a new code/)).toBeDisabled();
    expect(screen.getByLabelText('Use a different email')).toBeDisabled();
    expect(screen.getByLabelText('Back to sign in')).toBeDisabled();
    await fireEvent(screen.getByLabelText('Confirm new password'), 'submitEditing');
    expect(mockRepo.completeRecovery).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    await pressed;
  });

  it('shows a wrong or expired code under the code field, until the code is retyped', async () => {
    mockRepo.completeRecovery.mockRejectedValueOnce(new AccountError('invalidCode'));
    await askForCode();
    await fillIn('123456', NEW_PASSWORD);
    await save();
    expect(await screen.findByText(INVALID_CODE)).toBeTruthy();
    expect(screen.getByLabelText('Save new password')).not.toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('Code from the email'), '654321');
    expect(screen.queryByText(INVALID_CODE)).toBeNull();
  });

  it('shows a password the server calls too weak under the password field, until it is retyped', async () => {
    mockRepo.completeRecovery.mockRejectedValueOnce(new AccountError('weakPassword'));
    await askForCode();
    await fillIn('123456', NEW_PASSWORD);
    await save();
    expect(await screen.findByText(WEAK)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('New password'), 'another-pass22');
    expect(screen.queryByText(WEAK)).toBeNull();
  });

  it.each([
    { reason: 'there is no connection', error: new AccountError('network'), message: NO_NETWORK },
    {
      reason: 'there are too many attempts',
      error: new AccountError('tooManyRequests'),
      message: TOO_MANY,
    },
    { reason: 'something unexpected happens', error: new Error('boom'), message: UNKNOWN },
  ])('shows a message when $reason, and lets the player save again', async ({ error, message }) => {
    mockRepo.completeRecovery.mockRejectedValueOnce(error);
    await askForCode();
    await fillIn('123456', NEW_PASSWORD);
    await save();
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.getByLabelText('Save new password')).not.toBeDisabled();
    await save();
    expect(mockRepo.completeRecovery).toHaveBeenCalledTimes(2);
  });

  it('makes the player wait a minute before asking for another code', async () => {
    jest.useFakeTimers();
    await askForCode();
    expect(screen.getByLabelText('Send a new code in 60 s')).toBeDisabled();
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.getByLabelText('Send a new code in 59 s')).toBeDisabled();
    await act(async () => {
      jest.advanceTimersByTime(59_000);
    });
    const again = screen.getByLabelText('Send a new code');
    expect(again).not.toBeDisabled();
    await fireEvent.press(again);
    expect(mockRepo.sendRecoveryCode).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText('Send a new code in 60 s')).toBeDisabled();
  });

  it('goes back to the email step to use a different address, keeping what was typed', async () => {
    await askForCode();
    await fireEvent.press(screen.getByLabelText('Use a different email'));
    const email = await screen.findByLabelText('Email');
    expect(email.props.value).toBe(EMAIL);
    expect(screen.queryByLabelText('Code from the email')).toBeNull();
    await fireEvent.changeText(email, 'new@example.com');
    await fireEvent.press(screen.getByLabelText('Send code'));
    expect(await screen.findByLabelText('Code from the email')).toBeTruthy();
    expect(mockRepo.sendRecoveryCode).toHaveBeenLastCalledWith('new@example.com');
  });

  it('goes back to the sign-in form from the code step, with the email kept', async () => {
    await askForCode();
    await fireEvent.press(screen.getByLabelText('Back to sign in'));
    expect((await screen.findByLabelText('Email')).props.value).toBe(EMAIL);
    expect(screen.getByLabelText('Sign in')).toBeTruthy();
    expect(mockRepo.completeRecovery).not.toHaveBeenCalled();
  });
});
