import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useMemo } from 'react';

import { newId, nowIso } from '@/shared/db/ids';
import { EMPTY_PROFILE, type Profile } from '../domain/profile';

export interface ProfileRepository {
  /** The player's profile. One that was never saved reads as empty: no name, welcome not done. */
  getProfile(): Promise<Profile>;
  /** Saves the name exactly as given (already validated); null removes it. */
  saveDisplayName(name: string | null): Promise<void>;
  /** Records the welcome step as done, with the name typed there (null for none). The first completion time is kept. */
  completeOnboarding(name: string | null): Promise<void>;
}

type ProfileRow = { display_name: string | null; onboarded_at: string | null };

export function createProfileRepository(db: SQLiteDatabase): ProfileRepository {
  /** The profile is a single row, created by the first write so that reading never writes. */
  const ensureRow = async (): Promise<string> => {
    const row = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM profile WHERE deleted_at IS NULL',
    );
    if (row) return row.id;
    const id = newId();
    const now = nowIso();
    await db.runAsync('INSERT INTO profile (id, created_at, updated_at) VALUES (?, ?, ?)', [
      id,
      now,
      now,
    ]);
    return id;
  };

  return {
    async getProfile() {
      const row = await db.getFirstAsync<ProfileRow>(
        'SELECT display_name, onboarded_at FROM profile WHERE deleted_at IS NULL',
      );
      return row ? { displayName: row.display_name, onboardedAt: row.onboarded_at } : EMPTY_PROFILE;
    },

    async saveDisplayName(name) {
      await db.withTransactionAsync(async () => {
        const id = await ensureRow();
        await db.runAsync('UPDATE profile SET display_name = ?, updated_at = ? WHERE id = ?', [
          name,
          nowIso(),
          id,
        ]);
      });
    },

    async completeOnboarding(name) {
      await db.withTransactionAsync(async () => {
        const id = await ensureRow();
        const now = nowIso();
        await db.runAsync(
          'UPDATE profile SET display_name = ?, onboarded_at = COALESCE(onboarded_at, ?), updated_at = ? WHERE id = ?',
          [name, now, now, id],
        );
      });
    },
  };
}

export function useProfileRepository(): ProfileRepository {
  const db = useSQLiteContext();
  return useMemo(() => createProfileRepository(db), [db]);
}
