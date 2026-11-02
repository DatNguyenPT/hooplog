import { z } from 'zod';

import { MAX_DISPLAY_NAME_LENGTH } from '@/features/profile/domain/profile';
import { MAX_PLAN_NAME_LENGTH } from '@/features/training-plans/domain/plan';
import { MAX_EXERCISE_NAME_LENGTH } from '@/features/workouts/domain/exercise';

/**
 * The backup file: one JSON document that holds the player's rows, column for column as they are
 * in the local database (snake_case, metric units, ISO-8601 UTC times). Each row schema repeats
 * its table's CHECK rules, so a file that passes can be restored without the database objecting.
 */
export const BACKUP_APP = 'hooplog';
/** Bump when the file's shape changes in a way an older app could not read. */
export const BACKUP_FORMAT = 1;

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** The exact shape `Date#toISOString` writes and a real date, so sorting the strings sorts by time. */
function isIsoUtc(value: string): boolean {
  if (!ISO_UTC.test(value)) return false;
  const time = Date.parse(value);
  return !Number.isNaN(time) && new Date(time).toISOString() === value;
}

const id = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const timestamp = z.string().refine(isIsoUtc, 'not an ISO-8601 UTC time');
const flag = z.union([z.literal(0), z.literal(1)]);
const count = z.int().min(1);
const source = z.enum(['manual', 'ai']);

// Only rows that are live are exported, so deleted_at is null everywhere but on custom exercises.
const stamps = { created_at: timestamp, updated_at: timestamp, deleted_at: z.null() };

const shootingSession = z.strictObject({
  id,
  started_at: timestamp,
  source,
  ended_at: timestamp.nullable(),
  ...stamps,
});

const shot = z.strictObject({
  id,
  session_id: id,
  taken_at: timestamp,
  result: z.enum(['made', 'missed', 'uncertain']),
  source,
  confidence: z.number().min(0).max(1).nullable(),
  corrected: flag,
  ...stamps,
});

/** Custom exercises only: the built-in ones ship with the app. A deleted one stays, so old sets keep their name. */
const exercise = z.strictObject({
  id,
  name: z.string().min(1).max(MAX_EXERCISE_NAME_LENGTH),
  category: z.string().min(1).max(40),
  measurement_type: z.enum(['reps', 'reps_weight', 'duration', 'distance']),
  is_builtin: z.literal(0),
  created_at: timestamp,
  updated_at: timestamp,
  deleted_at: timestamp.nullable(),
});

const workoutSession = z.strictObject({
  id,
  started_at: timestamp,
  ended_at: timestamp.nullable(),
  ...stamps,
});

const workoutSet = z.strictObject({
  id,
  session_id: id,
  exercise_id: id,
  logged_at: timestamp,
  reps: count.nullable(),
  weight_kg: z.number().min(0).nullable(),
  duration_s: count.nullable(),
  distance_m: z.number().positive().nullable(),
  ...stamps,
});

const trainingPlan = z.strictObject({
  id,
  name: z.string().min(1).max(MAX_PLAN_NAME_LENGTH),
  is_active: flag,
  ...stamps,
});

const planItem = z
  .strictObject({
    id,
    plan_id: id,
    weekday: z.int().min(1).max(7),
    kind: z.enum(['exercise', 'shooting']),
    exercise_id: id.nullable(),
    target_sets: count.nullable(),
    target_reps: count.nullable(),
    target_weight_kg: z.number().min(0).nullable(),
    target_duration_s: count.nullable(),
    target_distance_m: z.number().positive().nullable(),
    target_shots: count.nullable(),
    ...stamps,
  })
  // The same rule as the table's CHECK: an exercise item has an exercise and sets, a shooting item has shots.
  .refine(
    (item) =>
      item.kind === 'exercise'
        ? item.exercise_id !== null && item.target_sets !== null && item.target_shots === null
        : item.exercise_id === null && item.target_shots !== null && item.target_sets === null,
    'targets do not fit the kind',
  );

const profile = z.strictObject({
  id,
  display_name: z.string().min(1).max(MAX_DISPLAY_NAME_LENGTH).nullable(),
  onboarded_at: timestamp.nullable(),
  ...stamps,
});

export const backupSchema = z.strictObject({
  app: z.literal(BACKUP_APP),
  format: z.literal(BACKUP_FORMAT),
  exported_at: timestamp,
  data: z.strictObject({
    profile: profile.nullable(),
    exercise: z.array(exercise),
    shooting_session: z.array(shootingSession),
    shot: z.array(shot),
    workout_session: z.array(workoutSession),
    workout_set: z.array(workoutSet),
    training_plan: z.array(trainingPlan),
    plan_item: z.array(planItem),
  }),
});

export type BackupFile = z.infer<typeof backupSchema>;
export type BackupData = BackupFile['data'];
