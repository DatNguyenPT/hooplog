import i18next from './index';

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(i18next.language, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** "Jan 5": for axis labels and week names, where the year is clear from context. */
export function formatShortDate(date: Date): string {
  return date.toLocaleDateString(i18next.language, { month: 'short', day: 'numeric' });
}

/** "1": the day of the month on a month's axis. */
export function formatDayOfMonth(date: Date): string {
  return date.toLocaleDateString(i18next.language, { day: 'numeric' });
}

/** "Sun": the weekday on a week's axis. */
export function formatWeekday(date: Date): string {
  return date.toLocaleDateString(i18next.language, { weekday: 'short' });
}

/** "Sun, Nov 1": the day being looked at, where the weekday helps to place it. */
export function formatWeekdayDate(date: Date): string {
  return date.toLocaleDateString(i18next.language, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** "November 2026". */
export function formatMonthYear(date: Date): string {
  return date.toLocaleDateString(i18next.language, { month: 'long', year: 'numeric' });
}

/** "Jan 5, 2026": for a date that may be from any year. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(i18next.language, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatPercent(value: number | null): string {
  return value === null ? i18next.t('session.fgEmpty') : `${Math.round(value)}%`;
}
