export type ProjectStorageErrorKind = 'quota' | 'unavailable' | 'blocked' | 'serialization' | 'transient' | 'corrupt' | 'unknown';

export class ProjectStorageError extends Error {
  kind: ProjectStorageErrorKind;
  cause?: unknown;

  constructor(kind: ProjectStorageErrorKind, message: string, cause?: unknown) {
    super(message);
    this.name = 'ProjectStorageError';
    this.kind = kind;
    this.cause = cause;
  }
}

export type StorageHealth = {
  usage?: number;
  quota?: number;
  ratio?: number;
  persistent?: boolean;
  supported: boolean;
};

const DATABASE_NAME = 'cutroom-studio';
const STORE_NAME = 'projects';
const CURRENT_KEY = 'current';

export function classifyStorageError(error: unknown): ProjectStorageError {
  if (error instanceof ProjectStorageError) return error;
  const record = error && typeof error === 'object' ? error as { name?: unknown; message?: unknown; code?: unknown } : {};
  const name = typeof record.name === 'string' ? record.name : '';
  const message = typeof record.message === 'string' ? record.message : '';
  const code = typeof record.code === 'number' ? record.code : undefined;
  const lower = `${name} ${message}`.toLowerCase();
  if (name === 'QuotaExceededError' || code === 22 || code === 1014 || lower.includes('quota') || lower.includes('disk full')) {
    return new ProjectStorageError('quota', 'Browser storage is full. Your latest changes are still open in this tab but are not saved locally.', error);
  }
  if (name === 'SecurityError' || name === 'NotAllowedError' || name === 'InvalidStateError') {
    return new ProjectStorageError('unavailable', 'Local browser storage is unavailable. Your open work has not been erased.', error);
  }
  if (name === 'VersionError' || name === 'BlockedError') {
    return new ProjectStorageError('blocked', 'Another Cutroom tab is blocking local storage. Close the other tab, then retry.', error);
  }
  if (name === 'DataCloneError') {
    return new ProjectStorageError('serialization', 'One project item could not be saved. Download a backup before reloading.', error);
  }
  if (name === 'AbortError' || name === 'UnknownError') {
    return new ProjectStorageError('transient', 'The local save was interrupted. Your work remains open and can be retried.', error);
  }
  return new ProjectStorageError('unknown', message || 'The project could not be saved locally.', error);
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new ProjectStorageError('unavailable', 'This browser does not provide local project storage.'));
      return;
    }
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(classifyStorageError(error));
    };
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onerror = () => fail(request.error);
    request.onblocked = () => fail(new ProjectStorageError('blocked', 'Another Cutroom tab is blocking local storage. Close it, then retry.'));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => {
      const database = request.result;
      if (settled) {
        database.close();
        return;
      }
      settled = true;
      database.onversionchange = () => database.close();
      resolve(database);
    };
  });
}

export async function loadStoredProject(): Promise<unknown> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    let settled = false;
    let result: unknown;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      database.close();
      callback();
    };
    try {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(CURRENT_KEY);
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => finish(() => reject(classifyStorageError(request.error)));
      transaction.oncomplete = () => finish(() => resolve(result));
      transaction.onerror = () => finish(() => reject(classifyStorageError(transaction.error)));
      transaction.onabort = () => finish(() => reject(classifyStorageError(transaction.error ?? new DOMException('Storage transaction aborted.', 'AbortError'))));
    } catch (error) {
      finish(() => reject(classifyStorageError(error)));
    }
  });
}

export async function saveStoredProject(project: unknown) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      database.close();
      callback();
    };
    try {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const request = transaction.objectStore(STORE_NAME).put(project, CURRENT_KEY);
      request.onerror = () => finish(() => reject(classifyStorageError(request.error ?? transaction.error)));
      transaction.oncomplete = () => finish(resolve);
      transaction.onerror = () => finish(() => reject(classifyStorageError(transaction.error ?? request.error)));
      transaction.onabort = () => finish(() => reject(classifyStorageError(transaction.error ?? request.error ?? new DOMException('Storage transaction aborted.', 'AbortError'))));
    } catch (error) {
      finish(() => reject(classifyStorageError(error)));
    }
  });
}

export async function getStorageHealth(): Promise<StorageHealth> {
  if (typeof navigator === 'undefined' || !navigator.storage) return { supported: false };
  const [estimate, persistent] = await Promise.all([
    navigator.storage.estimate().catch(() => ({} as StorageEstimate)),
    navigator.storage.persisted?.().catch(() => false) ?? Promise.resolve(false),
  ]);
  const usage = typeof estimate.usage === 'number' ? estimate.usage : undefined;
  const quota = typeof estimate.quota === 'number' ? estimate.quota : undefined;
  return {
    supported: true,
    usage,
    quota,
    ratio: usage !== undefined && quota ? usage / quota : undefined,
    persistent,
  };
}

export async function requestPersistentStorage() {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
  return navigator.storage.persist();
}

export function storageNeedsAttention(health: StorageHealth, additionalBytes = 0) {
  if (!health.quota || health.usage === undefined) return false;
  const projected = health.usage + Math.max(0, additionalBytes);
  const headroom = health.quota - projected;
  return projected / health.quota >= 0.8 || headroom < Math.max(10 * 1024 * 1024, health.quota * 0.05);
}

export function formatStorageBytes(bytes: number | undefined) {
  if (bytes === undefined || !Number.isFinite(bytes)) return 'Unavailable';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit >= 2 ? 1 : 0)} ${units[unit]}`;
}
