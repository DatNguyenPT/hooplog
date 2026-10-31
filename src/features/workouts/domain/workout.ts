import type { MeasurementType } from './exercise';

/** One logged set. Unused measurements for the exercise's type are null. Always metric. */
export type SetValues = {
  reps: number | null;
  weightKg: number | null;
  durationS: number | null;
  distanceM: number | null;
};

export type WorkoutSet = SetValues & { id: string; exerciseId: string; loggedAt: string };

/** Volume of one set in kg (reps x weight); 0 when either is missing (bodyweight, timed or distance sets). */
export function setVolume(set: Pick<SetValues, 'reps' | 'weightKg'>): number {
  if (set.reps === null || set.weightKg === null) return 0;
  return set.reps * set.weightKg;
}

export type WorkoutSummary = {
  sets: number;
  totalReps: number;
  totalVolumeKg: number;
  /** Seconds from start to end; null while the workout is still open. */
  durationS: number | null;
};

export function summarizeWorkout(
  sets: readonly SetValues[],
  startedAt: string,
  endedAt: string | null,
): WorkoutSummary {
  let totalReps = 0;
  let totalVolumeKg = 0;
  for (const s of sets) {
    totalReps += s.reps ?? 0;
    totalVolumeKg += setVolume(s);
  }
  return {
    sets: sets.length,
    totalReps,
    totalVolumeKg,
    durationS: durationSeconds(startedAt, endedAt),
  };
}

export function durationSeconds(startedAt: string, endedAt: string | null): number | null {
  if (endedAt === null) return null;
  const ms = Date.parse(endedAt) - Date.parse(startedAt);
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 1000)) : null;
}

export type PersonalBest = { maxWeightKg: number | null; maxReps: number | null };

/** Best weight and best reps per exercise across the given sets (pass the whole history to get all-time bests). */
export function personalBests(
  sets: readonly Pick<WorkoutSet, 'exerciseId' | 'reps' | 'weightKg'>[],
): Map<string, PersonalBest> {
  const best = new Map<string, PersonalBest>();
  for (const s of sets) {
    const current = best.get(s.exerciseId) ?? { maxWeightKg: null, maxReps: null };
    if (s.weightKg !== null && (current.maxWeightKg === null || s.weightKg > current.maxWeightKg))
      current.maxWeightKg = s.weightKg;
    if (s.reps !== null && (current.maxReps === null || s.reps > current.maxReps))
      current.maxReps = s.reps;
    best.set(s.exerciseId, current);
  }
  return best;
}

// ---- Input validation (raw text from the form -> metric values) ----

export type SetField = 'reps' | 'weight' | 'duration' | 'distance';
export type SetFieldError = 'required' | 'invalid' | 'range';
export type SetInput = Partial<Record<SetField, string>>;

export const FIELDS_BY_TYPE: Record<MeasurementType, readonly SetField[]> = {
  reps: ['reps'],
  reps_weight: ['reps', 'weight'],
  duration: ['duration'],
  distance: ['distance'],
};

const LIMITS = {
  reps: { min: 1, max: 1000, integer: true },
  /** 0 is allowed so a weighted movement can be logged unloaded. */
  weight: { min: 0, max: 1000, integer: false },
  duration: { min: 1, max: 86_400, integer: true },
  distance: { min: 1, max: 100_000, integer: false },
} as const;

function parseNumber(
  raw: string | undefined,
  field: SetField,
): { value: number } | { error: SetFieldError } {
  const text = (raw ?? '').trim().replace(',', '.');
  if (text === '') return { error: 'required' };
  if (!/^\d+(\.\d+)?$/.test(text)) return { error: 'invalid' };
  const value = Number(text);
  const limit = LIMITS[field];
  if (limit.integer && !Number.isInteger(value)) return { error: 'invalid' };
  if (value < limit.min || value > limit.max) return { error: 'range' };
  return { value };
}

export type ParsedSet =
  { ok: true; values: SetValues } | { ok: false; errors: Partial<Record<SetField, SetFieldError>> };

/** Validates raw form text for the exercise's measurement type. Only that type's fields are read. */
export function parseSetInput(type: MeasurementType, input: SetInput): ParsedSet {
  const errors: Partial<Record<SetField, SetFieldError>> = {};
  const numbers: Partial<Record<SetField, number>> = {};
  for (const field of FIELDS_BY_TYPE[type]) {
    const parsed = parseNumber(input[field], field);
    if ('error' in parsed) errors[field] = parsed.error;
    else numbers[field] = parsed.value;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    values: {
      reps: numbers.reps ?? null,
      weightKg: numbers.weight ?? null,
      durationS: numbers.duration ?? null,
      distanceM: numbers.distance ?? null,
    },
  };
}
