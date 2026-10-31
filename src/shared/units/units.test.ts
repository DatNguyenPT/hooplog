import { formatDistance, formatDuration, formatWeight, kgToLb, lbToKg } from './index';

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
  it('formats distance in m and km', () => {
    expect(formatDistance(400)).toBe('400 m');
    expect(formatDistance(1500)).toBe('1.5 km');
  });
  it('formats duration as m:ss or h:mm:ss', () => {
    expect(formatDuration(45)).toBe('0:45');
    expect(formatDuration(125)).toBe('2:05');
    expect(formatDuration(3725)).toBe('1:02:05');
  });
});
