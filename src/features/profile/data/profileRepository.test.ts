import { DatabaseSync } from 'node:sqlite';

import { runMigrations } from '@/shared/db/migrate';
import { migrations } from '@/shared/db/migrations';
import { createProfileRepository } from './profileRepository';

// Hoisted above the imports by babel-jest.
jest.mock('expo-crypto', () => ({
  randomUUID: () => jest.requireActual('node:crypto').randomUUID(),
}));

/** Real SQL on an in-memory node:sqlite database, wrapped to look like expo-sqlite's async API. */
function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  const db = {
    execAsync: async (sql: string) => void sqlite.exec(sql),
    runAsync: async (sql: string, params: unknown[] = []) =>
      void sqlite.prepare(sql).run(...(params as never[])),
    getFirstAsync: async (sql: string, params: unknown[] = []) =>
      (sqlite.prepare(sql).get(...(params as never[])) as unknown) ?? null,
    getAllAsync: async (sql: string, params: unknown[] = []) =>
      sqlite.prepare(sql).all(...(params as never[])) as unknown[],
    withTransactionAsync: async (task: () => Promise<void>) => {
      sqlite.exec('BEGIN');
      try {
        await task();
        sqlite.exec('COMMIT');
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  const migrationDb = {
    getUserVersion: async () =>
      (sqlite.prepare('PRAGMA user_version').get() as { user_version: number }).user_version,
    execAsync: db.execAsync,
  };
  return { sqlite, db, migrationDb };
}

async function setup() {
  const { sqlite, db, migrationDb } = openDb();
  await runMigrations(migrationDb, migrations);
  return { sqlite, profiles: createProfileRepository(db as never) };
}

type Row = {
  id: string;
  display_name: string | null;
  onboarded_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};
const rows = (sqlite: DatabaseSync) => sqlite.prepare('SELECT * FROM profile').all() as Row[];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-11-01T08:00:00.000Z') });
});

afterEach(() => jest.useRealTimers());

describe('profileRepository', () => {
  it('reads a profile that was never saved as empty, without writing a row', async () => {
    const { sqlite, profiles } = await setup();
    expect(await profiles.getProfile()).toEqual({ displayName: null, onboardedAt: null });
    expect(rows(sqlite)).toHaveLength(0);
  });

  it('saves a name and reads it back', async () => {
    const { profiles } = await setup();
    await profiles.saveDisplayName('Dat');
    expect(await profiles.getProfile()).toEqual({ displayName: 'Dat', onboardedAt: null });
  });

  it('creates one sync-ready row on the first save and updates it afterwards', async () => {
    const { sqlite, profiles } = await setup();
    await profiles.saveDisplayName('Dat');
    const [created] = rows(sqlite);
    expect(created.id).toMatch(UUID);
    expect(created.created_at).toBe('2026-11-01T08:00:00.000Z');
    expect(created.deleted_at).toBeNull();

    jest.setSystemTime(new Date('2026-11-02T09:30:00.000Z'));
    await profiles.saveDisplayName('Dat N');
    const all = rows(sqlite);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      id: created.id,
      display_name: 'Dat N',
      created_at: '2026-11-01T08:00:00.000Z',
      updated_at: '2026-11-02T09:30:00.000Z',
    });
  });

  it('clears the name when given null', async () => {
    const { profiles } = await setup();
    await profiles.saveDisplayName('Dat');
    await profiles.saveDisplayName(null);
    expect((await profiles.getProfile()).displayName).toBeNull();
  });

  it('completes onboarding with a name', async () => {
    const { profiles } = await setup();
    await profiles.completeOnboarding('Dat');
    expect(await profiles.getProfile()).toEqual({
      displayName: 'Dat',
      onboardedAt: '2026-11-01T08:00:00.000Z',
    });
  });

  it('completes onboarding with no name, as when the welcome screen is skipped', async () => {
    const { sqlite, profiles } = await setup();
    await profiles.completeOnboarding(null);
    expect(await profiles.getProfile()).toEqual({
      displayName: null,
      onboardedAt: '2026-11-01T08:00:00.000Z',
    });
    expect(rows(sqlite)).toHaveLength(1);
  });

  it('keeps the first completion time when onboarding is completed again', async () => {
    const { profiles } = await setup();
    await profiles.completeOnboarding(null);
    jest.setSystemTime(new Date('2026-11-05T10:00:00.000Z'));
    await profiles.completeOnboarding('Dat');
    expect(await profiles.getProfile()).toEqual({
      displayName: 'Dat',
      onboardedAt: '2026-11-01T08:00:00.000Z',
    });
  });

  it('keeps the welcome step done when the name is changed later', async () => {
    const { profiles } = await setup();
    await profiles.completeOnboarding('Dat');
    await profiles.saveDisplayName('Dat N');
    expect(await profiles.getProfile()).toEqual({
      displayName: 'Dat N',
      onboardedAt: '2026-11-01T08:00:00.000Z',
    });
  });

  it('reads a name saved before the welcome screen as not yet onboarded', async () => {
    const { profiles } = await setup();
    await profiles.saveDisplayName('Dat');
    expect((await profiles.getProfile()).onboardedAt).toBeNull();
  });

  it('ignores a soft-deleted profile row and starts a new one', async () => {
    const { sqlite, profiles } = await setup();
    await profiles.completeOnboarding('Dat');
    sqlite.exec("UPDATE profile SET deleted_at = '2026-11-03T00:00:00.000Z'");
    expect(await profiles.getProfile()).toEqual({ displayName: null, onboardedAt: null });
    await profiles.saveDisplayName('Lan');
    expect(rows(sqlite)).toHaveLength(2);
    expect(await profiles.getProfile()).toEqual({ displayName: 'Lan', onboardedAt: null });
  });
});

describe('profile table', () => {
  it('allows only one live profile row', async () => {
    const { sqlite } = await setup();
    const insert = (id: string) =>
      sqlite.exec(
        `INSERT INTO profile (id, created_at, updated_at) VALUES ('${id}', 'now', 'now')`,
      );
    insert('a');
    expect(() => insert('b')).toThrow(/UNIQUE/);
  });

  it('refuses an empty or over-long name', async () => {
    const { sqlite } = await setup();
    const insert = (name: string) =>
      sqlite
        .prepare(
          "INSERT INTO profile (id, display_name, created_at, updated_at) VALUES ('a', ?, 'now', 'now')",
        )
        .run(name);
    expect(() => insert('')).toThrow(/CHECK/);
    expect(() => insert('a'.repeat(41))).toThrow(/CHECK/);
    expect(() => insert('a'.repeat(40))).not.toThrow();
  });

  it('is created by the migrations on top of the existing tables', async () => {
    const { sqlite } = await setup();
    const version = sqlite.prepare('PRAGMA user_version').get() as { user_version: number };
    expect(version.user_version).toBe(migrations.length);
    expect(migrations.at(-1)?.version).toBe(5);
  });
});
