import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import '@/shared/i18n';
import type { BackupFiles } from '../data/backupFiles';
import type { BackupRepository } from '../data/backupRepository';
import { serializeBackup, type DataSummary } from '../domain/backup';
import { BackupError } from '../domain/backupError';
import { DataScreen } from './DataScreen';

const mockRepo: jest.Mocked<BackupRepository> = {
  summarize: jest.fn(),
  exportBackup: jest.fn(),
  restore: jest.fn(),
  deleteAll: jest.fn(),
};
const mockFiles: jest.Mocked<BackupFiles> = {
  share: jest.fn(),
  pick: jest.fn(),
  removeExports: jest.fn(),
};

jest.mock('../data/backupRepository', () => ({ useBackupRepository: () => mockRepo }));
// A getter, so the mock is read when the screen uses it: jest hoists this above `mockFiles`.
jest.mock('../data/backupFiles', () => ({
  get backupFiles() {
    return mockFiles;
  },
}));

const mockDismissTo = jest.fn();

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
    router: { dismissTo: (href: string) => mockDismissTo(href) },
  };
});

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: jest.requireActual('react-native').View,
}));

const none: DataSummary = {
  shootingSessions: 0,
  shots: 0,
  workoutSessions: 0,
  workoutSets: 0,
  plans: 0,
  customExercises: 0,
};
const phone: DataSummary = {
  shootingSessions: 2,
  shots: 30,
  workoutSessions: 1,
  workoutSets: 4,
  plans: 1,
  customExercises: 0,
};

// A real backup file: one shooting session with two shots.
const T = '2026-11-01T08:00:00.000Z';
const stamps = { created_at: T, updated_at: T, deleted_at: null };
const SESSION = '00000000-0000-4000-9000-000000000001';
const shot = (n: number) => ({
  id: `00000000-0000-4000-9000-00000000001${n}`,
  session_id: SESSION,
  taken_at: T,
  result: 'made',
  source: 'manual',
  confidence: null,
  corrected: 0,
  ...stamps,
});
const BACKUP_TEXT = serializeBackup(
  {
    profile: null,
    exercise: [],
    shooting_session: [{ id: SESSION, started_at: T, source: 'manual', ended_at: T, ...stamps }],
    shot: [shot(1), shot(2)],
    workout_session: [],
    workout_set: [],
    training_plan: [],
    plan_item: [],
  },
  T,
).text;

const SHARE_TITLE = 'Save your HoopLog backup';
const NOT_A_BACKUP = 'That file is not a HoopLog backup.';

/** The Alert the screen last opened: its title, its body and its buttons. */
function lastAlert(spy: jest.SpyInstance) {
  const [title, body, buttons] = spy.mock.calls.at(-1) ?? [];
  return {
    title: title as string,
    body: body as string,
    confirm: () =>
      act(async () =>
        buttons?.find((b: { style?: string }) => b.style === 'destructive')?.onPress(),
      ),
    cancelButton: buttons?.find((b: { style?: string }) => b.style === 'cancel'),
  };
}

beforeEach(() => {
  // RNTL waits run outside act(); React logs a harmless notice for our promise-driven state updates.
  const consoleError = console.error;
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (String(args[0]).includes('not configured to support act')) return;
    consoleError(...args);
  });
  mockDismissTo.mockClear();
  mockRepo.summarize.mockReset().mockResolvedValue(phone);
  mockRepo.exportBackup.mockReset().mockResolvedValue({ text: '{"file":1}', summary: phone });
  mockRepo.restore.mockReset().mockResolvedValue(undefined);
  mockRepo.deleteAll.mockReset().mockResolvedValue(undefined);
  mockFiles.share.mockReset().mockResolvedValue(undefined);
  mockFiles.pick.mockReset().mockResolvedValue(BACKUP_TEXT);
  mockFiles.removeExports.mockReset();
});

afterEach(() => jest.restoreAllMocks());

