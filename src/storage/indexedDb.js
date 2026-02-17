// Minimal IndexedDB wrapper for the Gumball Tracker domain.
// This focuses on schema and opening the database; higher-level CRUD helpers
// will be added as features are implemented.

const DB_NAME = "gumball-tracker";
const DB_VERSION = 5;

let dbPromise;

export function initStorage() {
  if (!dbPromise) {
    dbPromise = openDatabase();
  }
  return dbPromise;
}

export function getDb() {
  return initStorage();
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      const tx = event.target.transaction;
      const oldVersion = event.oldVersion;

      // Migration: runCompletions "last" -> multi-record (PRD V2.7)
      if (oldVersion > 0 && oldVersion < 5 && db.objectStoreNames.contains("runCompletions")) {
        const store = tx.objectStore("runCompletions");
        const req = store.get("last");
        req.onsuccess = () => {
          const old = req.result;
          if (old && old.id === "last") {
            const newId = `completion-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
            store.put({
              id: newId,
              runId: old.runId,
              runName: old.runName,
              visitedCount: old.visitedCount,
              totalCount: old.totalCount,
              completedAt: old.completedAt,
              durationMinutes: old.durationMinutes,
            });
            store.delete("last");
          }
        };
      }

      // Locations store
      if (!db.objectStoreNames.contains("locations")) {
        const store = db.createObjectStore("locations", { keyPath: "id" });
        store.createIndex("status", "status", { unique: false });
      }

      // Runs store
      if (!db.objectStoreNames.contains("runs")) {
        db.createObjectStore("runs", { keyPath: "id" });
      }

      // Run-location links store (many-to-many)
      if (!db.objectStoreNames.contains("runLocations")) {
        const store = db.createObjectStore("runLocations", { keyPath: "id" });
        store.createIndex("runId", "runId", { unique: false });
        store.createIndex("locationId", "locationId", { unique: false });
      }

      // Visits store
      if (!db.objectStoreNames.contains("visits")) {
        const store = db.createObjectStore("visits", { keyPath: "id" });
        store.createIndex("locationId", "locationId", { unique: false });
        store.createIndex("runId", "runId", { unique: false });
        store.createIndex("visitedAt", "visitedAt", { unique: false });
      }

      // Run completions (PRD V2.1): last completed run for Dashboard
      if (!db.objectStoreNames.contains("runCompletions")) {
        db.createObjectStore("runCompletions", { keyPath: "id" });
      }

      // Active sessions (PRD V2.6): persist in-progress run for resume
      if (!db.objectStoreNames.contains("activeSessions")) {
        db.createObjectStore("activeSessions", { keyPath: "id" });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      // eslint-disable-next-line no-console
      console.log(
        `[IndexedDB] opened db.name=${db.name} db.version=${db.version} stores=[${Array.from(db.objectStoreNames).join(", ")}]`
      );
      resolve(db);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

// Generic helpers – specialised domain helpers will wrap these.

async function runTransaction(storeName, mode, operation) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let result;

    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);

    result = operation(store);
  });
}

export function putEntity(storeName, value) {
  return runTransaction(storeName, "readwrite", (store) => store.put(value));
}

export function deleteEntity(storeName, key) {
  return runTransaction(storeName, "readwrite", (store) => store.delete(key));
}

export async function getEntity(storeName, key) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllFromStore(storeName) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Bulk upsert items into a store in a single readwrite transaction.
 * Resolves when the transaction commits; rejects on tx.onerror/tx.onabort.
 * @param {string} storeName
 * @param {object[]} items
 * @returns {Promise<void>}
 */
export async function bulkUpsert(storeName, items) {
  if (!Array.isArray(items)) {
    throw new Error("bulkUpsert requires an array of items");
  }
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Transaction aborted"));
    for (const item of items) {
      store.put(item);
    }
  });
}

export async function countStore(storeName) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}


