import { DatabaseSync } from 'node:sqlite';

import type { ShotResult } from '@/features/shooting/domain/stats';
import { personalBests } from '@/features/workouts/domain/workout';
import { runMigrations } from '@/shared/db/migrate';
import { migrations } from '@/shared/db/migrations';
import { createAnalyticsRepository } from './analyticsRepository';

// Hoisted above the imports by babel-jest.
jest.mock('expo-crypto', () => ({
  randomUUID: () => jest.requireActual('node:crypto').randomUUID(),
}));

/** Real SQL on an in-memory node:sqlite database, wrapped to look like expo-sqlite's async API. */
function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  const db = {
    execAsync: async (sql: string) => void sqlite.exec(sql),
    runAsync: async (sql: string, params: unknown[] = []) =>
      void sqlite.prepare(sql).run(...(params as never[])),
    getFirstAsync: async (sql: string, params: unknown[] = []) =>
      (sqlite.prepare(sql).get(...(params as never[])) as unknown) ?? null,
    getAllAsync: async (sql: string, params: unknown[] = []) =>
      sqlite.prepare(sql).all(...(params as never[])) as unknown[],
  };
  const migrationDb = {
    getUserVersion: async () =>
      (sqlite.prepare('PRAGMA user_version').get() as { user_version: number }).user_version,
    execAsync: db.execAsync,
  };
  return { sqlite, db, migrationDb };
}

const SQUAT = '00000000-0000-4000-8000-000000000001'; // reps and weight
const PUSH_UP = '00000000-0000-4000-8000-000000000009'; // reps
const PLANK = '00000000-0000-4000-8000-000000000011'; // duration

/** A fixed UTC instant in January 2026; later seconds keep rows in the order they were seeded. */
const T = (day: number, hour = 12, second = 0) =>
  new Date(Date.UTC(2026, 0, day, hour, 0, second)).toISOString();
/** A week: Monday 5 January up to, not including, Monday 12 January. */
const FROM = T(5, 0);
const TO = T(12, 0);

type SeedSet = {
  exerciseId: string;
  reps?: number;
  weightKg?: number;
  durationS?: number;
  deleted?: boolean;
};

async function setup() {
  const { sqlite, db, migrationDb } = openDb();
  await runMigrations(migrationDb, migrations);
  let counter = 0;
  const next = () => `row-${(counter += 1)}`;
  const run = (sql: string, ...params: (string | number | null)[]) =>
    void sqlite.prepare(sql).run(...(params as never[]));

  /** Closed unless `open`; `deleted` shots are soft-deleted. Shots are taken one second apart. */
  const shootingSession = (
    startedAt: string,
    shots: (ShotResult | { result: ShotResult; deleted: true })[],
    options: { open?: boolean; deleted?: boolean } = {},
  ) => {
    const id = next();
    run(
      `INSERT INTO shooting_session (id, started_at, ended_at, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      id,
      startedAt,
      options.open ? null : startedAt,
      startedAt,
      startedAt,
      options.deleted ? startedAt : null,
    );
    shots.forEach((shot, i) => {
      const { result, deleted } =
        typeof shot === 'string' ? { result: shot, deleted: false } : shot;
      const takenAt = new Date(Date.parse(startedAt) + i * 1000).toISOString();
      run(
        `INSERT INTO shot (id, session_id, taken_at, result, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        next(),
        id,
        takenAt,
        result,
        takenAt,
        takenAt,
        deleted ? takenAt : null,
      );
    });
    return id;
  };

  const workoutSession = (startedAt: string, sets: SeedSet[], options: { open?: boolean } = {}) => {
    const id = next();
    run(
      `INSERT INTO workout_session (id, started_at, ended_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      id,
      startedAt,
      options.open ? null : startedAt,
      startedAt,
      startedAt,
    );
    sets.forEach((set, i) => {
      const loggedAt = new Date(Date.parse(startedAt) + i * 1000).toISOString();
      run(
        `INSERT INTO workout_set
           (id, session_id, exercise_id, logged_at, reps, weight_kg, duration_s, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        next(),
        id,
        set.exerciseId,
        loggedAt,
        set.reps ?? null,
        set.weightKg ?? null,
        set.durationS ?? null,
        loggedAt,
        loggedAt,
        set.deleted ? loggedAt : null,
      );
    });
    return id;
  };

  const customExercise = (name: string, deleted: boolean) => {
    const id = next();
    run(
      `INSERT INTO exercise (id, name, category, measurement_type, is_builtin, created_at, updated_at, deleted_at)
       VALUES (?, ?, 'other', 'reps_weight', 0, ?, ?, ?)`,
      id,
      name,
      T(1),
      T(1),
      deleted ? T(2) : null,
    );
    return id;
  };

  return {
    repo: createAnalyticsRepository(db as never),
    shootingSession,
    workoutSession,
    customExercise,
  };
}

