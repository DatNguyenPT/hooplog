import { runMigrations, type MigrationDb } from './migrate';

function fakeDb(version = 0) {
  const executed: string[] = [];
  const db: MigrationDb = {
    getUserVersion: async () => version,
    execAsync: async (sql) => {
      executed.push(sql);
      const m = /user_version = (\d+)/.exec(sql);
      if (m) version = Number(m[1]);
    },
  };
  return { db, executed };
}

const migrations = [
  { version: 1, sql: 'CREATE TABLE a (id TEXT)' },
  { version: 2, sql: 'CREATE TABLE b (id TEXT)' },
];

describe('runMigrations', () => {
  it('applies all migrations on a new database', async () => {
    const { db, executed } = fakeDb();
    expect(await runMigrations(db, migrations)).toBe(2);
    expect(executed).toHaveLength(2);
  });
  it('applies only pending migrations and is idempotent', async () => {
    const { db, executed } = fakeDb(1);
    await runMigrations(db, migrations);
    expect(executed).toHaveLength(1);
    expect(executed[0]).toContain('CREATE TABLE b');
    await runMigrations(db, migrations);
    expect(executed).toHaveLength(1);
  });
  it('rejects gaps and databases newer than the app', async () => {
    await expect(runMigrations(fakeDb().db, [{ version: 2, sql: '' }])).rejects.toThrow(
      /without gaps/,
    );
    await expect(runMigrations(fakeDb(5).db, migrations)).rejects.toThrow(/newer than this app/);
  });
});
