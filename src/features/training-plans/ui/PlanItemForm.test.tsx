import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { Alert } from 'react-native';

import type { PlanRepository } from '@/features/training-plans/data/planRepository';
import type { ExerciseRepository } from '@/features/workouts/data/exerciseRepository';
import type { Exercise } from '@/features/workouts/domain/exercise';
import '@/shared/i18n';
import type { Plan } from '../domain/plan';
import { PlanItemForm } from './PlanItemForm';

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
const mockExercises: jest.Mocked<ExerciseRepository> = {
  list: jest.fn(),
  get: jest.fn(),
  createCustom: jest.fn(),
  softDeleteCustom: jest.fn(),
};
const mockBack = jest.fn();

jest.mock('@/features/training-plans/data/planRepository', () => ({
  usePlanRepository: () => mockPlans,
}));
jest.mock('@/features/workouts/data/exerciseRepository', () => ({
  useExerciseRepository: () => mockExercises,
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
const SQUAT = exercise('01', 'squat', 'reps_weight');
const PUSH_UP = exercise('09', 'push_up', 'reps');
const PLANK = exercise('11', 'plank', 'duration');
const SPRINT = exercise('17', 'sprint', 'distance');
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
    { kind: 'shooting', id: 'i2', weekday: 1, shots: 50 },
  ],
};

type Props = ComponentProps<typeof PlanItemForm>;
const renderForm = (props: Partial<Props> = {}) =>
  render(
    <PlanItemForm planId="p1" weekday="3" exerciseId={PUSH_UP.id} kind={undefined} {...props} />,
  );

type AlertSpy = { mock: { calls: Parameters<typeof Alert.alert>[] } };

/** Presses the confirmation dialog's button with the given style, as the player would. */
async function pressAlert(alert: AlertSpy, style: 'cancel' | 'destructive') {
  const button = (alert.mock.calls[0][2] ?? []).find((b) => b.style === style);
  await act(async () => button?.onPress?.());
}

beforeEach(() => {
  // RNTL waits run outside act(); React logs a harmless notice for our promise-driven state updates.
  const consoleError = console.error;
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (String(args[0]).includes('not configured to support act')) return;
    consoleError(...args);
  });
  jest.clearAllMocks();
  mockPlans.getPlan.mockResolvedValue(plan);
  mockPlans.addItem.mockResolvedValue('new-item');
  mockPlans.updateItem.mockResolvedValue(undefined);
  mockPlans.removeItem.mockResolvedValue(undefined);
  mockExercises.get.mockImplementation(
    async (id) => [SQUAT, PUSH_UP, PLANK, SPRINT].find((e) => e.id === id) ?? null,
  );
});

afterEach(() => jest.restoreAllMocks());

describe('PlanItemForm: adding an exercise', () => {
  it('validates the targets, then saves them and goes back', async () => {
    await renderForm({ exerciseId: SQUAT.id });
    expect(await screen.findByText('Wednesday: Squat')).toBeTruthy();
    expect(screen.queryByLabelText('Remove from plan')).toBeNull();

    await fireEvent.press(screen.getByLabelText('Save'));
    expect(await screen.findByText('Sets is required.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Sets'), 'abc');
    await fireEvent.press(screen.getByLabelText('Save'));
    expect(await screen.findByText('Enter a valid number for Sets.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Sets'), '0');
    await fireEvent.press(screen.getByLabelText('Save'));
    expect(await screen.findByText('Sets is out of range.')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Sets'), '3');
    await fireEvent.changeText(screen.getByLabelText('Reps'), 'x');
    await fireEvent.changeText(screen.getByLabelText('Weight (kg)'), '-5');
    await fireEvent.press(screen.getByLabelText('Save'));
    expect(await screen.findByText('Enter a valid number for Reps.')).toBeTruthy();
    expect(screen.getByText('Enter a valid number for Weight (kg).')).toBeTruthy();
    expect(mockPlans.addItem).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Reps'), '5');
    await fireEvent.changeText(screen.getByLabelText('Weight (kg)'), '62,5');
    await fireEvent.press(screen.getByLabelText('Save'));
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(mockPlans.addItem).toHaveBeenCalledWith('p1', 3, {
      kind: 'exercise',
      exerciseId: SQUAT.id,
      sets: 3,
      target: { reps: 5, weightKg: 62.5, durationS: null, distanceM: null },
    });
    expect(mockPlans.updateItem).not.toHaveBeenCalled();
  });

  it('allows every per-set target to be left blank', async () => {
    await renderForm({ weekday: '2' });
    expect(await screen.findByText('Tuesday: Push-up')).toBeTruthy();
    expect(
      screen.getByText('Targets are guidance. Leave a field blank for no target.'),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Weight (kg)')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Sets'), '4');
    await fireEvent.press(screen.getByLabelText('Save'));
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(mockPlans.addItem).toHaveBeenCalledWith('p1', 2, {
      kind: 'exercise',
      exerciseId: PUSH_UP.id,
      sets: 4,
      target: none,
    });
  });

  it.each([
    {
      exercise: PLANK,
      name: 'Plank',
      field: 'Duration (seconds)',
      text: '90',
      target: { durationS: 90 },
    },
    {
      exercise: SPRINT,
      name: 'Sprint',
      field: 'Distance (metres)',
      text: '40,5',
      target: { distanceM: 40.5 },
    },
  ])(
    'asks for the $field target of $name',
    async ({ exercise: chosen, name, field, text, target }) => {
      await renderForm({ exerciseId: chosen.id });
      expect(await screen.findByText(`Wednesday: ${name}`)).toBeTruthy();
      expect(screen.queryByLabelText('Reps')).toBeNull();
      await fireEvent.changeText(screen.getByLabelText('Sets'), '2');
      await fireEvent.changeText(screen.getByLabelText(field), text);
      await fireEvent.press(screen.getByLabelText('Save'));
      await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
      expect(mockPlans.addItem).toHaveBeenCalledWith('p1', 3, {
        kind: 'exercise',
        exerciseId: chosen.id,
        sets: 2,
        target: { ...none, ...target },
      });
    },
  );
});

