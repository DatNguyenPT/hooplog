import { DatabaseSync } from 'node:sqlite';

import { createShootingRepository } from '@/features/shooting/data/shootingRepository';
import { createExerciseRepository } from '@/features/workouts/data/exerciseRepository';
import { createWorkoutRepository } from '@/features/workouts/data/workoutRepository';
import { createPlanRepository } from '@/features/training-plans/data/planRepository';
import { createProfileRepository } from '@/features/profile/data/profileRepository';
import { runMigrations } from '@/shared/db/migrate';
import { migrations } from '@/shared/db/migrations';
import { parseBackup } from '../domain/backup';
import { BackupError } from '../domain/backupError';
import { createBackupRepository } from './backupRepository';

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
    withTransactionAsync: async (task: () => Promise<void>) => {
      sqlite.exec('BEGIN');
      try {
        await task();
        sqlite.exec('COMMIT');
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
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
  const sql = db as never;
  return {
    sqlite,
    db,
    backup: createBackupRepository(sql),
    profiles: createProfileRepository(sql),
    shooting: createShootingRepository(sql),
    workouts: createWorkoutRepository(sql),
    exercises: createExerciseRepository(sql),
    plans: createPlanRepository(sql),
  };
}
type Phone = Awaited<ReturnType<typeof setup>>;

const SQUAT = '00000000-0000-4000-8000-000000000001';
const NO_VALUES = { reps: null, weightKg: null, durationS: null, distanceM: null };

/** A phone that has been used: every kind of row, plus rows that were deleted along the way. */
async function seed({ profiles, shooting, workouts, exercises, plans }: Phone) {
  await profiles.completeOnboarding('Dat');
  const slam = await exercises.createCustom({ name: 'Slam', measurementType: 'reps' });
  const old = await exercises.createCustom({ name: 'Old drill', measurementType: 'reps' });

  const emptySession = await shooting.startOrResumeSession();
  await shooting.endSession(emptySession); // no shots, so the app deletes it
  const first = await shooting.startOrResumeSession();
  for (const result of ['made', 'missed', 'made'] as const) await shooting.addShot(first, result);
  await shooting.addShot(first, 'missed');
  await shooting.undoLastShot(first);
  await shooting.endSession(first);
  const open = await shooting.startOrResumeSession();
  await shooting.addShot(open, 'uncertain');

  const workout = await workouts.startOrResumeSession();
  await workouts.addSet(workout, SQUAT, { ...NO_VALUES, reps: 5, weightKg: 60.5 });
  await workouts.addSet(workout, slam.id, { ...NO_VALUES, reps: 12 });
  const oldSet = await workouts.addSet(workout, old.id, { ...NO_VALUES, reps: 3 });
  const removed = await workouts.addSet(workout, SQUAT, { ...NO_VALUES, reps: 1, weightKg: 1 });
  await workouts.deleteSet(removed);
  await workouts.endSession(workout);
  await exercises.softDeleteCustom(old.id);

  const plan = await plans.createPlan('Pre-season');
  await plans.setActive(plan);
  await plans.addItem(plan, 1, { kind: 'exercise', exerciseId: SQUAT, sets: 3, target: NO_VALUES });
  await plans.addItem(plan, 1, { kind: 'shooting', shots: 100 });
  const dropped = await plans.createPlan('Dropped');
  await plans.addItem(dropped, 2, { kind: 'shooting', shots: 50 });
  await plans.deletePlan(dropped);
  return { slam: slam.id, old: old.id, oldSet };
}

const count = (sqlite: DatabaseSync, table: string) =>
  (sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

const EVERYTHING = [
  'shot',
  'shooting_session',
  'workout_set',
  'workout_session',
  'plan_item',
  'training_plan',
  'profile',
];

async function keyOf(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    return error instanceof BackupError ? error.key : 'not a BackupError';
  }
  return 'no error';
}

beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-11-01T08:00:00.000Z') });
});

afterEach(() => jest.useRealTimers());

