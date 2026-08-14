import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import * as api from './api.js';
import { icons, withIcon } from './icons.js';

const els = {
  status: document.getElementById('status'),
  userLabel: document.getElementById('userLabel'),
  loginBtn: document.getElementById('loginBtn'),
  logoutBtn: document.getElementById('logoutBtn'),
  loginView: document.getElementById('loginView'),
  tripsView: document.getElementById('tripsView'),
  tripsList: document.getElementById('tripsList'),
  refreshTripsBtn: document.getElementById('refreshTripsBtn'),
  openCacheBtn: document.getElementById('openCacheBtn'),
  cacheView: document.getElementById('cacheView'),
  cacheBackBtn: document.getElementById('cacheBackBtn'),
  cacheClearBtn: document.getElementById('cacheClearBtn'),
  cachePageStats: document.getElementById('cachePageStats'),
  cacheFileCount: document.getElementById('cacheFileCount'),
  cacheGallery: document.getElementById('cacheGallery'),
  cachePreviewEmpty: document.getElementById('cachePreviewEmpty'),
  cachePreviewBody: document.getElementById('cachePreviewBody'),
  cachePreviewVideo: document.getElementById('cachePreviewVideo'),
  cachePreviewImage: document.getElementById('cachePreviewImage'),
  cachePreviewName: document.getElementById('cachePreviewName'),
  cachePreviewMeta: document.getElementById('cachePreviewMeta'),
  cachePreviewPath: document.getElementById('cachePreviewPath'),
  cachePreviewAlbums: document.getElementById('cachePreviewAlbums'),
  cachePreviewProjects: document.getElementById('cachePreviewProjects'),
  cacheRemoveFileBtn: document.getElementById('cacheRemoveFileBtn'),
  openCacheFromAlbumBtn: document.getElementById('openCacheFromAlbumBtn'),
  albumView: document.getElementById('albumView'),
  albumTitle: document.getElementById('albumTitle'),
  backBtn: document.getElementById('backBtn'),
  gallery: document.getElementById('gallery'),
  mediaCount: document.getElementById('mediaCount'),
  cacheStats: document.getElementById('cacheStats'),
  lightboxCacheStats: document.getElementById('lightboxCacheStats'),
  projectList: document.getElementById('projectList'),
  createProjectForm: document.getElementById('createProjectForm'),
  projectNameInput: document.getElementById('projectNameInput'),
  projectActions: document.getElementById('projectActions'),
  openProjectBtn: document.getElementById('openProjectBtn'),
  exportProjectBtn: document.getElementById('exportProjectBtn'),
  renameProjectBtn: document.getElementById('renameProjectBtn'),
  deleteProjectBtn: document.getElementById('deleteProjectBtn'),
  albumPreviewEmpty: document.getElementById('albumPreviewEmpty'),
  albumPreviewBody: document.getElementById('albumPreviewBody'),
  albumPreviewImage: document.getElementById('albumPreviewImage'),
  albumPreviewVideo: document.getElementById('albumPreviewVideo'),
  albumPreviewNeedCache: document.getElementById('albumPreviewNeedCache'),
  albumDownloadBtn: document.getElementById('albumDownloadBtn'),
  albumDownloadProgress: document.getElementById('albumDownloadProgress'),
  albumDownloadProgressBar: document.getElementById('albumDownloadProgressBar'),
  albumDownloadProgressLabel: document.getElementById('albumDownloadProgressLabel'),
  albumPreviewName: document.getElementById('albumPreviewName'),
  albumPreviewMeta: document.getElementById('albumPreviewMeta'),
  albumPreviewCache: document.getElementById('albumPreviewCache'),
  albumPreviewCacheActions: document.getElementById('albumPreviewCacheActions'),
  albumRemoveCacheBtn: document.getElementById('albumRemoveCacheBtn'),
  albumPreviewProjectActions: document.getElementById('albumPreviewProjectActions'),
  albumToggleProjectBtn: document.getElementById('albumToggleProjectBtn'),
  projectLightbox: document.getElementById('projectLightbox'),
  lightboxProjectTitle: document.getElementById('lightboxProjectTitle'),
  lightboxProjectStats: document.getElementById('lightboxProjectStats'),
  lightboxExportBtn: document.getElementById('lightboxExportBtn'),
  closeLightboxBtn: document.getElementById('closeLightboxBtn'),
  lightboxVideo: document.getElementById('lightboxVideo'),
  lightboxNeedCache: document.getElementById('lightboxNeedCache'),
  lightboxDownloadBtn: document.getElementById('lightboxDownloadBtn'),
  lightboxDownloadProgress: document.getElementById('lightboxDownloadProgress'),
  lightboxDownloadProgressBar: document.getElementById(
    'lightboxDownloadProgressBar',
  ),
  lightboxDownloadProgressLabel: document.getElementById(
    'lightboxDownloadProgressLabel',
  ),
  lightboxDownloadStatus: document.getElementById('lightboxDownloadStatus'),
  lightboxCacheActions: document.getElementById('lightboxCacheActions'),
  lightboxRemoveCacheBtn: document.getElementById('lightboxRemoveCacheBtn'),
  lightboxClipEmpty: document.getElementById('lightboxClipEmpty'),
  lightboxClipInfo: document.getElementById('lightboxClipInfo'),
  lightboxClipName: document.getElementById('lightboxClipName'),
  lightboxClipMeta: document.getElementById('lightboxClipMeta'),
  lightboxClipTrim: document.getElementById('lightboxClipTrim'),
  trimStartInput: document.getElementById('trimStartInput'),
  trimEndInput: document.getElementById('trimEndInput'),
  markStartBtn: document.getElementById('markStartBtn'),
  markEndBtn: document.getElementById('markEndBtn'),
  saveTrimBtn: document.getElementById('saveTrimBtn'),
  resetTrimBtn: document.getElementById('resetTrimBtn'),
  moveClipUpBtn: document.getElementById('moveClipUpBtn'),
  moveClipDownBtn: document.getElementById('moveClipDownBtn'),
  removeClipBtn: document.getElementById('removeClipBtn'),
  timelineTrack: document.getElementById('timelineTrack'),
  timelineSummary: document.getElementById('timelineSummary'),
};

/** @type {{ id: string, secret: string, title: string } | null} */
let currentTrip = null;
/** @type {any[]} */
let mediaItems = [];
/** @type {any[]} */
let projects = [];
/** @type {any | null} */
let activeProject = null;
/** @type {any | null} */
let selectedMedia = null;
/** @type {number | null} */
let selectedClipId = null;
/** @type {{ clipId: number, mediaId: string, localPath: string, isFragment?: boolean } | null} */
let trimContext = null;
/** @type {number} */
let previewToken = 0;
/** @type {Set<string>} */
let cachedMediaIds = new Set();
/** @type {Map<number, { bytes: number, path?: string, startSec?: number, endSec?: number, thumbUrl?: string | null }>} */
let fragmentByClipId = new Map();
/** Local ffprobe durations for cached originals (API durationMs is often null). */
/** @type {Map<string, number>} */
let localDurationMsByMediaId = new Map();
/** @type {Map<string, { media: any, album: { id: string, secret: string, title: string }, projects: Array<{ id: number, name: string }> }>} */
let mediaMembershipIndex = new Map();
/** @type {Array<{ media_id: string, file_name: string, path: string, bytes: number, ext: string }>} */
let cacheEntries = [];
/** @type {string | null} */
let selectedCacheMediaId = null;
/** @type {string | null} */
let activeDownloadMediaId = null;
/** @type {'album' | 'lightbox' | 'export' | null} */
let activeDownloadUi = null;

function progressTargets(ui) {
  if (ui === 'lightbox') {
    return {
      root: els.lightboxDownloadProgress,
      bar: els.lightboxDownloadProgressBar,
      label: els.lightboxDownloadProgressLabel,
    };
  }
  return {
    root: els.albumDownloadProgress,
    bar: els.albumDownloadProgressBar,
    label: els.albumDownloadProgressLabel,
  };
}

function resetDownloadProgress(ui = activeDownloadUi) {
  const targets = [];
  if (!ui || ui === 'album') targets.push(progressTargets('album'));
  if (!ui || ui === 'lightbox') targets.push(progressTargets('lightbox'));
  for (const t of targets) {
    if (!t.root) continue;
    t.root.hidden = true;
    t.root.classList.remove('is-indeterminate');
    if (t.bar) t.bar.style.width = '0%';
    if (t.label) t.label.textContent = '0%';
  }
}

