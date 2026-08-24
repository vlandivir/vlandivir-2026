(() => {
  const API = '/threads-api';
  const LIMIT = 500;
  const OWN_USERNAME = 'vlandivir';

  const COLUMNS = 6;

  const state = {
    posts: [],
    selectedId: null,
    expandedId: null,
    saving: false,
    dirty: false,
    pollOn: false,
    freshReplyIds: {},
  };

  const STAT_ICONS = {
    views:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>',
    likes:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
    replies:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  };

  const el = (id) => document.getElementById(id);

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

  function statusLabel(post) {
    const bits = [post.status === 'published' ? 'опубликовано' : 'черновик'];
    if ((post.poll || []).filter(Boolean).length >= 2) bits.push('опрос');
    if (post.destination === 'diary') bits.push('дневник');
    if (post.ghost) bits.push('ghost');
    if ((post.images || []).length) bits.push(String(post.images.length));
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

  function replyIds(post) {
    const items = post.replies?.replies || [];
    return new Set(
      items.map((item) => String(item.id || '')).filter(Boolean),
    );
  }

  function freshIdsFor(post) {
    return state.freshReplyIds[String(post.id)] || null;
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
      const firstImage = (post.images || [])[0];
      if (firstImage?.url) {
        const img = document.createElement('img');
        img.className = 'thumb';
        img.src = firstImage.url;
        img.alt = '';
        previewInner.append(img);
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

  function renderImages(post) {
    const list = el('image-list');
    const images = post.images || [];
    list.replaceChildren();
    el('file-btn').hidden = false;
    for (const image of images) {
      const chip = document.createElement('div');
      chip.className = 'image-chip';
      const img = document.createElement('img');
      img.src = image.url;
      img.alt = '';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Убрать';
      remove.addEventListener('click', () => removeImage(image.id));
      chip.append(img, remove);
      list.append(chip);
    }
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
      let parent =
        nestedId(item['replied_to'] || item.replied_to) || rootId;
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

    const images = post.images || [];
    if (images.length) {
      const media = document.createElement('div');
      media.className = 'post-media';
      for (const image of images) {
        const img = document.createElement('img');
        img.src = image.url;
        img.alt = '';
        media.append(img);
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
    el('poll-on').disabled = (post.images || []).length > 0;
    el('image-input').disabled = state.pollOn;
    state.pollOn = (post.poll || []).filter(Boolean).length >= 2;
    updateCharCount();
    renderPoll(post);
    renderImages(post);
    updateActionButtons();
  }

  function hideEditor() {
    state.selectedId = null;
    state.dirty = false;
    state.pollOn = false;
    el('editor').hidden = true;
    updateActionButtons();
  }

  function updateCharCount() {
    const text = el('draft-text').value.trim();
    const count = el('char-count');
    count.textContent =
      text.length <= LIMIT
        ? `${text.length} / ${LIMIT}`
        : `${text.length} символов · тред, первый пост до ${LIMIT}`;
    count.dataset.over = text.length > LIMIT ? 'true' : 'false';
  }

  function updateActionButtons() {
    const post = selected();
    const editing = Boolean(post) && post.status !== 'published';
    el('save-draft').disabled = !editing || !state.dirty || state.saving;
    el('publish').disabled = !editing || state.saving;
    el('close-editor').disabled = state.saving;
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
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
    const targets = state.posts.filter(
      (post) => post.status === 'published' && (post.mediaId || post.url),
    );
    if (!targets.length) {
      setStatus('Нет опубликованных постов для обновления');
      return;
    }
    setStatus('Обновляю данные…');
    try {
      const fresh = {};
      let freshTotal = 0;
      for (const post of targets) {
        const before = replyIds(post);
        const updated = await fetchJson(`${API}/posts/${post.id}/insights`, {
          method: 'POST',
        });
        const added = [...replyIds(updated)].filter((id) => !before.has(id));
        if (added.length) {
          fresh[String(updated.id)] = new Set(added);
          freshTotal += added.length;
        }
        replacePost(updated);
      }
      state.freshReplyIds = fresh;
      renderList();
      setStatus(
        freshTotal
          ? `Данные обновлены · новых ответов: ${freshTotal}`
          : 'Данные обновлены',
      );
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  async function uploadImages(files) {
    const post = selected();
    if (!post || !files.length) return;
    const body = new FormData();
    for (const file of files) body.append('images', file);
    try {
      const updated = await fetchJson(`${API}/posts/${post.id}/images`, {
        method: 'POST',
        body,
      });
      replacePost(updated);
      renderImages(updated);
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  async function removeImage(imageId) {
    const post = selected();
    if (!post) return;
    try {
      const updated = await fetchJson(
        `${API}/posts/${post.id}/images/${imageId}`,
        { method: 'DELETE' },
      );
      replacePost(updated);
      renderImages(updated);
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
  el('draft-text').addEventListener('input', markDirty);
  el('destination-diary').addEventListener('change', markDirty);
  el('ghost').addEventListener('change', markDirty);
  el('poll-on').addEventListener('change', () => {
    const post = selected();
    if (!post) return;
    state.pollOn = el('poll-on').checked;
    if (!state.pollOn) post.poll = [];
    else if (!post.poll?.length) post.poll = ['', ''];
    renderPoll(post);
    markDirty();
  });
  el('image-input').addEventListener('change', (event) => {
    const files = [...event.target.files];
    event.target.value = '';
    void uploadImages(files);
  });
  window.addEventListener('beforeunload', (event) => {
    if (!state.dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });

  updateActionButtons();
  void loadPosts().catch((error) => setStatus(error.message, true));
})();
