import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

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

  it('asks for a long enough password and calls nothing until it has one', async () => {
    await render(<AccountScreen />);
    await openSignUp();
    expect(screen.getByText('At least 8 characters.')).toBeTruthy();

    await fillIn('me@example.com', 'short');
    await fireEvent.press(screen.getByLabelText('Create account'));
    expect(screen.getByText('Use at least 8 characters.')).toBeTruthy();
    expect(mockRepo.signUp).not.toHaveBeenCalled();
  });

  it('sends the sign-up and tells the player to check their email, without saying more', async () => {
    await render(<AccountScreen />);
    await openSignUp();
    await fillIn(' me@example.com ', 'long-enough-pass');
    await fireEvent.press(screen.getByLabelText('Create account'));
    expect(await screen.findByText('Check your email')).toBeTruthy();
    expect(mockRepo.signUp).toHaveBeenCalledWith({
      email: 'me@example.com',
      password: 'long-enough-pass',
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
    await fillIn('me@example.com', 'long-enough-pass');
    await fireEvent.press(screen.getByLabelText('Create account'));
    await waitFor(() => expect(mockRepo.signUp).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Check your email')).toBeNull();

    await act(async () => emit(player));
    expect(await screen.findByLabelText('Signed in as me@example.com')).toBeTruthy();
  });

  it('explains a failed sign-up and clears old messages when switching back to sign in', async () => {
    mockRepo.signUp.mockRejectedValueOnce(new AccountError('cannotCreate'));
    await render(<AccountScreen />);
    await openSignUp();
    await fillIn('me@example.com', 'long-enough-pass');
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

  it('asks before deleting the account, and deletes nothing when the player cancels', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<AccountScreen />);
    await fireEvent.press(await screen.findByLabelText('Delete account'));
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0]?.[0]).toBe('Delete your account?');
    expect(alertSpy.mock.calls[0]?.[1]).toContain('are not deleted');
    expect(mockRepo.deleteAccount).not.toHaveBeenCalled();

    const buttons = alertSpy.mock.calls[0]?.[2] ?? [];
    expect(buttons.find((button) => button.style === 'cancel')?.onPress).toBeUndefined();
    expect(mockRepo.deleteAccount).not.toHaveBeenCalled();
  });

  it('deletes the account once the player confirms', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<AccountScreen />);
    await fireEvent.press(await screen.findByLabelText('Delete account'));
    const confirm = (alertSpy.mock.calls[0]?.[2] ?? []).find((b) => b.style === 'destructive');
    await act(async () => confirm?.onPress?.());
    await waitFor(() => expect(mockRepo.deleteAccount).toHaveBeenCalledTimes(1));
  });

  it('says so when the account cannot be deleted yet, and stays signed in', async () => {
    mockRepo.deleteAccount.mockRejectedValueOnce(new AccountError('notAvailable'));
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<AccountScreen />);
    await fireEvent.press(await screen.findByLabelText('Delete account'));
    const confirm = (alertSpy.mock.calls[0]?.[2] ?? []).find((b) => b.style === 'destructive');
    await act(async () => confirm?.onPress?.());
    expect(
      await screen.findByText('This is not available yet. Please try again later.'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Signed in as me@example.com')).toBeTruthy();
    expect(screen.getByLabelText('Delete account')).not.toBeDisabled();
  });
});
