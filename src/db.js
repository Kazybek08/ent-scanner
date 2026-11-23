// Хранилище в памяти iPhone (IndexedDB). Всё остаётся на телефоне, без интернета и серверов.
const NAME = 'ent-scanner';
const VERSION = 1;
let dbPromise;

function open() {
  return (dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('students')) db.createObjectStore('students', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('tests')) db.createObjectStore('tests', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('results')) {
        const s = db.createObjectStore('results', { keyPath: 'id' });
        s.createIndex('testId', 'testId');
      }
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

async function run(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const s = tx.objectStore(store);
    let out;
    Promise.resolve(fn(s)).then(r => { out = r; });
    tx.oncomplete = () => resolve(out instanceof IDBRequest ? out.result : out);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const db = {
  all: store => run(store, 'readonly', s => s.getAll()),
  get: (store, key) => run(store, 'readonly', s => s.get(key)),
  put: (store, value) => run(store, 'readwrite', s => s.put(value)),
  putMany: (store, values) => run(store, 'readwrite', s => { for (const v of values) s.put(v); }),
  del: (store, key) => run(store, 'readwrite', s => s.delete(key)),
  byIndex: (store, index, value) => run(store, 'readonly', s => s.index(index).getAll(value)),
  countByIndex: (store, index, value) => run(store, 'readonly', s => s.index(index).count(value)),
};

export async function getSetting(key, fallback = null) {
  const r = await db.get('settings', key);
  return r ? r.value : fallback;
}
export const setSetting = (key, value) => db.put('settings', { key, value });

/** Просим систему не удалять данные при нехватке места (Safari разрешает это установленному на экран «Домой» приложению). */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persisted && await navigator.storage.persisted()) return true;
    return navigator.storage?.persist ? await navigator.storage.persist() : false;
  } catch { return false; }
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
