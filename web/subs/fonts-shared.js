/**
 * Shared font catalog and IndexedDB prefs for /subs and /font.
 * Loaded via <script src="fonts-shared.js"> before page scripts.
 */
(function initSubsFonts(global) {
  const DB_NAME = 'subs-project';
  const DB_VERSION = 6;
  const VIDEO_STORE = 'videos';
  const STYLE_STORE = 'styles';
  const CUE_STORE = 'cues';
  const POSITION_STORE = 'positions';
  const FONT_PREFS_STORE = 'fontPrefs';
  const FONT_PREFS_ID = 'enabled';
  const UI_PREFS_STORE = 'uiPrefs';
  const UI_SECTIONS_ID = 'sections';

  const DEFAULT_SECTIONS_OPEN = {
    audio: true,
    saved: true,
    positions: true,
    styles: true,
    cues: true,
    preview: true,
    render: true,
  };

  /** Shown in the style editor until the user picks more on /font */
  const DEFAULT_ENABLED_FAMILIES = [
    'Montserrat',
    'Bebas Neue Cyrillic',
    'Inter',
    'Roboto',
    'Oswald',
    'Golos Text',
  ];

  const SUBTITLE_FONTS = [
    {
      family: 'Advent Pro',
      regular: 'advent-pro-400.ttf',
      bold: 'advent-pro-700.ttf',
    },
    {
      family: 'Adventure Indiana Jones',
      regular: 'adventure-indiana-jones-400.ttf',
      bold: 'adventure-indiana-jones-400.ttf',
    },
    {
      family: 'Alegreya Sans',
      regular: 'alegreya-sans-400.ttf',
      bold: 'alegreya-sans-700.ttf',
    },
    {
      family: 'Alumni Sans',
      regular: 'alumni-sans-400.ttf',
      bold: 'alumni-sans-700.ttf',
    },
    { family: 'Arsenal', regular: 'arsenal-400.ttf', bold: 'arsenal-700.ttf' },
    {
      family: 'Bebas Neue Cyrillic',
      regular: 'bebas-neue-cyrillic-400.ttf',
      bold: 'bebas-neue-cyrillic-400.ttf',
    },
    {
      family: 'Bebas Neue',
      regular: 'bebas-neue-400.ttf',
      bold: 'bebas-neue-400.ttf',
    },
    { family: 'Bitter', regular: 'bitter-400.ttf', bold: 'bitter-700.ttf' },
    {
      family: 'Comfortaa',
      regular: 'comfortaa-400.ttf',
      bold: 'comfortaa-700.ttf',
    },
    {
      family: 'Commissioner',
      regular: 'commissioner-400.ttf',
      bold: 'commissioner-700.ttf',
    },
    {
      family: 'Cormorant Garamond',
      regular: 'cormorant-garamond-400.ttf',
      bold: 'cormorant-garamond-700.ttf',
    },
    {
      family: 'EB Garamond',
      regular: 'eb-garamond-400.ttf',
      bold: 'eb-garamond-700.ttf',
    },
    { family: 'Exo 2', regular: 'exo-2-400.ttf', bold: 'exo-2-700.ttf' },
    {
      family: 'Finlandica',
      regular: 'finlandica-400.ttf',
      bold: 'finlandica-700.ttf',
    },
    {
      family: 'Fira Sans',
      regular: 'fira-sans-400.ttf',
      bold: 'fira-sans-700.ttf',
    },
    {
      family: 'Fira Sans Extra Condensed',
      regular: 'fira-sans-extra-condensed-400.ttf',
      bold: 'fira-sans-extra-condensed-700.ttf',
    },
    {
      family: 'Geologica',
      regular: 'geologica-400.ttf',
      bold: 'geologica-700.ttf',
    },
    {
      family: 'Golos Text',
      regular: 'golos-text-400.ttf',
      bold: 'golos-text-700.ttf',
    },
    {
      family: 'Great Vibes',
      regular: 'great-vibes-400.ttf',
      bold: 'great-vibes-400.ttf',
    },
    {
      family: 'Headliner No. 45',
      regular: 'headliner-no-45-400.ttf',
      bold: 'headliner-no-45-400.ttf',
    },
    {
      family: 'IBM Plex Sans',
      regular: 'ibm-plex-sans-400.ttf',
      bold: 'ibm-plex-sans-700.ttf',
    },
    {
      family: 'IBM Plex Serif',
      regular: 'ibm-plex-serif-400.ttf',
      bold: 'ibm-plex-serif-700.ttf',
    },
    { family: 'Inter', regular: 'inter-400.ttf', bold: 'inter-700.ttf' },
    { family: 'Jost', regular: 'jost-400.ttf', bold: 'jost-700.ttf' },
    { family: 'KULAG', regular: 'kulag-400.otf', bold: 'kulag-400.otf' },
    {
      family: 'KULAG Outline',
      regular: 'kulag-outline-400.otf',
      bold: 'kulag-outline-400.otf',
    },
    { family: 'Lack', regular: 'lack-400.otf', bold: 'lack-700.otf' },
    {
      family: 'Literata',
      regular: 'literata-400.ttf',
      bold: 'literata-700.ttf',
    },
    { family: 'Manrope', regular: 'manrope-400.ttf', bold: 'manrope-700.ttf' },
    {
      family: 'Merriweather',
      regular: 'merriweather-400.ttf',
      bold: 'merriweather-700.ttf',
    },
    {
      family: 'Montserrat',
      regular: 'montserrat-400.ttf',
      bold: 'montserrat-700.ttf',
    },
    {
      family: 'Noto Sans',
      regular: 'noto-sans-400.ttf',
      bold: 'noto-sans-700.ttf',
    },
    {
      family: 'Nunito Sans',
      regular: 'nunito-sans-400.ttf',
      bold: 'nunito-sans-700.ttf',
    },
    { family: 'Oi', regular: 'oi-400.ttf', bold: 'oi-400.ttf' },
    { family: 'Onest', regular: 'onest-400.ttf', bold: 'onest-700.ttf' },
    {
      family: 'Open Sans',
      regular: 'open-sans-400.ttf',
      bold: 'open-sans-700.ttf',
    },
    { family: 'Oswald', regular: 'oswald-400.ttf', bold: 'oswald-700.ttf' },
    {
      family: 'Playfair Display',
      regular: 'playfair-display-400.ttf',
      bold: 'playfair-display-700.ttf',
    },
    { family: 'PT Sans', regular: 'pt-sans-400.ttf', bold: 'pt-sans-700.ttf' },
    {
      family: 'PT Sans Narrow',
      regular: 'pt-sans-narrow-400.ttf',
      bold: 'pt-sans-narrow-700.ttf',
    },
    {
      family: 'PT Serif',
      regular: 'pt-serif-400.ttf',
      bold: 'pt-serif-700.ttf',
    },
    {
      family: 'Rimma Sans',
      regular: 'rimma-sans-400.ttf',
      bold: 'rimma-sans-400.ttf',
    },
    { family: 'Roboto', regular: 'roboto-400.ttf', bold: 'roboto-700.ttf' },
    {
      family: 'Roboto Condensed',
      regular: 'roboto-condensed-400.ttf',
      bold: 'roboto-condensed-700.ttf',
    },
    {
      family: 'Roboto Slab',
      regular: 'roboto-slab-400.ttf',
      bold: 'roboto-slab-700.ttf',
    },
    { family: 'Rubik', regular: 'rubik-400.ttf', bold: 'rubik-700.ttf' },
    {
      family: 'Russo One',
      regular: 'russo-one-400.ttf',
      bold: 'russo-one-400.ttf',
    },
    {
      family: 'Sofia Sans Extra Condensed',
      regular: 'sofia-sans-extra-condensed-400.ttf',
      bold: 'sofia-sans-extra-condensed-700.ttf',
    },
    {
      family: 'Spectral',
      regular: 'spectral-400.ttf',
      bold: 'spectral-700.ttf',
    },
    {
      family: 'Source Sans 3',
      regular: 'source-sans-3-400.ttf',
      bold: 'source-sans-3-700.ttf',
    },
    { family: 'Tablon', regular: 'tablon-400.ttf', bold: 'tablon-700.ttf' },
    { family: 'Tektur', regular: 'tektur-400.ttf', bold: 'tektur-700.ttf' },
    { family: 'Ubuntu', regular: 'ubuntu-400.ttf', bold: 'ubuntu-700.ttf' },
    {
      family: 'Ubuntu Condensed',
      regular: 'ubuntu-condensed-400.ttf',
      bold: 'ubuntu-condensed-400.ttf',
    },
    {
      family: 'Unbounded',
      regular: 'unbounded-400.ttf',
      bold: 'unbounded-700.ttf',
    },
    {
      family: 'Ustroke',
      regular: 'ustroke-400.ttf',
      bold: 'ustroke-400.ttf',
    },
    {
      family: 'Yanone Kaffeesatz',
      regular: 'yanone-kaffeesatz-400.ttf',
      bold: 'yanone-kaffeesatz-700.ttf',
    },
  ];

  const FAMILY_TO_FONT = new Map(
    SUBTITLE_FONTS.map((font) => [font.family, font]),
  );
  const VALID_FAMILIES = new Set(FAMILY_TO_FONT.keys());

  let dbPromise;

  function openDb() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        const tx = request.transaction;
        if (!db.objectStoreNames.contains(VIDEO_STORE)) {
          const store = db.createObjectStore(VIDEO_STORE, { keyPath: 'hash' });
          store.createIndex('createdAt', 'createdAt');
        }
        if (!db.objectStoreNames.contains(STYLE_STORE)) {
          const store = db.createObjectStore(STYLE_STORE, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt');
        }
        if (!db.objectStoreNames.contains(CUE_STORE)) {
          const store = db.createObjectStore(CUE_STORE, { keyPath: 'id' });
          store.createIndex('start', 'start');
          store.createIndex('styleId', 'styleId');
          store.createIndex('videoHash', 'videoHash', { unique: false });
        } else if (tx) {
          const cueStore = tx.objectStore(CUE_STORE);
          if (!cueStore.indexNames.contains('videoHash')) {
            cueStore.createIndex('videoHash', 'videoHash', { unique: false });
          }
        }
        if (!db.objectStoreNames.contains(POSITION_STORE)) {
          const store = db.createObjectStore(POSITION_STORE, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt');
        }
        if (!db.objectStoreNames.contains(FONT_PREFS_STORE)) {
          db.createObjectStore(FONT_PREFS_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(UI_PREFS_STORE)) {
          db.createObjectStore(UI_PREFS_STORE, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return dbPromise;
  }

  function sanitizeFamilies(families) {
    if (!Array.isArray(families)) return [];
    const seen = new Set();
    const result = [];
    for (const name of families) {
      if (typeof name !== 'string') continue;
      const trimmed = name.trim();
      if (!VALID_FAMILIES.has(trimmed) || seen.has(trimmed)) continue;
      seen.add(trimmed);
      result.push(trimmed);
    }
    return result;
  }

  async function readEnabledFontFamilies() {
    const db = await openDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(FONT_PREFS_STORE, 'readonly');
      const request = transaction
        .objectStore(FONT_PREFS_STORE)
        .get(FONT_PREFS_ID);

      request.onsuccess = () => {
        const stored = sanitizeFamilies(request.result?.families);
        resolve(stored.length > 0 ? stored : [...DEFAULT_ENABLED_FAMILIES]);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async function writeEnabledFontFamilies(families) {
    const db = await openDb();
    const record = {
      id: FONT_PREFS_ID,
      families: sanitizeFamilies(families),
      updatedAt: new Date().toISOString(),
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(FONT_PREFS_STORE, 'readwrite');
      transaction.objectStore(FONT_PREFS_STORE).put(record);
      transaction.oncomplete = () => resolve(record.families);
      transaction.onerror = () => reject(transaction.error);
    });
  }

  function getFontsForFamilies(familyNames) {
    const names = sanitizeFamilies(familyNames);
    return names.map((family) => FAMILY_TO_FONT.get(family)).filter(Boolean);
  }

  function isArchived(record) {
    return Boolean(record?.archivedAt);
  }

  function isVideoArchived(video) {
    return isArchived(video);
  }

  function sortByUpdatedDesc(items) {
    return items.slice().sort((a, b) => {
      const aTime = a.updatedAt || a.createdAt || a.archivedAt || '';
      const bTime = b.updatedAt || b.createdAt || b.archivedAt || '';
      return bTime.localeCompare(aTime);
    });
  }

  async function readAllFromStore(storeName) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const request = tx.objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function getFromStore(storeName, id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const request = tx.objectStore(storeName).get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async function putToStore(storeName, record) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(record);
      tx.oncomplete = () => resolve(record);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function patchInStore(storeName, id, patch) {
    const record = await getFromStore(storeName, id);
    if (!record) return null;

    const next = { ...record, ...patch };
    if (patch.archivedAt === null) delete next.archivedAt;
    await putToStore(storeName, next);
    return next;
  }

  async function readActiveFromStore(storeName) {
    const items = await readAllFromStore(storeName);
    return items
      .filter((item) => !isArchived(item))
      .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  }

  async function readArchivedFromStore(storeName) {
    const items = await readAllFromStore(storeName);
    return sortByUpdatedDesc(items.filter((item) => isArchived(item)));
  }

  async function archiveInStore(storeName, id) {
    const now = new Date().toISOString();
    return patchInStore(storeName, id, {
      archivedAt: now,
      updatedAt: now,
    });
  }

  function formatRuDateTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  async function readAllVideos() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(VIDEO_STORE, 'readonly');
      const request = tx.objectStore(VIDEO_STORE).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function getVideoByHash(hash) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(VIDEO_STORE, 'readonly');
      const request = tx.objectStore(VIDEO_STORE).get(hash);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async function putVideo(video) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(VIDEO_STORE, 'readwrite');
      tx.objectStore(VIDEO_STORE).put(video);
      tx.oncomplete = () => resolve(video);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function patchVideoByHash(hash, patch) {
    const video = await getVideoByHash(hash);
    if (!video) return null;

    const next = { ...video, ...patch };
    if (patch.archivedAt === null) delete next.archivedAt;
    await putVideo(next);
    return next;
  }

  async function readActiveVideos() {
    const videos = await readAllVideos();
    return videos
      .filter((video) => !isVideoArchived(video))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async function readArchivedVideos() {
    const videos = await readAllVideos();
    return sortByUpdatedDesc(videos.filter((video) => isVideoArchived(video)));
  }

  async function readAllStyles() {
    return readAllFromStore(STYLE_STORE);
  }

  async function readActiveStyles() {
    return readActiveFromStore(STYLE_STORE);
  }

  async function readArchivedStyles() {
    return readArchivedFromStore(STYLE_STORE);
  }

  async function getStyleById(id) {
    return getFromStore(STYLE_STORE, id);
  }

  async function putStyle(style) {
    return putToStore(STYLE_STORE, style);
  }

  async function archiveStyleById(id) {
    return archiveInStore(STYLE_STORE, id);
  }

  async function readAllPositions() {
    return readAllFromStore(POSITION_STORE);
  }

  async function readActivePositions() {
    return readActiveFromStore(POSITION_STORE);
  }

  async function readArchivedPositions() {
    return readArchivedFromStore(POSITION_STORE);
  }

  async function getPositionById(id) {
    return getFromStore(POSITION_STORE, id);
  }

  async function putPosition(position) {
    return putToStore(POSITION_STORE, position);
  }

  async function archivePositionById(id) {
    return archiveInStore(POSITION_STORE, id);
  }

  async function archiveVideoByHash(hash) {
    const now = new Date().toISOString();
    return patchVideoByHash(hash, { archivedAt: now, updatedAt: now });
  }

  async function touchVideoUpdatedAt(hash) {
    return patchVideoByHash(hash, { updatedAt: new Date().toISOString() });
  }

  function sanitizeSectionsOpen(open) {
    if (!open || typeof open !== 'object') return { ...DEFAULT_SECTIONS_OPEN };
    const result = { ...DEFAULT_SECTIONS_OPEN };
    for (const key of Object.keys(DEFAULT_SECTIONS_OPEN)) {
      if (typeof open[key] === 'boolean') result[key] = open[key];
    }
    return result;
  }

  async function readEditorSectionPrefs() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(UI_PREFS_STORE, 'readonly');
      const request = tx.objectStore(UI_PREFS_STORE).get(UI_SECTIONS_ID);
      request.onsuccess = () => {
        resolve(sanitizeSectionsOpen(request.result?.open));
      };
      request.onerror = () => reject(request.error);
    });
  }

  async function writeEditorSectionPrefs(open) {
    const db = await openDb();
    const record = {
      id: UI_SECTIONS_ID,
      open: sanitizeSectionsOpen(open),
      updatedAt: new Date().toISOString(),
    };
    return new Promise((resolve, reject) => {
      const tx = db.transaction(UI_PREFS_STORE, 'readwrite');
      tx.objectStore(UI_PREFS_STORE).put(record);
      tx.oncomplete = () => resolve(record.open);
      tx.onerror = () => reject(tx.error);
    });
  }

  global.SubsFonts = {
    DB_NAME,
    DB_VERSION,
    VIDEO_STORE,
    STYLE_STORE,
    CUE_STORE,
    POSITION_STORE,
    FONT_PREFS_STORE,
    FONT_PREFS_ID,
    UI_PREFS_STORE,
    UI_SECTIONS_ID,
    DEFAULT_SECTIONS_OPEN,
    SUBTITLE_FONTS,
    DEFAULT_ENABLED_FAMILIES,
    VALID_FAMILIES,
    FAMILY_TO_FONT,
    openDb,
    readEnabledFontFamilies,
    writeEnabledFontFamilies,
    readEditorSectionPrefs,
    writeEditorSectionPrefs,
    getFontsForFamilies,
    sanitizeFamilies,
    isArchived,
    isVideoArchived,
    sortByUpdatedDesc,
    formatRuDateTime,
    readAllVideos,
    getVideoByHash,
    putVideo,
    patchVideoByHash,
    readActiveVideos,
    readArchivedVideos,
    archiveVideoByHash,
    touchVideoUpdatedAt,
    readAllStyles,
    readActiveStyles,
    readArchivedStyles,
    getStyleById,
    putStyle,
    archiveStyleById,
    readAllPositions,
    readActivePositions,
    readArchivedPositions,
    getPositionById,
    putPosition,
    archivePositionById,
  };
})(window);
