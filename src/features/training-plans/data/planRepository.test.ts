import { DatabaseSync } from 'node:sqlite';

import { createExerciseRepository } from '@/features/workouts/data/exerciseRepository';
import type { SetValues } from '@/features/workouts/domain/workout';
import { runMigrations } from '@/shared/db/migrate';
import { migrations } from '@/shared/db/migrations';
import type { ItemDraft } from '../domain/plan';
import { createPlanRepository } from './planRepository';

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
  return {
    sqlite,
    plans: createPlanRepository(db as never),
    exercises: createExerciseRepository(db as never),
  };
}

const SQUAT = '00000000-0000-4000-8000-000000000001';
const PUSH_UP = '00000000-0000-4000-8000-000000000009';
const PLANK = '00000000-0000-4000-8000-000000000011';
const SPRINT = '00000000-0000-4000-8000-000000000017';

const NO_TARGET: SetValues = { reps: null, weightKg: null, durationS: null, distanceM: null };
const exerciseDraft = (
  exerciseId: string,
  sets: number,
  target: Partial<SetValues> = {},
): ItemDraft => ({ kind: 'exercise', exerciseId, sets, target: { ...NO_TARGET, ...target } });
const shootingDraft = (shots: number): ItemDraft => ({ kind: 'shooting', shots });

const activeIds = (sqlite: DatabaseSync) =>
  (
    sqlite
      .prepare('SELECT id FROM training_plan WHERE is_active = 1 AND deleted_at IS NULL')
      .all() as { id: string }[]
  ).map((r) => r.id);

describe('plan repository: plans', () => {
  it('has no plans and no active plan at first', async () => {
    const { plans } = await setup();
    expect(await plans.listPlans()).toEqual([]);
    expect(await plans.getActivePlan()).toBeNull();
    expect(await plans.getPlan('missing')).toBeNull();
  });

  it('makes the first plan active and leaves later ones inactive', async () => {
    const { plans } = await setup();
    const first = await plans.createPlan('Pre-season');
    const second = await plans.createPlan('In-season');
    expect(await plans.getPlan(first)).toEqual({
      id: first,
      name: 'Pre-season',
      isActive: true,
      items: [],
    });
    expect((await plans.getPlan(second))?.isActive).toBe(false);
    expect((await plans.getActivePlan())?.id).toBe(first);
  });

  it('lists the active plan first, then newest first, counting only live items', async () => {
    const { plans, exercises } = await setup();
    const a = await plans.createPlan('A'); // active
    const b = await plans.createPlan('B');
    const c = await plans.createPlan('C');
    await plans.addItem(b, 1, exerciseDraft(SQUAT, 3));
    await plans.addItem(b, 1, exerciseDraft(PUSH_UP, 3));
    await plans.addItem(b, 2, shootingDraft(20));
    const removed = await plans.addItem(b, 3, shootingDraft(10));
    await plans.removeItem(removed);
    const mine = await exercises.createCustom({ name: 'Mikan drill', measurementType: 'reps' });
    await plans.addItem(b, 4, exerciseDraft(mine.id, 2));
    await exercises.softDeleteCustom(mine.id);

    const list = await plans.listPlans();
    expect(list.map((p) => p.id)).toEqual([a, c, b]);
    expect(list.map((p) => p.isActive)).toEqual([true, false, false]);
    expect(list.map((p) => p.itemCount)).toEqual([0, 0, 3]);
  });

  it('moves the active flag to the chosen plan and keeps exactly one active', async () => {
    const { plans, sqlite } = await setup();
    const first = await plans.createPlan('A');
    const second = await plans.createPlan('B');
    const third = await plans.createPlan('C');
    expect(activeIds(sqlite)).toEqual([first]);

    await plans.setActive(third);
    expect(activeIds(sqlite)).toEqual([third]);
    await plans.setActive(third); // already active
    expect(activeIds(sqlite)).toEqual([third]);
    await plans.setActive(second);
    expect(activeIds(sqlite)).toEqual([second]);
    expect((await plans.getActivePlan())?.id).toBe(second);
    expect((await plans.listPlans())[0].id).toBe(second);
  });

  it('ignores setActive for an unknown or deleted plan and keeps the current one', async () => {
    const { plans, sqlite } = await setup();
    const keep = await plans.createPlan('Keep');
    const gone = await plans.createPlan('Gone');
    await plans.deletePlan(gone);

    await plans.setActive('missing');
    await plans.setActive(gone);

    expect(activeIds(sqlite)).toEqual([keep]);
  });

  it('renames a live plan but not a deleted one', async () => {
    const { plans, sqlite } = await setup();
    const id = await plans.createPlan('Old');
    await plans.renamePlan(id, 'New');
    expect((await plans.getPlan(id))?.name).toBe('New');

    await plans.deletePlan(id);
    await plans.renamePlan(id, 'Zombie');
    const row = sqlite.prepare('SELECT name FROM training_plan WHERE id = ?').get(id) as {
      name: string;
    };
    expect(row.name).toBe('New');
  });

  it('soft-deletes a plan with its items and stops it being active', async () => {
    const { plans, sqlite } = await setup();
    const active = await plans.createPlan('Active');
    const other = await plans.createPlan('Other');
    const item = await plans.addItem(active, 1, exerciseDraft(SQUAT, 3));

    await plans.deletePlan(active);
    await plans.deletePlan(active); // idempotent

    expect(await plans.getPlan(active)).toBeNull();
    expect(await plans.getActivePlan()).toBeNull();
    expect((await plans.listPlans()).map((p) => p.id)).toEqual([other]);
    const planRow = sqlite
      .prepare('SELECT is_active, deleted_at FROM training_plan WHERE id = ?')
      .get(active) as { is_active: number; deleted_at: string | null };
    expect(planRow.is_active).toBe(0);
    expect(planRow.deleted_at).not.toBeNull();
    const itemRow = sqlite.prepare('SELECT deleted_at FROM plan_item WHERE id = ?').get(item) as {
      deleted_at: string | null;
    };
    expect(itemRow.deleted_at).not.toBeNull();

    // With no active plan left, the next plan becomes the active one.
    const next = await plans.createPlan('Next');
    expect(activeIds(sqlite)).toEqual([next]);
  });
});

