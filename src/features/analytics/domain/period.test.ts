import { addDays, dayKey } from '@/features/training-plans/domain/plan';

import {
  PERIOD_KINDS,
  TREND_WEEKS,
  canGoForward,
  canNavigate,
  defaultBar,
  isCurrent,
  periodKey,
  periodLayout,
  shiftPeriod,
  switchKind,
  type Period,
} from './period';

/** Sunday 1 November 2026, the last day of the week that began on Monday 26 October. */
const SUNDAY = new Date(2026, 10, 1, 18, 0);

const keys = (dates: readonly Date[]) => dates.map((d) => dayKey(d));
const day = (anchor: Date): Period => ({ kind: 'day', anchor });
const week = (anchor: Date): Period => ({ kind: 'week', anchor });
const month = (anchor: Date): Period => ({ kind: 'month', anchor });
const trend = (anchor: Date): Period => ({ kind: 'trend', anchor });

describe('periodLayout', () => {
  it('lays a day out as one bar from midnight to midnight', () => {
    const layout = periodLayout(day(new Date(2026, 10, 1, 18, 45)));
    expect(layout.unit).toBe('day');
    expect(keys(layout.starts)).toEqual(['2026-11-01']);
    expect(layout.from.getHours()).toBe(0);
    expect(dayKey(layout.to)).toBe('2026-11-02');
  });

  it('runs a week from Monday to Sunday, so a Sunday ends the week it is in', () => {
    const layout = periodLayout(week(SUNDAY));
    expect(layout.unit).toBe('day');
    expect(keys(layout.starts)).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ]);
    expect(dayKey(layout.from)).toBe('2026-10-26');
    expect(dayKey(layout.to)).toBe('2026-11-02');
  });

  it('gives every day of a week the same layout', () => {
    const monday = periodLayout(week(new Date(2026, 9, 26, 0, 0)));
    const sunday = periodLayout(week(new Date(2026, 10, 1, 23, 59)));
    expect(keys(monday.starts)).toEqual(keys(sunday.starts));
  });

  const MONTHS: { name: string; anchor: Date; days: number; next: string }[] = [
    { name: 'February 2026', anchor: new Date(2026, 1, 15), days: 28, next: '2026-03-01' },
    { name: 'February 2028', anchor: new Date(2028, 1, 29), days: 29, next: '2028-03-01' },
    { name: 'November 2026', anchor: new Date(2026, 10, 30), days: 30, next: '2026-12-01' },
    { name: 'December 2026', anchor: new Date(2026, 11, 31), days: 31, next: '2027-01-01' },
  ];
  for (const { name, anchor, days, next } of MONTHS) {
    it(`gives ${name} ${days} daily bars that stop at the end of the month`, () => {
      const layout = periodLayout(month(anchor));
      expect(layout.unit).toBe('day');
      expect(layout.starts).toHaveLength(days);
      expect(layout.starts[0].getDate()).toBe(1);
      expect(layout.starts[days - 1].getDate()).toBe(days);
      expect(dayKey(layout.to)).toBe(next);
    });
  }

  it('ends the trend with the week that holds the date and looks 8 weeks back', () => {
    const layout = periodLayout(trend(SUNDAY));
    expect(layout.unit).toBe('week');
    expect(layout.starts).toHaveLength(TREND_WEEKS);
    expect(keys(layout.starts)).toEqual([
      '2026-09-07',
      '2026-09-14',
      '2026-09-21',
      '2026-09-28',
      '2026-10-05',
      '2026-10-12',
      '2026-10-19',
      '2026-10-26',
    ]);
    expect(dayKey(layout.from)).toBe('2026-09-07');
    expect(dayKey(layout.to)).toBe('2026-11-02');
  });

  it('starts every bar at local midnight and steps one calendar unit at a time', () => {
    // March and October/November are where many time zones change their clocks.
    for (const anchor of [new Date(2026, 2, 10), new Date(2026, 9, 28), new Date(2026, 10, 5)]) {
      for (const kind of PERIOD_KINDS) {
        const { unit, starts } = periodLayout({ kind, anchor });
        starts.forEach((start, i) => {
          expect(start.getHours()).toBe(0);
          expect(start.getMinutes()).toBe(0);
          if (i > 0) {
            const step = unit === 'week' ? 7 : 1;
            expect(dayKey(start)).toBe(dayKey(addDays(starts[i - 1], step)));
          }
        });
      }
    }
  });
});

