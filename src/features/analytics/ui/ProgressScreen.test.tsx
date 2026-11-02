import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { Exercise, MeasurementType } from '@/features/workouts/domain/exercise';
import '@/shared/i18n';
import type { AnalyticsRepository } from '../data/analyticsRepository';
import type { LiftBest, PeriodInputs, ResolvedShot, SessionResults } from '../domain/progress';
import { ProgressScreen } from './ProgressScreen';

const mockRepo: jest.Mocked<AnalyticsRepository> = {
  inputsBetween: jest.fn(),
  sessionResults: jest.fn(),
  liftBests: jest.fn(),
};

jest.mock('../data/analyticsRepository', () => ({
  useAnalyticsRepository: () => mockRepo,
}));

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: jest.requireActual('react-native').View,
}));

const hidden = { includeHiddenElements: true };

// "Now" is Wednesday 7 Jan 2026, so the week on screen runs Monday 5 to Sunday 11 January.
const at = (year: number, month: number, day: number, hour = 12) =>
  new Date(year, month - 1, day, hour).toISOString();
const shotsAt = (takenAt: string, made: number, missed: number): ResolvedShot[] => [
  ...Array.from({ length: made }, () => ({ takenAt, result: 'made' as const })),
  ...Array.from({ length: missed }, () => ({ takenAt, result: 'missed' as const })),
];

// Tue 6 Jan: 3 of 4 shots and a shooting session.
// Wed 7 Jan, today: 1 of 2 shots and a shooting session, and a workout with 5 x 100 kg + 3 x 75 kg = 725 kg.
// Tue 30 Dec, the week before: 2 of 4 shots and a shooting session.
const logs: PeriodInputs = {
  shots: [
    ...shotsAt(at(2026, 1, 6, 10), 3, 1),
    ...shotsAt(at(2026, 1, 7, 9), 1, 1),
    ...shotsAt(at(2025, 12, 30, 10), 2, 2),
  ],
  sessionStarts: [at(2026, 1, 6, 10), at(2026, 1, 7, 8), at(2026, 1, 7, 9), at(2025, 12, 30, 10)],
  sets: [
    { loggedAt: at(2026, 1, 7, 8), reps: 5, weightKg: 100 },
    { loggedAt: at(2026, 1, 7, 8), reps: 3, weightKg: 75 },
  ],
};
const noLogs: PeriodInputs = { shots: [], sessionStarts: [], sets: [] };

/** What the repository returns: the logs inside [from, to), like its queries do. */
const between = (all: PeriodInputs) => async (from: string, to: string) => ({
  shots: all.shots.filter((s) => s.takenAt >= from && s.takenAt < to),
  sessionStarts: all.sessionStarts.filter((s) => s >= from && s < to),
  sets: all.sets.filter((s) => s.loggedAt >= from && s.loggedAt < to),
});

const repeat = <T,>(value: T, count: number): T[] => Array.from({ length: count }, () => value);

// Too short to count as a best (3 shots, a run of 2 makes).
const shortSession: SessionResults = {
  sessionId: 's1',
  startedAt: at(2025, 12, 30, 10),
  results: [...repeat('made' as const, 2), 'missed'],
};
// 15 of 20 with a run of 12 makes.
const bestSession: SessionResults = {
  sessionId: 's2',
  startedAt: at(2026, 1, 6, 10),
  results: [
    ...repeat('made' as const, 12),
    ...repeat('missed' as const, 5),
    ...repeat('made' as const, 3),
  ],
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
  mockRepo.inputsBetween.mockImplementation(between(logs));
  mockRepo.sessionResults.mockResolvedValue(sessions);
  mockRepo.liftBests.mockResolvedValue(lifts);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

/** Renders the screen and waits for the totals, which every period with something logged shows. */
const load = async () => {
  await render(<ProgressScreen />);
  await screen.findByText('Summary');
};
const press = (label: string) => fireEvent.press(screen.getByLabelText(label));
const pressKind = (name: string) => fireEvent.press(screen.getByRole('radio', { name }));

/** The bars of a day-by-day chart ("Wed, Jan 7: ...") and of the weekly one ("Week of Jan 5: ..."). */
const DAY_BAR = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), /;
const WEEK_BAR = /^Week of /;

