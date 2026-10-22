(() => {
  const API = '/threads-news-api';
  const t = (key) => window.SiteI18n.t(key);
  const el = (id) => document.getElementById(id);
  const state = {
    sources: [],
    postCount: 0,
    posts: [],
    page: 1,
    total: 0,
    hasMore: false,
  };
  let busy = false;
  let poll;
  let feedVersion = 0;
  const candidates = [
    ['ethan_mollick', 'topicAI'],
    ['gergelyorosz_', 'topicDev'],
    ['olja_srbija', 'topicSerbia'],
    ['nomadicmatt', 'topicTravel'],
  ];
  function node(tag, className, text) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined) item.textContent = text;
    return item;
  }
  function link(text, url) {
    const item = node('a', '', text);
    item.href = url;
    item.target = '_blank';
    item.rel = 'noopener noreferrer';
    return item;
  }
  function button(label, action) {
    const item = node('button', 'mini-btn', t(label));
    item.type = 'button';
    item.addEventListener('click', action);
    return item;
  }
  function message(text, auth = false) {
    const item = el('status');
    item.replaceChildren(document.createTextNode(text));
    item.hidden = !text;
    if (auth) {
      const login = node('a', 'tool-link', t('login'));
      login.href = `/auth/google?redirect=${encodeURIComponent(location.pathname)}`;
      item.append(document.createTextNode(' '), login);
    }
  }
  function lock(value) {
    busy = value;
    document
      .querySelectorAll(
        '.news-page button, .news-page input, .news-page select',
      )
      .forEach((item) => {
        item.disabled = value || item.dataset.unavailable === 'true';
      });
  }
  function errorText(code) {
    if (/^HTTP_\d+$/.test(code))
      return code === 'HTTP_429'
        ? t(code)
        : t('upstreamError').replace('{code}', code.slice(5));
    return window.PAGE_I18N[
      document.documentElement.lang === 'en' ? 'en' : 'ru'
    ][code]
      ? t(code)
      : t('error');
  }
  function failed(error) {
    message(error.message, error.auth);
  }
  async function request(path, method = 'GET', body) {
    const response = await fetch(API + path, {
      method,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if ([401, 403].includes(response.status) || response.redirected) {
      const error = new Error(t('auth'));
      error.auth = true;
      throw error;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code = typeof data.message === 'string' ? data.message : 'error';
      const error = new Error(errorText(code));
      error.code = code;
      throw error;
    }
    return data;
  }
  function date(value) {
    if (!value) return t('never');
    return new Date(value).toLocaleString(
      document.documentElement.lang === 'en' ? 'en-GB' : 'ru-RU',
      { dateStyle: 'short', timeStyle: 'short' },
    );
  }
  function topics(input) {
    return input
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  function renderSources() {
    el('source-count').textContent = state.sources.length;
    el('post-count').textContent = state.postCount;
    el('error-count').textContent = state.sources.filter((source) =>
      ['failed', 'partial'].includes(source.syncStatus),
    ).length;
    el('sources-empty').hidden = Boolean(state.sources.length);
    el('source-list').replaceChildren();
    for (const source of state.sources) {
      const box = node('article', 'source');
      const head = node('div', 'source-heading');
      head.append(
        link(
          `@${source.username}`,
          `https://www.threads.com/@${source.username}`,
        ),
        node('span', 'badge', t(source.enabled ? source.syncStatus : 'paused')),
      );
      box.append(head);
      if (source.displayName)
        box.append(node('p', 'source-meta', source.displayName));
      if (source.topics.length)
        box.append(node('p', 'muted source-meta', source.topics.join(' · ')));
      box.append(
        node(
          'p',
          'muted source-meta',
          `${t('savedCount')}: ${source._count.posts} · ${t('newCount')}: ${source.lastNewCount}`,
        ),
      );
      box.append(
        node(
          'p',
          'muted source-meta',
          `${t('updated')}: ${date(source.lastSuccessAt)}`,
        ),
      );
      if (source.lastAttemptAt)
        box.append(
          node(
            'p',
            'muted source-meta',
            `${t('attempted')}: ${date(source.lastAttemptAt)}`,
          ),
        );
      if (source.coverageLimited)
        box.append(node('p', 'muted source-meta', t('limitedSnapshot')));
      if (source.lastError)
        box.append(
          node('p', 'source-meta', `⚠ ${errorText(source.lastError)}`),
        );
      if (source.syncStatus === 'ok' && !source._count.posts)
        box.append(node('p', 'muted', t('emptyProfile')));
      const actions = node('div', 'source-actions');
      const refresh = button('refresh', () =>
        run(async () => {
          message(t('refreshing').replace('{username}', source.username));
          await request(`/sources/${source.id}/refresh`, 'POST');
          await load();
          message(t('done'));
        }),
      );
      refresh.dataset.unavailable = String(
        !source.enabled || source.syncStatus === 'running',
      );
      actions.append(
        refresh,
        button(source.enabled ? 'pause' : 'resume', () =>
          run(async () => {
            await request(`/sources/${source.id}`, 'PATCH', {
              enabled: !source.enabled,
            });
            await load();
            message('');
          }),
        ),
      );
      actions.append(
        button('remove', () => {
          if (
            !window.confirm(
              t('removeConfirm').replace('{username}', source.username),
            )
          )
            return;
          void run(async () => {
            await request(`/sources/${source.id}`, 'DELETE');
            await load();
            message(t('removed'));
          });
        }),
      );
      box.append(actions);
      const settings = node('details', 'source-settings');
      settings.append(node('summary', '', t('editTopics')));
      const form = node('form');
      const input = node('input');
      input.value = source.topics.join(', ');
      input.maxLength = 327;
      const inputId = `source-topics-${source.id}`;
      input.id = inputId;
      const label = node('label', '', t('topicsLabel'));
      label.htmlFor = inputId;
      const save = node('button', 'mini-btn', t('save'));
      save.type = 'submit';
      form.append(label, input, save);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        void run(async () => {
          await request(`/sources/${source.id}`, 'PATCH', {
            topics: topics(input.value),
          });
          await load();
          message('');
        });
      });
      settings.append(form);
      box.append(settings);
      el('source-list').append(box);
    }
    const selected = el('source-filter').value;
    el('source-filter').replaceChildren(new Option(t('allSources'), ''));
    for (const source of state.sources)
      el('source-filter').append(new Option(`@${source.username}`, source.id));
    el('source-filter').value = selected;
    el('refresh-all').dataset.unavailable = String(
      !state.sources.some(
        (source) => source.enabled && source.syncStatus !== 'running',
      ),
    );
    renderCandidates();
    lock(busy);
  }
  function renderCandidates() {
    el('recommendations').replaceChildren();
    for (const [username, topic] of candidates) {
      const exists = state.sources.some(
        (source) => source.username === username,
      );
      const row = node('div', 'recommendation');
      const text = node('span');
      text.append(link(`@${username}`, `https://www.threads.com/@${username}`));
      row.append(text);
      const add = button(exists ? 'addedShort' : 'addShort', () =>
        addSource(username, [t(topic)]),
      );
      add.dataset.unavailable = String(exists);
      row.append(add);
      el('recommendations').append(row);
    }
  }
  function renderPosts() {
    el('post-list').replaceChildren();
    el('feed-count').textContent = state.total;
    el('feed-empty').hidden = Boolean(state.posts.length);
    for (const post of state.posts) {
      const article = node('article', 'post');
      const heading = node('div', 'post-heading');
      heading.append(
        link(
          `@${post.source.username}`,
          `https://www.threads.com/@${post.source.username}`,
        ),
      );
      const when = node('time', 'muted', date(post.publishedAt));
      when.dateTime = post.publishedAt;
      heading.append(when);
      article.append(heading, node('p', 'post-text', post.text || t('noText')));
      if (post.text && post.translationRu)
        article.append(
          node(
            'p',
            'post-text translation',
            `${t('translationLabel')}: ${post.translationRu}`,
          ),
        );
      else if (post.text && !post.translationCheckedAt) {
        const translation = node('p', 'muted translation', t('translating'));
        translation.dataset.postId = post.id;
        article.append(translation);
      }
      article.append(link(t('inThreads'), post.url));
      if (post.likes !== null)
        article.append(node('p', 'muted', `${t('likes')}: ${post.likes}`));
      const chips = node('div', 'post-topics');
      post.source.topics.forEach((topic) =>
        chips.append(node('span', 'meta-chip', topic)),
      );
      article.append(chips);
      el('post-list').append(article);
    }
    el('load-more').hidden = !state.hasMore;
    void translateVisible(feedVersion);
  }
  async function translateVisible(version) {
    for (const post of state.posts) {
      if (version !== feedVersion) return;
      if (!post.text || post.translationCheckedAt) continue;
      const target = el('post-list').querySelector(
        `.translation[data-post-id="${post.id}"]`,
      );
      if (!target) continue;
      try {
        const result = await request(`/posts/${post.id}/translate`, 'POST');
        post.translationCheckedAt = new Date().toISOString();
        post.translationRu = result.translationRu;
        if (version !== feedVersion) return;
        if (result.translationRu) {
          target.textContent = `${t('translationLabel')}: ${result.translationRu}`;
          target.classList.remove('muted');
          target.classList.add('post-text');
        } else target.remove();
      } catch (error) {
        if (version !== feedVersion) return;
        target.textContent = error.message;
        // A missing API key or exhausted quota affects all remaining posts.
        if (/^TRANSLATION_(UNAVAILABLE|LIMIT)$/.test(error.code || '')) {
          el('post-list')
            .querySelectorAll('.translation')
            .forEach((item) => {
              if (item.textContent === t('translating'))
                item.textContent = error.message;
            });
          return;
        }
      }
    }
  }
  async function loadPosts(append = false) {
    const version = ++feedVersion;
    const page = append ? state.page + 1 : 1;
    const filter = el('source-filter').value;
    const data = await request(
      `/posts?page=${page}${filter ? `&sourceId=${encodeURIComponent(filter)}` : ''}`,
    );
    if (version !== feedVersion) return;
    state.posts = append
      ? [
          ...new Map(
            [...state.posts, ...data.items].map((post) => [post.id, post]),
          ).values(),
        ]
      : data.items;
    state.page = data.page;
    state.total = data.total;
    state.hasMore = data.hasMore;
    renderPosts();
  }
  async function load() {
    const dashboard = await request('/dashboard');
    state.sources = dashboard.sources;
    state.postCount = dashboard.postCount;
    renderSources();
    await loadPosts();
    schedulePoll();
  }
  function schedulePoll() {
    clearTimeout(poll);
    if (state.sources.some((source) => source.syncStatus === 'running'))
      poll = setTimeout(() => {
        if (busy) schedulePoll();
        else void run(load);
      }, 5000);
  }
  async function run(action) {
    if (busy) return;
    lock(true);
    try {
      await action();
    } catch (error) {
      failed(error);
    } finally {
      lock(false);
    }
  }
  async function addSource(profile, sourceTopics) {
    return run(async () => {
      message(t('adding'));
      const source = await request('/sources', 'POST', {
        profile,
        topics: sourceTopics,
      });
      const existed = state.sources.some((item) => item.id === source.id);
      await load();
      el('profile').value = '';
      el('topics').value = '';
      message(t(existed ? 'exists' : 'added'));
    });
  }
  el('add-source').addEventListener('submit', (event) => {
    event.preventDefault();
    void addSource(el('profile').value, topics(el('topics').value));
  });
  el('source-filter').addEventListener('change', () => run(() => loadPosts()));
  el('load-more').addEventListener('click', () => run(() => loadPosts(true)));
  el('refresh-all').addEventListener('click', () =>
    run(async () => {
      // Sequential refreshes avoid bursts of requests to Threads.
      for (const source of state.sources.filter(
        (item) => item.enabled && item.syncStatus !== 'running',
      )) {
        message(t('refreshing').replace('{username}', source.username));
        try {
          await request(`/sources/${source.id}/refresh`, 'POST');
        } catch (error) {
          if (error.auth) throw error;
          message(error.message);
        }
      }
      await load();
      message(t('done'));
    }),
  );
  void run(async () => {
    message(t('loading'));
    await load();
    message('');
  });
})();