describe('periodKey', () => {
  it('is the same for any date inside the window', () => {
    expect(periodKey(week(new Date(2026, 9, 26)))).toBe(periodKey(week(SUNDAY)));
    expect(periodKey(month(new Date(2026, 10, 1)))).toBe(periodKey(month(new Date(2026, 10, 30))));
    expect(periodKey(trend(new Date(2026, 9, 26)))).toBe(periodKey(trend(SUNDAY)));
  });

  it('differs between windows, and between kinds that begin on the same day', () => {
    const monday = new Date(2026, 9, 26);
    expect(periodKey(week(monday))).not.toBe(periodKey(week(new Date(2026, 10, 2))));
    expect(periodKey(day(monday))).not.toBe(periodKey(week(monday)));
    expect(periodKey(day(new Date(2026, 10, 1)))).not.toBe(periodKey(month(new Date(2026, 10, 1))));
  });
});

describe('canNavigate', () => {
  it('is true for a day, week and month and false for the trend', () => {
    expect(canNavigate('day')).toBe(true);
    expect(canNavigate('week')).toBe(true);
    expect(canNavigate('month')).toBe(true);
    expect(canNavigate('trend')).toBe(false);
  });
});

describe('shiftPeriod', () => {
  it('moves a day by one day, across the end of a month', () => {
    expect(dayKey(shiftPeriod(day(new Date(2026, 10, 1)), -1).anchor)).toBe('2026-10-31');
    expect(dayKey(shiftPeriod(day(new Date(2026, 9, 31)), 1).anchor)).toBe('2026-11-01');
  });

  it('moves a week by seven days', () => {
    expect(dayKey(shiftPeriod(week(SUNDAY), -1).anchor)).toBe('2026-10-25');
    expect(dayKey(shiftPeriod(week(new Date(2026, 9, 26)), 1).anchor)).toBe('2026-11-02');
  });

  it('moves a month to the first of the month before or after, across a year end', () => {
    expect(dayKey(shiftPeriod(month(new Date(2026, 0, 20)), -1).anchor)).toBe('2025-12-01');
    expect(dayKey(shiftPeriod(month(new Date(2026, 11, 5)), 1).anchor)).toBe('2027-01-01');
  });

  it('does not skip a short month when stepping back from the 31st', () => {
    expect(dayKey(shiftPeriod(month(new Date(2026, 2, 31)), -1).anchor)).toBe('2026-02-01');
    expect(dayKey(shiftPeriod(month(new Date(2026, 0, 31)), 1).anchor)).toBe('2026-02-01');
  });

  it('keeps the kind and leaves the trend where it is', () => {
    expect(shiftPeriod(week(SUNDAY), -1).kind).toBe('week');
    const fixed = trend(SUNDAY);
    expect(shiftPeriod(fixed, -1)).toBe(fixed);
  });
});

