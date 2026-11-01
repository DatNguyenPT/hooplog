import type { ShotResult } from '@/features/shooting/domain/stats';
import { dayKey } from '@/features/training-plans/domain/plan';
import type { Exercise } from '@/features/workouts/domain/exercise';
import {
  MIN_ATTEMPTS_FOR_BEST,
  WEEKS_SHOWN,
  buildWeeklyStats,
  firstWeekStart,
  isEmptyProgress,
  liftRecords,
  scaleBars,
  shootingBests,
  type LiftBest,
  type SessionResults,
  type WeeklyInputs,
} from './progress';

/** Local wall-clock time as an ISO string, so the tests do not depend on the machine's time zone. */
const at = (year: number, month: number, day: number, hour = 12) =>
  new Date(year, month - 1, day, hour).toISOString();

/** Wednesday 7 January 2026, so the current week starts Monday 5 January. */
const NOW = new Date(2026, 0, 7, 12, 0);

const EMPTY: WeeklyInputs = { shots: [], sessionStarts: [], sets: [] };

const results = (made: number, missed: number): ShotResult[] => [
  ...Array<ShotResult>(made).fill('made'),
  ...Array<ShotResult>(missed).fill('missed'),
];

const session = (id: string, shots: readonly ShotResult[]): SessionResults => ({
  sessionId: id,
  startedAt: at(2026, 1, 1),
  results: shots,
});

describe('firstWeekStart', () => {
  it('is the Monday of the oldest week shown', () => {
    expect(dayKey(firstWeekStart(NOW))).toBe('2025-11-17');
    expect(dayKey(firstWeekStart(NOW, 1))).toBe('2026-01-05');
  });

  it('is the same Monday for any day of the week, Sunday included', () => {
    expect(dayKey(firstWeekStart(new Date(2026, 0, 5, 0, 0)))).toBe('2025-11-17');
    expect(dayKey(firstWeekStart(new Date(2026, 0, 11, 23, 59)))).toBe('2025-11-17');
    expect(dayKey(firstWeekStart(new Date(2026, 0, 12, 0, 0)))).toBe('2025-11-24');
  });
});

