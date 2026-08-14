(function () {
  const DB_NAME = 'vlandivir-user-files';
  const DB_VERSION = 1;
  const STORE = 'files';
  let dbPromise;

  function openDb() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt');
          store.createIndex('origin', 'origin');
          store.createIndex('sourceApp', 'sourceApp');
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return dbPromise;
  }

  function stableId(file) {
    const url = typeof file.url === 'string' ? file.url : '';
    const sourceApp = typeof file.sourceApp === 'string' ? file.sourceApp : 'app';
    const origin = typeof file.origin === 'string' ? file.origin : 'file';
    const name = typeof file.name === 'string' ? file.name : 'file';
    return `${sourceApp}:${origin}:${url || name}`;
  }

  async function upsert(file) {
    if (!file || typeof file !== 'object') return null;

    const db = await openDb();
    const now = new Date().toISOString();
    const record = {
      ...file,
      id: file.id || stableId(file),
      createdAt: file.createdAt || now,
      updatedAt: now,
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve(record);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function list() {
    const db = await openDb();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).getAll();
      request.onsuccess = () => {
        const files = Array.isArray(request.result) ? request.result : [];
        files.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
        resolve(files);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async function get(id) {
    const db = await openDb();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async function remove(id) {
    const db = await openDb();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  window.UserFilesRegistry = {
    upsert,
    list,
    get,
    remove,
  };
})();
