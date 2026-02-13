// Minimal IndexedDB wrapper for the Gumball Tracker domain.
// This focuses on schema and opening the database; higher-level CRUD helpers
// will be added as features are implemented.

const DB_NAME = "gumball-tracker";
const DB_VERSION = 2;

let dbPromise;

export function initStorage() {
  if (!dbPromise) {
    dbPromise = openDatabase();
  }
  return dbPromise;
}

export function getDb() {
  if (!dbPromise) {
    dbPromise = openDatabase();
  }
  return dbPromise;
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

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
    };

    request.onsuccess = () => {
      resolve(request.result);
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

export function getEntity(storeName, key) {
  return runTransaction(storeName, "readonly", (store) => store.get(key));
}

export function getAllFromStore(storeName) {
  return runTransaction(storeName, "readonly", (store) => store.getAll());
}


