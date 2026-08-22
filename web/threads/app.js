(() => {
  const API = '/threads-api';
  const LIMIT = 500;
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
    const compact = (text || '').replace(/\s+/g, ' ').trim();
    return compact.slice(0, 140) || 'Пустой черновик';
  }

  function selected() {
    return state.posts.find((post) => post.id === state.selectedId) || null;
  }

  function renderList() {
    const list = el('post-list');
    const empty = el('list-empty');
    const drafts = state.posts.filter((post) => post.status === 'draft');
    const published = state.posts.filter((post) => post.status === 'published');
    list.replaceChildren();
    empty.hidden = state.posts.length > 0;

    function addGroup(title, items) {
      if (!items.length) return;
      const heading = document.createElement('li');
      heading.className = 'muted';
      heading.style.padding = '8px 12px';
      heading.textContent = title;
      list.append(heading);
      for (const post of items) {
        const item = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'post-item';
        if (post.id === state.selectedId) {
          button.setAttribute('aria-current', 'true');
        }
        const previewEl = document.createElement('span');
        previewEl.className = 'preview';
        previewEl.textContent = preview(post.text);
        const meta = document.createElement('span');
        meta.className = 'meta muted';
        const bits = [post.status === 'published' ? 'опубликован' : 'черновик'];
        if (post.stats?.views != null) bits.push(`${post.stats.views} просм.`);
        meta.textContent = bits.join(' · ');
        button.append(previewEl, meta);
        button.addEventListener('click', () => selectPost(post.id));
        item.append(button);
        list.append(item);
      }
    }

    addGroup('Черновики', drafts);
    addGroup('Опубликованные', published);
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

  function renderImages(post) {
    const list = el('image-list');
    list.replaceChildren();
    for (const image of post.images || []) {
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

  function delta(current, previous) {
    if (typeof current !== 'number') return '—';
    if (typeof previous !== 'number' || current === previous) {
      return String(current);
    }
    const sign = current > previous ? '+' : '';
    return `${current} (${sign}${current - previous})`;
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
      ['Просмотры', delta(stats.views, prev.views)],
      ['Лайки', delta(stats.likes, prev.likes)],
      ['Ответы', delta(stats.replies, prev.replies)],
      ['Репосты', delta(stats.reposts, prev.reposts)],
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
    const title = document.createElement('h2');
    title.textContent = `Ответы · ${dump.counts?.total ?? replies.length}`;
    box.replaceChildren(title);
    for (const reply of replies) {
      const item = document.createElement('article');
      item.className = 'reply';
      const who = document.createElement('p');
      who.className = 'muted';
      who.textContent = `@${reply.username || 'unknown'}`;
      const text = document.createElement('p');
      text.textContent = reply.text || '';
      item.append(who, text);
      box.append(item);
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
    el('draft-text').value = post.text || '';
    el('draft-text').disabled = post.status === 'published';
    el('destination-diary').checked = post.destination === 'diary';
    el('ghost').checked = Boolean(post.ghost);
    el('topic').value = post.topic || '';
    const locked = post.status === 'published';
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
    renderImages(post);
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
    renderList();
  }

  async function selectPost(id) {
    if (state.dirty) await saveDraft();
    state.selectedId = id;
    const post = state.posts.find((item) => item.id === id);
    state.pollOn = (post?.poll || []).filter(Boolean).length >= 2;
    renderList();
    renderEditor();
  }

  async function loadPosts() {
    state.posts = await fetchJson(`${API}/posts`);
    if (
      state.selectedId &&
      !state.posts.some((post) => post.id === state.selectedId)
    ) {
      state.selectedId = null;
    }
    if (!state.selectedId) {
      const draft = state.posts.find((post) => post.status === 'draft');
      state.selectedId = draft?.id || state.posts[0]?.id || null;
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
    state.selectedId = created.id;
    renderList();
    renderEditor();
    el('draft-text').focus();
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
        updated.url
          ? `Опубликовано: ${updated.url}`
          : 'Сохранено в дневник',
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
  void loadPosts().catch((error) => setStatus(error.message, true));
})();