describe('Your data screen', () => {
  it('shows a loading indicator, then what is saved on the phone', async () => {
    let resolve!: (value: DataSummary) => void;
    mockRepo.summarize.mockReturnValue(new Promise<DataSummary>((r) => (resolve = r)));
    await render(<DataScreen />);
    expect(screen.getByLabelText('Loading…')).toBeTruthy();
    expect(screen.queryByLabelText('Export backup')).toBeNull();

    await act(async () => resolve(phone));
    expect(await screen.findByText('2 shooting sessions')).toBeTruthy();
    for (const line of ['30 shots', '1 workout', '4 sets', '1 training plan']) {
      expect(screen.getByText(line)).toBeTruthy();
    }
    expect(screen.queryByText(/custom exercise/)).toBeNull();
    expect(screen.queryByLabelText('Loading…')).toBeNull();
    expect(screen.getByLabelText('Export backup')).not.toBeDisabled();
    expect(screen.getByLabelText('Restore from a file')).not.toBeDisabled();
    expect(screen.getByLabelText('Delete all my data')).not.toBeDisabled();
  });

  it('says nothing is saved yet, and has nothing to export', async () => {
    mockRepo.summarize.mockResolvedValue(none);
    await render(<DataScreen />);
    expect(await screen.findByText(/Nothing saved yet/)).toBeTruthy();
    expect(screen.getByLabelText('Export backup')).toBeDisabled();
    // A backup can still be restored onto an empty phone, and the name can still be deleted.
    expect(screen.getByLabelText('Restore from a file')).not.toBeDisabled();
    expect(screen.getByLabelText('Delete all my data')).not.toBeDisabled();
  });

  it('shows the error state and retries', async () => {
    mockRepo.summarize.mockRejectedValueOnce(new Error('boom'));
    await render(<DataScreen />);
    expect(await screen.findByText('Something went wrong.')).toBeTruthy();
    expect(screen.queryByLabelText('Export backup')).toBeNull();

    await fireEvent.press(screen.getByLabelText('Try again'));
    expect(await screen.findByText('2 shooting sessions')).toBeTruthy();
  });
});

describe('exporting', () => {
  it('writes the backup, opens the share sheet for it and says it is made', async () => {
    await render(<DataScreen />);
    await fireEvent.press(await screen.findByLabelText('Export backup'));
    expect(await screen.findByText(/Backup created/)).toBeTruthy();
    expect(mockFiles.share).toHaveBeenCalledWith('{"file":1}', SHARE_TITLE);
    expect(mockRepo.restore).not.toHaveBeenCalled();
    expect(mockRepo.deleteAll).not.toHaveBeenCalled();
  });

  it('ignores a second tap while it works, and shows that it is working', async () => {
    let finish!: () => void;
    mockFiles.share.mockReturnValue(new Promise<void>((r) => (finish = r)));
    await render(<DataScreen />);
    const firstPress = fireEvent.press(await screen.findByLabelText('Export backup'));
    expect(await screen.findByText('Working…')).toBeTruthy();
    expect(screen.getByLabelText('Export backup')).toBeDisabled();
    expect(screen.getByLabelText('Restore from a file')).toBeDisabled();
    expect(screen.getByLabelText('Delete all my data')).toBeDisabled();

    await fireEvent.press(screen.getByLabelText('Export backup'));
    expect(mockRepo.exportBackup).toHaveBeenCalledTimes(1);

    await act(async () => finish());
    await firstPress;
    expect(await screen.findByText(/Backup created/)).toBeTruthy();
    expect(screen.queryByText('Working…')).toBeNull();
    expect(screen.getByLabelText('Export backup')).not.toBeDisabled();
  });

  it('says so when this phone cannot share files, then succeeds on a retry', async () => {
    mockFiles.share.mockRejectedValueOnce(new BackupError('shareUnavailable'));
    await render(<DataScreen />);
    await fireEvent.press(await screen.findByLabelText('Export backup'));
    expect(await screen.findByText('This phone cannot share files from the app.')).toBeTruthy();
    expect(screen.queryByText(/Backup created/)).toBeNull();

    await fireEvent.press(screen.getByLabelText('Export backup'));
    expect(await screen.findByText(/Backup created/)).toBeTruthy();
    expect(screen.queryByText('This phone cannot share files from the app.')).toBeNull();
  });

  it('says so when the backup cannot be made, and does not open the share sheet', async () => {
    mockRepo.exportBackup.mockRejectedValueOnce(new Error('disk'));
    await render(<DataScreen />);
    await fireEvent.press(await screen.findByLabelText('Export backup'));
    expect(
      await screen.findByText(
        'Could not create the backup. Nothing was changed. Please try again.',
      ),
    ).toBeTruthy();
    expect(mockFiles.share).not.toHaveBeenCalled();
  });
});

