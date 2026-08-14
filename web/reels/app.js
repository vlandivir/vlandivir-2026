(() => {
  const API_BASE = '/reels-api';
  const KEY_STORAGE = 'reels-api-key';
  const POLL_INTERVAL_MS = 4000;
  const LIST_PAGE_SIZE = 10;

  // The page lives at /reels behind Google sign-in; the session cookie is
  // the API read key.
  const BASE_PATH = '/reels';

  const state = {
    reels: [],
    tags: [], // [{id, name, emoji}] — dictionary shared with the map
    selected: null, // reel object
    editMode: false,
    filters: { author: '', status: '', tag: '', query: '', own: '' },
    semantic: null, // Map<reelId, similarity> for the current query, or null
    listLimit: LIST_PAGE_SIZE,
    pollTimer: null,
  };

  const el = (id) => document.getElementById(id);
  const recentList = el('recent-list');
  const editToggle = el('edit-toggle');
  const addForm = el('add-form');
  const searchInput = el('search-input');
  const sidePanel = el('side-panel');
  const drawerOverlay = el('drawer-overlay');
  const player = el('player');

  const pageHeaders = {};

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

  async function loadReels() {
    const [response, tagsResponse] = await Promise.all([
      fetch(`${API_BASE}/reels`, { headers: pageHeaders }),
      // The tag dictionary is shared with the places map
      fetch('/map-api/tags'),
    ]);
    if (response.status === 401) {
      el('access-denied').classList.remove('hidden');
      return;
    }
    if (!response.ok) return;
    state.reels = await response.json();
    if (tagsResponse.ok) state.tags = await tagsResponse.json();
    renderList();
    openReelFromUrl();
    schedulePolling();
    if (isMobile() && !state.selected) openDrawer();
  }

  // Tag dictionary is shared with the map (see the 🏷 editor on /places)
  function tagLabel(name) {
    const tag = state.tags.find((t) => t.name === name);
    return tag?.emoji ? `${tag.emoji} ${name}` : name;
  }

  // --- Selection (player on the left, details in the panel) ---

  function selectReel(reel, { fromUrl = false } = {}) {
    if (state.selected?.id !== reel.id) closeFramesLightbox();
    state.selected = reel;
    renderPlayer();
    renderDetails();
    renderList(); // highlight the selected row
    if (!fromUrl) {
      history.replaceState(null, '', `${BASE_PATH}/${reel.id}`);
    }
    if (isMobile()) closeDrawer(); // show the player
  }

  function clearSelection() {
    closeFramesLightbox();
    state.selected = null;
    renderPlayer();
    renderDetails();
    renderList();
    history.replaceState(null, '', BASE_PATH);
  }

  function openReelFromUrl() {
    const match = /^\/reels\/(\d+)\/?$/.exec(location.pathname);
    if (!match) return false;
    const reel = state.reels.find((r) => r.id === Number(match[1]));
    if (reel) selectReel(reel, { fromUrl: true });
    return Boolean(reel);
  }

  window.addEventListener('popstate', () => {
    if (!openReelFromUrl()) clearSelection();
  });

  // Mobile-only buttons in the details block depend on the breakpoint
  window
    .matchMedia('(max-width: 899px)')
    .addEventListener('change', renderDetails);

  // --- Player pane ---

  // The <video> keeps showing the previous reel's frame while the next one
  // buffers, so on switch we hide it and show a loading card until the new
  // video has its first frame (loadeddata).
  function resetPlayer() {
    player.pause();
    player.removeAttribute('src');
    player.removeAttribute('poster');
    player.load();
    player.classList.add('hidden');
  }

  player.addEventListener('loadeddata', () => {
    el('player-loading').classList.add('hidden');
    player.classList.remove('hidden');
  });

  player.addEventListener('error', () => {
    if (!player.getAttribute('src')) return; // fired by resetPlayer()
    el('player-loading').classList.add('hidden');
    const status = el('player-status');
    status.textContent = '⚠️ Не удалось загрузить видео';
    status.classList.remove('hidden');
  });

  function renderPlayer() {
    const empty = el('player-empty');
    const status = el('player-status');
    const loading = el('player-loading');
    const reel = state.selected;

    if (!reel) {
      resetPlayer();
      loading.classList.add('hidden');
      status.classList.add('hidden');
      empty.classList.remove('hidden');
      return;
    }

    empty.classList.add('hidden');

    if (reel.status === 'ready' && reel.videoUrl) {
      status.classList.add('hidden');
      if (player.getAttribute('src') !== reel.videoUrl) {
        resetPlayer();
        loading.classList.remove('hidden');
        if (reel.coverUrl) player.poster = reel.coverUrl;
        player.src = reel.videoUrl;
        player.load();
      }
      return;
    }

    resetPlayer();
    loading.classList.add('hidden');
    status.textContent =
      reel.status === 'pending'
        ? '⏳ Ролик обрабатывается — видео появится здесь'
        : '⚠️ Не удалось обработать ролик';
    status.classList.remove('hidden');
  }

  // --- Details panel ---

  function formatDuration(seconds) {
    if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return '';
    const total = Math.round(seconds);
    const minutes = Math.floor(total / 60);
    const rest = String(total % 60).padStart(2, '0');
    return `${minutes}:${rest}`;
  }

  function renderDetails() {
    const details = el('reel-details');
    const empty = el('empty-state');
    details.innerHTML = '';

    if (!state.selected) {
      details.classList.add('hidden');
      empty.classList.remove('hidden');
      return;
    }
    details.classList.remove('hidden');
    empty.classList.add('hidden');

    const reel = state.selected;

    const kicker = document.createElement('p');
    kicker.className = 'details-kicker';
    kicker.textContent =
      reel.status === 'pending'
        ? '⏳ Обрабатывается…'
        : reel.status === 'error'
          ? '⚠️ Ошибка обработки'
          : 'Reel';
    details.appendChild(kicker);

    const title = document.createElement('h2');
    title.textContent = reel.title || reel.shortcode;
    details.appendChild(title);

    if (state.editMode) {
      details.appendChild(buildTagsEditor(reel));
    } else if (reel.tags?.length) {
      const tagsRow = document.createElement('div');
      tagsRow.className = 'details-tags';
      reel.tags.forEach((tag) => {
        const chip = document.createElement('button');
        chip.className = 'details-tag';
        chip.textContent = tagLabel(tag);
        chip.title = 'Показать все ролики с этим тегом';
        chip.addEventListener('click', () => {
          state.filters.tag = tag;
          el('filter-tag').value = tag;
          state.listLimit = LIST_PAGE_SIZE;
          renderList();
        });
        tagsRow.appendChild(chip);
      });
      details.appendChild(tagsRow);
    }

    const metaLine = document.createElement('div');
    metaLine.className = 'details-meta';
    if (reel.author) {
      const author = document.createElement('a');
      author.href = `https://www.instagram.com/${reel.author}/`;
      author.target = '_blank';
      author.rel = 'noopener';
      author.textContent = '@' + reel.author;
      metaLine.appendChild(author);
    }
    const addPart = (text) => {
      const span = document.createElement('span');
      span.textContent = text;
      metaLine.appendChild(span);
    };
    if (reel.publishedAt) {
      addPart(
        new Date(reel.publishedAt).toLocaleDateString('ru-RU', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
      );
    }
    if (reel.duration) addPart(formatDuration(reel.duration));
    if (typeof reel.meta?.viewCount === 'number') {
      addPart(`👁 ${reel.meta.viewCount.toLocaleString('ru-RU')}`);
    }
    if (typeof reel.meta?.likeCount === 'number') {
      addPart(`❤ ${reel.meta.likeCount.toLocaleString('ru-RU')}`);
    }
    if (typeof reel.meta?.commentCount === 'number') {
      addPart(`💬 ${reel.meta.commentCount.toLocaleString('ru-RU')}`);
    }
    if (reel.source === 'map') addPart('📍 с карты');
    details.appendChild(metaLine);

    if (reel.status === 'error' && reel.error) {
      const error = document.createElement('p');
      error.className = 'details-error';
      error.textContent = reel.error;
      details.appendChild(error);
    }

    if (reel.description) {
      const description = document.createElement('p');
      description.className = 'details-description';
      description.textContent = reel.description;
      details.appendChild(description);
    }

    renderTranscript(details, reel);
    renderVision(details, reel);

    const actions = document.createElement('div');
    actions.className = 'details-actions';

    if (isMobile()) {
      const showButton = document.createElement('button');
      showButton.className = 'mini-btn';
      showButton.textContent = '▶️ Показать видео';
      showButton.addEventListener('click', closeDrawer);
      actions.appendChild(showButton);
    }

    const link = document.createElement('a');
    link.className = 'mini-btn instagram-btn';
    link.href = reel.instagramUrl;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Instagram';
    actions.appendChild(link);

    const shareButton = document.createElement('button');
    shareButton.className = 'mini-btn';
    shareButton.textContent = '🔗 Поделиться';
    shareButton.addEventListener('click', () => shareReel(reel, shareButton));
    actions.appendChild(shareButton);

    if (state.editMode && reel.status === 'error') {
      const retryButton = document.createElement('button');
      retryButton.className = 'mini-btn';
      retryButton.textContent = '🔄 Повторить';
      retryButton.addEventListener('click', () => retryReel(reel));
      actions.appendChild(retryButton);
    }

    if (
      state.editMode &&
      reel.status === 'ready' &&
      reel.transcriptStatus !== 'pending'
    ) {
      const transcribeButton = document.createElement('button');
      transcribeButton.className = 'mini-btn';
      transcribeButton.textContent = reel.transcript
        ? '🎙 Распознать заново'
        : '🎙 Распознать аудио';
      transcribeButton.addEventListener('click', () => transcribeReel(reel));
      actions.appendChild(transcribeButton);
    }

    if (
      state.editMode &&
      reel.status === 'ready' &&
      reel.visionStatus !== 'pending'
    ) {
      const visionButton = document.createElement('button');
      visionButton.className = 'mini-btn';
      visionButton.textContent = reel.visionDescription
        ? '🖼 Обновить кадры'
        : '🖼 Разобрать кадры';
      visionButton.addEventListener('click', () => visionReel(reel));
      actions.appendChild(visionButton);
    }

    if (state.editMode) {
      const deleteButton = document.createElement('button');
      deleteButton.className = 'mini-btn danger-btn';
      deleteButton.textContent = 'Удалить';
      deleteButton.addEventListener('click', () => deleteReel(reel));
      actions.appendChild(deleteButton);
    }

    details.appendChild(actions);
  }

  // --- Manual tag editing (edit mode) ---

  // Checkbox chips for every dictionary tag; a toggle saves immediately.
  // A hand-typed new tag is added to the shared dictionary by the server.
  function buildTagsEditor(reel) {
    const wrap = document.createElement('div');
    wrap.className = 'details-tags';

    const names = [
      ...new Set([...state.tags.map((tag) => tag.name), ...(reel.tags || [])]),
    ].sort((a, b) => a.localeCompare(b));

    names.forEach((name) => {
      const chip = document.createElement('label');
      chip.className = 'tag-chip';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = name;
      input.checked = (reel.tags || []).includes(name);
      input.addEventListener('change', () => {
        const checked = [...wrap.querySelectorAll('input:checked')].map(
          (box) => box.value,
        );
        saveReelTags(reel, checked);
      });
      chip.appendChild(input);
      chip.appendChild(document.createTextNode(tagLabel(name)));
      wrap.appendChild(chip);
    });

    const newInput = document.createElement('input');
    newInput.className = 'tag-new-input';
    newInput.type = 'text';
    newInput.placeholder = 'новый тег…';
    const addNewTag = () => {
      const name = newInput.value.trim().toLowerCase();
      if (!name) return;
      newInput.value = '';
      const checked = [...wrap.querySelectorAll('input:checked')].map(
        (box) => box.value,
      );
      saveReelTags(reel, [...new Set([...checked, name])]);
    };
    newInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        addNewTag();
      }
    });
    wrap.appendChild(newInput);

    const addButton = document.createElement('button');
    addButton.className = 'mini-btn';
    addButton.textContent = '+ Добавить';
    addButton.addEventListener('click', addNewTag);
    wrap.appendChild(addButton);

    return wrap;
  }

  async function saveReelTags(reel, tags) {
    const response = await fetch(`${API_BASE}/reels/${reel.id}/tags`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-reels-api-key': getApiKey(),
      },
      body: JSON.stringify({ tags }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      alert(error?.message || 'Не получилось сохранить теги');
      renderDetails();
      return;
    }
    const updated = await response.json();
    reel.tags = updated.tags;
    // A hand-typed tag may be new — refresh the shared dictionary
    const tagsResponse = await fetch('/map-api/tags');
    if (tagsResponse.ok) state.tags = await tagsResponse.json();
    renderDetails();
    renderList();
  }

  // --- Transcript block ---

  function renderTranscript(container, reel) {
    if (reel.transcriptStatus === 'pending') {
      const status = document.createElement('p');
      status.className = 'transcript-status';
      status.textContent = '🎙 Распознаём аудио…';
      container.appendChild(status);
      return;
    }

    if (reel.transcriptStatus === 'error' && reel.transcriptError) {
      const error = document.createElement('p');
      error.className = 'details-error';
      error.textContent = `Распознавание не удалось: ${reel.transcriptError}`;
      container.appendChild(error);
      return;
    }

    if (reel.transcriptStatus !== 'ready') return;

    const cleaned = reel.transcriptClean || '';
    const raw = reel.transcript || '';

    const block = document.createElement('details');
    block.className = 'transcript-block';
    const summary = document.createElement('summary');
    summary.textContent = raw
      ? `🎙 Расшифровка${reel.transcriptLang ? ` (${reel.transcriptLang})` : ''}`
      : '🎙 Расшифровка: речи не найдено';
    block.appendChild(summary);

    if (cleaned || raw) {
      const text = document.createElement('p');
      text.className = 'transcript-text';
      text.textContent = cleaned || raw;
      block.appendChild(text);
    }

    // The uncorrected Whisper text, in case the LLM cleanup distorted a phrase
    if (cleaned && raw && cleaned !== raw) {
      const rawBlock = document.createElement('details');
      rawBlock.className = 'transcript-raw';
      const rawSummary = document.createElement('summary');
      rawSummary.textContent = 'Оригинал распознавания';
      rawBlock.appendChild(rawSummary);
      const rawText = document.createElement('p');
      rawText.className = 'transcript-text';
      rawText.textContent = raw;
      rawBlock.appendChild(rawText);
      block.appendChild(rawBlock);
    }

    container.appendChild(block);
  }

  // --- Frames carousel + lightbox + vision description ---

  const framesLightbox = el('frames-lightbox');
  const framesLightboxImage = el('frames-lightbox-image');
  const framesLightboxCounter = el('frames-lightbox-counter');
  const framesLightboxTime = el('frames-lightbox-time');
  const framesLightboxStrip = el('frames-lightbox-strip');
  const framesLightboxPrev = el('frames-lightbox-prev');
  const framesLightboxNext = el('frames-lightbox-next');

  const framesLightboxState = {
    urls: [],
    index: -1,
  };

  function frameSecondLabel(index) {
    return `${index + 1} сек`;
  }

  function showFramesLightboxAt(index) {
    const urls = framesLightboxState.urls;
    if (!urls.length) {
      closeFramesLightbox();
      return;
    }
    const clamped = Math.max(0, Math.min(index, urls.length - 1));
    framesLightboxState.index = clamped;
    framesLightboxImage.src = urls[clamped];
    framesLightboxImage.alt = `Кадр ${frameSecondLabel(clamped)}`;
    framesLightboxCounter.textContent = `${clamped + 1} / ${urls.length}`;
    framesLightboxTime.textContent = frameSecondLabel(clamped);
    framesLightboxPrev.disabled = clamped <= 0;
    framesLightboxNext.disabled = clamped >= urls.length - 1;
    framesLightboxStrip
      .querySelectorAll('.frames-lightbox__thumb')
      .forEach((thumb, thumbIndex) => {
        thumb.classList.toggle('active', thumbIndex === clamped);
      });
    const activeThumb = framesLightboxStrip.querySelector(
      '.frames-lightbox__thumb.active',
    );
    activeThumb?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    });
    framesLightbox.hidden = false;
    document.body.classList.add('frames-lightbox-open');
  }

  function openFramesLightbox(urls, index) {
    framesLightboxState.urls = urls;
    framesLightboxStrip.innerHTML = '';
    urls.forEach((url, thumbIndex) => {
      const thumb = document.createElement('button');
      thumb.type = 'button';
      thumb.className = 'frames-lightbox__thumb';
      thumb.title = frameSecondLabel(thumbIndex);
      thumb.setAttribute('aria-label', `Кадр ${frameSecondLabel(thumbIndex)}`);
      const img = document.createElement('img');
      img.src = url;
      img.alt = '';
      img.loading = 'lazy';
      const badge = document.createElement('span');
      badge.className = 'frame-second';
      badge.textContent = frameSecondLabel(thumbIndex);
      thumb.appendChild(img);
      thumb.appendChild(badge);
      thumb.addEventListener('click', () => showFramesLightboxAt(thumbIndex));
      framesLightboxStrip.appendChild(thumb);
    });
    showFramesLightboxAt(index);
  }

  function stepFramesLightbox(delta) {
    if (framesLightbox.hidden) return;
    showFramesLightboxAt(framesLightboxState.index + delta);
  }

  function closeFramesLightbox() {
    framesLightbox.hidden = true;
    framesLightboxImage.removeAttribute('src');
    framesLightboxImage.alt = '';
    framesLightboxCounter.textContent = '';
    framesLightboxTime.textContent = '';
    framesLightboxStrip.innerHTML = '';
    framesLightboxState.urls = [];
    framesLightboxState.index = -1;
    document.body.classList.remove('frames-lightbox-open');
  }

  framesLightboxPrev.addEventListener('click', () => stepFramesLightbox(-1));
  framesLightboxNext.addEventListener('click', () => stepFramesLightbox(1));
  el('frames-lightbox-close').addEventListener('click', closeFramesLightbox);
  framesLightbox.addEventListener('click', (event) => {
    if (event.target === framesLightbox) closeFramesLightbox();
  });

  document.addEventListener('keydown', (event) => {
    if (framesLightbox.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeFramesLightbox();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      stepFramesLightbox(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      stepFramesLightbox(1);
    }
  });

  function renderVision(container, reel) {
    if (reel.frameUrls?.length) {
      const strip = document.createElement('div');
      strip.className = 'frames-strip';
      reel.frameUrls.forEach((url, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'frames-strip__item';
        button.title = frameSecondLabel(index);
        button.setAttribute(
          'aria-label',
          `Открыть кадр ${frameSecondLabel(index)}`,
        );
        const img = document.createElement('img');
        img.src = url;
        img.alt = '';
        img.loading = 'lazy';
        const badge = document.createElement('span');
        badge.className = 'frame-second';
        badge.textContent = frameSecondLabel(index);
        button.appendChild(img);
        button.appendChild(badge);
        button.addEventListener('click', () =>
          openFramesLightbox(reel.frameUrls, index),
        );
        strip.appendChild(button);
      });
      container.appendChild(strip);
    }

    if (reel.visionStatus === 'pending') {
      const status = document.createElement('p');
      status.className = 'transcript-status';
      status.textContent = '🖼 Разбираем кадры…';
      container.appendChild(status);
      return;
    }

    if (reel.visionStatus === 'error' && reel.visionError) {
      const error = document.createElement('p');
      error.className = 'details-error';
      error.textContent = `Разбор кадров не удался: ${reel.visionError}`;
      container.appendChild(error);
      return;
    }

    if (reel.visionStatus !== 'ready' || !reel.visionDescription) return;

    const block = document.createElement('details');
    block.className = 'transcript-block';
    const summary = document.createElement('summary');
    summary.textContent = '🖼 Что происходит в ролике';
    block.appendChild(summary);
    const text = document.createElement('p');
    text.className = 'transcript-text';
    text.textContent = reel.visionDescription;
    block.appendChild(text);
    container.appendChild(block);
  }

  async function visionReel(reel) {
    const response = await fetch(`${API_BASE}/reels/${reel.id}/vision`, {
      method: 'POST',
      headers: { 'x-reels-api-key': getApiKey() },
    });
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      alert(error?.message || 'Не удалось запустить разбор кадров');
      return;
    }
    const updated = await response.json();
    const index = state.reels.findIndex((r) => r.id === reel.id);
    if (index !== -1) state.reels[index] = updated;
    if (state.selected?.id === reel.id) state.selected = updated;
    renderDetails();
    schedulePolling();
  }

  async function transcribeReel(reel) {
    const response = await fetch(`${API_BASE}/reels/${reel.id}/transcribe`, {
      method: 'POST',
      headers: { 'x-reels-api-key': getApiKey() },
    });
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      alert(error?.message || 'Не удалось запустить распознавание');
      return;
    }
    const updated = await response.json();
    const index = state.reels.findIndex((r) => r.id === reel.id);
    if (index !== -1) state.reels[index] = updated;
    if (state.selected?.id === reel.id) state.selected = updated;
    renderDetails();
    schedulePolling();
  }

  async function shareReel(reel, button) {
    const url = `${location.origin}${BASE_PATH}/${reel.id}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: reel.title || reel.shortcode, url });
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

  // --- Reels list (covers, meta, filters, pagination) ---

  function reelDate(reel) {
    return new Date(reel.publishedAt || reel.createdAt);
  }

  function matchesFilters(reel) {
    if (state.filters.author && reel.author !== state.filters.author) {
      return false;
    }
    if (state.filters.status && reel.status !== state.filters.status) {
      return false;
    }
    if (state.filters.tag && !(reel.tags || []).includes(state.filters.tag)) {
      return false;
    }
    if (state.filters.own === 'others' && reel.isOwn) return false;
    if (state.filters.own === 'own' && !reel.isOwn) return false;
    if (state.filters.query) {
      const haystack = [
        reel.title,
        reel.description,
        reel.author,
        reel.transcript,
        reel.transcriptClean,
        reel.visionDescription,
        (reel.tags || []).join(' '),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const substringMatch = haystack.includes(state.filters.query);
      const semanticMatch = state.semantic?.has(reel.id);
      if (!substringMatch && !semanticMatch) return false;
    }
    return true;
  }

  // --- Semantic search (server-side, pgvector) ---

  let semanticTimer = null;
  let semanticSeq = 0;

  async function fetchSemantic(query) {
    const seq = ++semanticSeq;
    try {
      const response = await fetch(
        `${API_BASE}/search?q=${encodeURIComponent(query)}`,
        { headers: pageHeaders },
      );
      if (!response.ok) return;
      const results = await response.json();
      // Ignore stale responses (query changed while we were waiting)
      if (seq !== semanticSeq || query !== state.filters.query) return;
      state.semantic = new Map(results.map((r) => [r.id, r.similarity]));
      renderList();
    } catch {
      /* network error — substring filtering still works */
    }
  }

  function scheduleSemanticSearch() {
    clearTimeout(semanticTimer);
    state.semantic = null;
    if (state.filters.query.length < 3) return;
    semanticTimer = setTimeout(
      () => fetchSemantic(state.filters.query),
      400,
    );
  }

  // --- Q&A over the notebook (🤖 button) ---

  const askPanel = el('ask-panel');
  const askAnswer = el('ask-answer');
  const askSources = el('ask-sources');

  // The model references reels as [#id]; turn those into links
  function renderAskAnswer(text) {
    askAnswer.innerHTML = '';
    const parts = String(text).split(/\[#(\d+)\]/g);
    parts.forEach((part, index) => {
      if (index % 2 === 0) {
        askAnswer.appendChild(document.createTextNode(part));
        return;
      }
      const reel = state.reels.find((r) => r.id === Number(part));
      if (!reel) {
        askAnswer.appendChild(document.createTextNode(`[#${part}]`));
        return;
      }
      const link = document.createElement('span');
      link.className = 'ask-reel-link';
      link.textContent = reel.title ? `«${reel.title}»` : `#${part}`;
      link.addEventListener('click', () => selectReel(reel));
      askAnswer.appendChild(link);
    });
  }

  function renderAskSources(sources) {
    askSources.innerHTML = '';
    sources.forEach((source) => {
      const reel = state.reels.find((r) => r.id === source.id);
      if (!reel) return;
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'ask-source-chip';
      chip.textContent = reel.title || `Рилс #${reel.id}`;
      chip.addEventListener('click', () => selectReel(reel));
      askSources.appendChild(chip);
    });
  }

  async function askNotebook() {
    const question = searchInput.value.trim();
    if (!question) {
      searchInput.placeholder = 'Введите вопрос и нажмите 🤖';
      searchInput.focus();
      return;
    }
    askPanel.classList.remove('hidden');
    askAnswer.textContent = 'Думаю…';
    askSources.innerHTML = '';
    try {
      const response = await fetch(
        `${API_BASE}/ask?q=${encodeURIComponent(question)}`,
        { headers: pageHeaders },
      );
      if (!response.ok) throw new Error(String(response.status));
      const result = await response.json();
      if (!result.answer) {
        askAnswer.textContent =
          'В записной книжке не нашлось ничего подходящего к вопросу';
        return;
      }
      renderAskAnswer(result.answer);
      renderAskSources(result.sources || []);
    } catch {
      askAnswer.textContent = 'Не получилось получить ответ — попробуйте ещё раз';
    }
  }

  el('ask-button').addEventListener('click', askNotebook);
  el('ask-close').addEventListener('click', () =>
    askPanel.classList.add('hidden'),
  );

  function renderList() {
    updateAuthorFilter();
    updateTagFilter();
    recentList.innerHTML = '';

    // With an active search: most relevant first (semantic similarity),
    // substring-only matches after, newest first within equal relevance
    const filtered = state.reels.filter(matchesFilters).sort((a, b) => {
      if (state.filters.query && state.semantic) {
        const sa = state.semantic.get(a.id) ?? -1;
        const sb = state.semantic.get(b.id) ?? -1;
        if (sa !== sb) return sb - sa;
      }
      return reelDate(b) - reelDate(a);
    });

    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'recent-empty';
      empty.textContent = state.reels.length
        ? 'Ничего не найдено'
        : 'Пока пусто — включите режим редактирования и добавьте первую ссылку';
      recentList.appendChild(empty);
      el('list-more').classList.add('hidden');
      return;
    }

    filtered.slice(0, state.listLimit).forEach((reel) => {
      recentList.appendChild(buildListItem(reel));
    });

    const moreButton = el('list-more');
    const remaining = filtered.length - state.listLimit;
    moreButton.classList.toggle('hidden', remaining <= 0);
    if (remaining > 0) {
      moreButton.textContent = `Показать ещё (${remaining})`;
    }
  }

  function buildListItem(reel) {
    const item = document.createElement('button');
    item.className = 'recent-item';
    if (state.selected?.id === reel.id) item.classList.add('selected');

    if (reel.coverUrl) {
      const cover = document.createElement('img');
      cover.className = 'recent-cover';
      cover.src = reel.coverUrl;
      cover.alt = '';
      cover.loading = 'lazy';
      item.appendChild(cover);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'recent-cover recent-cover-placeholder';
      placeholder.textContent =
        reel.status === 'error' ? '⚠️' : reel.status === 'pending' ? '⏳' : '🎬';
      item.appendChild(placeholder);
    }

    const body = document.createElement('div');
    body.className = 'recent-body';

    const name = document.createElement('div');
    name.className = 'recent-name';
    name.textContent = reel.title || reel.shortcode;
    body.appendChild(name);

    const metaLine = document.createElement('div');
    metaLine.className = 'recent-meta';
    const parts = [];
    if (reel.status === 'pending') parts.push('⏳ обработка');
    if (reel.status === 'error') parts.push('⚠️ ошибка');
    if (reel.author) parts.push('@' + reel.author);
    parts.push(reelDate(reel).toLocaleDateString('ru-RU'));
    if (reel.duration) parts.push(formatDuration(reel.duration));
    if (typeof reel.meta?.likeCount === 'number') {
      parts.push(`❤ ${reel.meta.likeCount}`);
    }
    if (reel.source === 'map') parts.push('📍 с карты');
    (reel.tags || []).slice(0, 3).forEach((tag) => parts.push(tagLabel(tag)));
    metaLine.textContent = parts.join(' · ');
    body.appendChild(metaLine);

    item.appendChild(body);
    item.addEventListener('click', () => selectReel(reel));
    return item;
  }

  function updateAuthorFilter() {
    const select = el('filter-author');
    const current = select.value;
    const authors = [
      ...new Set(state.reels.map((reel) => reel.author).filter(Boolean)),
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
    const used = new Set(state.reels.flatMap((reel) => reel.tags || []));
    const tags = [...used].sort();

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

  el('filter-author').addEventListener('change', (event) => {
    state.filters.author = event.target.value;
    state.listLimit = LIST_PAGE_SIZE;
    renderList();
  });

  el('filter-tag').addEventListener('change', (event) => {
    state.filters.tag = event.target.value;
    state.listLimit = LIST_PAGE_SIZE;
    renderList();
  });

  el('filter-status').addEventListener('change', (event) => {
    state.filters.status = event.target.value;
    state.listLimit = LIST_PAGE_SIZE;
    renderList();
  });

  el('filter-own').addEventListener('change', (event) => {
    state.filters.own = event.target.value;
    state.listLimit = LIST_PAGE_SIZE;
    renderList();
  });

  searchInput.addEventListener('input', () => {
    state.filters.query = searchInput.value.trim().toLowerCase();
    state.listLimit = LIST_PAGE_SIZE;
    scheduleSemanticSearch();
    renderList();
  });

  el('list-more').addEventListener('click', () => {
    state.listLimit += LIST_PAGE_SIZE;
    renderList();
  });

  // --- Polling: pending reels are being processed by yt-dlp on the server ---

  function isProcessing(reel) {
    return (
      reel.status === 'pending' ||
      reel.transcriptStatus === 'pending' ||
      reel.visionStatus === 'pending'
    );
  }

  function schedulePolling() {
    clearTimeout(state.pollTimer);
    if (!state.reels.some(isProcessing)) return;
    state.pollTimer = setTimeout(pollPending, POLL_INTERVAL_MS);
  }

  async function pollPending() {
    const pending = state.reels.filter(isProcessing);
    await Promise.all(
      pending.map(async (reel) => {
        try {
          const response = await fetch(`${API_BASE}/reels/${reel.id}`, {
            headers: pageHeaders,
          });
          if (!response.ok) return;
          const fresh = await response.json();
          const index = state.reels.findIndex((r) => r.id === reel.id);
          if (index !== -1) state.reels[index] = fresh;
          if (state.selected?.id === reel.id) state.selected = fresh;
        } catch {
          // transient network error — retry on the next tick
        }
      }),
    );
    renderList();
    renderPlayer();
    renderDetails();
    schedulePolling();
  }

  // --- Edit mode (Google session; a machine API key still works) ---

  function getApiKey() {
    return localStorage.getItem(KEY_STORAGE) || '';
  }

  async function verifyKey(key) {
    const response = await fetch(`${API_BASE}/key-check`, {
      method: 'POST',
      headers: key ? { 'x-reels-api-key': key } : {},
    });
    return response.ok;
  }

  async function ensureKey() {
    // Passes with the session cookie alone, or with a stored legacy key
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
    addForm.classList.toggle('hidden', !enabled);
    el('edit-hint').classList.toggle('hidden', !enabled);
    renderDetails(); // retry/delete buttons appear or disappear
  }

  // --- Adding a reel ---

  addForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = el('add-url');
    const submit = el('add-submit');
    const instagramUrl = input.value.trim();
    if (!instagramUrl) return;

    submit.disabled = true;
    submit.textContent = 'Добавляю…';
    try {
      const response = await fetch(`${API_BASE}/reels`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-reels-api-key': getApiKey(),
        },
        body: JSON.stringify({ instagramUrl }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        alert(error?.message || 'Не удалось добавить');
        return;
      }
      const created = await response.json();
      state.reels = [
        created,
        ...state.reels.filter((r) => r.id !== created.id),
      ];
      input.value = '';
      renderList();
      selectReel(created);
      schedulePolling();
    } finally {
      submit.disabled = false;
      submit.textContent = 'Добавить';
    }
  });

  async function retryReel(reel) {
    const response = await fetch(`${API_BASE}/reels/${reel.id}/retry`, {
      method: 'POST',
      headers: { 'x-reels-api-key': getApiKey() },
    });
    if (!response.ok) {
      alert('Не удалось перезапустить');
      return;
    }
    const restarted = await response.json();
    const index = state.reels.findIndex((r) => r.id === reel.id);
    if (index !== -1) state.reels[index] = restarted;
    if (state.selected?.id === reel.id) state.selected = restarted;
    renderList();
    renderPlayer();
    renderDetails();
    schedulePolling();
  }

  async function deleteReel(reel) {
    const ok = await window.AppDialog.confirm(
      `Удалить «${reel.title || reel.shortcode}»?`,
      { danger: true, confirmLabel: 'Удалить' },
    );
    if (!ok) return;
    const response = await fetch(`${API_BASE}/reels/${reel.id}`, {
      method: 'DELETE',
      headers: { 'x-reels-api-key': getApiKey() },
    });
    if (!response.ok) {
      alert('Не удалось удалить');
      return;
    }
    state.reels = state.reels.filter((r) => r.id !== reel.id);
    if (state.selected?.id === reel.id) {
      clearSelection();
    } else {
      renderList();
    }
  }

  loadReels();
})();
