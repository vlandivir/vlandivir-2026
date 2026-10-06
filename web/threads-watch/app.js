(() => {
  const API = '/threads-watch-api/posts';
  const t = (key) => window.SiteI18n.t(key);
  const el = (id) => document.getElementById(id);
  const icons = {
    likes:
      '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/>',
    replies:
      '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    reposts:
      '<path d="m17 1 4 4-4 4M3 11V9a4 4 0 0 1 4-4h14m-14 18-4-4 4-4m14-2v2a4 4 0 0 1-4 4H3"/>',
    shares: '<path d="m22 2-7 20-4-9-9-4Z M22 2 11 13"/>',
  };
  let posts = [];
  let busy = false;
  const errors = new Map();
  const expanded = new Set();
  const polling = new Map();

  function message(value) {
    el('status').textContent = value;
  }
  function lock(value) {
    busy = value;
    document
      .querySelectorAll('.watch-page button, #post-url')
      .forEach((item) => {
        item.disabled = value || item.dataset.loading === 'true';
      });
    el('refresh-all').disabled = value || !posts.length;
  }
  async function request(url, method = 'GET', body) {
    const response = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (
      response.status === 401 ||
      response.status === 403 ||
      response.redirected
    )
      throw new Error(t('auth'));
    if (!response.ok)
      throw new Error(
        t(
          response.status === 400
            ? 'badUrl'
            : response.status === 502
              ? 'unavailable'
              : 'requestError',
        ),
      );
    return response.json();
  }
  function node(tag, className, text) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined) item.textContent = text;
    return item;
  }
  function button(label, action) {
    const item = node('button', 'mini-btn', t(label));
    item.type = 'button';
    item.addEventListener('click', action);
    return item;
  }
  function date(value) {
    return new Date(value).toLocaleString(
      document.documentElement.lang === 'en' ? 'en-GB' : 'ru-RU',
    );
  }
  function render() {
    el('post-list').replaceChildren();
    el('empty').hidden = posts.length > 0;
    el('post-list').closest('table').hidden = !posts.length;
    for (const post of posts) {
      const row = node('tr');
      const author = node('td', '', `@${post.topic || ''}`);
      if (post.stats?.dateLabel)
        author.append(node('span', 'post-date muted', post.stats.dateLabel));
      const content = node('td');
      content.append(node('p', 'post-text', post.text || t('noText')));
      const link = node('a', '', t('open'));
      link.href = post.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      content.append(link);
      const metrics = node('td');
      const statRow = node('div', 'stat-row');
      for (const key of Object.keys(icons)) {
        const current = post.stats?.[key];
        if (key === 'reposts' && !(current > 0)) continue;
        const item = node('span', 'stat-item');
        const approx = post.stats?.approximate?.includes(key);
        const value =
          typeof current === 'number'
            ? `${approx ? '≈' : ''}${current.toLocaleString(document.documentElement.lang)}`
            : '—';
        item.title = `${t(key)}: ${value}`;
        item.setAttribute('aria-label', item.title);
        const icon = node('span', 'stat-icon');
        icon.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[key]}</svg>`;
        item.append(icon, node('span', '', value));
        const previous = post.statsPrev?.[key];
        // Differences between rounded counters can be misleading.
        if (
          typeof current === 'number' &&
          typeof previous === 'number' &&
          current !== previous &&
          !approx &&
          !post.statsPrev?.approximate?.includes(key)
        ) {
          item.append(
            node(
              'span',
              'muted',
              `${current > previous ? '+' : ''}${current - previous}`,
            ),
          );
        }
        statRow.append(item);
      }
      metrics.append(statRow);
      const sync = node(
        'td',
        'sync-date muted',
        post.stats?.updated ? date(post.stats.updated) : t('never'),
      );
      if (errors.has(post.id))
        sync.append(node('p', 'row-error', errors.get(post.id)));
      const actions = node('td');
      const controls = node('div', 'row-actions');
      controls.append(
        button('comments', () => toggleReplies(post.id)),
        button('refresh', () => refreshOne(post.id)),
        button('remove', () => remove(post.id)),
      );
      actions.append(controls);
      row.append(author, content, metrics, sync, actions);
      el('post-list').append(row);
      if (expanded.has(post.id)) renderReplies(post);
    }
    lock(busy);
  }

  function renderReplies(post) {
    const dump = post.repliesJson;
    const row = node('tr', 'comments-row');
    const cell = node('td');
    cell.colSpan = 5;
    const section = node('section', 'comments-section');
    const head = node('div', 'comments-head');
    head.append(
      node('h2', '', `${t('comments')} · ${dump?.replies?.length || 0}`),
    );
    const update = button('refreshComments', () => loadReplies(post.id));
    update.dataset.loading = String(dump?.sync === 'running');
    head.append(update);
    section.append(head);
    const status = node('p', 'muted');
    if (dump?.sync === 'running')
      status.textContent = t('commentsProgress')
        .replace('{count}', dump.replies?.length || 0)
        .replace('{checked}', dump.checked || 0)
        .replace('{queued}', dump.queued || 0);
    else if (dump)
      status.textContent = t(
        dump.sync === 'complete' ? 'commentsComplete' : 'commentsPartial',
      );
    else status.textContent = t('commentsNotLoaded');
    if (dump?.updated) status.textContent += ` ${date(dump.updated)}`;
    section.append(status);
    if (typeof post.stats?.replies === 'number')
      section.append(
        node(
          'p',
          'muted',
          t('replyCounter').replace('{count}', post.stats.replies),
        ),
      );
    const replies = dump?.replies || [];
    const ids = new Set(replies.map((reply) => reply.id));
    const freshIds = new Set(dump?.freshIds || []);
    const children = new Map();
    for (const reply of replies) {
      const parent = ids.has(reply.parentId) ? reply.parentId : dump.rootId;
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent).push(reply);
    }
    for (const list of children.values())
      list.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));
    const stack = (children.get(dump?.rootId) || [])
      .slice()
      .reverse()
      .map((reply) => ({ reply, depth: 0 }));
    const seen = new Set();
    while (stack.length) {
      const { reply, depth } = stack.pop();
      if (seen.has(reply.id)) continue;
      seen.add(reply.id);
      const article = node(
        'article',
        `comment${freshIds.has(reply.id) ? ' comment-fresh' : ''}`,
      );
      article.style.setProperty('--comment-depth', Math.min(depth, 4));
      const meta = node('div', 'comment-meta');
      const link = node('a', '', `@${reply.username}`);
      link.href = reply.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      meta.append(link);
      if (reply.timestamp)
        meta.append(node('span', 'muted', date(reply.timestamp)));
      if (freshIds.has(reply.id))
        meta.append(node('span', 'badge', t('newComment')));
      if (depth)
        meta.append(
          node('span', 'muted', t('replyDepth').replace('{depth}', depth + 1)),
        );
      article.append(
        meta,
        node('p', 'comment-text', reply.text || t('mediaReply')),
      );
      if (typeof reply.likes === 'number')
        article.append(node('span', 'muted', `${t('likes')}: ${reply.likes}`));
      section.append(article);
      for (const child of (children.get(reply.id) || []).slice().reverse())
        stack.push({ reply: child, depth: depth + 1 });
    }
    cell.append(section);
    row.append(cell);
    el('post-list').append(row);
  }
  async function toggleReplies(id) {
    if (expanded.has(id)) {
      expanded.delete(id);
      render();
      return;
    }
    expanded.add(id);
    render();
    const post = posts.find((item) => item.id === id);
    if (!post.repliesJson) await loadReplies(id);
    else if (post.repliesJson.sync === 'running') pollReplies(id);
  }
  async function loadReplies(id) {
    const post = posts.find((item) => item.id === id);
    if (!post || post.repliesJson?.sync === 'running') return;
    post.repliesJson = {
      ...(post.repliesJson || { replies: [] }),
      sync: 'running',
    };
    render();
    try {
      post.repliesJson = await request(`${API}/${id}/replies`, 'POST');
      render();
      pollReplies(id);
    } catch (error) {
      post.repliesJson.sync = 'failed';
      message(error.message);
      render();
    }
  }
  function pollReplies(id) {
    if (polling.has(id)) return;
    polling.set(
      id,
      setTimeout(async () => {
        polling.delete(id);
        const post = posts.find((item) => item.id === id);
        if (!post) return;
        try {
          post.repliesJson = await request(`${API}/${id}/replies`);
          render();
          if (post.repliesJson?.sync === 'running') pollReplies(id);
        } catch (error) {
          message(error.message);
        }
      }, 3000),
    );
  }
  async function refresh(id) {
    try {
      const updated = await request(`${API}/${id}/refresh`, 'POST');
      posts = posts.map((post) => (post.id === id ? updated : post));
      errors.delete(id);
      return true;
    } catch (error) {
      errors.set(id, error.message);
      return false;
    } finally {
      render();
    }
  }
  async function refreshOne(id) {
    if (busy) return;
    lock(true);
    message(t('updating'));
    try {
      message((await refresh(id)) ? t('done') : errors.get(id));
    } finally {
      lock(false);
    }
  }
  async function remove(id) {
    if (busy || !window.confirm(t('confirmRemove'))) return;
    lock(true);
    try {
      await request(`${API}/${id}`, 'DELETE');
      posts = posts.filter((post) => post.id !== id);
      errors.delete(id);
      render();
      message(t('removed'));
    } catch (error) {
      message(error.message);
    } finally {
      lock(false);
    }
  }
  el('add-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    lock(true);
    message(t('loading'));
    try {
      const added = await request(API, 'POST', {
        url: el('post-url').value.trim(),
      });
      if (!posts.some((post) => post.id === added.id)) posts.unshift(added);
      el('post-url').value = '';
      render();
      message(t('saved'));
      message(
        (await refresh(added.id))
          ? t('done')
          : `${t('saved')} ${errors.get(added.id)}`,
      );
    } catch (error) {
      message(error.message);
    } finally {
      lock(false);
    }
  });
  el('refresh-all').addEventListener('click', async () => {
    if (busy) return;
    lock(true);
    let failed = false;
    try {
      for (let index = 0; index < posts.length; index += 1) {
        message(
          t('progress')
            .replace('{current}', index + 1)
            .replace('{total}', posts.length),
        );
        if (!(await refresh(posts[index].id))) failed = true;
      }
      message(t(failed ? 'partial' : 'done'));
    } finally {
      lock(false);
    }
  });
  (async () => {
    lock(true);
    message(t('loading'));
    try {
      posts = await request(API);
      render();
      message('');
    } catch (error) {
      message(`${t('loadError')} ${error.message}`);
    } finally {
      lock(false);
    }
  })();
})();
