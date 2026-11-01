import type { ShotResult } from '@/features/shooting/domain/stats';
import { dayKey } from '@/features/training-plans/domain/plan';
import type { Exercise } from '@/features/workouts/domain/exercise';

import { periodLayout } from './period';
import {
  MIN_ATTEMPTS_FOR_BEST,
  buildBucketStats,
  hasActivity,
  hasNoBests,
  liftRecords,
  scaleBars,
  shootingBests,
  sumStats,
  type BucketStats,
  type LiftBest,
  type PeriodInputs,
  type SessionResults,
} from './progress';

/** Local wall-clock time as an ISO string, so the tests do not depend on the machine's time zone. */
const at = (year: number, month: number, day: number, hour = 12) =>
  new Date(year, month - 1, day, hour).toISOString();

/** Wednesday 7 January 2026, so the current week starts Monday 5 January. */
const NOW = new Date(2026, 0, 7, 12, 0);

/** The 8 weekly bars of the trend: Monday 17 November 2025 to Monday 5 January 2026. */
const TREND = periodLayout({ kind: 'trend', anchor: NOW });
/** The 7 daily bars of the week of NOW: Monday 5 to Sunday 11 January 2026. */
const WEEK = periodLayout({ kind: 'week', anchor: NOW });

const EMPTY: PeriodInputs = { shots: [], sessionStarts: [], sets: [] };

const keys = (buckets: readonly BucketStats[]) => buckets.map((b) => dayKey(b.start));

const results = (made: number, missed: number): ShotResult[] => [
  ...Array<ShotResult>(made).fill('made'),
  ...Array<ShotResult>(missed).fill('missed'),
];

const session = (id: string, shots: readonly ShotResult[]): SessionResults => ({
  sessionId: id,
  startedAt: at(2026, 1, 1),
  results: shots,
});