describe('PlanItemForm: editing an exercise item', () => {
  it('starts from the planned targets and updates them', async () => {
    await renderForm();
    expect(await screen.findByText('Wednesday: Push-up')).toBeTruthy();
    expect(mockExercises.get).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Sets').props.value).toBe('3');
    expect(screen.getByLabelText('Reps').props.value).toBe('15');

    await fireEvent.changeText(screen.getByLabelText('Reps'), '20');
    await fireEvent.press(screen.getByLabelText('Save'));
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(mockPlans.updateItem).toHaveBeenCalledWith('i3', {
      kind: 'exercise',
      exerciseId: PUSH_UP.id,
      sets: 3,
      target: { ...none, reps: 20 },
    });
    expect(mockPlans.addItem).not.toHaveBeenCalled();
  });

  it('clears a target when its field is emptied', async () => {
    await renderForm();
    await fireEvent.changeText(await screen.findByLabelText('Reps'), '');
    await fireEvent.press(screen.getByLabelText('Save'));
    await waitFor(() => expect(mockPlans.updateItem).toHaveBeenCalled());
    expect(mockPlans.updateItem).toHaveBeenCalledWith('i3', {
      kind: 'exercise',
      exerciseId: PUSH_UP.id,
      sets: 3,
      target: none,
    });
  });

  it('asks before removing the item, then removes it and goes back', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await renderForm();
    await fireEvent.press(await screen.findByLabelText('Remove from plan'));
    expect(alert.mock.calls[0][0]).toBe('Remove Push-up from Wednesday?');
    expect(alert.mock.calls[0][1]).toBe('Your logged sets and shots are kept.');

    await pressAlert(alert, 'cancel');
    expect(mockPlans.removeItem).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();

    await pressAlert(alert, 'destructive');
    await waitFor(() => expect(mockPlans.removeItem).toHaveBeenCalledWith('i3'));
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
  });

  it('stays on the form and shows an error when removing fails', async () => {
    mockPlans.removeItem.mockRejectedValue(new Error('locked'));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await renderForm();
    await fireEvent.press(await screen.findByLabelText('Remove from plan'));
    await pressAlert(alert, 'destructive');
    expect(await screen.findByText('Could not save that. Please try again.')).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });
});

