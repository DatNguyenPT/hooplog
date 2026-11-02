import type { TFunction } from 'i18next';

import { summaryEntries, type DataSummary } from '../domain/backup';

/** "3 shooting sessions, 120 shots": what a summary holds, or "no logged data" when it holds nothing. */
export function summaryText(t: TFunction, summary: DataSummary): string {
  const entries = summaryEntries(summary);
  if (entries.length === 0) return t('data.nothing');
  return entries
    .map(({ key, count }) => t(`data.count.${key}`, { count }))
    .join(t('data.separator'));
}