describe('buildBucketStats', () => {
  it('returns one bucket per bar, oldest first', () => {
    expect(keys(buildBucketStats(EMPTY, TREND))).toEqual([
      '2025-11-17',
      '2025-11-24',
      '2025-12-01',
      '2025-12-08',
      '2025-12-15',
      '2025-12-22',
      '2025-12-29',
      '2026-01-05',
    ]);
    expect(keys(buildBucketStats(EMPTY, WEEK))).toEqual([
      '2026-01-05',
      '2026-01-06',
      '2026-01-07',
      '2026-01-08',
      '2026-01-09',
      '2026-01-10',
      '2026-01-11',
    ]);
  });

  it('has no data for any bar when nothing is logged', () => {
    for (const bucket of buildBucketStats(EMPTY, TREND)) {
      expect(bucket).toMatchObject({
        made: 0,
        missed: 0,
        fgPercentage: null,
        sessions: 0,
        volumeKg: 0,
      });
    }
  });

  describe('with weekly bars', () => {
    it('computes FG% per week from made and missed shots, leaving weeks without shots empty', () => {
      const weeks = buildBucketStats(
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
        TREND,
      );
      expect(weeks[7]).toMatchObject({ made: 3, missed: 1, fgPercentage: 75 });
      expect(weeks[6]).toMatchObject({ made: 0, missed: 1, fgPercentage: 0 });
      expect(weeks[5].fgPercentage).toBeNull();
    });

    it('puts Sunday night in the week that is ending and Monday morning in the next', () => {
      const weeks = buildBucketStats(
        {
          ...EMPTY,
          shots: [
            { takenAt: new Date(2026, 0, 4, 23, 59).toISOString(), result: 'made' },
            { takenAt: new Date(2026, 0, 5, 0, 0).toISOString(), result: 'missed' },
          ],
        },
        TREND,
      );
      expect(weeks[6]).toMatchObject({ made: 1, missed: 0 });
      expect(weeks[7]).toMatchObject({ made: 0, missed: 1 });
    });

    it('counts sessions per week', () => {
      const weeks = buildBucketStats(
        {
          ...EMPTY,
          sessionStarts: [at(2026, 1, 5), at(2026, 1, 6), at(2026, 1, 7), at(2025, 12, 31)],
        },
        TREND,
      );
      expect(weeks.map((w) => w.sessions)).toEqual([0, 0, 0, 0, 0, 0, 1, 3]);
    });

    it('adds up volume as reps x weight and ignores sets without a weight', () => {
      const weeks = buildBucketStats(
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
        TREND,
      );
      expect(weeks[7].volumeKg).toBe(725);
      expect(weeks[6].volumeKg).toBe(0);
    });

    it('ignores entries older than the window and dated after the current week', () => {
      const weeks = buildBucketStats(
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
        TREND,
      );
      for (const week of weeks) {
        expect(week).toMatchObject({ made: 0, sessions: 0, volumeKg: 0, fgPercentage: null });
      }
    });

    it('keeps the oldest week of the window', () => {
      const weeks = buildBucketStats({ ...EMPTY, sessionStarts: [at(2025, 11, 17, 0)] }, TREND);
      expect(weeks[0].sessions).toBe(1);
    });
  });

  describe('with daily bars', () => {
    it('puts each log in the day it was made', () => {
      const days = buildBucketStats(
        {
          shots: [
            { takenAt: at(2026, 1, 5), result: 'made' },
            { takenAt: at(2026, 1, 7), result: 'made' },
            { takenAt: at(2026, 1, 7), result: 'missed' },
            { takenAt: new Date(2026, 0, 11, 23, 59).toISOString(), result: 'missed' },
          ],
          sessionStarts: [at(2026, 1, 7), at(2026, 1, 7)],
          sets: [{ loggedAt: at(2026, 1, 9), reps: 5, weightKg: 100 }],
        },
        WEEK,
      );
      expect(days.map((d) => d.made + d.missed)).toEqual([1, 0, 2, 0, 0, 0, 1]);
      expect(days[2]).toMatchObject({ made: 1, missed: 1, fgPercentage: 50, sessions: 2 });
      expect(days[4].volumeKg).toBe(500);
      expect(days[6]).toMatchObject({ made: 0, missed: 1, fgPercentage: 0 });
    });

    it('ends a day at midnight, so the window holds Sunday 23:59 but not Monday 00:00', () => {
      const days = buildBucketStats(
        {
          ...EMPTY,
          shots: [
            { takenAt: new Date(2026, 0, 4, 23, 59).toISOString(), result: 'made' },
            { takenAt: new Date(2026, 0, 5, 0, 0).toISOString(), result: 'made' },
            { takenAt: new Date(2026, 0, 11, 23, 59).toISOString(), result: 'made' },
            { takenAt: new Date(2026, 0, 12, 0, 0).toISOString(), result: 'made' },
          ],
        },
        WEEK,
      );
      expect(days.map((d) => d.made)).toEqual([1, 0, 0, 0, 0, 0, 1]);
    });

    it("shows today's logs on a Sunday, the last day of its week", () => {
      const sunday = new Date(2026, 10, 1, 18, 0);
      const inputs: PeriodInputs = {
        shots: [
          { takenAt: at(2026, 11, 1, 9), result: 'made' },
          { takenAt: at(2026, 10, 31, 9), result: 'missed' },
        ],
        sessionStarts: [at(2026, 11, 1, 9)],
        sets: [],
      };
      const week = buildBucketStats(inputs, periodLayout({ kind: 'week', anchor: sunday }));
      expect(dayKey(week[0].start)).toBe('2026-10-26');
      expect(week[5]).toMatchObject({ made: 0, missed: 1 });
      expect(week[6]).toMatchObject({ made: 1, fgPercentage: 100, sessions: 1 });

      const day = buildBucketStats(inputs, periodLayout({ kind: 'day', anchor: sunday }));
      expect(day).toHaveLength(1);
      expect(day[0]).toMatchObject({ made: 1, missed: 0, fgPercentage: 100, sessions: 1 });
    });

    it('covers a whole month and nothing around it', () => {
      const february = periodLayout({ kind: 'month', anchor: new Date(2026, 1, 10) });
      const days = buildBucketStats(
        {
          ...EMPTY,
          shots: [
            { takenAt: new Date(2026, 0, 31, 23, 59).toISOString(), result: 'made' },
            { takenAt: new Date(2026, 1, 1, 0, 0).toISOString(), result: 'made' },
            { takenAt: new Date(2026, 1, 28, 23, 59).toISOString(), result: 'made' },
            { takenAt: new Date(2026, 2, 1, 0, 0).toISOString(), result: 'made' },
          ],
        },
        february,
      );
      expect(days).toHaveLength(28);
      expect(days.map((d) => d.made).reduce((a, b) => a + b, 0)).toBe(2);
      expect(days[0].made).toBe(1);
      expect(days[27].made).toBe(1);
    });
  });
});