describe('analytics repository: inputsBetween', () => {
  it('is empty for a new database', async () => {
    const { repo } = await setup();
    expect(await repo.inputsBetween(FROM, TO)).toEqual({ shots: [], sessionStarts: [], sets: [] });
  });

  it('returns resolved shots from the window on, in the order taken', async () => {
    const { repo, shootingSession } = await setup();
    shootingSession(T(3), ['made', 'made']); // before the window
    shootingSession(T(6), [
      'made',
      'missed',
      'uncertain',
      { result: 'made', deleted: true },
      'missed',
    ]);
    const { shots } = await repo.inputsBetween(FROM, TO);
    expect(shots).toEqual([
      { takenAt: T(6, 12, 0), result: 'made' },
      { takenAt: T(6, 12, 1), result: 'missed' },
      { takenAt: T(6, 12, 4), result: 'missed' },
    ]);
  });

  it('counts each shooting session and workout that has something logged, once', async () => {
    const { repo, shootingSession, workoutSession } = await setup();
    shootingSession(T(6), ['made', 'missed']);
    shootingSession(T(7), [{ result: 'made', deleted: true }]); // only shot was undone
    shootingSession(T(8), ['made'], { deleted: true });
    shootingSession(T(9), [], { open: true }); // started, nothing logged yet
    shootingSession(T(3), ['made']); // before the window
    workoutSession(T(6, 15), [
      { exerciseId: SQUAT, reps: 5, weightKg: 100 },
      { exerciseId: SQUAT, reps: 5, weightKg: 100 },
    ]);
    workoutSession(T(7, 15), [{ exerciseId: SQUAT, reps: 5, weightKg: 100, deleted: true }]);
    workoutSession(T(10), [], { open: true });
    const { sessionStarts } = await repo.inputsBetween(FROM, TO);
    expect([...sessionStarts].sort()).toEqual([T(6), T(6, 15)]);
  });

  it('returns only weighted sets from the window on, with their volume inputs', async () => {
    const { repo, workoutSession } = await setup();
    workoutSession(T(3), [{ exerciseId: SQUAT, reps: 5, weightKg: 100 }]); // before the window
    workoutSession(T(6), [
      { exerciseId: SQUAT, reps: 5, weightKg: 100 },
      { exerciseId: PUSH_UP, reps: 20 },
      { exerciseId: PLANK, durationS: 60 },
      { exerciseId: SQUAT, reps: 3, weightKg: 140, deleted: true },
      { exerciseId: SQUAT, reps: 8, weightKg: 0 },
    ]);
    const { sets } = await repo.inputsBetween(FROM, TO);
    expect(sets).toEqual([
      { loggedAt: T(6, 12, 0), reps: 5, weightKg: 100 },
      { loggedAt: T(6, 12, 4), reps: 8, weightKg: 0 },
    ]);
  });

  it('stops before the upper bound, which is not part of the window', async () => {
    const { repo, shootingSession, workoutSession } = await setup();
    shootingSession(T(6), ['made', 'missed', 'made']); // shots at 12:00:00, 12:00:01, 12:00:02
    shootingSession(T(7), ['made']);
    workoutSession(T(6, 15), [{ exerciseId: SQUAT, reps: 5, weightKg: 100 }]);
    workoutSession(T(7, 15), [{ exerciseId: SQUAT, reps: 5, weightKg: 100 }]);

    const week = await repo.inputsBetween(FROM, T(7, 12)); // a session at exactly 12:00 is out
    expect(week.shots).toEqual([
      { takenAt: T(6, 12, 0), result: 'made' },
      { takenAt: T(6, 12, 1), result: 'missed' },
      { takenAt: T(6, 12, 2), result: 'made' },
    ]);
    expect([...week.sessionStarts].sort()).toEqual([T(6), T(6, 15)]);
    expect(week.sets).toEqual([{ loggedAt: T(6, 15, 0), reps: 5, weightKg: 100 }]);

    // A bound in the middle of a session keeps the shots before it; the session itself still counts.
    const cut = await repo.inputsBetween(FROM, T(6, 12, 2));
    expect(cut.shots.map((s) => s.takenAt)).toEqual([T(6, 12, 0), T(6, 12, 1)]);
    expect(cut.sessionStarts).toEqual([T(6)]);
  });

  it('can read a single day, such as today', async () => {
    const { repo, shootingSession, workoutSession } = await setup();
    shootingSession(T(5, 23), ['made']);
    shootingSession(T(6, 9), ['made', 'missed']);
    workoutSession(T(6, 18), [{ exerciseId: SQUAT, reps: 5, weightKg: 100 }]);
    shootingSession(T(7, 0), ['made']);
    const today = await repo.inputsBetween(T(6, 0), T(7, 0));
    expect(today.shots).toHaveLength(2);
    expect([...today.sessionStarts].sort()).toEqual([T(6, 9), T(6, 18)]);
    expect(today.sets).toEqual([{ loggedAt: T(6, 18, 0), reps: 5, weightKg: 100 }]);
  });
});

