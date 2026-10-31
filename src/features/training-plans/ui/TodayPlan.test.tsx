import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { PlanRepository } from '@/features/training-plans/data/planRepository';
import type { ShootingRepository } from '@/features/shooting/data/shootingRepository';
import type { Exercise } from '@/features/workouts/domain/exercise';
import type { WorkoutRepository } from '@/features/workouts/data/workoutRepository';
import '@/shared/i18n';
import type { Plan } from '../domain/plan';
import { TodayPlan } from './TodayPlan';

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
  return { useFocusEffect: (effect: () => void) => useEffect(effect, [effect]) };
});

const exercise = (
  n: string,
  name: string,
  measurementType: Exercise['measurementType'],
): Exercise => ({
  id: `00000000-0000-4000-8000-0000000000${n}`,
  name,
  category: 'strength',
  measurementType,
  isBuiltin: true,
});
const PUSH_UP = exercise('09', 'push_up', 'reps');
const PLANK = exercise('11', 'plank', 'duration');
const SQUAT = exercise('01', 'squat', 'reps_weight');
const none = { reps: null, weightKg: null, durationS: null, distanceM: null };

const pushUps: Plan['items'][number] = {
  kind: 'exercise',
  id: 'i3',
  weekday: 3,
  exercise: PUSH_UP,
  sets: 3,
  target: { ...none, reps: 15 },
};
const planks: Plan['items'][number] = {
  kind: 'exercise',
  id: 'i4',
  weekday: 3,
  exercise: PLANK,
  sets: 2,
  target: { ...none, durationS: 60 },
};
const shootingWednesday: Plan['items'][number] = {
  kind: 'shooting',
  id: 'i6',
  weekday: 3,
  shots: 50,
};
const plan: Plan = {
  id: 'p1',
  name: 'Match prep',
  isActive: true,
  items: [
    {
      kind: 'exercise',
      id: 'i1',
      weekday: 1,
      exercise: SQUAT,
      sets: 3,
      target: { ...none, reps: 5, weightKg: 100 },
    },
    pushUps,
    planks,
    shootingWednesday,
    { kind: 'shooting', id: 'i7', weekday: 7, shots: 30 },
  ],
};

