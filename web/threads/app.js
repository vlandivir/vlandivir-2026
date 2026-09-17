(() => {
  const API = '/threads-api';
  const LIMIT = 500;
  const OWN_USERNAME = 'vlandivir';

  const COLUMNS = 6;
  const SENTENCE_SPLIT = /(?<=[.!?…])\s+/;

  const state = {
    posts: [],
    selectedId: null,
    expandedId: null,
    saving: false,
    dirty: false,
    pollOn: false,
    aiActions: [],
    aiRunning: false,
    aiEditingId: null,
    aiUndo: null,
    uploading: false,
  };

  const STAT_ICONS = {
    views:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>',
    likes:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
    replies:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    reposts:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m17 1 4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="m7 23-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
  };

  const el = (id) => document.getElementById(id);

  function packChunks(parts, limit, joiner) {
    const chunks = [];
    let current = '';
    for (const part of parts) {
      const piece = part.trim();
      if (!piece) continue;
      const candidate = current ? `${current}${joiner}${piece}` : piece;
      if (candidate.length <= limit) {
        current = candidate;
        continue;
      }
      if (current) chunks.push(current);
      if (piece.length <= limit) {
        current = piece;
      } else {
        chunks.push(...splitOversized(piece, limit));
        current = '';
      }
    }
    if (current) chunks.push(current);
    return chunks;
  }

  function splitByLength(text, limit) {
    if (!text) return [''];
    const parts = [];
    for (let i = 0; i < text.length; i += limit) {
      parts.push(text.slice(i, i + limit));
    }
    return parts;
  }

  function splitOversized(text, limit) {
    if (text.length <= limit) return [text];
    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length > 1) {
      const packed = packChunks(lines, limit, '\n');
      if (
        packed.length &&
        Math.max(...packed.map((part) => part.length)) <= limit
      ) {
        return packed;
      }
    }
    const sentences = text
      .split(SENTENCE_SPLIT)
      .map((item) => item.trim())
      .filter(Boolean);
    if (sentences.length > 1) {
      const packed = packChunks(sentences, limit, ' ');
      if (
        packed.length &&
        Math.max(...packed.map((part) => part.length)) <= limit
      ) {
        return packed;
      }
    }
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length > 1) {
      const packed = packChunks(words, limit, ' ');
      if (
        packed.length &&
        Math.max(...packed.map((part) => part.length)) <= limit
      ) {
        return packed;
      }
    }
    return splitByLength(text, limit);
  }

  function splitIntoPosts(text, limit = LIMIT) {
    const trimmed = text.trim();
    if (!trimmed) return [];
    if (trimmed.length <= limit) return [trimmed];
    const paragraphs = trimmed
      .split(/\n\s*\n/)
      .map((block) => block.trim())
      .filter(Boolean);
    return packChunks(paragraphs, limit, '\n\n');
  }

  function ruPlural(n, one, few, many) {
    const abs = Math.abs(n) % 100;
    const d = abs % 10;
    if (abs > 10 && abs < 20) return many;
    if (d === 1) return one;
    if (d >= 2 && d <= 4) return few;
    return many;
  }

  async function fetchJson(url, options) {
    const response = await fetch(url, options);
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { message: text };
    }
    if (!response.ok) {
      throw new Error(data?.message || `${url}: HTTP ${response.status}`);
    }
    return data;
  }

  function setStatus(message, isError) {
    const line = el('status-line');
    if (!message) {
      line.hidden = true;
      line.textContent = '';
      return;
    }
    line.hidden = false;
    line.textContent = message;
    line.classList.toggle('muted', !isError);
  }

  function safeExternalUrl(value) {
    try {
      const url = new URL(String(value || ''));
      return url.protocol === 'http:' || url.protocol === 'https:'
        ? url.href
        : null;
    } catch {
      return null;
    }
  }

  function clearAiResult() {
    state.aiUndo = null;
    el('ai-result').hidden = true;
    el('ai-result-title').textContent = '';
    el('ai-result-body').replaceChildren();
    el('ai-result-sources').replaceChildren();
    el('ai-result-sources').hidden = true;
    updateAiUndo();
  }

  function updateAiUndo() {
    const undo = state.aiUndo;
    const available =
      Boolean(undo) &&
      undo.draftId === state.selectedId &&
      el('draft-text').value === undo.after;
    el('ai-undo').hidden = !available;
  }

  function appendAnalysisText(container, text, citations) {
    const items = Array.isArray(citations)
      ? citations
          .filter(
            (item) =>
              Number.isInteger(item.startIndex) &&
              Number.isInteger(item.endIndex) &&
              item.endIndex > item.startIndex &&
              safeExternalUrl(item.url),
          )
          .sort((a, b) => a.startIndex - b.startIndex)
      : [];
    let cursor = 0;
    for (const item of items) {
      const start = Math.max(cursor, Math.min(text.length, item.startIndex));
      const end = Math.max(start, Math.min(text.length, item.endIndex));
      if (start > cursor) container.append(text.slice(cursor, start));
      if (end <= cursor) continue;
      const link = document.createElement('a');
      link.href = safeExternalUrl(item.url);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = text.slice(start, end);
      link.title = item.title || item.url;
      container.append(link);
      cursor = end;
    }
    if (cursor < text.length) container.append(text.slice(cursor));
  }

  function renderAiSources(sources) {
    const box = el('ai-result-sources');
    box.replaceChildren();
    const valid = (Array.isArray(sources) ? sources : []).filter((source) =>
      safeExternalUrl(source.url),
    );
    if (!valid.length) {
      box.hidden = true;
      return;
    }
    const label = document.createElement('p');
    label.className = 'field-label';
    label.textContent = 'Источники';
    const list = document.createElement('ul');
    for (const source of valid) {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = safeExternalUrl(source.url);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = source.title || source.url;
      item.append(link);
      list.append(item);
    }
    box.append(label, list);
    box.hidden = false;
  }

  function renderAiResult(action, result, textChanged) {
    const panel = el('ai-result');
    const body = el('ai-result-body');
    el('ai-result-title').textContent = action.label;
    body.replaceChildren();
    if (result.kind === 'analysis') {
      appendAnalysisText(body, result.text || '', result.citations);
      renderAiSources(result.sources);
    } else {
      body.textContent =
        result.message ||
        (textChanged
          ? 'Текст исправлен.'
          : 'Орфографических изменений не найдено.');
      el('ai-result-sources').replaceChildren();
      el('ai-result-sources').hidden = true;
    }
    panel.hidden = false;
    updateAiUndo();
  }

  function renderAiButtons() {
    const box = el('ai-action-buttons');
    box.replaceChildren();
    for (const action of state.aiActions.filter((item) => item.enabled)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ghost-btn';
      button.textContent = action.label;
      button.disabled =
        state.aiRunning || !selected() || selected()?.status === 'published';
      button.addEventListener('click', () => {
        void runAiAction(action);
      });
      box.append(button);
    }
    const undo = state.aiUndo;
    if (
      undo &&
      undo.draftId === state.selectedId &&
      el('draft-text').value === undo.after
    ) {
      const undoButton = document.createElement('button');
      undoButton.type = 'button';
      undoButton.className = 'mini-btn';
      undoButton.textContent = 'Вернуть текст';
      undoButton.addEventListener('click', undoAiText);
      box.append(undoButton);
    }
    if (!box.childElementCount) {
      const empty = document.createElement('span');
      empty.className = 'muted';
      empty.textContent = 'Нет включённых кнопок';
      box.append(empty);
    }
  }

  function aiMeta(action) {
    const bits = [
      action.responseMode === 'replace_text' ? 'замена текста' : 'ответ',
      action.model,
      action.reasoningEffort,
    ];
    if (action.webSearch) bits.push('web search');
    if (!action.enabled) bits.push('выключена');
    return bits.join(' · ');
  }

  function renderAiActionList() {
    const list = el('ai-action-list');
    list.replaceChildren();
    el('ai-action-empty').hidden = state.aiActions.length > 0;
    for (const action of state.aiActions) {
      const row = document.createElement('article');
      row.className = 'ai-action-row';
      if (!action.enabled) row.classList.add('is-disabled');
      const copy = document.createElement('div');
      const title = document.createElement('p');
      title.className = 'field-label';
      title.textContent = action.label;
      const meta = document.createElement('p');
      meta.className = 'muted';
      meta.textContent = aiMeta(action);
      copy.append(title, meta);
      const controls = document.createElement('div');
      controls.className = 'ai-action-row-controls';
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'mini-btn';
      edit.textContent = 'Изменить';
      edit.addEventListener('click', () => openAiActionForm(action));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'mini-btn';
      remove.textContent = 'Удалить';
      remove.addEventListener('click', () => void deleteAiAction(action));
      controls.append(edit, remove);
      row.append(copy, controls);
      list.append(row);
    }
  }

  async function loadAiActions() {
    state.aiActions = await fetchJson(`${API}/ai-actions`);
    renderAiButtons();
    renderAiActionList();
  }

  function aiFormField(name) {
    return el('ai-action-form').elements.namedItem(name);
  }

  function openAiActionForm(action) {
    const form = el('ai-action-form');
    state.aiEditingId = action?.id || null;
    aiFormField('label').value = action?.label || '';
    aiFormField('prompt').value = action?.prompt || '';
    aiFormField('responseMode').value = action?.responseMode || 'analysis';
    aiFormField('model').value = action?.model || 'gpt-5.6-terra';
    aiFormField('reasoningEffort').value = action?.reasoningEffort || 'none';
    aiFormField('sortOrder').value = String(action?.sortOrder ?? 0);
    aiFormField('webSearch').checked = Boolean(action?.webSearch);
    aiFormField('enabled').checked = action?.enabled ?? true;
    form.hidden = false;
    aiFormField('label').focus();
  }

  function closeAiActionForm() {
    state.aiEditingId = null;
    el('ai-action-form').hidden = true;
    el('ai-action-form').reset();
  }

  async function saveAiAction(event) {
    event.preventDefault();
    const payload = {
      label: aiFormField('label').value.trim(),
      prompt: aiFormField('prompt').value.trim(),
      responseMode: aiFormField('responseMode').value,
      model: aiFormField('model').value,
      reasoningEffort: aiFormField('reasoningEffort').value,
      sortOrder: Number(aiFormField('sortOrder').value || 0),
      webSearch: aiFormField('webSearch').checked,
      enabled: aiFormField('enabled').checked,
    };
    const id = state.aiEditingId;
    try {
      await fetchJson(id ? `${API}/ai-actions/${id}` : `${API}/ai-actions`, {
        method: id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      await loadAiActions();
      closeAiActionForm();
      setStatus('AI-кнопка сохранена');
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  async function deleteAiAction(action) {
    const dialog = window.AppDialog;
    const ok = dialog
      ? await dialog.confirm(`Удалить кнопку «${action.label}»?`, {
          confirmLabel: 'Удалить',
          danger: true,
        })
      : window.confirm(`Удалить кнопку «${action.label}»?`);
    if (!ok) return;
    try {
      await fetchJson(`${API}/ai-actions/${action.id}`, { method: 'DELETE' });
      if (state.aiEditingId === action.id) closeAiActionForm();
      await loadAiActions();
      setStatus('AI-кнопка удалена');
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  async function runAiAction(action) {
    const post = selected();
    const area = el('draft-text');
    if (!post || post.status === 'published' || state.aiRunning) return;
    if (!area.value.trim()) {
      setStatus('Сначала напишите текст черновика', true);
      area.focus();
      return;
    }
    state.aiRunning = true;
    renderAiButtons();
    setStatus(`${action.label}…`);
    try {
      const result = await fetchJson(`${API}/ai-actions/${action.id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: area.value }),
      });
      let textChanged = false;
      if (result.kind === 'replace_text' && typeof result.text === 'string') {
        const before = area.value;
        const after = result.text;
        textChanged = before !== after;
        if (textChanged) {
          area.value = after;
          state.aiUndo = { draftId: post.id, before, after };
          markDirty();
        } else {
          state.aiUndo = null;
        }
      } else {
        state.aiUndo = null;
      }
      updateCharCount();
      renderAiResult(action, result, textChanged);
      setStatus(textChanged ? 'Текст исправлен' : 'Проверка завершена');
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      state.aiRunning = false;
      renderAiButtons();
      updateActionButtons();
    }
  }

  function undoAiText() {
    const undo = state.aiUndo;
    if (
      !undo ||
      undo.draftId !== state.selectedId ||
      el('draft-text').value !== undo.after
    ) {
      state.aiUndo = null;
      updateAiUndo();
      return;
    }
    el('draft-text').value = undo.before;
    state.aiUndo = null;
    markDirty();
    updateCharCount();
    updateAiUndo();
    setStatus('Предыдущий текст возвращён');
  }

  function preview(text) {
    const line = (text || '')
      .split('\n')
      .map((item) => item.trim())
      .find(Boolean);
    if (!line) return 'Пустой черновик';
    return line.length > 140 ? `${line.slice(0, 139)}…` : line;
  }

  function postDate(post) {
    if (post.status === 'published') {
      return post.publishedAt || post.updatedAt || post.createdAt;
    }
    return post.updatedAt || post.createdAt;
  }

  function sortPosts() {
    state.posts.sort(
      (a, b) => Date.parse(postDate(b) || 0) - Date.parse(postDate(a) || 0),
    );
  }

  function formatWhen(stamp) {
    if (!stamp) return '—';
    const parsed = new Date(stamp);
    if (Number.isNaN(parsed.getTime())) return stamp.slice(0, 16);
    const day = String(parsed.getDate()).padStart(2, '0');
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const hours = String(parsed.getHours()).padStart(2, '0');
    const minutes = String(parsed.getMinutes()).padStart(2, '0');
    return `${day}.${month} ${hours}:${minutes}`;
  }

  function compactText(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function pollPercent(value) {
    if (typeof value !== 'number' || Number.isNaN(value)) return 0;
    return value <= 1 ? Math.round(value * 100) : Math.round(value);
  }

  function rootText(post) {
    const fromDump = post.replies?.root?.text;
    if (fromDump) return String(fromDump);
    return post.text || '';
  }

  function isRootCopy(item, post) {
    const id = String(item.id || '');
    const root = post.replies?.root;
    if (root?.id && id && id === String(root.id)) return true;
    const text = compactText(item.text);
    if (!text) return false;
    const rootCopy = compactText(root?.text);
    const full = compactText(post.text);
    return (rootCopy && text === rootCopy) || (full && text === full);
  }

  function selected() {
    return state.posts.find((post) => post.id === state.selectedId) || null;
  }

  function postMedia(post) {
    if (Array.isArray(post?.media)) return post.media;
    return (post?.images || []).map((image) => ({
      ...image,
      kind: 'image',
      uploadStatus: 'ready',
    }));
  }

  function statusLabel(post) {
    const bits = [post.status === 'published' ? 'опубликовано' : 'черновик'];
    if ((post.poll || []).filter(Boolean).length >= 2) bits.push('опрос');
    if (post.destination === 'diary') bits.push('дневник');
    if (post.ghost) bits.push('ghost');
    if (postMedia(post).length) bits.push(String(postMedia(post).length));
    return bits.join(' · ');
  }

  function delta(current, previous) {
    if (typeof current !== 'number') return null;
    if (typeof previous !== 'number' || current === previous) return null;
    const sign = current > previous ? '+' : '';
    return `${sign}${current - previous}`;
  }

  function statIcon(kind) {
    const wrap = document.createElement('span');
    wrap.className = 'stat-icon';
    wrap.innerHTML = STAT_ICONS[kind] || '';
    return wrap;
  }

  function appendStat(row, kind, label, current, previous) {
    if (typeof current !== 'number') return;
    const item = document.createElement('span');
    item.className = 'stat-item';
    item.title = label;
    item.append(statIcon(kind));
    const value = document.createElement('span');
    value.textContent = String(current);
    item.append(value);
    const change = delta(current, previous);
    if (change) {
      const extra = document.createElement('span');
      extra.className = 'muted';
      extra.textContent = change;
      item.append(extra);
    }
    row.append(item);
  }

  function freshIdsFor(post) {
    const ids = post.replies?.freshIds;
    if (!Array.isArray(ids) || !ids.length) return null;
    return new Set(ids.map((id) => String(id || '')).filter(Boolean));
  }

  function renderPollOptions(poll, box) {
    if (!poll?.options?.length) return;
    for (const option of poll.options) {
      const pct = pollPercent(option.percent);
      const line = document.createElement('div');
      line.className = 'cell-poll-line';
      const name = document.createElement('span');
      name.textContent = option.text || '';
      const value = document.createElement('span');
      value.className = 'muted';
      value.textContent = `${pct}%`;
      line.append(name, value);
      const bar = document.createElement('div');
      bar.className = 'poll-bar';
      const fill = document.createElement('span');
      fill.style.width = `${Math.min(pct, 100)}%`;
      bar.append(fill);
      box.append(line, bar);
    }
  }

  function renderList() {
    const list = el('post-list');
    const empty = el('list-empty');
    const table = list.closest('table');
    list.replaceChildren();
    empty.hidden = state.posts.length > 0;
    if (table) table.hidden = state.posts.length === 0;

    for (const post of state.posts) {
      const published = post.status === 'published';
      const expanded = published && post.id === state.expandedId;
      const selected = post.id === state.selectedId || expanded;
      const row = document.createElement('tr');
      row.className = 'post-row';
      row.dataset.id = String(post.id);
      if (selected) row.setAttribute('aria-selected', 'true');
      if (published) {
        row.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      }

      const previewCell = document.createElement('td');
      const previewInner = document.createElement('div');
      previewInner.className = 'preview-cell';
      if (published) {
        const chevron = document.createElement('span');
        chevron.className = 'chevron';
        chevron.setAttribute('aria-hidden', 'true');
        chevron.textContent = '▸';
        previewInner.append(chevron);
      }
      const firstMedia = postMedia(post)[0];
      if (firstMedia?.url) {
        const media =
          firstMedia.kind === 'video'
            ? document.createElement('video')
            : document.createElement('img');
        media.className = 'thumb';
        media.src = firstMedia.url;
        media.alt = '';
        if (media instanceof HTMLVideoElement) {
          media.muted = true;
          media.preload = 'metadata';
        }
        previewInner.append(media);
      } else {
        const dash = document.createElement('span');
        dash.className = 'thumb-empty';
        dash.textContent = '—';
        previewInner.append(dash);
      }
      previewCell.append(previewInner);

      const statusCell = document.createElement('td');
      statusCell.className = 'cell-status';
      statusCell.textContent = statusLabel(post);

      const whenCell = document.createElement('td');
      whenCell.className = 'cell-when muted';
      whenCell.textContent = formatWhen(postDate(post));

      const textCell = document.createElement('td');
      textCell.className = 'cell-text';
      const clip = document.createElement('span');
      clip.className = 'cell-clip';
      clip.textContent = preview(post.text);
      textCell.append(clip);

      const linkCell = document.createElement('td');
      if (post.url) {
        const link = document.createElement('a');
        link.href = post.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'в Threads';
        link.addEventListener('click', (event) => event.stopPropagation());
        linkCell.append(link);
      } else {
        linkCell.textContent = '—';
      }

      const statsCell = document.createElement('td');
      statsCell.className = 'cell-stats';
      if (post.status === 'published') {
        const stats = post.stats || {};
        const prev = post.statsPrev || {};
        const statRow = document.createElement('div');
        statRow.className = 'stat-row';
        appendStat(statRow, 'views', 'просмотры', stats.views, prev.views);
        appendStat(statRow, 'likes', 'лайки', stats.likes, prev.likes);
        appendStat(statRow, 'replies', 'ответы', stats.replies, prev.replies);
        appendStat(statRow, 'reposts', 'репосты', stats.reposts, prev.reposts);
        if (statRow.childElementCount) statsCell.append(statRow);
        const poll = post.pollResults;
        if (poll?.options?.length) {
          const pollBox = document.createElement('div');
          pollBox.className = 'cell-poll';
          renderPollOptions(poll, pollBox);
          statsCell.append(pollBox);
        }
        if (stats.updated) {
          const sync = document.createElement('div');
          sync.className = 'muted cell-sync';
          sync.textContent = `синхр. ${formatWhen(stats.updated)}`;
          statsCell.append(sync);
        }
        if (!statsCell.childElementCount) statsCell.textContent = '—';
      } else {
        statsCell.textContent = '—';
      }

      row.append(
        previewCell,
        statusCell,
        whenCell,
        textCell,
        linkCell,
        statsCell,
      );
      row.addEventListener('click', () => {
        void onRowClick(post.id);
      });
      row.tabIndex = 0;
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          void onRowClick(post.id);
        }
      });
      list.append(row);

      if (expanded) {
        const detail = document.createElement('tr');
        detail.className = 'post-detail';
        const cell = document.createElement('td');
        cell.colSpan = COLUMNS;
        const panel = document.createElement('div');
        panel.className = 'thread-panel';
        renderThreadPanel(post, panel);
        cell.append(panel);
        detail.append(cell);
        list.append(detail);
      }
    }
  }

  function utf8Bytes(value) {
    return new TextEncoder().encode(value).length;
  }

  function renderPoll(post) {
    const on = el('poll-on');
    const box = el('poll-options');
    const options = post.poll?.length ? post.poll.slice() : ['', ''];
    while (options.length < 2) options.push('');
    on.checked = state.pollOn;
    box.hidden = !state.pollOn;
    box.replaceChildren();
    if (!on.checked) return;
    const count = Math.min(Math.max(options.length, 2), 4);
    for (let i = 0; i < count; i += 1) {
      const input = document.createElement('input');
      input.type = 'text';
      input.value = options[i] || '';
      input.placeholder = `Вариант ${i + 1}`;
      input.addEventListener('input', () => {
        if (utf8Bytes(input.value) > 25) {
          input.value = Array.from(input.value).reduce((acc, char) => {
            const next = acc + char;
            return utf8Bytes(next) > 25 ? acc : next;
          }, '');
        }
        markDirty();
      });
      box.append(input);
    }
    if (count < 4) {
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'ghost-btn';
      add.textContent = '+ вариант';
      add.addEventListener('click', () => {
        const current = collectPoll();
        current.push('');
        const live = selected();
        if (live) live.poll = current;
        renderPoll(live || { poll: current });
        markDirty();
      });
      box.append(add);
    }
  }

  function collectPoll() {
    if (!state.pollOn) return [];
    const options = [...el('poll-options').querySelectorAll('input')]
      .map((input) => input.value.trim())
      .filter(Boolean);
    return options.length >= 2 ? options : [];
  }

  function renderMedia(post) {
    const list = el('media-list');
    const mediaItems = postMedia(post);
    list.replaceChildren();
    el('file-btn').hidden = false;
    for (const item of mediaItems) {
      const chip = document.createElement('div');
      chip.className = 'media-chip';
      chip.dataset.mediaId = String(item.id);
      const preview =
        item.kind === 'video'
          ? document.createElement('video')
          : document.createElement('img');
      preview.src = item.url;
      preview.alt = '';
      if (preview instanceof HTMLVideoElement) {
        preview.muted = true;
        preview.preload = 'metadata';
      }
      const info = document.createElement('div');
      info.className = 'media-chip-info';
      const name = document.createElement('span');
      name.textContent =
        item.originalFilename ||
        (item.kind === 'video' ? 'Видео' : 'Изображение');
      const progress = document.createElement('div');
      progress.className = 'media-upload-progress';
      const fill = document.createElement('span');
      if (item.uploadStatus === 'ready') fill.style.width = '100%';
      progress.append(fill);
      const status = document.createElement('span');
      status.className = 'muted media-upload-status';
      status.textContent =
        item.uploadStatus === 'ready' ? 'Готово' : 'Ожидает загрузки';
      info.append(name, progress, status);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Убрать';
      remove.disabled = state.uploading;
      remove.addEventListener('click', () => removeMedia(item.id));
      chip.append(preview, info, remove);
      list.append(chip);
    }
  }

  function updateMediaProgress(mediaId, percent, label) {
    const chip = el('media-list').querySelector(`[data-media-id="${mediaId}"]`);
    if (!chip) return;
    chip.querySelector('.media-upload-progress > span').style.width =
      `${Math.max(0, Math.min(100, percent))}%`;
    chip.querySelector('.media-upload-status').textContent = label;
  }

  function metricLabel(current, previous) {
    if (typeof current !== 'number') return '—';
    const change = delta(current, previous);
    return change ? `${current} (${change})` : String(current);
  }

  function renderMetrics(post, box) {
    box.replaceChildren();
    box.hidden = false;
    const stats = post.stats || {};
    const prev = post.statsPrev || {};
    const row = document.createElement('div');
    row.className = 'metric-row';
    const items = [
      ['Просмотры', metricLabel(stats.views, prev.views)],
      ['Лайки', metricLabel(stats.likes, prev.likes)],
      ['Ответы', metricLabel(stats.replies, prev.replies)],
      ['Репосты', metricLabel(stats.reposts, prev.reposts)],
    ];
    for (const [label, value] of items) {
      const chip = document.createElement('span');
      chip.className = 'meta-chip';
      chip.textContent = `${label}: ${value}`;
      row.append(chip);
    }
    box.replaceChildren(row);
    if (stats.updated) {
      const sync = document.createElement('p');
      sync.className = 'muted';
      sync.textContent = `Статистика от ${formatWhen(stats.updated)}`;
      box.append(sync);
    }
    if (post.url) {
      const link = document.createElement('a');
      link.href = post.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = post.url;
      box.append(link);
    }
    const poll = post.pollResults;
    if (poll?.options?.length) {
      const title = document.createElement('p');
      title.className = 'muted';
      title.textContent = `Опрос · ${poll.totalVotes ?? '—'} голосов`;
      box.append(title);
      renderPollOptions(poll, box);
    }
  }

  function nestedId(value) {
    if (value && typeof value === 'object') return String(value.id || '');
    return value ? String(value) : '';
  }

  function buildChildren(rootId, replies) {
    const children = new Map();
    const known = new Set(replies.map((item) => String(item.id || '')));
    known.add(rootId);
    for (const item of replies) {
      let parent = nestedId(item['replied_to'] || item.replied_to) || rootId;
      if (!known.has(parent)) parent = rootId;
      const bucket = children.get(parent) || [];
      bucket.push(item);
      children.set(parent, bucket);
    }
    return children;
  }

  function renderReplyNode(item, children, depth, freshIds) {
    const article = document.createElement('article');
    article.className = 'reply';
    article.dataset.depth = String(Math.min(depth, 4));
    const id = String(item.id || '');
    const isFresh = Boolean(freshIds?.has(id));
    if (isFresh) article.classList.add('reply-new');
    const username = String(item.username || 'unknown');
    const own =
      item['is_reply_owned_by_me'] === true ||
      item.is_reply_owned_by_me === true ||
      username === OWN_USERNAME;

    const head = document.createElement('header');
    head.className = 'reply-head';
    const who = document.createElement('a');
    who.className = 'reply-who';
    who.textContent = `@${username}`;
    if (item.permalink) {
      who.href = String(item.permalink);
      who.target = '_blank';
      who.rel = 'noopener noreferrer';
    } else {
      who.href = '#';
      who.addEventListener('click', (event) => event.preventDefault());
    }
    head.append(who);
    if (own) {
      const you = document.createElement('span');
      you.className = 'reply-you';
      you.textContent = 'вы';
      head.append(you);
    }
    if (item.timestamp) {
      const time = document.createElement('time');
      time.className = 'muted';
      time.textContent = formatWhen(String(item.timestamp));
      head.append(time);
    }
    const hide = String(
      item['hide_status'] || item.hide_status || 'NOT_HUSHED',
    );
    if (hide && hide !== 'NOT_HUSHED') {
      const badge = document.createElement('span');
      badge.className = 'muted';
      badge.textContent = hide.toLowerCase();
      head.append(badge);
    }
    if (isFresh) {
      const mark = document.createElement('span');
      mark.className = 'reply-new-mark';
      mark.textContent = 'новое';
      head.append(mark);
    }
    article.append(head);

    if (item.text) {
      const text = document.createElement('p');
      text.className = 'reply-text';
      text.textContent = String(item.text);
      article.append(text);
    }

    const mediaUrl = item.thumbnail_url || item.media_url || item.gif_url;
    if (mediaUrl) {
      const media = document.createElement('img');
      media.className = 'reply-media';
      media.src = String(mediaUrl);
      media.alt = '';
      article.append(media);
    }

    const kids = children.get(String(item.id || '')) || [];
    if (kids.length) {
      const nest = document.createElement('div');
      nest.className = 'reply-children';
      for (const kid of kids) {
        nest.append(renderReplyNode(kid, children, depth + 1, freshIds));
      }
      article.append(nest);
    }
    return article;
  }

  function renderReplies(post, box) {
    const dump = post.replies;
    const replies = (dump?.replies || []).filter(
      (item) => !isRootCopy(item, post),
    );
    box.replaceChildren();
    if (!replies.length) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    const counts = dump.counts || dump['counts'] || {};
    const freshIds = freshIdsFor(post);
    const freshCount = freshIds
      ? replies.filter((item) => freshIds.has(String(item.id || ''))).length
      : 0;
    const title = document.createElement('p');
    title.className = 'field-label';
    title.textContent =
      freshCount > 0
        ? `Ответы · ${counts.total ?? replies.length} · новых: ${freshCount}`
        : `Ответы · ${counts.total ?? replies.length}`;
    box.replaceChildren(title);
    const rootId = String(dump.root?.id || post.mediaId || '');
    if (!rootId) {
      for (const item of replies) {
        box.append(renderReplyNode(item, new Map(), 0, freshIds));
      }
      return;
    }
    const children = buildChildren(rootId, replies);
    for (const item of children.get(rootId) || []) {
      box.append(renderReplyNode(item, children, 0, freshIds));
    }
  }

  function renderThreadPanel(post, panel) {
    panel.replaceChildren();
    const kicker = document.createElement('p');
    kicker.className = 'eyebrow';
    kicker.textContent = statusLabel(post);
    panel.append(kicker);

    const text = document.createElement('div');
    text.className = 'published-text';
    text.textContent = rootText(post);
    panel.append(text);

    const mediaItems = postMedia(post);
    if (mediaItems.length) {
      const media = document.createElement('div');
      media.className = 'post-media';
      for (const item of mediaItems) {
        const preview =
          item.kind === 'video'
            ? document.createElement('video')
            : document.createElement('img');
        preview.src = item.url;
        preview.alt = '';
        if (preview instanceof HTMLVideoElement) {
          preview.controls = true;
          preview.preload = 'metadata';
        }
        media.append(preview);
      }
      panel.append(media);
    }

    const metrics = document.createElement('section');
    metrics.className = 'metrics';
    renderMetrics(post, metrics);
    panel.append(metrics);

    const replies = document.createElement('section');
    replies.className = 'replies';
    renderReplies(post, replies);
    panel.append(replies);
  }

  function renderEditor() {
    const post = selected();
    const editor = el('editor');
    if (!post || post.status === 'published') {
      editor.hidden = true;
      updateActionButtons();
      return;
    }
    editor.hidden = false;
    el('editor-kicker').textContent = 'Черновик';
    el('draft-text').value = post.text || '';
    el('draft-text').disabled = false;
    el('destination-diary').checked = post.destination === 'diary';
    el('ghost').checked = Boolean(post.ghost);
    el('destination-diary').disabled = false;
    el('ghost').disabled = false;
    state.pollOn = (post.poll || []).filter(Boolean).length >= 2;
    el('poll-on').disabled = postMedia(post).length > 0 || state.uploading;
    el('media-input').disabled = state.pollOn || state.uploading;
    updateCharCount();
    renderPoll(post);
    renderMedia(post);
    renderAiButtons();
    updateActionButtons();
  }

  function hideEditor() {
    state.selectedId = null;
    state.dirty = false;
    state.pollOn = false;
    el('editor').hidden = true;
    clearAiResult();
    renderAiButtons();
    updateActionButtons();
  }

  function syncDraftMirror() {
    const area = el('draft-text');
    const mirror = el('draft-mirror');
    mirror.scrollTop = area.scrollTop;
    mirror.scrollLeft = area.scrollLeft;
  }

  function fitDraftArea() {
    const area = el('draft-text');
    area.style.height = 'auto';
    area.style.height = `${Math.min(Math.max(area.scrollHeight, 256), 560)}px`;
  }

  function renderDraftSplits(raw) {
    const wrap = el('draft-wrap');
    const mirror = el('draft-mirror');
    const posts = splitIntoPosts(raw);
    if (posts.length <= 1) {
      wrap.classList.remove('is-split');
      mirror.replaceChildren();
      el('draft-text').style.height = '';
      return { count: posts.length, sizes: posts.map((post) => post.length) };
    }
    wrap.classList.add('is-split');
    const frag = document.createDocumentFragment();
    let cursor = 0;
    const sizes = [];
    posts.forEach((post, index) => {
      let start = raw.indexOf(post, cursor);
      if (start === -1) start = cursor;
      if (start > cursor) frag.append(raw.slice(cursor, start));
      const slice = document.createElement('span');
      slice.className = index % 2 ? 'draft-slice is-alt' : 'draft-slice';
      slice.textContent = raw.slice(start, start + post.length);
      frag.append(slice);
      sizes.push(post.length);
      if (index < posts.length - 1) {
        const cut = document.createElement('span');
        cut.className = 'draft-cut';
        cut.dataset.n = String(index + 2);
        cut.textContent = '\u200b';
        frag.append(cut);
      }
      cursor = start + post.length;
    });
    if (cursor < raw.length) frag.append(raw.slice(cursor));
    mirror.replaceChildren(frag, '\n');
    fitDraftArea();
    syncDraftMirror();
    return { count: posts.length, sizes };
  }

  function updateCharCount() {
    const raw = el('draft-text').value;
    const text = raw.trim();
    const count = el('char-count');
    const parts = renderDraftSplits(raw);
    if (text.length <= LIMIT) {
      count.textContent = `${text.length} / ${LIMIT}`;
      count.dataset.over = 'false';
      return;
    }
    const n = Math.max(parts.count, 2);
    const sizes = parts.sizes.length ? ` · ${parts.sizes.join(' + ')}` : '';
    count.textContent = `${text.length} · ${n} ${ruPlural(n, 'пост', 'поста', 'постов')}${sizes}`;
    count.dataset.over = 'false';
  }

  function updateActionButtons() {
    const post = selected();
    const editing = Boolean(post) && post.status !== 'published';
    el('save-draft').disabled = !editing || !state.dirty || state.saving;
    el('publish').disabled =
      !editing ||
      state.saving ||
      state.uploading ||
      postMedia(post).some((item) => item.uploadStatus !== 'ready');
    el('close-editor').disabled = state.saving || state.uploading;
    renderAiButtons();
  }

  function markDirty() {
    if (!selected() || selected().status === 'published') return;
    state.dirty = true;
    updateCharCount();
    updateActionButtons();
  }

  async function confirmDiscard() {
    if (!state.dirty) return true;
    const dialog = window.AppDialog;
    const ok = dialog
      ? await dialog.confirm(
          'Есть несохранённые изменения. Закрыть без сохранения?',
          { confirmLabel: 'Закрыть' },
        )
      : window.confirm('Есть несохранённые изменения. Закрыть без сохранения?');
    if (ok) state.dirty = false;
    return ok;
  }

  function collectDraft() {
    return {
      text: el('draft-text').value,
      destination: el('destination-diary').checked ? 'diary' : 'threads',
      ghost: el('ghost').checked,
      poll: collectPoll(),
    };
  }

  async function saveDraft() {
    const post = selected();
    if (!post || post.status === 'published' || state.saving) return false;
    state.saving = true;
    updateActionButtons();
    try {
      const updated = await fetchJson(`${API}/posts/${post.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(collectDraft()),
      });
      replacePost(updated);
      state.dirty = false;
      setStatus('Сохранено');
      return true;
    } catch (error) {
      setStatus(error.message, true);
      return false;
    } finally {
      state.saving = false;
      updateActionButtons();
    }
  }

  function replacePost(updated) {
    const index = state.posts.findIndex((post) => post.id === updated.id);
    if (index === -1) state.posts.unshift(updated);
    else state.posts[index] = updated;
    sortPosts();
    renderList();
  }

  function scrollEditorIntoView() {
    const editor = el('editor');
    if (editor.hidden) return;
    const reduce = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    editor.scrollIntoView({
      behavior: reduce ? 'auto' : 'smooth',
      block: 'start',
    });
  }

  async function onRowClick(id) {
    const post = state.posts.find((item) => item.id === id);
    if (!post) return;

    if (post.status !== 'published') {
      if (state.selectedId === id) return;
      if (!(await confirmDiscard())) return;
      state.expandedId = null;
      state.selectedId = id;
      state.pollOn = (post.poll || []).filter(Boolean).length >= 2;
      clearAiResult();
      renderList();
      renderEditor();
      scrollEditorIntoView();
      return;
    }

    if (state.selectedId && !(await confirmDiscard())) return;
    hideEditor();
    state.expandedId = state.expandedId === id ? null : id;
    renderList();
  }

  async function loadPosts() {
    state.posts = await fetchJson(`${API}/posts`);
    sortPosts();
    if (
      state.selectedId &&
      !state.posts.some((post) => post.id === state.selectedId)
    ) {
      hideEditor();
    }
    if (
      state.expandedId &&
      !state.posts.some((post) => post.id === state.expandedId)
    ) {
      state.expandedId = null;
    }
    renderList();
    if (state.selectedId) renderEditor();
  }

  async function newDraft() {
    if (!(await confirmDiscard())) return;
    const created = await fetchJson(`${API}/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '', destination: 'threads' }),
    });
    state.posts.unshift(created);
    sortPosts();
    state.expandedId = null;
    state.selectedId = created.id;
    state.pollOn = false;
    clearAiResult();
    renderList();
    renderEditor();
    el('draft-text').focus();
    scrollEditorIntoView();
  }

  async function closeEditor() {
    if (!(await confirmDiscard())) return;
    hideEditor();
    renderList();
  }

  async function publish() {
    const post = selected();
    if (!post) return;
    if (state.dirty) {
      const saved = await saveDraft();
      if (!saved) return;
    }
    const dialog = window.AppDialog;
    const ok = dialog
      ? await dialog.confirm(
          'Отправить этот черновик в Threads и дневник? Отменить нельзя.',
          { confirmLabel: 'Отправить', danger: true },
        )
      : window.confirm(
          'Отправить этот черновик в Threads и дневник? Отменить нельзя.',
        );
    if (!ok) return;
    el('publish').disabled = true;
    setStatus('Публикую…');
    try {
      const updated = await fetchJson(`${API}/posts/${post.id}/publish`, {
        method: 'POST',
      });
      replacePost(updated);
      hideEditor();
      state.expandedId = updated.id;
      renderList();
      setStatus(
        updated.url ? `Опубликовано: ${updated.url}` : 'Сохранено в дневник',
      );
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      updateActionButtons();
    }
  }

  async function refreshInsights() {
    const btn = el('refresh-insights');
    btn.disabled = true;
    setStatus('Обновляю данные…');
    try {
      const adopted = await fetchJson(`${API}/reconcile`, { method: 'POST' });
      if (Array.isArray(adopted)) {
        for (const post of adopted) replacePost(post);
      }
      const targets = state.posts.filter(
        (post) => post.status === 'published' && (post.mediaId || post.url),
      );
      if (!targets.length) {
        renderList();
        setStatus(
          Array.isArray(adopted) && adopted.length
            ? `Подобрано черновиков в Threads: ${adopted.length}`
            : 'Нет опубликованных постов для обновления',
        );
        return;
      }
      let freshTotal = 0;
      let failed = 0;
      for (const post of targets) {
        try {
          const updated = await fetchJson(`${API}/posts/${post.id}/insights`, {
            method: 'POST',
          });
          const added = updated.replies?.freshIds;
          if (Array.isArray(added)) freshTotal += added.length;
          replacePost(updated);
        } catch {
          failed += 1;
        }
      }
      renderList();
      const bits = [];
      if (Array.isArray(adopted) && adopted.length) {
        bits.push(`подобрано черновиков: ${adopted.length}`);
      }
      bits.push(
        freshTotal ? `новых ответов: ${freshTotal}` : 'данные обновлены',
      );
      if (failed) bits.push(`ошибок: ${failed}`);
      setStatus(bits.join(' · '), failed > 0 && failed === targets.length);
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      btn.disabled = false;
    }
  }

  function mediaMime(file) {
    if (file.type) return file.type.toLowerCase();
    const name = file.name.toLowerCase();
    if (name.endsWith('.mp4')) return 'video/mp4';
    if (name.endsWith('.mov')) return 'video/quicktime';
    if (name.endsWith('.png')) return 'image/png';
    if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
    return '';
  }

  function videoDuration(file) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const url = URL.createObjectURL(file);
      const cleanup = () => URL.revokeObjectURL(url);
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        const duration = video.duration;
        cleanup();
        if (!Number.isFinite(duration)) {
          reject(new Error(`${file.name}: не удалось определить длительность`));
          return;
        }
        resolve(duration);
      };
      video.onerror = () => {
        cleanup();
        reject(new Error(`${file.name}: браузер не смог прочитать видео`));
      };
      video.src = url;
    });
  }

  async function validateMediaFiles(files) {
    const result = [];
    for (const file of files) {
      const mimeType = mediaMime(file);
      const image = mimeType === 'image/jpeg' || mimeType === 'image/png';
      const video = mimeType === 'video/mp4' || mimeType === 'video/quicktime';
      if (!image && !video) {
        throw new Error(`${file.name}: поддерживаются JPEG, PNG, MP4 и MOV`);
      }
      if (image && file.size > 8 * 1024 * 1024) {
        throw new Error(`${file.name}: изображение больше 8 МБ`);
      }
      if (video && file.size > 1024 * 1024 * 1024) {
        throw new Error(`${file.name}: видео больше 1 ГБ`);
      }
      if (video && (await videoDuration(file)) > 300) {
        throw new Error(`${file.name}: видео длиннее 5 минут`);
      }
      result.push({ file, mimeType });
    }
    return result;
  }

  function putWithProgress(url, file, headers, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      Object.entries(headers || {}).forEach(([name, value]) => {
        xhr.setRequestHeader(name, value);
      });
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else
          reject(
            new Error(
              `${file.name}: загрузка завершилась с HTTP ${xhr.status}`,
            ),
          );
      };
      xhr.onerror = () => reject(new Error(`${file.name}: ошибка сети`));
      xhr.send(file);
    });
  }

  async function uploadMedia(files) {
    const post = selected();
    if (!post || !files.length) return;
    if (state.pollOn) {
      setStatus('Опрос нельзя совмещать с медиа', true);
      return;
    }
    state.uploading = true;
    updateActionButtons();
    try {
      const validated = await validateMediaFiles(files);
      const prepared = await fetchJson(
        `${API}/posts/${post.id}/media/uploads`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            files: validated.map(({ file, mimeType }) => ({
              name: file.name,
              mimeType,
              size: file.size,
            })),
          }),
        },
      );
      replacePost(prepared.post);
      renderMedia(prepared.post);
      const failures = [];
      for (let index = 0; index < prepared.uploads.length; index += 1) {
        const upload = prepared.uploads[index];
        const { file } = validated[index];
        try {
          await putWithProgress(
            upload.uploadUrl,
            file,
            upload.headers,
            (percent) =>
              updateMediaProgress(
                upload.mediaId,
                percent,
                `Загрузка ${percent}%`,
              ),
          );
          updateMediaProgress(upload.mediaId, 100, 'Проверяю…');
          const updated = await fetchJson(
            `${API}/posts/${post.id}/media/${upload.mediaId}/complete`,
            { method: 'POST' },
          );
          replacePost(updated);
          renderMedia(updated);
        } catch (error) {
          failures.push(error.message);
          updateMediaProgress(upload.mediaId, 0, 'Ошибка загрузки');
        }
      }
      setStatus(
        failures.length
          ? `Не загружено: ${failures.join('; ')}`
          : 'Медиа загружены',
        failures.length > 0,
      );
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      state.uploading = false;
      const current = selected();
      if (current) {
        el('poll-on').disabled = postMedia(current).length > 0;
        el('media-input').disabled = state.pollOn;
        renderMedia(current);
      }
      updateActionButtons();
    }
  }

  async function removeMedia(mediaId) {
    const post = selected();
    if (!post) return;
    try {
      const updated = await fetchJson(
        `${API}/posts/${post.id}/media/${mediaId}`,
        { method: 'DELETE' },
      );
      replacePost(updated);
      renderMedia(updated);
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  el('new-draft').addEventListener('click', () => {
    void newDraft().catch((error) => setStatus(error.message, true));
  });
  el('save-draft').addEventListener('click', () => {
    void saveDraft();
  });
  el('close-editor').addEventListener('click', () => {
    void closeEditor();
  });
  el('publish').addEventListener('click', () => {
    void publish();
  });
  el('refresh-insights').addEventListener('click', () => {
    void refreshInsights();
  });
  el('ai-settings-toggle').addEventListener('click', () => {
    el('ai-settings').hidden = !el('ai-settings').hidden;
  });
  el('ai-settings-close').addEventListener('click', () => {
    el('ai-settings').hidden = true;
    closeAiActionForm();
  });
  el('ai-action-new').addEventListener('click', () => openAiActionForm(null));
  el('ai-action-cancel').addEventListener('click', closeAiActionForm);
  el('ai-action-form').addEventListener('submit', (event) => {
    void saveAiAction(event);
  });
  el('ai-undo').addEventListener('click', undoAiText);
  el('ai-result-close').addEventListener('click', () => {
    el('ai-result').hidden = true;
  });
  el('draft-text').addEventListener('input', () => {
    if (state.aiUndo && el('draft-text').value !== state.aiUndo.after) {
      state.aiUndo = null;
      updateAiUndo();
      renderAiButtons();
    }
    updateCharCount();
    markDirty();
  });
  el('draft-text').addEventListener('scroll', syncDraftMirror);
  new ResizeObserver(syncDraftMirror).observe(el('draft-text'));
  el('destination-diary').addEventListener('change', markDirty);
  el('ghost').addEventListener('change', markDirty);
  el('poll-on').addEventListener('change', () => {
    const post = selected();
    if (!post) return;
    state.pollOn = el('poll-on').checked;
    if (!state.pollOn) post.poll = [];
    else if (!post.poll?.length) post.poll = ['', ''];
    el('media-input').disabled = state.pollOn;
    renderPoll(post);
    markDirty();
  });
  el('media-input').addEventListener('change', (event) => {
    const files = [...event.target.files];
    event.target.value = '';
    void uploadMedia(files);
  });
  window.addEventListener('beforeunload', (event) => {
    if (!state.dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });

  updateActionButtons();
  void Promise.all([loadPosts(), loadAiActions()]).catch((error) =>
    setStatus(error.message, true),
  );
})();
