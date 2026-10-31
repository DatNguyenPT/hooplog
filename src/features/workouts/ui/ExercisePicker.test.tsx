import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { ExerciseRepository } from '@/features/workouts/data/exerciseRepository';
import type { Exercise } from '@/features/workouts/domain/exercise';
import '@/shared/i18n';
import { ExercisePicker } from './ExercisePicker';

const mockRepo: jest.Mocked<ExerciseRepository> = {
  list: jest.fn(),
  get: jest.fn(),
  createCustom: jest.fn(),
  softDeleteCustom: jest.fn(),
};
const mockDismissTo = jest.fn();

jest.mock('@/features/workouts/data/exerciseRepository', () => ({
  useExerciseRepository: () => mockRepo,
}));

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    router: { dismissTo: (...args: unknown[]) => mockDismissTo(...args), back: jest.fn() },
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
const mikan: Exercise = {
  id: 'ex-mikan',
  name: 'Mikan drill',
  category: 'other',
  measurementType: 'reps',
  isBuiltin: false,
};

beforeEach(() => {
  const consoleError = console.error;
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (String(args[0]).includes('not configured to support act')) return;
    consoleError(...args);
  });
  jest.clearAllMocks();
  mockRepo.list.mockResolvedValue([squat, mikan]);
});

afterEach(() => jest.restoreAllMocks());

describe('ExercisePicker screen', () => {
  it('lists translated built-ins and custom exercises, and filters by search', async () => {
    await render(<ExercisePicker sessionId="w1" />);
    expect(await screen.findByText('Squat')).toBeTruthy();
    expect(screen.getByText('Mikan drill')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Search exercises'), 'mik');
    expect(screen.queryByText('Squat')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Search exercises'), 'zzz');
    expect(screen.getByText('No exercises match')).toBeTruthy();
  });

  it('shows the error state when loading fails', async () => {
    mockRepo.list.mockRejectedValue(new Error('boom'));
    await render(<ExercisePicker sessionId="w1" />);
    expect(await screen.findByText('Something went wrong.')).toBeTruthy();
  });

  it('returns to the workout with the chosen exercise', async () => {
    await render(<ExercisePicker sessionId="w1" />);
    await fireEvent.press(await screen.findByLabelText('Squat, Strength, Reps and weight'));
    expect(mockDismissTo).toHaveBeenCalledWith('/workout/w1?exerciseId=ex-squat');
  });

  it('validates and creates a custom exercise, then selects it', async () => {
    mockRepo.createCustom.mockResolvedValue({ ...mikan, id: 'ex-new', name: 'Wall sit' });
    await render(<ExercisePicker sessionId="w1" />);
    await fireEvent.press(await screen.findByLabelText('New exercise'));

    await fireEvent.press(screen.getByLabelText('Save exercise'));
    expect(await screen.findByText('Enter a name.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Exercise name'), 'squat');
    await fireEvent.press(screen.getByLabelText('Save exercise'));
    expect(await screen.findByText('An exercise with that name already exists.')).toBeTruthy();
    expect(mockRepo.createCustom).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Exercise name'), '  Wall sit ');
    await fireEvent.press(screen.getByLabelText('Duration'));
    await fireEvent.press(screen.getByLabelText('Save exercise'));
    await waitFor(() =>
      expect(mockRepo.createCustom).toHaveBeenCalledWith({
        name: 'Wall sit',
        measurementType: 'duration',
      }),
    );
    await waitFor(() =>
      expect(mockDismissTo).toHaveBeenCalledWith('/workout/w1?exerciseId=ex-new'),
    );
  });

  it('offers delete on custom exercises only, and asks before deleting', async () => {
    mockRepo.softDeleteCustom.mockResolvedValue();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<ExercisePicker sessionId="w1" />);
    await screen.findByText('Mikan drill');
    expect(screen.queryByLabelText('Delete Squat')).toBeNull();

    await fireEvent.press(screen.getByLabelText('Delete Mikan drill'));
    expect(alert.mock.calls[0][0]).toBe('Delete Mikan drill?');
    expect(mockRepo.softDeleteCustom).not.toHaveBeenCalled();

    mockRepo.list.mockResolvedValue([squat]);
    const buttons = alert.mock.calls[0][2] ?? [];
    buttons.find((b) => b.style === 'destructive')?.onPress?.();
    await waitFor(() => expect(mockRepo.softDeleteCustom).toHaveBeenCalledWith('ex-mikan'));
    await waitFor(() => expect(screen.queryByText('Mikan drill')).toBeNull());
    expect(screen.getByText('Squat')).toBeTruthy();
    expect(mockDismissTo).not.toHaveBeenCalled();
  });

  it('keeps the exercise and shows an inline error when deleting fails', async () => {
    mockRepo.softDeleteCustom.mockRejectedValue(new Error('disk full'));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<ExercisePicker sessionId="w1" />);
    await fireEvent.press(await screen.findByLabelText('Delete Mikan drill'));
    const buttons = alert.mock.calls[0][2] ?? [];
    buttons.find((b) => b.style === 'destructive')?.onPress?.();
    expect(
      await screen.findByText('Could not delete the exercise. Please try again.'),
    ).toBeTruthy();
    expect(screen.getByText('Mikan drill')).toBeTruthy();
  });

  it('shows an inline error when creating fails', async () => {
    mockRepo.createCustom.mockRejectedValue(new Error('disk full'));
    await render(<ExercisePicker sessionId="w1" />);
    await fireEvent.press(await screen.findByLabelText('New exercise'));
    await fireEvent.changeText(screen.getByLabelText('Exercise name'), 'Wall sit');
    await fireEvent.press(screen.getByLabelText('Save exercise'));
    expect(await screen.findByText('Could not save the exercise. Please try again.')).toBeTruthy();
    expect(mockDismissTo).not.toHaveBeenCalled();
  });
});
