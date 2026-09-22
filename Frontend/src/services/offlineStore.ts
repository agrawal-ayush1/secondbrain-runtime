/**
 * Offline Persistence Layer using IndexedDB for SecondBrain Runtime.
 * Durable browser storage for runtime snapshots, pending operations, offline events, and sync metadata.
 */

export interface RuntimeSnapshotData {
  id: string;
  timestamp: string;
  runtimeVersion: number;
  resources: any[];
  serviceGraph: any;
  workflows: any[];
  reservations: any[];
  events: any[];
}

export interface PendingOperation {
  operationId: string;
  type: string;
  timestamp: string;
  payload: any;
  status: 'pending' | 'completed' | 'failed';
  attempts: number;
}

export interface OfflineEvent {
  id: string;
  sequence: number;
  timestamp: string;
  type: string;
  workflowId?: string;
  resourceId?: string;
  raw: string;
  source: 'offline-runtime';
}

export interface SyncMetadata {
  id: string;
  lastSyncTime: string;
  runtimeVersion: number;
  mode: 'ONLINE' | 'OFFLINE RUNTIME' | 'SYNCING' | 'SYNCED';
  offlineStartTimestamp?: number;
}

const DB_NAME = 'SecondBrainRuntimeOfflineDB';
const DB_VERSION = 1;

class OfflineStore {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB is not supported in this environment.'));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = request.result;

        if (!db.objectStoreNames.contains('runtimeSnapshot')) {
          db.createObjectStore('runtimeSnapshot', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('pendingOperations')) {
          db.createObjectStore('pendingOperations', { keyPath: 'operationId' });
        }
        if (!db.objectStoreNames.contains('offlineEvents')) {
          db.createObjectStore('offlineEvents', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('syncMetadata')) {
          db.createObjectStore('syncMetadata', { keyPath: 'id' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this.dbPromise;
  }

  // --- Snapshot Store ---
  async saveSnapshot(snapshot: Omit<RuntimeSnapshotData, 'id'>): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('runtimeSnapshot', 'readwrite');
      const store = tx.objectStore('runtimeSnapshot');
      const data: RuntimeSnapshotData = { ...snapshot, id: 'latest' };
      const req = store.put(data);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async getLatestSnapshot(): Promise<RuntimeSnapshotData | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('runtimeSnapshot', 'readonly');
      const store = tx.objectStore('runtimeSnapshot');
      const req = store.get('latest');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  // --- Pending Operations Store ---
  async addPendingOperation(op: Omit<PendingOperation, 'status' | 'attempts'>): Promise<PendingOperation> {
    const db = await this.getDB();
    const fullOp: PendingOperation = {
      ...op,
      status: 'pending',
      attempts: 0,
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction('pendingOperations', 'readwrite');
      const store = tx.objectStore('pendingOperations');
      const req = store.put(fullOp);
      req.onsuccess = () => resolve(fullOp);
      req.onerror = () => reject(req.error);
    });
  }

  async getPendingOperations(): Promise<PendingOperation[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('pendingOperations', 'readonly');
      const store = tx.objectStore('pendingOperations');
      const req = store.getAll();
      req.onsuccess = () => {
        const ops: PendingOperation[] = req.result || [];
        resolve(ops.filter((op) => op.status === 'pending'));
      };
      req.onerror = () => reject(req.error);
    });
  }

  async markOperationCompleted(operationId: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('pendingOperations', 'readwrite');
      const store = tx.objectStore('pendingOperations');
      const req = store.get(operationId);
      req.onsuccess = () => {
        if (req.result) {
          const updated = { ...req.result, status: 'completed' };
          store.put(updated);
        }
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  }

  async clearCompletedOperations(): Promise<void> {
    const db = await this.getDB();
    const ops = await this.getPendingOperations();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('pendingOperations', 'readwrite');
      const store = tx.objectStore('pendingOperations');
      const allReq = store.getAll();
      allReq.onsuccess = () => {
        const all: PendingOperation[] = allReq.result || [];
        for (const op of all) {
          if (op.status === 'completed') {
            store.delete(op.operationId);
          }
        }
        resolve();
      };
      allReq.onerror = () => reject(allReq.error);
    });
  }

  // --- Offline Event Journal ---
  async addOfflineEvent(evt: Omit<OfflineEvent, 'source'>): Promise<OfflineEvent> {
    const db = await this.getDB();
    const fullEvt: OfflineEvent = {
      ...evt,
      source: 'offline-runtime',
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction('offlineEvents', 'readwrite');
      const store = tx.objectStore('offlineEvents');
      const req = store.put(fullEvt);
      req.onsuccess = () => resolve(fullEvt);
      req.onerror = () => reject(req.error);
    });
  }

  async getOfflineEvents(): Promise<OfflineEvent[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('offlineEvents', 'readonly');
      const store = tx.objectStore('offlineEvents');
      const req = store.getAll();
      req.onsuccess = () => {
        const events: OfflineEvent[] = req.result || [];
        events.sort((a, b) => a.sequence - b.sequence);
        resolve(events);
      };
      req.onerror = () => reject(req.error);
    });
  }

  // --- Sync Metadata ---
  async saveMetadata(meta: Partial<SyncMetadata>): Promise<SyncMetadata> {
    const db = await this.getDB();
    const existing = await this.getMetadata();
    const updated: SyncMetadata = {
      id: 'meta',
      lastSyncTime: meta.lastSyncTime || existing?.lastSyncTime || new Date().toISOString(),
      runtimeVersion: meta.runtimeVersion ?? existing?.runtimeVersion ?? 0,
      mode: meta.mode || existing?.mode || 'ONLINE',
      offlineStartTimestamp: meta.offlineStartTimestamp ?? existing?.offlineStartTimestamp,
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction('syncMetadata', 'readwrite');
      const store = tx.objectStore('syncMetadata');
      const req = store.put(updated);
      req.onsuccess = () => resolve(updated);
      req.onerror = () => reject(req.error);
    });
  }

  async getMetadata(): Promise<SyncMetadata | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('syncMetadata', 'readonly');
      const store = tx.objectStore('syncMetadata');
      const req = store.get('meta');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }
}

export const offlineStore = new OfflineStore();
