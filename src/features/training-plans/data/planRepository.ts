import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useMemo } from 'react';

import { newId, nowIso } from '@/shared/db/ids';
import { toExercise, type ExerciseRow } from '@/features/workouts/data/exerciseRepository';
import type { ItemDraft, Plan, PlanItem, PlanSummary, Weekday } from '../domain/plan';

export interface PlanRepository {
  /** Live plans, the active one first, then newest first. */
  listPlans(): Promise<PlanSummary[]>;
  getPlan(id: string): Promise<Plan | null>;
  getActivePlan(): Promise<Plan | null>;
  /** The new plan becomes the active one when there is no active plan yet. The name must already be validated. */
  createPlan(name: string): Promise<string>;
  renamePlan(id: string, name: string): Promise<void>;
  /** Makes this plan the only active one. An unknown or deleted plan changes nothing. */
  setActive(id: string): Promise<void>;
  /** Soft-deletes the plan and its items; the plan stops being active. */
  deletePlan(id: string): Promise<void>;
  /** Rejects when the exercise (or shooting) is already planned that day: callers edit the existing item instead. */
  addItem(planId: string, weekday: Weekday, draft: ItemDraft): Promise<string>;
  /** Changes the targets only; a draft for a different kind or exercise than the item's changes nothing. */
  updateItem(itemId: string, draft: ItemDraft): Promise<void>;
  removeItem(itemId: string): Promise<void>;
}

type PlanRow = { id: string; name: string; is_active: number };

type ItemRow = {
  id: string;
  weekday: Weekday;
  kind: 'exercise' | 'shooting';
  target_sets: number | null;
  target_reps: number | null;
  target_weight_kg: number | null;
  target_duration_s: number | null;
  target_distance_m: number | null;
  target_shots: number | null;
  exercise_id: string | null;
} & Partial<Pick<ExerciseRow, 'name' | 'category' | 'measurement_type' | 'is_builtin'>>;

function toItem(r: ItemRow): PlanItem | null {
  if (r.kind === 'shooting') {
    return { kind: 'shooting', id: r.id, weekday: r.weekday, shots: r.target_shots ?? 1 };
  }
  if (r.exercise_id === null || r.name === undefined || r.category === undefined) return null;
  return {
    kind: 'exercise',
    id: r.id,
    weekday: r.weekday,
    exercise: toExercise({
      id: r.exercise_id,
      name: r.name,
      category: r.category,
      measurement_type: r.measurement_type ?? 'reps',
      is_builtin: r.is_builtin ?? 0,
    }),
    sets: r.target_sets ?? 1,
    target: {
      reps: r.target_reps,
      weightKg: r.target_weight_kg,
      durationS: r.target_duration_s,
      distanceM: r.target_distance_m,
    },
  };
}