describe('buildWeeklyStats', () => {
  it('returns consecutive weeks, oldest first, ending with the current week', () => {
    const weeks = buildWeeklyStats(EMPTY, NOW);
    expect(weeks).toHaveLength(WEEKS_SHOWN);
    expect(weeks.map((w) => dayKey(w.start))).toEqual([
      '2025-11-17',
      '2025-11-24',
      '2025-12-01',
      '2025-12-08',
      '2025-12-15',
      '2025-12-22',
      '2025-12-29',
      '2026-01-05',
    ]);
  });

  it('has no data for any week when nothing is logged', () => {
    for (const week of buildWeeklyStats(EMPTY, NOW)) {
      expect(week).toMatchObject({
        made: 0,
        missed: 0,
        fgPercentage: null,
        sessions: 0,
        volumeKg: 0,
      });
    }
  });

  it('computes FG% per week from made and missed shots, leaving weeks without shots empty', () => {
    const weeks = buildWeeklyStats(
      {
        ...EMPTY,
        shots: [
          { takenAt: at(2026, 1, 5), result: 'made' },
          { takenAt: at(2026, 1, 6), result: 'made' },
          { takenAt: at(2026, 1, 7), result: 'made' },
          { takenAt: at(2026, 1, 7), result: 'missed' },
          { takenAt: at(2025, 12, 30), result: 'missed' },
        ],
      },
      NOW,
    );
    const current = weeks[7];
    expect(current).toMatchObject({ made: 3, missed: 1, fgPercentage: 75 });
    expect(weeks[6]).toMatchObject({ made: 0, missed: 1, fgPercentage: 0 });
    expect(weeks[5].fgPercentage).toBeNull();
  });

  it('puts Sunday night in the week that is ending and Monday morning in the next', () => {
    const weeks = buildWeeklyStats(
      {
        ...EMPTY,
        shots: [
          { takenAt: new Date(2026, 0, 4, 23, 59).toISOString(), result: 'made' },
          { takenAt: new Date(2026, 0, 5, 0, 0).toISOString(), result: 'missed' },
        ],
      },
      NOW,
    );
    expect(weeks[6]).toMatchObject({ made: 1, missed: 0 });
    expect(weeks[7]).toMatchObject({ made: 0, missed: 1 });
  });

  it('counts sessions per week', () => {
    const weeks = buildWeeklyStats(
      {
        ...EMPTY,
        sessionStarts: [at(2026, 1, 5), at(2026, 1, 6), at(2026, 1, 7), at(2025, 12, 31)],
      },
      NOW,
    );
    expect(weeks.map((w) => w.sessions)).toEqual([0, 0, 0, 0, 0, 0, 1, 3]);
  });

  it('adds up volume as reps x weight and ignores sets without a weight', () => {
    const weeks = buildWeeklyStats(
      {
        ...EMPTY,
        sets: [
          { loggedAt: at(2026, 1, 6), reps: 5, weightKg: 100 },
          { loggedAt: at(2026, 1, 6), reps: 10, weightKg: 22.5 },
          { loggedAt: at(2026, 1, 7), reps: 20, weightKg: null },
          { loggedAt: at(2026, 1, 7), reps: null, weightKg: null },
          { loggedAt: at(2026, 1, 7), reps: 8, weightKg: 0 },
        ],
      },
      NOW,
    );
    expect(weeks[7].volumeKg).toBe(725);
    expect(weeks[6].volumeKg).toBe(0);
  });

  it('ignores entries older than the window and dated after the current week', () => {
    const weeks = buildWeeklyStats(
      {
        shots: [
          { takenAt: at(2025, 11, 16), result: 'made' },
          { takenAt: at(2026, 1, 12), result: 'made' },
        ],
        sessionStarts: [at(2025, 11, 16), at(2026, 1, 12)],
        sets: [
          { loggedAt: at(2025, 11, 16), reps: 5, weightKg: 100 },
          { loggedAt: at(2026, 1, 12), reps: 5, weightKg: 100 },
        ],
      },
      NOW,
    );
    for (const week of weeks) {
      expect(week).toMatchObject({ made: 0, sessions: 0, volumeKg: 0, fgPercentage: null });
    }
  });

  it('keeps the oldest week of the window', () => {
    const weeks = buildWeeklyStats({ ...EMPTY, sessionStarts: [at(2025, 11, 17, 0)] }, NOW);
    expect(weeks[0].sessions).toBe(1);
  });

  it('supports a different number of weeks', () => {
    const weeks = buildWeeklyStats({ ...EMPTY, sessionStarts: [at(2026, 1, 6)] }, NOW, 2);
    expect(weeks.map((w) => dayKey(w.start))).toEqual(['2025-12-29', '2026-01-05']);
    expect(weeks.map((w) => w.sessions)).toEqual([0, 1]);
  });
});

describe('scaleBars', () => {
  it('scales to the largest value when no maximum is given', () => {
    expect(scaleBars([2, 4, 1, 0])).toEqual([0.5, 1, 0.25, 0]);
  });

  it('scales against a fixed maximum, so FG% is read on a 0-100 scale', () => {
    expect(scaleBars([50, 100, 25], 100)).toEqual([0.5, 1, 0.25]);
  });

  it('draws nothing for missing data or when every value is zero', () => {
    expect(scaleBars([null, 40], 100)).toEqual([0, 0.4]);
    expect(scaleBars([0, 0, null])).toEqual([0, 0, 0]);
    expect(scaleBars([])).toEqual([]);
  });

  it('keeps fractions within 0-1', () => {
    expect(scaleBars([150, -5], 100)).toEqual([1, 0]);
  });
});

