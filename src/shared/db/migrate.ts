export type Migration = { version: number; sql: string };

/** The minimal database surface the runner needs; expo-sqlite's database satisfies it. */
export interface MigrationDb {
  getUserVersion(): Promise<number>;
  execAsync(sql: string): Promise<void>;
}

/** Forward-only. Each migration runs once, in order, in a transaction; the version is stored in the DB itself. */
export async function runMigrations(
  db: MigrationDb,
  migrations: readonly Migration[],
): Promise<number> {
  const sorted = [...migrations].sort((a, b) => a.version - b.version);
  sorted.forEach((m, i) => {
    if (m.version !== i + 1)
      throw new Error(
        `Migrations must be numbered 1..n without gaps (found ${m.version} at position ${i + 1})`,
      );
  });
  let current = await db.getUserVersion();
  if (current > sorted.length)
    throw new Error(`Database version ${current} is newer than this app (${sorted.length})`);
  for (const m of sorted.filter((x) => x.version > current)) {
    await db.execAsync(`BEGIN; ${m.sql}; PRAGMA user_version = ${m.version}; COMMIT;`);
    current = m.version;
  }
  return current;
}
