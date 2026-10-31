import { DatabaseSync } from 'node:sqlite';

import { runMigrations } from '@/shared/db/migrate';
import { migrations } from '@/shared/db/migrations';
import { createExerciseRepository } from './exerciseRepository';
import { createWorkoutRepository } from './workoutRepository';

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

async function setup() {
  const { sqlite, db, migrationDb } = openDb();
  await runMigrations(migrationDb, migrations);
  return {
    sqlite,
    exercises: createExerciseRepository(db as never),
    workouts: createWorkoutRepository(db as never),
  };
}

const reps = (n: number) => ({ reps: n, weightKg: null, durationS: null, distanceM: null });
const lift = (n: number, kg: number) => ({ ...reps(n), weightKg: kg });

describe('exercise repository', () => {
  it('seeds built-in exercises with stable ids and translation keys', async () => {
    const { exercises } = await setup();
    const all = await exercises.list();
    expect(all).toHaveLength(20);
    expect(all.every((e) => e.isBuiltin)).toBe(true);
    expect(await exercises.get('00000000-0000-4000-8000-000000000001')).toEqual({
      id: '00000000-0000-4000-8000-000000000001',
      name: 'squat',
      category: 'strength',
      measurementType: 'reps_weight',
      isBuiltin: true,
    });
    const types = new Set(all.map((e) => e.measurementType));
    expect(types).toEqual(new Set(['reps', 'reps_weight', 'duration', 'distance']));
  });

  it('creates custom exercises, lists them after built-ins, and soft-deletes only custom ones', async () => {
    const { exercises } = await setup();
    const mine = await exercises.createCustom({ name: 'Mikan drill', measurementType: 'reps' });
    expect(mine).toMatchObject({ name: 'Mikan drill', isBuiltin: false, category: 'other' });
    const all = await exercises.list();
    expect(all).toHaveLength(21);
    expect(all[all.length - 1].id).toBe(mine.id);

    await exercises.softDeleteCustom('00000000-0000-4000-8000-000000000001');
    expect(await exercises.get('00000000-0000-4000-8000-000000000001')).not.toBeNull();

    await exercises.softDeleteCustom(mine.id);
    expect(await exercises.get(mine.id)).toBeNull();
    expect(await exercises.list()).toHaveLength(20);
  });
});

