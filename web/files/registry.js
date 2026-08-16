(function () {
  const DB_NAME = 'vlandivir-user-files';
  const DB_VERSION = 2;
  const STORE = 'files';
  const PAGES_STORE = 'pages';
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
        if (!db.objectStoreNames.contains(PAGES_STORE)) {
          const pages = db.createObjectStore(PAGES_STORE, { keyPath: 'id' });
          pages.createIndex('updatedAt', 'updatedAt');
          pages.createIndex('kind', 'kind');
        }

        if (request.oldVersion < 2 && db.objectStoreNames.contains(STORE)) {
          const tx = request.transaction;
          const files = tx.objectStore(STORE);
          const pages = tx.objectStore(PAGES_STORE);
          files.openCursor().onsuccess = (event) => {
            const cursor = event.target.result;
            if (!cursor) return;
            const file = cursor.value || {};
            const subs = String(file.id || '').match(/^subs:([a-f0-9]{24})/);
            const pageMatch = String(file.pageUrl || '').match(
              /\/(subs|gpx-route-png)(?:\/en)?\/([a-f0-9]{24})/,
            );
            const kind = subs ? 'subs' : pageMatch?.[1] === 'gpx-route-png' ? 'gpx' : '';
            const hash = subs?.[1] || pageMatch?.[2];
            if (kind && hash) {
              const pageUrl =
                kind === 'subs' ? `/subs/${hash}` : `/gpx-route-png/${hash}`;
              pages.put({
                id: `${kind}:${hash}`,
                kind,
                hash,
                title: file.name || hash,
                pageUrl: file.pageUrl || pageUrl,
                createdAt: file.createdAt || new Date().toISOString(),
                updatedAt: file.updatedAt || file.createdAt || new Date().toISOString(),
                comment: file.comment || '',
              });
            }
            cursor.continue();
          };
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

  async function upsertPage(page) {
    if (!page || typeof page !== 'object' || !page.id) return null;
    const db = await openDb();
    const now = new Date().toISOString();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PAGES_STORE, 'readwrite');
      const store = tx.objectStore(PAGES_STORE);
      const getReq = store.get(page.id);
      let record;
      getReq.onsuccess = () => {
        const existing = getReq.result || null;
        record = {
          ...existing,
          ...page,
          createdAt: existing?.createdAt || page.createdAt || now,
          updatedAt: page.updatedAt || now,
        };
        store.put(record);
      };
      tx.oncomplete = () => resolve(record || null);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function listPages() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PAGES_STORE, 'readonly');
      const request = tx.objectStore(PAGES_STORE).getAll();
      request.onsuccess = () => {
        const pages = Array.isArray(request.result) ? request.result : [];
        pages.sort((a, b) =>
          String(b.updatedAt || b.createdAt).localeCompare(
            String(a.updatedAt || a.createdAt),
          ),
        );
        resolve(pages);
      };
      request.onerror = () => reject(request.error);
    });
  }

  window.UserFilesRegistry = {
    upsert,
    list,
    get,
    remove,
  };

  window.UserPagesRegistry = {
    upsert: upsertPage,
    list: listPages,
  };
})();
