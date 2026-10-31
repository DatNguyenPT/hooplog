import type { SQLiteDatabase } from 'expo-sqlite';

import { newId, nowIso } from '@/shared/db/ids';
import { tally, type ShotResult, type ShotTally } from '../domain/stats';

export interface ShotRepository {
  /** Records a shot in the latest session, creating a session if none exists. */
  addShot(result: ShotResult): Promise<void>;
  tallyAll(): Promise<ShotTally>;
}

export function createShotRepository(db: SQLiteDatabase): ShotRepository {
  return {
    async addShot(result) {
      const now = nowIso();
      let session = await db.getFirstAsync<{ id: string }>(
        'SELECT id FROM shooting_session WHERE deleted_at IS NULL ORDER BY started_at DESC LIMIT 1',
      );
      if (!session) {
        session = { id: newId() };
        await db.runAsync(
          'INSERT INTO shooting_session (id, started_at, created_at, updated_at) VALUES (?, ?, ?, ?)',
          [session.id, now, now, now],
        );
      }
      await db.runAsync(
        'INSERT INTO shot (id, session_id, taken_at, result, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [newId(), session.id, now, result, now, now],
      );
    },
    async tallyAll() {
      const rows = await db.getAllAsync<{ result: ShotResult }>(
        'SELECT result FROM shot WHERE deleted_at IS NULL',
      );
      return tally(rows.map((r) => r.result));
    },
  };
}
