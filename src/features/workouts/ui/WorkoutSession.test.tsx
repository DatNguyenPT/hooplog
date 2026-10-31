import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { ExerciseRepository } from '@/features/workouts/data/exerciseRepository';
import type { WorkoutDetail, WorkoutRepository } from '@/features/workouts/data/workoutRepository';
import type { Exercise } from '@/features/workouts/domain/exercise';
import '@/shared/i18n';
import { WorkoutSession } from './WorkoutSession';

const mockRepo: jest.Mocked<WorkoutRepository> = {
  getActiveSessionId: jest.fn(),
  startOrResumeSession: jest.fn(),
  getSession: jest.fn(),
  addSet: jest.fn(),
  updateSet: jest.fn(),
  deleteSet: jest.fn(),
  endSession: jest.fn(),
  listSessions: jest.fn(),
};
const mockExercises: jest.Mocked<ExerciseRepository> = {
  list: jest.fn(),
  get: jest.fn(),
  createCustom: jest.fn(),
  softDeleteCustom: jest.fn(),
};
const mockDismissTo = jest.fn();
const mockPush = jest.fn();

jest.mock('@/features/workouts/data/workoutRepository', () => ({
  useWorkoutRepository: () => mockRepo,
}));
jest.mock('@/features/workouts/data/exerciseRepository', () => ({
  useExerciseRepository: () => mockExercises,
}));

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    router: {
      dismissTo: (...args: unknown[]) => mockDismissTo(...args),
      push: (...args: unknown[]) => mockPush(...args),
    },
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: jest.requireActual('react-native').View,
}));

const squat: Exercise = {
  id: 'ex-squat',
  name: 'squat',
  category: 'strength',
  measurementType: 'reps_weight',
  isBuiltin: true,
};
const plank: Exercise = {
  id: 'ex-plank',
  name: 'plank',
  category: 'core',
  measurementType: 'duration',
  isBuiltin: true,
};
const noSets = (over: Partial<WorkoutDetail> = {}): WorkoutDetail => ({
  id: 'w1',
  startedAt: '2026-05-01T10:00:00.000Z',
  endedAt: null,
  groups: [],
  ...over,
});
const squatSet = (id: string, reps: number, weightKg: number) => ({
  id,
  exerciseId: squat.id,
  loggedAt: '2026-05-01T10:05:00.000Z',
  reps,
  weightKg,
  durationS: null,
  distanceM: null,
});
const withSquats = (over: Partial<WorkoutDetail> = {}) =>
  noSets({
    groups: [{ exercise: squat, sets: [squatSet('s1', 5, 100), squatSet('s2', 5, 100)] }],
    ...over,
  });

beforeEach(() => {
  // RNTL waits run outside act(); React logs a harmless notice for our promise-driven state updates.
  const consoleError = console.error;
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (String(args[0]).includes('not configured to support act')) return;
    consoleError(...args);
  });
  jest.clearAllMocks();
  mockRepo.addSet.mockResolvedValue('new-set');
  mockRepo.updateSet.mockResolvedValue();
  mockRepo.deleteSet.mockResolvedValue();
  mockRepo.endSession.mockResolvedValue();
  mockExercises.get.mockResolvedValue(null);
});

afterEach(() => jest.restoreAllMocks());

