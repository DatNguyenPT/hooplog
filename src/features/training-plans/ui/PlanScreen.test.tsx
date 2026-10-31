import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import type { ShootingRepository } from '@/features/shooting/data/shootingRepository';
import type { PlanRepository } from '@/features/training-plans/data/planRepository';
import type { WorkoutRepository } from '@/features/workouts/data/workoutRepository';
import type { Exercise } from '@/features/workouts/domain/exercise';
import '@/shared/i18n';
import type { Plan, PlanItem, PlanSummary } from '../domain/plan';
import { PlanScreen } from './PlanScreen';

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
const mockBack = jest.fn();

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
    router: { push: (...args: unknown[]) => mockPush(...args), back: () => mockBack() },
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: jest.requireActual('react-native').View,
}));

const exercise = (
  n: string,
  name: string,
  category: Exercise['category'],
  measurementType: Exercise['measurementType'],
): Exercise => ({
  id: `00000000-0000-4000-8000-0000000000${n}`,
  name,
  category,
  measurementType,
  isBuiltin: true,
});
const SQUAT = exercise('01', 'squat', 'strength', 'reps_weight');
const PUSH_UP = exercise('09', 'push_up', 'strength', 'reps');
const PLANK = exercise('11', 'plank', 'core', 'duration');
const SPRINT = exercise('17', 'sprint', 'conditioning', 'distance');
const none = { reps: null, weightKg: null, durationS: null, distanceM: null };

// "Now" is Wednesday 7 January 2026, so Monday is the 5th: Monday is past, Wednesday today, Friday ahead.
const items: PlanItem[] = [
  {
    kind: 'exercise',
    id: 'i1',
    weekday: 1,
    exercise: SQUAT,
    sets: 3,
    target: { ...none, reps: 5, weightKg: 100 },
  },
  { kind: 'shooting', id: 'i2', weekday: 1, shots: 50 },
  {
    kind: 'exercise',
    id: 'i3',
    weekday: 3,
    exercise: PUSH_UP,
    sets: 3,
    target: { ...none, reps: 15 },
  },
  {
    kind: 'exercise',
    id: 'i4',
    weekday: 3,
    exercise: PLANK,
    sets: 2,
    target: { ...none, durationS: 60 },
  },
  {
    kind: 'exercise',
    id: 'i5',
    weekday: 5,
    exercise: SPRINT,
    sets: 4,
    target: { ...none, distanceM: 40 },
  },
];
const matchPrep: Plan = { id: 'p1', name: 'Match prep', isActive: true, items };
const skillsPlan: Plan = {
  id: 'p2',
  name: 'Skills',
  isActive: false,
  items: [{ kind: 'shooting', id: 'i9', weekday: 3, shots: 30 }],
};
const summaries: PlanSummary[] = [
  { id: 'p1', name: 'Match prep', isActive: true, itemCount: 5 },
  { id: 'p2', name: 'Skills', isActive: false, itemCount: 1 },
];

/** Local time, like the player's clock. */
const at = (day: number, hour: number) => new Date(2026, 0, day, hour).toISOString();
const loggedSets = [
  ...[8, 9, 10].map((hour) => ({ exerciseId: SQUAT.id, loggedAt: at(5, hour) })),
  // Push-ups are planned for Wednesday, so Monday's set must not count towards them.
  { exerciseId: PUSH_UP.id, loggedAt: at(5, 11) },
  { exerciseId: PUSH_UP.id, loggedAt: at(7, 8) },
];
const loggedShots = Array.from({ length: 20 }, () => ({ takenAt: at(5, 12) }));

type AlertSpy = { mock: { calls: Parameters<typeof Alert.alert>[] } };

/** Presses the confirmation dialog's button with the given style, as the player would. */
async function pressAlert(alert: AlertSpy, style: 'cancel' | 'destructive') {
  const button = (alert.mock.calls[0][2] ?? []).find((b) => b.style === style);
  await act(async () => button?.onPress?.());
}