describe('what a backup holds', () => {
  it('counts what is live, leaving out undone, emptied and deleted rows', async () => {
    const phone = await setup();
    await seed(phone);
    expect(await phone.backup.summarize()).toEqual({
      shootingSessions: 2,
      shots: 4,
      workoutSessions: 1,
      workoutSets: 3,
      plans: 1,
      customExercises: 1,
    });
  });

  it('writes a file the reader accepts, with the same counts', async () => {
    const phone = await setup();
    await seed(phone);
    const { text, summary } = await phone.backup.exportBackup();
    const file = parseBackup(text);
    expect(file.exported_at).toBe('2026-11-01T08:00:00.000Z');
    expect(file.data.profile?.display_name).toBe('Dat');
    expect(file.data.shot).toHaveLength(4);
    expect(file.data.plan_item).toHaveLength(2);
    expect(summary).toEqual(await phone.backup.summarize());
  });

  it('keeps a deleted custom exercise because a set still uses it, and no built-in ones', async () => {
    const phone = await setup();
    const { slam, old } = await seed(phone);
    const file = parseBackup((await phone.backup.exportBackup()).text);
    expect(file.data.exercise.map((row) => row.id).sort()).toEqual([slam, old].sort());
    expect(file.data.exercise.find((row) => row.id === old)?.deleted_at).not.toBeNull();
    expect(file.data.workout_set.map((row) => row.exercise_id)).toContain(old);
  });

  it('writes an empty phone as a backup with nothing in it', async () => {
    const { backup } = await setup();
    const file = parseBackup((await backup.exportBackup()).text);
    expect(file.data.profile).toBeNull();
    expect(file.data.shot).toEqual([]);
    expect(file.data.exercise).toEqual([]);
  });

  it('refuses to hand over rows that could not be put back', async () => {
    const phone = await setup();
    await seed(phone);
    phone.sqlite.exec('PRAGMA foreign_keys = OFF');
    phone.sqlite
      .prepare(
        `INSERT INTO workout_set (id, session_id, exercise_id, logged_at, reps, created_at, updated_at)
         SELECT '11111111-1111-4111-8111-111111111111', session_id, '22222222-2222-4222-8222-222222222222',
                logged_at, 1, created_at, updated_at FROM workout_set LIMIT 1`,
      )
      .run();
    expect(await keyOf(() => phone.backup.exportBackup())).toBe('exportFailed');
  });

  it('reports a database that cannot be read as a failed export', async () => {
    const phone = await setup();
    phone.sqlite.exec('DROP TABLE shot');
    expect(await keyOf(() => phone.backup.exportBackup())).toBe('exportFailed');
    expect(await keyOf(() => phone.backup.summarize())).toBe('exportFailed');
  });
});

