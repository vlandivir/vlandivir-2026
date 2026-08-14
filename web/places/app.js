(() => {
  const API_BASE = '/map-api';
  const KEY_STORAGE = 'serbia-map-api-key';
  const DEFAULT_CENTER = [44.2, 20.9]; // Belgrade area until features load
  const LIST_PAGE_SIZE = 10;
  const MAX_TRACK_POINTS = 5000;

  const map = L.map('map', {
    center: DEFAULT_CENTER,
    zoom: 7,
  });

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  // Each track gets its own colour from the palette (by id, stable across reloads)
  const TRACK_COLORS = [
    '#e0417f',
    '#2a6df4',
    '#0f9d58',
    '#f4900c',
    '#8e44ad',
    '#00acc1',
    '#d84315',
    '#5d8a26',
    '#c2185b',
    '#3949ab',
  ];

  function trackColor(track) {
    return TRACK_COLORS[track.id % TRACK_COLORS.length];
  }

  function trackStyle(track, selected = false) {
    return {
      color: trackColor(track),
      weight: selected ? 6 : 4,
      opacity: selected ? 1 : 0.85,
    };
  }

  const TRACK_PREVIEW_STYLE = {
    color: '#2a6df4',
    weight: 4,
    opacity: 0.7,
    dashArray: '6 8',
  };

  const state = {
    points: [],
    tracks: [],
    tags: [], // [{id, name, emoji}] — the editable dictionary
    markers: new Map(), // point id -> Leaflet marker
    trackLayers: new Map(), // track id -> Leaflet polyline
    selected: null, // { kind: 'point' | 'track', feature }
    editMode: false,
    draftMarker: null, // temporary marker from a pasted Google Maps link
    draftTrackLayer: null, // preview polyline for a GPX being added
    // Current form target: kind 'point' | 'track', editing = existing feature
    // being changed (null = creating), latlng for new points, trackPoints for
    // new tracks.
    form: null,
    filters: { kind: '', author: '', tag: '' },
    listLimit: LIST_PAGE_SIZE,
  };

  // Tag dictionary is editable and lives in the DB (see the 🏷 editor)
  function tagLabel(name) {
    const tag = state.tags.find((t) => t.name === name);
    return tag?.emoji ? `${tag.emoji} ${name}` : name;
  }

  const el = (id) => document.getElementById(id);
  const searchInput = el('search-input');
  const searchResults = el('search-results');
  const editToggle = el('edit-toggle');
  const editHint = el('edit-hint');
  const backdrop = el('modal-backdrop');
  const pointForm = el('point-form');
  const recentList = el('recent-list');
  const gpxButton = el('gpx-upload');
  const gpxInput = el('gpx-file-input');
  const sidePanel = el('side-panel');
  const drawerOverlay = el('drawer-overlay');

  const isMobile = () => window.matchMedia('(max-width: 899px)').matches;

  // --- Mobile drawer ---

  function openDrawer() {
    sidePanel.classList.add('open');
    drawerOverlay.classList.remove('hidden');
  }

  function closeDrawer() {
    sidePanel.classList.remove('open');
    drawerOverlay.classList.add('hidden');
  }

  el('drawer-open').addEventListener('click', openDrawer);
  el('drawer-close').addEventListener('click', closeDrawer);
  drawerOverlay.addEventListener('click', closeDrawer);

  // --- Loading ---

  async function loadFeatures() {
    const [pointsResponse, tracksResponse, tagsResponse] = await Promise.all([
      fetch(`${API_BASE}/points`),
      fetch(`${API_BASE}/tracks`),
      fetch(`${API_BASE}/tags`),
    ]);
    if (pointsResponse.ok) {
      state.points = await pointsResponse.json();
      state.points.forEach(addMarker);
    }
    if (tracksResponse.ok) {
      state.tracks = await tracksResponse.json();
      state.tracks.forEach(addTrackLayer);
    }
    if (tagsResponse.ok) {
      state.tags = await tagsResponse.json();
    }
    renderRecentPanel();

    // Without a shared link, open on everything that's on the map
    const hasSharedFeature = openFeatureFromUrl();
    if (!hasSharedFeature) {
      const bounds = L.latLngBounds([]);
      state.points.forEach((p) => bounds.extend([p.latitude, p.longitude]));
      state.tracks.forEach((t) => t.points.forEach((p) => bounds.extend(p)));
      if (bounds.isValid()) map.fitBounds(bounds.pad(0.2));
    }
  }

  // --- Selection (details are rendered in the side panel) ---

  function selectFeature(kind, feature, { fly = false } = {}) {
    if (state.selected?.kind === 'track') {
      const previous = state.selected.feature;
      state.trackLayers.get(previous.id)?.setStyle(trackStyle(previous));
    }
    state.selected = { kind, feature };
    if (kind === 'track') {
      state.trackLayers.get(feature.id)?.setStyle(trackStyle(feature, true));
    }
    renderDetails();
    applyMapFilter(); // selecting a track hides the other tracks
    history.replaceState(null, '', `/places/${kind}/${feature.id}`);
    if (fly) flyToFeature(kind, feature);
    if (isMobile()) openDrawer();
  }

  function clearSelection() {
    if (state.selected?.kind === 'track') {
      const previous = state.selected.feature;
      state.trackLayers.get(previous.id)?.setStyle(trackStyle(previous));
    }
    state.selected = null;
    renderDetails();
    applyMapFilter(); // bring the hidden tracks back
    history.replaceState(null, '', '/places/');
  }

  function flyToFeature(kind, feature) {
    if (kind === 'track') {
      map.flyToBounds(L.latLngBounds(feature.points).pad(0.2));
    } else {
      map.flyTo([feature.latitude, feature.longitude], 14);
    }
  }

  function featureUrl(kind, feature) {
    return `${location.origin}/places/${kind}/${feature.id}`;
  }

  function openFeatureFromUrl() {
    // Path form (/places/point/3) with legacy hash (#p=3) fallback
    const pathMatch = /^\/places\/(point|track)\/(\d+)\/?$/.exec(
      location.pathname,
    );
    const hashMatch = /^#(p|t)=(\d+)$/.exec(location.hash);
    let kind;
    let id;
    if (pathMatch) {
      kind = pathMatch[1];
      id = Number(pathMatch[2]);
    } else if (hashMatch) {
      kind = hashMatch[1] === 'p' ? 'point' : 'track';
      id = Number(hashMatch[2]);
    } else {
      return false;
    }
    const source = kind === 'point' ? state.points : state.tracks;
    const feature = source.find((f) => f.id === id);
    if (feature) selectFeature(kind, feature, { fly: true });
    return Boolean(feature);
  }

  window.addEventListener('hashchange', openFeatureFromUrl);
  window.addEventListener('popstate', openFeatureFromUrl);

  // --- Details panel ---

  function renderDetails() {
    const details = el('feature-details');
    const empty = el('empty-state');
    details.innerHTML = '';

    if (!state.selected) {
      details.classList.add('hidden');
      empty.classList.remove('hidden');
      return;
    }
    details.classList.remove('hidden');
    empty.classList.add('hidden');

    const { kind, feature } = state.selected;

    const closeButton = document.createElement('button');
    closeButton.className = 'details-close';
    closeButton.title = 'Закрыть';
    closeButton.textContent = '✕';
    closeButton.addEventListener('click', () => {
      clearSelection();
      if (isMobile()) closeDrawer();
    });
    details.appendChild(closeButton);

    const kicker = document.createElement('p');
    kicker.className = 'details-kicker';
    kicker.textContent =
      kind === 'track'
        ? `Трек · ${trackDistanceKm(feature.points)} км`
        : 'Точка на карте';
    details.appendChild(kicker);

    const title = document.createElement('h2');
    title.textContent = feature.name;
    details.appendChild(title);

    if (feature.tags?.length) {
      const tagsRow = document.createElement('div');
      tagsRow.className = 'details-tags';
      feature.tags.forEach((tag) => {
        const chip = document.createElement('span');
        chip.className = 'details-tag';
        chip.textContent = tagLabel(tag);
        tagsRow.appendChild(chip);
      });
      details.appendChild(tagsRow);
    }

    if (feature.description) {
      const description = document.createElement('p');
      description.className = 'details-description';
      description.textContent = feature.description;
      details.appendChild(description);
    }

    if (feature.instagramUrl) {
      const metaLine = document.createElement('div');
      metaLine.className = 'details-insta-meta';
      metaLine.id = 'details-insta-meta';
      renderInstagramMetaLine(metaLine, feature.instagramMeta);
      details.appendChild(metaLine);
      refreshInstagramMeta(kind, feature);
    }

    if (feature.instagramUrl && isInstagramPostUrl(feature.instagramUrl)) {
      const wrap = document.createElement('div');
      wrap.className = 'details-player';
      const embed = document.createElement('blockquote');
      embed.className = 'instagram-media';
      embed.setAttribute(
        'data-instgrm-permalink',
        canonicalInstagramUrl(feature.instagramUrl),
      );
      embed.setAttribute('data-instgrm-version', '14');
      wrap.appendChild(embed);
      details.appendChild(wrap);
      processInstagramEmbeds();
    }

    const actions = document.createElement('div');
    actions.className = 'details-actions';

    const showButton = document.createElement('button');
    showButton.className = 'mini-btn';
    showButton.textContent = '🗺 Показать на карте';
    showButton.addEventListener('click', () => {
      flyToFeature(kind, feature);
      if (isMobile()) closeDrawer();
    });
    actions.appendChild(showButton);

    if (feature.instagramUrl) {
      const link = document.createElement('a');
      link.className = 'mini-btn instagram-btn';
      link.href = feature.instagramUrl;
      link.target = '_blank';
      link.rel = 'noopener';
      link.innerHTML =
        '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">' +
        '<rect x="2" y="2" width="20" height="20" rx="5.5" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<circle cx="17.3" cy="6.7" r="1.4" fill="currentColor"/>' +
        '</svg><span>Instagram</span>';
      actions.appendChild(link);
    }

    const shareButton = document.createElement('button');
    shareButton.className = 'mini-btn';
    shareButton.textContent = '🔗 Поделиться';
    shareButton.addEventListener('click', () =>
      shareFeature(kind, feature, shareButton),
    );
    actions.appendChild(shareButton);

    if (kind === 'track') {
      const gpxButton = document.createElement('button');
      gpxButton.className = 'mini-btn';
      gpxButton.textContent = '⬇ GPX';
      gpxButton.addEventListener('click', () => downloadTrackGpx(feature));
      actions.appendChild(gpxButton);
    }

    if (state.editMode) {
      const editButton = document.createElement('button');
      editButton.className = 'mini-btn';
      editButton.textContent = 'Изменить';
      editButton.addEventListener('click', () =>
        openForm({ kind, editing: feature }),
      );
      actions.appendChild(editButton);

      if (feature.instagramUrl) {
        const refreshButton = document.createElement('button');
        refreshButton.className = 'mini-btn';
        refreshButton.textContent = '↻ Обновить reels';
        refreshButton.addEventListener('click', async () => {
          refreshButton.disabled = true;
          refreshButton.textContent = '↻ Обновляю…';
          const ok = await refreshInstagramMeta(kind, feature, true);
          refreshButton.disabled = false;
          refreshButton.textContent = '↻ Обновить reels';
          if (!ok) alert('Не удалось получить данные reels из Instagram');
        });
        actions.appendChild(refreshButton);
      }

      const deleteButton = document.createElement('button');
      deleteButton.className = 'mini-btn danger-btn';
      deleteButton.textContent = 'Удалить';
      deleteButton.addEventListener('click', () =>
        deleteFeature(kind, feature),
      );
      actions.appendChild(deleteButton);
    }

    details.appendChild(actions);
  }

  // Official Instagram embed script: it builds the iframe itself and keeps
  // its height in sync with the content, so nothing inside gets distorted.
  function processInstagramEmbeds() {
    if (window.instgrm?.Embeds) {
      window.instgrm.Embeds.process();
      return;
    }
    if (!document.getElementById('instagram-embed-js')) {
      const script = document.createElement('script');
      script.id = 'instagram-embed-js';
      script.src = 'https://www.instagram.com/embed.js';
      script.async = true;
      document.body.appendChild(script);
    }
  }

  function isInstagramPostUrl(url) {
    return /instagram\.com\/(?:[^/]+\/)?(reels?|p|tv)\//.test(url);
  }

  // Instagram's embed script only accepts canonical /reel/ permalinks, but
  // links copied from the web UI often come as /reels/
  function canonicalInstagramUrl(url) {
    return url.replace(/(instagram\.com(?:\/[^/]+)?)\/reels\//, '$1/reel/');
  }

  function downloadTrackGpx(track) {
    const escapeXml = (text) =>
      text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    const pointsXml = track.points
      .map(([lat, lng]) => `      <trkpt lat="${lat}" lon="${lng}"/>`)
      .join('\n');
    const gpx = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="vlandivir.com">',
      '  <trk>',
      `    <name>${escapeXml(track.name)}</name>`,
      '    <trkseg>',
      pointsXml,
      '    </trkseg>',
      '  </trk>',
      '</gpx>',
      '',
    ].join('\n');

    const blob = new Blob([gpx], { type: 'application/gpx+xml' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${track.name.replace(/[\\/:*?"<>|]+/g, '_')}.gpx`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function shareFeature(kind, feature, button) {
    const url = featureUrl(kind, feature);

    if (navigator.share) {
      try {
        await navigator.share({ title: feature.name, url });
        return;
      } catch {
        // user cancelled the share sheet — fall back to copying
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      const original = button.textContent;
      button.textContent = '✓ Скопировано';
      setTimeout(() => {
        button.textContent = original;
      }, 1500);
    } catch {
      await window.AppDialog.prompt('Ссылка:', url);
    }
  }

  // --- Instagram metadata (author, date, counters) ---

  function renderInstagramMetaLine(container, meta) {
    container.innerHTML = '';
    if (!meta) return;

    if (meta.username) {
      const author = document.createElement('a');
      author.href = `https://www.instagram.com/${meta.username}/`;
      author.target = '_blank';
      author.rel = 'noopener';
      author.textContent = '@' + meta.username;
      if (meta.fullName) author.title = meta.fullName;
      container.appendChild(author);
    }

    const addPart = (text) => {
      const span = document.createElement('span');
      span.textContent = text;
      container.appendChild(span);
    };

    if (meta.publishedAt) {
      addPart(
        new Date(meta.publishedAt).toLocaleDateString('ru-RU', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
      );
    }
    if (typeof meta.likeCount === 'number') addPart(`❤ ${meta.likeCount}`);
    if (typeof meta.commentCount === 'number') {
      addPart(`💬 ${meta.commentCount}`);
    }
  }

  // Ask the server to refresh cached reel metadata (it re-fetches from
  // Instagram at most once a day) and update the open panel in place.
  // Editors can force a refresh past that window; force requires the API key.
  async function refreshInstagramMeta(kind, feature, force = false) {
    const resource = kind === 'track' ? 'tracks' : 'points';
    try {
      const response = await fetch(
        `${API_BASE}/${resource}/${feature.id}/instagram-meta` +
          (force ? '?force=1' : ''),
        {
          method: 'POST',
          headers: force ? { 'x-map-api-key': getApiKey() } : {},
        },
      );
      if (!response.ok) return false;
      const { instagramMeta, refreshed } = await response.json();
      if (!instagramMeta) return false;
      feature.instagramMeta = instagramMeta;
      if (state.selected?.feature === feature) {
        const container = document.getElementById('details-insta-meta');
        if (container) renderInstagramMetaLine(container, instagramMeta);
      }
      if (refreshed) renderRecentPanel(); // new cover/author may have appeared
      return true;
    } catch {
      // metadata is best-effort decoration
      return false;
    }
  }


  // --- Markers and track layers ---

  function addMarker(point) {
    const marker = L.marker([point.latitude, point.longitude]).addTo(map);
    marker.on('click', () => selectFeature('point', point));
    state.markers.set(point.id, marker);
  }

  function removeMarker(pointId) {
    const marker = state.markers.get(pointId);
    if (marker) {
      map.removeLayer(marker);
      state.markers.delete(pointId);
    }
    state.points = state.points.filter((p) => p.id !== pointId);
  }

  function addTrackLayer(track) {
    // Unlike markers, path clicks bubble to the map by default, and the map's
    // click handler would immediately clear the selection again
    const polyline = L.polyline(track.points, {
      ...trackStyle(track),
      bubblingMouseEvents: false,
    }).addTo(map);
    polyline.on('click', () => selectFeature('track', track));
    state.trackLayers.set(track.id, polyline);
  }

  function removeTrackLayer(trackId) {
    const layer = state.trackLayers.get(trackId);
    if (layer) {
      map.removeLayer(layer);
      state.trackLayers.delete(trackId);
    }
    state.tracks = state.tracks.filter((t) => t.id !== trackId);
  }

  map.on('click', () => {
    if (state.editMode) return; // don't fight with double-click adding
    if (state.selected) clearSelection();
  });

  // --- Places list (covers, meta, filters, pagination) ---

  // Newest video first; places without a reel fall back to when they were added
  function featureDate(feature) {
    return new Date(feature.instagramMeta?.publishedAt || feature.createdAt);
  }

  function allFeatures() {
    return [
      ...state.points.map((p) => ({ kind: 'point', feature: p })),
      ...state.tracks.map((t) => ({ kind: 'track', feature: t })),
    ].sort((a, b) => featureDate(b.feature) - featureDate(a.feature));
  }

  function matchesFilters(kind, feature) {
    if (state.filters.kind && kind !== state.filters.kind) return false;
    if (
      state.filters.author &&
      feature.instagramMeta?.username !== state.filters.author
    ) {
      return false;
    }
    if (
      state.filters.tag &&
      !(feature.tags || []).includes(state.filters.tag)
    ) {
      return false;
    }
    return true;
  }

  function renderRecentPanel() {
    updateAuthorFilter();
    updateTagFilter();
    applyMapFilter();
    recentList.innerHTML = '';

    const filtered = allFeatures().filter(({ kind, feature }) =>
      matchesFilters(kind, feature),
    );

    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'recent-empty';
      empty.textContent = 'Ничего не найдено';
      recentList.appendChild(empty);
      el('list-more').classList.add('hidden');
      return;
    }

    filtered.slice(0, state.listLimit).forEach(({ kind, feature }) => {
      recentList.appendChild(buildListItem(kind, feature));
    });

    const moreButton = el('list-more');
    const remaining = filtered.length - state.listLimit;
    moreButton.classList.toggle('hidden', remaining <= 0);
    if (remaining > 0) {
      moreButton.textContent = `Показать ещё (${remaining})`;
    }
  }

  function buildListItem(kind, feature) {
    const item = document.createElement('button');
    item.className = 'recent-item';

    const meta = feature.instagramMeta;
    const coverSrc = meta?.coverUrl || meta?.thumbnailUrl;
    if (coverSrc) {
      const cover = document.createElement('img');
      cover.className = 'recent-cover';
      cover.src = coverSrc;
      cover.alt = '';
      cover.loading = 'lazy';
      item.appendChild(cover);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'recent-cover recent-cover-placeholder';
      placeholder.textContent = kind === 'track' ? '🚴' : '📍';
      item.appendChild(placeholder);
    }

    const body = document.createElement('div');
    body.className = 'recent-body';

    const name = document.createElement('div');
    name.className = 'recent-name';
    name.textContent =
      (kind === 'track' ? '🚴 ' : '') + feature.name;
    body.appendChild(name);

    const metaLine = document.createElement('div');
    metaLine.className = 'recent-meta';
    const parts = [];
    if (meta?.username) parts.push('@' + meta.username);
    const date = meta?.publishedAt || feature.createdAt;
    parts.push(new Date(date).toLocaleDateString('ru-RU'));
    if (typeof meta?.likeCount === 'number') parts.push(`❤ ${meta.likeCount}`);
    if (kind === 'track') {
      parts.push(`${trackDistanceKm(feature.points)} км`);
    }
    (feature.tags || []).forEach((tag) => parts.push(tagLabel(tag)));
    metaLine.textContent = parts.join(' · ');
    body.appendChild(metaLine);

    item.appendChild(body);
    item.addEventListener('click', () =>
      selectFeature(kind, feature, { fly: true }),
    );
    return item;
  }

  function updateAuthorFilter() {
    const select = el('filter-author');
    const current = select.value;
    const authors = [
      ...new Set(
        allFeatures()
          .map(({ feature }) => feature.instagramMeta?.username)
          .filter(Boolean),
      ),
    ].sort();

    select.innerHTML = '';
    const all = document.createElement('option');
    all.value = '';
    all.textContent = 'Все авторы';
    select.appendChild(all);
    authors.forEach((author) => {
      const option = document.createElement('option');
      option.value = author;
      option.textContent = '@' + author;
      select.appendChild(option);
    });
    if (authors.includes(current)) select.value = current;
  }

  function updateTagFilter() {
    const select = el('filter-tag');
    const current = select.value;
    const used = allFeatures().flatMap(({ feature }) => feature.tags || []);
    const tags = [
      ...new Set([...state.tags.map((tag) => tag.name), ...used]),
    ].sort();

    select.innerHTML = '';
    const all = document.createElement('option');
    all.value = '';
    all.textContent = 'Все теги';
    select.appendChild(all);
    tags.forEach((tag) => {
      const option = document.createElement('option');
      option.value = tag;
      option.textContent = tagLabel(tag);
      select.appendChild(option);
    });
    if (tags.includes(current)) select.value = current;
  }

  function applyMapFilter() {
    state.points.forEach((point) => {
      const marker = state.markers.get(point.id);
      if (!marker) return;
      const visible = matchesFilters('point', point);
      if (visible && !map.hasLayer(marker)) marker.addTo(map);
      if (!visible && map.hasLayer(marker)) map.removeLayer(marker);
    });
    // While a track is selected, it is the only track on the map
    const selectedTrackId =
      state.selected?.kind === 'track' ? state.selected.feature.id : null;
    state.tracks.forEach((track) => {
      const layer = state.trackLayers.get(track.id);
      if (!layer) return;
      const visible =
        matchesFilters('track', track) &&
        (selectedTrackId === null || track.id === selectedTrackId);
      if (visible && !map.hasLayer(layer)) layer.addTo(map);
      if (!visible && map.hasLayer(layer)) map.removeLayer(layer);
    });
  }

  el('filter-kind').addEventListener('change', (event) => {
    state.filters.kind = event.target.value;
    state.listLimit = LIST_PAGE_SIZE;
    renderRecentPanel();
  });

  el('filter-author').addEventListener('change', (event) => {
    state.filters.author = event.target.value;
    state.listLimit = LIST_PAGE_SIZE;
    renderRecentPanel();
  });

  el('filter-tag').addEventListener('change', (event) => {
    state.filters.tag = event.target.value;
    state.listLimit = LIST_PAGE_SIZE;
    renderRecentPanel();
  });

  el('list-more').addEventListener('click', () => {
    state.listLimit += LIST_PAGE_SIZE;
    renderRecentPanel();
  });

  // --- Edit mode ---

  function getApiKey() {
    return localStorage.getItem(KEY_STORAGE) || '';
  }

  async function verifyKey(key) {
    const response = await fetch(`${API_BASE}/key-check`, {
      method: 'POST',
      headers: key ? { 'x-map-api-key': key } : {},
    });
    return response.ok;
  }

  async function ensureKey() {
    // Passes with the Google session cookie alone, or with a stored legacy key
    if (await verifyKey(getApiKey())) return true;
    location.href = `/auth/google?redirect=${encodeURIComponent(
      location.pathname + location.search,
    )}`;
    return false;
  }

  editToggle.addEventListener('click', async () => {
    if (state.editMode) {
      setEditMode(false);
      return;
    }
    if (await ensureKey()) setEditMode(true);
  });

  function setEditMode(enabled) {
    state.editMode = enabled;
    editToggle.classList.toggle('active', enabled);
    editHint.classList.toggle('hidden', !enabled);
    gpxButton.classList.toggle('hidden', !enabled);
    el('tag-editor-open').classList.toggle('hidden', !enabled);
    // Double click is reserved for adding points while editing
    if (enabled) {
      map.doubleClickZoom.disable();
    } else {
      map.doubleClickZoom.enable();
    }
    renderDetails(); // edit/delete buttons appear or disappear
  }

  map.on('dblclick', (event) => {
    if (!state.editMode) return;
    openForm({ kind: 'point', editing: null, latlng: event.latlng });
  });

  // --- GPX upload ---

  gpxButton.addEventListener('click', () => gpxInput.click());

  gpxInput.addEventListener('change', async () => {
    const file = gpxInput.files && gpxInput.files[0];
    gpxInput.value = '';
    if (!file) return;

    const text = await file.text();
    const rawPoints = parseGpx(text);
    if (!rawPoints || rawPoints.length < 2) {
      alert('Не удалось прочитать точки трека из этого GPX-файла');
      return;
    }

    const points = simplifyTrack(smoothTrack(rawPoints));
    if (points.length > MAX_TRACK_POINTS) {
      alert('Трек слишком длинный даже после упрощения');
      return;
    }

    if (state.form?.kind === 'track') {
      // The track form is open — replace its route with the new file
      state.form.trackPoints = points;
      drawDraftTrack(points);
      // A fresh recording again starts/ends at home — restore default trim
      el('form-trim-start').value = 500;
      el('form-trim-end').value = 500;
      el('form-coords').textContent =
        `Новый файл: ${points.length} точек, ${trackDistanceKm(points)} км`;
      return;
    }

    showDraftTrack(points, file.name.replace(/\.gpx$/i, ''));
  });

  el('form-replace-gpx').addEventListener('click', () => gpxInput.click());

  function parseGpx(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.querySelector('parsererror')) return null;

    let elements = doc.getElementsByTagName('trkpt');
    if (!elements.length) {
      elements = doc.getElementsByTagName('rtept');
    }

    return [...elements]
      .map((element) => [
        Number(element.getAttribute('lat')),
        Number(element.getAttribute('lon')),
      ])
      .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
  }

  // Moving average flattens GPS jitter; endpoints stay fixed.
  function smoothTrack(points, windowSize = 5) {
    if (points.length <= windowSize) return points;
    const half = Math.floor(windowSize / 2);
    return points.map((point, index) => {
      if (index < half || index >= points.length - half) return point;
      let lat = 0;
      let lng = 0;
      for (let i = index - half; i <= index + half; i++) {
        lat += points[i][0];
        lng += points[i][1];
      }
      return [lat / windowSize, lng / windowSize];
    });
  }

  // Douglas-Peucker; tolerance in degrees (~0.0001 ≈ 10 m).
  function simplifyTrack(points, tolerance = 0.0001) {
    if (points.length <= 2) return points;

    const keep = new Array(points.length).fill(false);
    keep[0] = keep[points.length - 1] = true;
    const stack = [[0, points.length - 1]];

    while (stack.length) {
      const [start, end] = stack.pop();
      let maxDistance = 0;
      let maxIndex = start;

      for (let i = start + 1; i < end; i++) {
        const distance = pointToSegment(points[i], points[start], points[end]);
        if (distance > maxDistance) {
          maxDistance = distance;
          maxIndex = i;
        }
      }

      if (maxDistance > tolerance) {
        keep[maxIndex] = true;
        stack.push([start, maxIndex], [maxIndex, end]);
      }
    }

    return points.filter((_, index) => keep[index]);
  }

  function pointToSegment([py, px], [ay, ax], [by, bx]) {
    const dx = bx - ax;
    const dy = by - ay;
    if (dx === 0 && dy === 0) {
      return Math.hypot(px - ax, py - ay);
    }
    let t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  // Cut the given number of meters off both ends, interpolating the exact
  // cut position on the segment where it falls. Returns null if the cuts
  // would consume (almost) the whole track.
  function trimTrack(points, startMeters, endMeters) {
    const cumulative = [0];
    for (let i = 1; i < points.length; i++) {
      cumulative.push(
        cumulative[i - 1] + map.distance(points[i - 1], points[i]),
      );
    }
    const total = cumulative[cumulative.length - 1];
    if (startMeters + endMeters >= total - 10) return null;

    const from = startMeters;
    const to = total - endMeters;
    const pointAt = (target) => {
      let i = 1;
      while (cumulative[i] < target) i++;
      const segment = cumulative[i] - cumulative[i - 1] || 1;
      const t = (target - cumulative[i - 1]) / segment;
      return [
        points[i - 1][0] + (points[i][0] - points[i - 1][0]) * t,
        points[i - 1][1] + (points[i][1] - points[i - 1][1]) * t,
      ];
    };

    const result = [];
    if (from > 0) result.push(pointAt(from));
    for (let i = 0; i < points.length; i++) {
      if (cumulative[i] > from && cumulative[i] < to) result.push(points[i]);
    }
    if (endMeters > 0) result.push(pointAt(to));
    return result.length >= 2 ? result : null;
  }

  function trackDistanceKm(points) {
    let meters = 0;
    for (let i = 1; i < points.length; i++) {
      meters += map.distance(points[i - 1], points[i]);
    }
    return (meters / 1000).toFixed(1);
  }

  function drawDraftTrack(points) {
    removeDraftTrack();
    const layer = L.polyline(points, TRACK_PREVIEW_STYLE).addTo(map);
    state.draftTrackLayer = layer;
    map.flyToBounds(layer.getBounds().pad(0.2));
  }

  function showDraftTrack(points, suggestedName) {
    drawDraftTrack(points);
    if (isMobile()) closeDrawer();
    openForm({
      kind: 'track',
      editing: null,
      trackPoints: points,
      prefillName: suggestedName,
    });
  }

  function removeDraftTrack() {
    if (state.draftTrackLayer) {
      map.removeLayer(state.draftTrackLayer);
      state.draftTrackLayer = null;
    }
  }

  // --- Google Maps links ---

  function isGoogleMapsLink(text) {
    return /(google\.[a-z.]+\/maps|maps\.app\.goo\.gl\/|goo\.gl\/maps)/.test(
      text,
    );
  }

  function parseGoogleMapsUrl(url) {
    // Pin coordinates (!3d..!4d..) are more precise than the viewport (@..)
    const pin = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(url);
    if (pin) return { lat: Number(pin[1]), lng: Number(pin[2]) };
    const viewport = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(url);
    if (viewport) {
      return { lat: Number(viewport[1]), lng: Number(viewport[2]) };
    }
    const query =
      /[?&](?:q|query|ll|destination)=(-?\d+(?:\.\d+)?)(?:,|%2C)(-?\d+(?:\.\d+)?)/.exec(
        url,
      );
    if (query) return { lat: Number(query[1]), lng: Number(query[2]) };
    return null;
  }

  function parseGoogleMapsPlaceName(url) {
    const match = /\/maps\/place\/([^/@?]+)/.exec(url);
    if (!match) return '';
    try {
      return decodeURIComponent(match[1].replace(/\+/g, ' '));
    } catch {
      return '';
    }
  }

  async function expandGoogleMapsLink(url) {
    let coords = parseGoogleMapsUrl(url);
    if (coords) return { coords, name: parseGoogleMapsPlaceName(url) };

    // Short link — expand it on the server
    const response = await fetch(
      `${API_BASE}/resolve-google-link?url=${encodeURIComponent(url)}`,
    );
    if (!response.ok) return null;
    const { url: resolved } = await response.json();
    coords = parseGoogleMapsUrl(resolved);
    if (!coords) return null;
    return { coords, name: parseGoogleMapsPlaceName(resolved) };
  }

  function showDraftMarker(coords, name) {
    removeDraftMarker();
    const marker = L.marker([coords.lat, coords.lng], {
      draggable: true,
      opacity: 0.7,
    }).addTo(map);
    state.draftMarker = marker;

    marker.bindPopup(() => {
      const container = document.createElement('div');

      const title = document.createElement('div');
      title.className = 'popup-title';
      title.textContent = name || 'Точка из Google Maps';
      container.appendChild(title);

      const hint = document.createElement('div');
      hint.className = 'popup-hint';
      hint.textContent = 'Маркер можно перетащить для уточнения места';
      container.appendChild(hint);

      const addButton = document.createElement('button');
      addButton.className = 'primary-btn';
      addButton.textContent = '➕ Добавить точку';
      addButton.addEventListener('click', async () => {
        if (!(await ensureKey())) return;
        if (!state.editMode) setEditMode(true);
        openForm({
          kind: 'point',
          editing: null,
          latlng: marker.getLatLng(),
          prefillName: name,
        });
      });
      container.appendChild(addButton);

      return container;
    });

    map.flyTo([coords.lat, coords.lng], 16);
    setTimeout(() => marker.openPopup(), 600);
  }

  function removeDraftMarker() {
    if (state.draftMarker) {
      map.removeLayer(state.draftMarker);
      state.draftMarker = null;
    }
  }

  // --- Form (shared between points and tracks) ---

  const formTags = el('form-tags');

  // Rebuilt on every form open — the dictionary is editable at runtime
  function setFormTags(selected) {
    formTags.innerHTML = '';
    const names = [
      ...new Set([...state.tags.map((tag) => tag.name), ...selected]),
    ];
    names.forEach((name) => {
      const chip = document.createElement('label');
      chip.className = 'tag-chip';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = name;
      input.checked = selected.includes(name);
      chip.appendChild(input);
      chip.appendChild(document.createTextNode(tagLabel(name)));
      formTags.appendChild(chip);
    });
  }

  function getFormTags() {
    return [...formTags.querySelectorAll('input:checked')].map(
      (input) => input.value,
    );
  }

  function openForm({ kind, editing, latlng, trackPoints, prefillName }) {
    state.form = { kind, editing, latlng, trackPoints };

    const titles = {
      point: editing ? 'Редактировать точку' : 'Новая точка',
      track: editing ? 'Редактировать трек' : 'Новый трек',
    };
    el('form-title').textContent = titles[kind];
    el('form-name').value = editing ? editing.name : prefillName || '';
    el('form-description').value = editing?.description || '';
    el('form-instagram').value = editing?.instagramUrl || '';
    setFormTags(editing?.tags || []);

    el('form-trim-row').classList.toggle('hidden', kind !== 'track');
    el('form-track-tools').classList.toggle('hidden', kind !== 'track');
    if (kind === 'point') {
      const coords = editing
        ? { lat: editing.latitude, lng: editing.longitude }
        : latlng;
      state.form.latlng = coords;
      el('form-coords').textContent =
        `Координаты: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`;
    } else {
      // Trimming an already saved track again would eat it up on every save,
      // so editing defaults to 0.
      el('form-trim-start').value = editing ? 0 : 500;
      el('form-trim-end').value = editing ? 0 : 500;
      const points = editing ? editing.points : trackPoints;
      el('form-coords').textContent =
        `Трек: ${points.length} точек, ${trackDistanceKm(points)} км`;
    }

    el('point-form-modal').classList.remove('hidden');
    el('tag-editor-modal').classList.add('hidden');
    backdrop.classList.remove('hidden');
    el('form-name').focus();
  }

  function closeModals() {
    const wasTrackForm = state.form?.kind === 'track';
    backdrop.classList.add('hidden');
    state.form = null;
    // Cancelled/finished track form — the dashed preview has no owner anymore
    if (wasTrackForm) removeDraftTrack();
  }

  el('form-cancel').addEventListener('click', closeModals);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) closeModals();
  });

  // --- Tag editor ---

  const tagEditorList = el('tag-editor-list');

  function openTagEditor() {
    renderTagEditor();
    el('point-form-modal').classList.add('hidden');
    el('tag-editor-modal').classList.remove('hidden');
    backdrop.classList.remove('hidden');
  }

  el('tag-editor-open').addEventListener('click', openTagEditor);
  el('tag-editor-close').addEventListener('click', closeModals);

  function renderTagEditor() {
    tagEditorList.innerHTML = '';
    state.tags.forEach((tag) => {
      const row = document.createElement('div');
      row.className = 'tag-editor-row';

      const emojiInput = document.createElement('input');
      emojiInput.type = 'text';
      emojiInput.maxLength = 4;
      emojiInput.value = tag.emoji || '';
      row.appendChild(emojiInput);

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.maxLength = 50;
      nameInput.value = tag.name;
      row.appendChild(nameInput);

      const saveButton = document.createElement('button');
      saveButton.type = 'button';
      saveButton.className = 'ghost-btn';
      saveButton.textContent = '💾';
      saveButton.title = 'Сохранить изменения';
      saveButton.addEventListener('click', () =>
        saveTag(tag, nameInput.value, emojiInput.value),
      );
      row.appendChild(saveButton);

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'ghost-btn';
      deleteButton.textContent = '🗑';
      deleteButton.title = 'Удалить тег';
      deleteButton.addEventListener('click', () => deleteTag(tag));
      row.appendChild(deleteButton);

      tagEditorList.appendChild(row);
    });

    if (!state.tags.length) {
      const empty = document.createElement('div');
      empty.className = 'recent-empty';
      empty.textContent = 'Тегов пока нет — добавьте первый';
      tagEditorList.appendChild(empty);
    }
  }

  async function saveTag(tag, name, emoji) {
    const response = await fetch(`${API_BASE}/tags/${tag.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-map-api-key': getApiKey(),
      },
      body: JSON.stringify({ name, emoji }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      alert(error?.message || 'Не удалось сохранить тег');
      return;
    }
    const saved = await response.json();
    if (saved.name !== tag.name) {
      // The server already renamed it on every feature — mirror that locally
      [...state.points, ...state.tracks].forEach((feature) => {
        if (feature.tags) {
          feature.tags = feature.tags.map((t) =>
            t === tag.name ? saved.name : t,
          );
        }
      });
      if (state.filters.tag === tag.name) state.filters.tag = saved.name;
    }
    Object.assign(tag, saved);
    state.tags.sort((a, b) => a.name.localeCompare(b.name));
    renderTagEditor();
    renderRecentPanel();
    renderDetails();
  }

  async function deleteTag(tag) {
    const ok = await window.AppDialog.confirm(
      `Удалить тег «${tag.name}»? Он будет снят со всех точек и треков.`,
      { danger: true, confirmLabel: 'Удалить' },
    );
    if (!ok) return;
    const response = await fetch(`${API_BASE}/tags/${tag.id}`, {
      method: 'DELETE',
      headers: { 'x-map-api-key': getApiKey() },
    });
    if (!response.ok) {
      alert('Не удалось удалить тег');
      return;
    }
    [...state.points, ...state.tracks].forEach((feature) => {
      if (feature.tags) {
        feature.tags = feature.tags.filter((t) => t !== tag.name);
      }
    });
    if (state.filters.tag === tag.name) state.filters.tag = '';
    state.tags = state.tags.filter((t) => t.id !== tag.id);
    renderTagEditor();
    renderRecentPanel();
    renderDetails();
  }

  el('new-tag-add').addEventListener('click', async () => {
    const name = el('new-tag-name').value.trim();
    if (!name) return;
    const response = await fetch(`${API_BASE}/tags`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-map-api-key': getApiKey(),
      },
      body: JSON.stringify({ name, emoji: el('new-tag-emoji').value.trim() }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      alert(error?.message || 'Не удалось добавить тег');
      return;
    }
    state.tags.push(await response.json());
    state.tags.sort((a, b) => a.name.localeCompare(b.name));
    el('new-tag-name').value = '';
    el('new-tag-emoji').value = '';
    renderTagEditor();
    renderRecentPanel();
  });

  pointForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.form) return;
    const { kind, editing, latlng, trackPoints } = state.form;

    const body = {
      name: el('form-name').value,
      description: el('form-description').value,
      instagramUrl: el('form-instagram').value,
      tags: getFormTags(),
    };
    if (kind === 'point') {
      body.latitude = latlng.lat;
      body.longitude = latlng.lng;
    } else {
      const trimStart = Math.max(0, Number(el('form-trim-start').value) || 0);
      const trimEnd = Math.max(0, Number(el('form-trim-end').value) || 0);
      // trackPoints is set when creating or after "replace GPX" while editing
      const replaced = Boolean(trackPoints);
      let points = replaced ? trackPoints : editing?.points;
      if (trimStart > 0 || trimEnd > 0) {
        points = trimTrack(points, trimStart, trimEnd);
        if (!points) {
          alert('Обрезка больше длины трека — уменьшите значения');
          return;
        }
        body.points = points;
      } else if (!editing || replaced) {
        body.points = points;
      }
    }

    const resource = kind === 'track' ? 'tracks' : 'points';
    const url = editing
      ? `${API_BASE}/${resource}/${editing.id}`
      : `${API_BASE}/${resource}`;
    const response = await fetch(url, {
      method: editing ? 'PATCH' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-map-api-key': getApiKey(),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      alert(error?.message || 'Не удалось сохранить');
      return;
    }

    const saved = await response.json();
    if (kind === 'point') {
      if (editing) removeMarker(editing.id);
      state.points.push(saved);
      addMarker(saved);
      removeDraftMarker();
    } else {
      if (editing) removeTrackLayer(editing.id);
      state.tracks.push(saved);
      addTrackLayer(saved);
      removeDraftTrack();
    }
    renderRecentPanel();
    closeModals();
    selectFeature(kind, saved);
  });

  async function deleteFeature(kind, feature) {
    const label = kind === 'track' ? 'трек' : 'точку';
    const ok = await window.AppDialog.confirm(
      `Удалить ${label} «${feature.name}»?`,
      { danger: true, confirmLabel: 'Удалить' },
    );
    if (!ok) return;

    const resource = kind === 'track' ? 'tracks' : 'points';
    const response = await fetch(`${API_BASE}/${resource}/${feature.id}`, {
      method: 'DELETE',
      headers: { 'x-map-api-key': getApiKey() },
    });

    if (!response.ok) {
      alert('Не удалось удалить');
      return;
    }

    if (kind === 'track') {
      removeTrackLayer(feature.id);
    } else {
      removeMarker(feature.id);
    }
    clearSelection();
    renderRecentPanel();
  }

  // --- Search ---

  let searchTimer = null;

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const query = searchInput.value.trim();
    if (query.length < 2) {
      hideSearchResults();
      return;
    }
    searchTimer = setTimeout(() => runSearch(query), 400);
  });

  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hideSearchResults();
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.search-box')) hideSearchResults();
  });

  async function runSearch(query) {
    if (isGoogleMapsLink(query)) {
      renderGoogleLinkResult(query);
      return;
    }

    const lowerQuery = query.toLowerCase();
    const matchesQuery = (feature) =>
      feature.name.toLowerCase().includes(lowerQuery) ||
      (feature.description || '').toLowerCase().includes(lowerQuery);
    const localMatches = [
      ...state.points
        .filter(matchesQuery)
        .map((p) => ({ kind: 'point', feature: p })),
      ...state.tracks
        .filter(matchesQuery)
        .map((t) => ({ kind: 'track', feature: t })),
    ];

    const [geoMatches, semanticMatches] = await Promise.all([
      searchNominatim(query),
      searchSemantic(query),
    ]);

    renderSearchResults(localMatches, geoMatches, semanticMatches);
  }

  async function searchNominatim(query) {
    try {
      const params = new URLSearchParams({
        format: 'jsonv2',
        limit: '6',
        q: query,
      });
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?${params}`,
        { headers: { Accept: 'application/json' } },
      );
      return response.ok ? await response.json() : [];
    } catch {
      return [];
    }
  }

  // Semantic search over map features that have an attached Instagram reel.
  // Resolves each hit back to the feature object already in state so it shares
  // selection/rendering with the rest of the UI.
  async function searchSemantic(query) {
    try {
      const response = await fetch(
        `${API_BASE}/search?q=${encodeURIComponent(query)}`,
      );
      if (!response.ok) return [];
      const data = await response.json();
      return (data.results || []).flatMap((result) => {
        const collection =
          result.type === 'track' ? state.tracks : state.points;
        const feature =
          collection.find((f) => f.id === result.feature.id) || result.feature;
        if (!feature) return [];
        return [
          {
            kind: result.type,
            feature,
            similarity: result.similarity,
            distanceKm: result.distanceKm,
          },
        ];
      });
    } catch {
      return [];
    }
  }

  function renderGoogleLinkResult(link) {
    searchResults.innerHTML = '';
    const item = document.createElement('button');
    item.className = 'search-result';
    item.innerHTML = '<span class="result-tag">🗺️</span>';
    item.appendChild(
      document.createTextNode('Перейти к точке из ссылки Google Maps'),
    );
    item.addEventListener('click', async () => {
      item.disabled = true;
      item.textContent = 'Открываю ссылку…';
      const result = await expandGoogleMapsLink(link).catch(() => null);
      hideSearchResults();
      searchInput.value = '';
      if (!result) {
        alert('Не удалось извлечь координаты из этой ссылки');
        return;
      }
      if (isMobile()) closeDrawer();
      showDraftMarker(result.coords, result.name);
    });
    searchResults.appendChild(item);
    searchResults.classList.remove('hidden');
  }

  function renderSearchResults(localMatches, geoMatches, semanticMatches = []) {
    searchResults.innerHTML = '';

    const shown = new Set();

    semanticMatches.slice(0, 6).forEach(({ kind, feature, distanceKm }) => {
      shown.add(`${kind}:${feature.id}`);
      const item = document.createElement('button');
      item.className = 'search-result';
      item.innerHTML = '<span class="result-tag">✨</span>';
      const label =
        typeof distanceKm === 'number'
          ? `${feature.name} · ${distanceKm} км`
          : feature.name;
      item.appendChild(document.createTextNode(label));
      item.addEventListener('click', () => {
        hideSearchResults();
        selectFeature(kind, feature, { fly: true });
      });
      searchResults.appendChild(item);
    });

    localMatches
      .filter(({ kind, feature }) => !shown.has(`${kind}:${feature.id}`))
      .slice(0, 5)
      .forEach(({ kind, feature }) => {
        const item = document.createElement('button');
        item.className = 'search-result';
        const tag = kind === 'track' ? '🚴' : '📍';
        item.innerHTML = `<span class="result-tag">${tag}</span>`;
        item.appendChild(document.createTextNode(feature.name));
        item.addEventListener('click', () => {
          hideSearchResults();
          selectFeature(kind, feature, { fly: true });
        });
        searchResults.appendChild(item);
      });

    geoMatches.forEach((place) => {
      const item = document.createElement('button');
      item.className = 'search-result';
      item.innerHTML = '<span class="result-tag">🔎</span>';
      item.appendChild(document.createTextNode(place.display_name));
      item.addEventListener('click', () => {
        hideSearchResults();
        if (isMobile()) closeDrawer();
        map.flyTo([Number(place.lat), Number(place.lon)], 13);
      });
      searchResults.appendChild(item);
    });

    if (!searchResults.childElementCount) {
      const empty = document.createElement('div');
      empty.className = 'search-result';
      empty.textContent = 'Ничего не найдено';
      searchResults.appendChild(empty);
    }

    searchResults.classList.remove('hidden');
  }

  function hideSearchResults() {
    searchResults.classList.add('hidden');
    searchResults.innerHTML = '';
  }

  loadFeatures();
})();
