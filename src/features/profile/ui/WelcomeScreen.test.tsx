import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { ProfileRepository } from '@/features/profile/data/profileRepository';
import '@/shared/i18n';
import { WelcomeScreen } from './WelcomeScreen';

const mockRepo: jest.Mocked<ProfileRepository> = {
  getProfile: jest.fn(),
  saveDisplayName: jest.fn(),
  completeOnboarding: jest.fn(),
};
const mockReplace = jest.fn();

jest.mock('@/features/profile/data/profileRepository', () => ({
  useProfileRepository: () => mockRepo,
}));

jest.mock('expo-router', () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: jest.requireActual('react-native').View,
}));

const NAME_FIELD = 'What should we call you?';
const TOO_LONG = 'Keep your name to 40 characters or fewer.';
const SAVE_FAILED = 'Could not save that. Please try again.';

beforeEach(() => {
  // RNTL waits run outside act(); React logs a harmless notice for our promise-driven state updates.
  const consoleError = console.error;
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (String(args[0]).includes('not configured to support act')) return;
    consoleError(...args);
  });
  jest.clearAllMocks();
  mockRepo.completeOnboarding.mockResolvedValue(undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('Welcome screen', () => {
  it('explains the app, says no account is needed and asks for an optional name', async () => {
    await render(<WelcomeScreen />);
    expect(screen.getByText('Welcome to HoopLog')).toBeTruthy();
    expect(
      screen.getByText('No account needed. Everything you log stays on this phone.'),
    ).toBeTruthy();
    expect(screen.getByLabelText(NAME_FIELD)).toBeTruthy();
    expect(screen.getByText('Optional. You can change it later in Settings.')).toBeTruthy();
    expect(screen.getByLabelText('Get started')).toBeTruthy();
    expect(screen.getByLabelText('Skip for now')).toBeTruthy();
    // Opening the screen records nothing: the welcome counts as seen only when it is finished.
    expect(mockRepo.completeOnboarding).not.toHaveBeenCalled();
  });

  it('saves the tidied name, then opens Home', async () => {
    await render(<WelcomeScreen />);
    await fireEvent.changeText(screen.getByLabelText(NAME_FIELD), '  Dat   Nguyen ');
    await fireEvent.press(screen.getByLabelText('Get started'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
    expect(mockRepo.completeOnboarding).toHaveBeenCalledWith('Dat Nguyen');
    expect(mockRepo.completeOnboarding).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  it('starts without a name when none is typed', async () => {
    await render(<WelcomeScreen />);
    await fireEvent.press(screen.getByLabelText('Get started'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
    expect(mockRepo.completeOnboarding).toHaveBeenCalledWith(null);
  });

  it('starts from the keyboard Done key as well', async () => {
    await render(<WelcomeScreen />);
    const field = screen.getByLabelText(NAME_FIELD);
    await fireEvent.changeText(field, 'Dat');
    await fireEvent(field, 'submitEditing');
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
    expect(mockRepo.completeOnboarding).toHaveBeenCalledWith('Dat');
  });

  it('skips without saving a name, even when one was typed', async () => {
    await render(<WelcomeScreen />);
    // Longer than allowed on purpose: skipping must not trip over the name.
    await fireEvent.changeText(screen.getByLabelText(NAME_FIELD), 'x'.repeat(41));
    await fireEvent.press(screen.getByLabelText('Skip for now'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
    expect(mockRepo.completeOnboarding).toHaveBeenCalledWith(null);
    expect(screen.queryByText(TOO_LONG)).toBeNull();
  });

  it('refuses a name that is too long, then accepts a corrected one', async () => {
    await render(<WelcomeScreen />);
    await fireEvent.changeText(screen.getByLabelText(NAME_FIELD), 'x'.repeat(41));
    await fireEvent.press(screen.getByLabelText('Get started'));
    expect(await screen.findByText(TOO_LONG)).toBeTruthy();
    expect(mockRepo.completeOnboarding).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText(NAME_FIELD), 'x'.repeat(40));
    await fireEvent.press(screen.getByLabelText('Get started'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
    expect(mockRepo.completeOnboarding).toHaveBeenCalledWith('x'.repeat(40));
    expect(screen.queryByText(TOO_LONG)).toBeNull();
  });

  it('stays on the screen with the typed name when saving fails, and can try again', async () => {
    mockRepo.completeOnboarding.mockRejectedValueOnce(new Error('disk full'));
    await render(<WelcomeScreen />);
    await fireEvent.changeText(screen.getByLabelText(NAME_FIELD), 'Dat');
    await fireEvent.press(screen.getByLabelText('Get started'));
    expect(await screen.findByText(SAVE_FAILED)).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByLabelText(NAME_FIELD).props.value).toBe('Dat');
    expect(screen.getByLabelText('Get started')).not.toBeDisabled();

    await fireEvent.press(screen.getByLabelText('Get started'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
    expect(mockRepo.completeOnboarding).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(SAVE_FAILED)).toBeNull();
  });

  it('ignores further taps while saving and disables both buttons', async () => {
    let finish!: () => void;
    mockRepo.completeOnboarding.mockReturnValue(new Promise<void>((r) => (finish = r)));
    await render(<WelcomeScreen />);
    // Not awaited: the press resolves only when saving has finished.
    const firstPress = fireEvent.press(screen.getByLabelText('Get started'));
    await waitFor(() => expect(mockRepo.completeOnboarding).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText('Get started')).toBeDisabled();
    expect(screen.getByLabelText('Skip for now')).toBeDisabled();

    await fireEvent.press(screen.getByLabelText('Get started'));
    await fireEvent.press(screen.getByLabelText('Skip for now'));
    expect(mockRepo.completeOnboarding).toHaveBeenCalledTimes(1);

    await act(async () => finish());
    await firstPress;
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });
});
