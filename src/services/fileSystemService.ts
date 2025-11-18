// A simple key-value store using IndexedDB
const DB_NAME = 'FileSystemDB';
const STORE_NAME = 'handles';

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

async function set(key: string, value: any): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function get<T>(key: string): Promise<T | undefined> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error);
  });
}

// Specific functions for the directory handle
const DIRECTORY_HANDLE_KEY = 'studyDirectoryHandle';

export async function saveDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  await set(DIRECTORY_HANDLE_KEY, handle);
}

export async function getDirectoryHandle(): Promise<FileSystemDirectoryHandle | undefined> {
  return await get<FileSystemDirectoryHandle>(DIRECTORY_HANDLE_KEY);
}

export async function verifyPermission(handle: FileSystemDirectoryHandle, readWrite = false): Promise<boolean> {
  // FIX: FileSystemHandlePermissionDescriptor is not available in default TS libs.
  // Using an inline type for the options.
  const options: { mode?: 'read' | 'readwrite' } = {};
  if (readWrite) {
    options.mode = 'readwrite';
  }
  // Check if permission was already granted.
  // FIX: queryPermission is an experimental API and not on the default FileSystemDirectoryHandle type.
  if ((await (handle as any).queryPermission(options)) === 'granted') {
    return true;
  }
  // Request permission.
  // FIX: requestPermission is an experimental API and not on the default FileSystemDirectoryHandle type.
  if ((await (handle as any).requestPermission(options)) === 'granted') {
    return true;
  }
  // The user didn't grant permission.
  return false;
}
