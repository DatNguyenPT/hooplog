/** Why a backup, a restore or a delete failed, in terms the screen has a message for. */
export type BackupErrorKey =
  | 'notBackup'
  | 'newerVersion'
  | 'damaged'
  | 'tooLarge'
  | 'unreadable'
  | 'shareUnavailable'
  | 'exportFailed'
  | 'restoreFailed'
  | 'deleteFailed';

/** Thrown by the backup code; `key` picks the message shown to the player. */
export class BackupError extends Error {
  readonly key: BackupErrorKey;

  constructor(key: BackupErrorKey, options?: { cause?: unknown }) {
    super(key, options);
    this.name = 'BackupError';
    this.key = key;
  }
}

/** Any failure the screen shows: a known one as it is, anything else under the fallback message. */
export const backupErrorKey = (error: unknown, fallback: BackupErrorKey): BackupErrorKey =>
  error instanceof BackupError ? error.key : fallback;