describe('plan repository: items', () => {
  async function setupWithPlan() {
    const context = await setup();
    const planId = await context.plans.createPlan('Week');
    return { ...context, planId };
  }

  it('stores targets and returns items by weekday, then in the order added', async () => {
    const { plans, planId } = await setupWithPlan();
    await plans.addItem(planId, 3, shootingDraft(50));
    await plans.addItem(planId, 1, exerciseDraft(SQUAT, 4, { reps: 8, weightKg: 62.5 }));
    await plans.addItem(planId, 1, exerciseDraft(PUSH_UP, 3));
    await plans.addItem(planId, 1, shootingDraft(30));
    await plans.addItem(planId, 2, exerciseDraft(PLANK, 3, { durationS: 60 }));
    await plans.addItem(planId, 5, exerciseDraft(SPRINT, 6, { distanceM: 40.5 }));

    const items = (await plans.getPlan(planId))?.items ?? [];
    expect(
      items.map((i) => [i.weekday, i.kind === 'exercise' ? i.exercise.name : 'shooting']),
    ).toEqual([
      [1, 'squat'],
      [1, 'push_up'],
      [1, 'shooting'],
      [2, 'plank'],
      [3, 'shooting'],
      [5, 'sprint'],
    ]);
    expect(items[0]).toMatchObject({
      kind: 'exercise',
      sets: 4,
      target: { reps: 8, weightKg: 62.5, durationS: null, distanceM: null },
      exercise: {
        id: SQUAT,
        category: 'strength',
        measurementType: 'reps_weight',
        isBuiltin: true,
      },
    });
    expect(items[1]).toMatchObject({ sets: 3, target: NO_TARGET });
    expect(items[2]).toEqual({ kind: 'shooting', id: items[2].id, weekday: 1, shots: 30 });
    expect(items[3]).toMatchObject({ target: { durationS: 60 } });
    expect(items[5]).toMatchObject({ target: { distanceM: 40.5 } });
  });

  it('rejects an exercise or shooting item that is already planned that day', async () => {
    const { plans, planId } = await setupWithPlan();
    await plans.addItem(planId, 1, exerciseDraft(SQUAT, 3));
    await plans.addItem(planId, 1, shootingDraft(20));
    await expect(plans.addItem(planId, 1, exerciseDraft(SQUAT, 5))).rejects.toThrow();
    await expect(plans.addItem(planId, 1, shootingDraft(40))).rejects.toThrow();

    // Another day, another exercise and another plan are all fine.
    await plans.addItem(planId, 2, exerciseDraft(SQUAT, 3));
    await plans.addItem(planId, 1, exerciseDraft(PUSH_UP, 3));
    const other = await plans.createPlan('Other');
    await plans.addItem(other, 1, exerciseDraft(SQUAT, 3));
    await plans.addItem(other, 1, shootingDraft(20));
    expect((await plans.getPlan(planId))?.items).toHaveLength(4);
    expect((await plans.getPlan(other))?.items).toHaveLength(2);
  });

  it('allows planning an item again after it was removed', async () => {
    const { plans, planId } = await setupWithPlan();
    const squat = await plans.addItem(planId, 1, exerciseDraft(SQUAT, 3));
    const shots = await plans.addItem(planId, 1, shootingDraft(20));
    await plans.removeItem(squat);
    await plans.removeItem(shots);

    await plans.addItem(planId, 1, exerciseDraft(SQUAT, 5));
    await plans.addItem(planId, 1, shootingDraft(40));

    const items = (await plans.getPlan(planId))?.items ?? [];
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ kind: 'exercise', sets: 5 });
    expect(items[1]).toMatchObject({ kind: 'shooting', shots: 40 });
  });

  it('rejects items that break the database rules', async () => {
    const { plans, planId } = await setupWithPlan();
    await expect(plans.addItem('missing-plan', 1, shootingDraft(10))).rejects.toThrow();
    await expect(plans.addItem(planId, 1, exerciseDraft('missing-exercise', 3))).rejects.toThrow();
    // Weekday is typed 1-7, so the database rule is the only guard against bad data.
    await expect(plans.addItem(planId, 0 as never, shootingDraft(10))).rejects.toThrow();
    await expect(plans.addItem(planId, 8 as never, shootingDraft(10))).rejects.toThrow();
    await expect(plans.addItem(planId, 1, exerciseDraft(SQUAT, 0))).rejects.toThrow();
    await expect(plans.addItem(planId, 1, shootingDraft(0))).rejects.toThrow();
    await expect(plans.addItem(planId, 1, exerciseDraft(SQUAT, 3, { reps: 0 }))).rejects.toThrow();
    await expect(
      plans.addItem(planId, 1, exerciseDraft(SQUAT, 3, { weightKg: -1 })),
    ).rejects.toThrow();
    await expect(
      plans.addItem(planId, 1, exerciseDraft(SPRINT, 3, { distanceM: 0 })),
    ).rejects.toThrow();
    expect((await plans.getPlan(planId))?.items).toEqual([]);
  });

  it('allows an unloaded weight target of zero', async () => {
    const { plans, planId } = await setupWithPlan();
    await plans.addItem(planId, 1, exerciseDraft(SQUAT, 3, { reps: 10, weightKg: 0 }));
    expect((await plans.getPlan(planId))?.items[0]).toMatchObject({ target: { weightKg: 0 } });
  });

  it('updates targets in place, keeping the item and its position', async () => {
    const { plans, planId } = await setupWithPlan();
    const squat = await plans.addItem(planId, 1, exerciseDraft(SQUAT, 3, { reps: 10 }));
    const shots = await plans.addItem(planId, 1, shootingDraft(20));

    await plans.updateItem(squat, exerciseDraft(SQUAT, 5, { reps: 8, weightKg: 70 }));
    await plans.updateItem(shots, shootingDraft(35));

    const items = (await plans.getPlan(planId))?.items ?? [];
    expect(items.map((i) => i.id)).toEqual([squat, shots]);
    expect(items[0]).toMatchObject({ sets: 5, target: { reps: 8, weightKg: 70 } });
    expect(items[1]).toMatchObject({ shots: 35 });
  });

  it('clears targets that are left blank', async () => {
    const { plans, planId } = await setupWithPlan();
    const squat = await plans.addItem(
      planId,
      1,
      exerciseDraft(SQUAT, 3, { reps: 10, weightKg: 60 }),
    );

    await plans.updateItem(squat, exerciseDraft(SQUAT, 3));

    expect((await plans.getPlan(planId))?.items[0]).toMatchObject({ sets: 3, target: NO_TARGET });
  });

  it('ignores a draft for another exercise or kind', async () => {
    const { plans, planId } = await setupWithPlan();
    const squat = await plans.addItem(planId, 1, exerciseDraft(SQUAT, 3));
    const shots = await plans.addItem(planId, 1, shootingDraft(20));

    await plans.updateItem(squat, exerciseDraft(PUSH_UP, 9));
    await plans.updateItem(squat, shootingDraft(99));
    await plans.updateItem(shots, exerciseDraft(SQUAT, 9));

    const items = (await plans.getPlan(planId))?.items ?? [];
    expect(items[0]).toMatchObject({ sets: 3, exercise: { id: SQUAT } });
    expect(items[1]).toMatchObject({ kind: 'shooting', shots: 20 });
  });

  it('removes items softly and idempotently, and no longer updates them', async () => {
    const { plans, planId, sqlite } = await setupWithPlan();
    const squat = await plans.addItem(planId, 1, exerciseDraft(SQUAT, 3));

    await plans.removeItem(squat);
    const first = sqlite.prepare('SELECT deleted_at FROM plan_item WHERE id = ?').get(squat) as {
      deleted_at: string | null;
    };
    expect(first.deleted_at).not.toBeNull();
    await plans.removeItem(squat);
    await plans.updateItem(squat, exerciseDraft(SQUAT, 9));

    const row = sqlite
      .prepare('SELECT target_sets, deleted_at FROM plan_item WHERE id = ?')
      .get(squat) as { target_sets: number; deleted_at: string };
    expect(row).toEqual({ target_sets: 3, deleted_at: first.deleted_at });
    expect((await plans.getPlan(planId))?.items).toEqual([]);
  });

  it('hides items of a deleted custom exercise but keeps their rows', async () => {
    const { plans, exercises, planId, sqlite } = await setupWithPlan();
    const mine = await exercises.createCustom({ name: 'Mikan drill', measurementType: 'reps' });
    await plans.addItem(planId, 1, exerciseDraft(mine.id, 3));
    await plans.addItem(planId, 1, shootingDraft(20));
    expect((await plans.getPlan(planId))?.items[0]).toMatchObject({
      exercise: { name: 'Mikan drill', isBuiltin: false },
    });

    await exercises.softDeleteCustom(mine.id);

    expect((await plans.getPlan(planId))?.items.map((i) => i.kind)).toEqual(['shooting']);
    const count = sqlite.prepare('SELECT COUNT(*) AS n FROM plan_item').get() as { n: number };
    expect(count.n).toBe(2);
  });
});

