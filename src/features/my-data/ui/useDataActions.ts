import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';

import { backupFiles } from '../data/backupFiles';
import { useBackupRepository } from '../data/backupRepository';
import { isEmptySummary, parseBackup, summarizeBackup, type DataSummary } from '../domain/backup';
import { backupErrorKey, type BackupErrorKey } from '../domain/backupError';
import type { BackupFile } from '../domain/backupSchema';
import { summaryText } from './summaryText';

/** What the screen tells the player after an action: it worked, or why it did not. */
export type Notice =
  { type: 'exported' } | { type: 'restored' } | { type: 'failed'; key: BackupErrorKey };

/**
 * The three things the player can do with their data: export it, restore a backup, delete it all.
 * One at a time, and anything that replaces or removes data asks first.
 */
export function useDataActions(current: DataSummary, reload: () => void) {
  const { t } = useTranslation();
  const backups = useBackupRepository();
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const busy = useRef(false);

  const run = async (fallback: BackupErrorKey, action: () => Promise<Notice | null>) => {
    if (busy.current) return;
    busy.current = true;
    setWorking(true);
    setNotice(null);
    try {
      setNotice(await action());
    } catch (error) {
      setNotice({ type: 'failed', key: backupErrorKey(error, fallback) });
    } finally {
      busy.current = false;
      setWorking(false);
    }
  };

  const exportBackup = () =>
    run('exportFailed', async () => {
      const { text } = await backups.exportBackup();
      await backupFiles.share(text, t('data.shareTitle'));
      return { type: 'exported' };
    });

  const restore = (file: BackupFile) =>
    run('restoreFailed', async () => {
      await backups.restore(file);
      reload();
      return { type: 'restored' };
    });

  const confirmRestore = (file: BackupFile) => {
    const backup = summaryText(t, summarizeBackup(file.data));
    const body = isEmptySummary(current)
      ? t('data.restoreConfirmBodyEmptyPhone', { backup })
      : t('data.restoreConfirmBody', { backup, current: summaryText(t, current) });
    Alert.alert(t('data.restoreConfirmTitle'), body, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('data.restoreConfirm'), style: 'destructive', onPress: () => void restore(file) },
    ]);
  };

  const chooseBackup = () =>
    run('unreadable', async () => {
      const text = await backupFiles.pick();
      // Backing out of the picker is not a failure: nothing to say.
      if (text !== null) confirmRestore(parseBackup(text));
      return null;
    });

  const deleteAll = () =>
    run('deleteFailed', async () => {
      await backups.deleteAll();
      backupFiles.removeExports();
      // Home finds the profile gone and shows the welcome screen again.
      router.dismissTo('/');
      return null;
    });

  const confirmDelete = () =>
    Alert.alert(t('data.deleteConfirmTitle'), t('data.deleteConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('data.deleteConfirm'), style: 'destructive', onPress: () => void deleteAll() },
    ]);

  return { working, notice, exportBackup, chooseBackup, confirmDelete };
}
