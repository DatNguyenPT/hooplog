import type { Exercise, MeasurementType } from '@/features/workouts/domain/exercise';
import {
  FIELDS_BY_TYPE,
  parseSetNumber,
  setToInput,
  type SetField,
  type SetFieldError,
  type SetInput,
  type SetValues,
} from '@/features/workouts/domain/workout';

/** ISO weekday: 1 = Monday ... 7 = Sunday. */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** Translation-key suffixes (`plans.weekday.<key>`), indexed by weekday - 1. */
export const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export function parseWeekday(raw: string | undefined): Weekday | null {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 7 ? (n as Weekday) : null;
}

/** What a plan asks for on one day. Targets are guidance: logging more or less is never blocked. */
export type PlanItem =
  | {
      kind: 'exercise';
      id: string;
      weekday: Weekday;
      exercise: Exercise;
      sets: number;
      /** Per-set targets; the ones that do not fit the exercise's measurement type, or were left blank, are null. */
      target: SetValues;
    }
  | { kind: 'shooting'; id: string; weekday: Weekday; shots: number };

export type ItemDraft =
  | { kind: 'exercise'; exerciseId: string; sets: number; target: SetValues }
  | { kind: 'shooting'; shots: number };

/** A day holds one item per exercise and at most one shooting item, so this identifies an item within a day. */
export type ItemKey = { kind: 'exercise'; exerciseId: string } | { kind: 'shooting' };

export function findItem(
  items: readonly PlanItem[],
  weekday: Weekday,
  key: ItemKey,
): PlanItem | undefined {
  return items.find(
    (i) =>
      i.weekday === weekday &&
      i.kind === key.kind &&
      (i.kind === 'shooting' || (key.kind === 'exercise' && i.exercise.id === key.exerciseId)),
  );
}

export type Plan = { id: string; name: string; isActive: boolean; items: PlanItem[] };
export type PlanSummary = { id: string; name: string; isActive: boolean; itemCount: number };

// ---- Calendar (local time: "today" is the user's day, not the UTC day) ----

export const weekdayOf = (date: Date): Weekday => (((date.getDay() + 6) % 7) + 1) as Weekday;

export const startOfDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** Built from local parts, so it stays on local midnight across month ends and daylight-saving changes. */
export const addDays = (date: Date, days: number): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

/** Local Monday 00:00 of the week containing the date. */
export const startOfWeek = (date: Date): Date => addDays(date, 1 - weekdayOf(date));

/** `YYYY-MM-DD` of the local calendar day; the key activity is bucketed under. */
export function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

// ---- Progress (derived from the logs, never stored) ----

export type DayActivity = { setsByExercise: Map<string, number>; shots: number };

/** Counts logged sets per exercise and taken shots per local day. Timestamps are ISO-8601 UTC strings. */
export function bucketActivity(
  sets: readonly { exerciseId: string; loggedAt: string }[],
  shots: readonly { takenAt: string }[],
): Map<string, DayActivity> {
  const days = new Map<string, DayActivity>();
  const dayOf = (iso: string): DayActivity => {
    const key = dayKey(new Date(iso));
    let activity = days.get(key);
    if (!activity) {
      activity = { setsByExercise: new Map(), shots: 0 };
      days.set(key, activity);
    }
    return activity;
  };
  for (const s of sets) {
    const activity = dayOf(s.loggedAt);
    activity.setsByExercise.set(s.exerciseId, (activity.setsByExercise.get(s.exerciseId) ?? 0) + 1);
  }
  for (const s of shots) dayOf(s.takenAt).shots += 1;
  return days;
}

export type ItemProgress = { done: number; target: number; complete: boolean };

/** An exercise item counts logged sets of that exercise; a shooting item counts shots taken that day. */
export function itemProgress(item: PlanItem, activity: DayActivity | undefined): ItemProgress {
  const target = item.kind === 'exercise' ? item.sets : item.shots;
  const done =
    item.kind === 'exercise'
      ? (activity?.setsByExercise.get(item.exercise.id) ?? 0)
      : (activity?.shots ?? 0);
  return { done, target, complete: done >= target };
}

export type DayState = 'past' | 'today' | 'future';
export type PlanDay = {
  weekday: Weekday;
  state: DayState;
  /** `progress` is null for days that have not happened yet, and everywhere when progress is not tracked. */
  items: { item: PlanItem; progress: ItemProgress | null }[];
};