function beginDownloadProgress(mediaId, ui) {
  activeDownloadMediaId = mediaKey(mediaId);
  activeDownloadUi = ui;
  if (ui === 'export') return;
  const t = progressTargets(ui);
  if (!t.root) return;
  t.root.hidden = false;
  t.root.classList.remove('is-indeterminate');
  if (t.bar) t.bar.style.width = '0%';
  if (t.label) t.label.textContent = '0%';
}

function endDownloadProgress() {
  resetDownloadProgress(activeDownloadUi);
  activeDownloadMediaId = null;
  activeDownloadUi = null;
}

function applyCacheProgress(payload) {
  if (!payload) return;
  const mediaId = mediaKey(payload.media_id ?? payload.mediaId);
  if (
    activeDownloadMediaId &&
    mediaId &&
    mediaId !== activeDownloadMediaId &&
    activeDownloadUi !== 'export'
  ) {
    return;
  }

  const received = Number(payload.received || 0);
  const total =
    payload.total != null && Number(payload.total) > 0
      ? Number(payload.total)
      : null;
  const percent =
    payload.percent != null
      ? Math.max(0, Math.min(100, Number(payload.percent)))
      : total
        ? Math.min(100, (received / total) * 100)
        : null;

  if (activeDownloadUi === 'export') {
    const label =
      percent != null
        ? `Кэш ${Math.round(percent)}% · ${formatBytes(received)}${
            total ? ` / ${formatBytes(total)}` : ''
          }`
        : `Кэш ${formatBytes(received)}…`;
    showStatus(label);
    return;
  }

  const ui = activeDownloadUi || 'album';
  const t = progressTargets(ui);
  if (!t.root) return;
  t.root.hidden = false;

  if (percent == null) {
    t.root.classList.add('is-indeterminate');
    if (t.bar) t.bar.style.width = '40%';
    if (t.label) t.label.textContent = `${formatBytes(received)}…`;
    return;
  }

  t.root.classList.remove('is-indeterminate');
  if (t.bar) t.bar.style.width = `${percent}%`;
  if (t.label) {
    t.label.textContent = total
      ? `${Math.round(percent)}% · ${formatBytes(received)} / ${formatBytes(total)}`
      : `${Math.round(percent)}% · ${formatBytes(received)}`;
  }
}

