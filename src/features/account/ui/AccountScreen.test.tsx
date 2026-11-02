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
};

jest.mock('@/features/account/data/authRepository', () => ({
  useAuthRepository: () => mockRepo,
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: jest.requireActual('react-native').View,
}));

const player: AccountUser = { id: 'u1', email: 'me@example.com' };
const NOT_SET_UP = 'Accounts are not set up';
const BACKUP_NOTE =
  'Signing in does not back up your data yet. Your workouts, shooting and plans still live only on this phone. To keep a copy, export a backup from Settings, under Your data.';
const NO_NETWORK = 'Could not reach the server. Check your internet connection and try again.';
const UNKNOWN = 'Something went wrong. Please try again.';
const MISMATCH = 'The passwords do not match.';
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
});

afterEach(() => jest.restoreAllMocks());

async function fillIn(email: string, password: string) {
  await fireEvent.changeText(await screen.findByLabelText('Email'), email);
  await fireEvent.changeText(screen.getByLabelText('Password'), password);
}

/** The sign-up form asks for the password twice; by default the second time matches the first. */
async function fillInSignUp(email: string, password: string, confirmation = password) {
  await fillIn(email, password);
  await fireEvent.changeText(screen.getByLabelText('Confirm password'), confirmation);
}

describe('Account screen: availability and loading', () => {
  it('says accounts are not set up when this build has no account service', async () => {
    mockRepo.isConfigured.mockReturnValue(false);
    await render(<AccountScreen />);
    expect(screen.getByText(NOT_SET_UP)).toBeTruthy();
    expect(screen.queryByLabelText('Email')).toBeNull();
    expect(mockRepo.getUser).not.toHaveBeenCalled();
  });

  it('shows a loading indicator, then the sign-in form with the optional-account notes', async () => {
    let resolve!: (user: AccountUser | null) => void;
    mockRepo.getUser.mockReturnValue(new Promise<AccountUser | null>((r) => (resolve = r)));
    await render(<AccountScreen />);
    expect(screen.getByLabelText('Loading…')).toBeTruthy();
    expect(screen.queryByLabelText('Email')).toBeNull();

    await act(async () => resolve(null));
    expect(await screen.findByLabelText('Email')).toBeTruthy();
    expect(screen.queryByLabelText('Loading…')).toBeNull();
    expect(
      screen.getByText('An account is optional. HoopLog works fully without one.'),
    ).toBeTruthy();
    expect(screen.getByText(BACKUP_NOTE)).toBeTruthy();
  });

  it('shows what went wrong when the stored sign-in cannot be read, and retries', async () => {
    mockRepo.getUser.mockRejectedValueOnce(new AccountError('network'));
    await render(<AccountScreen />);
    expect(await screen.findByText(NO_NETWORK)).toBeTruthy();
    expect(screen.queryByLabelText('Email')).toBeNull();

    await fireEvent.press(screen.getByLabelText('Try again'));
    expect(await screen.findByLabelText('Email')).toBeTruthy();
    expect(screen.queryByText(NO_NETWORK)).toBeNull();
  });

  it('falls back to a general message for a failure it does not know', async () => {
    mockRepo.getUser.mockRejectedValueOnce(new Error('boom'));
    await render(<AccountScreen />);
    expect(await screen.findByText(UNKNOWN)).toBeTruthy();
  });

  it('stops listening for sign-ins when the screen goes away', async () => {
    await render(<AccountScreen />);
    await screen.findByLabelText('Email');
    await screen.unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});

describe('Account screen: signing in', () => {
  it('asks for both fields and calls nothing while either is missing', async () => {
    await render(<AccountScreen />);
    await fireEvent.press(await screen.findByLabelText('Sign in'));
    expect(screen.getByText('Enter your email.')).toBeTruthy();
    expect(screen.getByText('Enter your password.')).toBeTruthy();

    await fillIn('not-an-email', 'secret-pass');
    await fireEvent.press(screen.getByLabelText('Sign in'));
    expect(screen.getByText('Enter a valid email address.')).toBeTruthy();
    expect(screen.queryByText('Enter your password.')).toBeNull();
    expect(mockRepo.signIn).not.toHaveBeenCalled();
  });

  it('clears a message as soon as its field is fixed', async () => {
    await render(<AccountScreen />);
    await fireEvent.press(await screen.findByLabelText('Sign in'));
    expect(screen.getByText('Enter your email.')).toBeTruthy();
    expect(screen.getByText('Enter your password.')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Email'), 'me@example.com');
    expect(screen.queryByText('Enter your email.')).toBeNull();
    expect(screen.getByText('Enter your password.')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Password'), 'x');
    expect(screen.queryByText('Enter your password.')).toBeNull();
  });

  it('checks the email when the player leaves the field, not while they are still typing', async () => {
    await render(<AccountScreen />);
    const email = await screen.findByLabelText('Email');

    // Leaving an empty field says nothing: tapping through the form should not nag.
    await fireEvent(email, 'blur');
    expect(screen.queryByText('Enter your email.')).toBeNull();

    await fireEvent.changeText(screen.getByLabelText('Email'), 'me@example');
    expect(screen.queryByText('Enter a valid email address.')).toBeNull();
    await fireEvent(screen.getByLabelText('Email'), 'blur');
    expect(screen.getByText('Enter a valid email address.')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Email'), 'me@example.com');
    expect(screen.queryByText('Enter a valid email address.')).toBeNull();
  });

  it('signs in with the tidied email, empties the password, then shows the signed-in view', async () => {
    await render(<AccountScreen />);
    await fillIn('  me@example.com ', 'secret-pass');
    await fireEvent.press(screen.getByLabelText('Sign in'));
    await waitFor(() => expect(mockRepo.signIn).toHaveBeenCalledTimes(1));
    expect(mockRepo.signIn).toHaveBeenCalledWith({
      email: 'me@example.com',
      password: 'secret-pass',
    });
    await waitFor(() => expect(screen.getByLabelText('Password').props.value).toBe(''));

    // The account service announces the new sign-in; the screen follows it.
    await act(async () => emit(player));
    expect(await screen.findByLabelText('Signed in as me@example.com')).toBeTruthy();
    expect(screen.queryByLabelText('Email')).toBeNull();
  });

  it('lets a short, simple password sign in: the new-password rules apply only when creating one', async () => {
    await render(<AccountScreen />);
    await fillIn('me@example.com', 'abc');
    await fireEvent.press(screen.getByLabelText('Sign in'));
    await waitFor(() => expect(mockRepo.signIn).toHaveBeenCalledTimes(1));
    expect(mockRepo.signIn).toHaveBeenCalledWith({ email: 'me@example.com', password: 'abc' });
  });

  it('signs in from the keyboard Done key as well', async () => {
    await render(<AccountScreen />);
    await fillIn('me@example.com', 'secret-pass');
    await fireEvent(screen.getByLabelText('Password'), 'submitEditing');
    await waitFor(() => expect(mockRepo.signIn).toHaveBeenCalledTimes(1));
  });

  it('explains a failed sign-in, keeps the email, and allows another try', async () => {
    mockRepo.signIn.mockRejectedValueOnce(new AccountError('invalidCredentials'));
    await render(<AccountScreen />);
    await fillIn('me@example.com', 'wrong-pass');
    await fireEvent.press(screen.getByLabelText('Sign in'));
    expect(await screen.findByText('That email and password do not match.')).toBeTruthy();
    expect(screen.getByLabelText('Email').props.value).toBe('me@example.com');
    expect(screen.getByLabelText('Sign in')).not.toBeDisabled();

    await fireEvent.press(screen.getByLabelText('Sign in'));
    await waitFor(() => expect(mockRepo.signIn).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('That email and password do not match.')).toBeNull();
  });

  it('shows a general message when sign-in fails in a way it does not know', async () => {
    mockRepo.signIn.mockRejectedValueOnce(new Error('boom'));
    await render(<AccountScreen />);
    await fillIn('me@example.com', 'secret-pass');
    await fireEvent.press(screen.getByLabelText('Sign in'));
    expect(await screen.findByText(UNKNOWN)).toBeTruthy();
  });

  it('ignores a second tap while signing in', async () => {
    let finish!: () => void;
    mockRepo.signIn.mockReturnValue(new Promise<void>((r) => (finish = r)));
    await render(<AccountScreen />);
    await fillIn('me@example.com', 'secret-pass');
    // Not awaited: the press resolves only when signing in has finished.
    const firstPress = fireEvent.press(screen.getByLabelText('Sign in'));
    await waitFor(() => expect(mockRepo.signIn).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText('Sign in')).toBeDisabled();

    await fireEvent.press(screen.getByLabelText('Sign in'));
    expect(mockRepo.signIn).toHaveBeenCalledTimes(1);

    await act(async () => finish());
    await firstPress;
    expect(screen.getByLabelText('Sign in')).not.toBeDisabled();
  });

  it('hides the password until asked, and hides it again', async () => {
    await render(<AccountScreen />);
    expect((await screen.findByLabelText('Password')).props.secureTextEntry).toBe(true);

    await fireEvent.press(screen.getByLabelText('Show password'));
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(false);

    await fireEvent.press(screen.getByLabelText('Hide password'));
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
  });
});

describe('Account screen: creating an account', () => {
  const openSignUp = async () => {
    await fireEvent.press(await screen.findByLabelText('New here? Create an account'));
  };

  it('asks for the password twice and lists the password rules, only when creating an account', async () => {
    await render(<AccountScreen />);
    await screen.findByLabelText('Email');
    expect(screen.queryByLabelText('Confirm password')).toBeNull();
    expect(screen.queryByLabelText('At least 8 characters: not yet')).toBeNull();

    await openSignUp();
    expect(screen.getByLabelText('Confirm password')).toBeTruthy();
    expect(screen.getByLabelText('At least 8 characters: not yet')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Confirm password'), 'typed-before-leaving');

    await fireEvent.press(screen.getByLabelText('Already have an account? Sign in'));
    expect(screen.queryByLabelText('Confirm password')).toBeNull();
    expect(screen.queryByLabelText('At least 8 characters: not yet')).toBeNull();

    // Coming back starts the second password field empty.
    await openSignUp();
    expect(screen.getByLabelText('Confirm password').props.value).toBe('');
  });

  it('ticks each password rule off as it is met', async () => {
    await render(<AccountScreen />);
    await openSignUp();
    expect(screen.getByLabelText('At least 8 characters: not yet')).toBeTruthy();
    expect(screen.getByLabelText('A letter: not yet')).toBeTruthy();
    expect(screen.getByLabelText('A number: not yet')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Password'), 'abc');
    expect(screen.getByLabelText('At least 8 characters: not yet')).toBeTruthy();
    expect(screen.getByLabelText('A letter: done')).toBeTruthy();
    expect(screen.getByLabelText('A number: not yet')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Password'), 'abcdefg1');
    expect(screen.getByLabelText('At least 8 characters: done')).toBeTruthy();
    expect(screen.getByLabelText('A letter: done')).toBeTruthy();
    expect(screen.getByLabelText('A number: done')).toBeTruthy();
  });

  it('names everything that is missing, and calls nothing, when the form is empty', async () => {
    await render(<AccountScreen />);
    await openSignUp();
    await fireEvent.press(screen.getByLabelText('Create account'));
    expect(screen.getByText('Enter your email.')).toBeTruthy();
    expect(screen.getByText('Enter your password.')).toBeTruthy();
    expect(screen.getByText('Enter your password again.')).toBeTruthy();
    expect(mockRepo.signUp).not.toHaveBeenCalled();
  });

  it.each([
    {
      problem: 'fewer than 8 characters',
      password: 'short1',
      message: 'Use at least 8 characters.',
    },
    { problem: 'no letter', password: '12345678', message: 'Add at least one letter.' },
    { problem: 'no number', password: 'abcdefgh', message: 'Add at least one number.' },
    {
      problem: 'over 72 characters',
      password: `${'a'.repeat(72)}1`,
      message: 'Use 72 characters or fewer.',
    },
  ])('says what is wrong with a password with $problem, and calls nothing', async (row) => {
    await render(<AccountScreen />);
    await openSignUp();
    await fillInSignUp('me@example.com', row.password);
    await fireEvent.press(screen.getByLabelText('Create account'));
    expect(screen.getByText(row.message)).toBeTruthy();
    expect(mockRepo.signUp).not.toHaveBeenCalled();
  });

  it('says when the two passwords differ, and drops the message once they match', async () => {
    await render(<AccountScreen />);
    await openSignUp();
    await fillInSignUp('me@example.com', NEW_PASSWORD, 'long-enough-pass2');
    await fireEvent.press(screen.getByLabelText('Create account'));
    expect(screen.getByText(MISMATCH)).toBeTruthy();
    expect(mockRepo.signUp).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Confirm password'), NEW_PASSWORD);
    expect(screen.queryByText(MISMATCH)).toBeNull();

    await fireEvent.press(screen.getByLabelText('Create account'));
    await waitFor(() => expect(mockRepo.signUp).toHaveBeenCalledTimes(1));
  });

  it('drops the mismatch message too when the first password is changed to match', async () => {
    await render(<AccountScreen />);
    await openSignUp();
    await fillInSignUp('me@example.com', NEW_PASSWORD, 'long-enough-pass2');
    await fireEvent.press(screen.getByLabelText('Create account'));
    expect(screen.getByText(MISMATCH)).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Password'), 'long-enough-pass2');
    expect(screen.queryByText(MISMATCH)).toBeNull();
  });

  it('does not scold the password fields for being left; only sending the form does', async () => {
    await render(<AccountScreen />);
    await openSignUp();
    await fireEvent.changeText(screen.getByLabelText('Password'), 'abc');
    await fireEvent(screen.getByLabelText('Password'), 'blur');
    await fireEvent(screen.getByLabelText('Confirm password'), 'blur');
    expect(screen.queryByText('Use at least 8 characters.')).toBeNull();
    expect(screen.queryByText('Enter your password again.')).toBeNull();

    await fireEvent.press(screen.getByLabelText('Create account'));
    expect(screen.getByText('Use at least 8 characters.')).toBeTruthy();
    expect(screen.getByText('Enter your password again.')).toBeTruthy();
  });

  it('shows and hides both password fields together', async () => {
    await render(<AccountScreen />);
    await openSignUp();
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
    expect(screen.getByLabelText('Confirm password').props.secureTextEntry).toBe(true);

    await fireEvent.press(screen.getByLabelText('Show password'));
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(false);
    expect(screen.getByLabelText('Confirm password').props.secureTextEntry).toBe(false);

    await fireEvent.press(screen.getByLabelText('Hide password'));
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
    expect(screen.getByLabelText('Confirm password').props.secureTextEntry).toBe(true);
  });

  it('sends the sign-up and tells the player to check their email, without saying more', async () => {
    await render(<AccountScreen />);
    await openSignUp();
    await fillInSignUp(' me@example.com ', NEW_PASSWORD);
    await fireEvent.press(screen.getByLabelText('Create account'));
    expect(await screen.findByText('Check your email')).toBeTruthy();
    // Only the email and the password go to the account service: not the second copy.
    expect(mockRepo.signUp).toHaveBeenCalledWith({
      email: 'me@example.com',
      password: NEW_PASSWORD,
    });
    expect(
      screen.getByText(
        'If me@example.com can be used for a new account, a confirmation link is on its way. Open it, then come back and sign in.',
      ),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Email')).toBeNull();

    await fireEvent.press(screen.getByLabelText('Back to sign in'));
    expect(await screen.findByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Sign in')).toBeTruthy();
    expect(screen.queryByText('Check your email')).toBeNull();
  });

  it('shows no check-your-email notice when the service signed the player straight in', async () => {
    mockRepo.signUp.mockResolvedValue('signedIn');
    await render(<AccountScreen />);
    await openSignUp();
    await fillInSignUp('me@example.com', NEW_PASSWORD);
    await fireEvent.press(screen.getByLabelText('Create account'));
    await waitFor(() => expect(mockRepo.signUp).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Check your email')).toBeNull();

    // Neither copy of the password is kept once it has been used.
    await waitFor(() => expect(screen.getByLabelText('Password').props.value).toBe(''));
    expect(screen.getByLabelText('Confirm password').props.value).toBe('');

    await act(async () => emit(player));
    expect(await screen.findByLabelText('Signed in as me@example.com')).toBeTruthy();
  });

  it('explains a failed sign-up and clears old messages when switching back to sign in', async () => {
    mockRepo.signUp.mockRejectedValueOnce(new AccountError('cannotCreate'));
    await render(<AccountScreen />);
    await openSignUp();
    await fillInSignUp('me@example.com', NEW_PASSWORD);
    await fireEvent.press(screen.getByLabelText('Create account'));
    expect(
      await screen.findByText(
        'Could not create that account. If you already have one, try signing in.',
      ),
    ).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Already have an account? Sign in'));
    expect(screen.queryByText(/Could not create that account/)).toBeNull();
    expect(screen.getByLabelText('Sign in')).toBeTruthy();
  });
});

describe('Account screen: signed in', () => {
  beforeEach(() => mockRepo.getUser.mockResolvedValue(player));

  it('shows who is signed in and that nothing is backed up yet', async () => {
    await render(<AccountScreen />);
    expect(await screen.findByLabelText('Signed in as me@example.com')).toBeTruthy();
    expect(screen.getByLabelText('Sign out')).toBeTruthy();
    expect(screen.getByLabelText('Delete account')).toBeTruthy();
    expect(screen.getByText(BACKUP_NOTE)).toBeTruthy();
    expect(screen.queryByLabelText('Email')).toBeNull();
  });

  it('goes back to the sign-in form when the account service signs the player out', async () => {
    await render(<AccountScreen />);
    await screen.findByLabelText('Sign out');
    await act(async () => emit(null));
    expect(await screen.findByLabelText('Email')).toBeTruthy();
    expect(screen.queryByLabelText('Sign out')).toBeNull();
  });

  it('signs out', async () => {
    await render(<AccountScreen />);
    await fireEvent.press(await screen.findByLabelText('Sign out'));
    await waitFor(() => expect(mockRepo.signOut).toHaveBeenCalledTimes(1));
  });

  it('stays signed in and says why when signing out fails', async () => {
    mockRepo.signOut.mockRejectedValueOnce(new AccountError('network'));
    await render(<AccountScreen />);
    await fireEvent.press(await screen.findByLabelText('Sign out'));
    expect(await screen.findByText(NO_NETWORK)).toBeTruthy();
    expect(screen.getByLabelText('Sign out')).not.toBeDisabled();
  });

  it('says nothing about a deleted account after a plain sign-out', async () => {
    await render(<AccountScreen />);
    await screen.findByLabelText('Sign out');
    await act(async () => emit(null));
    expect(await screen.findByLabelText('Email')).toBeTruthy();
    expect(screen.queryByText('Account deleted')).toBeNull();
  });
});

describe('Account screen: deleting the account', () => {
  const CONFIRM = 'Yes, delete my account';
  const WHAT_STAYS = /are not deleted/;
  const DELETED_BODY =
    'Your account and anything stored with it online were removed. Your workouts, shooting and plans on this phone are still here.';

  beforeEach(() => mockRepo.getUser.mockResolvedValue(player));

  const openForm = async () => {
    await fireEvent.press(await screen.findByLabelText('Delete account'));
  };
  const typePassword = (password: string) =>
    fireEvent.changeText(screen.getByLabelText('Password'), password);

  it('asks for the password first, and deletes nothing when the player cancels', async () => {
    await render(<AccountScreen />);
    await openForm();
    expect(screen.getByText('Delete your account?')).toBeTruthy();
    expect(screen.getByText(WHAT_STAYS)).toBeTruthy();
    expect(screen.getByText('Enter your password to confirm. This cannot be undone.')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
    // The form takes the place of the two buttons, so a stray tap cannot reach either of them.
    expect(screen.queryByLabelText('Sign out')).toBeNull();
    expect(screen.queryByLabelText('Delete account')).toBeNull();

    await fireEvent.press(screen.getByLabelText('Cancel'));
    expect(screen.queryByLabelText('Password')).toBeNull();
    expect(screen.getByLabelText('Sign out')).toBeTruthy();
    expect(screen.getByLabelText('Delete account')).toBeTruthy();
    expect(mockRepo.deleteAccount).not.toHaveBeenCalled();
  });

  it('calls nothing without a password, and drops the message once one is typed', async () => {
    await render(<AccountScreen />);
    await openForm();
    await fireEvent.press(screen.getByLabelText(CONFIRM));
    expect(screen.getByText('Enter your password.')).toBeTruthy();
    expect(mockRepo.deleteAccount).not.toHaveBeenCalled();

    await typePassword('x');
    expect(screen.queryByText('Enter your password.')).toBeNull();
  });

  it('deletes the account with the password the player typed', async () => {
    await render(<AccountScreen />);
    await openForm();
    await typePassword('secret-pass');
    await fireEvent.press(screen.getByLabelText(CONFIRM));
    await waitFor(() => expect(mockRepo.deleteAccount).toHaveBeenCalledTimes(1));
    expect(mockRepo.deleteAccount).toHaveBeenCalledWith('secret-pass');
  });

  it('deletes from the keyboard Done key as well', async () => {
    await render(<AccountScreen />);
    await openForm();
    await typePassword('secret-pass');
    await fireEvent(screen.getByLabelText('Password'), 'submitEditing');
    await waitFor(() => expect(mockRepo.deleteAccount).toHaveBeenCalledTimes(1));
  });

  it('says the account is gone, even though the sign-out arrives before the call returns', async () => {
    let finish!: () => void;
    mockRepo.deleteAccount.mockReturnValue(new Promise<void>((r) => (finish = r)));
    await render(<AccountScreen />);
    await openForm();
    await typePassword('secret-pass');
    // Not awaited: the press resolves only when deleting has finished.
    const press = fireEvent.press(screen.getByLabelText(CONFIRM));
    await waitFor(() => expect(mockRepo.deleteAccount).toHaveBeenCalledTimes(1));

    // The account service signs this phone out as part of deleting, before the call comes back.
    await act(async () => emit(null));
    expect(await screen.findByLabelText('Email')).toBeTruthy();

    await act(async () => finish());
    await press;
    expect(await screen.findByText('Account deleted')).toBeTruthy();
    expect(screen.getByText(DELETED_BODY)).toBeTruthy();
    expect(screen.getByLabelText('Sign in')).toBeTruthy();
  });

  it('stops saying the account was deleted once someone signs in again', async () => {
    await render(<AccountScreen />);
    await openForm();
    await typePassword('secret-pass');
    await fireEvent.press(screen.getByLabelText(CONFIRM));
    await act(async () => emit(null));
    expect(await screen.findByText('Account deleted')).toBeTruthy();

    await act(async () => emit(player));
    expect(await screen.findByLabelText('Signed in as me@example.com')).toBeTruthy();
    expect(screen.queryByText('Account deleted')).toBeNull();

    await act(async () => emit(null));
    expect(await screen.findByLabelText('Email')).toBeTruthy();
    expect(screen.queryByText('Account deleted')).toBeNull();
  });

  it('says the password is wrong, keeps the account, and drops the message when it is retyped', async () => {
    mockRepo.deleteAccount.mockRejectedValueOnce(new AccountError('wrongPassword'));
    await render(<AccountScreen />);
    await openForm();
    await typePassword('not-it');
    await fireEvent.press(screen.getByLabelText(CONFIRM));
    expect(await screen.findByText('That password is not right.')).toBeTruthy();
    expect(screen.getByLabelText('Signed in as me@example.com')).toBeTruthy();
    expect(screen.getByLabelText(CONFIRM)).not.toBeDisabled();

    await typePassword('not-it-either');
    expect(screen.queryByText('That password is not right.')).toBeNull();
  });

  it.each([
    {
      reason: 'the service is not ready',
      error: new AccountError('notAvailable'),
      message: 'This is not available yet. Please try again later.',
    },
    { reason: 'there is no connection', error: new AccountError('network'), message: NO_NETWORK },
    { reason: 'it fails in a way it does not know', error: new Error('boom'), message: UNKNOWN },
  ])('says so, and stays signed in, when $reason', async ({ error, message }) => {
    mockRepo.deleteAccount.mockRejectedValueOnce(error);
    await render(<AccountScreen />);
    await openForm();
    await typePassword('secret-pass');
    await fireEvent.press(screen.getByLabelText(CONFIRM));
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.getByLabelText('Signed in as me@example.com')).toBeTruthy();
    expect(screen.getByLabelText(CONFIRM)).not.toBeDisabled();

    // Cancelling takes the message away with the form, and the two buttons come back.
    await fireEvent.press(screen.getByLabelText('Cancel'));
    expect(screen.queryByText(message)).toBeNull();
    expect(screen.getByLabelText('Delete account')).not.toBeDisabled();
  });

  it('ignores a second tap while deleting', async () => {
    let finish!: () => void;
    mockRepo.deleteAccount.mockReturnValue(new Promise<void>((r) => (finish = r)));
    await render(<AccountScreen />);
    await openForm();
    await typePassword('secret-pass');
    // Not awaited: the press resolves only when deleting has finished.
    const firstPress = fireEvent.press(screen.getByLabelText(CONFIRM));
    await waitFor(() => expect(mockRepo.deleteAccount).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText(CONFIRM)).toBeDisabled();
    expect(screen.getByLabelText('Cancel')).toBeDisabled();

    await fireEvent.press(screen.getByLabelText(CONFIRM));
    expect(mockRepo.deleteAccount).toHaveBeenCalledTimes(1);

    await act(async () => finish());
    await firstPress;
    expect(screen.getByLabelText(CONFIRM)).not.toBeDisabled();
  });

  it('hides the password until asked, and hides it again', async () => {
    await render(<AccountScreen />);
    await openForm();
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);

    await fireEvent.press(screen.getByLabelText('Show password'));
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(false);

    await fireEvent.press(screen.getByLabelText('Hide password'));
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
  });
});
