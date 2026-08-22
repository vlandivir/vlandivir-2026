(() => {
  const API = '/threads-api';
  const LIMIT = 500;
  const OWN_USERNAME = 'vlandivir';
  const SUGGESTED_TOPICS = [
    'AI',
    'Technology',
    'Design',
    'Photography',
    'Startups',
    'Music',
  ];

  const state = {
    posts: [],
    selectedId: null,
    saving: false,
    dirty: false,
    pollOn: false,
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

  function appendStat(box, label, current, previous) {
    if (typeof current !== 'number') return;
    const line = document.createElement('div');
    line.className = 'stat-line';
    const value = document.createElement('span');
    value.textContent = `${current} ${label}`;
    line.append(value);
    const change = delta(current, previous);
    if (change) {
      const extra = document.createElement('span');
      extra.className = 'muted';
      extra.textContent = change;
      line.append(extra);
    }
    box.append(line);
  }

  function renderList() {
    const list = el('post-list');
    const empty = el('list-empty');
    const table = list.closest('table');
    list.replaceChildren();
    empty.hidden = state.posts.length > 0;
    if (table) table.hidden = state.posts.length === 0;

    for (const post of state.posts) {
      const row = document.createElement('tr');
      row.dataset.id = String(post.id);
      if (post.id === state.selectedId) {
        row.setAttribute('aria-selected', 'true');
      }

      const previewCell = document.createElement('td');
      const firstImage = (post.images || [])[0];
      if (firstImage?.url) {
        const img = document.createElement('img');
        img.className = 'thumb';
        img.src = firstImage.url;
        img.alt = '';
        previewCell.append(img);
      } else {
        const dash = document.createElement('span');
        dash.className = 'thumb-empty';
        dash.textContent = '—';
        previewCell.append(dash);
      }

      const statusCell = document.createElement('td');
      statusCell.className = 'cell-status';
      statusCell.textContent = statusLabel(post);

      const whenCell = document.createElement('td');
      whenCell.className = 'cell-when muted';
      whenCell.textContent = formatWhen(postDate(post));

      const textCell = document.createElement('td');
      textCell.className = 'cell-text';
      textCell.textContent = preview(post.text);

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
        appendStat(statsCell, 'просм.', stats.views, prev.views);
        appendStat(statsCell, 'лайк.', stats.likes, prev.likes);
        appendStat(statsCell, 'отв.', stats.replies, prev.replies);
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
      row.addEventListener('click', () => selectPost(post.id));
      row.tabIndex = 0;
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          void selectPost(post.id);
        }
      });
      list.append(row);
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
        scheduleSave();
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
        scheduleSave();
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

  function renderImages(post, locked) {
    const list = el('image-list');
    const images = post.images || [];
    list.replaceChildren();
    el('images-field').hidden = locked && images.length === 0;
    el('file-btn').hidden = locked;
    for (const image of images) {
      const chip = document.createElement('div');
      chip.className = 'image-chip';
      const img = document.createElement('img');
      img.src = image.url;
      img.alt = '';
      chip.append(img);
      if (!locked) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = 'Убрать';
        remove.addEventListener('click', () => removeImage(image.id));
        chip.append(remove);
      }
      list.append(chip);
    }
  }

  function metricLabel(current, previous) {
    if (typeof current !== 'number') return '—';
    const change = delta(current, previous);
    return change ? `${current} (${change})` : String(current);
  }

  function renderMetrics(post) {
    const box = el('metrics');
    if (post.status !== 'published') {
      box.hidden = true;
      box.replaceChildren();
      return;
    }
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
      for (const option of poll.options) {
        const label = document.createElement('div');
        const pct = Math.round((option.percent || 0) * 100);
        label.textContent = `${option.text} · ${pct}%`;
        const bar = document.createElement('div');
        bar.className = 'poll-bar';
        const fill = document.createElement('span');
        fill.style.width = `${Math.min(pct, 100)}%`;
        bar.append(fill);
        box.append(label, bar);
      }
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
      let parent = nestedId(item.replied_to) || rootId;
      if (!known.has(parent)) parent = rootId;
      const bucket = children.get(parent) || [];
      bucket.push(item);
      children.set(parent, bucket);
    }
    return children;
  }

  function renderReplyNode(item, children, depth) {
    const article = document.createElement('article');
    article.className = 'reply';
    article.dataset.depth = String(Math.min(depth, 4));
    const username = String(item.username || 'unknown');
    const own =
      item.is_reply_owned_by_me === true || username === OWN_USERNAME;

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
    const hide = String(item.hide_status || 'NOT_HUSHED');
    if (hide && hide !== 'NOT_HUSHED') {
      const badge = document.createElement('span');
      badge.className = 'muted';
      badge.textContent = hide.toLowerCase();
      head.append(badge);
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
        nest.append(renderReplyNode(kid, children, depth + 1));
      }
      article.append(nest);
    }
    return article;
  }

  function renderReplies(post) {
    const box = el('replies');
    const dump = post.replies;
    const replies = dump?.replies;
    if (!Array.isArray(replies) || !replies.length) {
      box.hidden = true;
      box.replaceChildren();
      return;
    }
    box.hidden = false;
    const title = document.createElement('p');
    title.className = 'field-label';
    title.textContent = `Ответы · ${dump.counts?.total ?? replies.length}`;
    box.replaceChildren(title);
    const rootId = String(dump.root?.id || post.mediaId || '');
    if (!rootId) {
      for (const item of replies) {
        box.append(renderReplyNode(item, new Map(), 0));
      }
      return;
    }
    const children = buildChildren(rootId, replies);
    for (const item of children.get(rootId) || []) {
      box.append(renderReplyNode(item, children, 0));
    }
  }

  function renderEditor() {
    const post = selected();
    const editor = el('editor');
    if (!post) {
      editor.hidden = true;
      return;
    }
    editor.hidden = false;
    const locked = post.status === 'published';
    el('editor-kicker').textContent = locked
      ? statusLabel(post)
      : 'Черновик';
    el('draft-field').hidden = locked;
    el('draft-options').hidden = locked;
    el('published-text').hidden = !locked;
    if (locked) {
      el('published-text').textContent = post.text || '';
    } else {
      el('draft-text').value = post.text || '';
      el('draft-text').disabled = false;
    }
    el('destination-diary').checked = post.destination === 'diary';
    el('ghost').checked = Boolean(post.ghost);
    el('topic').value = post.topic || '';
    el('destination-diary').disabled = locked;
    el('ghost').disabled = locked;
    el('topic').disabled = locked;
    el('poll-on').disabled = locked || (post.images || []).length > 0;
    el('image-input').disabled = locked || state.pollOn;
    el('publish').disabled = locked;
    updateCharCount();
    state.pollOn = (post.poll || []).filter(Boolean).length >= 2 || state.pollOn;
    if (post.status === 'published') {
      state.pollOn = (post.poll || []).filter(Boolean).length >= 2;
    }
    renderPoll(post);
    renderImages(post, locked);
    renderMetrics(post);
    renderReplies(post);
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

  function collectDraft() {
    return {
      text: el('draft-text').value,
      destination: el('destination-diary').checked ? 'diary' : 'threads',
      ghost: el('ghost').checked,
      topic: el('topic').value,
      poll: collectPoll(),
    };
  }

  let saveTimer = 0;
  function scheduleSave() {
    const post = selected();
    if (!post || post.status === 'published') return;
    state.dirty = true;
    updateCharCount();
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      void saveDraft();
    }, 400);
  }

  async function saveDraft() {
    const post = selected();
    if (!post || post.status === 'published' || state.saving) return;
    state.saving = true;
    try {
      const updated = await fetchJson(`${API}/posts/${post.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(collectDraft()),
      });
      replacePost(updated);
      state.dirty = false;
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      state.saving = false;
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

  async function selectPost(id) {
    if (state.dirty) await saveDraft();
    state.selectedId = id;
    const post = state.posts.find((item) => item.id === id);
    state.pollOn = (post?.poll || []).filter(Boolean).length >= 2;
    renderList();
    renderEditor();
    scrollEditorIntoView();
  }

  async function loadPosts() {
    state.posts = await fetchJson(`${API}/posts`);
    sortPosts();
    if (
      state.selectedId &&
      !state.posts.some((post) => post.id === state.selectedId)
    ) {
      state.selectedId = null;
    }
    renderList();
    renderEditor();
  }

  async function newDraft() {
    if (state.dirty) await saveDraft();
    const created = await fetchJson(`${API}/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '', destination: 'threads' }),
    });
    state.posts.unshift(created);
    sortPosts();
    state.selectedId = created.id;
    renderList();
    renderEditor();
    el('draft-text').focus();
    scrollEditorIntoView();
  }

  async function publish() {
    const post = selected();
    if (!post) return;
    await saveDraft();
    if (
      !window.confirm(
        'Отправить этот черновик в Threads и дневник? Отменить нельзя.',
      )
    ) {
      return;
    }
    el('publish').disabled = true;
    setStatus('Публикую…');
    try {
      const updated = await fetchJson(`${API}/posts/${post.id}/publish`, {
        method: 'POST',
      });
      replacePost(updated);
      state.selectedId = updated.id;
      renderEditor();
      setStatus(
        updated.url ? `Опубликовано: ${updated.url}` : 'Сохранено в дневник',
      );
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      el('publish').disabled = false;
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
      for (const post of targets) {
        const updated = await fetchJson(`${API}/posts/${post.id}/insights`, {
          method: 'POST',
        });
        replacePost(updated);
      }
      renderEditor();
      setStatus('Данные обновлены');
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  async function uploadImages(files) {
    const post = selected();
    if (!post || !files.length) return;
    await saveDraft();
    const body = new FormData();
    for (const file of files) body.append('images', file);
    try {
      const updated = await fetchJson(`${API}/posts/${post.id}/images`, {
        method: 'POST',
        body,
      });
      replacePost(updated);
      renderEditor();
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
      renderEditor();
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  function renderTopicPills() {
    const box = el('topic-pills');
    box.replaceChildren();
    for (const topic of SUGGESTED_TOPICS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ghost-btn';
      button.textContent = topic;
      button.addEventListener('click', () => {
        el('topic').value = topic;
        scheduleSave();
      });
      box.append(button);
    }
  }

  el('new-draft').addEventListener('click', () => {
    void newDraft().catch((error) => setStatus(error.message, true));
  });
  el('publish').addEventListener('click', () => {
    void publish();
  });
  el('refresh-insights').addEventListener('click', () => {
    void refreshInsights();
  });
  el('draft-text').addEventListener('input', scheduleSave);
  el('destination-diary').addEventListener('change', scheduleSave);
  el('ghost').addEventListener('change', scheduleSave);
  el('topic').addEventListener('input', scheduleSave);
  el('poll-on').addEventListener('change', () => {
    const post = selected();
    if (!post) return;
    state.pollOn = el('poll-on').checked;
    if (!state.pollOn) post.poll = [];
    else if (!post.poll?.length) post.poll = ['', ''];
    renderPoll(post);
    scheduleSave();
  });
  el('image-input').addEventListener('change', (event) => {
    const files = [...event.target.files];
    event.target.value = '';
    void uploadImages(files);
  });

  renderTopicPills();
  el('publish').disabled = true;
  void loadPosts().catch((error) => setStatus(error.message, true));
})();
