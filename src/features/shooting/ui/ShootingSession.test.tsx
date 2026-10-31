import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import ShootingSession from '@/app/shooting/[id]';
import type { ShootingRepository } from '@/features/shooting/data/shootingRepository';
import '@/shared/i18n';

const mockRepo: jest.Mocked<ShootingRepository> = {
  getActiveSessionId: jest.fn(),
  startOrResumeSession: jest.fn(),
  getSession: jest.fn(),
  addShot: jest.fn(),
  undoLastShot: jest.fn(),
  endSession: jest.fn(),
  listSessions: jest.fn(),
  shotsBetween: jest.fn(),
};
const mockDismissTo = jest.fn();

jest.mock('@/features/shooting/data/shootingRepository', () => ({
  useShootingRepository: () => mockRepo,
}));

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    router: { dismissTo: (...args: unknown[]) => mockDismissTo(...args) },
    useLocalSearchParams: () => ({ id: 's1' }),
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: jest.requireActual('react-native').View,
}));

const session = (results: ('made' | 'missed')[]) => ({
  id: 's1',
  startedAt: '2026-05-01T10:00:00.000Z',
  endedAt: null,
  results,
});

beforeEach(() => {
  // RNTL waits run outside act(); React logs a harmless notice for our promise-driven state updates.
  const consoleError = console.error;
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (String(args[0]).includes('not configured to support act')) return;
    consoleError(...args);
  });
  jest.clearAllMocks();
  mockRepo.addShot.mockResolvedValue();
  mockRepo.undoLastShot.mockResolvedValue();
  mockRepo.endSession.mockResolvedValue();
});

afterEach(() => jest.restoreAllMocks());

describe('ShootingSession screen', () => {
  it('shows a loading indicator, then the session stats', async () => {
    let resolve!: (value: ReturnType<typeof session>) => void;
    mockRepo.getSession.mockReturnValue(new Promise((r) => (resolve = r)));
    await render(<ShootingSession />);
    expect(screen.getByLabelText('Loading…')).toBeTruthy();
    await act(async () => resolve(session(['made', 'missed', 'made'])));
    expect(await screen.findByText('67%')).toBeTruthy();
    expect(screen.getByText('2 / 3 made')).toBeTruthy();
    expect(screen.getByLabelText('Last shots, newest first: Made, Missed, Made')).toBeTruthy();
  });

  it('shows the error state when loading fails', async () => {
    mockRepo.getSession.mockRejectedValue(new Error('boom'));
    await render(<ShootingSession />);
    expect(await screen.findByText('Something went wrong.')).toBeTruthy();
  });

  it('records Made and Undo through the repository', async () => {
    mockRepo.getSession.mockResolvedValue(session(['missed']));
    await render(<ShootingSession />);
    fireEvent.press(await screen.findByLabelText('Made'));
    await waitFor(() => expect(mockRepo.addShot).toHaveBeenCalledWith('s1', 'made'));
    fireEvent.press(screen.getByLabelText('Undo last shot'));
    await waitFor(() => expect(mockRepo.undoLastShot).toHaveBeenCalledWith('s1'));
  });

  it('shows an inline error when saving a shot fails', async () => {
    mockRepo.getSession.mockResolvedValue(session([]));
    mockRepo.addShot.mockRejectedValue(new Error('disk full'));
    await render(<ShootingSession />);
    fireEvent.press(await screen.findByLabelText('Made'));
    expect(await screen.findByText('Could not save that. Please try again.')).toBeTruthy();
  });

  it('asks for confirmation before ending, then returns home', async () => {
    mockRepo.getSession.mockResolvedValue(session(['made']));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<ShootingSession />);
    fireEvent.press(await screen.findByLabelText('End session'));
    expect(mockRepo.endSession).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0][2] ?? [];
    buttons.find((b) => b.style === 'destructive')?.onPress?.();
    await waitFor(() => expect(mockRepo.endSession).toHaveBeenCalledWith('s1'));
    await waitFor(() => expect(mockDismissTo).toHaveBeenCalledWith('/'));
  });
});
