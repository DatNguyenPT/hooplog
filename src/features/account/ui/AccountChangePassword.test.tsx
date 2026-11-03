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
const OLD_PASSWORD = 'old-password1';
const NEW_PASSWORD = 'long-enough-pass1';
const WRONG = 'That password is not right.';
const WEAK = 'Choose a stronger password.';
const SAME_SERVER = 'Choose a password different from your current one.';
const SAME_LOCAL = 'Choose a password different from the current one.';
const MISMATCH = 'The passwords do not match.';
const NOT_AVAILABLE = 'This is not available yet. Please try again later.';
const NO_NETWORK = 'Could not reach the server. Check your internet connection and try again.';
const UNKNOWN = 'Something went wrong. Please try again.';
const CHANGED_BODY = 'Your password was changed. Use the new one the next time you sign in.';

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
  mockRepo.getUser.mockResolvedValue(player);
  mockRepo.onChange.mockImplementation((listener) => {
    emit = listener;
    return unsubscribe;
  });
  mockRepo.signOut.mockResolvedValue(undefined);
  mockRepo.changePassword.mockResolvedValue(undefined);
});

afterEach(() => jest.restoreAllMocks());

/** Signed in, with the change-password form open. */
async function openForm() {
  await render(<AccountScreen />);
  await fireEvent.press(await screen.findByLabelText('Change password'));
}

async function fillIn(current: string, password: string, confirmation = password) {
  await fireEvent.changeText(screen.getByLabelText('Current password'), current);
  await fireEvent.changeText(screen.getByLabelText('New password'), password);
  await fireEvent.changeText(screen.getByLabelText('Confirm new password'), confirmation);
}

const save = () => fireEvent.press(screen.getByLabelText('Save new password'));