describe('PlanItemForm: shooting', () => {
  it('adds a shot target after validating it', async () => {
    await renderForm({ kind: 'shooting', weekday: '2', exerciseId: undefined });
    expect(await screen.findByText('Tuesday: Shooting')).toBeTruthy();
    expect(screen.queryByLabelText('Reps')).toBeNull();
    expect(screen.queryByLabelText('Sets')).toBeNull();

    await fireEvent.press(screen.getByLabelText('Save'));
    expect(await screen.findByText('Shots is required.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Shots'), '12.5');
    await fireEvent.press(screen.getByLabelText('Save'));
    expect(await screen.findByText('Enter a valid number for Shots.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Shots'), '1001');
    await fireEvent.press(screen.getByLabelText('Save'));
    expect(await screen.findByText('Shots is out of range.')).toBeTruthy();
    expect(mockPlans.addItem).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Shots'), '50');
    await fireEvent.press(screen.getByLabelText('Save'));
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(mockPlans.addItem).toHaveBeenCalledWith('p1', 2, { kind: 'shooting', shots: 50 });
  });

  it('edits the planned shot target', async () => {
    await renderForm({ kind: 'shooting', weekday: '1', exerciseId: undefined });
    expect(await screen.findByText('Monday: Shooting')).toBeTruthy();
    expect(screen.getByLabelText('Shots').props.value).toBe('50');
    expect(screen.getByLabelText('Remove from plan')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Shots'), '75');
    await fireEvent.press(screen.getByLabelText('Save'));
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(mockPlans.updateItem).toHaveBeenCalledWith('i2', { kind: 'shooting', shots: 75 });
    expect(mockPlans.addItem).not.toHaveBeenCalled();
  });
});

describe('PlanItemForm: saving safely', () => {
  it('keeps what was typed and shows an error when saving fails, then saves on retry', async () => {
    mockPlans.addItem.mockRejectedValueOnce(new Error('disk full'));
    await renderForm({ weekday: '2' });
    await fireEvent.changeText(await screen.findByLabelText('Sets'), '4');
    await fireEvent.changeText(screen.getByLabelText('Reps'), '12');
    await fireEvent.press(screen.getByLabelText('Save'));
    expect(await screen.findByText('Could not save that. Please try again.')).toBeTruthy();
    expect(screen.getByLabelText('Sets').props.value).toBe('4');
    expect(screen.getByLabelText('Reps').props.value).toBe('12');
    expect(screen.getByLabelText('Save')).not.toBeDisabled();
    expect(mockBack).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByLabelText('Save'));
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(mockPlans.addItem).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Could not save that. Please try again.')).toBeNull();
  });

  it('ignores a second tap while the item is being saved', async () => {
    let finish!: () => void;
    mockPlans.addItem.mockReturnValue(new Promise<string>((r) => (finish = () => r('new-item'))));
    await renderForm({ weekday: '2' });
    await fireEvent.changeText(await screen.findByLabelText('Sets'), '4');
    // Not awaited: the press resolves only when the save does.
    const firstPress = fireEvent.press(screen.getByLabelText('Save'));
    await waitFor(() => expect(mockPlans.addItem).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText('Save')).toBeDisabled();
    await fireEvent.press(screen.getByLabelText('Save'));
    await act(async () => finish());
    await firstPress;
    expect(mockPlans.addItem).toHaveBeenCalledTimes(1);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('goes back without saving when cancelled', async () => {
    await renderForm();
    await fireEvent.changeText(await screen.findByLabelText('Reps'), '20');
    await fireEvent.press(screen.getByLabelText('Cancel'));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockPlans.updateItem).not.toHaveBeenCalled();
    expect(mockPlans.addItem).not.toHaveBeenCalled();
  });
});

describe('PlanItemForm: loading', () => {
  it('shows a loading indicator first', async () => {
    let resolve!: (value: Plan | null) => void;
    mockPlans.getPlan.mockReturnValue(new Promise<Plan | null>((r) => (resolve = r)));
    await renderForm();
    expect(screen.getByLabelText('Loading…')).toBeTruthy();
    await act(async () => resolve(plan));
    expect(await screen.findByText('Wednesday: Push-up')).toBeTruthy();
  });

  it('shows the error state, retries, and can be cancelled', async () => {
    mockPlans.getPlan.mockRejectedValueOnce(new Error('boom'));
    await renderForm();
    expect(await screen.findByText('Something went wrong.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Cancel'));
    expect(mockBack).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByLabelText('Try again'));
    expect(await screen.findByText('Wednesday: Push-up')).toBeTruthy();
  });

  it.each([
    { why: 'the plan is gone', props: {}, plan: null },
    { why: 'the exercise is gone', props: { exerciseId: 'missing' }, plan },
    { why: 'the weekday is invalid', props: { weekday: '9' }, plan },
    { why: 'the weekday is missing', props: { weekday: undefined }, plan },
    { why: 'the plan is missing from the link', props: { planId: undefined }, plan },
    { why: 'nothing says what to plan', props: { exerciseId: undefined }, plan },
  ])('says the plan no longer exists when $why', async ({ props, plan: found }) => {
    mockPlans.getPlan.mockResolvedValue(found);
    await renderForm(props);
    expect(await screen.findByText('This plan no longer exists.')).toBeTruthy();
    expect(screen.queryByLabelText('Save')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