describe('shootingBests', () => {
  it('has no bests without sessions', () => {
    expect(shootingBests([])).toEqual({ bestSession: null, longestMakeStreak: 0 });
  });

  it('picks the highest FG% among sessions with enough shots', () => {
    const { bestSession } = shootingBests([
      session('lucky', results(10, 0)),
      session('a', results(15, 5)),
      session('b', results(16, 4)),
      session('c', results(14, 6)),
    ]);
    expect(bestSession).toMatchObject({
      sessionId: 'b',
      made: 16,
      attempts: 20,
      fgPercentage: 80,
    });
  });

  it('counts a session from exactly the minimum number of shots', () => {
    expect(MIN_ATTEMPTS_FOR_BEST).toBe(20);
    expect(shootingBests([session('x', results(20, 0))]).bestSession?.sessionId).toBe('x');
    expect(shootingBests([session('x', results(19, 0))]).bestSession).toBeNull();
  });

  it('honours a custom minimum', () => {
    expect(shootingBests([session('x', results(5, 0))], 5).bestSession?.sessionId).toBe('x');
  });

  it('gives a tie on FG% to the session with more shots, and a full tie to the first', () => {
    const tied = shootingBests([
      session('short', results(15, 5)),
      session('long', results(30, 10)),
      session('later', results(30, 10)),
    ]);
    expect(tied.bestSession?.sessionId).toBe('long');
  });

  it('ignores uncertain shots when counting attempts', () => {
    const shots: ShotResult[] = [...results(19, 0), 'uncertain'];
    expect(shootingBests([session('x', shots)]).bestSession).toBeNull();
  });

  it('reports the longest make streak of any session, even a short one', () => {
    const bests = shootingBests([
      session('long', [...results(3, 1), ...results(4, 0)]),
      session('streaky', results(9, 0)),
    ]);
    expect(bests.longestMakeStreak).toBe(9);
    expect(bests.bestSession).toBeNull();
  });

  it('does not let an uncertain shot break a streak', () => {
    const shots: ShotResult[] = ['made', 'made', 'uncertain', 'made', 'missed', 'made'];
    expect(shootingBests([session('x', shots)]).longestMakeStreak).toBe(3);
  });

  it('keeps the session date for display', () => {
    const only = { sessionId: 'x', startedAt: at(2026, 1, 3), results: results(20, 0) };
    expect(shootingBests([only]).bestSession?.startedAt).toBe(only.startedAt);
  });
});

describe('liftRecords', () => {
  const lift = (
    id: string,
    name: string,
    measurementType: Exercise['measurementType'],
    maxWeightKg: number | null,
    maxReps: number | null,
  ): LiftBest => ({
    exercise: { id, name, category: 'strength', measurementType, isBuiltin: false },
    maxWeightKg,
    maxReps,
  });
  const nameOf = (e: Exercise) => e.name;

  it('records the heaviest weight of a weighted lift', () => {
    expect(liftRecords([lift('1', 'Squat', 'reps_weight', 120, 12)], nameOf)).toEqual([
      { exerciseId: '1', name: 'Squat', kind: 'weight', weightKg: 120 },
    ]);
  });

  it('records the most reps of a reps-only exercise', () => {
    expect(liftRecords([lift('2', 'Push-up', 'reps', null, 30)], nameOf)).toEqual([
      { exerciseId: '2', name: 'Push-up', kind: 'reps', reps: 30 },
    ]);
  });

  it('falls back to reps for a weighted exercise only ever logged unloaded', () => {
    expect(liftRecords([lift('3', 'Lunge', 'reps_weight', 0, 15)], nameOf)).toEqual([
      { exerciseId: '3', name: 'Lunge', kind: 'reps', reps: 15 },
    ]);
  });

  it('skips exercises without a usable record', () => {
    expect(
      liftRecords(
        [
          lift('4', 'Plank', 'duration', null, null),
          lift('5', 'Sprint', 'distance', null, null),
          lift('6', 'Odd', 'reps_weight', null, null),
        ],
        nameOf,
      ),
    ).toEqual([]);
  });

  it('sorts by display name', () => {
    const names: Record<string, string> = {
      squat: 'Squat',
      bench_press: 'Bench press',
      deadlift: 'Deadlift',
    };
    const records = liftRecords(
      [
        lift('1', 'squat', 'reps_weight', 100, 5),
        lift('2', 'bench_press', 'reps_weight', 80, 5),
        lift('3', 'deadlift', 'reps_weight', 140, 3),
      ],
      (e) => names[e.name] ?? e.name,
    );
    expect(records.map((r) => r.name)).toEqual(['Bench press', 'Deadlift', 'Squat']);
  });
});

describe('isEmptyProgress', () => {
  const noShooting = { bestSession: null, longestMakeStreak: 0 };
  const quiet = buildWeeklyStats(EMPTY, NOW);

  it('is empty when nothing was ever logged', () => {
    expect(isEmptyProgress(quiet, noShooting, [])).toBe(true);
  });

  it('is not empty once any week has activity', () => {
    const withSession = buildWeeklyStats({ ...EMPTY, sessionStarts: [at(2026, 1, 6)] }, NOW);
    expect(isEmptyProgress(withSession, noShooting, [])).toBe(false);
  });

  it('is not empty when only older bests exist', () => {
    expect(isEmptyProgress(quiet, { bestSession: null, longestMakeStreak: 4 }, [])).toBe(false);
    expect(
      isEmptyProgress(quiet, noShooting, [
        { exerciseId: '1', name: 'Squat', kind: 'weight', weightKg: 100 },
      ]),
    ).toBe(false);
  });
});
