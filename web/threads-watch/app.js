(() => {
  const API = '/threads-watch-api/posts';
  const t = (key) => window.SiteI18n.t(key);
  const el = (id) => document.getElementById(id);
  const metrics = ['likes', 'replies', 'reposts', 'shares'];
  const ui = window.ThreadsUI;
  let posts = [];
  let busy = false;
  const errors = new Map();
  let expandedId = null;
  const polling = new Map();

  function message(value) {
    el('status').textContent = value;
    el('status').hidden = !value;
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
  const date = ui.formatWhen;
  function renderStatRow(post, row) {
    for (const key of metrics) {
      const value = post.stats?.[key];
      if (key === 'reposts' && !(value > 0)) continue;
      const previous = post.statsPrev?.approximate?.includes(key)
        ? undefined
        : post.statsPrev?.[key];
      ui.appendStat(
        row,
        key,
        t(key),
        value,
        previous,
        key === 'shares',
        Boolean(post.stats?.approximate?.includes(key)),
      );
    }
  }
  function render() {
    el('post-list').replaceChildren();
    el('empty').hidden = posts.length > 0;
    el('post-list').closest('table').hidden = !posts.length;
    for (const post of posts) {
      const expanded = post.id === expandedId;
      const row = node('tr', 'post-row');
      row.dataset.id = String(post.id);
      row.tabIndex = 0;
      row.setAttribute('aria-expanded', String(expanded));
      if (expanded) row.setAttribute('aria-selected', 'true');
      const preview = node('td');
      const previewInner = node('div', 'preview-cell');
      const chevron = node('span', 'chevron', '▸');
      chevron.setAttribute('aria-hidden', 'true');
      previewInner.append(chevron, node('span', 'thumb-empty', '—'));
      preview.append(previewInner);
      const author = node('td', 'cell-status', `@${post.topic || ''}`);
      const when = node('td', 'cell-when muted', date(post.createdAt));
      when.title = t('addedDate');
      const content = node('td', 'cell-text');
      content.append(
        node('span', 'cell-author muted', `@${post.topic || ''}`),
        node('span', 'cell-clip', ui.preview(post.text, t('noText'))),
      );
      const linkCell = node('td');
      const link = node('a', '', t('inThreads'));
      link.href = post.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.addEventListener('click', (event) => event.stopPropagation());
      linkCell.append(link);
      const statsCell = node('td', 'cell-stats');
      const statRow = node('div', 'stat-row');
      renderStatRow(post, statRow);
      statsCell.append(statRow);
      if (post.stats?.updated)
        statsCell.append(
          node(
            'div',
            'muted cell-sync',
            `${t('synced')} ${date(post.stats.updated)}`,
          ),
        );
      if (errors.has(post.id))
        statsCell.append(node('p', 'row-error', errors.get(post.id)));
      row.append(preview, author, when, content, linkCell, statsCell);
      row.addEventListener('click', () => {
        void toggleReplies(post.id);
      });
      row.addEventListener('keydown', (event) => {
        if (event.target !== row) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          void toggleReplies(post.id);
        }
      });
      el('post-list').append(row);
      if (expanded) renderThreadPanel(post);
    }
    lock(busy);
  }
  function renderThreadPanel(post) {
    const row = node('tr', 'post-detail');
    const cell = node('td');
    cell.colSpan = ui.detailColumns();
    const panel = node('div', 'thread-panel');
    panel.append(
      node('p', 'eyebrow', `@${post.topic || ''}`),
      node('div', 'published-text', post.text || t('noText')),
    );
    if (post.stats?.dateLabel)
      panel.append(
        node('p', 'muted', `${t('published')}: ${post.stats.dateLabel}`),
      );
    const box = node('section', 'metrics');
    const chips = node('div', 'metric-row');
    for (const key of metrics) {
      const value = post.stats?.[key];
      if (key === 'reposts' && !(value > 0)) continue;
      const approximate = post.stats?.approximate?.includes(key);
      let label =
        typeof value === 'number' ? `${approximate ? '≈' : ''}${value}` : '—';
      const previous = post.statsPrev?.[key];
      if (
        !approximate &&
        !post.statsPrev?.approximate?.includes(key) &&
        typeof value === 'number' &&
        typeof previous === 'number' &&
        value !== previous
      )
        label += ` (${value > previous ? '+' : ''}${value - previous})`;
      chips.append(node('span', 'meta-chip', `${t(key)}: ${label}`));
    }
    box.append(chips);
    if (post.stats?.updated)
      box.append(
        node('p', 'muted', `${t('statsAt')} ${date(post.stats.updated)}`),
      );
    const actions = node('div', 'thread-actions');
    const link = node('a', '', post.url);
    link.href = post.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    const controls = node('div', 'thread-actions-main');
    const removeButton = button('remove', () => remove(post.id));
    removeButton.dataset.loading = String(post.repliesJson?.sync === 'running');
    controls.append(
      button('refresh', () => refreshOne(post.id)),
      removeButton,
    );
    actions.append(link, controls);
    box.append(actions);
    panel.append(box);
    renderReplies(post, panel);
    cell.append(panel);
    row.append(cell);
    el('post-list').append(row);
  }
  function renderReplies(post, panel) {
    const dump = post.repliesJson;
    const replies = dump?.replies || [];
    const section = node('section', 'replies');
    const head = node('div', 'replies-heading');
    const freshIds = new Set(dump?.freshIds || []);
    const count = replies.filter((reply) => freshIds.has(reply.id)).length;
    head.append(
      node(
        'p',
        'field-label',
        `${t('replies')} · ${replies.length}${count ? ` · ${t('newReplies')}: ${count}` : ''}`,
      ),
    );
    const update = button('refreshComments', () => loadReplies(post.id));
    update.dataset.loading = String(dump?.sync === 'running');
    head.append(update);
    section.append(head);
    let status = '';
    if (dump?.sync === 'running')
      status = t('commentsProgress')
        .replace('{count}', replies.length)
        .replace('{checked}', dump.checked || 0)
        .replace('{queued}', dump.queued || 0);
    else if (!dump) status = t('commentsNotLoaded');
    else if (dump.sync !== 'complete') status = t('commentsPartial');
    if (status) section.append(node('p', 'muted', status));
    if (
      dump?.sync !== 'running' &&
      dump?.sync !== 'complete' &&
      typeof post.stats?.replies === 'number'
    )
      section.append(
        node(
          'p',
          'muted',
          t('replyCounter').replace('{count}', post.stats.replies),
        ),
      );
    if (dump?.updated)
      section.append(
        node('div', 'muted cell-sync', `${t('synced')} ${date(dump.updated)}`),
      );
    const normalized = replies.map((reply) => ({
      ...reply,
      permalink: reply.url,
      replied_to: { id: reply.parentId },
    }));
    ui.appendReplies(section, normalized, dump?.rootId || '', freshIds, {
      freshLabel: t('newComment'),
      ownLabel: t('you'),
      likesLabel: t('likes'),
    });
    panel.append(section);
  }
  async function toggleReplies(id) {
    if (busy) return;
    expandedId = expandedId === id ? null : id;
    if (expandedId !== null) el('add-form').hidden = true;
    render();
    if (expandedId === null) return;
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
      const ok = await refresh(id);
      if (ok) await loadReplies(id);
      message(ok ? t('done') : errors.get(id));
    } finally {
      lock(false);
    }
  }
  async function remove(id) {
    if (busy) return;
    if (
      !(await window.AppDialog.confirm(t('confirmRemove'), {
        confirmLabel: t('remove'),
        danger: true,
      }))
    )
      return;
    lock(true);
    try {
      await request(`${API}/${id}`, 'DELETE');
      posts = posts.filter((post) => post.id !== id);
      errors.delete(id);
      if (expandedId === id) expandedId = null;
      render();
      message(t('removed'));
    } catch (error) {
      message(error.message);
    } finally {
      lock(false);
    }
  }
  el('new-watch').addEventListener('click', () => {
    expandedId = null;
    render();
    el('add-form').hidden = false;
    el('post-url').focus();
  });
  el('close-add').addEventListener('click', () => {
    el('add-form').hidden = true;
  });
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
      el('add-form').hidden = true;
      expandedId = added.id;
      render();
      message(t('saved'));
      message(
        (await refresh(added.id))
          ? t('done')
          : `${t('saved')} ${errors.get(added.id)}`,
      );
      await loadReplies(added.id);
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
        else await loadReplies(posts[index].id);
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
