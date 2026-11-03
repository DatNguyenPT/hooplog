import { themes, type Theme } from './theme';

// WCAG 2.x contrast: relative luminance of each colour, then (lighter + 0.05) / (darker + 0.05).
function channel(value: number): number {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}

function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

// Text needs 4.5:1 (WCAG AA). The outline of a control needs 3:1 against what it sits on.
const PAIRS: [keyof Theme, keyof Theme, number, string][] = [
  ['text', 'background', 4.5, 'body text'],
  ['text', 'surface', 4.5, 'text in cards and inputs'],
  ['textMuted', 'background', 4.5, 'intro text and labels'],
  ['textMuted', 'surface', 4.5, 'labels on cards'],
  ['primary', 'background', 4.5, 'link buttons'],
  ['primary', 'surface', 4.5, 'show and hide inside an input'],
  ['onPrimary', 'primary', 4.5, 'primary button text'],
  ['onStatus', 'made', 4.5, 'made button text'],
  ['onStatus', 'missed', 4.5, 'missed and delete button text'],
  ['missed', 'background', 4.5, 'error text'],
  ['missed', 'surface', 4.5, 'error text on a card'],
  ['made', 'background', 4.5, 'tick marks'],
  ['fieldBorder', 'background', 3, 'text field outline against the page'],
  ['fieldBorder', 'surface', 3, 'text field outline against its fill'],
];

describe.each(['light', 'dark'] as const)('%s theme contrast', (name) => {
  it.each(PAIRS)('%s on %s is at least %d:1 (%s)', (foreground, background, minimum) => {
    const theme = themes[name];
    expect(contrast(theme[foreground], theme[background])).toBeGreaterThanOrEqual(minimum);
  });
});
