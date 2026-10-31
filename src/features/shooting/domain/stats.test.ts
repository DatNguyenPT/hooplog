import { fieldGoalPercentage, tally } from './stats';

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