function showStatus(message, isError = false) {
  els.status.hidden = !message;
  els.status.textContent = message || '';
  els.status.classList.toggle('is-error', Boolean(isError));
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function formatDurationMs(ms) {
  if (ms == null || Number.isNaN(ms) || ms < 0) return '';
  const sec = Math.round(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  // Always MM:SS (minutes may exceed 59 for long projects).
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function padIndex(i, total) {
  const width = Math.max(2, String(total).length);
  return String(i).padStart(width, '0');
}

function sanitizeFilename(name) {
  return String(name || 'clip')
    .replace(/[^\w.\-()+ ]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function clipForMedia(mediaId) {
  return (activeProject?.clips || []).find((c) => c.mediaId === mediaId) || null;
}

function selectedClip() {
  return (activeProject?.clips || []).find((c) => c.id === selectedClipId) || null;
}

function selectedClipIndex() {
  if (!activeProject?.clips || selectedClipId == null) return -1;
  return activeProject.clips.findIndex((c) => c.id === selectedClipId);
}

function setButtonContent(el, iconHtml, label) {
  el.innerHTML = withIcon(iconHtml, label);
}

function initStaticIcons() {
  setButtonContent(els.albumDownloadBtn, icons.download, 'Загрузить локально');
  setButtonContent(els.lightboxDownloadBtn, icons.download, 'Загрузить локально');
  setButtonContent(els.albumRemoveCacheBtn, icons.trash, 'Удалить из кэша');
  setButtonContent(els.lightboxRemoveCacheBtn, icons.trash, 'Удалить из кэша');
  setButtonContent(els.cacheRemoveFileBtn, icons.trash, 'Удалить из кэша');
  els.closeLightboxBtn.innerHTML = icons.x;
  setButtonContent(els.markStartBtn, icons.flag, 'Старт = сейчас');
  setButtonContent(els.markEndBtn, icons.flagEnd, 'Конец = сейчас');
  setButtonContent(els.saveTrimBtn, icons.scissors, 'Вырезать отрезок');
  setButtonContent(els.resetTrimBtn, icons.rotateCcw, 'Сбросить');
  els.moveClipUpBtn.innerHTML = icons.chevronUp;
  els.moveClipDownBtn.innerHTML = icons.chevronDown;
  setButtonContent(els.removeClipBtn, icons.trash, 'Убрать');
}

async function refreshCacheStats() {
  try {
    const [stats, fragments, dir] = await Promise.all([
      invoke('get_cache_stats'),
      invoke('get_fragment_stats'),
      invoke('get_media_cache_dir').catch(() => ''),
    ]);
    const cachePart = `Кэш: ${stats.files} файл. · ${formatBytes(stats.bytes)}`;
    const fragPart =
      fragments.files > 0
        ? ` · Отрезки: ${fragments.files} · ${formatBytes(fragments.bytes)}`
        : '';
    const label = cachePart + fragPart;
    for (const el of [els.cacheStats, els.lightboxCacheStats, els.cachePageStats]) {
      if (!el) continue;
      el.textContent = label;
      el.title = dir || '';
    }
  } catch {
    for (const el of [els.cacheStats, els.lightboxCacheStats, els.cachePageStats]) {
      if (el) {
        el.textContent = '';
        el.title = '';
      }
    }
  }
}

async function refreshFragmentIndex() {
  try {
    const entries = await invoke('list_clip_fragments');
    const next = new Map();
    await Promise.all(
      (entries || []).map(async (entry) => {
        let thumbUrl = null;
        if (entry.thumb_path) {
          try {
            thumbUrl = await localVideoUrl(entry.thumb_path);
          } catch {
            thumbUrl = null;
          }
        }
        next.set(Number(entry.clip_id), {
          bytes: Number(entry.bytes) || 0,
          startSec: entry.start_sec,
          endSec: entry.end_sec,
          path: entry.path || undefined,
          thumbUrl,
        });
      }),
    );
    fragmentByClipId = next;
  } catch {
    fragmentByClipId = new Map();
  }
}

function clipEffectiveDurationMs(clip) {
  const frag = fragmentByClipId.get(Number(clip.id));
  if (frag) {
    const start = Number(frag.startSec ?? clip.trimStartSec ?? 0);
    const end = Number(frag.endSec ?? clip.trimEndSec);
    if (!Number.isNaN(start) && !Number.isNaN(end) && end > start) {
      return (end - start) * 1000;
    }
  }
  if (
    clip.trimStartSec != null &&
    clip.trimEndSec != null &&
    Number(clip.trimEndSec) > Number(clip.trimStartSec)
  ) {
    return (Number(clip.trimEndSec) - Number(clip.trimStartSec)) * 1000;
  }
  const media =
    clip.media || mediaItems.find((m) => m.id === clip.mediaId) || {};
  const fullMs =
    Number(media.durationMs) ||
    localDurationMsByMediaId.get(mediaKey(clip.mediaId)) ||
    0;
  const startSec =
    clip.trimStartSec != null ? Number(clip.trimStartSec) : 0;
  const endSec =
    clip.trimEndSec != null
      ? Number(clip.trimEndSec)
      : fullMs > 0
        ? fullMs / 1000
        : null;
  if (endSec != null && !Number.isNaN(startSec) && !Number.isNaN(endSec) && endSec > startSec) {
    return (endSec - startSec) * 1000;
  }
  return fullMs;
}

async function ensureLocalDurationMs(mediaId, localPath) {
  const key = mediaKey(mediaId);
  if (!key || localDurationMsByMediaId.has(key)) {
    return localDurationMsByMediaId.get(key) || null;
  }
  if (!localPath) return null;
  try {
    const ms = Number(
      await invoke('probe_media_duration_ms', { path: localPath }),
    );
    if (Number.isFinite(ms) && ms > 0) {
      localDurationMsByMediaId.set(key, ms);
      return ms;
    }
  } catch {
    /* ignore probe failures */
  }
  return null;
}

/** Fill durations for project clips from local cache when API has no durationMs. */
async function refreshLocalDurationsForProjects(list = projects) {
  const pending = new Map();
  for (const project of list || []) {
    for (const clip of project.clips || []) {
      if (fragmentByClipId.has(Number(clip.id))) continue;
      if (
        clip.trimStartSec != null &&
        clip.trimEndSec != null &&
        Number(clip.trimEndSec) > Number(clip.trimStartSec)
      ) {
        continue;
      }
      const media =
        clip.media || mediaItems.find((m) => m.id === clip.mediaId) || {};
      const key = mediaKey(clip.mediaId);
      if (!key) continue;
      if (Number(media.durationMs) > 0) {
        localDurationMsByMediaId.set(key, Number(media.durationMs));
        continue;
      }
      if (localDurationMsByMediaId.has(key) || pending.has(key)) continue;
      pending.set(key, clip.mediaId);
    }
  }
  await Promise.all(
    [...pending.entries()].map(async ([_key, mediaId]) => {
      try {
        const status = await getCacheStatus(mediaId);
        if (status?.cached && status.path) {
          await ensureLocalDurationMs(mediaId, status.path);
        }
      } catch {
        /* ignore */
      }
    }),
  );
}

function clipEffectiveBytes(clip) {
  const frag = fragmentByClipId.get(Number(clip.id));
  if (frag?.bytes) return Number(frag.bytes) || 0;
  const media =
    clip.media || mediaItems.find((m) => m.id === clip.mediaId) || {};
  return Number(media.size) || 0;
}

function computeProjectStats(project = activeProject) {
  const clips = project?.clips || [];
  let bytes = 0;
  let durationMs = 0;
  for (const clip of clips) {
    bytes += clipEffectiveBytes(clip);
    durationMs += clipEffectiveDurationMs(clip);
  }
  return {
    files: clips.length,
    bytes,
    durationMs,
  };
}

function formatProjectStatsLabel(stats) {
  if (!stats || !stats.files) return 'Нет клипов';
  return [
    `${stats.files} файл.`,
    formatBytes(stats.bytes),
    formatDurationMs(stats.durationMs),
  ].join(' · ');
}

function updateProjectStatsUi() {
  const stats = computeProjectStats(activeProject);
  const label = activeProject ? formatProjectStatsLabel(stats) : '';
  if (els.lightboxProjectStats) {
    els.lightboxProjectStats.textContent = activeProject ? label : '';
  }
  if (!els.projectList) return;
  for (const project of projects) {
    const row = els.projectList.querySelector(
      `[data-project-id="${project.id}"] .project-list__stats`,
    );
    if (!row) continue;
    const source =
      activeProject?.id === project.id ? activeProject : project;
    row.textContent = formatProjectStatsLabel(computeProjectStats(source));
  }
}

function isFragmentClip(clipId) {
  return fragmentByClipId.has(Number(clipId));
}

function fragmentInsertIndex(clips, sourceClipId, sourceMediaId) {
  const sourceIndex = clips.findIndex((c) => c.id === sourceClipId);
  if (sourceIndex < 0) return clips.length;
  let insertAt = sourceIndex + 1;
  while (insertAt < clips.length) {
    const clip = clips[insertAt];
    if (clip.mediaId === sourceMediaId && isFragmentClip(clip.id)) {
      insertAt += 1;
    } else {
      break;
    }
  }
  return insertAt;
}

function mediaKey(id) {
  return id == null ? '' : String(id);
}

function appendCacheBadge(parent) {
  const cacheBadge = document.createElement('span');
  cacheBadge.className = 'trip-card__badge trip-card__badge--cache';
  cacheBadge.title = 'В локальном кэше';
  cacheBadge.setAttribute('aria-label', 'В локальном кэше');
  cacheBadge.innerHTML = icons.hardDrive;
  parent.appendChild(cacheBadge);
  return cacheBadge;
}

function renderMembershipChips(container, label, items, emptyText) {
  if (!container) return;
  container.innerHTML = '';
  const title = document.createElement('p');
  title.className = 'section-kicker';
  title.textContent = label;
  container.appendChild(title);
  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = emptyText;
    container.appendChild(empty);
    return;
  }
  const row = document.createElement('div');
  row.className = 'cache-chip-row';
  for (const item of items) {
    const chip = document.createElement('span');
    chip.className = 'meta-chip';
    chip.textContent = item;
    row.appendChild(chip);
  }
  container.appendChild(row);
}

async function buildMediaMembershipIndex() {
  const next = new Map();
  const data = await api.listAdminTrips();
  const trips = data.trips || [];
  await Promise.all(
    trips.map(async (trip) => {
      const mediaData = await api.listMedia(trip.secret);
      for (const media of mediaData.media || []) {
        const id = mediaKey(media.id);
        if (!id) continue;
        next.set(id, {
          media,
          album: {
            id: trip.id,
            secret: trip.secret,
            title: trip.title || 'Альбом',
          },
          projects: [],
        });
      }
      const projectList = await api.listProjects(trip.secret);
      await Promise.all(
        (projectList || []).map(async (project) => {
          try {
            const full = await api.getProject(trip.secret, project.id);
            const name = full.name || project.name || `Проект ${project.id}`;
            for (const clip of full.clips || []) {
              const entry = next.get(mediaKey(clip.mediaId));
              if (!entry) continue;
              if (entry.projects.some((p) => p.id === project.id)) continue;
              entry.projects.push({ id: project.id, name });
            }
          } catch {
            /* skip broken project */
          }
        }),
      );
    }),
  );
  mediaMembershipIndex = next;
}

function clearCachePreview() {
  selectedCacheMediaId = null;
  els.cachePreviewEmpty.hidden = false;
  els.cachePreviewBody.hidden = true;
  els.cachePreviewVideo.hidden = true;
  els.cachePreviewVideo.removeAttribute('src');
  els.cachePreviewImage.hidden = true;
  els.cachePreviewImage.removeAttribute('src');
  els.cachePreviewAlbums.innerHTML = '';
  els.cachePreviewProjects.innerHTML = '';
}

async function showCachePreview(entry) {
  selectedCacheMediaId = mediaKey(entry.media_id);
  const membership = mediaMembershipIndex.get(selectedCacheMediaId);
  const media = membership?.media;
  els.cachePreviewEmpty.hidden = true;
  els.cachePreviewBody.hidden = false;
  els.cachePreviewVideo.hidden = true;
  els.cachePreviewVideo.removeAttribute('src');
  els.cachePreviewImage.hidden = true;
  els.cachePreviewImage.removeAttribute('src');

  els.cachePreviewName.textContent =
    media?.originalFilename || entry.file_name || entry.media_id;
  els.cachePreviewMeta.textContent = [
    formatBytes(entry.bytes),
    entry.ext ? entry.ext.toUpperCase() : null,
    media?.durationMs ? formatDurationMs(media.durationMs) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  els.cachePreviewPath.textContent = entry.path || '';
  els.cachePreviewPath.title = entry.path || '';

  renderMembershipChips(
    els.cachePreviewAlbums,
    'Альбом',
    membership?.album?.title ? [membership.album.title] : [],
    'Не найден на сервере',
  );
  renderMembershipChips(
    els.cachePreviewProjects,
    'Проекты',
    (membership?.projects || []).map((p) => p.name),
    'Не входит ни в один проект',
  );

  try {
    els.cachePreviewVideo.src = await localVideoUrl(entry.path);
    els.cachePreviewVideo.hidden = false;
  } catch (error) {
    if (media?.thumbUrl) {
      els.cachePreviewImage.src = media.thumbUrl;
      els.cachePreviewImage.hidden = false;
    }
    showStatus(error.message || String(error), true);
  }

  renderCacheGallery();
}

function renderCacheGallery() {
  els.cacheGallery.innerHTML = '';
  els.cacheFileCount.textContent = `${cacheEntries.length}`;
  for (const entry of cacheEntries) {
    const mediaId = mediaKey(entry.media_id);
    const membership = mediaMembershipIndex.get(mediaId);
    const media = membership?.media;
    const card = document.createElement('article');
    card.className =
      'trip-card' + (selectedCacheMediaId === mediaId ? ' is-selected' : '');
    card.tabIndex = 0;
    card.setAttribute('role', 'button');

    const mediaEl = document.createElement('div');
    mediaEl.className = 'trip-card__media is-video';
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.alt = '';
    img.src = media?.thumbUrl || media?.url || '';
    mediaEl.appendChild(img);
    appendCacheBadge(mediaEl);

    const footer = document.createElement('div');
    footer.className = 'trip-card__footer';
    const meta = document.createElement('div');
    meta.className = 'trip-card__meta';
    const title = media?.originalFilename || entry.file_name || mediaId;
    const albumLabel = membership?.album?.title || 'Неизвестный альбом';
    const projectLabels = (membership?.projects || [])
      .map((p) => p.name)
      .join(', ');
    meta.innerHTML = `<strong title="${escapeHtml(title)}">${escapeHtml(title)}</strong><span>${escapeHtml(albumLabel)}${projectLabels ? ' · ' + escapeHtml(projectLabels) : ''}</span><span>${formatBytes(entry.bytes)}</span>`;
    footer.appendChild(meta);

    card.append(mediaEl, footer);
    card.addEventListener('click', () => void showCachePreview(entry));
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        void showCachePreview(entry);
      }
    });
    els.cacheGallery.appendChild(card);
  }
}

async function openCacheView() {
  closeLightbox();
  els.tripsView.hidden = true;
  els.albumView.hidden = true;
  els.cacheView.hidden = false;
  showStatus('Загружаю кэш…');
  try {
    await Promise.all([buildMediaMembershipIndex(), refreshCacheStats()]);
    cacheEntries = await invoke('list_cached_media');
    clearCachePreview();
    renderCacheGallery();
    showStatus(cacheEntries.length ? '' : 'Локальный кэш пуст');
  } catch (error) {
    showStatus(error.message || String(error), true);
  }
}

function closeCacheView() {
  els.cacheView.hidden = true;
  clearCachePreview();
}

async function removeSelectedCacheFile() {
  if (!selectedCacheMediaId) return;
  if (!confirm('Удалить этот файл из локального кэша?')) return;
  await invoke('remove_cached_media', { mediaId: selectedCacheMediaId });
  cachedMediaIds.delete(selectedCacheMediaId);
  cacheEntries = cacheEntries.filter(
    (e) => mediaKey(e.media_id) !== selectedCacheMediaId,
  );
  clearCachePreview();
  renderCacheGallery();
  await refreshCacheStats();
  if (!els.albumView.hidden) renderMediaList();
  showStatus('Файл удалён из кэша');
}

async function resolveFragmentThumbUrl(thumbPath) {
  if (!thumbPath) return null;
  try {
    return await localVideoUrl(thumbPath);
  } catch {
    return null;
  }
}

/** Local video URL via custom `media://` protocol (Range streaming). */
async function localVideoUrl(path) {
  return invoke('media_file_url', { path });
}

async function getCacheStatus(mediaId) {
  return invoke('is_media_cached', { mediaId: mediaKey(mediaId) });
}

async function removeMediaFromCache(mediaId) {
  if (!mediaId) return false;
  if (!confirm('Удалить этот файл из локального кэша?')) return false;
  await invoke('remove_cached_media', { mediaId });
  cachedMediaIds.delete(mediaId);
  await refreshCacheStats();
  renderMediaList();
  if (els.projectLightbox.open) {
    renderTimeline();
  }
  showStatus('Файл удалён из кэша');
  return true;
}

async function refreshCachedMediaIds() {
  const videos = mediaItems.filter((m) => m.kind === 'video');
  const next = new Set();
  await Promise.all(
    videos.map(async (item) => {
      try {
        const status = await getCacheStatus(item.id);
        if (status.cached) next.add(mediaKey(item.id));
      } catch {
        /* ignore */
      }
    }),
  );
  cachedMediaIds = next;
}

function setAuthedUi(user) {
  const signedIn = Boolean(user);
  els.loginBtn.hidden = signedIn;
  els.logoutBtn.hidden = !signedIn;
  els.userLabel.textContent = signedIn
    ? user.name || user.email || ''
    : '';
  els.loginView.hidden = signedIn;
  els.tripsView.hidden = !signedIn;
  if (!signedIn) {
    els.albumView.hidden = true;
    els.cacheView.hidden = true;
    closeLightbox();
    closeCacheView();
    currentTrip = null;
    selectedMedia = null;
  }
}

async function bootstrap() {
  initStaticIcons();
  try {
    const base = await invoke('get_api_base');
    api.setApiBase(base);
    const saved = await invoke('get_session_token');
    if (saved) {
      api.setToken(saved);
      const me = await api.fetchMe();
      if (me?.authenticated) {
        setAuthedUi(me);
        await loadTrips();
        await refreshCacheStats();
        return;
      }
    }
  } catch (error) {
    api.setToken(null);
    await invoke('clear_session_token').catch(() => {});
    showStatus(error.message || String(error), true);
  }
  setAuthedUi(null);
}

async function login() {
  showStatus('Откройте браузер и войдите через Google…');
  els.loginBtn.disabled = true;
  try {
    const token = await invoke('login_with_google');
    api.setToken(token);
    const me = await api.fetchMe();
    if (!me?.authenticated) throw new Error('Login failed');
    setAuthedUi(me);
    showStatus(`Вошли как ${me.email}`);
    await loadTrips();
  } catch (error) {
    showStatus(error.message || String(error), true);
    setAuthedUi(null);
  } finally {
    els.loginBtn.disabled = false;
  }
}

async function logout() {
  api.setToken(null);
  await invoke('clear_session_token');
  setAuthedUi(null);
  showStatus('Вы вышли');
}

async function loadTrips() {
  showStatus('Загружаю альбомы…');
  const data = await api.listAdminTrips();
  els.tripsList.innerHTML = '';
  for (const trip of data.trips || []) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'trip-row';
    btn.innerHTML = `<span><strong>${escapeHtml(trip.title)}</strong><span class="muted">${trip.mediaCount} медиа · ${trip.projectCount} проект.</span></span>`;
    btn.addEventListener('click', () => void openTrip(trip));
    els.tripsList.appendChild(btn);
  }
  showStatus((data.trips || []).length ? '' : 'Альбомов пока нет');
}

async function openTrip(tripSummary) {
  showStatus('Открываю альбом…');
  closeCacheView();
  currentTrip = await api.getTrip(tripSummary.secret);
  els.albumTitle.textContent = currentTrip.title;
  els.tripsView.hidden = true;
  els.albumView.hidden = false;
  activeProject = null;
  selectedClipId = null;
  selectedMedia = null;
  clearAlbumPreview();
  const mediaData = await api.listMedia(currentTrip.secret);
  mediaItems = (mediaData.media || []).filter((m) => !m.deleted);
  await refreshCachedMediaIds();
  await refreshFragmentIndex();
  await loadProjects();
  await refreshCacheStats();
  showStatus('');
}

async function loadProjects() {
  if (!currentTrip) return;
  const previousId = activeProject?.id ?? null;
  const summaries = await api.listProjects(currentTrip.secret);
  projects = await Promise.all(
    (summaries || []).map(async (summary) => {
      try {
        return await api.getProject(currentTrip.secret, summary.id);
      } catch {
        return { ...summary, clips: [] };
      }
    }),
  );
  if (previousId && projects.some((p) => p.id === previousId)) {
    activeProject =
      projects.find((p) => p.id === previousId) ||
      (await api.getProject(currentTrip.secret, previousId));
  } else {
    activeProject = null;
  }
  await refreshLocalDurationsForProjects(projects);
  renderProjectList();
  renderMediaList();
  if (selectedMedia) {
    await showAlbumPreview(selectedMedia);
  }
  if (els.projectLightbox.open && activeProject) {
    renderLightbox();
  }
}

function syncActiveProjectInList() {
  if (!activeProject) return;
  const idx = projects.findIndex((p) => p.id === activeProject.id);
  if (idx >= 0) projects[idx] = activeProject;
  else projects.push(activeProject);
}

function renderProjectList() {
  const list = els.projectList;
  if (!list) return;
  list.innerHTML = '';
  if (!projects.length) {
    const empty = document.createElement('p');
    empty.className = 'muted project-list__empty';
    empty.textContent = 'Пока нет проектов — создайте первый выше';
    list.appendChild(empty);
  } else {
    for (const project of projects) {
      const stats = computeProjectStats(project);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className =
        'project-list__item' +
        (activeProject?.id === project.id ? ' is-selected' : '');
      btn.setAttribute('role', 'option');
      btn.setAttribute(
        'aria-selected',
        activeProject?.id === project.id ? 'true' : 'false',
      );
      btn.dataset.projectId = String(project.id);

      const name = document.createElement('span');
      name.className = 'project-list__name';
      name.textContent = project.name || `Проект ${project.id}`;

      const meta = document.createElement('span');
      meta.className = 'project-list__stats';
      meta.textContent = formatProjectStatsLabel(stats);

      btn.append(name, meta);
      btn.addEventListener('click', () => {
        void selectProjectById(Number(project.id)).catch((e) =>
          showStatus(e.message, true),
        );
      });
      btn.addEventListener('dblclick', () => {
        void (async () => {
          await selectProjectById(Number(project.id));
          await openLightbox();
        })().catch((e) => showStatus(e.message, true));
      });
      list.appendChild(btn);
    }
  }

  els.projectActions.hidden = !activeProject;
  if (activeProject) {
    els.exportProjectBtn.disabled = !(activeProject.clips?.length > 0);
  }
  const lightboxStats = computeProjectStats(activeProject);
  if (els.lightboxProjectStats) {
    els.lightboxProjectStats.textContent = activeProject
      ? formatProjectStatsLabel(lightboxStats)
      : '';
  }
}

async function selectProjectById(projectId) {
  if (!currentTrip) return;
  if (!projectId) {
    activeProject = null;
    selectedClipId = null;
    renderProjectList();
    renderMediaList();
    if (selectedMedia) await showAlbumPreview(selectedMedia);
    return;
  }
  activeProject = await api.getProject(currentTrip.secret, projectId);
  syncActiveProjectInList();
  selectedClipId = null;
  renderProjectList();
  renderMediaList();
  if (selectedMedia) await showAlbumPreview(selectedMedia);
}

function renderMediaList() {
  els.gallery.innerHTML = '';
  els.mediaCount.textContent = `${mediaItems.length}`;
  for (const item of mediaItems) {
    const inProjectClip =
      item.kind === 'video' ? clipForMedia(item.id) : null;
    const isCached = item.kind === 'video' && cachedMediaIds.has(mediaKey(item.id));

    const card = document.createElement('article');
    card.className =
      'trip-card' +
      (selectedMedia?.id === item.id ? ' is-selected' : '') +
      (inProjectClip ? ' is-in-project' : '');
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute(
      'aria-label',
      item.originalFilename || item.id || 'Медиа',
    );

    const media = document.createElement('div');
    media.className =
      'trip-card__media' + (item.kind === 'video' ? ' is-video' : '');
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.alt = '';
    img.src = item.thumbUrl || item.url || '';
    media.appendChild(img);

    if (isCached) {
      appendCacheBadge(media);
    }

    if (item.kind === 'video') {
      const playBadge = document.createElement('span');
      playBadge.className = 'trip-card__badge trip-card__badge--play';
      playBadge.innerHTML = icons.play;
      media.appendChild(playBadge);
    }

    if (activeProject && item.kind === 'video') {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className =
        'trip-card__badge trip-card__badge--toggle' +
        (inProjectClip ? ' is-remove' : '');
      toggle.title = inProjectClip ? 'Убрать из проекта' : 'Добавить в проект';
      toggle.setAttribute(
        'aria-label',
        inProjectClip ? 'Убрать из проекта' : 'Добавить в проект',
      );
      toggle.innerHTML = inProjectClip ? icons.minus : icons.plus;
      toggle.addEventListener('click', (event) => {
        event.stopPropagation();
        if (inProjectClip) {
          void removeClipFromProject(inProjectClip.id);
        } else {
          void addMediaToProject(item.id);
        }
      });
      media.appendChild(toggle);
    }

    const footer = document.createElement('div');
    footer.className = 'trip-card__footer';
    const meta = document.createElement('div');
    meta.className = 'trip-card__meta';
    meta.innerHTML = `<strong title="${escapeHtml(item.originalFilename || '')}">${escapeHtml(item.originalFilename || item.id)}</strong><span>${item.kind}${item.durationMs ? ' · ' + formatDurationMs(item.durationMs) : ''} · ${formatBytes(Number(item.size || 0))}</span>`;
    footer.appendChild(meta);

    card.append(media, footer);
    card.addEventListener('click', () => void selectAlbumMedia(item));
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        void selectAlbumMedia(item);
      }
    });
    els.gallery.appendChild(card);
  }
}

