import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import Home from '@/app/index';
import type { PlanRepository } from '@/features/training-plans/data/planRepository';
import type { ShootingRepository } from '@/features/shooting/data/shootingRepository';
import type { Exercise } from '@/features/workouts/domain/exercise';
import type { WorkoutRepository } from '@/features/workouts/data/workoutRepository';
import '@/shared/i18n';
import type { Plan } from '../domain/plan';

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
    router: { push: (...args: unknown[]) => mockPush(...args) },
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: jest.requireActual('react-native').View,
}));

const PUSH_UP: Exercise = {
  id: '00000000-0000-4000-8000-000000000009',
  name: 'push_up',
  category: 'strength',
  measurementType: 'reps',
  isBuiltin: true,
};
const none = { reps: null, weightKg: null, durationS: null, distanceM: null };
const plan: Plan = {
  id: 'p1',
  name: 'Match prep',
  isActive: true,
  items: [
    {
      kind: 'exercise',
      id: 'i3',
      weekday: 3,
      exercise: PUSH_UP,
      sets: 3,
      target: { ...none, reps: 15 },
    },
    { kind: 'shooting', id: 'i6', weekday: 3, shots: 50 },
  ],
};
const PUSH_UP_ROW = 'Start Push-up, 3 sets × 15 reps, 0 / 3 sets';
const SHOOTING_ROW = 'Start Shooting, 50 shots, 0 / 50 shots';

