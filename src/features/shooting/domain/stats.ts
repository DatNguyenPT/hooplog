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
