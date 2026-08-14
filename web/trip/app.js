(function () {
  const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024;
  const STORAGE_ID = 'trip.contributorId';
  const STORAGE_NAME = 'trip.displayName';
  const CONCURRENCY = 2;

  const createView = document.getElementById('createView');
  const albumView = document.getElementById('albumView');
  const createForm = document.getElementById('createForm');
  const createError = document.getElementById('createError');
  const tripTitleInput = document.getElementById('tripTitleInput');
  const createNameInput = document.getElementById('createNameInput');
  const albumListSection = document.getElementById('albumListSection');
  const albumList = document.getElementById('albumList');
  const albumTitle = document.getElementById('albumTitle');
  const albumMeta = document.getElementById('albumMeta');
  const albumStatus = document.getElementById('albumStatus');
  const gallery = document.getElementById('gallery');
  const emptyGallery = document.getElementById('emptyGallery');
  const fileInput = document.getElementById('fileInput');
  const uploadPanel = document.getElementById('uploadPanel');
  const uploadQueue = document.getElementById('uploadQueue');
  const uploadSummary = document.getElementById('uploadSummary');
  const uploadSummaryPct = document.getElementById('uploadSummaryPct');
  const uploadOverallBar = document.getElementById('uploadOverallBar');
  const copyLinkBtn = document.getElementById('copyLinkBtn');
  const editTitleBtn = document.getElementById('editTitleBtn');
  const changeNameBtn = document.getElementById('changeNameBtn');
  const toggleDeletedBtn = document.getElementById('toggleDeletedBtn');
  const montageToggleBtn = document.getElementById('montageToggleBtn');
  const montagePanel = document.getElementById('montagePanel');
  const montageCloseBtn = document.getElementById('montageCloseBtn');
  const montageCreateForm = document.getElementById('montageCreateForm');
  const montageNameInput = document.getElementById('montageNameInput');
  const montageProjectsList = document.getElementById('montageProjectsList');
  const montageDetail = document.getElementById('montageDetail');
  const retryFailedBtn = document.getElementById('retryFailedBtn');
  const nameModal = document.getElementById('nameModal');
  const nameForm = document.getElementById('nameForm');
  const nameInput = document.getElementById('nameInput');
  const lightbox = document.getElementById('lightbox');
  const lightboxBody = document.getElementById('lightboxBody');
  const lightboxClose = document.getElementById('lightboxClose');
  const lightboxPrev = document.getElementById('lightboxPrev');
  const lightboxNext = document.getElementById('lightboxNext');
  const lightboxCounter = document.getElementById('lightboxCounter');
  const lightboxFields = document.getElementById('lightboxFields');
  const lightboxExif = document.getElementById('lightboxExif');
  const lightboxExifFields = document.getElementById('lightboxExifFields');
  const lightboxMetaTitle = document.getElementById('lightboxMetaTitle');
  const header = document.querySelector('[data-site-header]');
  const albumsRegistry = window.TripAlbumsRegistry;

  /** @type {{ id: string, secret: string, title: string, ownerContributorId: string, isAdmin: boolean } | null} */
  let trip = null;
  /** @type {Array<any>} */
  let media = [];
  let hideDeleted = true;
  /** @type {number} */
  let lightboxIndex = -1;
  /** @type {'gallery' | 'montage'} */
  let lightboxMode = 'gallery';
  /** @type {{ video: HTMLVideoElement, onTimeUpdate: () => void, onEnded: () => void } | null} */
  let montageVideoGuard = null;
  /** @type {Array<{ id: number, name: string, clipCount: number }>} */
  let montageProjects = [];
  /** @type {any} */
  let activeMontageProject = null;
  /** @type {number | null} */
  let selectedMontageClipId = null;
  let montageOpen = false;

  const ICON = {
    markStart:
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4v16"/><path d="M4 4h10l-2 4 2 4H4"/></svg>',
    markEnd:
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 4v16"/><path d="M20 4H10l2 4-2 4h10"/></svg>',
    save:
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>',
    scissors:
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>',
    reset:
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>',
    close:
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    play:
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
  };

  function makeIconButton(label, svg, onClick, className = '') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `ghost-btn icon-btn ${className}`.trim();
    btn.setAttribute('aria-label', label);
    btn.title = label;
    btn.innerHTML = svg;
    btn.addEventListener('click', onClick);
    return btn;
  }

  function t(key, vars) {
    let text;
    if (window.SiteI18n && typeof window.SiteI18n.t === 'function') {
      text = window.SiteI18n.t(key);
    } else {
      const lang = document.documentElement.lang?.startsWith('en') ? 'en' : 'ru';
      text =
        window.PAGE_I18N?.[lang]?.[key] ??
        window.PAGE_I18N?.ru?.[key] ??
        key;
    }
    if (!vars) return text;
    return String(text).replace(/\{(\w+)\}/g, (_, name) =>
      vars[name] == null ? '' : String(vars[name]),
    );
  }

  function askConfirm(message, options = {}) {
    return window.AppDialog.confirm(message, {
      ...options,
      confirmLabel:
        options.confirmLabel ||
        (options.danger
          ? t('dialogDelete')
          : t('dialogConfirm')),
      cancelLabel: options.cancelLabel || t('dialogCancel'),
    });
  }

  function askPrompt(message, defaultValue = '', options = {}) {
    return window.AppDialog.prompt(message, defaultValue, {
      ...options,
      confirmLabel: options.confirmLabel || t('dialogOk'),
      cancelLabel: options.cancelLabel || t('dialogCancel'),
    });
  }

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function getContributorId() {
    let id = localStorage.getItem(STORAGE_ID);
    if (!id) {
      id = uuid();
      localStorage.setItem(STORAGE_ID, id);
    }
    return id;
  }

  function getDisplayName() {
    return (localStorage.getItem(STORAGE_NAME) || '').trim();
  }

  function setDisplayName(name) {
    localStorage.setItem(STORAGE_NAME, name.trim());
  }

  function ensureDisplayName() {
    return new Promise((resolve) => {
      const existing = getDisplayName();
      if (existing) {
        resolve(existing);
        return;
      }
      nameInput.value = '';
      nameModal.hidden = false;
      const onSubmit = (event) => {
        event.preventDefault();
        const name = nameInput.value.trim();
        if (!name) return;
        setDisplayName(name);
        nameModal.hidden = true;
        nameForm.removeEventListener('submit', onSubmit);
        resolve(name);
      };
      nameForm.addEventListener('submit', onSubmit);
    });
  }

  function parseSecretFromPath() {
    const parts = location.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
    // /trip | /trip/en | /trip/<secret> | /trip/en/<secret>
    if (parts[0] !== 'trip') return null;
    if (parts.length === 1) return null;
    if (parts[1] === 'en') return parts[2] || null;
    return parts[1] || null;
  }

  function albumPath(secret) {
    const en = document.documentElement.lang?.startsWith('en');
    return en ? `/trip/en/${secret}` : `/trip/${secret}`;
  }

  function absoluteAlbumUrl(secret) {
    return `${location.origin}${albumPath(secret)}`;
  }

  function syncHeaderLangPaths(secret) {
    if (!header) return;
    if (secret) {
      header.dataset.langRu = `/trip/${secret}`;
      header.dataset.langEn = `/trip/en/${secret}`;
    } else {
      header.dataset.langRu = '/trip';
      header.dataset.langEn = '/trip/en';
    }
  }

  async function rememberAlbum(album, { visited = true } = {}) {
    if (!albumsRegistry || !album?.secret) return;
    try {
      await albumsRegistry.remember({
        secret: album.secret,
        title: album.title,
        isOwner: Boolean(album.isOwner),
        visited,
      });
    } catch {
      // IndexedDB can be unavailable (private mode) — list is best-effort.
    }
  }

  function formatAlbumWhen(iso) {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const lang = document.documentElement.lang?.startsWith('en') ? 'en' : 'ru';
    try {
      return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'ru-RU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(date);
    } catch {
      return date.toLocaleDateString();
    }
  }

  async function loadAlbumList() {
    if (!albumListSection || !albumList) return;
    /** @type {Map<string, { secret: string, title: string, isOwner: boolean, lastVisitedAt: string }>} */
    const bySecret = new Map();
    const dismissed = new Set();

    if (albumsRegistry) {
      try {
        const all = await albumsRegistry.list({ includeDismissed: true });
        for (const row of all) {
          if (row.dismissed) {
            dismissed.add(row.secret);
            continue;
          }
          bySecret.set(row.secret, {
            secret: row.secret,
            title: row.title,
            isOwner: Boolean(row.isOwner),
            lastVisitedAt: row.lastVisitedAt,
          });
        }
      } catch {
        // ignore
      }
    }

    try {
      const data = await api('/trip-api/my-trips', {
        headers: { 'X-Contributor-Id': getContributorId() },
      });
      for (const row of data.trips || []) {
        if (dismissed.has(row.secret)) continue;
        const existing = bySecret.get(row.secret);
        bySecret.set(row.secret, {
          secret: row.secret,
          title: row.title || existing?.title || 'Album',
          isOwner: true,
          lastVisitedAt:
            existing?.lastVisitedAt || row.updatedAt || row.createdAt,
        });
      }
    } catch {
      // Server list is optional; local history still works.
    }

    const albums = Array.from(bySecret.values()).sort((a, b) =>
      String(b.lastVisitedAt || '').localeCompare(String(a.lastVisitedAt || '')),
    );

    albumList.innerHTML = '';
    if (!albums.length) {
      albumListSection.hidden = true;
      return;
    }

    albumListSection.hidden = false;
    for (const album of albums) {
      const li = document.createElement('li');
      li.className = 'trip-album-list__row';

      const link = document.createElement('a');
      link.className = 'trip-album-list__item';
      link.href = albumPath(album.secret);

      const body = document.createElement('div');
      body.className = 'trip-album-list__body';
      const titleEl = document.createElement('strong');
      titleEl.textContent = album.title;
      const metaEl = document.createElement('span');
      const role = album.isOwner ? t('myAlbumsOwner') : t('myAlbumsVisited');
      const when = formatAlbumWhen(album.lastVisitedAt);
      metaEl.textContent = when ? `${role} · ${when}` : role;
      body.append(titleEl, metaEl);
      link.append(body);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'ghost-btn icon-btn trip-album-list__remove';
      removeBtn.setAttribute('aria-label', t('myAlbumsRemoveAria'));
      removeBtn.title = t('myAlbumsRemove');
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', async () => {
        if (!albumsRegistry) return;
        try {
          await albumsRegistry.dismiss(album.secret);
        } catch {
          // ignore
        }
        await loadAlbumList();
      });

      li.append(link, removeBtn);
      albumList.append(li);
    }
  }

  async function api(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };
    const response = await fetch(path, { ...options, headers });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { message: text };
    }
    if (!response.ok) {
      const message =
        data?.message ||
        (Array.isArray(data?.message) ? data.message.join(', ') : null) ||
        `HTTP ${response.status}`;
      throw new Error(message);
    }
    return data;
  }

  function showStatus(message, isError) {
    if (!message) {
      albumStatus.hidden = true;
      albumStatus.textContent = '';
      return;
    }
    albumStatus.hidden = false;
    albumStatus.textContent = message;
    albumStatus.style.color = isError
      ? 'hsl(var(--destructive))'
      : 'var(--v-muted)';
  }

  async function sha256File(file, onProgress) {
    // Chunk via File.slice — Blob.stream() can hang forever on iOS Safari
    // for Photo Library assets, so the upload queue never leaves "waiting".
    const chunkSize = 2 * 1024 * 1024;
    const hasher = createSha256();
    const total = file.size || 0;
    let offset = 0;
    while (offset < total) {
      const buf = await file.slice(offset, offset + chunkSize).arrayBuffer();
      hasher.update(new Uint8Array(buf));
      offset += buf.byteLength;
      if (total > 0) onProgress?.(Math.min(1, offset / total));
      // Yield so the upload panel can paint on mobile.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    if (total === 0) onProgress?.(1);
    return hasher.digestHex();
  }

  function isAllowedMedia(file) {
    const type = (file.type || '').toLowerCase();
    if (type.startsWith('image/') || type.startsWith('video/')) return true;
    // iOS/Android often omit MIME for gallery picks — fall back to extension.
    if (!type || type === 'application/octet-stream') {
      return /\.(jpe?g|png|gif|webp|heic|heif|avif|tif?f|bmp|mp4|mov|m4v|webm|mkv|avi|3gp)$/i.test(
        file.name || '',
      );
    }
    return false;
  }

  function guessMimeType(file) {
    const type = (file.type || '').trim();
    if (type) return type;
    const name = (file.name || '').toLowerCase();
    if (/\.(jpe?g)$/.test(name)) return 'image/jpeg';
    if (/\.png$/.test(name)) return 'image/png';
    if (/\.webp$/.test(name)) return 'image/webp';
    if (/\.gif$/.test(name)) return 'image/gif';
    if (/\.(heic|heif)$/.test(name)) return 'image/heic';
    if (/\.mp4$/.test(name)) return 'video/mp4';
    if (/\.mov$/.test(name)) return 'video/quicktime';
    if (/\.m4v$/.test(name)) return 'video/x-m4v';
    if (/\.webm$/.test(name)) return 'video/webm';
    return 'application/octet-stream';
  }

  function hexFromBuffer(buffer) {
    return [...new Uint8Array(buffer)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // Minimal incremental SHA-256 (public domain style) for large file streams.
  function createSha256() {
    const K = new Uint32Array([
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
      0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
      0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
      0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
      0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
      0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
      0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
      0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
      0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ]);
    let h0 = 0x6a09e667;
    let h1 = 0xbb67ae85;
    let h2 = 0x3c6ef372;
    let h3 = 0xa54ff53a;
    let h4 = 0x510e527f;
    let h5 = 0x9b05688c;
    let h6 = 0x1f83d9ab;
    let h7 = 0x5be0cd19;
    const buffer = new Uint8Array(64);
    let bufferLength = 0;
    let bytesHashed = 0n;

    function rotr(n, x) {
      return (x >>> n) | (x << (32 - n));
    }

    function processBlock(block) {
      const w = new Uint32Array(64);
      for (let i = 0; i < 16; i++) {
        const j = i * 4;
        w[i] =
          (block[j] << 24) |
          (block[j + 1] << 16) |
          (block[j + 2] << 8) |
          block[j + 3];
      }
      for (let i = 16; i < 64; i++) {
        const s0 =
          rotr(7, w[i - 15]) ^ rotr(18, w[i - 15]) ^ (w[i - 15] >>> 3);
        const s1 =
          rotr(17, w[i - 2]) ^ rotr(19, w[i - 2]) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      let a = h0;
      let b = h1;
      let c = h2;
      let d = h3;
      let e = h4;
      let f = h5;
      let g = h6;
      let h = h7;
      for (let i = 0; i < 64; i++) {
        const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
        const ch = (e & f) ^ (~e & g);
        const temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
        const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (S0 + maj) >>> 0;
        h = g;
        g = f;
        f = e;
        e = (d + temp1) >>> 0;
        d = c;
        c = b;
        b = a;
        a = (temp1 + temp2) >>> 0;
      }
      h0 = (h0 + a) >>> 0;
      h1 = (h1 + b) >>> 0;
      h2 = (h2 + c) >>> 0;
      h3 = (h3 + d) >>> 0;
      h4 = (h4 + e) >>> 0;
      h5 = (h5 + f) >>> 0;
      h6 = (h6 + g) >>> 0;
      h7 = (h7 + h) >>> 0;
    }

    return {
      update(chunk) {
        let offset = 0;
        while (offset < chunk.length) {
          const take = Math.min(64 - bufferLength, chunk.length - offset);
          buffer.set(chunk.subarray(offset, offset + take), bufferLength);
          bufferLength += take;
          offset += take;
          if (bufferLength === 64) {
            processBlock(buffer);
            bytesHashed += 64n;
            bufferLength = 0;
          }
        }
      },
      digestHex() {
        const bitLen = (bytesHashed + BigInt(bufferLength)) * 8n;
        buffer[bufferLength++] = 0x80;
        if (bufferLength > 56) {
          while (bufferLength < 64) buffer[bufferLength++] = 0;
          processBlock(buffer);
          bufferLength = 0;
        }
        while (bufferLength < 56) buffer[bufferLength++] = 0;
        const view = new DataView(buffer.buffer);
        view.setUint32(56, Number((bitLen >> 32n) & 0xffffffffn));
        view.setUint32(60, Number(bitLen & 0xffffffffn));
        processBlock(buffer);
        const out = new Uint8Array(32);
        const outView = new DataView(out.buffer);
        outView.setUint32(0, h0);
        outView.setUint32(4, h1);
        outView.setUint32(8, h2);
        outView.setUint32(12, h3);
        outView.setUint32(16, h4);
        outView.setUint32(20, h5);
        outView.setUint32(24, h6);
        outView.setUint32(28, h7);
        return hexFromBuffer(out.buffer);
      },
    };
  }

  function formatBytes(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  function formatTakenAt(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    // Compact so time fits on narrow trip cards: 26.07.26 17:34
    const pad = (n) => String(n).padStart(2, '0');
    const dd = pad(d.getDate());
    const mm = pad(d.getMonth() + 1);
    const yy = pad(d.getFullYear() % 100);
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());
    return `${dd}.${mm}.${yy} ${hh}:${mi}`;
  }

  function formatDuration(ms) {
    if (ms == null || !Number.isFinite(ms) || ms < 0) return '';
    const totalSec = Math.round(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n) => String(n).padStart(2, '0');
    if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
    return `${m}:${pad(s)}`;
  }

  function sortMedia(list) {
    return [...list].sort((a, b) => {
      const ta = a.takenAt ? Date.parse(a.takenAt) : NaN;
      const tb = b.takenAt ? Date.parse(b.takenAt) : NaN;
      const aHas = Number.isFinite(ta);
      const bHas = Number.isFinite(tb);
      if (aHas && bHas && ta !== tb) return tb - ta;
      if (aHas !== bHas) return aHas ? -1 : 1;
      const nameCmp = String(a.originalFilename || '').localeCompare(
        String(b.originalFilename || ''),
        undefined,
        { numeric: true, sensitivity: 'base' },
      );
      if (nameCmp !== 0) return nameCmp;
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    });
  }

  function visibleMedia() {
    return sortMedia(hideDeleted ? media.filter((item) => !item.deleted) : media);
  }

  function syncDeletedToggle() {
    const deletedCount = media.filter((m) => m.deleted).length;
    if (!trip?.isAdmin || deletedCount === 0) {
      toggleDeletedBtn.hidden = true;
      return;
    }
    toggleDeletedBtn.hidden = false;
    toggleDeletedBtn.textContent = hideDeleted
      ? t('showDeleted')
      : t('hideDeleted');
  }

  function syncRetryButton() {
    const failed = activeUploadItems.filter(
      (item) => item.failed && item.retryable && item.file,
    );
    if (!failed.length) {
      retryFailedBtn.hidden = true;
      return;
    }
    retryFailedBtn.hidden = false;
    retryFailedBtn.disabled = false;
    retryFailedBtn.textContent = t('retryFailedCount', {
      count: String(failed.length),
    });
  }

  function renderGallery() {
    gallery.innerHTML = '';
    const visible = visibleMedia();
    emptyGallery.hidden = visible.length > 0;
    syncDeletedToggle();
    // Keep gallery lightbox on the same item if the list refreshed underneath it.
    if (!lightbox.hidden && lightboxMode === 'gallery') {
      const openId = lightbox.dataset.mediaId;
      const nextIndex = openId
        ? visible.findIndex((item) => item.id === openId)
        : -1;
      if (nextIndex >= 0) showLightboxAt(nextIndex, { keepMedia: true });
      else closeLightbox();
    }
    for (const item of visible) {
      const card = document.createElement('article');
      card.className = 'trip-card' + (item.deleted ? ' deleted' : '');
      card.dataset.id = item.id;

      if (item.deleted) {
        const badge = document.createElement('span');
        badge.className = 'badge trip-card__badge';
        badge.textContent = t('deletedBadge');
        card.appendChild(badge);
      }

      const mediaBtn = document.createElement('button');
      mediaBtn.type = 'button';
      mediaBtn.className =
        'trip-card__media' + (item.kind === 'video' ? ' is-video' : '');
      const previewUrl = item.thumbUrl || item.url;
      if (item.kind === 'video' && !item.thumbUrl) {
        // Thumb still generating — cheap poster via muted video metadata.
        const video = document.createElement('video');
        video.src = item.url;
        video.muted = true;
        video.playsInline = true;
        video.preload = 'metadata';
        mediaBtn.appendChild(video);
      } else {
        const img = document.createElement('img');
        img.src = previewUrl;
        img.alt = item.displayName || item.kind || 'media';
        img.loading = 'lazy';
        mediaBtn.appendChild(img);
      }
      mediaBtn.addEventListener('click', () => {
        const index = visibleMedia().findIndex((row) => row.id === item.id);
        openLightbox(index >= 0 ? index : 0);
      });
      card.appendChild(mediaBtn);

      const footer = document.createElement('div');
      footer.className = 'trip-card__footer';

      const meta = document.createElement('div');
      meta.className = 'trip-card__meta';

      const authorEl = document.createElement('strong');
      authorEl.textContent = item.displayName || '—';
      meta.appendChild(authorEl);

      const when =
        formatTakenAt(item.takenAt) || formatTakenAt(item.createdAt);
      if (when) {
        const dateEl = document.createElement('span');
        dateEl.textContent = when;
        meta.appendChild(dateEl);
      }

      const sizeLabel =
        item.size != null && Number.isFinite(Number(item.size))
          ? formatBytes(Number(item.size))
          : '';
      const durationLabel = formatDuration(item.durationMs);
      const sizeTimeBits = [sizeLabel, durationLabel].filter(Boolean);
      if (sizeTimeBits.length) {
        const sizeTimeEl = document.createElement('span');
        sizeTimeEl.className = 'trip-card__size';
        sizeTimeEl.textContent = sizeTimeBits.join(' · ');
        meta.appendChild(sizeTimeEl);
      }

      if (item.cameraModel) {
        const deviceEl = document.createElement('span');
        deviceEl.textContent = item.cameraModel;
        meta.appendChild(deviceEl);
      }

      footer.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'trip-card__actions';

      const mine = item.contributorId === getContributorId();
      if (
        trip?.isAdmin &&
        item.kind === 'video' &&
        !item.deleted
      ) {
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'ghost-btn icon-btn trip-card__action';
        const inCount = clipCountInActiveProject(item.id);
        const addLabel = inCount
          ? t('montageInProject', { count: inCount })
          : t('montageAdd');
        add.setAttribute('aria-label', addLabel);
        add.title = addLabel;
        if (inCount) add.classList.add('is-active');
        add.innerHTML =
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 4v16M17 4v16M2 12h20"/><path d="M12 9v6M9 12h6"/></svg>';
        add.addEventListener('click', (event) => {
          event.stopPropagation();
          void addMediaToMontage(item);
        });
        actions.appendChild(add);
      }
      if ((mine || trip?.isAdmin) && !item.deleted) {
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'ghost-btn icon-btn trip-card__action trip-card__delete';
        del.setAttribute('aria-label', t('deleteBtn'));
        del.title = t('deleteBtn');
        del.innerHTML =
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
        del.addEventListener('click', (event) => {
          event.stopPropagation();
          void deleteMedia(item.id);
        });
        actions.appendChild(del);
      }

      if (actions.childElementCount) footer.appendChild(actions);
      card.appendChild(footer);
      gallery.appendChild(card);
    }
  }

  function appendMetaRow(parent, label, value) {
    if (value == null || value === '') return;
    const row = document.createElement('div');
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = String(value);
    row.append(dt, dd);
    parent.appendChild(row);
  }

  function formatExifValue(value) {
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
        return formatTakenAt(value) || value;
      }
      return String(value);
    }
    if (Array.isArray(value)) {
      if (value.every((item) => typeof item !== 'object' || item == null)) {
        return value.map((item) => formatExifValue(item)).join(', ');
      }
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return String(value);
      }
    }
    if (typeof value === 'object') {
      // GPS-style {latitude, longitude} or nested tag groups.
      if (
        typeof value.latitude === 'number' &&
        typeof value.longitude === 'number'
      ) {
        return `${value.latitude}, ${value.longitude}`;
      }
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return String(value);
      }
    }
    return String(value);
  }

  function flattenExif(obj, prefix = '') {
    /** @type {Array<{ key: string, value: string }>} */
    const rows = [];
    if (!obj || typeof obj !== 'object') return rows;
    const entries = Object.entries(obj).sort(([a], [b]) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }),
    );
    for (const [key, raw] of entries) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (raw == null || raw === '') continue;
      if (Array.isArray(raw) && raw.some((item) => item && typeof item === 'object')) {
        rows.push({ key: path, value: formatExifValue(raw) });
        continue;
      }
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const nested = flattenExif(raw, path);
        if (nested.length) rows.push(...nested);
        else rows.push({ key: path, value: formatExifValue(raw) });
        continue;
      }
      rows.push({ key: path, value: formatExifValue(raw) });
    }
    return rows;
  }

  function renderLightboxMeta(item) {
    lightboxFields.innerHTML = '';
    lightboxExifFields.innerHTML = '';

    appendMetaRow(
      lightboxFields,
      t('metaKind'),
      item.kind === 'video' ? t('metaKindVideo') : t('metaKindPhoto'),
    );
    appendMetaRow(lightboxFields, t('metaFilename'), item.originalFilename);
    appendMetaRow(lightboxFields, t('metaAuthor'), item.displayName);
    appendMetaRow(
      lightboxFields,
      t('metaTakenAt'),
      formatTakenAt(item.takenAt),
    );
    appendMetaRow(
      lightboxFields,
      t('metaUploadedAt'),
      formatTakenAt(item.createdAt),
    );
    appendMetaRow(lightboxFields, t('metaCamera'), item.cameraModel);
    if (item.width && item.height) {
      appendMetaRow(
        lightboxFields,
        t('metaDimensions'),
        `${item.width} × ${item.height}`,
      );
    }
    appendMetaRow(
      lightboxFields,
      t('metaDuration'),
      formatDuration(item.durationMs),
    );
    appendMetaRow(
      lightboxFields,
      t('metaFileSize'),
      item.size != null ? formatBytes(item.size) : '',
    );
    appendMetaRow(lightboxFields, t('metaMime'), item.mimeType);
    appendMetaRow(lightboxFields, t('metaUserAgent'), item.userAgent);
    if (item.deleted) {
      appendMetaRow(lightboxFields, t('metaDeleted'), t('metaDeletedYes'));
    }

    lightboxExif.querySelectorAll('.trip-lightbox__exif-note').forEach((el) => {
      el.remove();
    });
    const exifRows = flattenExif(item.exif);
    lightboxExif.hidden = false;
    if (!item.metaReady || !exifRows.length) {
      const note = document.createElement('p');
      note.className = 'trip-lightbox__exif-note';
      note.textContent = !item.metaReady ? t('metaPending') : t('metaEmptyExif');
      lightboxExif.appendChild(note);
      return;
    }
    for (const row of exifRows) {
      appendMetaRow(lightboxExifFields, row.key, row.value);
    }
  }

  function lightboxItems() {
    if (lightboxMode === 'montage') {
      return (activeMontageProject?.clips || []).map((clip) => {
        const mediaItem = montageMediaFields(clip);
        return {
          id: `clip-${clip.id}`,
          clipId: clip.id,
          kind: 'video',
          url: clip.trimmedVideoUrl || mediaItem.url,
          originalFilename: mediaItem.originalFilename || clip.mediaId,
          displayName: mediaItem.displayName || '—',
          durationMs: mediaItem.durationMs,
          trimStartSec: clip.trimStartSec,
          trimEndSec: clip.trimEndSec,
          trimmed: Boolean(clip.trimmedVideoUrl),
          takenAt: mediaItem.takenAt || null,
          createdAt: mediaItem.createdAt || null,
          cameraModel: mediaItem.cameraModel || null,
          width: mediaItem.width,
          height: mediaItem.height,
          size: mediaItem.size,
          mimeType: mediaItem.mimeType,
          userAgent: null,
          deleted: false,
          exif: null,
          metaReady: true,
        };
      });
    }
    return visibleMedia();
  }

  function clearMontageVideoGuard() {
    if (montageVideoGuard?.video) {
      montageVideoGuard.video.removeEventListener(
        'timeupdate',
        montageVideoGuard.onTimeUpdate,
      );
      montageVideoGuard.video.removeEventListener(
        'ended',
        montageVideoGuard.onEnded,
      );
    }
    montageVideoGuard = null;
  }

  function attachMontagePlayback(video, item) {
    clearMontageVideoGuard();
    const start = item.trimStartSec != null ? Number(item.trimStartSec) : 0;
    const end =
      item.trimEndSec != null && Number.isFinite(Number(item.trimEndSec))
        ? Number(item.trimEndSec)
        : null;
    let advanced = false;

    const seekStart = () => {
      if (Number.isFinite(start) && start > 0) {
        try {
          video.currentTime = start;
        } catch {
          /* ignore */
        }
      }
    };
    if (video.readyState >= 1) seekStart();
    else video.addEventListener('loadedmetadata', seekStart, { once: true });

    const advance = () => {
      if (advanced) return;
      advanced = true;
      if (lightboxIndex < lightboxItems().length - 1) {
        showLightboxAt(lightboxIndex + 1);
      }
    };

    const onTimeUpdate = () => {
      if (end != null && video.currentTime >= end - 0.05) {
        video.pause();
        advance();
      }
    };
    const onEnded = () => advance();

    montageVideoGuard = { onTimeUpdate, onEnded, video };
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('ended', onEnded);
  }

  function renderMontageLightboxMeta(item) {
    lightboxFields.innerHTML = '';
    lightboxExifFields.innerHTML = '';
    lightboxExif.querySelectorAll('.trip-lightbox__exif-note').forEach((el) => {
      el.remove();
    });
    lightboxExif.hidden = true;
    lightboxMetaTitle.textContent = t('montagePreviewTitle');
    appendMetaRow(
      lightboxFields,
      t('metaFilename'),
      item.originalFilename,
    );
    const durationSec =
      item.durationMs != null ? item.durationMs / 1000 : null;
    const start = item.trimStartSec ?? 0;
    const end = item.trimEndSec != null ? item.trimEndSec : durationSec;
    const range =
      end == null
        ? `${formatDurationSec(start)}–…`
        : `${formatDurationSec(start)}–${formatDurationSec(end)}`;
    appendMetaRow(lightboxFields, t('montageTrimLabel'), range);
    if (item.trimmed) {
      appendMetaRow(lightboxFields, t('montageClipStatus'), t('montageTrimmed'));
    }
  }

  function showLightboxAt(index, { keepMedia = false } = {}) {
    const items = lightboxItems();
    if (!items.length) {
      closeLightbox();
      return;
    }
    const clamped = Math.max(0, Math.min(index, items.length - 1));
    const item = items[clamped];
    const sameItem =
      keepMedia &&
      lightbox.dataset.mediaId === item.id &&
      lightboxBody.querySelector('img, video');

    lightboxIndex = clamped;
    lightbox.dataset.mediaId = item.id;
    lightbox.dataset.mode = lightboxMode;
    lightboxCounter.textContent = t('lightboxCounter', {
      current: String(clamped + 1),
      total: String(items.length),
    });
    lightboxPrev.disabled = clamped <= 0;
    lightboxNext.disabled = clamped >= items.length - 1;

    if (!sameItem) {
      clearMontageVideoGuard();
      lightboxBody.innerHTML = '';
      if (item.kind === 'video') {
        const video = document.createElement('video');
        video.src = item.url;
        video.controls = true;
        video.autoplay = true;
        video.playsInline = true;
        lightboxBody.appendChild(video);
        if (lightboxMode === 'montage') attachMontagePlayback(video, item);
      } else {
        const img = document.createElement('img');
        img.src = item.url;
        img.alt = item.originalFilename || '';
        lightboxBody.appendChild(img);
      }
    }

    if (lightboxMode === 'montage') renderMontageLightboxMeta(item);
    else {
      lightboxMetaTitle.textContent = t('lightboxMetaTitle');
      renderLightboxMeta(item);
    }
    lightbox.hidden = false;
  }

  function openLightbox(index) {
    lightboxMode = 'gallery';
    showLightboxAt(index);
  }

  function stepLightbox(delta) {
    if (lightbox.hidden) return;
    showLightboxAt(lightboxIndex + delta);
  }

  function closeLightbox() {
    clearMontageVideoGuard();
    lightbox.hidden = true;
    lightboxBody.innerHTML = '';
    lightboxFields.innerHTML = '';
    lightboxExifFields.innerHTML = '';
    lightboxExif.querySelectorAll('.trip-lightbox__exif-note').forEach((el) => {
      el.remove();
    });
    lightboxExif.hidden = true;
    lightboxCounter.textContent = '';
    lightboxIndex = -1;
    lightboxMode = 'gallery';
    lightboxMetaTitle.textContent = t('lightboxMetaTitle');
    delete lightbox.dataset.mediaId;
    delete lightbox.dataset.mode;
  }

  async function deleteMedia(id) {
    if (!trip) return;
    const ok = await askConfirm(t('confirmDelete'), {
      confirmLabel: t('dialogDelete'),
      danger: true,
    });
    if (!ok) return;
    await api(`/trip-api/trips/${trip.secret}/media/${id}`, {
      method: 'DELETE',
      headers: { 'X-Contributor-Id': getContributorId() },
    });
    await loadMedia();
  }

  async function loadTrip(secret) {
    try {
      trip = await api(`/trip-api/trips/${encodeURIComponent(secret)}`);
    } catch {
      showCreate();
      createError.hidden = false;
      createError.textContent = t('tripNotFound');
      return;
    }
    createView.hidden = true;
    albumView.hidden = false;
    emptyGallery.hidden = false;
    albumTitle.textContent = trip.title;
    syncHeaderLangPaths(trip.secret);
    const isOwner = trip.ownerContributorId === getContributorId();
    const bits = [`${t('itemsCount')}`];
    if (isOwner) {
      bits.unshift(t('youAreOwner'));
      editTitleBtn.hidden = false;
    } else {
      editTitleBtn.hidden = true;
    }
    albumMeta.textContent = bits.join(' · ');
    void rememberAlbum({
      secret: trip.secret,
      title: trip.title,
      isOwner,
    });
    // Load the gallery immediately; only ask for a name when uploading.
    await loadMedia();
    if (!getDisplayName()) {
      void ensureDisplayName();
    }
  }

  async function loadMedia() {
    if (!trip) return;
    const data = await api(
      `/trip-api/trips/${encodeURIComponent(trip.secret)}/media`,
    );
    trip.isAdmin = data.isAdmin;
    media = data.media || [];
    montageToggleBtn.hidden = !trip.isAdmin;
    if (!trip.isAdmin) setMontageOpen(false);
    albumMeta.textContent = [
      trip.ownerContributorId === getContributorId() ? t('youAreOwner') : null,
      `${media.filter((m) => !m.deleted).length} ${t('itemsCount')}`,
    ]
      .filter(Boolean)
      .join(' · ');
    renderGallery();
    if (montageOpen && trip.isAdmin) void loadMontageProjects();
    // Thumbs / EXIF are filled in the background — refresh a few times.
    const pendingMeta = media.some(
      (m) => !m.deleted && (!m.thumbUrl || !m.metaReady),
    );
    if (pendingMeta) {
      loadMedia._thumbTries = (loadMedia._thumbTries || 0) + 1;
      if (loadMedia._thumbTries <= 5) {
        window.clearTimeout(loadMedia._thumbTimer);
        loadMedia._thumbTimer = window.setTimeout(() => {
          void loadMedia();
        }, 4000);
      }
    } else {
      loadMedia._thumbTries = 0;
    }
  }

  function showCreate() {
    createView.hidden = false;
    albumView.hidden = true;
    syncHeaderLangPaths(null);
    const name = getDisplayName();
    if (name) createNameInput.value = name;
    void loadAlbumList();
  }

  createForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    createError.hidden = true;
    const title = tripTitleInput.value.trim();
    const displayName = createNameInput.value.trim();
    if (!title || !displayName) return;
    setDisplayName(displayName);
    try {
      const created = await api('/trip-api/trips', {
        method: 'POST',
        body: JSON.stringify({
          title,
          displayName,
          contributorId: getContributorId(),
        }),
      });
      await rememberAlbum({
        secret: created.secret,
        title: created.title,
        isOwner: true,
      });
      history.replaceState({}, '', albumPath(created.secret));
      await loadTrip(created.secret);
      showStatus(t('linkCopied'));
      try {
        await navigator.clipboard.writeText(absoluteAlbumUrl(created.secret));
      } catch {
        // ignore
      }
    } catch (error) {
      createError.hidden = false;
      createError.textContent = error.message || t('createFailed');
    }
  });

  copyLinkBtn.addEventListener('click', async () => {
    if (!trip) return;
    const url = absoluteAlbumUrl(trip.secret);
    try {
      await navigator.clipboard.writeText(url);
      showStatus(t('linkCopied'));
    } catch {
      await askPrompt(t('copyLink'), url, {
        title: t('copyLink'),
        confirmLabel: t('dialogOk'),
      });
    }
  });

  editTitleBtn.addEventListener('click', async () => {
    if (!trip) return;
    const next = await askPrompt(t('renamePrompt'), trip.title, {
      title: t('editTitle'),
    });
    if (!next || !next.trim() || next.trim() === trip.title) return;
    const updated = await api(`/trip-api/trips/${trip.secret}`, {
      method: 'PATCH',
      headers: { 'X-Contributor-Id': getContributorId() },
      body: JSON.stringify({ title: next.trim() }),
    });
    trip.title = updated.title;
    albumTitle.textContent = trip.title;
    void rememberAlbum(
      { secret: trip.secret, title: trip.title, isOwner: true },
      { visited: false },
    );
  });

  changeNameBtn.addEventListener('click', () => {
    nameInput.value = getDisplayName();
    nameModal.hidden = false;
    const onSubmit = (event) => {
      event.preventDefault();
      const name = nameInput.value.trim();
      if (!name) return;
      setDisplayName(name);
      nameModal.hidden = true;
      nameForm.removeEventListener('submit', onSubmit);
    };
    nameForm.addEventListener('submit', onSubmit);
  });

  toggleDeletedBtn.addEventListener('click', () => {
    hideDeleted = !hideDeleted;
    renderGallery();
  });

  retryFailedBtn.addEventListener('click', () => {
    const files = activeUploadItems
      .filter((item) => item.failed && item.retryable && item.file)
      .map((item) => item.file);
    if (!files.length) return;
    retryFailedBtn.disabled = true;
    uploadChain = uploadChain
      .catch(() => undefined)
      .then(() => processFiles(files))
      .catch((error) => {
        showStatus(error?.message || t('failed'), true);
      });
  });

  lightboxClose.addEventListener('click', closeLightbox);
  lightboxPrev.addEventListener('click', () => stepLightbox(-1));
  lightboxNext.addEventListener('click', () => stepLightbox(1));
  document.addEventListener('keydown', (event) => {
    if (lightbox.hidden) return;
    if (event.key === 'Escape') {
      closeLightbox();
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      stepLightbox(-1);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      stepLightbox(1);
    }
  });

  function makeQueueItem(file) {
    const el = document.createElement('div');
    el.className = 'trip-upload-item';
    el.innerHTML = `
      <div class="trip-upload-item__row">
        <span class="name"></span>
        <span class="state"></span>
      </div>
      <div class="trip-upload-item__bar"><span></span></div>
    `;
    el.querySelector('.name').textContent = `${file.name} (${formatBytes(file.size)})`;
    const stateEl = el.querySelector('.state');
    const barEl = el.querySelector('.trip-upload-item__bar > span');
    const item = {
      el,
      file,
      /** 0..1 fraction of this file's work (hash + upload + complete). */
      fraction: 0,
      done: false,
      failed: false,
      retryable: false,
      setState(text, pct) {
        stateEl.textContent = text;
        if (typeof pct === 'number') {
          const clamped = Math.max(0, Math.min(100, pct));
          barEl.style.width = `${clamped}%`;
          item.fraction = clamped / 100;
          refreshOverallProgress();
        }
      },
      markDone() {
        item.done = true;
        item.fraction = 1;
        refreshOverallProgress();
      },
      markFailed(retryable) {
        item.failed = true;
        item.retryable = Boolean(retryable);
        item.markDone();
      },
    };
    return item;
  }

  /** @type {ReturnType<typeof makeQueueItem>[]} */
  let activeUploadItems = [];

  function refreshOverallProgress() {
    if (!activeUploadItems.length) return;
    const total = activeUploadItems.length;
    const done = activeUploadItems.filter((item) => item.done).length;
    const avg =
      activeUploadItems.reduce((sum, item) => sum + item.fraction, 0) / total;
    const pct = Math.round(avg * 100);
    const finished = done === total;
    uploadSummary.textContent = finished
      ? t('uploadSummaryDone', { done, total })
      : t('uploadSummary', { done, total });
    uploadSummaryPct.textContent = `${pct}%`;
    uploadOverallBar.style.width = `${pct}%`;
  }

  async function readImageDims(file) {
    if (!guessMimeType(file).startsWith('image/')) {
      return { width: null, height: null };
    }
    try {
      const bitmap = await createImageBitmap(file);
      const dims = { width: bitmap.width, height: bitmap.height };
      bitmap.close?.();
      return dims;
    } catch {
      return { width: null, height: null };
    }
  }

  async function uploadOne(file, queueItem) {
    if (!trip) {
      queueItem.setState(t('failed'), 100);
      queueItem.markFailed(true);
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      queueItem.setState(t('tooLarge'), 100);
      queueItem.markFailed(false);
      return;
    }
    if (!isAllowedMedia(file)) {
      queueItem.setState(t('badType'), 100);
      queueItem.markFailed(false);
      return;
    }

    const displayName = await ensureDisplayName();
    queueItem.setState(t('hashing'), 1);
    const contentHash = await sha256File(file, (ratio) => {
      const pct = Math.round(ratio * 100);
      queueItem.setState(`${t('hashing')} ${pct}%`, ratio * 25);
    });
    const dims = await readImageDims(file);
    const mimeType = guessMimeType(file);

    const payload = {
      contentHash,
      mimeType,
      size: file.size,
      originalFilename: file.name || 'file',
      contributorId: getContributorId(),
      displayName,
      width: dims.width,
      height: dims.height,
    };

    queueItem.setState(t('uploading'), 28);
    const check = await api(
      `/trip-api/trips/${encodeURIComponent(trip.secret)}/uploads/check`,
      { method: 'POST', body: JSON.stringify(payload) },
    );

    if (check.status === 'alreadyExists') {
      queueItem.setState(t('alreadyExists'), 100);
      queueItem.markDone();
      return;
    }
    if (check.status === 'restored') {
      queueItem.setState(t('restored'), 100);
      queueItem.markDone();
      return;
    }

    const putHeaders = {
      ...(check.headers || {}),
      'Content-Type': mimeType,
    };
    await putWithProgress(check.uploadUrl, file, putHeaders, (pct) => {
      // Upload is the bulk of the work: map 0..100% → 30..90 of the bar.
      const label =
        pct < 100
          ? `${t('uploading')} ${pct}% · ${formatBytes((file.size * pct) / 100)}`
          : t('uploading');
      queueItem.setState(label, 30 + pct * 0.6);
    });

    queueItem.setState(t('finishing'), 92);
    const done = await api(
      `/trip-api/trips/${encodeURIComponent(trip.secret)}/uploads/complete`,
      { method: 'POST', body: JSON.stringify(payload) },
    );
    if (done.status === 'alreadyExists') {
      queueItem.setState(t('alreadyExists'), 100);
    } else if (done.status === 'restored') {
      queueItem.setState(t('restored'), 100);
    } else {
      queueItem.setState(t('uploaded'), 100);
    }
    queueItem.markDone();
  }

  function putWithProgress(url, file, headers, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      Object.entries(headers).forEach(([key, value]) => {
        xhr.setRequestHeader(key, value);
      });
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        onProgress(Math.round((event.loaded / event.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else {
          const detail = (xhr.responseText || '').slice(0, 180);
          reject(
            new Error(
              detail
                ? `Upload failed (${xhr.status}): ${detail}`
                : `Upload failed (${xhr.status})`,
            ),
          );
        }
      };
      xhr.onerror = () =>
        reject(
          new Error(
            'Upload network error (check CSP/CORS to DigitalOcean Spaces)',
          ),
        );
      xhr.send(file);
    });
  }

  async function processFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    // Show the queue immediately (before the name modal) so mobile users see
    // that the picker selection was accepted.
    uploadPanel.hidden = false;
    retryFailedBtn.hidden = true;
    uploadQueue.innerHTML = '';
    const batchItems = files.map((file) => {
      const item = makeQueueItem(file);
      item.setState(t('waiting'), 0);
      uploadQueue.appendChild(item.el);
      return item;
    });
    activeUploadItems = batchItems;
    refreshOverallProgress();
    uploadPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    await ensureDisplayName();

    // Keep a local list so a second pick can't steal this batch's workers.
    const items = batchItems;
    let index = 0;
    const concurrency = Math.min(
      /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 1 : CONCURRENCY,
      items.length,
    );
    async function worker() {
      while (index < items.length) {
        const current = items[index++];
        if (!current) break;
        try {
          await uploadOne(current.file, current);
        } catch (error) {
          current.setState(
            `${t('failed')}: ${error.message || ''}`.trim(),
            100,
          );
          current.markFailed(true);
        }
      }
    }
    await Promise.all(
      Array.from({ length: concurrency }, () => worker()),
    );
    refreshOverallProgress();
    syncRetryButton();
    loadMedia._thumbTries = 0;
    await loadMedia();
  }

  /** Serialize batches — overlapping processFiles races on mobile. */
  let uploadChain = Promise.resolve();

  fileInput.addEventListener('change', () => {
    // Copy first: resetting value clears the live FileList in Chrome/Safari,
    // so processFiles would see zero files and silently do nothing.
    const files = Array.from(fileInput.files || []);
    fileInput.value = '';
    if (!files.length) return;
    uploadChain = uploadChain
      .catch(() => undefined)
      .then(() => processFiles(files))
      .catch((error) => {
        showStatus(error?.message || t('failed'), true);
      });
  });

  // --- Montage projects (Google admin only) ---

  function montageStorageKey() {
    return trip ? `trip-active-project:${trip.secret}` : '';
  }

  function projectsBase() {
    return `/trip-api/trips/${encodeURIComponent(trip.secret)}/projects`;
  }

  function clipCountInActiveProject(mediaId) {
    if (!activeMontageProject?.clips) return 0;
    return activeMontageProject.clips.filter((c) => c.mediaId === mediaId)
      .length;
  }

  function formatDurationSec(seconds) {
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
      return '';
    }
    const total = Math.round(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n) => String(n).padStart(2, '0');
    if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
    return `${m}:${pad(s)}`;
  }

  /** Merge clip.media with gallery row so size/duration stay visible. */
  function montageMediaFields(clip) {
    const fromClip = clip?.media || {};
    const fromGallery =
      media.find((row) => row.id === (clip?.mediaId || fromClip.id)) || {};
    const size =
      fromClip.size != null
        ? fromClip.size
        : fromGallery.size != null
          ? fromGallery.size
          : null;
    const durationMs =
      fromClip.durationMs != null
        ? fromClip.durationMs
        : fromGallery.durationMs != null
          ? fromGallery.durationMs
          : null;
    return {
      ...fromGallery,
      ...fromClip,
      size,
      durationMs,
      thumbUrl: fromClip.thumbUrl || fromGallery.thumbUrl || null,
      url: fromClip.url || fromGallery.url || null,
      originalFilename:
        fromClip.originalFilename || fromGallery.originalFilename || null,
      displayName: fromClip.displayName || fromGallery.displayName || null,
    };
  }

  /** Effective clip length after trim (seconds), or null if unknown. */
  function montageClipDurationSec(clip) {
    const mediaItem = montageMediaFields(clip);
    const sourceSec =
      mediaItem.durationMs != null && Number.isFinite(mediaItem.durationMs)
        ? mediaItem.durationMs / 1000
        : null;
    const start =
      clip.trimStartSec != null && Number.isFinite(clip.trimStartSec)
        ? Math.max(0, clip.trimStartSec)
        : 0;
    const end =
      clip.trimEndSec != null && Number.isFinite(clip.trimEndSec)
        ? clip.trimEndSec
        : sourceSec;
    if (end == null || !Number.isFinite(end)) return null;
    return Math.max(0, end - start);
  }

  function montageProjectDurationSec(project) {
    if (!project?.clips?.length) return null;
    let total = 0;
    let known = 0;
    for (const clip of project.clips) {
      const sec = montageClipDurationSec(clip);
      if (sec == null) continue;
      total += sec;
      known += 1;
    }
    if (!known) return null;
    return total;
  }

  function setMontageOpen(open) {
    montageOpen = open;
    montagePanel.hidden = !open;
    montageToggleBtn.classList.toggle('is-active', open);
    if (open && trip?.isAdmin) void loadMontageProjects();
  }

  montageToggleBtn.addEventListener('click', () => {
    if (!trip?.isAdmin) {
      showStatus(t('montageNeedLogin'), true);
      return;
    }
    setMontageOpen(!montageOpen);
  });
  montageCloseBtn.addEventListener('click', () => setMontageOpen(false));

  async function loadMontageProjects() {
    if (!trip?.isAdmin) return;
    try {
      montageProjects = await api(projectsBase());
    } catch (error) {
      if (String(error.message || '').includes('админ') || String(error.message || '').includes('admin')) {
        montageToggleBtn.hidden = true;
        setMontageOpen(false);
        showStatus(t('montageNeedLogin'), true);
        return;
      }
      showStatus(error.message || t('loadFailed'), true);
      return;
    }
    renderMontageProjectsList();
    const savedId = Number(localStorage.getItem(montageStorageKey()) || 0);
    const preferred =
      (activeMontageProject &&
        montageProjects.find((p) => p.id === activeMontageProject.id)?.id) ||
      (savedId && montageProjects.find((p) => p.id === savedId)?.id) ||
      montageProjects[0]?.id;
    if (preferred) {
      await openMontageProject(preferred);
    } else {
      activeMontageProject = null;
      selectedMontageClipId = null;
      renderMontageDetail();
    }
  }

  function renderMontageProjectsList() {
    montageProjectsList.innerHTML = '';
    if (!montageProjects.length) {
      const empty = document.createElement('p');
      empty.className = 'trip-montage__empty';
      empty.textContent = t('montageEmptyProjects');
      montageProjectsList.appendChild(empty);
      return;
    }
    montageProjects.forEach((project) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className =
        'trip-montage__project' +
        (activeMontageProject?.id === project.id ? ' is-active' : '');
      const name = document.createElement('span');
      name.className = 'trip-montage__project-name';
      name.textContent = project.name;
      const meta = document.createElement('span');
      meta.className = 'trip-montage__project-meta';
      meta.textContent = `${project.clipCount} ${t('montageClips')}`;
      row.append(name, meta);
      row.addEventListener('click', () => openMontageProject(project.id));
      montageProjectsList.appendChild(row);
    });
  }

  async function openMontageProject(projectId) {
    activeMontageProject = await api(`${projectsBase()}/${projectId}`);
    localStorage.setItem(montageStorageKey(), String(projectId));
    if (
      selectedMontageClipId &&
      !activeMontageProject.clips.some((c) => c.id === selectedMontageClipId)
    ) {
      selectedMontageClipId = null;
    }
    renderMontageProjectsList();
    renderMontageDetail();
    renderGallery();
  }

  function renderMontageDetail() {
    montageDetail.innerHTML = '';
    if (!activeMontageProject) {
      montageDetail.hidden = true;
      return;
    }
    montageDetail.hidden = false;

    const head = document.createElement('div');
    head.className = 'trip-montage__detail-head';
    const title = document.createElement('h3');
    title.textContent = activeMontageProject.name;
    head.appendChild(title);

    const actions = document.createElement('div');
    actions.className = 'trip-montage__detail-actions';

    const renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.className = 'mini-btn';
    renameBtn.textContent = t('montageRename');
    renameBtn.addEventListener('click', () => void renameMontageProject());
    actions.appendChild(renameBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'mini-btn danger-btn';
    deleteBtn.textContent = t('montageDelete');
    deleteBtn.addEventListener('click', () => void deleteMontageProject());
    actions.appendChild(deleteBtn);

    head.appendChild(actions);
    montageDetail.appendChild(head);

    const summary = document.createElement('p');
    summary.className = 'trip-montage__summary';
    const clipCount = activeMontageProject.clips.length;
    const totalSec = montageProjectDurationSec(activeMontageProject);
    const totalLabel =
      totalSec != null
        ? t('montageTotalDuration').replace(
            '{duration}',
            formatDurationSec(totalSec),
          )
        : t('montageTotalDurationUnknown');
    summary.textContent = clipCount
      ? `${clipCount} ${t('montageClips')} · ${totalLabel}`
      : t('montageEmptyClips');
    montageDetail.appendChild(summary);

    if (!activeMontageProject.clips.length) {
      return;
    }

    const clips = document.createElement('div');
    clips.className = 'trip-montage__clips';
    activeMontageProject.clips.forEach((clip, index) => {
      clips.appendChild(buildMontageClipRow(clip, index));
    });
    montageDetail.appendChild(clips);
  }

  function buildMontageClipRow(clip, index) {
    const mediaItem = montageMediaFields(clip);
    const card = document.createElement('article');
    card.className = 'trip-montage__clip';

    const mediaBtn = document.createElement('div');
    mediaBtn.className = 'trip-montage__clip-media';
    const filename = mediaItem.originalFilename || clip.mediaId;
    mediaBtn.title = `${String(index + 1).padStart(2, '0')}. ${filename}`;

    const indexBadge = document.createElement('span');
    indexBadge.className = 'trip-montage__clip-index';
    indexBadge.textContent = String(index + 1).padStart(2, '0');
    mediaBtn.appendChild(indexBadge);

    if (clip.trimmedVideoUrl) {
      const trimmedBadge = document.createElement('span');
      trimmedBadge.className = 'trip-montage__clip-badge';
      trimmedBadge.textContent = t('montageTrimmed');
      mediaBtn.appendChild(trimmedBadge);
    }

    const clipDurationSec = montageClipDurationSec(clip);
    if (clipDurationSec != null) {
      const durationBadge = document.createElement('span');
      durationBadge.className = 'trip-montage__clip-duration';
      durationBadge.textContent = formatDurationSec(clipDurationSec);
      mediaBtn.appendChild(durationBadge);
    }

    if (mediaItem.thumbUrl) {
      const img = document.createElement('img');
      img.src = mediaItem.thumbUrl;
      img.alt = '';
      img.loading = 'lazy';
      mediaBtn.appendChild(img);
    } else {
      const fallback = document.createElement('span');
      fallback.className = 'trip-montage__clip-fallback';
      fallback.textContent = '▶';
      mediaBtn.appendChild(fallback);
    }

    card.appendChild(mediaBtn);

    const footer = document.createElement('div');
    footer.className = 'trip-montage__clip-footer';

    const meta = document.createElement('div');
    meta.className = 'trip-montage__clip-meta';
    const sourceSec =
      mediaItem.durationMs != null && Number.isFinite(mediaItem.durationMs)
        ? mediaItem.durationMs / 1000
        : null;
    const start = clip.trimStartSec ?? 0;
    const end = clip.trimEndSec != null ? clip.trimEndSec : sourceSec;
    const rangeLabel =
      end == null
        ? `${formatDurationSec(start)}–…`
        : `${formatDurationSec(start)}–${formatDurationSec(end)}`;
    const sizeLabel =
      mediaItem.size != null && Number.isFinite(Number(mediaItem.size))
        ? formatBytes(Number(mediaItem.size))
        : '';
    const lengthLabel =
      clipDurationSec != null
        ? formatDurationSec(clipDurationSec)
        : t('montageDurationUnknown');
    meta.textContent = [sizeLabel, lengthLabel].filter(Boolean).join(' · ');
    meta.title = [sizeLabel, rangeLabel].filter(Boolean).join(' · ');
    footer.appendChild(meta);

    const tools = document.createElement('div');
    tools.className = 'trip-montage__clip-tools';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'ghost-btn icon-btn';
    remove.textContent = '✕';
    remove.title = '✕';
    remove.addEventListener('click', (event) => {
      event.stopPropagation();
      void removeMontageClip(clip);
    });
    tools.append(remove);
    footer.appendChild(tools);
    card.appendChild(footer);
    return card;
  }

  async function removeMontageClip(clip) {
    const name = clip.media?.originalFilename || clip.mediaId;
    const ok = await askConfirm(t('montageRemoveClipConfirm', { name }), {
      confirmLabel: t('dialogDelete'),
      danger: true,
    });
    if (!ok) return;
    await api(
      `${projectsBase()}/${activeMontageProject.id}/clips/${clip.id}`,
      { method: 'DELETE' },
    );
    if (selectedMontageClipId === clip.id) selectedMontageClipId = null;
    await openMontageProject(activeMontageProject.id);
    await loadMontageProjects();
  }

  async function addMediaToMontage(item) {
    if (!trip?.isAdmin) {
      showStatus(t('montageNeedLogin'), true);
      return;
    }
    setMontageOpen(true);
    if (!montageProjects.length) await loadMontageProjects();
    let projectId = activeMontageProject?.id;
    if (!projectId) {
      if (!montageProjects.length) {
        const name = await askPrompt(
          t('montageRenamePrompt'),
          trip.title || 'Project',
          { title: t('montageCreate') },
        );
        if (!name || !name.trim()) return;
        const created = await api(projectsBase(), {
          method: 'POST',
          body: JSON.stringify({ name: name.trim() }),
        });
        projectId = created.id;
        localStorage.setItem(montageStorageKey(), String(projectId));
      } else {
        projectId = montageProjects[0].id;
      }
    }
    await api(`${projectsBase()}/${projectId}/clips`, {
      method: 'POST',
      body: JSON.stringify({ mediaId: item.id }),
    });
    await openMontageProject(projectId);
    await loadMontageProjects();
  }

  montageCreateForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!trip?.isAdmin) return;
    const name = montageNameInput.value.trim();
    if (!name) return;
    try {
      const created = await api(projectsBase(), {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      montageNameInput.value = '';
      localStorage.setItem(montageStorageKey(), String(created.id));
      await loadMontageProjects();
      await openMontageProject(created.id);
    } catch (error) {
      showStatus(error.message || t('failed'), true);
    }
  });

  async function renameMontageProject() {
    const name = await askPrompt(
      t('montageRenamePrompt'),
      activeMontageProject.name,
      { title: t('montageRename') },
    );
    if (!name || !name.trim() || name.trim() === activeMontageProject.name) {
      return;
    }
    await api(`${projectsBase()}/${activeMontageProject.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: name.trim() }),
    });
    await loadMontageProjects();
  }

  async function deleteMontageProject() {
    const ok = await askConfirm(
      t('montageDeleteConfirm', { name: activeMontageProject.name }),
      {
        confirmLabel: t('dialogDelete'),
        danger: true,
      },
    );
    if (!ok) return;
    await api(`${projectsBase()}/${activeMontageProject.id}`, {
      method: 'DELETE',
    });
    localStorage.removeItem(montageStorageKey());
    activeMontageProject = null;
    selectedMontageClipId = null;
    await loadMontageProjects();
  }

  // Boot
  getContributorId();
  const secret = parseSecretFromPath();
  if (secret) {
    createView.hidden = true;
    albumView.hidden = false;
    void loadTrip(secret).catch((error) => {
      showStatus(error.message || t('loadFailed'), true);
    });
  } else {
    showCreate();
  }
})();