describe('Account screen: changing the password', () => {
  it('offers the change next to signing out and deleting the account', async () => {
    await render(<AccountScreen />);
    expect(await screen.findByLabelText('Change password')).toBeTruthy();
    expect(screen.getByLabelText('Sign out')).toBeTruthy();
    expect(screen.getByLabelText('Delete account')).toBeTruthy();
  });

  it('opens the form in place of the buttons, and Cancel brings them back', async () => {
    await openForm();
    expect(screen.getByText('Change your password')).toBeTruthy();
    expect(screen.queryByLabelText('Sign out')).toBeNull();
    expect(screen.queryByLabelText('Delete account')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Cancel'));
    expect(screen.getByLabelText('Change password')).toBeTruthy();
    expect(screen.getByLabelText('Sign out')).toBeTruthy();
    expect(screen.getByLabelText('Delete account')).toBeTruthy();
    expect(mockRepo.changePassword).not.toHaveBeenCalled();
  });

  it('asks for both passwords when the form is sent empty', async () => {
    await openForm();
    await save();
    expect(screen.getAllByText('Enter your password.')).toHaveLength(2);
    expect(mockRepo.changePassword).not.toHaveBeenCalled();
  });

  it.each([
    {
      what: 'no current password',
      current: '',
      next: NEW_PASSWORD,
      confirmation: NEW_PASSWORD,
      message: 'Enter your password.',
    },
    {
      what: 'no new password',
      current: OLD_PASSWORD,
      next: '',
      confirmation: '',
      message: 'Enter your password.',
    },
    {
      what: 'a new password that is the old one',
      current: NEW_PASSWORD,
      next: NEW_PASSWORD,
      confirmation: NEW_PASSWORD,
      message: SAME_LOCAL,
    },
    {
      what: 'no second new password',
      current: OLD_PASSWORD,
      next: NEW_PASSWORD,
      confirmation: '',
      message: 'Enter your password again.',
    },
    {
      what: 'two different new passwords',
      current: OLD_PASSWORD,
      next: NEW_PASSWORD,
      confirmation: 'different-pass1',
      message: MISMATCH,
    },
  ])('does not save with $what', async ({ current, next, confirmation, message }) => {
    await openForm();
    await fillIn(current, next, confirmation);
    await save();
    expect(screen.getByText(message)).toBeTruthy();
    expect(mockRepo.changePassword).not.toHaveBeenCalled();
  });

  it('takes a message away as soon as its field is fixed', async () => {
    await openForm();
    await fillIn(NEW_PASSWORD, NEW_PASSWORD);
    await save();
    expect(screen.getByText(SAME_LOCAL)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Current password'), OLD_PASSWORD);
    expect(screen.queryByText(SAME_LOCAL)).toBeNull();
  });

  it('changes the password, then says so until the player signs out', async () => {
    await openForm();
    await fillIn(OLD_PASSWORD, NEW_PASSWORD);
    await save();
    expect(mockRepo.changePassword).toHaveBeenCalledWith({
      currentPassword: OLD_PASSWORD,
      newPassword: NEW_PASSWORD,
    });
    expect(await screen.findByText('Password changed')).toBeTruthy();
    expect(screen.getByText(CHANGED_BODY)).toBeTruthy();
    expect(screen.queryByLabelText('Save new password')).toBeNull();
    expect(screen.getByLabelText('Sign out')).toBeTruthy();

    await act(async () => emit(null));
    await act(async () => emit(player));
    expect(screen.queryByText('Password changed')).toBeNull();
  });

  it('saves from the Done key on the keyboard', async () => {
    await openForm();
    await fillIn(OLD_PASSWORD, NEW_PASSWORD);
    await fireEvent(screen.getByLabelText('Confirm new password'), 'submitEditing');
    await waitFor(() => expect(mockRepo.changePassword).toHaveBeenCalledTimes(1));
  });

  it('blocks the buttons and a second save while the password is being changed', async () => {
    let finish!: () => void;
    mockRepo.changePassword.mockReturnValue(new Promise<void>((r) => (finish = r)));
    await openForm();
    await fillIn(OLD_PASSWORD, NEW_PASSWORD);
    const pressed = save();
    await waitFor(() => expect(screen.getByLabelText('Save new password')).toBeDisabled());
    expect(screen.getByLabelText('Cancel')).toBeDisabled();
    await fireEvent(screen.getByLabelText('Confirm new password'), 'submitEditing');
    expect(mockRepo.changePassword).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    await pressed;
    expect(await screen.findByText('Password changed')).toBeTruthy();
  });

  it('says the current password is wrong, until it is retyped', async () => {
    mockRepo.changePassword.mockRejectedValueOnce(new AccountError('wrongPassword'));
    await openForm();
    await fillIn(OLD_PASSWORD, NEW_PASSWORD);
    await save();
    expect(await screen.findByText(WRONG)).toBeTruthy();
    expect(screen.getByLabelText('Save new password')).not.toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('Current password'), 'old-password2');
    expect(screen.queryByText(WRONG)).toBeNull();
  });

  it.each([
    { key: 'weakPassword', message: WEAK },
    { key: 'samePassword', message: SAME_SERVER },
  ] as const)(
    'shows "$key" from the server, until the new password is retyped',
    async ({ key, message }) => {
      mockRepo.changePassword.mockRejectedValueOnce(new AccountError(key));
      await openForm();
      await fillIn(OLD_PASSWORD, NEW_PASSWORD);
      await save();
      expect(await screen.findByText(message)).toBeTruthy();
      await fireEvent.changeText(screen.getByLabelText('New password'), 'another-pass22');
      expect(screen.queryByText(message)).toBeNull();
    },
  );

  it.each([
    {
      reason: 'it is not available yet',
      error: new AccountError('notAvailable'),
      message: NOT_AVAILABLE,
    },
    { reason: 'there is no connection', error: new AccountError('network'), message: NO_NETWORK },
    { reason: 'something unexpected happens', error: new Error('boom'), message: UNKNOWN },
  ])(
    'shows a message when $reason, and lets the player try again or cancel',
    async ({ error, message }) => {
      mockRepo.changePassword.mockRejectedValueOnce(error);
      await openForm();
      await fillIn(OLD_PASSWORD, NEW_PASSWORD);
      await save();
      expect(await screen.findByText(message)).toBeTruthy();
      expect(screen.getByLabelText('Save new password')).not.toBeDisabled();
      await fireEvent.press(screen.getByLabelText('Cancel'));
      expect(screen.queryByText(message)).toBeNull();
      expect(screen.getByLabelText('Change password')).toBeTruthy();
    },
  );

  it('shows and hides all three passwords with one button', async () => {
    await openForm();
    const secure = () =>
      ['Current password', 'New password', 'Confirm new password'].map(
        (label) => screen.getByLabelText(label).props.secureTextEntry,
      );
    expect(secure()).toEqual([true, true, true]);
    await fireEvent.press(screen.getByLabelText('Show password'));
    expect(secure()).toEqual([false, false, false]);
    await fireEvent.press(screen.getByLabelText('Hide password'));
    expect(secure()).toEqual([true, true, true]);
  });
});