function clearAlbumPreview() {
  previewToken += 1;
  els.albumPreviewEmpty.hidden = false;
  els.albumPreviewBody.hidden = true;
  els.albumPreviewImage.hidden = true;
  els.albumPreviewImage.removeAttribute('src');
  els.albumPreviewVideo.hidden = true;
  els.albumPreviewVideo.removeAttribute('src');
  els.albumPreviewNeedCache.hidden = true;
  els.albumPreviewCacheActions.hidden = true;
  els.albumPreviewProjectActions.hidden = true;
}

async function selectAlbumMedia(item) {
  selectedMedia = item;
  renderMediaList();
  await showAlbumPreview(item);
}

async function showAlbumPreview(item) {
  const token = ++previewToken;
  els.albumPreviewEmpty.hidden = true;
  els.albumPreviewBody.hidden = false;
  els.albumPreviewName.textContent = item.originalFilename || item.id;
  els.albumPreviewMeta.textContent = [
    item.kind,
    item.durationMs ? formatDurationMs(item.durationMs) : null,
    formatBytes(Number(item.size || 0)),
  ]
    .filter(Boolean)
    .join(' · ');

  els.albumPreviewImage.hidden = true;
  els.albumPreviewVideo.hidden = true;
  els.albumPreviewNeedCache.hidden = true;
  els.albumPreviewCacheActions.hidden = true;
  els.albumPreviewVideo.removeAttribute('src');

  const inProjectClip =
    item.kind === 'video' && activeProject ? clipForMedia(item.id) : null;
  if (activeProject && item.kind === 'video') {
    els.albumPreviewProjectActions.hidden = false;
    if (inProjectClip) {
      setButtonContent(els.albumToggleProjectBtn, icons.minus, 'Убрать из проекта');
      els.albumToggleProjectBtn.classList.add('danger-btn');
      els.albumToggleProjectBtn.onclick = () =>
        void removeClipFromProject(inProjectClip.id);
    } else {
      setButtonContent(els.albumToggleProjectBtn, icons.plus, 'В проект');
      els.albumToggleProjectBtn.classList.remove('danger-btn');
      els.albumToggleProjectBtn.onclick = () => void addMediaToProject(item.id);
    }
  } else {
    els.albumPreviewProjectActions.hidden = true;
  }

  if (item.kind !== 'video') {
    els.albumPreviewCache.textContent = 'Фото — превью с сервера';
    els.albumPreviewImage.src = item.url || item.thumbUrl || '';
    els.albumPreviewImage.hidden = false;
    return;
  }

  try {
    const status = await getCacheStatus(item.id);
    if (token !== previewToken) return;
    if (status.cached && status.path) {
      els.albumPreviewCache.textContent = `Локально · ${formatBytes(status.bytes || 0)}`;
      els.albumPreviewVideo.src = await localVideoUrl(status.path);
      els.albumPreviewVideo.hidden = false;
      els.albumPreviewNeedCache.hidden = true;
      els.albumPreviewCacheActions.hidden = false;
      els.albumRemoveCacheBtn.onclick = () =>
        void removeAlbumMediaCache(item).catch((e) =>
          showStatus(e.message || String(e), true),
        );
    } else {
      els.albumPreviewCache.textContent = 'Не загружено локально';
      els.albumPreviewNeedCache.hidden = false;
      els.albumPreviewCacheActions.hidden = true;
      els.albumDownloadBtn.disabled = false;
      setButtonContent(els.albumDownloadBtn, icons.download, 'Загрузить локально');
      els.albumDownloadBtn.onclick = () => void downloadAlbumMedia(item);
    }
  } catch (error) {
    if (token !== previewToken) return;
    els.albumPreviewCache.textContent = error.message || String(error);
    els.albumPreviewNeedCache.hidden = false;
    els.albumPreviewCacheActions.hidden = true;
  }
}

