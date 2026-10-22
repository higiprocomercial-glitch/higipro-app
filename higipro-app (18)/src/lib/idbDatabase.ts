/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DatabaseState } from '../types';

const IDB_NAME = 'HigiProAppStateDB_v2';
const IDB_VERSION = 1;
const STATE_STORE = 'app_state';
const SNAPSHOTS_STORE = 'snapshots';

export interface SnapshotSummary {
  id: string;
  timestamp: number;
  dateString: string;
  label: string;
  stats: {
    clients: number;
    quotes: number;
    appointments: number;
    orders: number;
    transactions: number;
  };
}

interface StoredSnapshot extends SnapshotSummary {
  state: DatabaseState;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported in this environment'));
      return;
    }

    const request = window.indexedDB.open(IDB_NAME, IDB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STATE_STORE)) {
        db.createObjectStore(STATE_STORE);
      }
      if (!db.objectStoreNames.contains(SNAPSHOTS_STORE)) {
        const store = db.createObjectStore(SNAPSHOTS_STORE, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * Saves current database state to IndexedDB with 0 risk of 5MB localStorage quota limits.
 */
export async function saveToIndexedDB(state: DatabaseState): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STATE_STORE], 'readwrite');
      const store = tx.objectStore(STATE_STORE);
      const req = store.put(state, 'current_db');

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[IndexedDB] Could not save current database to IndexedDB:', err);
  }
}

/**
 * Loads current database state from IndexedDB.
 */
export async function loadFromIndexedDB(): Promise<DatabaseState | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STATE_STORE], 'readonly');
      const store = tx.objectStore(STATE_STORE);
      const req = store.get('current_db');

      req.onsuccess = () => {
        resolve(req.result || null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[IndexedDB] Could not load from IndexedDB:', err);
    return null;
  }
}

let lastSnapshotTimestamp = 0;

/**
 * Creates an automatic or manual snapshot with stats metadata.
 * Limits total snapshots to the last 15 to keep storage clean.
 */
export async function createIndexedDBSnapshot(state: DatabaseState, label: string = 'Backup Automático'): Promise<string | null> {
  const now = Date.now();
  // Don't auto-snapshot more frequently than once every 3 minutes unless manual label
  if (label.startsWith('Backup Automático') && (now - lastSnapshotTimestamp < 3 * 60 * 1000)) {
    return null;
  }

  try {
    const db = await openDB();
    const id = `snap_${now}_${Math.random().toString(36).substring(2, 7)}`;
    const snapshot: StoredSnapshot = {
      id,
      timestamp: now,
      dateString: new Date(now).toLocaleString('pt-BR'),
      label,
      stats: {
        clients: Array.isArray(state.clients) ? state.clients.length : 0,
        quotes: Array.isArray(state.quotes) ? state.quotes.length : 0,
        appointments: Array.isArray(state.appointments) ? state.appointments.length : 0,
        orders: Array.isArray(state.serviceOrders) ? state.serviceOrders.length : 0,
        transactions: Array.isArray(state.transactions) ? state.transactions.length : 0,
      },
      state,
    };

    lastSnapshotTimestamp = now;

    return new Promise((resolve, reject) => {
      const tx = db.transaction([SNAPSHOTS_STORE], 'readwrite');
      const store = tx.objectStore(SNAPSHOTS_STORE);
      store.put(snapshot);

      // Clean up old snapshots (keep 15 most recent)
      const index = store.index('timestamp');
      const countReq = index.count();
      countReq.onsuccess = () => {
        if (countReq.result > 15) {
          const openCursorReq = index.openCursor();
          let deleteCount = countReq.result - 15;
          openCursorReq.onsuccess = (e) => {
            const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
            if (cursor && deleteCount > 0) {
              cursor.delete();
              deleteCount--;
              cursor.continue();
            }
          };
        }
      };

      tx.oncomplete = () => resolve(id);
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[IndexedDB] Could not create snapshot:', err);
    return null;
  }
}

/**
 * Lists all available snapshots (summaries only, without heavy state).
 */
export async function listIndexedDBSnapshots(): Promise<SnapshotSummary[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([SNAPSHOTS_STORE], 'readonly');
      const store = tx.objectStore(SNAPSHOTS_STORE);
      const index = store.index('timestamp');
      const req = index.openCursor(null, 'prev'); // Most recent first
      const list: SnapshotSummary[] = [];

      req.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const val = cursor.value as StoredSnapshot;
          list.push({
            id: val.id,
            timestamp: val.timestamp,
            dateString: val.dateString,
            label: val.label,
            stats: val.stats,
          });
          cursor.continue();
        } else {
          resolve(list);
        }
      };

      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[IndexedDB] Could not list snapshots:', err);
    return [];
  }
}

/**
 * Restores the complete database state from a snapshot.
 */
export async function restoreIndexedDBSnapshot(snapshotId: string): Promise<DatabaseState | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([SNAPSHOTS_STORE], 'readonly');
      const store = tx.objectStore(SNAPSHOTS_STORE);
      const req = store.get(snapshotId);

      req.onsuccess = () => {
        if (req.result && req.result.state) {
          resolve(req.result.state);
        } else {
          resolve(null);
        }
      };

      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[IndexedDB] Could not restore snapshot:', err);
    return null;
  }
}

/**
 * Deletes a snapshot.
 */
export async function deleteIndexedDBSnapshot(snapshotId: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([SNAPSHOTS_STORE], 'readwrite');
      const store = tx.objectStore(SNAPSHOTS_STORE);
      const req = store.delete(snapshotId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[IndexedDB] Could not delete snapshot:', err);
  }
}
