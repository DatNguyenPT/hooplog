import { BackupError } from './backupError';
import {
  BACKUP_APP,
  BACKUP_FORMAT,
  backupSchema,
  type BackupData,
  type BackupFile,
} from './backupSchema';

/** A file bigger than this is refused: reading it whole could run a phone out of memory. */
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;

/** Built-in exercises have fixed ids (migration 3) and ship with the app, so a backup never carries them. */
const BUILTIN_EXERCISE_ID = /^00000000-0000-4000-8000-0000000000\d\d$/;
const isBuiltinExerciseId = (id: string) => BUILTIN_EXERCISE_ID.test(id);

/** `hooplog-backup-2026-11-01.json`, dated by the phone's own calendar day. */
export function backupFileName(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `hooplog-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

/** Tells the app's own earlier exports apart from anything else in a folder, so only those are cleaned up. */
export const isBackupFileName = (name: string) => /^hooplog-backup-[\d-]+\.json$/.test(name);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasUniqueIds = (rows: readonly { id: string }[]) =>
  new Set(rows.map((row) => row.id)).size === rows.length;

/**
 * Whether the rows fit together: ids are unique, every row's parent is in the file and the
 * "only one" rules the database enforces hold. A file that fails could not be restored whole.
 */
function isConsistent(data: BackupData): boolean {
  const tables = [
    data.exercise,
    data.shooting_session,
    data.shot,
    data.workout_session,
    data.workout_set,
    data.training_plan,
    data.plan_item,
  ];
  if (!tables.every(hasUniqueIds)) return false;

  const shootingSessions = new Set(data.shooting_session.map((row) => row.id));
  const workoutSessions = new Set(data.workout_session.map((row) => row.id));
  const plans = new Set(data.training_plan.map((row) => row.id));
  const customExercises = new Set(data.exercise.map((row) => row.id));
  // The database has the built-in ones; it settles whether an id like that really exists.
  const exerciseKnown = (id: string) => customExercises.has(id) || isBuiltinExerciseId(id);
  const itemSlots = data.plan_item.map(
    (item) => `${item.plan_id}|${item.weekday}|${item.exercise_id ?? 'shooting'}`,
  );

  return (
    !data.exercise.some((row) => isBuiltinExerciseId(row.id)) &&
    data.shot.every((row) => shootingSessions.has(row.session_id)) &&
    data.workout_set.every(
      (row) => workoutSessions.has(row.session_id) && exerciseKnown(row.exercise_id),
    ) &&
    data.plan_item.every(
      (row) =>
        plans.has(row.plan_id) && (row.exercise_id === null || exerciseKnown(row.exercise_id)),
    ) &&
    data.shooting_session.filter((row) => row.ended_at === null).length <= 1 &&
    data.workout_session.filter((row) => row.ended_at === null).length <= 1 &&
    data.training_plan.filter((row) => row.is_active === 1).length <= 1 &&
    new Set(itemSlots).size === itemSlots.length
  );
}

/** Reads a backup file's text. Throws a `BackupError` that says what is wrong with it. */
export function parseBackup(text: string): BackupFile {
  let json: unknown;
  try {
    // A byte-order mark is what some editors put at the start of a saved file.
    json = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch (error) {
    throw new BackupError('notBackup', { cause: error });
  }
  if (!isRecord(json) || json.app !== BACKUP_APP) throw new BackupError('notBackup');
  if (typeof json.format === 'number' && json.format > BACKUP_FORMAT) {
    throw new BackupError('newerVersion');
  }
  const parsed = backupSchema.safeParse(json);
  if (!parsed.success) throw new BackupError('damaged', { cause: parsed.error });
  if (!isConsistent(parsed.data.data)) throw new BackupError('damaged');
  return parsed.data;
}

/**
 * Checks rows read from the database against the file format, then writes them out. Refusing
 * here means a backup is never handed over that the restore would turn down.
 */
export function serializeBackup(
  data: unknown,
  exportedAt: string,
): { text: string; summary: DataSummary } {
  try {
    const file = backupSchema.parse({
      app: BACKUP_APP,
      format: BACKUP_FORMAT,
      exported_at: exportedAt,
      data,
    });
    if (!isConsistent(file.data)) throw new Error('rows do not fit together');
    return { text: JSON.stringify(file), summary: summarizeBackup(file.data) };
  } catch (error) {
    throw new BackupError('exportFailed', { cause: error });
  }
}

/** How much a backup holds, or how much is on the phone: what the screen shows and the player confirms. */
export type DataSummary = {
  shootingSessions: number;
  shots: number;
  workoutSessions: number;
  workoutSets: number;
  plans: number;
  customExercises: number;
};

export const summarizeBackup = (data: BackupData): DataSummary => ({
  shootingSessions: data.shooting_session.length,
  shots: data.shot.length,
  workoutSessions: data.workout_session.length,
  workoutSets: data.workout_set.length,
  plans: data.training_plan.length,
  // A deleted custom exercise is carried only so old sets keep its name; it is not one the player has.
  customExercises: data.exercise.filter((row) => row.deleted_at === null).length,
});

/** Nothing worth keeping: no sessions, no plans, no custom exercises. */
export const isEmptySummary = (s: DataSummary) =>
  s.shootingSessions + s.workoutSessions + s.plans + s.customExercises === 0;

/** The kinds of data a summary counts, in the order the screen lists them. */
const SUMMARY_KEYS: readonly (keyof DataSummary)[] = [
  'shootingSessions',
  'shots',
  'workoutSessions',
  'workoutSets',
  'plans',
  'customExercises',
];

/** The counts worth listing: the kinds the player has any of. */
export const summaryEntries = (s: DataSummary) =>
  SUMMARY_KEYS.filter((key) => s[key] > 0).map((key) => ({ key, count: s[key] }));