beforeEach(() => {
  // Only Date is faked, so the timers React Native Testing Library waits on keep working.
  jest.useFakeTimers({
    now: new Date(2026, 0, 7, 12, 0), // a Wednesday
    doNotFake: [
      'hrtime',
      'nextTick',
      'performance',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
      'setImmediate',
      'clearImmediate',
      'setInterval',
      'clearInterval',
      'setTimeout',
      'clearTimeout',
    ],
  });
  // RNTL waits run outside act(); React logs a harmless notice for our promise-driven state updates.
  const consoleError = console.error;
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (String(args[0]).includes('not configured to support act')) return;
    consoleError(...args);
  });
  jest.clearAllMocks();
  mockPlans.getActivePlan.mockResolvedValue(plan);
  mockShooting.listSessions.mockResolvedValue([]);
  mockShooting.getActiveSessionId.mockResolvedValue(null);
  mockShooting.startOrResumeSession.mockResolvedValue('s1');
  mockShooting.shotsBetween.mockResolvedValue([]);
  mockWorkouts.listSessions.mockResolvedValue([]);
  mockWorkouts.getActiveSessionId.mockResolvedValue(null);
  mockWorkouts.startOrResumeSession.mockResolvedValue('w1');
  mockWorkouts.setsBetween.mockResolvedValue([]);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('Home with a training plan', () => {
  it("shows today's plan next to the usual ways to start and the plans button", async () => {
    await render(<Home />);
    expect(await screen.findByText('Today: Match prep')).toBeTruthy();
    expect(screen.getByLabelText(PUSH_UP_ROW)).toBeTruthy();
    expect(screen.getByLabelText(SHOOTING_ROW)).toBeTruthy();
    expect(screen.getByLabelText('Start shooting session')).toBeTruthy();
    expect(screen.getByLabelText('Start workout')).toBeTruthy();
    expect(screen.getByLabelText('Training plans')).toBeTruthy();
    expect(screen.getByText('Nothing logged yet')).toBeTruthy();
  });

  it('opens a workout with the planned exercise ready to log', async () => {
    await render(<Home />);
    await fireEvent.press(await screen.findByLabelText(PUSH_UP_ROW));
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith(`/workout/w1?exerciseId=${PUSH_UP.id}`),
    );
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockShooting.startOrResumeSession).not.toHaveBeenCalled();
  });

  it('opens a shooting session for the planned shooting', async () => {
    await render(<Home />);
    await fireEvent.press(await screen.findByLabelText(SHOOTING_ROW));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/shooting/s1'));
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockWorkouts.startOrResumeSession).not.toHaveBeenCalled();
  });

  it('goes back into the open workout when one is already running', async () => {
    mockWorkouts.getActiveSessionId.mockResolvedValue('w9');
    mockWorkouts.startOrResumeSession.mockResolvedValue('w9');
    await render(<Home />);
    expect(await screen.findByLabelText('Resume workout')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(PUSH_UP_ROW));
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith(`/workout/w9?exerciseId=${PUSH_UP.id}`),
    );
  });

  it('keeps the plain start buttons opening a session without a chosen exercise', async () => {
    await render(<Home />);
    await fireEvent.press(await screen.findByLabelText('Start workout'));
    await waitFor(() => expect(mockPush).toHaveBeenLastCalledWith('/workout/w1'));
    await fireEvent.press(screen.getByLabelText('Start shooting session'));
    await waitFor(() => expect(mockPush).toHaveBeenLastCalledWith('/shooting/s1'));
    expect(mockPush).toHaveBeenCalledTimes(2);
  });

  it('shows an error when the session cannot be started, and clears it on the next try', async () => {
    mockWorkouts.startOrResumeSession.mockRejectedValueOnce(new Error('locked'));
    await render(<Home />);
    await fireEvent.press(await screen.findByLabelText(PUSH_UP_ROW));
    expect(await screen.findByText('Could not start the session. Please try again.')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByLabelText(PUSH_UP_ROW));
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith(`/workout/w1?exerciseId=${PUSH_UP.id}`),
    );
    expect(screen.queryByText('Could not start the session. Please try again.')).toBeNull();
  });

  it('ignores a second tap while a session is starting', async () => {
    let finish!: () => void;
    mockWorkouts.startOrResumeSession.mockReturnValue(
      new Promise<string>((r) => (finish = () => r('w1'))),
    );
    await render(<Home />);
    const row = await screen.findByLabelText(PUSH_UP_ROW);
    // Not awaited: the press resolves only when the session has started.
    const firstPress = fireEvent.press(row);
    await waitFor(() => expect(mockWorkouts.startOrResumeSession).toHaveBeenCalledTimes(1));
    await fireEvent.press(screen.getByLabelText('Start workout'));
    await fireEvent.press(screen.getByLabelText(SHOOTING_ROW));
    expect(mockWorkouts.startOrResumeSession).toHaveBeenCalledTimes(1);
    expect(mockShooting.startOrResumeSession).not.toHaveBeenCalled();
    await act(async () => finish());
    await firstPress;
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('opens the progress screen', async () => {
    await render(<Home />);
    await fireEvent.press(await screen.findByLabelText('Progress'));
    expect(mockPush).toHaveBeenCalledWith('/progress');
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('opens the list of plans', async () => {
    await render(<Home />);
    await fireEvent.press(await screen.findByLabelText('Training plans'));
    expect(mockPush).toHaveBeenCalledWith('/plans');
  });

  it('works as before without an active plan', async () => {
    mockPlans.getActivePlan.mockResolvedValue(null);
    await render(<Home />);
    expect(await screen.findByText('Nothing logged yet')).toBeTruthy();
    await waitFor(() => expect(mockPlans.getActivePlan).toHaveBeenCalled());
    expect(screen.queryByText(/^Today:/)).toBeNull();
    expect(screen.getByLabelText('Start shooting session')).toBeTruthy();
    expect(screen.getByLabelText('Training plans')).toBeTruthy();
  });

  it("still lists the player's recent activity when the plan cannot be loaded", async () => {
    mockPlans.getActivePlan.mockRejectedValue(new Error('boom'));
    mockShooting.listSessions.mockResolvedValue([
      {
        id: 's7',
        startedAt: new Date(2026, 0, 6, 9).toISOString(),
        endedAt: new Date(2026, 0, 6, 10).toISOString(),
        made: 7,
        missed: 3,
        attempts: 10,
      },
    ]);
    await render(<Home />);
    expect(await screen.findByText("Could not load today's plan.")).toBeTruthy();
    expect(screen.getByLabelText(/^Shooting, .*7 \/ 10 made/)).toBeTruthy();
    expect(screen.getByLabelText('Start workout')).toBeTruthy();
  });
});