describe('restoring a backup', () => {
  async function backedUp() {
    const source = await setup();
    await seed(source);
    return parseBackup((await source.backup.exportBackup()).text);
  }

  it('puts every row back, so the next export is the same file', async () => {
    const file = await backedUp();
    const target = await setup();
    await target.backup.restore(file);
    expect(parseBackup((await target.backup.exportBackup()).text)).toEqual(file);
  });

  it('is read by the app’s own screens', async () => {
    const target = await setup();
    await target.backup.restore(await backedUp());
    expect((await target.profiles.getProfile()).displayName).toBe('Dat');
    expect((await target.plans.getActivePlan())?.name).toBe('Pre-season');
    expect(await target.shooting.listSessions(10)).toHaveLength(2);
    expect(await target.workouts.listSessions(10)).toHaveLength(1);
    expect(await target.shooting.getActiveSessionId()).not.toBeNull();
  });

  it('replaces what was on the phone, deleted rows included', async () => {
    const file = await backedUp();
    const target = await setup();
    const before = await seed(target);
    await target.backup.restore(file);
    const ids = (
      target.sqlite.prepare('SELECT id FROM exercise WHERE is_builtin = 0').all() as {
        id: string;
      }[]
    ).map((row) => row.id);
    expect(ids).not.toContain(before.slam);
    expect(ids).toHaveLength(file.data.exercise.length);
    expect(count(target.sqlite, 'shot')).toBe(file.data.shot.length);
    expect(count(target.sqlite, 'training_plan')).toBe(file.data.training_plan.length);
  });

  it('leaves the 20 built-in exercises as they were', async () => {
    const target = await setup();
    const builtins = () =>
      target.sqlite.prepare('SELECT * FROM exercise WHERE is_builtin = 1').all();
    const before = builtins();
    await target.backup.restore(await backedUp());
    expect(before).toHaveLength(20);
    expect(builtins()).toEqual(before);
  });

  it('keeps the current name when the backup has none, and swaps it when it has one', async () => {
    const file = await backedUp();
    const target = await setup();
    await target.profiles.completeOnboarding('Someone else');

    await target.backup.restore({ ...file, data: { ...file.data, profile: null } });
    expect((await target.profiles.getProfile()).displayName).toBe('Someone else');
    expect(count(target.sqlite, 'profile')).toBe(1);

    await target.backup.restore(file);
    expect((await target.profiles.getProfile()).displayName).toBe('Dat');
    expect(count(target.sqlite, 'profile')).toBe(1);
  });

  it('puts back a file bigger than one INSERT statement can hold', async () => {
    const file = await backedUp();
    const template = file.data.shot[0]!;
    const shots = Array.from({ length: 1000 }, (_, i) => ({
      ...template,
      id: `00000000-0000-4000-9000-${String(i).padStart(12, '0')}`,
    }));
    const target = await setup();
    await target.backup.restore({ ...file, data: { ...file.data, shot: shots } });
    expect(count(target.sqlite, 'shot')).toBe(1000);
  });

  it('changes nothing when the database turns the file down', async () => {
    const file = await backedUp();
    const target = await setup();
    await seed(target);
    const before = await target.backup.exportBackup();

    // Reads as a built-in exercise, so the reader lets it through; the database has no such row.
    const unknown = '00000000-0000-4000-8000-000000000099';
    const bad = {
      ...file,
      data: {
        ...file.data,
        workout_set: file.data.workout_set.map((row) => ({ ...row, exercise_id: unknown })),
      },
    };
    expect(await keyOf(() => target.backup.restore(bad))).toBe('restoreFailed');
    expect((await target.backup.exportBackup()).text).toBe(before.text);
  });
});

describe('deleting everything', () => {
  it('empties every table the player filled, the profile too, rows already deleted included', async () => {
    const phone = await setup();
    await seed(phone);
    await phone.backup.deleteAll();
    for (const table of EVERYTHING) expect(count(phone.sqlite, table)).toBe(0);
    expect(count(phone.sqlite, 'exercise')).toBe(20);
    expect(await phone.profiles.getProfile()).toEqual({ displayName: null, onboardedAt: null });
  });

  it('leaves a phone that works like a new one', async () => {
    const phone = await setup();
    await seed(phone);
    await phone.backup.deleteAll();
    const session = await phone.shooting.startOrResumeSession();
    await phone.shooting.addShot(session, 'made');
    await phone.profiles.completeOnboarding('Again');
    expect((await phone.backup.summarize()).shots).toBe(1);
  });

  it('still succeeds when only the tidy-up of the file fails', async () => {
    const phone = await setup();
    await seed(phone);
    const failing = {
      ...phone.db,
      execAsync: async (sql: string) => {
        if (sql === 'VACUUM') throw new Error('disk full');
        return phone.db.execAsync(sql);
      },
    };
    await createBackupRepository(failing as never).deleteAll();
    expect(count(phone.sqlite, 'shot')).toBe(0);
  });

  it('reports a delete that fails, and keeps what it could not delete', async () => {
    const phone = await setup();
    await seed(phone);
    const shots = count(phone.sqlite, 'shot');
    phone.sqlite.exec('DROP TABLE plan_item');
    expect(await keyOf(() => phone.backup.deleteAll())).toBe('deleteFailed');
    expect(shots).toBeGreaterThan(0);
    expect(count(phone.sqlite, 'shot')).toBe(shots);
  });
});