describe('workout repository', () => {
  const SQUAT = '00000000-0000-4000-8000-000000000001';
  const PUSH_UP = '00000000-0000-4000-8000-000000000009';

  it('resumes the open workout instead of starting another', async () => {
    const { workouts } = await setup();
    const a = await workouts.startOrResumeSession();
    expect(await workouts.startOrResumeSession()).toBe(a);
    expect(await workouts.getActiveSessionId()).toBe(a);
  });

  it('yields a single open workout when started concurrently', async () => {
    const { workouts } = await setup();
    const ids = await Promise.all([
      workouts.startOrResumeSession(),
      workouts.startOrResumeSession(),
      workouts.startOrResumeSession(),
    ]);
    expect(new Set(ids).size).toBe(1);
    expect(await workouts.listSessions(10)).toHaveLength(1);
  });

  it('groups sets by exercise in the order first logged', async () => {
    const { workouts } = await setup();
    const id = await workouts.startOrResumeSession();
    await workouts.addSet(id, PUSH_UP, reps(15));
    await workouts.addSet(id, SQUAT, lift(5, 100));
    await workouts.addSet(id, PUSH_UP, reps(12));
    await workouts.addSet(id, SQUAT, lift(5, 105));

    const detail = await workouts.getSession(id);
    expect(detail?.groups.map((g) => g.exercise.name)).toEqual(['push_up', 'squat']);
    expect(detail?.groups[0].sets.map((s) => s.reps)).toEqual([15, 12]);
    expect(detail?.groups[1].sets.map((s) => [s.reps, s.weightKg])).toEqual([
      [5, 100],
      [5, 105],
    ]);
  });

  it('updates and soft-deletes sets', async () => {
    const { workouts, sqlite } = await setup();
    const id = await workouts.startOrResumeSession();
    const a = await workouts.addSet(id, SQUAT, lift(5, 100));
    const b = await workouts.addSet(id, SQUAT, lift(5, 100));
    await workouts.updateSet(a, lift(8, 90));
    await workouts.deleteSet(b);
    await workouts.deleteSet(b); // idempotent
    await workouts.updateSet(b, lift(1, 1)); // no effect on a deleted set

    const sets = (await workouts.getSession(id))?.groups[0].sets;
    expect(sets).toHaveLength(1);
    expect(sets?.[0]).toMatchObject({ id: a, reps: 8, weightKg: 90 });
    const row = sqlite.prepare('SELECT reps, deleted_at FROM workout_set WHERE id = ?').get(b) as {
      reps: number;
      deleted_at: string | null;
    };
    expect(row.reps).toBe(5);
    expect(row.deleted_at).not.toBeNull();
  });

  it('rejects sets for unknown exercises and out-of-range values at the database', async () => {
    const { workouts } = await setup();
    const id = await workouts.startOrResumeSession();
    await expect(workouts.addSet(id, 'missing', reps(5))).rejects.toThrow();
    await expect(workouts.addSet(id, SQUAT, reps(0))).rejects.toThrow();
  });

  it('keeps names in history after a custom exercise is deleted', async () => {
    const { workouts, exercises } = await setup();
    const mine = await exercises.createCustom({ name: 'Wall sit', measurementType: 'duration' });
    const id = await workouts.startOrResumeSession();
    await workouts.addSet(id, mine.id, { ...reps(1), reps: null, durationS: 60 });
    await exercises.softDeleteCustom(mine.id);
    const detail = await workouts.getSession(id);
    expect(detail?.groups[0].exercise.name).toBe('Wall sit');
    expect(detail?.groups[0].sets[0].durationS).toBe(60);
  });

  it('discards an empty workout when it ends, and keeps one with sets', async () => {
    const { workouts } = await setup();
    const empty = await workouts.startOrResumeSession();
    await workouts.endSession(empty);
    expect(await workouts.getSession(empty)).toBeNull();
    expect(await workouts.getActiveSessionId()).toBeNull();

    const kept = await workouts.startOrResumeSession();
    const set = await workouts.addSet(kept, SQUAT, lift(5, 100));
    await workouts.deleteSet(set); // a workout whose only set was deleted counts as empty
    await workouts.endSession(kept);
    expect(await workouts.getSession(kept)).toBeNull();

    const real = await workouts.startOrResumeSession();
    await workouts.addSet(real, SQUAT, lift(5, 100));
    await workouts.endSession(real);
    expect((await workouts.getSession(real))?.endedAt).not.toBeNull();
    expect(await workouts.getActiveSessionId()).toBeNull();
  });

  it('lists workouts newest first with summaries', async () => {
    const { workouts } = await setup();
    const first = await workouts.startOrResumeSession();
    await workouts.addSet(first, SQUAT, lift(5, 100));
    await workouts.addSet(first, SQUAT, lift(3, 110));
    await workouts.addSet(first, PUSH_UP, reps(20));
    const dropped = await workouts.addSet(first, PUSH_UP, reps(99));
    await workouts.deleteSet(dropped);
    await workouts.endSession(first);
    const second = await workouts.startOrResumeSession();

    const list = await workouts.listSessions(10);
    expect(list.map((w) => w.id)).toEqual([second, first]);
    expect(list[1].summary).toMatchObject({ sets: 3, totalReps: 28, totalVolumeKg: 830 });
    expect(list[1].summary.durationS).not.toBeNull();
    expect(list[0].summary).toMatchObject({ sets: 0, durationS: null });
    expect(await workouts.listSessions(1)).toHaveLength(1);
  });
});

describe('migration v2 -> v3', () => {
  it('keeps shooting data and adds the workout tables with seeded exercises', async () => {
    const { sqlite, db, migrationDb } = openDb();
    await runMigrations(
      migrationDb,
      migrations.filter((m) => m.version <= 2),
    );
    sqlite
      .prepare(
        'INSERT INTO shooting_session (id, started_at, created_at, updated_at, ended_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(
        's1',
        '2026-01-01T10:00:00.000Z',
        '2026-01-01T10:00:00.000Z',
        '2026-01-01T10:00:00.000Z',
        null,
      );

    await runMigrations(migrationDb, migrations);

    expect(
      (sqlite.prepare('SELECT id FROM shooting_session').all() as { id: string }[]).map(
        (r) => r.id,
      ),
    ).toEqual(['s1']);
    await expect(createExerciseRepository(db as never).list()).resolves.toHaveLength(20);
    const workouts = createWorkoutRepository(db as never);
    const open = await workouts.startOrResumeSession();
    expect(await workouts.startOrResumeSession()).toBe(open);
    // The v2 open-shooting-session index still applies to the pre-existing open session.
    expect(() =>
      sqlite
        .prepare(
          'INSERT INTO shooting_session (id, started_at, created_at, updated_at) VALUES (?, ?, ?, ?)',
        )
        .run(
          's2',
          '2026-01-02T10:00:00.000Z',
          '2026-01-02T10:00:00.000Z',
          '2026-01-02T10:00:00.000Z',
        ),
    ).toThrow();
  });
});
