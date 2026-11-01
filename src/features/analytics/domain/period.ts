import { addDays, dayKey, startOfDay, startOfWeek } from '@/features/training-plans/domain/plan';

/** How many weeks the "8 weeks" trend covers, the current one included. */
export const TREND_WEEKS = 8;

export const PERIOD_KINDS = ['day', 'week', 'month', 'trend'] as const;
export type PeriodKind = (typeof PERIOD_KINDS)[number];

/** The window the player is looking at. `anchor` is any local date inside it. */
export type Period = { kind: PeriodKind; anchor: Date };

export type PeriodLayout = {
  /** What one bar covers. */
  unit: 'day' | 'week';
  /** Local midnight each bar starts at, oldest first. */
  starts: Date[];
  /** The window as local midnights: `from` is inside it, `to` is not. */
  from: Date;
  to: Date;
};

const daysFrom = (first: Date, count: number) =>
  Array.from({ length: count }, (_, i) => addDays(first, i));

/** Weeks run Monday to Sunday and months follow the calendar, all in local time. */
export function periodLayout({ kind, anchor }: Period): PeriodLayout {
  if (kind === 'day') {
    const from = startOfDay(anchor);
    return { unit: 'day', starts: [from], from, to: addDays(from, 1) };
  }
  if (kind === 'week') {
    const from = startOfWeek(anchor);
    return { unit: 'day', starts: daysFrom(from, 7), from, to: addDays(from, 7) };
  }
  if (kind === 'month') {
    const from = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const to = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
    const days = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
    return { unit: 'day', starts: daysFrom(from, days), from, to };
  }
  // The trend ends with the week containing the anchor and looks back from there.
  const last = startOfWeek(anchor);
  const from = addDays(last, -7 * (TREND_WEEKS - 1));
  const starts = Array.from({ length: TREND_WEEKS }, (_, i) => addDays(from, 7 * i));
  return { unit: 'week', starts, from, to: addDays(last, 7) };
}

/** Identifies the window, so state and loaded data can be matched to it. */
export const periodKey = (period: Period): string =>
  `${period.kind}:${dayKey(periodLayout(period).from)}`;

/** The trend is a fixed look back from today, so it has no previous or next. */
export const canNavigate = (kind: PeriodKind): boolean => kind !== 'trend';

export function shiftPeriod(period: Period, direction: -1 | 1): Period {
  const { kind, anchor } = period;
  if (kind === 'day') return { kind, anchor: addDays(anchor, direction) };
  if (kind === 'week') return { kind, anchor: addDays(anchor, 7 * direction) };
  if (kind === 'month')
    return { kind, anchor: new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1) };
  return period;
}

/** True when the window contains `now`. */
export function isCurrent(period: Period, now: Date): boolean {
  const { from, to } = periodLayout(period);
  return from <= now && now < to;
}

/** Forward stops at the window containing today: nothing is logged in the future. */
export function canGoForward(period: Period, now: Date): boolean {
  return canNavigate(period.kind) && periodLayout(period).to <= now;
}

/** Changing the range keeps the date being looked at; the trend always looks back from today. */
export function switchKind(period: Period, kind: PeriodKind, now: Date): Period {
  return { kind, anchor: kind === 'trend' ? now : period.anchor };
}

/**
 * The bar selected before anything is tapped: the one containing `now`, else the latest one with
 * data (a past window), else the last.
 */
export function defaultBar(layout: PeriodLayout, now: Date, hasData: readonly boolean[]): number {
  const today = layout.starts.findIndex(
    (start, i) => start <= now && now < (layout.starts[i + 1] ?? layout.to),
  );
  if (today >= 0) return today;
  const latest = hasData.lastIndexOf(true);
  return latest >= 0 ? latest : layout.starts.length - 1;
}
