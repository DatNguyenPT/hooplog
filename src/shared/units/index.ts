/** Data is stored in metric; these helpers convert at the UI edge only. */
export type UnitSystem = 'metric' | 'imperial';

const KG_PER_LB = 0.45359237;
const CM_PER_INCH = 2.54;

export const kgToLb = (kg: number): number => kg / KG_PER_LB;
export const lbToKg = (lb: number): number => lb * KG_PER_LB;
export const cmToInches = (cm: number): number => cm / CM_PER_INCH;
export const inchesToCm = (inches: number): number => inches * CM_PER_INCH;

export function formatWeight(kg: number, system: UnitSystem = 'metric'): string {
  const value = system === 'metric' ? kg : kgToLb(kg);
  return `${Math.round(value * 10) / 10} ${system === 'metric' ? 'kg' : 'lb'}`;
}

/** Metres below 1 km, kilometres (one decimal at most) from 1 km up. */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters * 10) / 10} m`;
  return `${Math.round(meters / 100) / 10} km`;
}

/** `m:ss`, or `h:mm:ss` from one hour up. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
