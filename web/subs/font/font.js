const FONTS_BASE_URL = '/subs/fonts/';
const PREVIEW_LATIN = 'Preview 123';
const PREVIEW_CYRILLIC = 'Субтитры';

const fontList = document.querySelector('#fontList');
const fontSearchInput = document.querySelector('#fontSearchInput');
const fontCountLabel = document.querySelector('#fontCountLabel');
const fontStatus = document.querySelector('#fontStatus');

let enabledSet = new Set();
let saveTimer;

function fontFileUrl(fileName) {
  return `${FONTS_BASE_URL}${encodeURIComponent(fileName)}`;
}

function showStatus(message, isError = false) {
  if (!message) {
    fontStatus.hidden = true;
    fontStatus.textContent = '';
    return;
  }

  fontStatus.hidden = false;
  fontStatus.textContent = message;
  fontStatus.classList.toggle('font-page-status--error', isError);
}

function updateCountLabel(visibleCount) {
  const selected = enabledSet.size;
  const total = window.SubsFonts.SUBTITLE_FONTS.length;
  fontCountLabel.textContent = `В списке: ${selected} · Показано: ${visibleCount} из ${total}`;
}

function createDownloadLink(fileName, label) {
  const link = document.createElement('a');
  link.className = 'font-row__download';
  link.href = fontFileUrl(fileName);
  link.download = fileName;
  link.textContent = label;
  return link;
}

function createDownloads(font) {
  const wrap = document.createElement('span');
  wrap.className = 'font-row__downloads';

  if (font.regular === font.bold) {
    wrap.append(createDownloadLink(font.regular, 'Скачать'));
    return wrap;
  }

  wrap.append(
    createDownloadLink(font.regular, 'Regular'),
    document.createTextNode(' · '),
    createDownloadLink(font.bold, 'Bold'),
  );
  return wrap;
}

function renderList(filter = '') {
  const query = filter.trim().toLowerCase();
  fontList.replaceChildren();

  const fonts = window.SubsFonts.SUBTITLE_FONTS.filter((font) =>
    font.family.toLowerCase().includes(query),
  ).sort((a, b) => a.family.localeCompare(b.family, 'ru', { sensitivity: 'base' }));

  for (const font of fonts) {
    const fontFamily = `"${font.family}", sans-serif`;
    const item = document.createElement('li');
    item.className = 'font-row';
    item.dataset.family = font.family;

    const label = document.createElement('label');
    label.className = 'font-row__label';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'font-row__checkbox';
    checkbox.checked = enabledSet.has(font.family);
    checkbox.addEventListener('change', () => {
      void toggleFont(font.family, checkbox.checked);
    });

    const body = document.createElement('div');
    body.className = 'font-row__body';

    const name = document.createElement('span');
    name.className = 'font-row__name';
    name.style.fontFamily = fontFamily;
    name.textContent = font.family;

    const sample = document.createElement('span');
    sample.className = 'font-row__sample';
    sample.style.fontFamily = fontFamily;
    sample.textContent = `${PREVIEW_LATIN} · ${PREVIEW_CYRILLIC}`;

    body.append(name, sample, createDownloads(font));
    label.append(checkbox, body);
    item.append(label);
    fontList.append(item);
  }

  updateCountLabel(fonts.length);
}

async function persistEnabled() {
  const families = [...enabledSet].sort((a, b) => a.localeCompare(b, 'ru'));
  await window.SubsFonts.writeEnabledFontFamilies(families);
  showStatus('Сохранено');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => showStatus(''), 1600);
}

async function toggleFont(family, enabled) {
  if (enabled) {
    enabledSet.add(family);
  } else {
    enabledSet.delete(family);
  }

  try {
    await persistEnabled();
  } catch (error) {
    if (enabled) {
      enabledSet.delete(family);
    } else {
      enabledSet.add(family);
    }
    renderList(fontSearchInput.value);
    showStatus(
      error instanceof Error ? error.message : 'Не удалось сохранить',
      true,
    );
  }
}

async function init() {
  try {
    enabledSet = new Set(await window.SubsFonts.readEnabledFontFamilies());
    renderList();
  } catch (error) {
    showStatus(
      error instanceof Error ? error.message : 'Ошибка IndexedDB',
      true,
    );
  }

  fontSearchInput.addEventListener('input', () => {
    renderList(fontSearchInput.value);
  });
}

init();
