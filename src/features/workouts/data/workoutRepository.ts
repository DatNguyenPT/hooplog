import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useMemo } from 'react';

import { newId, nowIso } from '@/shared/db/ids';
import type { Exercise } from '../domain/exercise';
import {
  summarizeWorkout,
  type SetValues,
  type WorkoutSet,
  type WorkoutSummary,
} from '../domain/workout';
import { toExercise, type ExerciseRow } from './exerciseRepository';

export type ExerciseGroup = { exercise: Exercise; sets: WorkoutSet[] };

export type WorkoutDetail = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  /** Exercises in the order they were first logged; sets in the order they were done. */
  groups: ExerciseGroup[];
};

export type WorkoutListItem = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  summary: WorkoutSummary;
};

export interface WorkoutRepository {
  getActiveSessionId(): Promise<string | null>;
  /** Returns the open workout if there is one, otherwise starts a new one. */
  startOrResumeSession(): Promise<string>;
  getSession(id: string): Promise<WorkoutDetail | null>;
  /** Values must already be validated for the exercise's measurement type (`parseSetInput`). */
  addSet(sessionId: string, exerciseId: string, values: SetValues): Promise<string>;
  updateSet(setId: string, values: SetValues): Promise<void>;
  /** Soft delete. */
  deleteSet(setId: string): Promise<void>;
  /** Closes the workout; a workout with no sets is discarded. */
  endSession(sessionId: string): Promise<void>;
  listSessions(limit: number): Promise<WorkoutListItem[]>;
}

type SetRow = {
  id: string;
  session_id: string;
  exercise_id: string;
  logged_at: string;
  reps: number | null;
  weight_kg: number | null;
  duration_s: number | null;
  distance_m: number | null;
};

const SET_COLUMNS =
  's.id, s.session_id, s.exercise_id, s.logged_at, s.reps, s.weight_kg, s.duration_s, s.distance_m';

const toSet = (r: SetRow): WorkoutSet => ({
  id: r.id,
  exerciseId: r.exercise_id,
  loggedAt: r.logged_at,
  reps: r.reps,
  weightKg: r.weight_kg,
  durationS: r.duration_s,
  distanceM: r.distance_m,
});

export function createWorkoutRepository(db: SQLiteDatabase): WorkoutRepository {
  const getActiveSessionId = async () =>
    (
      await db.getFirstAsync<{ id: string }>(
        'SELECT id FROM workout_session WHERE deleted_at IS NULL AND ended_at IS NULL ORDER BY started_at DESC, rowid DESC LIMIT 1',
      )
    )?.id ?? null;

  return {
    getActiveSessionId,

    async startOrResumeSession() {
      const existing = await getActiveSessionId();
      if (existing) return existing;
      const id = newId();
      const now = nowIso();
      try {
        await db.runAsync(
          'INSERT INTO workout_session (id, started_at, created_at, updated_at) VALUES (?, ?, ?, ?)',
          [id, now, now, now],
        );
      } catch (error) {
        // A concurrent call won the race and the unique index (idx_one_open_workout) rejected ours: resume theirs.
        const winner = await getActiveSessionId();
        if (winner) return winner;
        throw error;
      }
      return id;
    },

    async getSession(id) {
      const session = await db.getFirstAsync<{
        id: string;
        started_at: string;
        ended_at: string | null;
      }>(
        'SELECT id, started_at, ended_at FROM workout_session WHERE id = ? AND deleted_at IS NULL',
        [id],
      );
      if (!session) return null;
      // The exercise is joined without a deleted_at filter so history keeps its names after a custom exercise is removed.
      const rows = await db.getAllAsync<
        SetRow & Pick<ExerciseRow, 'name' | 'category' | 'measurement_type' | 'is_builtin'>
      >(
        `SELECT ${SET_COLUMNS}, e.name, e.category, e.measurement_type, e.is_builtin
         FROM workout_set s JOIN exercise e ON e.id = s.exercise_id
         WHERE s.session_id = ? AND s.deleted_at IS NULL
         ORDER BY s.logged_at, s.rowid`,
        [id],
      );
      const byExercise = new Map<string, ExerciseGroup>();
      for (const r of rows) {
        let group = byExercise.get(r.exercise_id);
        if (!group) {
          group = { exercise: toExercise({ ...r, id: r.exercise_id }), sets: [] };
          byExercise.set(r.exercise_id, group);
        }
        group.sets.push(toSet(r));
      }
      return {
        id: session.id,
        startedAt: session.started_at,
        endedAt: session.ended_at,
        groups: [...byExercise.values()],
      };
    },

    async addSet(sessionId, exerciseId, v) {
      const id = newId();
      const now = nowIso();
      await db.runAsync(
        `INSERT INTO workout_set
           (id, session_id, exercise_id, logged_at, reps, weight_kg, duration_s, distance_m, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, sessionId, exerciseId, now, v.reps, v.weightKg, v.durationS, v.distanceM, now, now],
      );
      return id;
    },

    async updateSet(setId, v) {
      await db.runAsync(
        `UPDATE workout_set SET reps = ?, weight_kg = ?, duration_s = ?, distance_m = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
        [v.reps, v.weightKg, v.durationS, v.distanceM, nowIso(), setId],
      );
    },

    async deleteSet(setId) {
      const now = nowIso();
      await db.runAsync(
        'UPDATE workout_set SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
        [now, now, setId],
      );
    },

    async endSession(sessionId) {
      const now = nowIso();
      const row = await db.getFirstAsync<{ n: number }>(
        'SELECT COUNT(*) AS n FROM workout_set WHERE session_id = ? AND deleted_at IS NULL',
        [sessionId],
      );
      if ((row?.n ?? 0) === 0) {
        await db.runAsync(
          'UPDATE workout_session SET ended_at = ?, deleted_at = ?, updated_at = ? WHERE id = ? AND ended_at IS NULL',
          [now, now, now, sessionId],
        );
        return;
      }
      await db.runAsync(
        'UPDATE workout_session SET ended_at = ?, updated_at = ? WHERE id = ? AND ended_at IS NULL',
        [now, now, sessionId],
      );
    },

    async listSessions(limit) {
      const sessions = await db.getAllAsync<{
        id: string;
        started_at: string;
        ended_at: string | null;
      }>(
        `SELECT id, started_at, ended_at FROM workout_session WHERE deleted_at IS NULL
         ORDER BY started_at DESC, rowid DESC LIMIT ?`,
        [limit],
      );
      if (sessions.length === 0) return [];
      // One query for all sets of the listed sessions (no N+1); the totals come from the domain layer.
      const placeholders = sessions.map(() => '?').join(', ');
      const sets = await db.getAllAsync<SetRow>(
        `SELECT ${SET_COLUMNS} FROM workout_set s
         WHERE s.deleted_at IS NULL AND s.session_id IN (${placeholders})`,
        sessions.map((s) => s.id),
      );
      const bySession = new Map<string, SetValues[]>();
      for (const r of sets) {
        const list = bySession.get(r.session_id) ?? [];
        list.push(toSet(r));
        bySession.set(r.session_id, list);
      }
      return sessions.map((s) => ({
        id: s.id,
        startedAt: s.started_at,
        endedAt: s.ended_at,
        summary: summarizeWorkout(bySession.get(s.id) ?? [], s.started_at, s.ended_at),
      }));
    },
  };
}

export function useWorkoutRepository(): WorkoutRepository {
  const db = useSQLiteContext();
  return useMemo(() => createWorkoutRepository(db), [db]);
}
