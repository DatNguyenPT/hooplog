import type { Migration } from './migrate';

/** Every table is sync-ready: client UUID ids, timestamps (ISO-8601 UTC), soft delete. See docs/TECHNICAL_ARCHITECTURE.md. */
export const migrations: Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE shooting_session (
        id TEXT PRIMARY KEY NOT NULL,
        started_at TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );
      CREATE TABLE shot (
        id TEXT PRIMARY KEY NOT NULL,
        session_id TEXT NOT NULL REFERENCES shooting_session(id),
        taken_at TEXT NOT NULL,
        result TEXT NOT NULL CHECK (result IN ('made', 'missed', 'uncertain')),
        source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai')),
        confidence REAL,
        corrected INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );
      CREATE INDEX idx_shot_session ON shot(session_id);
    `,
  },
  {
    version: 2,
    sql: `ALTER TABLE shooting_session ADD COLUMN ended_at TEXT;`,
  },
];
