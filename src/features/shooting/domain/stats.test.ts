import { fieldGoalPercentage, summarize, tally } from './stats';

describe('tally', () => {
  it('counts each result', () => {
    expect(tally(['made', 'missed', 'made', 'uncertain'])).toEqual({
      made: 2,
      missed: 1,
      uncertain: 1,
    });
  });
  it('is zero for no shots', () => {
    expect(tally([])).toEqual({ made: 0, missed: 0, uncertain: 0 });
  });
});

describe('fieldGoalPercentage', () => {
  it('returns null with no resolved attempts', () => {
    expect(fieldGoalPercentage({ made: 0, missed: 0 })).toBeNull();
  });
  it('computes made / attempts', () => {
    expect(fieldGoalPercentage({ made: 3, missed: 1 })).toBe(75);
  });
  it('handles all missed and all made', () => {
    expect(fieldGoalPercentage({ made: 0, missed: 5 })).toBe(0);
    expect(fieldGoalPercentage({ made: 5, missed: 0 })).toBe(100);
  });
  it('ignores uncertain shots', () => {
    const t = tally(['made', 'uncertain', 'uncertain', 'missed']);
    expect(fieldGoalPercentage(t)).toBe(50);
  });
});

describe('summarize', () => {
  it('is empty for no shots', () => {
    expect(summarize([])).toEqual({
      made: 0,
      missed: 0,
      uncertain: 0,
      attempts: 0,
      fgPercentage: null,
      currentMakeStreak: 0,
      longestMakeStreak: 0,
    });
  });
  it('tracks current and longest make streaks', () => {
    const s = summarize(['made', 'made', 'made', 'missed', 'made', 'made']);
    expect(s.longestMakeStreak).toBe(3);
    expect(s.currentMakeStreak).toBe(2);
    expect(s.attempts).toBe(6);
    expect(s.fgPercentage).toBeCloseTo(83.33, 1);
  });
  it('resets the current streak on a miss', () => {
    expect(summarize(['made', 'missed']).currentMakeStreak).toBe(0);
  });
  it('lets uncertain shots neither extend nor break a streak', () => {
    const s = summarize(['made', 'uncertain', 'made']);
    expect(s.currentMakeStreak).toBe(2);
    expect(s.attempts).toBe(2);
  });
});
