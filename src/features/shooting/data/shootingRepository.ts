import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useMemo } from 'react';

import { newId, nowIso } from '@/shared/db/ids';
import type { ShotResult } from '../domain/stats';

export type SessionListItem = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  made: number;
  missed: number;
};

export type SessionDetail = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  /** Shots in the order they were taken. */
  results: ShotResult[];
};

export interface ShootingRepository {
  getActiveSessionId(): Promise<string | null>;
  /** Returns the open session if there is one, otherwise starts a new one. */
  startOrResumeSession(): Promise<string>;
  getSession(id: string): Promise<SessionDetail | null>;
  addShot(sessionId: string, result: ShotResult): Promise<void>;
  /** Removes the most recent shot of the session (soft delete). */
  undoLastShot(sessionId: string): Promise<void>;
  /** Closes the session; a session with no shots is discarded. */
  endSession(sessionId: string): Promise<void>;
  listSessions(limit: number): Promise<SessionListItem[]>;
}

export function createShootingRepository(db: SQLiteDatabase): ShootingRepository {
  const getActiveSessionId = async () =>
    (
      await db.getFirstAsync<{ id: string }>(
        'SELECT id FROM shooting_session WHERE deleted_at IS NULL AND ended_at IS NULL ORDER BY started_at DESC, rowid DESC LIMIT 1',
      )
    )?.id ?? null;

  return {
    getActiveSessionId,

    async startOrResumeSession() {
      const existing = await getActiveSessionId();
      if (existing) return existing;
      const id = newId();
      const now = nowIso();
      await db.runAsync(
        'INSERT INTO shooting_session (id, started_at, created_at, updated_at) VALUES (?, ?, ?, ?)',
        [id, now, now, now],
      );
      return id;
    },

    async getSession(id) {
      const session = await db.getFirstAsync<{
        id: string;
        started_at: string;
        ended_at: string | null;
      }>(
        'SELECT id, started_at, ended_at FROM shooting_session WHERE id = ? AND deleted_at IS NULL',
        [id],
      );
      if (!session) return null;
      const shots = await db.getAllAsync<{ result: ShotResult }>(
        'SELECT result FROM shot WHERE session_id = ? AND deleted_at IS NULL ORDER BY taken_at, rowid',
        [id],
      );
      return {
        id: session.id,
        startedAt: session.started_at,
        endedAt: session.ended_at,
        results: shots.map((s) => s.result),
      };
    },

    async addShot(sessionId, result) {
      const now = nowIso();
      await db.runAsync(
        'INSERT INTO shot (id, session_id, taken_at, result, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [newId(), sessionId, now, result, now, now],
      );
    },

    async undoLastShot(sessionId) {
      const now = nowIso();
      await db.runAsync(
        `UPDATE shot SET deleted_at = ?, updated_at = ?
         WHERE id = (SELECT id FROM shot WHERE session_id = ? AND deleted_at IS NULL
                     ORDER BY taken_at DESC, rowid DESC LIMIT 1)`,
        [now, now, sessionId],
      );
    },

    async endSession(sessionId) {
      const now = nowIso();
      const row = await db.getFirstAsync<{ n: number }>(
        'SELECT COUNT(*) AS n FROM shot WHERE session_id = ? AND deleted_at IS NULL',
        [sessionId],
      );
      if ((row?.n ?? 0) === 0) {
        await db.runAsync(
          'UPDATE shooting_session SET ended_at = ?, deleted_at = ?, updated_at = ? WHERE id = ?',
          [now, now, now, sessionId],
        );
        return;
      }
      await db.runAsync('UPDATE shooting_session SET ended_at = ?, updated_at = ? WHERE id = ?', [
        now,
        now,
        sessionId,
      ]);
    },

    async listSessions(limit) {
      const rows = await db.getAllAsync<{
        id: string;
        started_at: string;
        ended_at: string | null;
        made: number;
        missed: number;
      }>(
        `SELECT s.id, s.started_at, s.ended_at,
                COALESCE(SUM(t.result = 'made'), 0) AS made,
                COALESCE(SUM(t.result = 'missed'), 0) AS missed
         FROM shooting_session s
         LEFT JOIN shot t ON t.session_id = s.id AND t.deleted_at IS NULL
         WHERE s.deleted_at IS NULL
         GROUP BY s.id
         ORDER BY s.started_at DESC, s.rowid DESC
         LIMIT ?`,
        [limit],
      );
      return rows.map((r) => ({
        id: r.id,
        startedAt: r.started_at,
        endedAt: r.ended_at,
        made: r.made,
        missed: r.missed,
      }));
    },
  };
}

export function useShootingRepository(): ShootingRepository {
  const db = useSQLiteContext();
  return useMemo(() => createShootingRepository(db), [db]);
}
