import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useMemo } from 'react';

import { nowIso } from '@/shared/db/ids';
import { serializeBackup, type DataSummary } from '../domain/backup';
import { BackupError, type BackupErrorKey } from '../domain/backupError';
import type { BackupData, BackupFile } from '../domain/backupSchema';

export interface BackupRepository {
  /** What is on the phone now, counted the way a backup would hold it. */
  summarize(): Promise<DataSummary>;
  /** Everything the player saved, as the text of a backup file, with how much it holds. */
  exportBackup(): Promise<{ text: string; summary: DataSummary }>;
  /**
   * Replaces the player's data with the backup's, all or nothing. A backup that has no profile
   * leaves the current name alone.
   */
  restore(file: BackupFile): Promise<void>;
  /** Removes everything the player saved, the profile too, so the welcome screen shows again. */
  deleteAll(): Promise<void>;
}

type Scalar = string | number | null;
type Row = Record<string, Scalar>;
type TableSpec = {
  table: Exclude<keyof BackupData, 'profile'>;
  columns: readonly string[];
  /** Which rows a backup holds: the live ones, whose parents are live too. */
  where: string;
};

const STAMPS = ['created_at', 'updated_at', 'deleted_at'];
const LIVE = 'deleted_at IS NULL';

// The built-in exercises ship with the app and are never exported, deleted or replaced. A custom
// exercise is kept even when deleted, because the sets and plan items that used it point at it.
const EXERCISE: TableSpec = {
  table: 'exercise',
  columns: ['id', 'name', 'category', 'measurement_type', 'is_builtin', ...STAMPS],
  where: 'is_builtin = 0',
};
const SHOOTING_SESSION: TableSpec = {
  table: 'shooting_session',
  columns: ['id', 'started_at', 'source', 'ended_at', ...STAMPS],
  where: LIVE,
};
const SHOT: TableSpec = {
  table: 'shot',
  columns: [
    ...['id', 'session_id', 'taken_at', 'result', 'source', 'confidence', 'corrected'],
    ...STAMPS,
  ],
  where: `${LIVE} AND session_id IN (SELECT id FROM shooting_session WHERE ${LIVE})`,
};
const WORKOUT_SESSION: TableSpec = {
  table: 'workout_session',
  columns: ['id', 'started_at', 'ended_at', ...STAMPS],
  where: LIVE,
};
const WORKOUT_SET: TableSpec = {
  table: 'workout_set',
  columns: [
    ...['id', 'session_id', 'exercise_id', 'logged_at', 'reps', 'weight_kg', 'duration_s'],
    ...['distance_m', ...STAMPS],
  ],
  where: `${LIVE} AND session_id IN (SELECT id FROM workout_session WHERE ${LIVE})`,
};
const TRAINING_PLAN: TableSpec = {
  table: 'training_plan',
  columns: ['id', 'name', 'is_active', ...STAMPS],
  where: LIVE,
};
const PLAN_ITEM: TableSpec = {
  table: 'plan_item',
  columns: [
    ...['id', 'plan_id', 'weekday', 'kind', 'exercise_id', 'target_sets', 'target_reps'],
    ...['target_weight_kg', 'target_duration_s', 'target_distance_m', 'target_shots', ...STAMPS],
  ],
  where: `${LIVE} AND plan_id IN (SELECT id FROM training_plan WHERE ${LIVE})`,
};
const PROFILE_COLUMNS = ['id', 'display_name', 'onboarded_at', ...STAMPS];

/** Parents before the rows that point at them: the order rows can be put back in. */
const TABLES: readonly TableSpec[] = [
  EXERCISE,
  SHOOTING_SESSION,
  SHOT,
  WORKOUT_SESSION,
  WORKOUT_SET,
  TRAINING_PLAN,
  PLAN_ITEM,
];

/** Children before their parents. These are real deletes: there is no cloud copy yet to tell about them. */
const CLEAR = [
  'DELETE FROM plan_item',
  'DELETE FROM training_plan',
  'DELETE FROM workout_set',
  'DELETE FROM workout_session',
  'DELETE FROM shot',
  'DELETE FROM shooting_session',
  'DELETE FROM exercise WHERE is_builtin = 0',
];

/** Older SQLite builds allow 999 values in one statement; stay below that. */
const MAX_VALUES_PER_STATEMENT = 900;

async function guarded<T>(key: BackupErrorKey, task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } catch (error) {
    throw error instanceof BackupError ? error : new BackupError(key, { cause: error });
  }
}

export function createBackupRepository(db: SQLiteDatabase): BackupRepository {
  const count = async ({ table, where }: TableSpec, also?: string) => {
    const row = await db.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM ${table} WHERE ${where}${also ? ` AND ${also}` : ''}`,
    );
    return row?.n ?? 0;
  };

  const insert = async (table: string, columns: readonly string[], rows: readonly Row[]) => {
    const rowsPerStatement = Math.max(1, Math.floor(MAX_VALUES_PER_STATEMENT / columns.length));
    const placeholders = `(${columns.map(() => '?').join(', ')})`;
    for (let start = 0; start < rows.length; start += rowsPerStatement) {
      const chunk = rows.slice(start, start + rowsPerStatement);
      await db.runAsync(
        `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${chunk.map(() => placeholders).join(', ')}`,
        chunk.flatMap((row) => columns.map((column) => row[column] ?? null)),
      );
    }
  };

  const clear = async () => {
    for (const sql of CLEAR) await db.runAsync(sql);
  };

  return {
    summarize: () =>
      guarded('exportFailed', async () => ({
        shootingSessions: await count(SHOOTING_SESSION),
        shots: await count(SHOT),
        workoutSessions: await count(WORKOUT_SESSION),
        workoutSets: await count(WORKOUT_SET),
        plans: await count(TRAINING_PLAN),
        customExercises: await count(EXERCISE, LIVE),
      })),

    exportBackup: () =>
      guarded('exportFailed', async () => {
        const data: Record<string, unknown> = {};
        // One transaction, so every table is read from the same moment.
        await db.withTransactionAsync(async () => {
          for (const { table, columns, where } of TABLES) {
            data[table] = await db.getAllAsync<Row>(
              `SELECT ${columns.join(', ')} FROM ${table} WHERE ${where} ORDER BY created_at, id`,
            );
          }
          data.profile = await db.getFirstAsync<Row>(
            `SELECT ${PROFILE_COLUMNS.join(', ')} FROM profile WHERE ${LIVE}`,
          );
        });
        return serializeBackup(data, nowIso());
      }),

    restore: (file) =>
      guarded('restoreFailed', async () => {
        await db.withTransactionAsync(async () => {
          await clear();
          for (const { table, columns } of TABLES) {
            await insert(table, columns, file.data[table]);
          }
          if (file.data.profile) {
            await db.runAsync('DELETE FROM profile');
            await insert('profile', PROFILE_COLUMNS, [file.data.profile]);
          }
        });
      }),

    deleteAll: () =>
      guarded('deleteFailed', async () => {
        await db.withTransactionAsync(async () => {
          await clear();
          await db.runAsync('DELETE FROM profile');
        });
        try {
          // Hands the freed space back, so the deleted rows are not left behind in the file.
          await db.execAsync('VACUUM');
        } catch {
          // Everything is already deleted; this only tidies the file.
        }
      }),
  };
}

export function useBackupRepository(): BackupRepository {
  const db = useSQLiteContext();
  return useMemo(() => createBackupRepository(db), [db]);
}
