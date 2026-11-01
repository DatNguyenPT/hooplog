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
