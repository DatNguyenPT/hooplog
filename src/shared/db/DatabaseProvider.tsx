import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import type { ReactNode } from 'react';

import { runMigrations } from './migrate';
import { migrations } from './migrations';

export const DATABASE_NAME = 'hooplog.db';

async function initialize(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  await runMigrations(
    {
      getUserVersion: async () =>
        (await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version ??
        0,
      execAsync: (sql) => db.execAsync(sql),
    },
    migrations,
  );
}

export function DatabaseProvider({ children }: { children: ReactNode }) {
  return (
    <SQLiteProvider databaseName={DATABASE_NAME} onInit={initialize}>
      {children}
    </SQLiteProvider>
  );
}