async function downloadAlbumMedia(item) {
  if (!item?.url) return;
  const token = previewToken;
  els.albumDownloadBtn.disabled = true;
  setButtonContent(els.albumDownloadBtn, icons.download, 'Загрузка…');
  beginDownloadProgress(item.id, 'album');
  try {
    const cached = await invoke('ensure_media_cached', {
      mediaId: mediaKey(item.id),
      url: item.url,
    });
    if (token !== previewToken) return;
    await refreshCacheStats();
    cachedMediaIds.add(mediaKey(item.id));
    await ensureLocalDurationMs(item.id, cached.path);
    updateProjectStatsUi();
    renderProjectList();
    renderMediaList();
    els.albumPreviewCache.textContent = `Локально · ${formatBytes(cached.bytes)}`;
    els.albumPreviewNeedCache.hidden = true;
    els.albumPreviewCacheActions.hidden = false;
    els.albumRemoveCacheBtn.onclick = () =>
      void removeAlbumMediaCache(item).catch((e) =>
        showStatus(e.message || String(e), true),
      );
    els.albumPreviewVideo.src = await localVideoUrl(cached.path);
    els.albumPreviewVideo.hidden = false;
    showStatus(
      cached.downloaded
        ? `Скачано ${formatBytes(cached.bytes)}`
        : `Уже в кэше · ${formatBytes(cached.bytes)}`,
    );
  } catch (error) {
    showStatus(error.message || String(error), true);
    setButtonContent(els.albumDownloadBtn, icons.download, 'Загрузить локально');
    els.albumDownloadBtn.disabled = false;
  } finally {
    endDownloadProgress();
  }
}

