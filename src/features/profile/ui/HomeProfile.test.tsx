import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import Home from '@/app/index';
import type { ProfileRepository } from '@/features/profile/data/profileRepository';
import type { ShootingRepository } from '@/features/shooting/data/shootingRepository';
import type { PlanRepository } from '@/features/training-plans/data/planRepository';
import type { WorkoutRepository } from '@/features/workouts/data/workoutRepository';
import '@/shared/i18n';
import type { Profile } from '../domain/profile';

const mockProfile: jest.Mocked<ProfileRepository> = {
  getProfile: jest.fn(),
  saveDisplayName: jest.fn(),
  completeOnboarding: jest.fn(),
};
const mockPlans: jest.Mocked<PlanRepository> = {
  listPlans: jest.fn(),
  getPlan: jest.fn(),
  getActivePlan: jest.fn(),
  createPlan: jest.fn(),
  renamePlan: jest.fn(),
  setActive: jest.fn(),
  deletePlan: jest.fn(),
  addItem: jest.fn(),
  updateItem: jest.fn(),
  removeItem: jest.fn(),
};
const mockWorkouts: jest.Mocked<WorkoutRepository> = {
  getActiveSessionId: jest.fn(),
  startOrResumeSession: jest.fn(),
  getSession: jest.fn(),
  addSet: jest.fn(),
  updateSet: jest.fn(),
  deleteSet: jest.fn(),
  endSession: jest.fn(),
  listSessions: jest.fn(),
  setsBetween: jest.fn(),
};
const mockShooting: jest.Mocked<ShootingRepository> = {
  getActiveSessionId: jest.fn(),
  startOrResumeSession: jest.fn(),
  getSession: jest.fn(),
  addShot: jest.fn(),
  undoLastShot: jest.fn(),
  endSession: jest.fn(),
  listSessions: jest.fn(),
  shotsBetween: jest.fn(),
};
const mockPush = jest.fn();
const mockRedirect = jest.fn();

jest.mock('@/features/profile/data/profileRepository', () => ({
  useProfileRepository: () => mockProfile,
}));
jest.mock('@/features/training-plans/data/planRepository', () => ({
  usePlanRepository: () => mockPlans,
}));
jest.mock('@/features/workouts/data/workoutRepository', () => ({
  useWorkoutRepository: () => mockWorkouts,
}));
jest.mock('@/features/shooting/data/shootingRepository', () => ({
  useShootingRepository: () => mockShooting,
}));

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    Redirect: ({ href }: { href: string }) => {
      mockRedirect(href);
      return null;
    },
    router: { push: (...args: unknown[]) => mockPush(...args) },
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: jest.requireActual('react-native').View,
}));

/** A player who has already been through the welcome screen. */
const returning: Profile = { displayName: null, onboardedAt: '2026-01-01T08:00:00.000Z' };

beforeEach(() => {
  // RNTL waits run outside act(); React logs a harmless notice for our promise-driven state updates,
  // and FlatList batches its rows on a timer that fires outside act() in the same way.
  const consoleError = console.error;
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    const message = String(args[0]);
    if (message.includes('not configured to support act')) return;
    if (message.includes('update to VirtualizedList inside a test was not wrapped in act')) return;
    consoleError(...args);
  });
  jest.clearAllMocks();
  mockProfile.getProfile.mockResolvedValue(returning);
  mockPlans.getActivePlan.mockResolvedValue(null);
  mockShooting.listSessions.mockResolvedValue([]);
  mockShooting.getActiveSessionId.mockResolvedValue(null);
  mockShooting.shotsBetween.mockResolvedValue([]);
  mockWorkouts.listSessions.mockResolvedValue([]);
  mockWorkouts.getActiveSessionId.mockResolvedValue(null);
  mockWorkouts.setsBetween.mockResolvedValue([]);
});

afterEach(() => jest.restoreAllMocks());

describe('Home and the player profile', () => {
  it('greets the player by name', async () => {
    mockProfile.getProfile.mockResolvedValue({ ...returning, displayName: 'Dat' });
    await render(<Home />);
    expect(await screen.findByText('Hi, Dat')).toBeTruthy();
    expect(screen.getByLabelText('Start shooting session')).toBeTruthy();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('shows no greeting when the player has not given a name', async () => {
    await render(<Home />);
    expect(await screen.findByText('Nothing logged yet')).toBeTruthy();
    expect(screen.queryByText(/^Hi,/)).toBeNull();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('sends a first-time player to the welcome screen instead of showing Home', async () => {
    mockProfile.getProfile.mockResolvedValue({ displayName: null, onboardedAt: null });
    await render(<Home />);
    await waitFor(() => expect(mockRedirect).toHaveBeenCalledWith('/welcome'));
    expect(screen.queryByLabelText('Start shooting session')).toBeNull();
    expect(screen.queryByLabelText('Settings')).toBeNull();
  });

  it('keeps Home hidden until the profile is known, so a new player never sees it flash', async () => {
    let resolve!: (value: Profile) => void;
    mockProfile.getProfile.mockReturnValue(new Promise<Profile>((r) => (resolve = r)));
    await render(<Home />);
    expect(screen.getByLabelText('Loading…')).toBeTruthy();
    expect(screen.queryByLabelText('Start shooting session')).toBeNull();
    expect(mockRedirect).not.toHaveBeenCalled();

    await act(async () => resolve(returning));
    expect(await screen.findByLabelText('Start shooting session')).toBeTruthy();
    expect(screen.queryByLabelText('Loading…')).toBeNull();
  });

  it('still opens Home, without a greeting, when the profile cannot be read', async () => {
    mockProfile.getProfile.mockRejectedValue(new Error('boom'));
    await render(<Home />);
    expect(await screen.findByLabelText('Start shooting session')).toBeTruthy();
    expect(screen.queryByText(/^Hi,/)).toBeNull();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('opens Settings', async () => {
    await render(<Home />);
    await fireEvent.press(await screen.findByLabelText('Settings'));
    expect(mockPush).toHaveBeenCalledWith('/settings');
    expect(mockPush).toHaveBeenCalledTimes(1);
  });
});
