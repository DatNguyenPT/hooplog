export type ShotResult = 'made' | 'missed' | 'uncertain';

export type ShotTally = { made: number; missed: number; uncertain: number };

export function tally(results: readonly ShotResult[]): ShotTally {
  const t: ShotTally = { made: 0, missed: 0, uncertain: 0 };
  for (const r of results) t[r] += 1;
  return t;
}

/** Field goal percentage as 0-100, or null when there are no resolved attempts. Uncertain shots are excluded until resolved. */
export function fieldGoalPercentage({
  made,
  missed,
}: Pick<ShotTally, 'made' | 'missed'>): number | null {
  const attempts = made + missed;
  if (attempts === 0) return null;
  return (made / attempts) * 100;
}

export type SessionSummary = ShotTally & {
  attempts: number;
  fgPercentage: number | null;
  currentMakeStreak: number;
  longestMakeStreak: number;
};

/** Summarizes a session from its shots in the order they were taken. Uncertain shots neither extend nor break a streak. */
export function summarize(results: readonly ShotResult[]): SessionSummary {
  const t = tally(results);
  let current = 0;
  let longest = 0;
  for (const r of results) {
    if (r === 'made') {
      current += 1;
      longest = Math.max(longest, current);
    } else if (r === 'missed') {
      current = 0;
    }
  }
  return {
    ...t,
    attempts: t.made + t.missed,
    fgPercentage: fieldGoalPercentage(t),
    currentMakeStreak: current,
    longestMakeStreak: longest,
  };
}
