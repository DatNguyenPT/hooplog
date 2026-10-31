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
