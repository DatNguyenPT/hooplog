import { fieldGoalPercentage, summarize, type ShotResult } from '@/features/shooting/domain/stats';
import { addDays, dayKey, startOfWeek } from '@/features/training-plans/domain/plan';
import type { Exercise, MeasurementType } from '@/features/workouts/domain/exercise';
import { setVolume, type PersonalBest } from '@/features/workouts/domain/workout';

/** How many calendar weeks (Monday to Sunday, local time) the weekly charts cover, the current one included. */
export const WEEKS_SHOWN = 8;

/** A session needs this many resolved shots to count as a best FG%, so "1 of 1" cannot win. */
export const MIN_ATTEMPTS_FOR_BEST = 20;

// ---- Weekly series (derived from the logs, never stored) ----

export type ResolvedShot = { takenAt: string; result: 'made' | 'missed' };
export type LoggedSet = { loggedAt: string; reps: number | null; weightKg: number | null };

/** What the weekly charts read from the logs. Timestamps are ISO-8601 UTC strings. */
export type WeeklyInputs = {
  shots: readonly ResolvedShot[];
  /** Start time of every shooting session that has a shot and every workout that has a set. */
  sessionStarts: readonly string[];
  sets: readonly LoggedSet[];
};

export type WeekStats = {
  /** Local Monday 00:00. */
  start: Date;
  made: number;
  missed: number;
  /** 0-100, or null when no shot was taken that week. */
  fgPercentage: number | null;
  /** Shooting sessions plus workouts that started that week. */
  sessions: number;
  /** Reps x weight over weighted sets; bodyweight, timed and distance sets add nothing. */
  volumeKg: number;
};

/** Local Monday 00:00 of the oldest week shown when `now` falls in the newest one. */
export function firstWeekStart(now: Date, weeks: number = WEEKS_SHOWN): Date {
  return addDays(startOfWeek(now), -7 * (weeks - 1));
}

/** One entry per week, oldest first. Entries outside the window (older, or dated after `now`'s week) are ignored. */
export function buildWeeklyStats(
  inputs: WeeklyInputs,
  now: Date,
  weeks: number = WEEKS_SHOWN,
): WeekStats[] {
  const first = firstWeekStart(now, weeks);
  const stats: WeekStats[] = [];
  const byKey = new Map<string, WeekStats>();
  for (let i = 0; i < weeks; i += 1) {
    const start = addDays(first, 7 * i);
    const week: WeekStats = {
      start,
      made: 0,
      missed: 0,
      fgPercentage: null,
      sessions: 0,
      volumeKg: 0,
    };
    stats.push(week);
    byKey.set(dayKey(start), week);
  }
  const weekOf = (iso: string) => byKey.get(dayKey(startOfWeek(new Date(iso))));

  for (const shot of inputs.shots) {
    const week = weekOf(shot.takenAt);
    if (week) week[shot.result] += 1;
  }
  for (const iso of inputs.sessionStarts) {
    const week = weekOf(iso);
    if (week) week.sessions += 1;
  }
  for (const set of inputs.sets) {
    const week = weekOf(set.loggedAt);
    if (week) week.volumeKg += setVolume(set);
  }
  for (const week of stats) week.fgPercentage = fieldGoalPercentage(week);
  return stats;
}

/**
 * Bar heights as 0-1 fractions; null (no data) draws nothing. FG% is a rate, so callers pass `max: 100`;
 * counts and volume scale to the largest value shown.
 */
export function scaleBars(values: readonly (number | null)[], max?: number): number[] {
  const top = max ?? Math.max(0, ...values.map((v) => v ?? 0));
  return values.map((v) => (v === null || top <= 0 ? 0 : Math.min(1, Math.max(0, v / top))));
}

// ---- Personal bests ----

export type SessionResults = {
  sessionId: string;
  startedAt: string;
  /** Shot results in the order they were taken. */
  results: readonly ShotResult[];
};

export type BestSession = {
  sessionId: string;
  startedAt: string;
  made: number;
  attempts: number;
  fgPercentage: number;
};

export type ShootingBests = {
  /** Highest FG% among sessions with at least `minAttempts` resolved shots; null when none qualifies. */
  bestSession: BestSession | null;
  /** Longest run of makes within one session (uncertain shots neither extend nor break it). */
  longestMakeStreak: number;
};

/**
 * True when `a` has the higher rate; equal rates go to the one with more shots, and a full tie keeps `b`.
 * Rates are compared as fractions (cross-multiplied), which is exact for whole numbers.
 */
function beats(a: { made: number; attempts: number }, b: { made: number; attempts: number }) {
  const left = a.made * b.attempts;
  const right = b.made * a.attempts;
  return left > right || (left === right && a.attempts > b.attempts);
}

export function shootingBests(
  sessions: readonly SessionResults[],
  minAttempts: number = MIN_ATTEMPTS_FOR_BEST,
): ShootingBests {
  let bestSession: BestSession | null = null;
  let longestMakeStreak = 0;
  for (const session of sessions) {
    const summary = summarize(session.results);
    longestMakeStreak = Math.max(longestMakeStreak, summary.longestMakeStreak);
    if (summary.fgPercentage === null || summary.attempts < minAttempts) continue;
    if (bestSession === null || beats(summary, bestSession)) {
      bestSession = {
        sessionId: session.sessionId,
        startedAt: session.startedAt,
        made: summary.made,
        attempts: summary.attempts,
        fgPercentage: summary.fgPercentage,
      };
    }
  }
  return { bestSession, longestMakeStreak };
}

/** All-time best weight and reps of one exercise, with the exercise so deleted custom ones keep their name. */
export type LiftBest = PersonalBest & { exercise: Exercise };

export type LiftRecord = { exerciseId: string; name: string } & (
  { kind: 'weight'; weightKg: number } | { kind: 'reps'; reps: number }
);

function liftRecord(type: MeasurementType, best: PersonalBest) {
  // A weighted lift is judged by its heaviest set; logged unloaded only, it falls back to reps.
  if (type === 'reps_weight' && best.maxWeightKg !== null && best.maxWeightKg > 0)
    return { kind: 'weight', weightKg: best.maxWeightKg } as const;
  if ((type === 'reps' || type === 'reps_weight') && best.maxReps !== null)
    return { kind: 'reps', reps: best.maxReps } as const;
  return null;
}

/** One record per exercise that has one (timed and distance exercises have none yet), sorted by name. */
export function liftRecords(
  lifts: readonly LiftBest[],
  displayName: (exercise: Exercise) => string,
): LiftRecord[] {
  const records: LiftRecord[] = [];
  for (const lift of lifts) {
    const record = liftRecord(lift.exercise.measurementType, lift);
    if (record)
      records.push({ exerciseId: lift.exercise.id, name: displayName(lift.exercise), ...record });
  }
  return records.sort((a, b) => a.name.localeCompare(b.name));
}

/** True when there is nothing to chart or rank yet, so the screen shows its empty state. */
export function isEmptyProgress(
  weeks: readonly WeekStats[],
  shooting: ShootingBests,
  lifts: readonly LiftRecord[],
): boolean {
  return (
    weeks.every((w) => w.sessions === 0 && w.made + w.missed === 0 && w.volumeKg === 0) &&
    shooting.bestSession === null &&
    shooting.longestMakeStreak === 0 &&
    lifts.length === 0
  );
}