describe('WorkoutSession screen', () => {
  it('shows a loading indicator, then the logged sets and totals', async () => {
    let resolve!: (value: WorkoutDetail) => void;
    mockRepo.getSession.mockReturnValue(new Promise((r) => (resolve = r)));
    await render(<WorkoutSession id="w1" />);
    expect(screen.getByLabelText('Loading…')).toBeTruthy();
    await act(async () => resolve(withSquats()));
    expect(await screen.findByText('Squat')).toBeTruthy();
    expect(screen.getAllByText('5 reps at 100 kg')).toHaveLength(2);
    expect(screen.getByLabelText('Volume 1000 kg')).toBeTruthy();
    expect(screen.getByLabelText('Reps 10')).toBeTruthy();
  });

  it('shows the error state and retries', async () => {
    mockRepo.getSession.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(noSets());
    await render(<WorkoutSession id="w1" />);
    expect(await screen.findByText('Something went wrong.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Try again'));
    expect(await screen.findByText('No exercises yet')).toBeTruthy();
  });

  it('shows the empty state for a new workout and opens the exercise picker', async () => {
    mockRepo.getSession.mockResolvedValue(noSets());
    await render(<WorkoutSession id="w1" />);
    expect(await screen.findByText('No exercises yet')).toBeTruthy();
    expect(screen.queryByLabelText('Add set')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Add exercise'));
    expect(mockPush).toHaveBeenCalledWith('/workout/exercises?sessionId=w1');
  });

  it('shows a not-found state for an unknown workout', async () => {
    mockRepo.getSession.mockResolvedValue(null);
    await render(<WorkoutSession id="gone" />);
    expect(await screen.findByText('This workout no longer exists.')).toBeTruthy();
  });

  it('logs a set for the picked exercise with validated, metric values', async () => {
    mockRepo.getSession.mockResolvedValue(noSets());
    mockExercises.get.mockResolvedValue(squat);
    await render(<WorkoutSession id="w1" pickedExerciseId="ex-squat" />);

    expect(await screen.findByText('Log a set: Squat')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Reps'), '8');
    await fireEvent.changeText(screen.getByLabelText('Weight (kg)'), '62,5');
    await fireEvent.press(screen.getByLabelText('Add set'));
    await waitFor(() =>
      expect(mockRepo.addSet).toHaveBeenCalledWith('w1', 'ex-squat', {
        reps: 8,
        weightKg: 62.5,
        durationS: null,
        distanceM: null,
      }),
    );
  });

  it('shows only the fields of the measurement type', async () => {
    mockRepo.getSession.mockResolvedValue(noSets());
    mockExercises.get.mockResolvedValue(plank);
    await render(<WorkoutSession id="w1" pickedExerciseId="ex-plank" />);
    expect(await screen.findByLabelText('Duration (seconds)')).toBeTruthy();
    expect(screen.queryByLabelText('Reps')).toBeNull();
  });

  it('blocks invalid input with inline errors and does not save', async () => {
    mockRepo.getSession.mockResolvedValue(noSets());
    mockExercises.get.mockResolvedValue(squat);
    await render(<WorkoutSession id="w1" pickedExerciseId="ex-squat" />);
    await screen.findByText('Log a set: Squat');
    await fireEvent.changeText(screen.getByLabelText('Reps'), '2.5');
    await fireEvent.press(screen.getByLabelText('Add set'));
    expect(await screen.findByText('Enter a valid number for Reps.')).toBeTruthy();
    expect(screen.getByText('Weight (kg) is required.')).toBeTruthy();
    expect(mockRepo.addSet).not.toHaveBeenCalled();
  });

  it('ignores a second tap while a set is saving', async () => {
    mockRepo.getSession.mockResolvedValue(noSets());
    mockExercises.get.mockResolvedValue(plank);
    let finish!: () => void;
    mockRepo.addSet.mockReturnValue(new Promise((r) => (finish = () => r('x'))));
    await render(<WorkoutSession id="w1" pickedExerciseId="ex-plank" />);
    await fireEvent.changeText(await screen.findByLabelText('Duration (seconds)'), '45');
    // Not awaited: the press resolves only when the save does.
    const firstPress = fireEvent.press(screen.getByLabelText('Add set'));
    await waitFor(() => expect(mockRepo.addSet).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText('Add set')).toBeDisabled();
    finish();
    await firstPress;
    expect(mockRepo.addSet).toHaveBeenCalledTimes(1);
  });

  it('shows an inline error when saving a set fails and keeps the typed values', async () => {
    mockRepo.getSession.mockResolvedValue(noSets());
    mockExercises.get.mockResolvedValue(plank);
    mockRepo.addSet.mockRejectedValue(new Error('disk full'));
    await render(<WorkoutSession id="w1" pickedExerciseId="ex-plank" />);
    await fireEvent.changeText(await screen.findByLabelText('Duration (seconds)'), '45');
    await fireEvent.press(screen.getByLabelText('Add set'));
    expect(await screen.findByText('Could not save that. Please try again.')).toBeTruthy();
    expect(screen.getByLabelText('Duration (seconds)').props.value).toBe('45');
  });

  it('deletes a set', async () => {
    mockRepo.getSession.mockResolvedValue(withSquats());
    await render(<WorkoutSession id="w1" />);
    await fireEvent.press(await screen.findByLabelText('Delete set 2 of Squat'));
    await waitFor(() => expect(mockRepo.deleteSet).toHaveBeenCalledWith('s2'));
  });

  it('edits a set in place, starting from its saved values', async () => {
    mockRepo.getSession.mockResolvedValue(withSquats());
    mockRepo.updateSet.mockResolvedValue();
    await render(<WorkoutSession id="w1" />);
    await fireEvent.press(await screen.findByLabelText('Edit set 2 of Squat, 5 reps at 100 kg'));

    expect(screen.getByText('Edit set 2: Squat')).toBeTruthy();
    expect(screen.queryByText('Log a set: Squat')).toBeNull();
    expect(screen.getByLabelText('Reps').props.value).toBe('5');
    expect(screen.getByLabelText('Weight (kg)').props.value).toBe('100');

    await fireEvent.changeText(screen.getByLabelText('Reps'), '6');
    await fireEvent.changeText(screen.getByLabelText('Weight (kg)'), '102,5');
    await fireEvent.press(screen.getByLabelText('Save changes'));
    await waitFor(() =>
      expect(mockRepo.updateSet).toHaveBeenCalledWith('s2', {
        reps: 6,
        weightKg: 102.5,
        durationS: null,
        distanceM: null,
      }),
    );
    expect(mockRepo.addSet).not.toHaveBeenCalled();
    expect(await screen.findByText('Log a set: Squat')).toBeTruthy();
    expect(screen.queryByText('Edit set 2: Squat')).toBeNull();
  });

  it('cancels an edit without saving', async () => {
    mockRepo.getSession.mockResolvedValue(withSquats());
    await render(<WorkoutSession id="w1" />);
    await fireEvent.press(await screen.findByLabelText('Edit set 1 of Squat, 5 reps at 100 kg'));
    await fireEvent.changeText(screen.getByLabelText('Reps'), '9');
    await fireEvent.press(screen.getByLabelText('Cancel'));
    expect(await screen.findByText('Log a set: Squat')).toBeTruthy();
    expect(mockRepo.updateSet).not.toHaveBeenCalled();
  });

  it('validates an edit and keeps the form open when saving fails', async () => {
    mockRepo.getSession.mockResolvedValue(withSquats());
    mockRepo.updateSet.mockRejectedValue(new Error('disk full'));
    await render(<WorkoutSession id="w1" />);
    await fireEvent.press(await screen.findByLabelText('Edit set 1 of Squat, 5 reps at 100 kg'));

    await fireEvent.changeText(screen.getByLabelText('Reps'), '');
    await fireEvent.press(screen.getByLabelText('Save changes'));
    expect(await screen.findByText('Reps is required.')).toBeTruthy();
    expect(mockRepo.updateSet).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Reps'), '7');
    await fireEvent.press(screen.getByLabelText('Save changes'));
    expect(await screen.findByText('Could not save that. Please try again.')).toBeTruthy();
    expect(screen.getByText('Edit set 1: Squat')).toBeTruthy();
    expect(screen.getByLabelText('Reps').props.value).toBe('7');
  });

  it('keeps the typed edit when another set is deleted meanwhile', async () => {
    mockRepo.getSession.mockResolvedValue(withSquats());
    await render(<WorkoutSession id="w1" />);
    await fireEvent.press(await screen.findByLabelText('Edit set 2 of Squat, 5 reps at 100 kg'));
    await fireEvent.changeText(screen.getByLabelText('Reps'), '9');
    expect(screen.queryByLabelText('Delete set 2 of Squat')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Delete set 1 of Squat'));
    await waitFor(() => expect(mockRepo.deleteSet).toHaveBeenCalledWith('s1'));
    expect(screen.getByLabelText('Reps').props.value).toBe('9');
  });

  it('draws a bar per set and a sets-per-exercise overview', async () => {
    mockRepo.getSession.mockResolvedValue(
      noSets({
        groups: [
          { exercise: squat, sets: [squatSet('s1', 5, 100), squatSet('s2', 5, 60)] },
          {
            exercise: plank,
            sets: [
              {
                id: 'p1',
                exerciseId: plank.id,
                loggedAt: '2026-05-01T10:20:00.000Z',
                reps: null,
                weightKg: null,
                durationS: 45,
                distanceM: null,
              },
            ],
          },
        ],
      }),
    );
    await render(<WorkoutSession id="w1" />);
    expect(await screen.findByText('Sets per exercise')).toBeTruthy();
    expect(screen.getByLabelText('Squat, 2 sets')).toBeTruthy();
    expect(screen.getByLabelText('Plank, 1 set')).toBeTruthy();
    // Only the squat sets have something to compare; a lone set gets no bar.
    expect(screen.getAllByTestId('set-bar', { includeHiddenElements: true })).toHaveLength(2);
  });

  it('skips the overview for a single exercise and bars for a single set', async () => {
    mockRepo.getSession.mockResolvedValue(
      noSets({ groups: [{ exercise: squat, sets: [squatSet('s1', 5, 100)] }] }),
    );
    await render(<WorkoutSession id="w1" />);
    await screen.findByText('Squat');
    expect(screen.queryByText('Sets per exercise')).toBeNull();
    expect(screen.queryAllByTestId('set-bar', { includeHiddenElements: true })).toHaveLength(0);
  });

  it('asks for confirmation before ending, then returns home', async () => {
    mockRepo.getSession.mockResolvedValue(withSquats());
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<WorkoutSession id="w1" />);
    await fireEvent.press(await screen.findByLabelText('End workout'));
    expect(mockRepo.endSession).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0][2] ?? [];
    buttons.find((b) => b.style === 'destructive')?.onPress?.();
    await waitFor(() => expect(mockRepo.endSession).toHaveBeenCalledWith('w1'));
    await waitFor(() => expect(mockDismissTo).toHaveBeenCalledWith('/'));
  });

  it('shows a read-only summary with duration for an ended workout', async () => {
    mockRepo.getSession.mockResolvedValue(withSquats({ endedAt: '2026-05-01T10:45:30.000Z' }));
    await render(<WorkoutSession id="w1" />);
    expect(await screen.findByText('Workout summary')).toBeTruthy();
    expect(screen.getByLabelText('Duration 45:30')).toBeTruthy();
    expect(screen.queryByLabelText('Add set')).toBeNull();
    expect(screen.queryByLabelText('Delete set 1 of Squat')).toBeNull();
    expect(screen.queryByLabelText(/^Edit set/)).toBeNull();
    expect(screen.getByLabelText('Squat, set 1, 5 reps at 100 kg')).toBeTruthy();
  });
});