describe('migration v3 -> v4', () => {
  const T = '2026-01-01T10:00:00.000Z';

  it('keeps existing data and lets plans be created on the upgraded database', async () => {
    const { sqlite, db, migrationDb } = openDb();
    await runMigrations(
      migrationDb,
      migrations.filter((m) => m.version <= 3),
    );
    sqlite
      .prepare(
        'INSERT INTO shooting_session (id, started_at, created_at, updated_at, ended_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run('s1', T, T, T, T);
    sqlite
      .prepare(
        'INSERT INTO workout_session (id, started_at, created_at, updated_at) VALUES (?, ?, ?, ?)',
      )
      .run('w1', T, T, T);
    sqlite
      .prepare(
        'INSERT INTO workout_set (id, session_id, exercise_id, logged_at, reps, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run('set1', 'w1', PUSH_UP, T, 12, T, T);

    await runMigrations(migrationDb, migrations);

    const ids = (table: string) =>
      (sqlite.prepare(`SELECT id FROM ${table}`).all() as { id: string }[]).map((r) => r.id);
    expect(ids('shooting_session')).toEqual(['s1']);
    expect(ids('workout_session')).toEqual(['w1']);
    expect(ids('workout_set')).toEqual(['set1']);
    expect(ids('exercise')).toHaveLength(20);

    const plans = createPlanRepository(db as never);
    const id = await plans.createPlan('After the upgrade');
    await plans.addItem(id, 2, exerciseDraft(PUSH_UP, 3));
    expect(await plans.getActivePlan()).toMatchObject({
      id,
      isActive: true,
      items: [{ kind: 'exercise', weekday: 2, sets: 3 }],
    });
  });

  it('enforces the plan rules in the database', async () => {
    const { sqlite, migrationDb } = openDb();
    await runMigrations(migrationDb, migrations);
    const insertPlan = sqlite.prepare(
      'INSERT INTO training_plan (id, name, is_active, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?)',
    );
    const insertItem = sqlite.prepare(
      `INSERT INTO plan_item (id, plan_id, weekday, kind, exercise_id, target_sets, target_shots, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    // Only one live active plan; inactive and deleted plans are unlimited, and the flag is 0 or 1.
    insertPlan.run('p1', 'One', 1, T, T, null);
    expect(() => insertPlan.run('p2', 'Two', 1, T, T, null)).toThrow();
    expect(() => insertPlan.run('p3', 'Three', 2, T, T, null)).toThrow();
    insertPlan.run('p4', 'Four', 0, T, T, null);
    insertPlan.run('p5', 'Deleted', 1, T, T, T);

    // An exercise item needs an exercise and sets and no shots; a shooting item the opposite.
    expect(() => insertItem.run('i1', 'p1', 1, 'exercise', null, 3, null, T, T, null)).toThrow();
    expect(() =>
      insertItem.run('i2', 'p1', 1, 'exercise', SQUAT, null, null, T, T, null),
    ).toThrow();
    expect(() => insertItem.run('i3', 'p1', 1, 'exercise', SQUAT, 3, 10, T, T, null)).toThrow();
    expect(() => insertItem.run('i4', 'p1', 1, 'shooting', SQUAT, null, 10, T, T, null)).toThrow();
    expect(() => insertItem.run('i5', 'p1', 1, 'shooting', null, 3, 10, T, T, null)).toThrow();
    expect(() => insertItem.run('i6', 'p1', 1, 'shooting', null, null, null, T, T, null)).toThrow();
    expect(() => insertItem.run('i7', 'p1', 1, 'yoga', null, null, 10, T, T, null)).toThrow();
    expect(() => insertItem.run('i8', 'p1', 9, 'shooting', null, null, 10, T, T, null)).toThrow();
    expect(() => insertItem.run('i9', 'nope', 1, 'shooting', null, null, 10, T, T, null)).toThrow();

    insertItem.run('ok1', 'p1', 1, 'exercise', SQUAT, 3, null, T, T, null);
    insertItem.run('ok2', 'p1', 1, 'shooting', null, null, 10, T, T, null);
    // One per day: duplicates are refused while live, and fine once the earlier one is deleted.
    expect(() => insertItem.run('d1', 'p1', 1, 'exercise', SQUAT, 5, null, T, T, null)).toThrow();
    expect(() => insertItem.run('d2', 'p1', 1, 'shooting', null, null, 20, T, T, null)).toThrow();
    insertItem.run('gone1', 'p1', 2, 'exercise', SQUAT, 5, null, T, T, T);
    insertItem.run('again1', 'p1', 2, 'exercise', SQUAT, 5, null, T, T, null);
  });
});