export function createPlanRepository(db: SQLiteDatabase): PlanRepository {
  const loadItems = async (planId: string): Promise<PlanItem[]> => {
    // Items of a deleted custom exercise are hidden: it can no longer be trained, and its row stays for history.
    const rows = await db.getAllAsync<ItemRow>(
      `SELECT i.id, i.weekday, i.kind, i.target_sets, i.target_reps, i.target_weight_kg,
              i.target_duration_s, i.target_distance_m, i.target_shots,
              e.id AS exercise_id, e.name, e.category, e.measurement_type, e.is_builtin
       FROM plan_item i LEFT JOIN exercise e ON e.id = i.exercise_id
       WHERE i.plan_id = ? AND i.deleted_at IS NULL AND (i.kind = 'shooting' OR e.deleted_at IS NULL)
       ORDER BY i.weekday, i.created_at, i.rowid`,
      [planId],
    );
    return rows.flatMap((r) => toItem(r) ?? []);
  };

  const getPlan = async (id: string): Promise<Plan | null> => {
    const plan = await db.getFirstAsync<PlanRow>(
      'SELECT id, name, is_active FROM training_plan WHERE id = ? AND deleted_at IS NULL',
      [id],
    );
    if (!plan) return null;
    return {
      id: plan.id,
      name: plan.name,
      isActive: plan.is_active === 1,
      items: await loadItems(plan.id),
    };
  };

  return {
    async listPlans() {
      const rows = await db.getAllAsync<PlanRow & { item_count: number }>(
        `SELECT p.id, p.name, p.is_active, COUNT(i.id) AS item_count
         FROM training_plan p
         LEFT JOIN plan_item i ON i.plan_id = p.id AND i.deleted_at IS NULL
           AND (i.kind = 'shooting'
                OR EXISTS (SELECT 1 FROM exercise e WHERE e.id = i.exercise_id AND e.deleted_at IS NULL))
         WHERE p.deleted_at IS NULL
         GROUP BY p.id
         ORDER BY p.is_active DESC, p.created_at DESC, p.rowid DESC`,
      );
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        isActive: r.is_active === 1,
        itemCount: r.item_count,
      }));
    },

    getPlan,

    async getActivePlan() {
      const row = await db.getFirstAsync<{ id: string }>(
        'SELECT id FROM training_plan WHERE is_active = 1 AND deleted_at IS NULL',
      );
      return row ? getPlan(row.id) : null;
    },

    async createPlan(name) {
      const id = newId();
      const now = nowIso();
      await db.runAsync(
        `INSERT INTO training_plan (id, name, is_active, created_at, updated_at)
         VALUES (?, ?, NOT EXISTS (SELECT 1 FROM training_plan WHERE is_active = 1 AND deleted_at IS NULL), ?, ?)`,
        [id, name, now, now],
      );
      return id;
    },

    async renamePlan(id, name) {
      await db.runAsync(
        'UPDATE training_plan SET name = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
        [name, nowIso(), id],
      );
    },

    async setActive(id) {
      const now = nowIso();
      // Two statements in one transaction: the unique index allows only one active plan at any moment.
      await db.withTransactionAsync(async () => {
        const target = await db.getFirstAsync<{ id: string }>(
          'SELECT id FROM training_plan WHERE id = ? AND deleted_at IS NULL',
          [id],
        );
        // Without this, an unknown id would deactivate the current plan and leave none active.
        if (!target) return;
        await db.runAsync(
          'UPDATE training_plan SET is_active = 0, updated_at = ? WHERE is_active = 1 AND id != ? AND deleted_at IS NULL',
          [now, id],
        );
        await db.runAsync(
          'UPDATE training_plan SET is_active = 1, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
          [now, id],
        );
      });
    },

    async deletePlan(id) {
      const now = nowIso();
      await db.withTransactionAsync(async () => {
        await db.runAsync(
          'UPDATE plan_item SET deleted_at = ?, updated_at = ? WHERE plan_id = ? AND deleted_at IS NULL',
          [now, now, id],
        );
        await db.runAsync(
          'UPDATE training_plan SET is_active = 0, deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
          [now, now, id],
        );
      });
    },

    async addItem(planId, weekday, draft) {
      const id = newId();
      const now = nowIso();
      if (draft.kind === 'exercise') {
        const { target } = draft;
        await db.runAsync(
          `INSERT INTO plan_item
             (id, plan_id, weekday, kind, exercise_id, target_sets, target_reps, target_weight_kg,
              target_duration_s, target_distance_m, created_at, updated_at)
           VALUES (?, ?, ?, 'exercise', ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            planId,
            weekday,
            draft.exerciseId,
            draft.sets,
            target.reps,
            target.weightKg,
            target.durationS,
            target.distanceM,
            now,
            now,
          ],
        );
      } else {
        await db.runAsync(
          `INSERT INTO plan_item (id, plan_id, weekday, kind, target_shots, created_at, updated_at)
           VALUES (?, ?, ?, 'shooting', ?, ?, ?)`,
          [id, planId, weekday, draft.shots, now, now],
        );
      }
      return id;
    },

    async updateItem(itemId, draft) {
      const now = nowIso();
      if (draft.kind === 'exercise') {
        const { target } = draft;
        await db.runAsync(
          `UPDATE plan_item SET target_sets = ?, target_reps = ?, target_weight_kg = ?,
             target_duration_s = ?, target_distance_m = ?, updated_at = ?
           WHERE id = ? AND kind = 'exercise' AND exercise_id = ? AND deleted_at IS NULL`,
          [
            draft.sets,
            target.reps,
            target.weightKg,
            target.durationS,
            target.distanceM,
            now,
            itemId,
            draft.exerciseId,
          ],
        );
      } else {
        await db.runAsync(
          `UPDATE plan_item SET target_shots = ?, updated_at = ?
           WHERE id = ? AND kind = 'shooting' AND deleted_at IS NULL`,
          [draft.shots, now, itemId],
        );
      }
    },

    async removeItem(itemId) {
      const now = nowIso();
      await db.runAsync(
        'UPDATE plan_item SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
        [now, now, itemId],
      );
    },
  };
}

export function usePlanRepository(): PlanRepository {
  const db = useSQLiteContext();
  return useMemo(() => createPlanRepository(db), [db]);
}
