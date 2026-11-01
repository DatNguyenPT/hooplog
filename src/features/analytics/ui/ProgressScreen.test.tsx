import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { ShotResult } from '@/features/shooting/domain/stats';
import type { Exercise, MeasurementType } from '@/features/workouts/domain/exercise';
import '@/shared/i18n';
import type { AnalyticsRepository } from '../data/analyticsRepository';
import type { LiftBest, SessionResults, WeeklyInputs } from '../domain/progress';
import { ProgressScreen } from './ProgressScreen';

const mockRepo: jest.Mocked<AnalyticsRepository> = {
  weeklyInputs: jest.fn(),
  sessionResults: jest.fn(),
  liftBests: jest.fn(),
};
const mockBack = jest.fn();

jest.mock('../data/analyticsRepository', () => ({
  useAnalyticsRepository: () => mockRepo,
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

const hidden = { includeHiddenElements: true };

// "Now" is Wednesday 7 Jan 2026, so the eight weeks run from Monday 17 Nov 2025 to Monday 5 Jan 2026.
const at = (year: number, month: number, day: number, hour = 12) =>
  new Date(year, month - 1, day, hour).toISOString();
const repeat = (result: ShotResult, count: number): ShotResult[] =>
  Array.from({ length: count }, () => result);

const noInputs: WeeklyInputs = { shots: [], sessionStarts: [], sets: [] };
// This week: 3 of 4 shots, a shooting session and a workout, 5 x 100 kg + 3 x 75 kg = 725 kg.
// Last week: 1 of 2 shots and one shooting session.
const inputs: WeeklyInputs = {
  shots: [
    { takenAt: at(2026, 1, 6, 10), result: 'made' },
    { takenAt: at(2026, 1, 6, 10), result: 'made' },
    { takenAt: at(2026, 1, 6, 10), result: 'made' },
    { takenAt: at(2026, 1, 6, 10), result: 'missed' },
    { takenAt: at(2025, 12, 30, 10), result: 'made' },
    { takenAt: at(2025, 12, 30, 10), result: 'missed' },
  ],
  sessionStarts: [at(2026, 1, 6, 10), at(2026, 1, 7, 8), at(2025, 12, 30, 10)],
  sets: [
    { loggedAt: at(2026, 1, 7, 8), reps: 5, weightKg: 100 },
    { loggedAt: at(2026, 1, 7, 8), reps: 3, weightKg: 75 },
  ],
};

// Too short to count as a best (3 shots, a run of 2 makes).
const shortSession: SessionResults = {
  sessionId: 's1',
  startedAt: at(2025, 12, 30, 10),
  results: [...repeat('made', 2), 'missed'],
};
// 15 of 20 with a run of 12 makes.
const bestSession: SessionResults = {
  sessionId: 's2',
  startedAt: at(2026, 1, 6, 10),
  results: [...repeat('made', 12), ...repeat('missed', 5), ...repeat('made', 3)],
};
const sessions = [shortSession, bestSession];

const exercise = (
  id: string,
  name: string,
  measurementType: MeasurementType,
  isBuiltin: boolean,
): Exercise => ({ id, name, category: 'strength', measurementType, isBuiltin });
const lifts: LiftBest[] = [
  { exercise: exercise('e1', 'squat', 'reps_weight', true), maxWeightKg: 100, maxReps: 8 },
  { exercise: exercise('e2', 'push_up', 'reps', true), maxWeightKg: null, maxReps: 30 },
  { exercise: exercise('e3', 'Handstand', 'reps', false), maxWeightKg: null, maxReps: 1 },
  { exercise: exercise('e4', 'plank', 'duration', true), maxWeightKg: null, maxReps: null },
];

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
  mockRepo.weeklyInputs.mockResolvedValue(inputs);
  mockRepo.sessionResults.mockResolvedValue(sessions);
  mockRepo.liftBests.mockResolvedValue(lifts);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('Progress screen states', () => {
  it('shows a loading indicator, then the charts', async () => {
    let resolve!: (value: WeeklyInputs) => void;
    mockRepo.weeklyInputs.mockReturnValue(new Promise((r) => (resolve = r)));
    await render(<ProgressScreen />);
    expect(screen.getByLabelText('Loading…')).toBeTruthy();
    expect(screen.queryByText('Field goal % per week')).toBeNull();
    await act(async () => resolve(inputs));
    expect(await screen.findByText('Field goal % per week')).toBeTruthy();
    expect(screen.queryByLabelText('Loading…')).toBeNull();
  });

  it('shows the error state and retries', async () => {
    mockRepo.weeklyInputs.mockRejectedValueOnce(new Error('boom'));
    await render(<ProgressScreen />);
    expect(await screen.findByText('Something went wrong.')).toBeTruthy();
    expect(screen.queryByText('Field goal % per week')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Try again'));
    expect(await screen.findByText('Field goal % per week')).toBeTruthy();
  });

  it.each(['weeklyInputs', 'sessionResults', 'liftBests'] as const)(
    'shows the error state rather than partial data when %s fails',
    async (name) => {
      mockRepo[name].mockRejectedValueOnce(new Error('boom'));
      await render(<ProgressScreen />);
      expect(await screen.findByText('Something went wrong.')).toBeTruthy();
      expect(screen.queryByText('Personal bests')).toBeNull();
    },
  );

  it('shows the empty state when nothing has been logged', async () => {
    mockRepo.weeklyInputs.mockResolvedValue(noInputs);
    mockRepo.sessionResults.mockResolvedValue([]);
    mockRepo.liftBests.mockResolvedValue([]);
    await render(<ProgressScreen />);
    expect(await screen.findByText('No progress yet')).toBeTruthy();
    expect(
      screen.getByText(
        'Log a shooting session or a workout and your weekly charts and personal bests will show up here.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('Field goal % per week')).toBeNull();
    expect(screen.getByLabelText('Back')).toBeTruthy();
  });

  it('asks for the logs starting at the Monday of the oldest of the eight weeks', async () => {
    await render(<ProgressScreen />);
    await screen.findByText('Field goal % per week');
    expect(mockRepo.weeklyInputs).toHaveBeenCalledTimes(1);
    expect(mockRepo.weeklyInputs).toHaveBeenCalledWith(new Date(2025, 10, 17).toISOString());
  });

  it('goes back', async () => {
    await render(<ProgressScreen />);
    await fireEvent.press(await screen.findByLabelText('Back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

describe('Progress screen charts', () => {
  const load = async () => {
    await render(<ProgressScreen />);
    await screen.findByText('Field goal % per week');
  };

  it('reads out the current week for each chart and draws the bars to scale', async () => {
    await load();
    expect(screen.getByText('Sessions per week')).toBeTruthy();
    expect(screen.getByText('Weight lifted per week')).toBeTruthy();
    expect(screen.getByText('Week of Jan 5: 75% (3 of 4 shots)')).toBeTruthy();
    expect(screen.getByText('Week of Jan 5: 2 sessions')).toBeTruthy();
    expect(screen.getByText('Week of Jan 5: 725 kg lifted')).toBeTruthy();

    // FG% is scaled to 100; sessions and weight to the biggest week shown.
    expect(screen.getByTestId('fg-bar-7')).toHaveStyle({ height: 84 });
    expect(screen.getByTestId('fg-bar-6')).toHaveStyle({ height: 56 });
    expect(screen.getByTestId('sessions-bar-7')).toHaveStyle({ height: 112 });
    expect(screen.getByTestId('sessions-bar-6')).toHaveStyle({ height: 56 });
    expect(screen.getByTestId('volume-bar-7')).toHaveStyle({ height: 112 });
    // Weeks with nothing logged draw no bar.
    expect(screen.queryByTestId('fg-bar-5')).toBeNull();
    expect(screen.queryByTestId('sessions-bar-0')).toBeNull();
    expect(screen.queryByTestId('volume-bar-6')).toBeNull();
    expect(screen.getByText('100%', hidden)).toBeTruthy();
    expect(screen.getByText('2', hidden)).toBeTruthy();
    expect(screen.getByText('725 kg', hidden)).toBeTruthy();
  });

  it('gives every bar a full-sentence label, with the current week selected', async () => {
    await load();
    expect(screen.getAllByRole('button', { name: /^Week of / })).toHaveLength(24);
    expect(screen.getByLabelText('Week of Jan 5: 75% (3 of 4 shots)')).toBeSelected();
    expect(screen.getByLabelText('Week of Dec 29: 50% (1 of 2 shots)')).not.toBeSelected();
    expect(screen.getByLabelText('Week of Dec 29: 1 session')).toBeTruthy();
    expect(screen.getByLabelText('Week of Dec 22: no shots')).toBeTruthy();
    expect(screen.getByLabelText('Week of Dec 22: no sessions')).toBeTruthy();
    expect(screen.getByLabelText('Week of Dec 22: no weighted sets')).toBeTruthy();
  });

  it('labels every other week on the axis for sighted readers only', async () => {
    await load();
    for (const label of ['Nov 24', 'Dec 8', 'Dec 22', 'Jan 5']) {
      expect(screen.getAllByText(label, hidden)).toHaveLength(3);
    }
    for (const label of ['Nov 17', 'Dec 1', 'Dec 15', 'Dec 29']) {
      expect(screen.queryAllByText(label, hidden)).toHaveLength(0);
    }
    expect(screen.queryByText('Nov 24')).toBeNull();
  });

  it('moves all three readouts to the week that was tapped', async () => {
    await load();
    await fireEvent.press(screen.getByLabelText('Week of Dec 29: 50% (1 of 2 shots)'));
    expect(screen.getByText('Week of Dec 29: 50% (1 of 2 shots)')).toBeTruthy();
    expect(screen.getByText('Week of Dec 29: 1 session')).toBeTruthy();
    expect(screen.getByText('Week of Dec 29: no weighted sets')).toBeTruthy();
    expect(screen.queryByText('Week of Jan 5: 75% (3 of 4 shots)')).toBeNull();
    expect(screen.getByLabelText('Week of Dec 29: 1 session')).toBeSelected();
    expect(screen.getByLabelText('Week of Jan 5: 2 sessions')).not.toBeSelected();

    // A week with nothing in it can be picked too, from any of the charts.
    await fireEvent.press(screen.getByLabelText('Week of Dec 22: no sessions'));
    expect(screen.getByText('Week of Dec 22: no shots')).toBeTruthy();
    expect(screen.getByText('Week of Dec 22: no sessions')).toBeTruthy();
    expect(screen.getByText('Week of Dec 22: no weighted sets')).toBeTruthy();
    for (const label of screen.getAllByText('Dec 22', hidden)) {
      expect(label).toHaveStyle({ fontWeight: '700' });
    }
    for (const label of screen.getAllByText('Jan 5', hidden)) {
      expect(label).toHaveStyle({ fontWeight: '400' });
    }
  });

  it('replaces a chart that has no data with a hint and keeps the others', async () => {
    mockRepo.weeklyInputs.mockResolvedValue({ ...inputs, sets: [] });
    await load();
    expect(
      screen.getByText(
        'Log sets with a weight and your weekly total will show up here. Bodyweight sets are not counted.',
      ),
    ).toBeTruthy();
    expect(screen.queryByTestId('volume-bar-7')).toBeNull();
    expect(screen.queryByLabelText('Week of Jan 5: 725 kg lifted')).toBeNull();
    expect(screen.getByTestId('fg-bar-7')).toBeTruthy();
    expect(screen.getByTestId('sessions-bar-7')).toBeTruthy();
  });

  it('shows hints for shooting and sessions when only lifting was logged', async () => {
    mockRepo.weeklyInputs.mockResolvedValue({ shots: [], sessionStarts: [], sets: inputs.sets });
    mockRepo.sessionResults.mockResolvedValue([]);
    await load();
    expect(
      screen.getByText('Shoot a session and your weekly field goal % will show up here.'),
    ).toBeTruthy();
    expect(
      screen.getByText('Shooting sessions and workouts you log will show up here.'),
    ).toBeTruthy();
    expect(screen.queryByTestId('fg-bar-7')).toBeNull();
    expect(screen.getByTestId('volume-bar-7')).toBeTruthy();
  });
});

describe('Progress screen personal bests', () => {
  const load = async () => {
    await render(<ProgressScreen />);
    await screen.findByText('Personal bests');
  };

  it('lists the best shooting session, the longest streak and a record per lift', async () => {
    await load();
    expect(
      screen.getByLabelText('Best shooting session: 75% (15 of 20 shots on Jan 6, 2026)'),
    ).toBeTruthy();
    expect(
      screen.getByLabelText('Longest make streak: 12 (In a row, within one session)'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Squat: 100 kg')).toBeTruthy();
    expect(screen.getByLabelText('Push-up: 30 reps')).toBeTruthy();
    expect(screen.getByLabelText('Handstand: 1 rep')).toBeTruthy();
    // Timed exercises have no weight or rep record yet.
    expect(screen.queryByText('Plank')).toBeNull();
  });

  it('sorts the lifts by the name the player sees', async () => {
    await load();
    const rows = screen
      .getAllByLabelText(/^(Handstand|Push-up|Squat): /)
      .map((row) => row.props.accessibilityLabel);
    expect(rows).toEqual(['Handstand: 1 rep', 'Push-up: 30 reps', 'Squat: 100 kg']);
  });

  it('explains how to set a best when no session has enough shots yet', async () => {
    mockRepo.sessionResults.mockResolvedValue([shortSession]);
    mockRepo.liftBests.mockResolvedValue([]);
    await load();
    expect(
      screen.getByLabelText(
        'Best shooting session: — (Take at least 20 shots in one session to set a best.)',
      ),
    ).toBeTruthy();
    expect(
      screen.getByLabelText('Longest make streak: 2 (In a row, within one session)'),
    ).toBeTruthy();
    expect(screen.getByText('Log a lift to see your best weight or reps here.')).toBeTruthy();
  });

  it('shows dashes for the shooting bests before any session exists', async () => {
    mockRepo.sessionResults.mockResolvedValue([]);
    await load();
    expect(
      screen.getByLabelText(
        'Best shooting session: — (Take at least 20 shots in one session to set a best.)',
      ),
    ).toBeTruthy();
    expect(
      screen.getByLabelText('Longest make streak: — (In a row, within one session)'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Squat: 100 kg')).toBeTruthy();
  });
});
