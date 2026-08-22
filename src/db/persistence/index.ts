export type {
    DbStorageAdapter,
    PersistenceErrorCode,
    PersistenceState,
    PersistenceStatus,
    StorageAdapterKind,
    StoredDb,
} from './types';
export { PersistenceError } from './types';
export { createIndexedDbAdapter, IDB_NAME, IDB_STORE } from './indexedDbAdapter';
export {
    createLocalStorageAdapter,
    bytesToBase64,
    base64ToBytes,
    LS_CURRENT_KEY,
    LS_CURRENT_CRC_KEY,
    LS_PREVIOUS_KEY,
    LS_SOFT_LIMIT_CHARS,
} from './localStorageAdapter';
export { createMemoryAdapter, type MemoryAdapter } from './memoryAdapter';
export { selectStorageAdapter, type SelectedAdapter } from './selectAdapter';
export {
    configurePersistence,
    schedulePersist,
    flushPersist,
    detachPersistence,
    getPersistenceState,
    subscribePersistence,
    isPersistenceConfigured,
    resetPersistenceForTests,
    DEFAULT_PERSIST_DEBOUNCE_MS,
} from './scheduler';