describe('Progress screen states', () => {
  it('shows a loading indicator, then the totals and charts', async () => {
    let resolve!: (value: PeriodInputs) => void;
    mockRepo.inputsBetween.mockReturnValue(new Promise((r) => (resolve = r)));
    await render(<ProgressScreen />);
    expect(screen.getByLabelText('Loading…')).toBeTruthy();
    expect(screen.queryByText('Summary')).toBeNull();
    await act(async () => resolve(logs));
    expect(await screen.findByText('Summary')).toBeTruthy();
    expect(screen.getByText('Field goal % per day')).toBeTruthy();
    expect(screen.queryByLabelText('Loading…')).toBeNull();
  });

  it('shows the error state and retries', async () => {
    mockRepo.inputsBetween.mockRejectedValueOnce(new Error('boom'));
    await render(<ProgressScreen />);
    expect(await screen.findByText('Something went wrong.')).toBeTruthy();
    expect(screen.queryByText('Summary')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Try again'));
    expect(await screen.findByText('Summary')).toBeTruthy();
  });

  it.each(['inputsBetween', 'sessionResults', 'liftBests'] as const)(
    'shows the error state rather than partial data when %s fails',
    async (name) => {
      mockRepo[name].mockRejectedValueOnce(new Error('boom'));
      await render(<ProgressScreen />);
      expect(await screen.findByText('Something went wrong.')).toBeTruthy();
      expect(screen.queryByText('Personal bests')).toBeNull();
    },
  );

  it('shows the empty state when nothing has been logged, with the range still on offer', async () => {
    mockRepo.inputsBetween.mockResolvedValue(noLogs);
    mockRepo.sessionResults.mockResolvedValue([]);
    mockRepo.liftBests.mockResolvedValue([]);
    await render(<ProgressScreen />);
    expect(await screen.findByText('No progress yet')).toBeTruthy();
    expect(
      screen.getByText(
        'Log a shooting session or a workout and your charts and personal bests will show up here.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('Summary')).toBeNull();
    expect(screen.getByText('Jan 5 – Jan 11')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Week' })).toBeSelected();
  });
});

describe('Progress screen, week view', () => {
  it('starts on the week that holds today and asks for its logs only', async () => {
    await load();
    expect(screen.getByText('Jan 5 – Jan 11')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Week' })).toBeSelected();
    expect(mockRepo.inputsBetween).toHaveBeenCalledTimes(1);
    expect(mockRepo.inputsBetween).toHaveBeenCalledWith(
      new Date(2026, 0, 5).toISOString(),
      new Date(2026, 0, 12).toISOString(),
    );
  });

  it('totals the week, leaving out the week before', async () => {
    await load();
    expect(screen.getByLabelText('Field goal %: 67% (4 of 6 shots)')).toBeTruthy();
    expect(screen.getByLabelText('Sessions: 3')).toBeTruthy();
    expect(screen.getByLabelText('Weight lifted: 725 kg')).toBeTruthy();
  });

  it('reads out today for each chart and draws the bars to scale', async () => {
    await load();
    expect(screen.getByText('Field goal % per day')).toBeTruthy();
    expect(screen.getByText('Sessions per day')).toBeTruthy();
    expect(screen.getByText('Weight lifted per day')).toBeTruthy();
    expect(screen.getByText('Wed, Jan 7: 50% (1 of 2 shots)')).toBeTruthy();
    expect(screen.getByText('Wed, Jan 7: 2 sessions')).toBeTruthy();
    expect(screen.getByText('Wed, Jan 7: 725 kg lifted')).toBeTruthy();

    // FG% is scaled to 100; sessions and weight to the biggest day shown.
    expect(screen.getByTestId('fg-bar-1')).toHaveStyle({ height: 84 });
    expect(screen.getByTestId('fg-bar-2')).toHaveStyle({ height: 56 });
    expect(screen.getByTestId('sessions-bar-2')).toHaveStyle({ height: 112 });
    expect(screen.getByTestId('sessions-bar-1')).toHaveStyle({ height: 56 });
    expect(screen.getByTestId('volume-bar-2')).toHaveStyle({ height: 112 });
    // Days with nothing logged draw no bar.
    expect(screen.queryByTestId('fg-bar-0')).toBeNull();
    expect(screen.queryByTestId('sessions-bar-3')).toBeNull();
    expect(screen.queryByTestId('volume-bar-1')).toBeNull();
    expect(screen.getByText('100%', hidden)).toBeTruthy();
    expect(screen.getByText('2', hidden)).toBeTruthy();
    // The summary and the top of the weight scale both say it.
    expect(screen.getAllByText('725 kg', hidden)).toHaveLength(2);
  });

  it('gives every bar a full-sentence label, with today selected', async () => {
    await load();
    expect(screen.getAllByRole('button', { name: DAY_BAR })).toHaveLength(21);
    expect(screen.getByLabelText('Wed, Jan 7: 50% (1 of 2 shots)')).toBeSelected();
    expect(screen.getByLabelText('Tue, Jan 6: 75% (3 of 4 shots)')).not.toBeSelected();
    expect(screen.getByLabelText('Tue, Jan 6: 1 session')).toBeTruthy();
    expect(screen.getByLabelText('Mon, Jan 5: no shots')).toBeTruthy();
    expect(screen.getByLabelText('Mon, Jan 5: no sessions')).toBeTruthy();
    expect(screen.getByLabelText('Mon, Jan 5: no weighted sets')).toBeTruthy();
  });

  it('labels every day on the axis for sighted readers only, today in bold', async () => {
    await load();
    for (const label of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
      expect(screen.getAllByText(label, hidden)).toHaveLength(3);
    }
    expect(screen.queryByText('Wed')).toBeNull();
    for (const label of screen.getAllByText('Wed', hidden)) {
      expect(label).toHaveStyle({ fontWeight: '700' });
    }
    for (const label of screen.getAllByText('Tue', hidden)) {
      expect(label).toHaveStyle({ fontWeight: '400' });
    }
  });

  it('moves all three readouts to the day that was tapped', async () => {
    await load();
    await fireEvent.press(screen.getByLabelText('Tue, Jan 6: 75% (3 of 4 shots)'));
    expect(screen.getByText('Tue, Jan 6: 75% (3 of 4 shots)')).toBeTruthy();
    expect(screen.getByText('Tue, Jan 6: 1 session')).toBeTruthy();
    expect(screen.getByText('Tue, Jan 6: no weighted sets')).toBeTruthy();
    expect(screen.queryByText('Wed, Jan 7: 50% (1 of 2 shots)')).toBeNull();
    expect(screen.getByLabelText('Tue, Jan 6: 1 session')).toBeSelected();
    expect(screen.getByLabelText('Wed, Jan 7: 2 sessions')).not.toBeSelected();

    // A day with nothing in it can be picked too, from any of the charts.
    await fireEvent.press(screen.getByLabelText('Mon, Jan 5: no sessions'));
    expect(screen.getByText('Mon, Jan 5: no shots')).toBeTruthy();
    expect(screen.getByText('Mon, Jan 5: no sessions')).toBeTruthy();
    expect(screen.getByText('Mon, Jan 5: no weighted sets')).toBeTruthy();
    for (const label of screen.getAllByText('Mon', hidden)) {
      expect(label).toHaveStyle({ fontWeight: '700' });
    }
    for (const label of screen.getAllByText('Wed', hidden)) {
      expect(label).toHaveStyle({ fontWeight: '400' });
    }
  });

  it('replaces a chart that has no data with a hint and keeps the others', async () => {
    mockRepo.inputsBetween.mockImplementation(between({ ...logs, sets: [] }));
    await load();
    expect(
      screen.getByText(
        'Log sets with a weight and your total will show up here. Bodyweight sets are not counted.',
      ),
    ).toBeTruthy();
    expect(screen.queryByTestId('volume-bar-2')).toBeNull();
    expect(screen.queryByLabelText('Wed, Jan 7: 725 kg lifted')).toBeNull();
    expect(screen.getByTestId('fg-bar-2')).toBeTruthy();
    expect(screen.getByTestId('sessions-bar-2')).toBeTruthy();
    expect(screen.getByLabelText('Weight lifted: 0 kg')).toBeTruthy();
  });

  it('shows hints for shooting and sessions when only lifting was logged', async () => {
    mockRepo.inputsBetween.mockImplementation(
      between({ shots: [], sessionStarts: [], sets: logs.sets }),
    );
    await load();
    expect(
      screen.getByText('Shoot a session and your field goal % will show up here.'),
    ).toBeTruthy();
    expect(
      screen.getByText('Shooting sessions and workouts you log will show up here.'),
    ).toBeTruthy();
    expect(screen.queryByTestId('fg-bar-2')).toBeNull();
    expect(screen.getByTestId('volume-bar-2')).toBeTruthy();
    expect(screen.getByLabelText('Field goal %: — (No shots)')).toBeTruthy();
    expect(screen.getByLabelText('Sessions: 0')).toBeTruthy();
  });
});

describe('Progress screen range picker', () => {
  it('offers a day, a week, a month and the last eight weeks, with the week chosen', async () => {
    await load();
    // The group is not itself focusable, so a screen reader still reaches each radio inside it.
    expect(screen.getByLabelText('Time range').props.accessibilityRole).toBe('radiogroup');
    expect(screen.getAllByRole('radio').map((radio) => radio.props.accessibilityLabel)).toEqual([
      'Day',
      'Week',
      'Month',
      '8 weeks',
    ]);
    expect(screen.getByRole('radio', { name: 'Week' })).toBeSelected();
    for (const name of ['Day', 'Month', '8 weeks']) {
      expect(screen.getByRole('radio', { name })).not.toBeSelected();
    }
  });

  it('does nothing when the range already chosen is pressed again', async () => {
    await load();
    await pressKind('Week');
    expect(mockRepo.inputsBetween).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('Loading…')).toBeNull();
    expect(screen.getByText('Summary')).toBeTruthy();
  });

  it('keeps the date being looked at when the range changes', async () => {
    await load();
    await press('Previous week');
    expect(screen.getByText('Dec 29 – Jan 4')).toBeTruthy();
    await pressKind('Day');
    expect(screen.getByText('Wed, Dec 31')).toBeTruthy();
    await pressKind('Month');
    expect(screen.getByText('December 2025')).toBeTruthy();
    await pressKind('Week');
    expect(screen.getByText('Dec 29 – Jan 4')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Week' })).toBeSelected();
  });

  it('looks back from today for the last eight weeks, wherever the other ranges were left', async () => {
    await load();
    await press('Previous week');
    await pressKind('8 weeks');
    expect(mockRepo.inputsBetween).toHaveBeenLastCalledWith(
      new Date(2025, 10, 17).toISOString(),
      new Date(2026, 0, 12).toISOString(),
    );
    await pressKind('Week');
    expect(screen.getByText('Jan 5 – Jan 11')).toBeTruthy();
  });
});

describe('Progress screen, day view', () => {
  it('shows the totals of the day, without charts', async () => {
    await load();
    await pressKind('Day');
    expect(await screen.findByLabelText('Field goal %: 50% (1 of 2 shots)')).toBeTruthy();
    expect(screen.getByText('Wed, Jan 7')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Day' })).toBeSelected();
    expect(screen.getByLabelText('Sessions: 2')).toBeTruthy();
    expect(screen.getByLabelText('Weight lifted: 725 kg')).toBeTruthy();
    expect(screen.queryByText('Field goal % per day')).toBeNull();
    expect(screen.queryByText('Sessions per day')).toBeNull();
    expect(screen.queryAllByRole('button', { name: DAY_BAR })).toHaveLength(0);
    expect(screen.getByText('Personal bests')).toBeTruthy();
    expect(mockRepo.inputsBetween).toHaveBeenLastCalledWith(
      new Date(2026, 0, 7).toISOString(),
      new Date(2026, 0, 8).toISOString(),
    );
  });

  it('steps back a day and stops at today', async () => {
    await load();
    await pressKind('Day');
    await screen.findByLabelText('Field goal %: 50% (1 of 2 shots)');
    expect(screen.getByLabelText('Next day')).toBeDisabled();
    expect(screen.getByLabelText('Today')).toBeDisabled();

    await press('Previous day');
    expect(await screen.findByLabelText('Field goal %: 75% (3 of 4 shots)')).toBeTruthy();
    expect(screen.getByText('Tue, Jan 6')).toBeTruthy();
    expect(screen.getByLabelText('Sessions: 1')).toBeTruthy();
    expect(screen.getByLabelText('Weight lifted: 0 kg')).toBeTruthy();
    expect(screen.getByLabelText('Next day')).toBeEnabled();
    expect(screen.getByLabelText('Today')).toBeEnabled();

    await press('Next day');
    expect(await screen.findByLabelText('Field goal %: 50% (1 of 2 shots)')).toBeTruthy();
    expect(screen.getByLabelText('Next day')).toBeDisabled();
  });

  it('words a single shot in the singular', async () => {
    mockRepo.inputsBetween.mockImplementation(
      between({
        shots: shotsAt(at(2026, 1, 7, 9), 1, 0),
        sessionStarts: [at(2026, 1, 7, 9)],
        sets: [],
      }),
    );
    await load();
    await pressKind('Day');
    expect(await screen.findByLabelText('Field goal %: 100% (1 of 1 shot)')).toBeTruthy();
  });
});

describe('Progress screen, month view', () => {
  const openMonth = async () => {
    await load();
    await pressKind('Month');
    // 31 days in each of the three charts.
    await waitFor(() => expect(screen.getAllByRole('button', { name: DAY_BAR })).toHaveLength(93));
  };

  it('shows the month with a bar for every day, today read out', async () => {
    await openMonth();
    expect(screen.getByText('January 2026')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Month' })).toBeSelected();
    expect(mockRepo.inputsBetween).toHaveBeenLastCalledWith(
      new Date(2026, 0, 1).toISOString(),
      new Date(2026, 1, 1).toISOString(),
    );
    expect(screen.getByLabelText('Field goal %: 67% (4 of 6 shots)')).toBeTruthy();
    expect(screen.getByLabelText('Sessions: 3')).toBeTruthy();
    expect(screen.getByText('Wed, Jan 7: 50% (1 of 2 shots)')).toBeTruthy();
    expect(screen.getByLabelText('Wed, Jan 7: 50% (1 of 2 shots)')).toBeSelected();
    expect(screen.getByLabelText('Thu, Jan 1: no shots')).toBeTruthy();
    expect(screen.getByLabelText('Sat, Jan 31: no shots')).toBeTruthy();
    expect(screen.getByTestId('fg-bar-5')).toHaveStyle({ height: 84 });
    expect(screen.getByTestId('fg-bar-6')).toHaveStyle({ height: 56 });
  });

  it('puts a date on the axis at every fifth day, counting back from the last', async () => {
    await openMonth();
    for (const label of ['1', '6', '11', '16', '21', '26', '31']) {
      expect(screen.getAllByText(label, hidden)).toHaveLength(3);
    }
    expect(screen.queryAllByText('7', hidden)).toHaveLength(0);
    expect(screen.queryAllByText('30', hidden)).toHaveLength(0);
  });

  it('steps back a month and stops at the current one', async () => {
    await openMonth();
    expect(screen.getByLabelText('Next month')).toBeDisabled();
    expect(screen.getByLabelText('Today')).toBeDisabled();

    await press('Previous month');
    expect(await screen.findByLabelText('Field goal %: 50% (2 of 4 shots)')).toBeTruthy();
    expect(screen.getByText('December 2025')).toBeTruthy();
    expect(mockRepo.inputsBetween).toHaveBeenLastCalledWith(
      new Date(2025, 11, 1).toISOString(),
      new Date(2026, 0, 1).toISOString(),
    );
    // Not this month, so the day with the last logs is read out.
    expect(screen.getByLabelText('Tue, Dec 30: 50% (2 of 4 shots)')).toBeSelected();
    expect(screen.getByLabelText('Next month')).toBeEnabled();
    expect(screen.getByLabelText('Today')).toBeEnabled();

    await press('Next month');
    expect(await screen.findByLabelText('Field goal %: 67% (4 of 6 shots)')).toBeTruthy();
    expect(screen.getByText('January 2026')).toBeTruthy();
    expect(screen.getByLabelText('Next month')).toBeDisabled();
    expect(screen.getByLabelText('Today')).toBeDisabled();
  });
});

describe('Progress screen, 8 weeks', () => {
  const openTrend = async () => {
    await load();
    await pressKind('8 weeks');
    await waitFor(() => expect(screen.getAllByRole('button', { name: WEEK_BAR })).toHaveLength(24));
  };

  it('shows the last eight weeks, from the Monday of the oldest to the end of this one', async () => {
    await openTrend();
    expect(screen.getByText('Last 8 weeks')).toBeTruthy();
    expect(screen.getByRole('radio', { name: '8 weeks' })).toBeSelected();
    expect(mockRepo.inputsBetween).toHaveBeenLastCalledWith(
      new Date(2025, 10, 17).toISOString(),
      new Date(2026, 0, 12).toISOString(),
    );
    expect(screen.getByLabelText('Field goal %: 60% (6 of 10 shots)')).toBeTruthy();
    expect(screen.getByLabelText('Sessions: 4')).toBeTruthy();
    expect(screen.getByLabelText('Weight lifted: 725 kg')).toBeTruthy();
  });

  it('has nothing to move: no previous, next or Today', async () => {
    await openTrend();
    expect(screen.queryByLabelText('Today')).toBeNull();
    expect(screen.queryByLabelText('Previous week')).toBeNull();
    expect(screen.queryByLabelText('Next week')).toBeNull();
  });

  it('reads out the current week for each chart and draws the bars to scale', async () => {
    await openTrend();
    expect(screen.getByText('Field goal % per week')).toBeTruthy();
    expect(screen.getByText('Sessions per week')).toBeTruthy();
    expect(screen.getByText('Weight lifted per week')).toBeTruthy();
    expect(screen.getByText('Week of Jan 5: 67% (4 of 6 shots)')).toBeTruthy();
    expect(screen.getByText('Week of Jan 5: 3 sessions')).toBeTruthy();
    expect(screen.getByText('Week of Jan 5: 725 kg lifted')).toBeTruthy();

    expect(screen.getByTestId('fg-bar-7')).toHaveStyle({ height: 75 });
    expect(screen.getByTestId('fg-bar-6')).toHaveStyle({ height: 56 });
    expect(screen.getByTestId('sessions-bar-7')).toHaveStyle({ height: 112 });
    expect(screen.getByTestId('sessions-bar-6')).toHaveStyle({ height: 37 });
    expect(screen.getByTestId('volume-bar-7')).toHaveStyle({ height: 112 });
    // Weeks with nothing logged draw no bar.
    expect(screen.queryByTestId('fg-bar-5')).toBeNull();
    expect(screen.queryByTestId('sessions-bar-0')).toBeNull();
    expect(screen.queryByTestId('volume-bar-6')).toBeNull();
  });

  it('gives every bar a full-sentence label, with the current week selected', async () => {
    await openTrend();
    expect(screen.getByLabelText('Week of Jan 5: 67% (4 of 6 shots)')).toBeSelected();
    expect(screen.getByLabelText('Week of Dec 29: 50% (2 of 4 shots)')).not.toBeSelected();
    expect(screen.getByLabelText('Week of Dec 29: 1 session')).toBeTruthy();
    expect(screen.getByLabelText('Week of Dec 22: no shots')).toBeTruthy();
    expect(screen.getByLabelText('Week of Dec 22: no sessions')).toBeTruthy();
    expect(screen.getByLabelText('Week of Dec 22: no weighted sets')).toBeTruthy();
  });

  it('labels every other week on the axis for sighted readers only', async () => {
    await openTrend();
    for (const label of ['Nov 24', 'Dec 8', 'Dec 22', 'Jan 5']) {
      expect(screen.getAllByText(label, hidden)).toHaveLength(3);
    }
    for (const label of ['Nov 17', 'Dec 1', 'Dec 15', 'Dec 29']) {
      expect(screen.queryAllByText(label, hidden)).toHaveLength(0);
    }
    expect(screen.queryByText('Nov 24')).toBeNull();
  });

  it('moves all three readouts to the week that was tapped', async () => {
    await openTrend();
    await fireEvent.press(screen.getByLabelText('Week of Dec 29: 50% (2 of 4 shots)'));
    expect(screen.getByText('Week of Dec 29: 50% (2 of 4 shots)')).toBeTruthy();
    expect(screen.getByText('Week of Dec 29: 1 session')).toBeTruthy();
    expect(screen.getByText('Week of Dec 29: no weighted sets')).toBeTruthy();
    expect(screen.queryByText('Week of Jan 5: 67% (4 of 6 shots)')).toBeNull();
    expect(screen.getByLabelText('Week of Dec 29: 1 session')).toBeSelected();
    expect(screen.getByLabelText('Week of Jan 5: 3 sessions')).not.toBeSelected();
  });
});

describe('Progress screen, moving between weeks', () => {
  it('steps back a week and reads out the latest day with something in it', async () => {
    await load();
    await press('Previous week');
    expect(await screen.findByLabelText('Field goal %: 50% (2 of 4 shots)')).toBeTruthy();
    expect(screen.getByText('Dec 29 – Jan 4')).toBeTruthy();
    expect(mockRepo.inputsBetween).toHaveBeenLastCalledWith(
      new Date(2025, 11, 29).toISOString(),
      new Date(2026, 0, 5).toISOString(),
    );
    expect(screen.getByLabelText('Sessions: 1')).toBeTruthy();
    expect(screen.getByLabelText('Weight lifted: 0 kg')).toBeTruthy();
    // No day of that week is today, so the one with the last logs is read out.
    expect(screen.getByText('Tue, Dec 30: 50% (2 of 4 shots)')).toBeTruthy();
    expect(screen.getByLabelText('Tue, Dec 30: 50% (2 of 4 shots)')).toBeSelected();
  });

  it('starts every week afresh rather than carrying a tapped day over', async () => {
    await load();
    await fireEvent.press(screen.getByLabelText('Mon, Jan 5: no shots'));
    expect(screen.getByLabelText('Mon, Jan 5: no shots')).toBeSelected();
    await press('Previous week');
    await screen.findByLabelText('Field goal %: 50% (2 of 4 shots)');
    expect(screen.queryByText('Mon, Dec 29: no shots')).toBeNull();
    expect(screen.getByLabelText('Mon, Dec 29: no shots')).not.toBeSelected();
  });

  it('goes forward again and stops at the week that holds today', async () => {
    await load();
    expect(screen.getByLabelText('Next week')).toBeDisabled();
    expect(screen.getByLabelText('Today')).toBeDisabled();
    // There is nothing to see in the future, so the arrow does not move on.
    await press('Next week');
    expect(screen.getByText('Jan 5 – Jan 11')).toBeTruthy();
    expect(mockRepo.inputsBetween).toHaveBeenCalledTimes(1);

    await press('Previous week');
    await screen.findByLabelText('Field goal %: 50% (2 of 4 shots)');
    expect(screen.getByLabelText('Next week')).toBeEnabled();
    expect(screen.getByLabelText('Today')).toBeEnabled();

    await press('Next week');
    expect(await screen.findByLabelText('Field goal %: 67% (4 of 6 shots)')).toBeTruthy();
    expect(screen.getByText('Jan 5 – Jan 11')).toBeTruthy();
    expect(screen.getByLabelText('Next week')).toBeDisabled();
  });

  it('jumps back to today from several weeks away', async () => {
    await load();
    await press('Previous week');
    await press('Previous week');
    await press('Previous week');
    expect(screen.getByText('Dec 15 – Dec 21')).toBeTruthy();
    await press('Today');
    expect(screen.getByText('Jan 5 – Jan 11')).toBeTruthy();
    expect(await screen.findByLabelText('Field goal %: 67% (4 of 6 shots)')).toBeTruthy();
    expect(screen.getByLabelText('Today')).toBeDisabled();
  });

  it('says so when nothing was logged that week, and still shows the personal bests', async () => {
    await load();
    await press('Previous week');
    await press('Previous week');
    expect(await screen.findByText('Nothing logged in this period yet.')).toBeTruthy();
    expect(screen.getByText('Dec 22 – Dec 28')).toBeTruthy();
    expect(screen.queryByText('Summary')).toBeNull();
    expect(screen.queryByText('Field goal % per day')).toBeNull();
    expect(screen.getByText('Personal bests')).toBeTruthy();
    expect(screen.getByLabelText('Squat: 100 kg')).toBeTruthy();
  });

  it('keeps the range on offer for a player who has logged nothing at all', async () => {
    mockRepo.inputsBetween.mockResolvedValue(noLogs);
    mockRepo.sessionResults.mockResolvedValue([]);
    mockRepo.liftBests.mockResolvedValue([]);
    await render(<ProgressScreen />);
    await screen.findByText('No progress yet');
    await pressKind('Month');
    expect(screen.getByText('January 2026')).toBeTruthy();
    expect(await screen.findByText('No progress yet')).toBeTruthy();
    expect(screen.queryByText('Nothing logged in this period yet.')).toBeNull();
  });
});

describe('Progress screen, while a period loads', () => {
  const previousWeek = () =>
    between(logs)(new Date(2025, 11, 29).toISOString(), new Date(2026, 0, 5).toISOString());

  it('shows a loading indicator instead of the numbers of the period that was left', async () => {
    await load();
    let resolve!: (value: PeriodInputs) => void;
    mockRepo.inputsBetween.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    await press('Previous week');
    expect(screen.getByLabelText('Loading…')).toBeTruthy();
    expect(screen.queryByText('Summary')).toBeNull();
    expect(screen.queryByLabelText('Field goal %: 67% (4 of 6 shots)')).toBeNull();
    // The range stays on offer, so it can be changed again at once.
    expect(screen.getByText('Dec 29 – Jan 4')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Month' })).toBeTruthy();
    expect(screen.getByLabelText('Next week')).toBeEnabled();

    const answer = await previousWeek();
    await act(async () => resolve(answer));
    expect(await screen.findByLabelText('Field goal %: 50% (2 of 4 shots)')).toBeTruthy();
    expect(screen.queryByLabelText('Loading…')).toBeNull();
  });

  it('ignores a slow answer for a period that has been left since', async () => {
    await load();
    let resolveSlow!: (value: PeriodInputs) => void;
    mockRepo.inputsBetween.mockReturnValueOnce(new Promise((r) => (resolveSlow = r)));
    await press('Previous week');
    await press('Today');
    expect(await screen.findByLabelText('Field goal %: 67% (4 of 6 shots)')).toBeTruthy();

    const answer = await previousWeek();
    await act(async () => resolveSlow(answer));
    expect(screen.getByText('Jan 5 – Jan 11')).toBeTruthy();
    expect(screen.getByLabelText('Field goal %: 67% (4 of 6 shots)')).toBeTruthy();
    expect(screen.queryByLabelText('Loading…')).toBeNull();
  });

  it('shows the error state for a period that fails, and retries that period', async () => {
    await load();
    mockRepo.inputsBetween.mockRejectedValueOnce(new Error('boom'));
    await press('Previous week');
    expect(await screen.findByText('Something went wrong.')).toBeTruthy();
    expect(screen.getByText('Dec 29 – Jan 4')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Try again'));
    expect(await screen.findByLabelText('Field goal %: 50% (2 of 4 shots)')).toBeTruthy();
    expect(screen.queryByText('Something went wrong.')).toBeNull();
  });

  it('lets the player pick another range after an error', async () => {
    await load();
    mockRepo.inputsBetween.mockRejectedValueOnce(new Error('boom'));
    await press('Previous week');
    await screen.findByText('Something went wrong.');
    await pressKind('Month');
    expect(await screen.findByLabelText('Field goal %: 50% (2 of 4 shots)')).toBeTruthy();
    expect(screen.getByText('December 2025')).toBeTruthy();
    expect(screen.queryByText('Something went wrong.')).toBeNull();
  });
});

describe('Progress screen personal bests', () => {
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

  it('keeps the bests of all time whichever period is shown', async () => {
    await load();
    await press('Previous week');
    await press('Previous week');
    await screen.findByText('Nothing logged in this period yet.');
    expect(
      screen.getByLabelText('Best shooting session: 75% (15 of 20 shots on Jan 6, 2026)'),
    ).toBeTruthy();
    // Moving between periods does not ask for the bests again.
    expect(mockRepo.sessionResults).toHaveBeenCalledTimes(1);
    expect(mockRepo.liftBests).toHaveBeenCalledTimes(1);
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