describe('sumStats', () => {
  it('adds every bar up', () => {
    const bars = buildBucketStats(
      {
        shots: [
          { takenAt: at(2026, 1, 5), result: 'made' },
          { takenAt: at(2026, 1, 7), result: 'made' },
          { takenAt: at(2026, 1, 7), result: 'missed' },
        ],
        sessionStarts: [at(2026, 1, 5), at(2026, 1, 7)],
        sets: [{ loggedAt: at(2026, 1, 6), reps: 5, weightKg: 100 }],
      },
      WEEK,
    );
    expect(sumStats(bars)).toEqual({
      made: 2,
      missed: 1,
      fgPercentage: expect.closeTo(66.67, 1),
      sessions: 2,
      volumeKg: 500,
    });
  });

  it('works out FG% from the total shots, not by averaging the bars', () => {
    const bars = buildBucketStats(
      {
        ...EMPTY,
        shots: [
          { takenAt: at(2026, 1, 5), result: 'made' },
          { takenAt: at(2026, 1, 6), result: 'made' },
          { takenAt: at(2026, 1, 6), result: 'missed' },
          { takenAt: at(2026, 1, 6), result: 'missed' },
          { takenAt: at(2026, 1, 6), result: 'missed' },
        ],
      },
      WEEK,
    );
    // The bars read 100% and 25%; the average of those would be 62.5%.
    expect(sumStats(bars).fgPercentage).toBe(40);
  });

  it('has no FG% when no shot was taken, and is empty for no bars', () => {
    const quiet = sumStats(buildBucketStats(EMPTY, WEEK));
    expect(quiet).toEqual({ made: 0, missed: 0, fgPercentage: null, sessions: 0, volumeKg: 0 });
    expect(sumStats([])).toEqual(quiet);
  });
});

describe('hasActivity', () => {
  const quiet = sumStats([]);

  it('is false when nothing was logged', () => {
    expect(hasActivity(quiet)).toBe(false);
  });

  it('is true once there is a session, a shot or any volume', () => {
    expect(hasActivity({ ...quiet, sessions: 1 })).toBe(true);
    expect(hasActivity({ ...quiet, missed: 1 })).toBe(true);
    expect(hasActivity({ ...quiet, volumeKg: 20 })).toBe(true);
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

describe('hasNoBests', () => {
  const noShooting = { bestSession: null, longestMakeStreak: 0 };

  it('is true when no best exists yet', () => {
    expect(hasNoBests(noShooting, [])).toBe(true);
  });

  it('is false once a shooting best or a lift record exists', () => {
    expect(hasNoBests({ bestSession: null, longestMakeStreak: 4 }, [])).toBe(false);
    expect(
      hasNoBests(noShooting, [{ exerciseId: '1', name: 'Squat', kind: 'weight', weightKg: 100 }]),
    ).toBe(false);
  });
});
