(() => {
  const API_BASE = '/diary-api';
  const BASE_PATH = '/diary';
  const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

  const MONTHS_RU = [
    'Январь',
    'Февраль',
    'Март',
    'Апрель',
    'Май',
    'Июнь',
    'Июль',
    'Август',
    'Сентябрь',
    'Октябрь',
    'Ноябрь',
    'Декабрь',
  ];

  // The calendar follows the current year's weekdays; February always keeps
  // its leap day (29) as an exception, even when the current year is common.
  const CALENDAR_YEAR = new Date().getFullYear();
  const WEEKDAYS_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  function daysInMonth(month) {
    // month is 1-indexed. February is forced to 29 (leap-day exception).
    if (month === 2) return 29;
    return new Date(CALENDAR_YEAR, month, 0).getDate();
  }

  // Monday-first weekday index (0 = Mon .. 6 = Sun) of the 1st of the month.
  function firstWeekdayOffset(month) {
    const jsWeekday = new Date(CALENDAR_YEAR, month - 1, 1).getDay(); // 0 = Sun
    return (jsWeekday + 6) % 7;
  }

  const dayTitleFormat = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
  });
  const noteDateFormat = new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const noteTimeFormat = new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });

  function truncateText(value, max) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    if (text.length <= max) return text;
    return `${text.slice(0, max - 1).trimEnd()}…`;
  }

  function captionSummaryLabel(kind, description) {
    const preview = truncateText(description, 72);
    if (preview) return `Описание · ${preview}`;
    return kind === 'video' ? 'Добавить описание видео' : 'Добавить описание';
  }

  function autosizeNoteEditor(editor) {
    editor.style.height = 'auto';
    editor.style.height = `${Math.max(editor.scrollHeight, 72)}px`;
  }

  const el = (id) => document.getElementById(id);
  const calendarView = el('calendar-view');
  const dayView = el('day-view');
  const archiveView = el('archive-view');
  const errorBox = el('error');

  const pad2 = (n) => String(n).padStart(2, '0');

  function showError(message) {
    errorBox.textContent = message;
    errorBox.classList.remove('hidden');
  }

  function clearError() {
    errorBox.textContent = '';
    errorBox.classList.add('hidden');
  }

  function invalidateCalendar() {
    const container = el('months');
    if (container) container.dataset.loaded = '';
  }

  async function api(path, options) {
    const response = await fetch(`${API_BASE}${path}`, options);
    if (response.status === 401) {
      const redirect = encodeURIComponent(location.pathname + location.search);
      location.href = `/auth/google?redirect=${redirect}`;
      throw new Error('unauthorized');
    }
    if (!response.ok) {
      let detail = '';
      try {
        const body = await response.json();
        detail = body?.message || '';
      } catch {
        // ignore
      }
      throw new Error(detail || `Request failed: ${response.status}`);
    }
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  // --- Routing ---

  // Returns { month, day } (1-indexed) for /diary/MM-DD, else null.
  function parseDayPath() {
    const match = location.pathname.match(/^\/diary\/(\d{2})-(\d{2})\/?$/);
    if (!match) return null;
    const month = Number(match[1]);
    const day = Number(match[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return { month, day };
  }

  function isArchivePath() {
    return /^\/diary\/archive\/?$/.test(location.pathname);
  }

  function render() {
    clearError();
    const target = parseDayPath();
    if (isArchivePath()) {
      calendarView.classList.add('hidden');
      dayView.classList.add('hidden');
      archiveView.classList.remove('hidden');
      void renderArchive();
    } else if (target) {
      calendarView.classList.add('hidden');
      archiveView.classList.add('hidden');
      dayView.classList.remove('hidden');
      void renderDay(target.month, target.day);
    } else {
      dayView.classList.add('hidden');
      archiveView.classList.add('hidden');
      calendarView.classList.remove('hidden');
      void renderCalendar();
    }
  }

  function navigate(path) {
    history.pushState({}, '', path);
    render();
  }

  // --- Calendar view ---

  async function renderCalendar() {
    const container = el('months');
    if (container.dataset.loaded === '1') return;

    let data;
    try {
      data = await api('/calendar');
    } catch (err) {
      if (err.message !== 'unauthorized') {
        showError('Не удалось загрузить календарь.');
      }
      return;
    }

    const present = new Set(
      (data.days || []).map((d) => `${d.month}-${d.day}`),
    );

    const frag = document.createDocumentFragment();
    for (let month = 1; month <= 12; month += 1) {
      const card = document.createElement('div');
      card.className = 'editor-card month-card';

      const title = document.createElement('h2');
      title.className = 'month-name';
      title.textContent = MONTHS_RU[month - 1];
      card.append(title);

      const grid = document.createElement('div');
      grid.className = 'day-grid';

      for (const name of WEEKDAYS_RU) {
        const head = document.createElement('div');
        head.className = 'day-head';
        head.textContent = name;
        grid.append(head);
      }

      // Blank leading cells so day 1 sits under its weekday column.
      for (let i = 0; i < firstWeekdayOffset(month); i += 1) {
        const blank = document.createElement('div');
        blank.className = 'day-cell empty';
        grid.append(blank);
      }

      for (let day = 1; day <= daysInMonth(month); day += 1) {
        const cell = document.createElement('a');
        cell.className = 'day-cell';
        cell.textContent = String(day);
        const href = `${BASE_PATH}/${pad2(month)}-${pad2(day)}`;
        cell.href = href;
        if (present.has(`${month}-${day}`)) {
          cell.classList.add('has-notes');
          cell.title = 'Есть записи';
        }
        cell.addEventListener('click', (event) => {
          event.preventDefault();
          navigate(href);
        });
        grid.append(cell);
      }
      card.append(grid);
      frag.append(card);
    }

    container.replaceChildren(frag);
    container.dataset.loaded = '1';
  }

  // --- Day view ---

  async function renderDay(month, day) {
    const yearsBox = el('years');
    const emptyBox = el('day-empty');
    yearsBox.replaceChildren();
    emptyBox.classList.add('hidden');

    // Use a fixed year just for the localized "5 июля" label.
    el('day-title').textContent = dayTitleFormat.format(
      new Date(2000, month - 1, day),
    );

    let data;
    try {
      data = await api(`/day?month=${month}&day=${day}`);
    } catch (err) {
      if (err.message !== 'unauthorized') {
        showError('Не удалось загрузить записи.');
      }
      return;
    }

    const years = data.years || [];
    if (years.length === 0) {
      emptyBox.classList.remove('hidden');
      return;
    }

    const frag = document.createDocumentFragment();
    for (const entry of years) {
      frag.append(renderYearBlock(entry));
    }
    yearsBox.replaceChildren(frag);
  }

  function renderYearBlock(entry) {
    const block = document.createElement('div');
    block.className = 'year-block';

    const head = document.createElement('h2');
    head.className = 'year-head';
    head.textContent = String(entry.year);
    block.append(head);

    const list = document.createElement('div');
    list.className = 'note-list';
    for (const note of entry.notes) {
      list.append(renderNote(note));
    }
    block.append(list);
    return block;
  }

  // --- Archive view ---

  async function renderArchive() {
    const list = el('archive-list');
    const emptyBox = el('archive-empty');
    list.replaceChildren();
    emptyBox.classList.add('hidden');

    let data;
    try {
      data = await api('/archive');
    } catch (err) {
      if (err.message !== 'unauthorized') {
        showError('Не удалось загрузить архив.');
      }
      return;
    }

    const notes = data.notes || [];
    if (notes.length === 0) {
      emptyBox.classList.remove('hidden');
      return;
    }

    const frag = document.createDocumentFragment();
    for (const note of notes) {
      frag.append(renderArchivedNote(note));
    }
    list.replaceChildren(frag);
  }

  function renderArchivedNote(note) {
    const item = document.createElement('div');
    item.className = 'editor-card archive-note';

    const meta = document.createElement('div');
    meta.className = 'note-date';
    const deletedLabel = note.deletedAt
      ? ` · удалено ${noteDateFormat.format(new Date(note.deletedAt))}`
      : '';
    meta.textContent =
      (note.noteDate
        ? noteDateFormat.format(new Date(note.noteDate))
        : 'Без даты') + deletedLabel;
    item.append(meta);

    const content = document.createElement('p');
    content.className = 'archive-note-content';
    content.textContent = note.content?.trim() || '(без текста)';
    item.append(content);

    const media = renderMedia(note, { readOnly: true });
    if (media) item.append(media);

    const actions = document.createElement('div');
    actions.className = 'note-actions';

    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'primary-btn';
    restoreBtn.type = 'button';
    restoreBtn.textContent = 'Восстановить';

    const status = document.createElement('span');
    status.className = 'note-status';

    restoreBtn.addEventListener('click', async () => {
      const ok = await window.AppDialog.confirm(
        'Восстановить запись в дневник?',
      );
      if (!ok) return;
      restoreBtn.disabled = true;
      status.textContent = 'Восстановление…';
      try {
        await api(`/notes/${note.id}/restore`, { method: 'POST' });
        invalidateCalendar();
        item.remove();
        if (!el('archive-list').children.length) {
          el('archive-empty').classList.remove('hidden');
        }
      } catch (err) {
        if (err.message !== 'unauthorized') {
          status.className = 'note-status error';
          status.textContent = 'Не удалось восстановить';
          restoreBtn.disabled = false;
        }
      }
    });

    actions.append(restoreBtn, status);
    item.append(actions);
    return item;
  }

  function renderNote(note) {
    const item = document.createElement('div');
    item.className = 'note-item';
    item.dataset.noteId = String(note.id);

    const meta = document.createElement('div');
    meta.className = 'note-meta';
    if (note.noteDate) {
      const time = document.createElement('time');
      time.className = 'note-time';
      time.dateTime = note.noteDate;
      time.textContent = noteTimeFormat.format(new Date(note.noteDate));
      meta.append(time);
    }
    item.append(meta);

    const editor = document.createElement('textarea');
    editor.className = 'note-editor';
    editor.value = note.content || '';
    editor.placeholder = 'Что произошло…';
    editor.rows = 3;
    item.append(editor);
    requestAnimationFrame(() => autosizeNoteEditor(editor));

    const mediaHost = document.createElement('div');
    mediaHost.className = 'note-media-host';
    const media = renderMedia(note);
    if (media) mediaHost.append(media);
    item.append(mediaHost);

    const toolbar = document.createElement('div');
    toolbar.className = 'note-toolbar';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'primary-btn';
    saveBtn.type = 'button';
    saveBtn.textContent = 'Сохранить';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'ghost-btn';
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'Удалить';

    const status = document.createElement('span');
    status.className = 'note-status';

    saveBtn.addEventListener('click', () =>
      saveNote(note.id, editor, saveBtn, status),
    );
    deleteBtn.addEventListener('click', () =>
      deleteNote(note.id, item, deleteBtn, status),
    );
    editor.addEventListener('input', () => {
      autosizeNoteEditor(editor);
      status.textContent = '';
      status.className = 'note-status';
    });

    toolbar.append(
      saveBtn,
      deleteBtn,
      renderVideoUpload(note, mediaHost, status),
      status,
    );
    item.append(toolbar);

    return item;
  }

  function renderMedia(note, options = {}) {
    const images = note.images || [];
    const videos = note.videos || [];
    if (images.length === 0 && videos.length === 0) return null;

    const box = document.createElement('div');
    box.className = 'note-media';

    for (const image of images) {
      box.append(renderImage(image, options));
    }
    for (const video of videos) {
      box.append(renderVideo(video, options));
    }

    return box;
  }

  function ensureMediaBox(mediaHost) {
    let box = mediaHost.querySelector('.note-media');
    if (!box) {
      box = document.createElement('div');
      box.className = 'note-media';
      mediaHost.append(box);
    }
    return box;
  }

  function renderMediaCaption(kind, initialDescription, buildActions) {
    const details = document.createElement('details');
    details.className = 'media-caption';
    if (!initialDescription) details.open = true;

    const summary = document.createElement('summary');
    summary.className = 'media-caption-summary';
    summary.textContent = captionSummaryLabel(kind, initialDescription);
    details.append(summary);

    const body = document.createElement('div');
    body.className = 'media-caption-body';

    const desc = document.createElement('textarea');
    desc.className = 'desc-editor';
    desc.value = initialDescription || '';
    desc.placeholder = 'Описание пока не задано';
    body.append(desc);

    const actions = document.createElement('div');
    actions.className = 'note-actions';
    const status = document.createElement('span');
    status.className = 'note-status';

    const syncSummary = () => {
      summary.textContent = captionSummaryLabel(kind, desc.value);
    };
    desc.addEventListener('input', () => {
      status.textContent = '';
      status.className = 'note-status';
      syncSummary();
    });

    buildActions({ desc, actions, status, syncSummary });
    actions.append(status);
    body.append(actions);
    details.append(body);
    return details;
  }

  function renderImage(image, options = {}) {
    const card = document.createElement('div');
    card.className = 'media-block';

    const img = document.createElement('img');
    img.className = 'media-photo';
    img.src = image.url;
    img.loading = 'lazy';
    img.alt = image.description || 'Фото';
    card.append(img);

    if (options.readOnly) {
      if (image.description) {
        const desc = document.createElement('p');
        desc.className = 'archive-media-desc';
        desc.textContent = image.description;
        card.append(desc);
      }
      return card;
    }

    card.append(
      renderMediaCaption('image', image.description, ({ desc, actions, status, syncSummary }) => {
        const saveBtn = document.createElement('button');
        saveBtn.className = 'mini-btn';
        saveBtn.type = 'button';
        saveBtn.textContent = 'Сохранить';

        const regenBtn = document.createElement('button');
        regenBtn.className = 'mini-btn';
        regenBtn.type = 'button';
        regenBtn.textContent = 'Сгенерировать';

        saveBtn.addEventListener('click', async () => {
          await saveImageDescription(image.id, desc, saveBtn, status);
          syncSummary();
        });
        regenBtn.addEventListener('click', async () => {
          await regenerateImageDescription(
            image.id,
            desc,
            [saveBtn, regenBtn],
            status,
          );
          syncSummary();
        });

        actions.append(saveBtn, regenBtn);
      }),
    );
    return card;
  }

  async function saveImageDescription(id, editor, saveBtn, status) {
    saveBtn.disabled = true;
    status.className = 'note-status';
    status.textContent = 'Сохранение…';
    try {
      await api(`/images/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: editor.value }),
      });
      status.className = 'note-status saved';
      status.textContent = 'Сохранено';
    } catch (err) {
      if (err.message !== 'unauthorized') {
        status.className = 'note-status error';
        status.textContent = 'Ошибка сохранения';
      }
    } finally {
      saveBtn.disabled = false;
    }
  }

  async function regenerateImageDescription(id, editor, buttons, status) {
    buttons.forEach((b) => (b.disabled = true));
    status.className = 'note-status';
    status.textContent = 'Распознаём текст (3 модели)…';
    try {
      const data = await api(`/images/${id}/describe`, { method: 'POST' });
      editor.value = data.description || '';
      status.className = 'note-status saved';
      status.textContent = 'Описание обновлено';
    } catch (err) {
      if (err.message !== 'unauthorized') {
        status.className = 'note-status error';
        status.textContent = 'Не удалось распознать';
      }
    } finally {
      buttons.forEach((b) => (b.disabled = false));
    }
  }

  function renderVideo(video, options = {}) {
    const card = document.createElement('div');
    card.className = 'media-block';
    card.dataset.videoId = String(video.id);

    const player = document.createElement('video');
    player.className = 'media-photo';
    player.src = video.url;
    player.controls = true;
    player.preload = 'metadata';
    card.append(player);

    if (options.readOnly) {
      if (video.description) {
        const desc = document.createElement('p');
        desc.className = 'archive-media-desc';
        desc.textContent = video.description;
        card.append(desc);
      }
      return card;
    }

    card.append(
      renderMediaCaption('video', video.description, ({ desc, actions, status, syncSummary }) => {
        const saveBtn = document.createElement('button');
        saveBtn.className = 'mini-btn';
        saveBtn.type = 'button';
        saveBtn.textContent = 'Сохранить';

        const sendBtn = document.createElement('button');
        sendBtn.className = 'mini-btn';
        sendBtn.type = 'button';
        sendBtn.textContent = 'В Telegram';

        saveBtn.addEventListener('click', async () => {
          await saveVideoDescription(video.id, desc, saveBtn, status);
          syncSummary();
        });
        sendBtn.addEventListener('click', () =>
          sendVideoToTelegram(video.id, sendBtn, status),
        );

        actions.append(saveBtn, sendBtn);
      }),
    );
    return card;
  }

  function renderVideoUpload(note, mediaHost, status) {
    const wrap = document.createElement('div');
    wrap.className = 'video-upload';

    const label = document.createElement('label');
    label.className = 'ghost-btn video-upload-label';
    label.textContent = 'Добавить видео';

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.hidden = true;

    const notify = document.createElement('label');
    notify.className = 'video-upload-notify';
    const notifyBox = document.createElement('input');
    notifyBox.type = 'checkbox';
    notifyBox.checked = true;
    notify.append(notifyBox, document.createTextNode(' Отправить в Telegram'));

    label.append(input);
    wrap.append(label, notify);

    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;

      if (file.size > MAX_VIDEO_BYTES) {
        status.className = 'note-status error';
        status.textContent = 'Файл больше 100 МБ';
        return;
      }

      label.classList.add('is-busy');
      status.className = 'note-status';
      status.textContent = 'Загрузка видео…';

      const form = new FormData();
      form.append('video', file);
      const notifyQs = notifyBox.checked ? '?notify=1' : '';

      try {
        const video = await api(`/notes/${note.id}/videos${notifyQs}`, {
          method: 'POST',
          body: form,
        });
        const box = ensureMediaBox(mediaHost);
        box.append(renderVideo(video));
        status.className = 'note-status saved';
        status.textContent = video.telegramSent
          ? 'Видео сохранено и отправлено в Telegram'
          : 'Видео сохранено';
      } catch (err) {
        if (err.message !== 'unauthorized') {
          status.className = 'note-status error';
          status.textContent = 'Не удалось загрузить видео';
        }
      } finally {
        label.classList.remove('is-busy');
      }
    });

    return wrap;
  }

  async function saveVideoDescription(id, editor, saveBtn, status) {
    saveBtn.disabled = true;
    status.className = 'note-status';
    status.textContent = 'Сохранение…';
    try {
      await api(`/videos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: editor.value }),
      });
      status.className = 'note-status saved';
      status.textContent = 'Сохранено';
    } catch (err) {
      if (err.message !== 'unauthorized') {
        status.className = 'note-status error';
        status.textContent = 'Ошибка сохранения';
      }
    } finally {
      saveBtn.disabled = false;
    }
  }

  async function sendVideoToTelegram(id, sendBtn, status) {
    sendBtn.disabled = true;
    status.className = 'note-status';
    status.textContent = 'Отправка…';
    try {
      await api(`/videos/${id}/send`, { method: 'POST' });
      status.className = 'note-status saved';
      status.textContent = 'Отправлено в Telegram';
    } catch (err) {
      if (err.message !== 'unauthorized') {
        status.className = 'note-status error';
        status.textContent = 'Не удалось отправить';
      }
    } finally {
      sendBtn.disabled = false;
    }
  }

  async function saveNote(id, editor, saveBtn, status) {
    saveBtn.disabled = true;
    status.className = 'note-status';
    status.textContent = 'Сохранение…';
    try {
      await api(`/notes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editor.value }),
      });
      status.className = 'note-status saved';
      status.textContent = 'Сохранено';
    } catch (err) {
      if (err.message !== 'unauthorized') {
        status.className = 'note-status error';
        status.textContent = 'Ошибка сохранения';
      }
    } finally {
      saveBtn.disabled = false;
    }
  }

  async function deleteNote(id, item, deleteBtn, status) {
    const ok = await window.AppDialog.confirm(
      'Удалить запись в архив? Её можно будет восстановить.',
      { danger: true, confirmLabel: 'Удалить' },
    );
    if (!ok) return;
    deleteBtn.disabled = true;
    status.className = 'note-status';
    status.textContent = 'Удаление…';
    try {
      await api(`/notes/${id}`, { method: 'DELETE' });
      invalidateCalendar();
      const list = item.parentElement;
      const yearBlock = list?.parentElement;
      item.remove();
      if (list && list.children.length === 0) {
        yearBlock?.remove();
      }
      if (!el('years').children.length) {
        el('day-empty').classList.remove('hidden');
      }
    } catch (err) {
      if (err.message !== 'unauthorized') {
        status.className = 'note-status error';
        status.textContent = 'Не удалось удалить';
        deleteBtn.disabled = false;
      }
    }
  }

  // Back / archive links should route within the SPA.
  el('back-link').addEventListener('click', (event) => {
    event.preventDefault();
    navigate(BASE_PATH);
  });
  el('archive-back-link').addEventListener('click', (event) => {
    event.preventDefault();
    navigate(BASE_PATH);
  });
  el('archive-link').addEventListener('click', (event) => {
    event.preventDefault();
    navigate(`${BASE_PATH}/archive`);
  });

  window.addEventListener('popstate', render);

  render();
})();