/**
 * The week containing `today`, Monday first. Pass `activity = null` for a plan that is not being followed
 * (no progress is shown for it).
 */
export function buildWeek(
  items: readonly PlanItem[],
  activity: ReadonlyMap<string, DayActivity> | null,
  today: Date,
): PlanDay[] {
  const monday = startOfWeek(today);
  const todayWeekday = weekdayOf(today);
  return WEEKDAYS.map((weekday) => {
    const state: DayState =
      weekday < todayWeekday ? 'past' : weekday === todayWeekday ? 'today' : 'future';
    const dayActivity = activity?.get(dayKey(addDays(monday, weekday - 1)));
    return {
      weekday,
      state,
      items: items
        .filter((i) => i.weekday === weekday)
        .map((item) => ({
          item,
          progress: activity && state !== 'future' ? itemProgress(item, dayActivity) : null,
        })),
    };
  });
}

/** How many of the week's scheduled items are complete (future days count as not done yet). */
export function weekSummary(week: readonly PlanDay[]): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const day of week)
    for (const { progress } of day.items) {
      total += 1;
      if (progress?.complete) done += 1;
    }
  return { done, total };
}

// ---- Input validation (raw form text -> values) ----

export type TargetField = SetField | 'sets';
export type TargetInput = SetInput & { sets?: string };
export type ParsedTarget =
  | { ok: true; sets: number; target: SetValues }
  | { ok: false; errors: Partial<Record<TargetField, SetFieldError>> };

export const MAX_TARGET_SETS = 50;
export const MAX_TARGET_SHOTS = 1000;

function parseCount(
  raw: string | undefined,
  max: number,
): { value: number } | { error: SetFieldError } {
  const text = (raw ?? '').trim();
  if (text === '') return { error: 'required' };
  if (!/^\d+$/.test(text)) return { error: 'invalid' };
  const value = Number(text);
  return value < 1 || value > max ? { error: 'range' } : { value };
}

/**
 * Validates an exercise target. Sets are required; the per-set fields of the exercise's measurement type are
 * optional (blank means "no target") but must be valid when filled.
 */
export function parseTargetInput(type: MeasurementType, input: TargetInput): ParsedTarget {
  const errors: Partial<Record<TargetField, SetFieldError>> = {};
  const numbers: Partial<Record<SetField, number>> = {};

  const sets = parseCount(input.sets, MAX_TARGET_SETS);
  if ('error' in sets) errors.sets = sets.error;

  for (const field of FIELDS_BY_TYPE[type]) {
    if ((input[field] ?? '').trim() === '') continue;
    const parsed = parseSetNumber(input[field], field);
    if ('error' in parsed) errors[field] = parsed.error;
    else numbers[field] = parsed.value;
  }
  if ('error' in sets || Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    sets: sets.value,
    target: {
      reps: numbers.reps ?? null,
      weightKg: numbers.weight ?? null,
      durationS: numbers.duration ?? null,
      distanceM: numbers.distance ?? null,
    },
  };
}

/** Form text for a saved exercise item, so editing starts from what was planned. */
export function targetToInput(
  type: MeasurementType,
  item: { sets: number; target: SetValues },
): TargetInput {
  return { sets: String(item.sets), ...setToInput(type, item.target) };
}

export function parseShotTarget(
  raw: string,
): { ok: true; shots: number } | { ok: false; error: SetFieldError } {
  const parsed = parseCount(raw, MAX_TARGET_SHOTS);
  return 'error' in parsed ? { ok: false, error: parsed.error } : { ok: true, shots: parsed.value };
}

export const MAX_PLAN_NAME_LENGTH = 40;
export type PlanNameError = 'required' | 'tooLong' | 'duplicate';

const normalize = (s: string) => s.trim().toLocaleLowerCase();

/** Validates a plan name against the other plans' names. Returns the trimmed name. */
export function validatePlanName(
  raw: string,
  otherNames: readonly string[],
): { ok: true; name: string } | { ok: false; error: PlanNameError } {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name === '') return { ok: false, error: 'required' };
  if (name.length > MAX_PLAN_NAME_LENGTH) return { ok: false, error: 'tooLong' };
  if (otherNames.some((n) => normalize(n) === normalize(name)))
    return { ok: false, error: 'duplicate' };
  return { ok: true, name };
}
