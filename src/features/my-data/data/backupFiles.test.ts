import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';

import { MAX_BACKUP_BYTES } from '../domain/backup';
import { BackupError } from '../domain/backupError';
import { backupFiles } from './backupFiles';

// The phone's storage, in memory: uri -> text. The names start with "mock" so babel-jest lets the
// factories below use them.
const mockDisk = new Map<string, string>();
const mockBroken = { write: false, list: false };

jest.mock('expo-file-system', () => {
  const CACHE = 'file:///cache/';
  class File {
    readonly uri: string;
    constructor(base: string | { uri: string }, name = '') {
      this.uri = (typeof base === 'string' ? base : base.uri) + name;
    }
    get name() {
      return this.uri.split('/').pop() as string;
    }
    get exists() {
      return mockDisk.has(this.uri);
    }
    get size() {
      return Buffer.byteLength(mockDisk.get(this.uri) ?? '');
    }
    create({ overwrite = false } = {}) {
      if (mockDisk.has(this.uri) && !overwrite) throw new Error('exists');
      mockDisk.set(this.uri, '');
    }
    async write(text: string) {
      if (mockBroken.write) throw new Error('disk full');
      mockDisk.set(this.uri, text);
    }
    async text() {
      const text = mockDisk.get(this.uri);
      if (text === undefined) throw new Error('missing');
      return text;
    }
    delete() {
      if (!mockDisk.delete(this.uri)) throw new Error('missing');
    }
  }
  return {
    File,
    Paths: {
      cache: {
        uri: CACHE,
        // Like the real one: what is directly in the folder, not what is in folders below it.
        list: () => {
          if (mockBroken.list) throw new Error('no access');
          return [...mockDisk.keys()]
            .filter((uri) => uri.startsWith(CACHE) && !uri.slice(CACHE.length).includes('/'))
            .map((uri) => new File(uri));
        },
      },
    },
  };
});
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));

const isAvailable = jest.mocked(Sharing.isAvailableAsync);
const shareAsync = jest.mocked(Sharing.shareAsync);
const getDocument = jest.mocked(DocumentPicker.getDocumentAsync);

const EXPORT = 'file:///cache/hooplog-backup-2026-11-01.json';
const COPY = 'file:///cache/DocumentPicker/1/mine.json';
const choose = (uri: string, size?: number) =>
  ({ canceled: false, assets: [{ uri, name: 'mine.json', size }] }) as never;

async function keyOf(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    return error instanceof BackupError ? error.key : 'not a BackupError';
  }
  return 'no error';
}

beforeEach(() => {
  jest.useFakeTimers({ now: new Date(2026, 10, 1, 12) });
  mockDisk.clear();
  mockBroken.write = false;
  mockBroken.list = false;
  isAvailable.mockReset().mockResolvedValue(true);
  shareAsync.mockReset().mockResolvedValue(undefined);
  getDocument.mockReset();
});

afterEach(() => jest.useRealTimers());

