import { useCallback } from 'react';

import { useLoad } from '@/shared/ui/useLoad';
import { useBackupRepository } from '../data/backupRepository';

/** What is saved on the phone, counted again whenever the screen gains focus. */
export function useDataSummary() {
  const backups = useBackupRepository();
  const load = useCallback(() => backups.summarize(), [backups]);
  return useLoad(load);
}
