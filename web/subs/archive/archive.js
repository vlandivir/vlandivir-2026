const SF = window.SubsFonts;

const archiveVideosList = document.querySelector('#archiveVideosList');
const archiveVideosEmpty = document.querySelector('#archiveVideosEmpty');
const archiveStylesList = document.querySelector('#archiveStylesList');
const archiveStylesEmpty = document.querySelector('#archiveStylesEmpty');
const archivePositionsList = document.querySelector('#archivePositionsList');
const archivePositionsEmpty = document.querySelector('#archivePositionsEmpty');

function formatBytes(bytes) {
  if (!bytes) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  const unit = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** unit;
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatRecordDates(record) {
  const added = SF.formatRuDateTime(record.createdAt);
  const edited = SF.formatRuDateTime(record.updatedAt || record.createdAt);
  return `Добавлено: ${added} · Изменено: ${edited}`;
}

function createIdLine(id) {
  const line = document.createElement('p');
  line.className = 'archive-item__id';
  line.textContent = `id: ${id}`;
  return line;
}

function renderList(container, emptyState, items, renderItem) {
  container.replaceChildren();
  emptyState.hidden = items.length > 0;
  for (const item of items) {
    container.append(renderItem(item));
  }
}

function renderArchivedVideos(videos) {
  renderList(archiveVideosList, archiveVideosEmpty, videos, (video) => {
    const item = document.createElement('article');
    item.className = 'link-item archive-item';

    const title = document.createElement('h3');
    title.textContent = video.originalName || video.hash;

    const dates = document.createElement('p');
    dates.className = 'archive-item__dates';
    dates.textContent = formatRecordDates(video);

    const meta = document.createElement('p');
    meta.textContent = `${formatBytes(video.size)} · ${video.mimeType || 'video'}`;
    if (video.archivedAt) {
      meta.textContent += ` · В архиве с ${SF.formatRuDateTime(video.archivedAt)}`;
    }

    const pageLink = document.createElement('a');
    pageLink.className = 'link-item__url';
    pageLink.href = video.pageUrl;
    pageLink.textContent =
      video.absolutePageUrl || new URL(video.pageUrl, window.location.origin).href;

    item.append(title, createIdLine(video.hash), dates, meta, pageLink);
    return item;
  });
}

function renderArchivedStyles(styles) {
  renderList(archiveStylesList, archiveStylesEmpty, styles, (style) => {
    const item = document.createElement('article');
    item.className = 'link-item archive-item';

    const title = document.createElement('h3');
    title.textContent = style.name || 'Без названия';

    const dates = document.createElement('p');
    dates.className = 'archive-item__dates';
    dates.textContent = formatRecordDates(style);

    const meta = document.createElement('p');
    meta.textContent = `${style.font || '—'} · ${style.fontSize || '—'}px · позиция ${style.positionId || '—'}`;
    if (style.archivedAt) {
      meta.textContent += ` · В архиве с ${SF.formatRuDateTime(style.archivedAt)}`;
    }

    item.append(title, createIdLine(style.id), dates, meta);
    return item;
  });
}

function renderArchivedPositions(positions) {
  renderList(archivePositionsList, archivePositionsEmpty, positions, (position) => {
    const item = document.createElement('article');
    item.className = 'link-item archive-item';

    const title = document.createElement('h3');
    title.textContent = position.name || 'Без названия';

    const dates = document.createElement('p');
    dates.className = 'archive-item__dates';
    dates.textContent = formatRecordDates(position);

    const meta = document.createElement('p');
    meta.textContent = `x ${position.x}, y ${position.y} · align ${position.alignment}`;
    if (position.archivedAt) {
      meta.textContent += ` · В архиве с ${SF.formatRuDateTime(position.archivedAt)}`;
    }

    item.append(title, createIdLine(position.id), dates, meta);
    return item;
  });
}

async function refreshArchive() {
  const [videos, styles, positions] = await Promise.all([
    SF.readArchivedVideos(),
    SF.readArchivedStyles(),
    SF.readArchivedPositions(),
  ]);
  renderArchivedVideos(videos);
  renderArchivedStyles(styles);
  renderArchivedPositions(positions);
}

refreshArchive().catch((error) => {
  const message =
    error instanceof Error ? error.message : 'Ошибка IndexedDB';
  archiveVideosEmpty.hidden = false;
  archiveVideosEmpty.textContent = message;
  archiveStylesEmpty.hidden = false;
  archiveStylesEmpty.textContent = message;
  archivePositionsEmpty.hidden = false;
  archivePositionsEmpty.textContent = message;
});