describe('sharing a backup', () => {
  it('writes the file into the cache and opens the share sheet for it', async () => {
    await backupFiles.share('{"a":1}', 'Share backup');
    expect(mockDisk.get(EXPORT)).toBe('{"a":1}');
    expect(shareAsync).toHaveBeenCalledWith(EXPORT, {
      mimeType: 'application/json',
      dialogTitle: 'Share backup',
      UTI: 'public.json',
    });
  });

  it('clears earlier exports first, and only those', async () => {
    mockDisk.set('file:///cache/hooplog-backup-2026-10-30.json', 'old');
    mockDisk.set('file:///cache/notes.json', 'not ours');
    mockDisk.set('file:///cache/DocumentPicker/1/hooplog-backup-2026-10-31.json', 'in a folder');
    await backupFiles.share('{}', 'Share');
    expect([...mockDisk.keys()].sort()).toEqual([
      'file:///cache/DocumentPicker/1/hooplog-backup-2026-10-31.json',
      EXPORT,
      'file:///cache/notes.json',
    ]);
  });

  it('replaces the export of the same day', async () => {
    await backupFiles.share('first', 'Share');
    await backupFiles.share('second', 'Share');
    expect(mockDisk.get(EXPORT)).toBe('second');
  });

  it('still shares when the cache cannot be listed', async () => {
    mockBroken.list = true;
    await backupFiles.share('{}', 'Share');
    expect(shareAsync).toHaveBeenCalledTimes(1);
  });

  it('says so when this phone cannot share files, and writes nothing', async () => {
    isAvailable.mockResolvedValue(false);
    expect(await keyOf(() => backupFiles.share('{}', 'Share'))).toBe('shareUnavailable');
    expect(mockDisk.size).toBe(0);
    expect(shareAsync).not.toHaveBeenCalled();
  });

  it('reports a file that cannot be written, and does not open the share sheet', async () => {
    mockBroken.write = true;
    expect(await keyOf(() => backupFiles.share('{}', 'Share'))).toBe('exportFailed');
    expect(shareAsync).not.toHaveBeenCalled();
  });

  it('reports a share sheet that fails', async () => {
    shareAsync.mockRejectedValue(new Error('no app'));
    expect(await keyOf(() => backupFiles.share('{}', 'Share'))).toBe('exportFailed');
  });
});

describe('picking a backup', () => {
  it('reads the chosen file and deletes the picker’s copy', async () => {
    mockDisk.set(COPY, '{"hello":1}');
    getDocument.mockResolvedValue(choose(COPY, 11));
    expect(await backupFiles.pick()).toBe('{"hello":1}');
    expect(mockDisk.size).toBe(0);
    expect(getDocument).toHaveBeenCalledWith({ copyToCacheDirectory: true, multiple: false });
  });

  it('returns nothing when the player backs out', async () => {
    getDocument.mockResolvedValue({ canceled: true, assets: null } as never);
    expect(await backupFiles.pick()).toBeNull();
    getDocument.mockResolvedValue({ canceled: false, assets: [] } as never);
    expect(await backupFiles.pick()).toBeNull();
  });

  it('turns down a file the picker says is too big, and deletes its copy', async () => {
    mockDisk.set(COPY, '{}');
    getDocument.mockResolvedValue(choose(COPY, MAX_BACKUP_BYTES + 1));
    expect(await keyOf(() => backupFiles.pick())).toBe('tooLarge');
    expect(mockDisk.size).toBe(0);
  });

  it('measures the copy itself when the picker gives no size', async () => {
    mockDisk.set(COPY, 'x'.repeat(MAX_BACKUP_BYTES + 1));
    getDocument.mockResolvedValue(choose(COPY));
    expect(await keyOf(() => backupFiles.pick())).toBe('tooLarge');
    expect(mockDisk.size).toBe(0);
  });

  it('reports a file that cannot be read, and a picker that fails', async () => {
    getDocument.mockResolvedValue(choose(COPY, 5));
    expect(await keyOf(() => backupFiles.pick())).toBe('unreadable');
    getDocument.mockRejectedValue(new Error('no permission'));
    expect(await keyOf(() => backupFiles.pick())).toBe('unreadable');
  });

  it('never deletes a file that is not the picker’s copy', async () => {
    const theirs = 'file:///downloads/mine.json';
    mockDisk.set(theirs, '{"hello":1}');
    getDocument.mockResolvedValue(choose(theirs, 11));
    expect(await backupFiles.pick()).toBe('{"hello":1}');
    expect(mockDisk.get(theirs)).toBe('{"hello":1}');
  });
});

describe('removing exports', () => {
  it('deletes only the app’s own export files', () => {
    mockDisk.set(EXPORT, 'ours');
    mockDisk.set('file:///cache/hooplog-backup-2026-10-30.json', 'ours');
    mockDisk.set('file:///cache/backup.json', 'not ours');
    backupFiles.removeExports();
    expect([...mockDisk.keys()]).toEqual(['file:///cache/backup.json']);
  });

  it('never throws', () => {
    mockBroken.list = true;
    expect(() => backupFiles.removeExports()).not.toThrow();
  });
});
