import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useMemo } from 'react';

import type { ShotResult } from '@/features/shooting/domain/stats';
import { toExercise, type ExerciseRow } from '@/features/workouts/data/exerciseRepository';
import type { LiftBest, PeriodInputs, SessionResults } from '../domain/progress';

/**
 * Read-only projections over the shooting and workout tables. Nothing is written or stored here:
 * every figure is derived from the logs (see docs/decisions/0006-analytics-derived-from-logs.md).
 */
export interface AnalyticsRepository {
  /** Logs from `fromIso` up to, but not including, `toIso`, for the charts to bucket by local day or week. */
  inputsBetween(fromIso: string, toIso: string): Promise<PeriodInputs>;
  /** The shots of every shooting session, oldest session first, for all-time shooting bests. */
  sessionResults(): Promise<SessionResults[]>;
  /** All-time best weight and reps per exercise, including exercises deleted since (history keeps them). */
  liftBests(): Promise<LiftBest[]>;
}

export function createAnalyticsRepository(db: SQLiteDatabase): AnalyticsRepository {
  return {
    async inputsBetween(fromIso, toIso) {
      // Timestamps are stored as UTC ISO strings of one fixed shape, so text comparison is time order.
      const [shots, sessions, sets] = await Promise.all([
        db.getAllAsync<{ taken_at: string; result: 'made' | 'missed' }>(
          `SELECT taken_at, result FROM shot
           WHERE deleted_at IS NULL AND result IN ('made', 'missed')
             AND taken_at >= ? AND taken_at < ?
           ORDER BY taken_at, rowid`,
          [fromIso, toIso],
        ),
        // A session counts once it has something logged; an open one with no shots or sets yet does not.
        db.getAllAsync<{ started_at: string }>(
          `SELECT s.started_at FROM shooting_session s
           WHERE s.deleted_at IS NULL AND s.started_at >= ? AND s.started_at < ?
             AND EXISTS (SELECT 1 FROM shot t WHERE t.session_id = s.id AND t.deleted_at IS NULL)
           UNION ALL
           SELECT w.started_at FROM workout_session w
           WHERE w.deleted_at IS NULL AND w.started_at >= ? AND w.started_at < ?
             AND EXISTS (SELECT 1 FROM workout_set x WHERE x.session_id = w.id AND x.deleted_at IS NULL)`,
          [fromIso, toIso, fromIso, toIso],
        ),
        // Only weighted sets add to volume, so the others are not fetched.
        db.getAllAsync<{ logged_at: string; reps: number; weight_kg: number }>(
          `SELECT logged_at, reps, weight_kg FROM workout_set
           WHERE deleted_at IS NULL AND reps IS NOT NULL AND weight_kg IS NOT NULL
             AND logged_at >= ? AND logged_at < ?
           ORDER BY logged_at, rowid`,
          [fromIso, toIso],
        ),
      ]);
      return {
        shots: shots.map((r) => ({ takenAt: r.taken_at, result: r.result })),
        sessionStarts: sessions.map((r) => r.started_at),
        sets: sets.map((r) => ({ loggedAt: r.logged_at, reps: r.reps, weightKg: r.weight_kg })),
      };
    },

    async sessionResults() {
      const rows = await db.getAllAsync<{
        session_id: string;
        started_at: string;
        result: ShotResult;
      }>(
        `SELECT s.id AS session_id, s.started_at, t.result
         FROM shot t JOIN shooting_session s ON s.id = t.session_id
         WHERE t.deleted_at IS NULL AND s.deleted_at IS NULL
         ORDER BY s.started_at, s.id, t.taken_at, t.rowid`,
      );
      // Rows of one session are adjacent, so a new group starts whenever the id changes.
      const sessions: { sessionId: string; startedAt: string; results: ShotResult[] }[] = [];
      for (const r of rows) {
        const last = sessions[sessions.length - 1];
        if (last && last.sessionId === r.session_id) last.results.push(r.result);
        else
          sessions.push({ sessionId: r.session_id, startedAt: r.started_at, results: [r.result] });
      }
      return sessions;
    },

    async liftBests() {
      // The exercise is joined without a deleted_at filter, as in workout history: a removed custom exercise keeps its record.
      const rows = await db.getAllAsync<
        ExerciseRow & { max_weight_kg: number | null; max_reps: number | null }
      >(
        `SELECT e.id, e.name, e.category, e.measurement_type, e.is_builtin,
                MAX(s.weight_kg) AS max_weight_kg, MAX(s.reps) AS max_reps
         FROM workout_set s JOIN exercise e ON e.id = s.exercise_id
         WHERE s.deleted_at IS NULL
         GROUP BY e.id`,
      );
      return rows.map((r) => ({
        exercise: toExercise(r),
        maxWeightKg: r.max_weight_kg,
        maxReps: r.max_reps,
      }));
    },
  };
}

export function useAnalyticsRepository(): AnalyticsRepository {
  const db = useSQLiteContext();
  return useMemo(() => createAnalyticsRepository(db), [db]);
}
