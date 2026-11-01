import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { backupFileName, isBackupFileName, MAX_BACKUP_BYTES } from '../domain/backup';
import { BackupError } from '../domain/backupError';

/** The phone's files, share sheet and file picker: the only place the backup code touches them. */
export interface BackupFiles {
  /** Writes the backup into the app's cache and opens the share sheet for it. */
  share(text: string, dialogTitle: string): Promise<void>;
  /** Opens the file picker. The chosen file's text, or null when the player backs out. */
  pick(): Promise<string | null>;
  /** Deletes the copies `share` left in the cache. Never throws. */
  removeExports(): void;
}

function removeExports() {
  try {
    for (const entry of Paths.cache.list()) {
      if (!(entry instanceof File) || !isBackupFileName(entry.name)) continue;
      try {
        entry.delete();
      } catch {
        // The system clears the cache itself when space runs low.
      }
    }
  } catch {
    // Same: this is housekeeping, never a reason to fail what the player asked for.
  }
}

async function share(text: string, dialogTitle: string) {
  if (!(await Sharing.isAvailableAsync())) throw new BackupError('shareUnavailable');
  try {
    // The last export stays until the next one: the app the player shares to may still be reading it.
    removeExports();
    const file = new File(Paths.cache, backupFileName(new Date()));
    file.create({ overwrite: true });
    await file.write(text);
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      dialogTitle,
      UTI: 'public.json',
    });
  } catch (error) {
    throw new BackupError('exportFailed', { cause: error });
  }
}

async function pick(): Promise<string | null> {
  let picked: DocumentPicker.DocumentPickerResult;
  try {
    // Any type: file managers and cloud drives often label a .json file as plain text or binary.
    picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
  } catch (error) {
    throw new BackupError('unreadable', { cause: error });
  }
  const asset = picked.canceled ? undefined : picked.assets[0];
  if (!asset) return null;

  const copy = new File(asset.uri);
  try {
    if (Math.max(asset.size ?? 0, copy.size) > MAX_BACKUP_BYTES) throw new BackupError('tooLarge');
    return await copy.text();
  } catch (error) {
    throw error instanceof BackupError ? error : new BackupError('unreadable', { cause: error });
  } finally {
    // The picker made this copy in the cache. A file anywhere else is the player's own: leave it.
    try {
      if (copy.uri.startsWith(Paths.cache.uri) && copy.exists) copy.delete();
    } catch {
      // The system clears the cache itself when space runs low.
    }
  }
}

export const backupFiles: BackupFiles = { share, pick, removeExports };
