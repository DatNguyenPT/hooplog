import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { ProfileRepository } from '@/features/profile/data/profileRepository';
import '@/shared/i18n';
import type { Profile } from '../domain/profile';
import { SettingsScreen } from './SettingsScreen';

const mockRepo: jest.Mocked<ProfileRepository> = {
  getProfile: jest.fn(),
  saveDisplayName: jest.fn(),
  completeOnboarding: jest.fn(),
};
const mockBack = jest.fn();

jest.mock('@/features/profile/data/profileRepository', () => ({
  useProfileRepository: () => mockRepo,
}));

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    router: { back: () => mockBack() },
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: jest.requireActual('react-native').View,
}));

const NAME_FIELD = 'Your name';
const TOO_LONG = 'Keep your name to 40 characters or fewer.';
const SAVE_FAILED = 'Could not save that. Please try again.';
const named: Profile = { displayName: 'Dat', onboardedAt: '2026-01-01T08:00:00.000Z' };

beforeEach(() => {
  // RNTL waits run outside act(); React logs a harmless notice for our promise-driven state updates.
  const consoleError = console.error;
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (String(args[0]).includes('not configured to support act')) return;
    consoleError(...args);
  });
  jest.clearAllMocks();
  mockRepo.getProfile.mockResolvedValue(named);
  mockRepo.saveDisplayName.mockResolvedValue(undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('Settings screen', () => {
  it('shows a loading indicator, then the saved name and the fixed preferences', async () => {
    let resolve!: (value: Profile) => void;
    mockRepo.getProfile.mockReturnValue(new Promise<Profile>((r) => (resolve = r)));
    await render(<SettingsScreen />);
    expect(screen.getByLabelText('Loading…')).toBeTruthy();
    expect(screen.queryByLabelText(NAME_FIELD)).toBeNull();

    await act(async () => resolve(named));
    expect((await screen.findByLabelText(NAME_FIELD)).props.value).toBe('Dat');
    expect(screen.queryByLabelText('Loading…')).toBeNull();
    // Units and language have a single option each, so they are shown, not offered.
    expect(screen.getByLabelText('Units: Metric (kg, m, cm)')).toBeTruthy();
    expect(screen.getByLabelText('Language: English')).toBeTruthy();
    expect(
      screen.getByText('Everything you log is saved on this phone. No account is needed.'),
    ).toBeTruthy();
    expect(screen.queryByText('Saved.')).toBeNull();
  });

  it('starts with an empty field when no name has been saved', async () => {
    mockRepo.getProfile.mockResolvedValue({ displayName: null, onboardedAt: null });
    await render(<SettingsScreen />);
    expect((await screen.findByLabelText(NAME_FIELD)).props.value).toBe('');
  });

  it('shows the error state and retries', async () => {
    mockRepo.getProfile.mockRejectedValueOnce(new Error('boom'));
    await render(<SettingsScreen />);
    expect(await screen.findByText('Something went wrong.')).toBeTruthy();
    expect(screen.queryByLabelText(NAME_FIELD)).toBeNull();
    // Leaving must still work when the profile cannot be read.
    expect(screen.getByLabelText('Back')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Try again'));
    expect((await screen.findByLabelText(NAME_FIELD)).props.value).toBe('Dat');
  });

  it('saves the tidied name and confirms it', async () => {
    await render(<SettingsScreen />);
    await fireEvent.changeText(await screen.findByLabelText(NAME_FIELD), '  Dat   Nguyen ');
    await fireEvent.press(screen.getByLabelText('Save name'));
    expect(await screen.findByText('Saved.')).toBeTruthy();
    expect(mockRepo.saveDisplayName).toHaveBeenCalledWith('Dat Nguyen');
    expect(mockRepo.saveDisplayName).toHaveBeenCalledTimes(1);
    // The field shows what was saved.
    expect(screen.getByLabelText(NAME_FIELD).props.value).toBe('Dat Nguyen');
  });

  it('saves from the keyboard Done key as well', async () => {
    await render(<SettingsScreen />);
    const field = await screen.findByLabelText(NAME_FIELD);
    await fireEvent.changeText(field, 'Sam');
    await fireEvent(field, 'submitEditing');
    expect(await screen.findByText('Saved.')).toBeTruthy();
    expect(mockRepo.saveDisplayName).toHaveBeenCalledWith('Sam');
  });

  it('takes the confirmation away once the name is edited again', async () => {
    await render(<SettingsScreen />);
    await fireEvent.press(await screen.findByLabelText('Save name'));
    expect(await screen.findByText('Saved.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText(NAME_FIELD), 'Dato');
    expect(screen.queryByText('Saved.')).toBeNull();
  });

  it('clears the name when the field is left blank', async () => {
    await render(<SettingsScreen />);
    await fireEvent.changeText(await screen.findByLabelText(NAME_FIELD), '   ');
    await fireEvent.press(screen.getByLabelText('Save name'));
    expect(await screen.findByText('Saved.')).toBeTruthy();
    expect(mockRepo.saveDisplayName).toHaveBeenCalledWith(null);
    expect(screen.getByLabelText(NAME_FIELD).props.value).toBe('');
  });

  it('refuses a name that is too long and saves nothing', async () => {
    await render(<SettingsScreen />);
    await fireEvent.changeText(await screen.findByLabelText(NAME_FIELD), 'x'.repeat(41));
    await fireEvent.press(screen.getByLabelText('Save name'));
    expect(await screen.findByText(TOO_LONG)).toBeTruthy();
    expect(mockRepo.saveDisplayName).not.toHaveBeenCalled();
    expect(screen.queryByText('Saved.')).toBeNull();

    await fireEvent.changeText(screen.getByLabelText(NAME_FIELD), 'x'.repeat(40));
    await fireEvent.press(screen.getByLabelText('Save name'));
    expect(await screen.findByText('Saved.')).toBeTruthy();
    expect(mockRepo.saveDisplayName).toHaveBeenCalledWith('x'.repeat(40));
    expect(screen.queryByText(TOO_LONG)).toBeNull();
  });

  it('shows an inline error and keeps the typed name when saving fails, then saves on retry', async () => {
    mockRepo.saveDisplayName.mockRejectedValueOnce(new Error('disk full'));
    await render(<SettingsScreen />);
    await fireEvent.changeText(await screen.findByLabelText(NAME_FIELD), 'Sam');
    await fireEvent.press(screen.getByLabelText('Save name'));
    expect(await screen.findByText(SAVE_FAILED)).toBeTruthy();
    expect(screen.queryByText('Saved.')).toBeNull();
    expect(screen.getByLabelText(NAME_FIELD).props.value).toBe('Sam');
    expect(screen.getByLabelText('Save name')).not.toBeDisabled();

    await fireEvent.press(screen.getByLabelText('Save name'));
    expect(await screen.findByText('Saved.')).toBeTruthy();
    expect(screen.queryByText(SAVE_FAILED)).toBeNull();
    expect(mockRepo.saveDisplayName).toHaveBeenCalledTimes(2);
  });

  it('ignores a second tap while saving', async () => {
    let finish!: () => void;
    mockRepo.saveDisplayName.mockReturnValue(new Promise<void>((r) => (finish = r)));
    await render(<SettingsScreen />);
    await fireEvent.changeText(await screen.findByLabelText(NAME_FIELD), 'Sam');
    // Not awaited: the press resolves only when saving has finished.
    const firstPress = fireEvent.press(screen.getByLabelText('Save name'));
    await waitFor(() => expect(mockRepo.saveDisplayName).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText('Save name')).toBeDisabled();

    await fireEvent.press(screen.getByLabelText('Save name'));
    expect(mockRepo.saveDisplayName).toHaveBeenCalledTimes(1);

    await act(async () => finish());
    await firstPress;
    expect(await screen.findByText('Saved.')).toBeTruthy();
    expect(screen.getByLabelText('Save name')).not.toBeDisabled();
  });

  it('goes back', async () => {
    await render(<SettingsScreen />);
    await fireEvent.press(await screen.findByLabelText('Back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