async function removeAlbumMediaCache(item) {
  if (!item?.id) return;
  const removed = await removeMediaFromCache(item.id);
  if (removed && selectedMedia?.id === item.id) {
    await showAlbumPreview(item);
  }
}

async function addMediaToProject(mediaId) {
  if (!activeProject || !currentTrip) return;
  try {
    await api.addClip(currentTrip.secret, activeProject.id, mediaId);
    await loadProjects();
    showStatus('Клип добавлен');
  } catch (error) {
    showStatus(error.message || String(error), true);
  }
}

async function removeClipFromProject(clipId) {
  if (!activeProject || !currentTrip) return;
  if (!confirm('Убрать клип из проекта?')) return;
  const wasSelected = selectedClipId === clipId;
  await api.removeClip(currentTrip.secret, activeProject.id, clipId);
  try {
    await invoke('remove_clip_fragment', { clipId: Number(clipId) });
  } catch {
    /* fragment may not exist */
  }
  fragmentByClipId.delete(Number(clipId));
  if (wasSelected) {
    selectedClipId = null;
    trimContext = null;
  }
  await loadProjects();
  await refreshCacheStats();
  if (els.projectLightbox.open) {
    renderLightbox();
    if (!selectedClipId && activeProject?.clips?.[0]) {
      await selectClip(activeProject.clips[0].id);
    } else if (!activeProject?.clips?.length) {
      clearLightboxPreview();
    }
  }
}

async function openLightbox(preferClipId = null) {
  if (!activeProject) return;
  await refreshFragmentIndex();
  await refreshLocalDurationsForProjects(
    activeProject ? [activeProject] : [],
  );
  els.lightboxProjectTitle.textContent = activeProject.name || 'Проект';
  if (!els.projectLightbox.open) {
    els.projectLightbox.showModal();
  }
  await refreshCachedMediaIds();
  await refreshCacheStats();
  renderLightbox();
  const clips = activeProject.clips || [];
  const target =
    (preferClipId && clips.find((c) => c.id === preferClipId)?.id) ||
    selectedClipId ||
    clips[0]?.id ||
    null;
  if (target != null) {
    await selectClip(target);
  } else {
    clearLightboxPreview();
  }
}

function closeLightbox() {
  if (els.projectLightbox.open) {
    els.projectLightbox.close();
  }
  previewToken += 1;
  els.lightboxVideo.removeAttribute('src');
  els.lightboxVideo.hidden = true;
}

function clearLightboxPreview() {
  els.lightboxClipEmpty.hidden = false;
  els.lightboxClipInfo.hidden = true;
  els.lightboxDownloadStatus.textContent = '';
  els.lightboxCacheActions.hidden = true;
  els.lightboxVideo.hidden = true;
  els.lightboxVideo.removeAttribute('src');
  els.lightboxNeedCache.hidden = true;
  els.trimStartInput.value = '';
  els.trimEndInput.value = '';
  trimContext = null;
  selectedClipId = null;
  renderTimeline();
}

function renderLightbox() {
  els.lightboxProjectTitle.textContent = activeProject?.name || 'Проект';
  els.lightboxExportBtn.disabled = !(activeProject?.clips?.length > 0);
  const clip = selectedClip();
  if (!clip) {
    els.lightboxClipEmpty.hidden = false;
    els.lightboxClipInfo.hidden = true;
  } else {
    els.lightboxClipEmpty.hidden = true;
    els.lightboxClipInfo.hidden = false;
    updateClipSidePanel(clip);
  }
  renderTimeline();
}