/** Local time, like the player's clock. */
const at = (day: number, hour: number) => new Date(2026, 0, day, hour).toISOString();
const todaysSets = [{ exerciseId: PUSH_UP.id, loggedAt: at(7, 8) }];
const todaysShots = Array.from({ length: 20 }, () => ({ takenAt: at(7, 9) }));

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
  mockWorkouts.setsBetween.mockResolvedValue(todaysSets);
  mockShooting.shotsBetween.mockResolvedValue(todaysShots);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('TodayPlan', () => {
  it('shows nothing while loading, then today of the active plan with progress so far', async () => {
    let resolve!: (value: Plan | null) => void;
    mockPlans.getActivePlan.mockReturnValue(new Promise<Plan | null>((r) => (resolve = r)));
    const onStart = jest.fn();
    await render(<TodayPlan onStart={onStart} />);
    expect(screen.toJSON()).toBeNull();
    await act(async () => resolve(plan));

    expect(await screen.findByText('Today: Match prep')).toBeTruthy();
    expect(screen.getByLabelText('Start Push-up, 3 sets × 15 reps, 1 / 3 sets')).toBeTruthy();
    expect(screen.getByLabelText('Start Plank, 2 sets × 1:00, 0 / 2 sets')).toBeTruthy();
    expect(screen.getByLabelText('Start Shooting, 50 shots, 20 / 50 shots')).toBeTruthy();
    // Monday's squats and Sunday's shooting are not today's.
    expect(screen.queryByLabelText(/Start Squat/)).toBeNull();
    expect(screen.queryByText('Nothing planned')).toBeNull();
    expect(screen.queryByText('Done')).toBeNull();
    expect(onStart).not.toHaveBeenCalled();
  });

  it('reads only the logs of today, from midnight to the next midnight', async () => {
    await render(<TodayPlan onStart={jest.fn()} />);
    expect(await screen.findByText('Today: Match prep')).toBeTruthy();
    const from = new Date(2026, 0, 7).toISOString();
    const to = new Date(2026, 0, 8).toISOString();
    expect(mockWorkouts.setsBetween).toHaveBeenCalledWith(from, to);
    expect(mockShooting.shotsBetween).toHaveBeenCalledWith(from, to);
  });

  it('marks finished items as done', async () => {
    mockWorkouts.setsBetween.mockResolvedValue(
      [8, 9, 10].map((hour) => ({ exerciseId: PUSH_UP.id, loggedAt: at(7, hour) })),
    );
    await render(<TodayPlan onStart={jest.fn()} />);
    expect(
      await screen.findByLabelText('Start Push-up, 3 sets × 15 reps, 3 / 3 sets, done'),
    ).toBeTruthy();
    expect(screen.getAllByText('Done')).toHaveLength(1);
    expect(screen.getByLabelText('Start Plank, 2 sets × 1:00, 0 / 2 sets')).toBeTruthy();
  });

  it('hands the tapped item to the caller', async () => {
    const onStart = jest.fn();
    await render(<TodayPlan onStart={onStart} />);
    await fireEvent.press(await screen.findByLabelText('Start Plank, 2 sets × 1:00, 0 / 2 sets'));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenLastCalledWith(planks);
    await fireEvent.press(screen.getByLabelText('Start Shooting, 50 shots, 20 / 50 shots'));
    expect(onStart).toHaveBeenCalledTimes(2);
    expect(onStart).toHaveBeenLastCalledWith(shootingWednesday);
  });

  it('says nothing is planned on a rest day', async () => {
    jest.setSystemTime(new Date(2026, 0, 6, 12, 0)); // Tuesday
    await render(<TodayPlan onStart={jest.fn()} />);
    expect(await screen.findByText('Today: Match prep')).toBeTruthy();
    expect(screen.getByText('Nothing planned')).toBeTruthy();
    expect(screen.queryByLabelText(/^Start /)).toBeNull();
  });

  it('finds the items planned for Sunday, the last day of the week', async () => {
    jest.setSystemTime(new Date(2026, 0, 11, 20, 0)); // Sunday
    mockShooting.shotsBetween.mockResolvedValue([{ takenAt: at(11, 9) }]);
    await render(<TodayPlan onStart={jest.fn()} />);
    expect(await screen.findByLabelText('Start Shooting, 30 shots, 1 / 30 shots')).toBeTruthy();
    expect(screen.queryByLabelText(/Start Push-up/)).toBeNull();
    expect(mockShooting.shotsBetween).toHaveBeenCalledWith(
      new Date(2026, 0, 11).toISOString(),
      new Date(2026, 0, 12).toISOString(),
    );
  });

  it('shows nothing without an active plan', async () => {
    mockPlans.getActivePlan.mockResolvedValue(null);
    await render(<TodayPlan onStart={jest.fn()} />);
    await waitFor(() => expect(mockPlans.getActivePlan).toHaveBeenCalledTimes(1));
    expect(screen.toJSON()).toBeNull();
    expect(mockWorkouts.setsBetween).not.toHaveBeenCalled();
    expect(mockShooting.shotsBetween).not.toHaveBeenCalled();
  });

  it('shows an inline error that can be retried', async () => {
    mockPlans.getActivePlan.mockRejectedValueOnce(new Error('boom'));
    await render(<TodayPlan onStart={jest.fn()} />);
    expect(await screen.findByText("Could not load today's plan.")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Try again'));
    expect(await screen.findByText('Today: Match prep')).toBeTruthy();
    expect(screen.queryByText("Could not load today's plan.")).toBeNull();
  });

  it('shows an inline error when the logs cannot be read', async () => {
    mockWorkouts.setsBetween.mockRejectedValueOnce(new Error('locked'));
    await render(<TodayPlan onStart={jest.fn()} />);
    expect(await screen.findByText("Could not load today's plan.")).toBeTruthy();
    expect(screen.queryByText('Today: Match prep')).toBeNull();
  });
});
