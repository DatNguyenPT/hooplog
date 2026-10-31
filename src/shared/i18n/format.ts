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

export function formatPercent(value: number | null): string {
  return value === null ? i18next.t('session.fgEmpty') : `${Math.round(value)}%`;
}