describe('restoring', () => {
  it('asks first, showing what the backup holds and what it would replace', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<DataScreen />);
    await fireEvent.press(await screen.findByLabelText('Restore from a file'));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1));

    const alert = lastAlert(alertSpy);
    expect(alert.title).toBe('Restore this backup?');
    expect(alert.body).toContain('This backup holds 1 shooting session, 2 shots.');
    expect(alert.body).toContain(
      'replaces what is on this phone now (2 shooting sessions, 30 shots, 1 workout, 4 sets, 1 training plan)',
    );
    expect(alert.body).toContain('Export first');
    expect(mockRepo.restore).not.toHaveBeenCalled();
    expect(alert.cancelButton?.onPress).toBeUndefined();
  });

  it('does not mention a replaced phone when the phone holds nothing', async () => {
    mockRepo.summarize.mockResolvedValue(none);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<DataScreen />);
    await fireEvent.press(await screen.findByLabelText('Restore from a file'));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1));
    expect(lastAlert(alertSpy).body).toBe(
      'This backup holds 1 shooting session, 2 shots.\n\nRestoring puts it on this phone.',
    );
  });

  it('restores once the player confirms, and shows the new counts', async () => {
    mockRepo.summarize
      .mockResolvedValueOnce(phone)
      .mockResolvedValue({ ...none, shootingSessions: 1, shots: 2 });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<DataScreen />);
    await fireEvent.press(await screen.findByLabelText('Restore from a file'));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1));
    await lastAlert(alertSpy).confirm();

    expect(await screen.findByText('Backup restored.')).toBeTruthy();
    expect(mockRepo.restore).toHaveBeenCalledTimes(1);
    expect(mockRepo.restore.mock.calls[0]?.[0].data.shot).toHaveLength(2);
    expect(await screen.findByText('1 shooting session')).toBeTruthy();
    expect(screen.queryByText('2 shooting sessions')).toBeNull();
  });

  it('says nothing when the player backs out of the file picker', async () => {
    mockFiles.pick.mockResolvedValue(null);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<DataScreen />);
    await fireEvent.press(await screen.findByLabelText('Restore from a file'));
    await waitFor(() => expect(mockFiles.pick).toHaveBeenCalledTimes(1));
    expect(alertSpy).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByLabelText('Restore from a file')).not.toBeDisabled();
  });

  it.each([
    ['a file that is not a backup', 'hello', NOT_A_BACKUP],
    [
      'a backup from a newer app',
      '{"app":"hooplog","format":99}',
      'That backup was made by a newer version of HoopLog. Update the app, then try again.',
    ],
    [
      'a backup with the wrong shape',
      '{"app":"hooplog","format":1,"exported_at":"x","data":{}}',
      'That backup file is damaged or incomplete, so nothing was changed.',
    ],
  ])('turns down %s without asking or changing anything', async (_name, text, message) => {
    mockFiles.pick.mockResolvedValue(text);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<DataScreen />);
    await fireEvent.press(await screen.findByLabelText('Restore from a file'));
    expect(await screen.findByText(message)).toBeTruthy();
    expect(alertSpy).not.toHaveBeenCalled();
    expect(mockRepo.restore).not.toHaveBeenCalled();
  });

  it('explains a file that is too large or cannot be opened', async () => {
    mockFiles.pick.mockRejectedValueOnce(new BackupError('tooLarge'));
    await render(<DataScreen />);
    await fireEvent.press(await screen.findByLabelText('Restore from a file'));
    expect(await screen.findByText('That file is too large to be a HoopLog backup.')).toBeTruthy();

    mockFiles.pick.mockRejectedValueOnce(new Error('permission'));
    await fireEvent.press(screen.getByLabelText('Restore from a file'));
    expect(
      await screen.findByText(
        'Could not open that file. Pick it again, or choose a different one.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('That file is too large to be a HoopLog backup.')).toBeNull();
  });

  it('tells the player their data is unchanged when the restore fails', async () => {
    mockRepo.restore.mockRejectedValueOnce(new BackupError('restoreFailed'));
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<DataScreen />);
    await fireEvent.press(await screen.findByLabelText('Restore from a file'));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1));
    await lastAlert(alertSpy).confirm();

    expect(
      await screen.findByText(
        'Could not restore that backup. Your data on this phone was not changed.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('Backup restored.')).toBeNull();
    expect(screen.getByText('2 shooting sessions')).toBeTruthy();
  });
});

describe('deleting everything', () => {
  it('asks first, and deletes nothing when the player cancels', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<DataScreen />);
    await fireEvent.press(await screen.findByLabelText('Delete all my data'));

    const alert = lastAlert(alertSpy);
    expect(alert.title).toBe('Delete all your data?');
    expect(alert.body).toContain('cannot be undone');
    expect(alert.cancelButton?.onPress).toBeUndefined();
    expect(mockRepo.deleteAll).not.toHaveBeenCalled();
    expect(mockDismissTo).not.toHaveBeenCalled();
  });

  it('deletes everything once the player confirms, clears the exports and goes home', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<DataScreen />);
    await fireEvent.press(await screen.findByLabelText('Delete all my data'));
    await lastAlert(alertSpy).confirm();

    await waitFor(() => expect(mockDismissTo).toHaveBeenCalledWith('/'));
    expect(mockRepo.deleteAll).toHaveBeenCalledTimes(1);
    expect(mockFiles.removeExports).toHaveBeenCalledTimes(1);
  });

  it('stays here and says so when the delete fails', async () => {
    mockRepo.deleteAll.mockRejectedValueOnce(new BackupError('deleteFailed'));
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<DataScreen />);
    await fireEvent.press(await screen.findByLabelText('Delete all my data'));
    await lastAlert(alertSpy).confirm();

    expect(
      await screen.findByText('Could not delete your data. Nothing was changed. Please try again.'),
    ).toBeTruthy();
    expect(mockDismissTo).not.toHaveBeenCalled();
    expect(mockFiles.removeExports).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Delete all my data')).not.toBeDisabled();
  });
});