beforeEach(() => {
  // Only Date is faked, so the timers React Native Testing Library waits on keep working.
  jest.useFakeTimers({
    now: new Date(2026, 0, 7, 12, 0),
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
  mockPlans.getPlan.mockResolvedValue(matchPrep);
  mockPlans.listPlans.mockResolvedValue(summaries);
  mockPlans.setActive.mockResolvedValue(undefined);
  mockPlans.renamePlan.mockResolvedValue(undefined);
  mockPlans.deletePlan.mockResolvedValue(undefined);
  mockWorkouts.setsBetween.mockResolvedValue(loggedSets);
  mockShooting.shotsBetween.mockResolvedValue(loggedShots);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('PlanScreen', () => {
  it('shows a loading indicator, then the week with progress for the days that have started', async () => {
    let resolve!: (plan: Plan | null) => void;
    mockPlans.getPlan.mockReturnValue(new Promise<Plan | null>((r) => (resolve = r)));
    await render(<PlanScreen id="p1" />);
    expect(screen.getByLabelText('Loading…')).toBeTruthy();
    await act(async () => resolve(matchPrep));

    expect(await screen.findByText('Match prep')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('1 of 5 planned items done this week')).toBeTruthy();
    for (const day of [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ])
      expect(screen.getByText(day)).toBeTruthy();
    expect(screen.getAllByText('Today')).toHaveLength(1);
    expect(screen.getAllByText('Nothing planned')).toHaveLength(4);

    // Monday is over: the squats are complete and the shooting target was missed.
    expect(
      screen.getByLabelText('Monday, Squat, 3 sets × 5 reps at 100 kg, 3 / 3 sets, done. Edit'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Monday, Shooting, 50 shots, 20 / 50 shots. Edit')).toBeTruthy();
    expect(screen.getAllByText('Done')).toHaveLength(1);
    // Wednesday is today.
    expect(
      screen.getByLabelText('Wednesday, Push-up, 3 sets × 15 reps, 1 / 3 sets. Edit'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Wednesday, Plank, 2 sets × 1:00, 0 / 2 sets. Edit')).toBeTruthy();
    // Friday has not happened yet, so it has no progress.
    expect(screen.getByLabelText('Friday, Sprint, 4 sets × 40 m. Edit')).toBeTruthy();
  });

  it('reads this week of logs, Monday to the next Monday', async () => {
    await render(<PlanScreen id="p1" />);
    await screen.findByText('Match prep');
    const from = new Date(2026, 0, 5).toISOString();
    const to = new Date(2026, 0, 12).toISOString();
    expect(mockWorkouts.setsBetween).toHaveBeenCalledWith(from, to);
    expect(mockShooting.shotsBetween).toHaveBeenCalledWith(from, to);
  });

  it('opens items for editing and the add flows for a day', async () => {
    await render(<PlanScreen id="p1" />);
    await fireEvent.press(
      await screen.findByLabelText('Wednesday, Push-up, 3 sets × 15 reps, 1 / 3 sets. Edit'),
    );
    expect(mockPush).toHaveBeenLastCalledWith(
      `/plans/item?planId=p1&weekday=3&exerciseId=${PUSH_UP.id}`,
    );
    await fireEvent.press(screen.getByLabelText('Monday, Shooting, 50 shots, 20 / 50 shots. Edit'));
    expect(mockPush).toHaveBeenLastCalledWith('/plans/item?planId=p1&weekday=1&kind=shooting');
    await fireEvent.press(screen.getByLabelText('Add exercise on Tuesday'));
    expect(mockPush).toHaveBeenLastCalledWith('/plans/exercises?planId=p1&weekday=2');
    await fireEvent.press(screen.getByLabelText('Add shooting on Tuesday'));
    expect(mockPush).toHaveBeenLastCalledWith('/plans/item?planId=p1&weekday=2&kind=shooting');
  });

  it('offers only one shooting item per day', async () => {
    await render(<PlanScreen id="p1" />);
    await screen.findByText('Match prep');
    expect(screen.queryByLabelText('Add shooting on Monday')).toBeNull();
    expect(screen.getByLabelText('Add shooting on Wednesday')).toBeTruthy();
    expect(screen.getByLabelText('Add exercise on Monday')).toBeTruthy();
  });

  it('shows an empty plan with a hint and no progress summary', async () => {
    mockPlans.getPlan.mockResolvedValue({ ...matchPrep, items: [] });
    await render(<PlanScreen id="p1" />);
    expect(
      await screen.findByText('Nothing scheduled yet. Add exercises or shooting to a day.'),
    ).toBeTruthy();
    expect(screen.queryByText(/planned items done/)).toBeNull();
    expect(screen.getAllByText('Nothing planned')).toHaveLength(7);
  });

  it('shows a plan that is not active without progress, then activates it', async () => {
    mockPlans.getPlan
      .mockResolvedValueOnce(skillsPlan)
      .mockResolvedValue({ ...skillsPlan, isActive: true });
    await render(<PlanScreen id="p2" />);

    expect(await screen.findByLabelText('Wednesday, Shooting, 30 shots. Edit')).toBeTruthy();
    expect(screen.queryByText('Active')).toBeNull();
    expect(screen.queryByText(/planned items done/)).toBeNull();
    expect(mockWorkouts.setsBetween).not.toHaveBeenCalled();
    expect(mockShooting.shotsBetween).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByLabelText('Set as active plan'));
    expect(mockPlans.setActive).toHaveBeenCalledWith('p2');
    expect(await screen.findByText('Active')).toBeTruthy();
    expect(screen.queryByLabelText('Set as active plan')).toBeNull();
    // Now that it is the plan being followed, this week's logs are counted.
    expect(
      await screen.findByLabelText('Wednesday, Shooting, 30 shots, 0 / 30 shots. Edit'),
    ).toBeTruthy();
    expect(mockShooting.shotsBetween).toHaveBeenCalled();
  });

  it('shows an error when activating fails, and ignores a second tap while it is saving', async () => {
    let finish!: () => void;
    mockPlans.getPlan.mockResolvedValue(skillsPlan);
    mockPlans.setActive.mockRejectedValueOnce(new Error('locked'));
    await render(<PlanScreen id="p2" />);
    await fireEvent.press(await screen.findByLabelText('Set as active plan'));
    expect(await screen.findByText('Could not save that. Please try again.')).toBeTruthy();
    expect(screen.queryByText('Active')).toBeNull();

    mockPlans.setActive.mockReturnValue(new Promise<void>((r) => (finish = r)));
    // Not awaited: the press resolves only when the save does.
    const firstPress = fireEvent.press(screen.getByLabelText('Set as active plan'));
    await waitFor(() => expect(mockPlans.setActive).toHaveBeenCalledTimes(2));
    await fireEvent.press(screen.getByLabelText('Set as active plan'));
    expect(mockPlans.setActive).toHaveBeenCalledTimes(2);
    await act(async () => finish());
    await firstPress;
    expect(screen.queryByText('Could not save that. Please try again.')).toBeNull();
  });

  it('shows a message and a way back when the plan no longer exists', async () => {
    mockPlans.getPlan.mockResolvedValue(null);
    await render(<PlanScreen id="gone" />);
    expect(await screen.findByText('This plan no longer exists.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('shows the error state, retries, and can go back', async () => {
    mockPlans.getPlan.mockRejectedValueOnce(new Error('boom'));
    await render(<PlanScreen id="p1" />);
    expect(await screen.findByText('Something went wrong.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByLabelText('Try again'));
    expect(await screen.findByText('Match prep')).toBeTruthy();
  });

  it('goes back from a loaded plan', async () => {
    await render(<PlanScreen id="p1" />);
    await fireEvent.press(await screen.findByLabelText('Back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('renames the plan after validating the new name', async () => {
    mockPlans.getPlan
      .mockResolvedValueOnce(matchPrep)
      .mockResolvedValue({ ...matchPrep, name: 'Game day' });
    await render(<PlanScreen id="p1" />);
    await fireEvent.press(await screen.findByLabelText('Rename'));
    expect(screen.getByLabelText('Plan name').props.value).toBe('Match prep');
    expect(screen.queryByLabelText('Rename')).toBeNull();

    await fireEvent.changeText(screen.getByLabelText('Plan name'), ' skills ');
    await fireEvent.press(screen.getByLabelText('Save name'));
    expect(await screen.findByText('A plan with that name already exists.')).toBeTruthy();
    expect(mockPlans.renamePlan).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Plan name'), '  Game   day ');
    await fireEvent.press(screen.getByLabelText('Save name'));
    await waitFor(() => expect(mockPlans.renamePlan).toHaveBeenCalledWith('p1', 'Game day'));
    expect(await screen.findByText('Game day')).toBeTruthy();
    expect(screen.queryByLabelText('Plan name')).toBeNull();
    expect(screen.getByLabelText('Rename')).toBeTruthy();
  });

  it('does not treat the plan’s own name as a duplicate when renaming', async () => {
    await render(<PlanScreen id="p1" />);
    await fireEvent.press(await screen.findByLabelText('Rename'));
    await fireEvent.press(screen.getByLabelText('Save name'));
    await waitFor(() => expect(mockPlans.renamePlan).toHaveBeenCalledWith('p1', 'Match prep'));
    expect(screen.queryByText('A plan with that name already exists.')).toBeNull();
  });

  it('keeps the typed name and shows an inline error when renaming fails', async () => {
    mockPlans.renamePlan.mockRejectedValue(new Error('disk full'));
    await render(<PlanScreen id="p1" />);
    await fireEvent.press(await screen.findByLabelText('Rename'));
    await fireEvent.changeText(screen.getByLabelText('Plan name'), 'Game day');
    await fireEvent.press(screen.getByLabelText('Save name'));
    expect(await screen.findByText('Could not save that. Please try again.')).toBeTruthy();
    expect(screen.getByLabelText('Plan name').props.value).toBe('Game day');
  });

  it('closes the rename form without saving when cancelled', async () => {
    await render(<PlanScreen id="p1" />);
    await fireEvent.press(await screen.findByLabelText('Rename'));
    await fireEvent.changeText(screen.getByLabelText('Plan name'), 'Game day');
    await fireEvent.press(screen.getByLabelText('Cancel'));
    expect(screen.queryByLabelText('Plan name')).toBeNull();
    expect(screen.getByText('Match prep')).toBeTruthy();
    expect(screen.getByLabelText('Rename')).toBeTruthy();
    expect(mockPlans.renamePlan).not.toHaveBeenCalled();
  });

  it('asks before deleting, then deletes the plan and goes back', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<PlanScreen id="p1" />);
    await fireEvent.press(await screen.findByLabelText('Delete plan'));
    expect(alert.mock.calls[0][0]).toBe('Delete Match prep?');
    expect(alert.mock.calls[0][1]).toBe(
      'The plan and its schedule are removed. Your logged workouts and shooting sessions are kept.',
    );

    await pressAlert(alert, 'cancel');
    expect(mockPlans.deletePlan).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();

    await pressAlert(alert, 'destructive');
    await waitFor(() => expect(mockPlans.deletePlan).toHaveBeenCalledWith('p1'));
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
  });

  it('stays on the plan and shows an error when deleting fails', async () => {
    mockPlans.deletePlan.mockRejectedValue(new Error('locked'));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<PlanScreen id="p1" />);
    await fireEvent.press(await screen.findByLabelText('Delete plan'));
    await pressAlert(alert, 'destructive');
    expect(await screen.findByText('Could not save that. Please try again.')).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
    expect(screen.getByText('Match prep')).toBeTruthy();
  });
});