describe('analytics repository: sessionResults', () => {
  it('is empty without shots', async () => {
    const { repo } = await setup();
    expect(await repo.sessionResults()).toEqual([]);
  });

  it('groups live shots by session in the order taken, oldest session first', async () => {
    const { repo, shootingSession } = await setup();
    const later = shootingSession(T(8), ['made', 'made', 'missed']);
    const earlier = shootingSession(T(4), [
      'missed',
      'made',
      { result: 'made', deleted: true },
      'uncertain',
    ]);
    shootingSession(T(6), ['made'], { deleted: true });
    expect(await repo.sessionResults()).toEqual([
      { sessionId: earlier, startedAt: T(4), results: ['missed', 'made', 'uncertain'] },
      { sessionId: later, startedAt: T(8), results: ['made', 'made', 'missed'] },
    ]);
  });
});

describe('analytics repository: liftBests', () => {
  const byName = <T extends { exercise: { id: string } }>(list: T[]) =>
    Object.fromEntries(list.map((item) => [item.exercise.id, item]));

  it('is empty without sets', async () => {
    const { repo } = await setup();
    expect(await repo.liftBests()).toEqual([]);
  });

  it('returns the heaviest weight and most reps per exercise, with the exercise', async () => {
    const { repo, workoutSession } = await setup();
    workoutSession(T(4), [
      { exerciseId: SQUAT, reps: 5, weightKg: 100 },
      { exerciseId: SQUAT, reps: 8, weightKg: 80 },
      { exerciseId: SQUAT, reps: 1, weightKg: 200, deleted: true },
      { exerciseId: PUSH_UP, reps: 20 },
      { exerciseId: PUSH_UP, reps: 35 },
      { exerciseId: PLANK, durationS: 60 },
    ]);
    workoutSession(T(6), [{ exerciseId: SQUAT, reps: 3, weightKg: 120 }]);
    const bests = byName(await repo.liftBests());
    expect(Object.keys(bests)).toHaveLength(3);
    expect(bests[SQUAT]).toMatchObject({
      exercise: { name: 'squat', isBuiltin: true, measurementType: 'reps_weight' },
      maxWeightKg: 120,
      maxReps: 8,
    });
    expect(bests[PUSH_UP]).toMatchObject({ maxWeightKg: null, maxReps: 35 });
    expect(bests[PLANK]).toMatchObject({ maxWeightKg: null, maxReps: null });
  });

  it('agrees with the domain rule for personal bests', async () => {
    const { repo, workoutSession } = await setup();
    const sets: SeedSet[] = [
      { exerciseId: SQUAT, reps: 5, weightKg: 100 },
      { exerciseId: SQUAT, reps: 12, weightKg: 60 },
      { exerciseId: SQUAT, reps: 2, weightKg: 0 },
      { exerciseId: PUSH_UP, reps: 18 },
    ];
    workoutSession(T(4), sets);
    const expected = personalBests(
      sets.map((s) => ({
        exerciseId: s.exerciseId,
        reps: s.reps ?? null,
        weightKg: s.weightKg ?? null,
      })),
    );
    const bests = await repo.liftBests();
    expect(bests).toHaveLength(expected.size);
    for (const best of bests) {
      expect({ maxWeightKg: best.maxWeightKg, maxReps: best.maxReps }).toEqual(
        expected.get(best.exercise.id),
      );
    }
  });

  it('keeps the record of an exercise deleted since', async () => {
    const { repo, workoutSession, customExercise } = await setup();
    const removed = customExercise('Sled push', true);
    workoutSession(T(4), [{ exerciseId: removed, reps: 4, weightKg: 150 }]);
    expect(await repo.liftBests()).toEqual([
      {
        exercise: {
          id: removed,
          name: 'Sled push',
          category: 'other',
          measurementType: 'reps_weight',
          isBuiltin: false,
        },
        maxWeightKg: 150,
        maxReps: 4,
      },
    ]);
  });
});
