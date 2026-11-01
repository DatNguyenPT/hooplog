import { fieldGoalPercentage, summarize, type ShotResult } from '@/features/shooting/domain/stats';
import { dayKey, startOfDay, startOfWeek } from '@/features/training-plans/domain/plan';
import type { Exercise, MeasurementType } from '@/features/workouts/domain/exercise';
import { setVolume, type PersonalBest } from '@/features/workouts/domain/workout';

import type { PeriodLayout } from './period';

/** A session needs this many resolved shots to count as a best FG%, so "1 of 1" cannot win. */
export const MIN_ATTEMPTS_FOR_BEST = 20;

// ---- Period series (derived from the logs, never stored) ----

export type ResolvedShot = { takenAt: string; result: 'made' | 'missed' };
export type LoggedSet = { loggedAt: string; reps: number | null; weightKg: number | null };

/** What the charts read from the logs for one period. Timestamps are ISO-8601 UTC strings. */
export type PeriodInputs = {
  shots: readonly ResolvedShot[];
  /** Start time of every shooting session that has a shot and every workout that has a set. */
  sessionStarts: readonly string[];
  sets: readonly LoggedSet[];
};

export type Totals = {
  made: number;
  missed: number;
  /** 0-100, or null when no shot was taken. */
  fgPercentage: number | null;
  /** Shooting sessions plus workouts that started in the period. */
  sessions: number;
  /** Reps x weight over weighted sets; bodyweight, timed and distance sets add nothing. */
  volumeKg: number;
};

/** The figures of one bar: a day, or a week in the trend. */
export type BucketStats = Totals & {
  /** Local midnight the bar starts at. */
  start: Date;
};

export const hasActivity = (totals: Totals): boolean =>
  totals.sessions > 0 || totals.made + totals.missed > 0 || totals.volumeKg > 0;

/** One entry per bar of the layout, oldest first. Logs that fall in no bar are ignored. */
export function buildBucketStats(
  inputs: PeriodInputs,
  layout: Pick<PeriodLayout, 'unit' | 'starts'>,
): BucketStats[] {
  const stats: BucketStats[] = layout.starts.map((start) => ({
    start,
    made: 0,
    missed: 0,
    fgPercentage: null,
    sessions: 0,
    volumeKg: 0,
  }));
  const byKey = new Map(stats.map((bucket) => [dayKey(bucket.start), bucket]));
  const barStart = layout.unit === 'week' ? startOfWeek : startOfDay;
  const bucketOf = (iso: string) => byKey.get(dayKey(barStart(new Date(iso))));

  for (const shot of inputs.shots) {
    const bucket = bucketOf(shot.takenAt);
    if (bucket) bucket[shot.result] += 1;
  }
  for (const iso of inputs.sessionStarts) {
    const bucket = bucketOf(iso);
    if (bucket) bucket.sessions += 1;
  }
  for (const set of inputs.sets) {
    const bucket = bucketOf(set.loggedAt);
    if (bucket) bucket.volumeKg += setVolume(set);
  }
  for (const bucket of stats) bucket.fgPercentage = fieldGoalPercentage(bucket);
  return stats;
}

/** The figures of the whole period: every bar added up. */
export function sumStats(buckets: readonly BucketStats[]): Totals {
  const totals: Totals = { made: 0, missed: 0, fgPercentage: null, sessions: 0, volumeKg: 0 };
  for (const bucket of buckets) {
    totals.made += bucket.made;
    totals.missed += bucket.missed;
    totals.sessions += bucket.sessions;
    totals.volumeKg += bucket.volumeKg;
  }
  totals.fgPercentage = fieldGoalPercentage(totals);
  return totals;
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

/** True when no personal best exists yet: with no period activity either, the screen shows its empty state. */
export function hasNoBests(shooting: ShootingBests, lifts: readonly LiftRecord[]): boolean {
  return shooting.bestSession === null && shooting.longestMakeStreak === 0 && lifts.length === 0;
}
