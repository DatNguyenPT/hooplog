import { DatabaseSync } from 'node:sqlite';

import { runMigrations } from '@/shared/db/migrate';
import { migrations } from '@/shared/db/migrations';
import { createShootingRepository } from './shootingRepository';

// Hoisted above the imports by babel-jest.
jest.mock('expo-crypto', () => ({
  randomUUID: () => jest.requireActual('node:crypto').randomUUID(),
}));

/** Real SQL on an in-memory node:sqlite database, wrapped to look like expo-sqlite's async API. */
async function setup() {
  const sqlite = new DatabaseSync(':memory:');
  const db = {
    execAsync: async (sql: string) => void sqlite.exec(sql),
    runAsync: async (sql: string, params: unknown[] = []) =>
      void sqlite.prepare(sql).run(...(params as never[])),
    getFirstAsync: async (sql: string, params: unknown[] = []) =>
      (sqlite.prepare(sql).get(...(params as never[])) as unknown) ?? null,
    getAllAsync: async (sql: string, params: unknown[] = []) =>
      sqlite.prepare(sql).all(...(params as never[])) as unknown[],
  };
  await runMigrations(
    {
      getUserVersion: async () =>
        (sqlite.prepare('PRAGMA user_version').get() as { user_version: number }).user_version,
      execAsync: db.execAsync,
    },
    migrations,
  );
  return createShootingRepository(db as never);
}

describe('shooting repository', () => {
  it('resumes the open session instead of starting another', async () => {
    const repo = await setup();
    const a = await repo.startOrResumeSession();
    expect(await repo.startOrResumeSession()).toBe(a);
    expect(await repo.getActiveSessionId()).toBe(a);
  });

  it('records shots in order and undoes only the latest', async () => {
    const repo = await setup();
    const id = await repo.startOrResumeSession();
    await repo.addShot(id, 'made');
    await repo.addShot(id, 'missed');
    await repo.addShot(id, 'made');
    expect((await repo.getSession(id))?.results).toEqual(['made', 'missed', 'made']);
    await repo.undoLastShot(id);
    expect((await repo.getSession(id))?.results).toEqual(['made', 'missed']);
    await repo.undoLastShot(id);
    await repo.undoLastShot(id);
    await repo.undoLastShot(id); // undo on an empty session is a no-op
    expect((await repo.getSession(id))?.results).toEqual([]);
  });

  it('discards an empty session when it ends, and keeps one with shots', async () => {
    const repo = await setup();
    const empty = await repo.startOrResumeSession();
    await repo.endSession(empty);
    expect(await repo.getSession(empty)).toBeNull();
    expect(await repo.getActiveSessionId()).toBeNull();

    const kept = await repo.startOrResumeSession();
    await repo.addShot(kept, 'made');
    await repo.endSession(kept);
    expect((await repo.getSession(kept))?.endedAt).not.toBeNull();
    expect(await repo.getActiveSessionId()).toBeNull();
  });

  it('lists sessions newest first with made and missed counts', async () => {
    const repo = await setup();
    const first = await repo.startOrResumeSession();
    await repo.addShot(first, 'made');
    await repo.addShot(first, 'missed');
    await repo.addShot(first, 'missed');
    await repo.undoLastShot(first);
    await repo.endSession(first);
    const second = await repo.startOrResumeSession();
    const list = await repo.listSessions(10);
    expect(list.map((s) => s.id)).toEqual([second, first]);
    expect(list[1]).toMatchObject({ made: 1, missed: 1 });
    expect(list[0]).toMatchObject({ made: 0, missed: 0, endedAt: null });
  });
});
