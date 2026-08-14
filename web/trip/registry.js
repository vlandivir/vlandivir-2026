(function () {
  const DB_NAME = 'vlandivir-trip-albums';
  const DB_VERSION = 1;
  const STORE = 'albums';
  let dbPromise;

  function openDb() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'secret' });
          store.createIndex('lastVisitedAt', 'lastVisitedAt');
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return dbPromise;
  }

  async function get(secret) {
    if (!secret) return null;
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(secret);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * @param {{
   *   secret: string,
   *   title?: string,
   *   isOwner?: boolean,
   *   lastVisitedAt?: string,
   *   visited?: boolean,
   * }} album
   * Pass `visited: true` (default) to bump lastVisitedAt; `visited: false` only
   * updates metadata (e.g. rename) without moving the album to the top.
   */
  async function remember(album) {
    if (!album || typeof album.secret !== 'string' || !album.secret) {
      return null;
    }
    const db = await openDb();
    const existing = await get(album.secret);
    const now = new Date().toISOString();
    const bumpVisit = album.visited !== false;
    const record = {
      secret: album.secret,
      title:
        typeof album.title === 'string' && album.title.trim()
          ? album.title.trim()
          : existing?.title || 'Album',
      isOwner: Boolean(album.isOwner || existing?.isOwner),
      lastVisitedAt:
        album.lastVisitedAt ||
        (bumpVisit ? now : existing?.lastVisitedAt) ||
        now,
      createdAt: existing?.createdAt || now,
      // Opening the album again brings it back to the list.
      dismissed: bumpVisit ? false : Boolean(existing?.dismissed),
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve(record);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function list({ includeDismissed = false } = {}) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).getAll();
      request.onsuccess = () => {
        let albums = Array.isArray(request.result) ? request.result : [];
        if (!includeDismissed) {
          albums = albums.filter((a) => !a.dismissed);
        }
        albums.sort((a, b) =>
          String(b.lastVisitedAt || '').localeCompare(
            String(a.lastVisitedAt || ''),
          ),
        );
        resolve(albums);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /** Hide from the list until the album is opened again. */
  async function dismiss(secret) {
    if (!secret) return;
    const existing = await get(secret);
    const now = new Date().toISOString();
    const record = {
      secret,
      title: existing?.title || 'Album',
      isOwner: Boolean(existing?.isOwner),
      lastVisitedAt: existing?.lastVisitedAt || now,
      createdAt: existing?.createdAt || now,
      dismissed: true,
    };
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve(record);
      tx.onerror = () => reject(tx.error);
    });
  }

  window.TripAlbumsRegistry = {
    remember,
    list,
    get,
    dismiss,
  };
})();
