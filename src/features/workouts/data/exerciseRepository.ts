import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useMemo } from 'react';

import { newId, nowIso } from '@/shared/db/ids';
import type { Exercise, ExerciseCategory, MeasurementType } from '../domain/exercise';

export type ExerciseRow = {
  id: string;
  name: string;
  category: ExerciseCategory;
  measurement_type: MeasurementType;
  is_builtin: number;
};

export const EXERCISE_COLUMNS = 'id, name, category, measurement_type, is_builtin';

export const toExercise = (r: ExerciseRow): Exercise => ({
  id: r.id,
  name: r.name,
  category: r.category,
  measurementType: r.measurement_type,
  isBuiltin: r.is_builtin === 1,
});

export interface ExerciseRepository {
  /**
   * All live exercises, built-ins first. Filtering by name is done in the domain layer
   * (`filterExercises`) because built-in names are translated and only known to the UI.
   */
  list(): Promise<Exercise[]>;
  get(id: string): Promise<Exercise | null>;
  /** Custom exercises are always category `other`. The name must already be validated. */
  createCustom(input: { name: string; measurementType: MeasurementType }): Promise<Exercise>;
  /** Soft-deletes a custom exercise; built-ins are never deleted. Past sets keep showing it. */
  softDeleteCustom(id: string): Promise<void>;
}

export function createExerciseRepository(db: SQLiteDatabase): ExerciseRepository {
  return {
    async list() {
      const rows = await db.getAllAsync<ExerciseRow>(
        `SELECT ${EXERCISE_COLUMNS} FROM exercise WHERE deleted_at IS NULL
         ORDER BY is_builtin DESC, category, name COLLATE NOCASE, rowid`,
      );
      return rows.map(toExercise);
    },

    async get(id) {
      const row = await db.getFirstAsync<ExerciseRow>(
        `SELECT ${EXERCISE_COLUMNS} FROM exercise WHERE id = ? AND deleted_at IS NULL`,
        [id],
      );
      return row ? toExercise(row) : null;
    },

    async createCustom({ name, measurementType }) {
      const id = newId();
      const now = nowIso();
      await db.runAsync(
        `INSERT INTO exercise (id, name, category, measurement_type, is_builtin, created_at, updated_at)
         VALUES (?, ?, 'other', ?, 0, ?, ?)`,
        [id, name, measurementType, now, now],
      );
      return { id, name, category: 'other', measurementType, isBuiltin: false };
    },

    async softDeleteCustom(id) {
      const now = nowIso();
      await db.runAsync(
        'UPDATE exercise SET deleted_at = ?, updated_at = ? WHERE id = ? AND is_builtin = 0 AND deleted_at IS NULL',
        [now, now, id],
      );
    },
  };
}

export function useExerciseRepository(): ExerciseRepository {
  const db = useSQLiteContext();
  return useMemo(() => createExerciseRepository(db), [db]);
}
