export const MEASUREMENT_TYPES = ['reps', 'reps_weight', 'duration', 'distance'] as const;
export type MeasurementType = (typeof MEASUREMENT_TYPES)[number];

export const CATEGORIES = [
  'strength',
  'plyometrics',
  'core',
  'conditioning',
  'agility',
  'other',
] as const;
export type ExerciseCategory = (typeof CATEGORIES)[number];

export type Exercise = {
  id: string;
  /** Built-in: a translation key suffix (for example `squat`). Custom: the name the user typed. */
  name: string;
  category: ExerciseCategory;
  measurementType: MeasurementType;
  isBuiltin: boolean;
};

export const MAX_EXERCISE_NAME_LENGTH = 60;

/** Name shown to the user. `translate` receives the full i18n key of a built-in exercise. */
export function exerciseDisplayName(
  exercise: Pick<Exercise, 'name' | 'isBuiltin'>,
  translate: (key: string) => string,
): string {
  return exercise.isBuiltin ? translate(`exercises.builtin.${exercise.name}`) : exercise.name;
}

const normalize = (s: string) => s.trim().toLocaleLowerCase();

/** Case-insensitive substring match on the display name; an empty query keeps everything. */
export function filterExercises(
  exercises: readonly Exercise[],
  query: string,
  translate: (key: string) => string,
): Exercise[] {
  const q = normalize(query);
  if (q === '') return [...exercises];
  return exercises.filter((e) => normalize(exerciseDisplayName(e, translate)).includes(q));
}

export type ExerciseNameError = 'required' | 'tooLong' | 'duplicate';

/** Validates a custom exercise name against the names already shown in the library. Returns the trimmed name. */
export function validateExerciseName(
  raw: string,
  existingDisplayNames: readonly string[],
): { ok: true; name: string } | { ok: false; error: ExerciseNameError } {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name === '') return { ok: false, error: 'required' };
  if (name.length > MAX_EXERCISE_NAME_LENGTH) return { ok: false, error: 'tooLong' };
  if (existingDisplayNames.some((n) => normalize(n) === normalize(name)))
    return { ok: false, error: 'duplicate' };
  return { ok: true, name };
}