describe('isCurrent', () => {
  it('is true for the day, week, month and trend that hold now', () => {
    for (const kind of PERIOD_KINDS) {
      expect(isCurrent({ kind, anchor: SUNDAY }, SUNDAY)).toBe(true);
    }
  });

  it('is false for the windows before and after', () => {
    expect(isCurrent(day(new Date(2026, 9, 31)), SUNDAY)).toBe(false);
    expect(isCurrent(week(new Date(2026, 9, 25)), SUNDAY)).toBe(false);
    expect(isCurrent(month(new Date(2026, 9, 31)), SUNDAY)).toBe(false);
    expect(isCurrent(week(new Date(2026, 10, 2)), SUNDAY)).toBe(false);
  });

  it('moves to the next week at midnight after Sunday', () => {
    const lastWeek = week(new Date(2026, 9, 26));
    expect(isCurrent(lastWeek, new Date(2026, 10, 1, 23, 59, 59))).toBe(true);
    expect(isCurrent(lastWeek, new Date(2026, 10, 2, 0, 0))).toBe(false);
  });
});

describe('canGoForward', () => {
  it('is false at the window that holds now, because nothing is logged in the future', () => {
    expect(canGoForward(day(SUNDAY), SUNDAY)).toBe(false);
    expect(canGoForward(week(SUNDAY), SUNDAY)).toBe(false);
    expect(canGoForward(month(SUNDAY), SUNDAY)).toBe(false);
  });

  it('is true for any earlier window', () => {
    expect(canGoForward(day(new Date(2026, 9, 31)), SUNDAY)).toBe(true);
    expect(canGoForward(week(new Date(2026, 9, 25)), SUNDAY)).toBe(true);
    expect(canGoForward(month(new Date(2026, 9, 31)), SUNDAY)).toBe(true);
  });

  it('is true on the first moment after a window ends', () => {
    expect(canGoForward(week(new Date(2026, 9, 26)), new Date(2026, 10, 2, 0, 0))).toBe(true);
    expect(canGoForward(week(new Date(2026, 9, 26)), new Date(2026, 10, 1, 23, 59))).toBe(false);
  });

  it('is false for the trend, which has no next window', () => {
    expect(canGoForward(trend(new Date(2026, 0, 1)), SUNDAY)).toBe(false);
  });
});

describe('switchKind', () => {
  const past = week(new Date(2026, 8, 14));

  it('keeps the date being looked at when changing between day, week and month', () => {
    expect(switchKind(past, 'day', SUNDAY)).toEqual(day(past.anchor));
    expect(switchKind(past, 'month', SUNDAY)).toEqual(month(past.anchor));
    expect(switchKind(month(past.anchor), 'week', SUNDAY)).toEqual(week(past.anchor));
  });

  it('starts the trend from today', () => {
    expect(switchKind(past, 'trend', SUNDAY)).toEqual(trend(SUNDAY));
  });

  it('comes back from the trend to the period that holds today', () => {
    expect(switchKind(trend(SUNDAY), 'week', SUNDAY)).toEqual(week(SUNDAY));
  });
});

describe('defaultBar', () => {
  const none = (count: number) => Array<boolean>(count).fill(false);

  it('selects the bar that holds now', () => {
    expect(defaultBar(periodLayout(day(SUNDAY)), SUNDAY, none(1))).toBe(0);
    expect(defaultBar(periodLayout(week(SUNDAY)), SUNDAY, none(7))).toBe(6);
    expect(
      defaultBar(periodLayout(week(new Date(2026, 9, 28))), new Date(2026, 9, 28, 9), none(7)),
    ).toBe(2);
    expect(defaultBar(periodLayout(month(SUNDAY)), SUNDAY, none(30))).toBe(0);
    expect(defaultBar(periodLayout(trend(SUNDAY)), SUNDAY, none(TREND_WEEKS))).toBe(
      TREND_WEEKS - 1,
    );
  });

  it('selects the latest bar with data in a window that is over', () => {
    const october = periodLayout(week(new Date(2026, 9, 14)));
    expect(defaultBar(october, SUNDAY, [true, false, true, false, false, false, false])).toBe(2);
  });

  it('falls back to the last bar when a finished window has no data', () => {
    const october = periodLayout(week(new Date(2026, 9, 14)));
    expect(defaultBar(october, SUNDAY, none(7))).toBe(6);
  });
});