function updateClipSidePanel(clip) {
  const media =
    clip.media || mediaItems.find((m) => m.id === clip.mediaId) || {};
  const index = selectedClipIndex();
  const total = activeProject?.clips?.length || 0;
  const fragment = fragmentByClipId.get(Number(clip.id));
  els.lightboxClipName.textContent =
    media.originalFilename || clip.mediaId || `Клип ${clip.id}`;
  els.lightboxClipMeta.textContent = [
    formatDurationMs(clipEffectiveDurationMs(clip)) || null,
    formatBytes(clipEffectiveBytes(clip)),
    index >= 0 ? `${padIndex(index + 1, total)} / ${total}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  if (fragment) {
    const start = fragment.startSec ?? clip.trimStartSec ?? 0;
    const end = fragment.endSec ?? clip.trimEndSec ?? '…';
    els.lightboxClipTrim.textContent = `Отрезок ${start}–${end} с · ${formatBytes(fragment.bytes || 0)}`;
    els.lightboxClipTrim.classList.add('badge--local');
  } else {
    const trimmed =
      clip.trimStartSec != null || clip.trimEndSec != null;
    els.lightboxClipTrim.textContent = trimmed
      ? `Trim ${clip.trimStartSec ?? 0}–${clip.trimEndSec ?? '…'} с`
      : 'Исходный ролик';
    els.lightboxClipTrim.classList.toggle('badge--local', trimmed);
  }
  els.trimStartInput.value = '';
  els.trimEndInput.value = '';
  els.moveClipUpBtn.disabled = index <= 0;
  els.moveClipDownBtn.disabled = index < 0 || index >= total - 1;
}

function renderTimeline() {
  els.timelineTrack.innerHTML = '';
  const clips = activeProject?.clips || [];
  const stats = computeProjectStats(activeProject);
  els.timelineSummary.textContent = clips.length
    ? formatProjectStatsLabel(stats)
    : 'Клипов пока нет — добавьте с экрана альбома';
  updateProjectStatsUi();
  clips.forEach((clip, index) => {
    const media =
      clip.media || mediaItems.find((m) => m.id === clip.mediaId) || {};
    const frag = fragmentByClipId.get(Number(clip.id));
    const card = document.createElement('button');
    card.type = 'button';
    card.className =
      'timeline-card' + (selectedClipId === clip.id ? ' is-selected' : '');
    const thumb = document.createElement('div');
    thumb.className = 'timeline-card__thumb';
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.alt = '';
    // Fragments must use a frame from the cut file, never the original media thumb.
    img.src = frag
      ? frag.thumbUrl || ''
      : media.thumbUrl || media.url || '';
    const idx = document.createElement('span');
    idx.className = 'timeline-card__index';
    idx.textContent = padIndex(index + 1, clips.length);
    thumb.append(img, idx);
    if (isFragmentClip(clip.id)) {
      const fragmentBadge = document.createElement('span');
      fragmentBadge.className = 'trip-card__badge trip-card__badge--fragment';
      fragmentBadge.title = 'Отрезок';
      fragmentBadge.innerHTML = icons.scissors;
      thumb.appendChild(fragmentBadge);
    } else if (cachedMediaIds.has(mediaKey(clip.mediaId))) {
      appendCacheBadge(thumb);
    }
    const meta = document.createElement('div');
    meta.className = 'timeline-card__meta';
    meta.textContent = media.originalFilename || clip.mediaId;
    card.append(thumb, meta);
    card.addEventListener('click', () => void selectClip(clip.id));
    els.timelineTrack.appendChild(card);
    if (selectedClipId === clip.id) {
      requestAnimationFrame(() => {
        card.scrollIntoView({
          inline: 'nearest',
          block: 'nearest',
          behavior: 'smooth',
        });
      });
    }
  });
}

async function selectClip(clipId) {
  if (!activeProject) return;
  const clip = activeProject.clips.find((c) => c.id === clipId);
  if (!clip) return;
  selectedClipId = clipId;
  renderLightbox();
  await loadClipPreview(clip);
}

async function loadClipPreview(clip) {
  const media =
    clip.media || mediaItems.find((m) => m.id === clip.mediaId) || {};
  const token = ++previewToken;
  els.lightboxVideo.hidden = true;
  els.lightboxVideo.removeAttribute('src');
  els.lightboxNeedCache.hidden = true;
  els.lightboxCacheActions.hidden = true;
  trimContext = null;

  try {
    const fragment = await invoke('get_clip_fragment', {
      clipId: Number(clip.id),
    });
    if (token !== previewToken) return;
    if (fragment?.registered && fragment.path) {
      fragmentByClipId.set(Number(clip.id), {
        bytes: Number(fragment.bytes) || 0,
        path: fragment.path,
        startSec: fragment.start_sec,
        endSec: fragment.end_sec,
        thumbUrl: await resolveFragmentThumbUrl(fragment.thumb_path),
      });
      els.lightboxDownloadStatus.textContent = `Отрезок · ${formatBytes(fragment.bytes || 0)}`;
      els.lightboxVideo.src = await localVideoUrl(fragment.path);
      els.lightboxVideo.hidden = false;
      els.lightboxNeedCache.hidden = true;
      els.lightboxCacheActions.hidden = true;
      trimContext = {
        clipId: clip.id,
        mediaId: clip.mediaId,
        localPath: fragment.path,
        isFragment: true,
      };
      renderTimeline();
      return;
    }
  } catch {
    /* fall through to original media */
  }

  if (!media.url) {
    els.lightboxDownloadStatus.textContent = 'Нет URL медиа';
    return;
  }

  try {
    const status = await getCacheStatus(clip.mediaId);
    if (token !== previewToken) return;
    if (status.cached && status.path) {
      els.lightboxDownloadStatus.textContent = `Локально · ${formatBytes(status.bytes || 0)}`;
      els.lightboxVideo.src = await localVideoUrl(status.path);
      els.lightboxVideo.hidden = false;
      els.lightboxNeedCache.hidden = true;
      els.lightboxCacheActions.hidden = false;
      els.lightboxRemoveCacheBtn.onclick = () =>
        void removeLightboxClipCache(clip).catch((e) =>
          showStatus(e.message || String(e), true),
        );
      trimContext = {
        clipId: clip.id,
        mediaId: clip.mediaId,
        localPath: status.path,
        isFragment: false,
      };
    } else {
      els.lightboxDownloadStatus.textContent = 'Не загружено локально';
      els.lightboxNeedCache.hidden = false;
      els.lightboxCacheActions.hidden = true;
      els.lightboxDownloadBtn.disabled = false;
      setButtonContent(
        els.lightboxDownloadBtn,
        icons.download,
        'Загрузить локально',
      );
      els.lightboxDownloadBtn.onclick = () => void downloadLightboxClip(clip, media);
    }
  } catch (error) {
    if (token !== previewToken) return;
    els.lightboxDownloadStatus.textContent = error.message || String(error);
    els.lightboxNeedCache.hidden = false;
    els.lightboxCacheActions.hidden = true;
  }
}

async function downloadLightboxClip(clip, media) {
  const token = previewToken;
  els.lightboxDownloadBtn.disabled = true;
  setButtonContent(els.lightboxDownloadBtn, icons.download, 'Загрузка…');
  beginDownloadProgress(clip.mediaId, 'lightbox');
  try {
    const cached = await invoke('ensure_media_cached', {
      mediaId: mediaKey(clip.mediaId),
      url: media.url,
    });
    if (token !== previewToken) return;
    await refreshCacheStats();
    cachedMediaIds.add(mediaKey(clip.mediaId));
    await ensureLocalDurationMs(clip.mediaId, cached.path);
    updateProjectStatsUi();
    renderProjectList();
    renderMediaList();
    renderTimeline();
    els.lightboxDownloadStatus.textContent = cached.downloaded
      ? `Скачано ${formatBytes(cached.bytes)}`
      : `Из кэша · ${formatBytes(cached.bytes)}`;
    els.lightboxNeedCache.hidden = true;
    els.lightboxCacheActions.hidden = false;
    els.lightboxRemoveCacheBtn.onclick = () =>
      void removeLightboxClipCache(clip).catch((e) =>
        showStatus(e.message || String(e), true),
      );
    els.lightboxVideo.src = await localVideoUrl(cached.path);
    els.lightboxVideo.hidden = false;
    trimContext = {
      clipId: clip.id,
      mediaId: clip.mediaId,
      localPath: cached.path,
      isFragment: false,
    };
    renderTimeline();
  } catch (error) {
    els.lightboxDownloadStatus.textContent = error.message || String(error);
    setButtonContent(
      els.lightboxDownloadBtn,
      icons.download,
      'Загрузить локально',
    );
    els.lightboxDownloadBtn.disabled = false;
  } finally {
    endDownloadProgress();
  }
}

async function removeLightboxClipCache(clip) {
  if (!clip?.mediaId) return;
  const removed = await removeMediaFromCache(clip.mediaId);
  if (!removed) return;
  trimContext = null;
  if (selectedClip()?.id === clip.id) {
    await loadClipPreview(clip);
  }
}

async function moveSelectedClip(delta) {
  if (!activeProject || !currentTrip) return;
  const index = selectedClipIndex();
  if (index < 0) return;
  const ids = activeProject.clips.map((c) => c.id);
  const target = index + delta;
  if (target < 0 || target >= ids.length) return;
  const tmp = ids[index];
  ids[index] = ids[target];
  ids[target] = tmp;
  activeProject = await api.reorderClips(
    currentTrip.secret,
    activeProject.id,
    ids,
  );
  syncActiveProjectInList();
  renderProjectList();
  renderLightbox();
}

async function saveTrimBounds() {
  if (!trimContext?.localPath || !activeProject || !currentTrip) {
    showStatus('Сначала загрузите клип локально', true);
    return;
  }
  const startRaw = els.trimStartInput.value.trim();
  const endRaw = els.trimEndInput.value.trim();
  if (startRaw === '' || endRaw === '') {
    showStatus('Укажите старт и конец отрезка', true);
    return;
  }
  const trimStartSec = Number(startRaw);
  const trimEndSec = Number(endRaw);
  if (
    Number.isNaN(trimStartSec) ||
    Number.isNaN(trimEndSec) ||
    trimStartSec < 0 ||
    trimEndSec <= trimStartSec
  ) {
    showStatus('Некорректные границы отрезка', true);
    return;
  }

  const sourceClipId = trimContext.clipId;
  const sourceMediaId = trimContext.mediaId;
  const sourcePath = trimContext.localPath;

  els.saveTrimBtn.disabled = true;
  const originalLabel = els.saveTrimBtn.innerHTML;
  setButtonContent(els.saveTrimBtn, icons.scissors, 'Вырезаю…');
  try {
    const extracted = await invoke('extract_media_fragment', {
      sourcePath,
      sourceMediaId,
      startSec: trimStartSec,
      endSec: trimEndSec,
    });

    const created = await api.addClip(
      currentTrip.secret,
      activeProject.id,
      sourceMediaId,
    );
    const newClipId = created?.id;
    if (newClipId == null) {
      throw new Error('Не удалось создать клип отрезка');
    }

    await api.updateClipTrim(
      currentTrip.secret,
      activeProject.id,
      newClipId,
      trimStartSec,
      trimEndSec,
    );

    const registered = await invoke('register_clip_fragment', {
      fragmentId: extracted.fragment_id,
      clipId: Number(newClipId),
    });

    activeProject = await api.getProject(currentTrip.secret, activeProject.id);
    const clips = activeProject.clips || [];
    const orderedIds = clips.map((c) => c.id).filter((id) => id !== newClipId);
    const insertAt = fragmentInsertIndex(
      clips.filter((c) => c.id !== newClipId),
      sourceClipId,
      sourceMediaId,
    );
    orderedIds.splice(insertAt, 0, newClipId);
    activeProject = await api.reorderClips(
      currentTrip.secret,
      activeProject.id,
      orderedIds,
    );

    fragmentByClipId.set(Number(newClipId), {
      bytes: Number(extracted.bytes) || 0,
      path: extracted.path,
      startSec: extracted.start_sec,
      endSec: extracted.end_sec,
      thumbUrl: await resolveFragmentThumbUrl(
        registered?.thumb_path || extracted.thumb_path,
      ),
    });

    els.trimStartInput.value = '';
    els.trimEndInput.value = '';
    await refreshCacheStats();
    syncActiveProjectInList();
    renderProjectList();
    renderLightbox();
    await selectClip(newClipId);
    showStatus(
      `Отрезок сохранён · ${formatBytes(extracted.bytes)} · вставлен после исходного`,
    );
  } catch (error) {
    showStatus(error.message || String(error), true);
  } finally {
    els.saveTrimBtn.disabled = false;
    els.saveTrimBtn.innerHTML = originalLabel;
  }
}

async function resetTrimBounds() {
  els.trimStartInput.value = '';
  els.trimEndInput.value = '';
  showStatus('Границы отрезка сброшены');
}

async function renameActiveProject() {
  const name = prompt('Новое имя проекта', activeProject?.name || '');
  if (!name?.trim() || !activeProject || !currentTrip) return;
  await api.renameProject(currentTrip.secret, activeProject.id, name.trim());
  await loadProjects();
  if (els.projectLightbox.open) {
    els.lightboxProjectTitle.textContent = activeProject?.name || 'Проект';
  }
}

async function deleteActiveProject() {
  if (!activeProject || !currentTrip) return;
  if (!confirm(`Удалить проект «${activeProject.name}»?`)) return;
  await api.deleteProject(currentTrip.secret, activeProject.id);
  activeProject = null;
  selectedClipId = null;
  closeLightbox();
  await loadProjects();
}

async function exportActiveProject(button) {
  if (!activeProject?.clips?.length) return;
  const outputDir = await open({
    directory: true,
    multiple: false,
    title: 'Папка для CapCut клипов',
  });
  if (!outputDir) return;

  button.disabled = true;
  const original = button.innerHTML;
  try {
    showStatus('Готовлю клипы (ленивая загрузка + ffmpeg)…');
    const exportClips = [];
    const total = activeProject.clips.length;
    for (let i = 0; i < total; i++) {
      const clip = activeProject.clips[i];
      const media = clip.media || {};
      button.textContent = `Кэш ${i + 1}/${total}`;

      let sourcePath = null;
      let trimStart = clip.trimStartSec ?? null;
      let trimEnd = clip.trimEndSec ?? null;

      try {
        const fragment = await invoke('get_clip_fragment', {
          clipId: Number(clip.id),
        });
        if (fragment?.registered && fragment.path) {
          sourcePath = fragment.path;
          // Already cut — export file as-is.
          trimStart = null;
          trimEnd = null;
        }
      } catch {
        /* use original */
      }

      if (!sourcePath) {
        beginDownloadProgress(clip.mediaId, 'export');
        const cached = await invoke('ensure_media_cached', {
          mediaId: mediaKey(clip.mediaId),
          url: media.url,
        });
        sourcePath = cached.path;
      }
      const base = sanitizeFilename(
        (media.originalFilename || `clip-${clip.id}`).replace(/\.[^.]+$/, ''),
      );
      const suffix = isFragmentClip(clip.id) ? '-cut' : '';
      exportClips.push({
        media_id: clip.mediaId,
        source_path: sourcePath,
        trim_start_sec: trimStart,
        trim_end_sec: trimEnd,
        output_name: `${padIndex(i + 1, total)}-${base}${suffix}.mp4`,
      });
    }
    endDownloadProgress();

    button.textContent = 'ffmpeg…';
    const out = await invoke('export_clips', {
      clips: exportClips,
      outputDir,
    });
    showStatus(`Готово: ${out}`);
    for (const clip of activeProject.clips) {
      cachedMediaIds.add(mediaKey(clip.mediaId));
    }
    renderMediaList();
    if (els.projectLightbox.open) renderTimeline();
    await refreshCacheStats();
    await invoke('open_in_finder', { path: out });
  } catch (error) {
    showStatus(error.message || String(error), true);
  } finally {
    endDownloadProgress();
    button.disabled = false;
    button.innerHTML = original;
  }
}

els.loginBtn.addEventListener('click', () => void login());
els.logoutBtn.addEventListener('click', () => void logout());
els.refreshTripsBtn.addEventListener('click', () =>
  void loadTrips().catch((e) => showStatus(e.message, true)),
);
els.openCacheBtn.addEventListener('click', () => {
  void openCacheView().catch((e) => showStatus(e.message, true));
});
els.openCacheFromAlbumBtn.addEventListener('click', () => {
  void openCacheView().catch((e) => showStatus(e.message, true));
});
els.cacheBackBtn.addEventListener('click', () => {
  closeCacheView();
  els.tripsView.hidden = false;
});
els.cacheRemoveFileBtn.addEventListener('click', () => {
  void removeSelectedCacheFile().catch((e) => showStatus(e.message, true));
});
els.backBtn.addEventListener('click', () => {
  closeLightbox();
  els.albumView.hidden = true;
  els.tripsView.hidden = false;
  currentTrip = null;
  activeProject = null;
  selectedMedia = null;
});
els.cacheClearBtn.addEventListener('click', () => {
  void (async () => {
    if (!confirm('Удалить весь локальный кэш видео?')) return;
    await invoke('clear_media_cache');
    cachedMediaIds = new Set();
    cacheEntries = [];
    clearCachePreview();
    renderCacheGallery();
    renderMediaList();
    await refreshCacheStats();
    if (selectedMedia && !els.albumView.hidden) {
      await showAlbumPreview(selectedMedia);
    }
    if (els.projectLightbox.open && selectedClip()) {
      await loadClipPreview(selectedClip());
    }
    showStatus('Кэш очищен');
  })().catch((e) => showStatus(e.message, true));
});

els.createProjectForm.addEventListener('submit', (event) => {
  event.preventDefault();
  void (async () => {
    const name = els.projectNameInput.value.trim();
    if (!name || !currentTrip) return;
    const created = await api.createProject(currentTrip.secret, name);
    els.projectNameInput.value = '';
    const id = created?.id;
    await loadProjects();
    if (id != null) {
      await selectProjectById(id);
    }
  })().catch((e) => showStatus(e.message, true));
});

els.openProjectBtn.addEventListener('click', () => {
  void openLightbox().catch((e) => showStatus(e.message, true));
});
els.exportProjectBtn.addEventListener('click', () => {
  void exportActiveProject(els.exportProjectBtn).catch((e) =>
    showStatus(e.message, true),
  );
});
els.renameProjectBtn.addEventListener('click', () => {
  void renameActiveProject().catch((e) => showStatus(e.message, true));
});
els.deleteProjectBtn.addEventListener('click', () => {
  void deleteActiveProject().catch((e) => showStatus(e.message, true));
});

els.closeLightboxBtn.addEventListener('click', () => closeLightbox());
els.projectLightbox.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeLightbox();
});
els.lightboxExportBtn.addEventListener('click', () => {
  void exportActiveProject(els.lightboxExportBtn).catch((e) =>
    showStatus(e.message, true),
  );
});

els.markStartBtn.addEventListener('click', () => {
  if (els.lightboxVideo.hidden || !els.lightboxVideo.src) {
    showStatus('Сначала загрузите клип локально', true);
    return;
  }
  els.trimStartInput.value = els.lightboxVideo.currentTime.toFixed(1);
});
els.markEndBtn.addEventListener('click', () => {
  if (els.lightboxVideo.hidden || !els.lightboxVideo.src) {
    showStatus('Сначала загрузите клип локально', true);
    return;
  }
  els.trimEndInput.value = els.lightboxVideo.currentTime.toFixed(1);
});
els.saveTrimBtn.addEventListener('click', () => {
  void saveTrimBounds().catch((e) => showStatus(e.message, true));
});
els.resetTrimBtn.addEventListener('click', () => {
  void resetTrimBounds().catch((e) => showStatus(e.message, true));
});
els.moveClipUpBtn.addEventListener('click', () => {
  void moveSelectedClip(-1).catch((e) => showStatus(e.message, true));
});
els.moveClipDownBtn.addEventListener('click', () => {
  void moveSelectedClip(1).catch((e) => showStatus(e.message, true));
});
els.removeClipBtn.addEventListener('click', () => {
  const clip = selectedClip();
  if (clip) void removeClipFromProject(clip.id);
});

els.timelineTrack.addEventListener(
  'wheel',
  (event) => {
    if (els.timelineTrack.scrollWidth <= els.timelineTrack.clientWidth) return;
    const mostlyVertical = Math.abs(event.deltaY) >= Math.abs(event.deltaX);
    if (!mostlyVertical) return;
    event.preventDefault();
    els.timelineTrack.scrollLeft += event.deltaY + event.deltaX;
  },
  { passive: false },
);

void listen('cache-progress', (event) => {
  applyCacheProgress(event.payload);
});

void listen('export-progress', (event) => {
  const p = event.payload;
  showStatus(p?.message || 'Export…');
});

void bootstrap();
