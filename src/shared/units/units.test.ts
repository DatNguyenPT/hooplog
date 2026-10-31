import { formatWeight, kgToLb, lbToKg } from './index';

describe('units', () => {
  it('round-trips kg and lb', () => {
    expect(lbToKg(kgToLb(80))).toBeCloseTo(80, 10);
  });
  it('formats metric by default', () => {
    expect(formatWeight(72.46)).toBe('72.5 kg');
  });
  it('formats imperial', () => {
    expect(formatWeight(100, 'imperial')).toBe('220.5 lb');
  });
});
