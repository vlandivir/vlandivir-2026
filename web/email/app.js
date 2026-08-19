(() => {
  const API_BASE = '/email-api';

  const state = {
    messages: [],
    stats: [],
    labels: [],
    selectedId: null,
    detail: null, // full message currently open in the accordion preview
    filters: { query: '', account: '', flag: '' },
    // Important sits in its own block (not a filter); remember collapse.
    importantCollapsed: false,
    // Thread keys (`account:threadId`) the user has expanded to see older mail.
    expandedThreads: new Set(),
  };

  const el = (id) => document.getElementById(id);
  const messageList = el('message-list');

  // Compact action toolbar buttons: icon, tooltip, and how to resolve the
  // action from the message's current state (toggles where it makes sense).
  const ACTIONS = [
    {
      key: 'read',
      icon: '✓',
      title: (m) => (m.seen ? 'Пометить непрочитанным' : 'Пометить прочитанным'),
      active: (m) => m.seen,
      action: (m) => (m.seen ? 'mark_unread' : 'mark_read'),
    },
    {
      key: 'important',
      icon: '⭐',
      title: (m) => (m.important ? 'Убрать из «Важное»' : 'В «Важное»'),
      active: (m) => m.important,
      action: (m) => (m.important ? 'unmark_important' : 'mark_important'),
    },
    {
      key: 'archive',
      icon: '📥',
      title: (m) => (m.archived ? 'Вернуть во «Входящие»' : 'В архив'),
      active: (m) => m.archived,
      action: (m) => (m.archived ? 'unarchive' : 'archive'),
    },
    {
      key: 'hide',
      icon: '🙈',
      title: (m) => (m.hidden ? 'Показывать' : 'Скрыть из вида'),
      active: (m) => m.hidden,
      action: (m) => (m.hidden ? 'unhide' : 'hide'),
    },
    {
      key: 'label',
      icon: '🏷',
      title: () => 'Ярлык',
      active: (m) => m.labels.some((l) => l.startsWith('agent/')),
      action: () => null, // opens the label picker instead
    },
  ];

  const dateFormat = new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  function formatDate(value) {
    if (!value) return '—';
    return dateFormat.format(new Date(value));
  }

  // Per-account accent: pick from a fixed, well-spaced palette by the account's
  // alphabetical index (a hash of the name gave near-identical hues for some
  // accounts). Hues are far apart so up to 7 mailboxes stay distinguishable.
  // The color is data, not theme — set inline from here, not in CSS.
  const ACCOUNT_HUES = [145, 212, 32, 275, 175, 330, 95];

  function hueFor(name) {
    const names = state.stats.map((account) => account.account).sort();
    const index = names.indexOf(name);
    // Fall back to a stable per-name hue if stats haven't loaded yet
    if (index === -1) {
      let hash = 0;
      for (const char of name) hash = (hash * 31 + char.codePointAt(0)) % 997;
      return (hash * 137) % 360;
    }
    return ACCOUNT_HUES[index % ACCOUNT_HUES.length];
  }

  function accountColor(name, alpha) {
    return `hsl(${hueFor(name)} 62% 48% / ${alpha})`;
  }

  function formatSize(bytes) {
    if (bytes == null) return '';
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
    return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
  }

  async function fetchJson(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.json();
  }

  // --- Stats ---

  async function loadStats() {
    const data = await fetchJson(`${API_BASE}/stats`);
    state.stats = data.accounts;
    renderStats();
    renderAccountFilter();
    // Palette depends on the account list; refresh list colors once known
    if (state.messages.length) renderList();
  }

  function renderStats() {
    const row = el('stats-row');
    row.classList.toggle('hidden', state.stats.length === 0);
    row.replaceChildren(
      ...state.stats.map((account) => {
        const card = document.createElement('div');
        card.className = 'stat-card';
        card.style.borderLeftColor = accountColor(account.account, 0.85);
        card.style.background = accountColor(account.account, 0.07);

        const name = document.createElement('div');
        name.className = 'stat-account';
        const dot = document.createElement('span');
        dot.className = 'account-dot';
        dot.style.background = accountColor(account.account, 1);
        name.append(dot, document.createTextNode(account.account));

        const line = document.createElement('div');
        line.className = 'stat-line';
        const chips = [
          `всего: ${account.total}`,
          `непрочитанных: ${account.unseen}`,
          ...Object.entries(account.statuses).map(
            ([status, count]) => `${status}: ${count}`,
          ),
        ];
        line.replaceChildren(
          ...chips.map((text) => {
            const chip = document.createElement('span');
            chip.className = 'meta-chip';
            chip.textContent = text;
            return chip;
          }),
        );

        const sync = document.createElement('div');
        sync.className = 'stat-sync muted';
        sync.textContent = `синхронизация: ${formatDate(account.syncedAt)} · UID ${account.lastUid}`;

        card.append(name, line, sync);
        return card;
      }),
    );
  }

  function renderAccountFilter() {
    const select = el('filter-account');
    const current = select.value;
    select.replaceChildren(new Option('Все аккаунты', ''));
    for (const account of state.stats) {
      select.append(new Option(account.account, account.account));
    }
    select.value = current;
  }

  // --- Message list ---

  async function loadMessages() {
    const data = await fetchJson(`${API_BASE}/messages`);
    state.messages = data.messages;
    renderList();
  }

  function matchesQuery(message, query) {
    if (!query) return true;
    return [message.subject, message.fromAddress, message.fromName]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(query));
  }

  function matchesAccount(message) {
    return !state.filters.account || message.account === state.filters.account;
  }

  // Inbox / flag views — important lives in its own block, so it stays out of
  // the main list (same as hidden/archived) unless we're browsing those flags.
  function visibleMessages() {
    const query = state.filters.query.trim().toLowerCase();
    const flag = state.filters.flag;
    return state.messages.filter((message) => {
      if (!matchesAccount(message)) return false;
      if (flag === 'hidden') {
        if (!message.hidden) return false;
      } else if (flag === 'archived') {
        if (!message.archived) return false;
      } else {
        if (message.hidden || message.archived || message.important) {
          return false;
        }
        if (flag === 'unseen' && message.seen) return false;
        if (flag === 'attachments' && !message.hasAttachments) return false;
      }
      return matchesQuery(message, query);
    });
  }

  // Starred mail for the dedicated collapsible section above the inbox.
  function importantMessages() {
    const query = state.filters.query.trim().toLowerCase();
    return state.messages.filter(
      (message) =>
        message.important &&
        !message.hidden &&
        matchesAccount(message) &&
        matchesQuery(message, query),
    );
  }

  // Group visible messages into threads (same account + threadId). Groups are
  // ordered by the newest message; messages inside a group newest-first.
  function threadGroups(messages) {
    const groups = new Map();
    for (const message of messages) {
      const key = `${message.account}:${message.threadId}`;
      let group = groups.get(key);
      if (!group) {
        group = [];
        groups.set(key, group);
      }
      group.push(message);
    }
    const sorted = [...groups.values()].map((group) =>
      group.slice().sort((a, b) => {
        const da = a.date ? new Date(a.date).getTime() : 0;
        const db = b.date ? new Date(b.date).getTime() : 0;
        return db - da || b.id - a.id;
      }),
    );
    sorted.sort((a, b) => {
      const da = a[0].date ? new Date(a[0].date).getTime() : 0;
      const db = b[0].date ? new Date(b[0].date).getTime() : 0;
      return db - da || b[0].id - a[0].id;
    });
    return sorted;
  }

  // --- Actions ---

  function patchLocal(id, patch) {
    const message = state.messages.find((m) => m.id === id);
    if (message) Object.assign(message, patch);
    if (state.detail && state.detail.id === id) {
      Object.assign(state.detail, patch);
    }
    renderList();
    if (state.detail && state.detail.id === id) renderDetail();
  }

  async function applyAction(id, action, param, optimistic) {
    const current = state.messages.find((m) => m.id === id);
    const snapshot = current ? { ...current } : null;
    if (optimistic) patchLocal(id, optimistic);
    try {
      const res = await fetchJson(`${API_BASE}/messages/${id}/action`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, param }),
      });
      patchLocal(id, {
        seen: res.seen,
        archived: res.archived,
        hidden: res.hidden,
        important: res.important,
        labels: res.labels,
      });
    } catch (error) {
      if (snapshot) patchLocal(id, snapshot);
      console.error(error);
      alert('Не удалось применить действие');
    }
  }

  // Optimistic patch for the boolean toggles (label waits for the server)
  function optimisticPatch(message, action) {
    switch (action) {
      case 'mark_read':
        return { seen: true };
      case 'mark_unread':
        return { seen: false };
      case 'archive':
        // Archiving also marks read (mirrors the executor)
        return { archived: true, seen: true };
      case 'unarchive':
        return { archived: false };
      case 'hide':
        return { hidden: true };
      case 'unhide':
        return { hidden: false };
      case 'mark_important':
        return { important: true };
      case 'unmark_important':
        return { important: false };
      default:
        return null;
    }
  }

  function actionButton(message, def, extraClass) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `icon-btn action-btn${extraClass ? ` ${extraClass}` : ''}`;
    button.classList.toggle('active', def.active(message));
    button.textContent = def.icon;
    button.title = def.title(message);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      if (def.key === 'label') {
        openLabelPicker(button, message);
        return;
      }
      const action = def.action(message);
      applyAction(message.id, action, undefined, optimisticPatch(message, action));
    });
    return button;
  }

  function renderMessageRow(message) {
    const item = document.createElement('li');
    item.className = 'message-row';
    item.dataset.messageId = String(message.id);
    const selected = message.id === state.selectedId;
    item.classList.toggle('selected', selected);
    item.style.borderLeftColor = accountColor(message.account, 1);

    const main = document.createElement('div');
    main.className = 'message-row-main';
    main.tabIndex = 0;
    main.setAttribute('role', 'button');
    main.setAttribute('aria-expanded', selected ? 'true' : 'false');

    const chevron = document.createElement('span');
    chevron.className = 'message-chevron';
    chevron.textContent = selected ? '▾' : '▸';
    chevron.setAttribute('aria-hidden', 'true');

    const subject = document.createElement('span');
    subject.className = 'message-subject';
    subject.classList.toggle('unseen', !message.seen);
    subject.textContent = message.subject || '(без темы)';

    const sender = document.createElement('span');
    sender.className = 'message-sender';
    sender.textContent =
      (message.fromName || message.fromAddress || '—') +
      (message.hasAttachments ? ' 📎' : '');

    const account = document.createElement('span');
    account.className = 'account-pill';
    account.style.color = accountColor(message.account, 1);
    account.style.background = accountColor(message.account, 0.12);
    const dot = document.createElement('span');
    dot.className = 'account-dot';
    dot.style.background = accountColor(message.account, 1);
    account.append(dot, document.createTextNode(message.account));

    const date = document.createElement('span');
    date.className = 'message-date';
    date.textContent = formatDate(message.date);

    const rowActions = document.createElement('span');
    rowActions.className = 'row-actions';
    for (const def of ACTIONS) {
      rowActions.append(actionButton(message, def, 'row-action'));
    }

    main.append(chevron, subject, sender, account, date, rowActions);
    main.addEventListener('click', () => selectMessage(message.id));
    main.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectMessage(message.id);
      }
    });

    item.append(main);
    return item;
  }

  function threadKey(message) {
    return `${message.account}:${message.threadId}`;
  }

  function isThreadExpanded(group) {
    return state.expandedThreads.has(threadKey(group[0]));
  }

  function renderThreadGroup(group) {
    if (group.length === 1) {
      return renderMessageRow(group[0]);
    }

    const key = threadKey(group[0]);
    const expanded = isThreadExpanded(group);
    const wrap = document.createElement('li');
    wrap.className = 'thread-group';
    wrap.classList.toggle('collapsed', !expanded);
    wrap.style.borderLeftColor = accountColor(group[0].account, 1);

    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'thread-group-head';
    head.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    const title = document.createElement('span');
    title.className = 'thread-group-title';
    title.textContent = group[0].subject || '(без темы)';
    const count = document.createElement('span');
    count.className = 'meta-chip thread-count';
    count.textContent = expanded
      ? `▾ ${group.length} писем`
      : `▸ ${group.length} писем`;
    head.append(title, count);
    head.addEventListener('click', (event) => {
      event.stopPropagation();
      if (expanded) state.expandedThreads.delete(key);
      else state.expandedThreads.add(key);
      renderList();
    });

    const nested = document.createElement('ul');
    nested.className = 'thread-messages';
    // Collapsed: still show the newest message so the thread is readable.
    const shown = expanded ? group : group.slice(0, 1);
    nested.replaceChildren(...shown.map((message) => renderMessageRow(message)));

    if (!expanded && group.length > 1) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'thread-more';
      more.textContent = `Показать ещё ${group.length - 1}`;
      more.addEventListener('click', (event) => {
        event.stopPropagation();
        state.expandedThreads.add(key);
        renderList();
      });
      nested.append(more);
    }

    wrap.append(head, nested);
    return wrap;
  }

  function renderListSection(groups) {
    return groups.map((group) => renderThreadGroup(group));
  }

  function renderList() {
    parkPreview();
    const inbox = visibleMessages();
    const important = importantMessages();
    const inboxGroups = threadGroups(inbox);
    const importantGroups = threadGroups(important);
    // Important has its own block on the inbox views; archived/hidden filters
    // already surface those messages in the main list.
    const showImportantBlock =
      important.length > 0 &&
      state.filters.flag !== 'hidden' &&
      state.filters.flag !== 'archived';

    const importantSection = el('important-section');
    const importantList = el('important-list');
    importantSection.classList.toggle('hidden', !showImportantBlock);
    if (showImportantBlock) {
      importantSection.classList.toggle('collapsed', state.importantCollapsed);
      el('important-toggle').setAttribute(
        'aria-expanded',
        state.importantCollapsed ? 'false' : 'true',
      );
      el('important-count').textContent = String(important.length);
      el('important-chevron').textContent = state.importantCollapsed
        ? '▸'
        : '▾';
      importantList.replaceChildren(...renderListSection(importantGroups));
    } else {
      importantList.replaceChildren();
    }

    el('list-empty').classList.toggle(
      'hidden',
      inboxGroups.length > 0 || showImportantBlock,
    );

    messageList.replaceChildren(...renderListSection(inboxGroups));
    attachPreview();
  }

  // --- Accordion preview ---

  function parkPreview() {
    const holder = el('detail-holder');
    const preview = el('detail');
    if (preview.parentElement !== holder) holder.append(preview);
  }

  function attachPreview() {
    parkPreview();
    const preview = el('detail');
    if (!state.selectedId) {
      preview.classList.add('hidden');
      return;
    }
    const row = document.querySelector(
      `.message-row[data-message-id="${state.selectedId}"]`,
    );
    if (!row) {
      preview.classList.add('hidden');
      return;
    }
    preview.classList.remove('hidden');
    row.append(preview);
  }

  function scrollPreviewIntoView() {
    const preview = el('detail');
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    preview.scrollIntoView({
      block: 'nearest',
      behavior: motion.matches ? 'auto' : 'smooth',
    });
  }

  async function selectMessage(id, { toggle = true } = {}) {
    if (toggle && state.selectedId === id) {
      state.selectedId = null;
      state.detail = null;
      renderList();
      return;
    }
    if (!toggle && state.selectedId === id && state.detail?.id === id) {
      attachPreview();
      scrollPreviewIntoView();
      return;
    }
    state.selectedId = id;
    state.detail = null;
    const listed = state.messages.find((message) => message.id === id);
    if (listed) state.expandedThreads.add(threadKey(listed));
    renderList();
    renderDetail();
    scrollPreviewIntoView();
    state.detail = await fetchJson(`${API_BASE}/messages/${id}`);
    if (state.selectedId !== id) return;
    renderDetail();
  }

  function listShapeFromDetail(detail) {
    return {
      id: detail.id,
      account: detail.account,
      threadId: detail.threadId,
      fromAddress: detail.fromAddress,
      fromName: detail.fromName,
      subject: detail.subject,
      date: detail.date,
      snippet: detail.snippet ?? null,
      labels: detail.labels,
      seen: detail.seen,
      archived: detail.archived,
      hidden: detail.hidden,
      important: detail.important,
      hasAttachments: detail.hasAttachments,
      status: detail.status,
      gtdTaskId: detail.gtdTaskId,
    };
  }

  function revealMessageInList(message) {
    if (message.hidden) state.filters.flag = 'hidden';
    else if (message.archived) state.filters.flag = 'archived';
    else state.filters.flag = '';
    if (state.filters.account && state.filters.account !== message.account) {
      state.filters.account = '';
    }
    const query = state.filters.query.trim().toLowerCase();
    if (query && !matchesQuery(message, query)) {
      state.filters.query = '';
      el('filter-query').value = '';
    }
    if (message.important && !message.hidden) state.importantCollapsed = false;
    el('filter-flag').value = state.filters.flag;
    el('filter-account').value = state.filters.account;
  }

  async function openMessageFromLog(entryMessage) {
    if (!entryMessage?.id) return;
    let message = state.messages.find((row) => row.id === entryMessage.id);
    if (!message) {
      try {
        const detail = await fetchJson(
          `${API_BASE}/messages/${entryMessage.id}`,
        );
        message = listShapeFromDetail(detail);
        state.messages.unshift(message);
      } catch (error) {
        console.error(error);
        alert('Письмо не найдено');
        return;
      }
    }
    revealMessageInList(message);
    await selectMessage(message.id, { toggle: false });
  }

  // Redraws the accordion from state.detail (called on open and after an
  // action changes the open message).
  function renderDetail() {
    const preview = el('detail');
    const loading = el('detail-loading');
    const content = el('detail-content');
    preview.classList.remove('hidden');

    const message = state.detail;
    if (!message) {
      loading.classList.remove('hidden');
      content.classList.add('hidden');
      return;
    }

    loading.classList.add('hidden');
    content.classList.remove('hidden');

    // Reset any previous test result when switching messages
    el('test-rules-result').textContent = '';

    const gmail = el('detail-gmail');
    if (message.gmailUrl) {
      gmail.href = message.gmailUrl;
      gmail.classList.remove('hidden');
    } else {
      gmail.removeAttribute('href');
      gmail.classList.add('hidden');
    }

    const toGtd = el('to-gtd-btn');
    if (message.gtdTaskId) {
      toGtd.textContent = 'Уже в GTD';
      toGtd.disabled = true;
    } else {
      toGtd.textContent = 'В GTD';
      toGtd.disabled = false;
    }

    const meta = el('detail-meta');
    const rows = [
      ['От', `${message.fromName || ''} <${message.fromAddress || ''}>`],
      ['Кому', message.toAddresses.join(', ') || '—'],
      ...(message.ccAddresses.length
        ? [['Копия', message.ccAddresses.join(', ')]]
        : []),
      ['Дата', formatDate(message.date)],
      ['Аккаунт', `${message.account} · ${message.mailbox}`],
      [
        'Статус',
        [
          message.status,
          message.seen ? 'прочитано' : 'не прочитано',
          message.important ? 'важное' : null,
          message.archived ? 'в архиве' : null,
          message.hidden ? 'скрыто' : null,
        ]
          .filter(Boolean)
          .join(' · '),
      ],
      ...(message.sizeBytes ? [['Размер', formatSize(message.sizeBytes)]] : []),
    ];
    meta.replaceChildren(
      ...rows.flatMap(([label, value]) => {
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = value;
        return [dt, dd];
      }),
    );

    const labels = el('detail-labels');
    labels.replaceChildren(
      ...message.labels.map((label) => {
        const chip = document.createElement('span');
        chip.className = 'meta-chip';
        chip.textContent = label;
        return chip;
      }),
    );

    const attachments = el('detail-attachments');
    attachments.replaceChildren(
      ...message.attachments.map((attachment) => {
        const chip = document.createElement('span');
        chip.className = 'badge';
        chip.textContent = `📎 ${attachment.filename || attachment.mimeType || 'файл'} ${formatSize(attachment.sizeBytes)}`;
        chip.title = attachment.mimeType || '';
        return chip;
      }),
    );

    const body = el('detail-body');
    body.replaceChildren();
    if (message.bodyHtml) {
      body.classList.add('is-html');
      body.classList.remove('is-text');
      const frame = document.createElement('iframe');
      frame.className = 'detail-body-frame';
      frame.title = 'Тело письма';
      frame.setAttribute(
        'sandbox',
        'allow-popups allow-popups-to-escape-sandbox allow-same-origin',
      );
      frame.srcdoc = wrapEmailHtml(message.bodyHtml);
      body.append(frame);
      frame.addEventListener('load', () => resizeEmailFrame(frame));
    } else if (message.bodyText) {
      body.classList.add('is-text');
      body.classList.remove('is-html');
      const pre = document.createElement('pre');
      pre.className = 'detail-body-text';
      pre.innerHTML = linkify(normalizePlainText(message.bodyText));
      body.append(pre);
    } else {
      body.classList.remove('is-html', 'is-text');
      body.textContent = '(пустое тело письма)';
    }

    renderThread(message);
  }

  // Sandbox the HTML part: open links in a new tab, force a readable base font,
  // and keep the iframe height in sync with content.
  function wrapEmailHtml(html) {
    return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank" rel="noopener noreferrer"><style>
html,body{margin:0;padding:12px;background:#fff;}
body{font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;word-wrap:break-word;overflow-wrap:anywhere;}
img{max-width:100%;height:auto;}
a{color:#1a73e8;}
</style></head><body>${html}</body></html>`;
  }

  function resizeEmailFrame(frame) {
    try {
      const doc = frame.contentDocument;
      if (!doc?.body) return;
      const height = Math.max(
        doc.body.scrollHeight,
        doc.documentElement?.scrollHeight || 0,
      );
      frame.style.height = `${Math.min(Math.max(height + 8, 120), 1200)}px`;
    } catch {
      // Cross-origin shouldn't happen with srcdoc, but ignore if it does.
    }
  }

  function escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Soft-wraps and angle-bracket URL wrappers from text/plain MIME parts.
  function normalizePlainText(text) {
    return text
      .replace(/<\s*((?:https?:\/\/)[^>]+)\s*>/gis, (_, url) =>
        url.replace(/\s+/g, ''),
      )
      .replace(/(https?:\/\/[^\s]+)\r?\n[ \t]+([^\s]+)/g, '$1$2');
  }

  // Turn bare URLs in the (untrusted, plain-text) body into links. Escape
  // first, so the only markup we ever inject is our own anchor tags.
  function linkify(text) {
    return escapeHtml(text).replace(/(https?:\/\/[^\s<]+)/g, (match) => {
      const tail = match.match(/(&(amp|quot|gt|lt);|[.,;:!?)\]]+)$/);
      const suffix = tail ? tail[0] : '';
      const href = suffix ? match.slice(0, match.length - suffix.length) : match;
      return `<a href="${href}" target="_blank" rel="noopener noreferrer">${href}</a>${suffix}`;
    });
  }

  // --- Label picker ---

  let openPicker = null;

  function closeLabelPicker() {
    if (openPicker) {
      openPicker.remove();
      openPicker = null;
      document.removeEventListener('click', closeLabelPicker);
    }
  }

  function openLabelPicker(anchor, message) {
    closeLabelPicker();
    const picker = document.createElement('div');
    picker.className = 'label-picker editor-card';
    picker.addEventListener('click', (event) => event.stopPropagation());

    // Existing labels as toggles
    const known = [...new Set([...state.labels, ...message.labels])]
      .filter((l) => !l.startsWith('\\'))
      .sort();
    for (const label of known) {
      const on = message.labels.includes(label);
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `mini-btn label-option${on ? ' active' : ''}`;
      chip.textContent = `${on ? '✓ ' : ''}${label}`;
      chip.addEventListener('click', () => {
        closeLabelPicker();
        applyAction(message.id, on ? 'unlabel' : 'label', label);
      });
      picker.append(chip);
    }

    // New label input
    const form = document.createElement('form');
    form.className = 'label-new';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'новый ярлык, напр. agent/calendar';
    const add = document.createElement('button');
    add.type = 'submit';
    add.className = 'primary-btn';
    add.textContent = '＋';
    form.append(input, add);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const name = input.value.trim();
      if (!name) return;
      closeLabelPicker();
      applyAction(message.id, 'label', name);
    });
    picker.append(form);

    document.body.append(picker);
    const rect = anchor.getBoundingClientRect();
    picker.style.top = `${rect.bottom + window.scrollY + 4}px`;
    picker.style.left = `${Math.min(rect.left + window.scrollX, window.innerWidth - 260)}px`;
    openPicker = picker;
    setTimeout(() => document.addEventListener('click', closeLabelPicker), 0);
    input.focus();
  }

  function renderThread(message) {
    const container = el('detail-thread');
    const others = message.thread.messages;
    if (others.length < 2) {
      container.replaceChildren();
      return;
    }

    const title = document.createElement('h3');
    title.textContent = `Тред · ${others.length} писем`;

    const list = document.createElement('ul');
    list.replaceChildren(
      ...others.map((item) => {
        const li = document.createElement('li');
        li.classList.toggle('current', item.id === message.id);

        const from = document.createElement('span');
        from.textContent = item.fromAddress || '—';
        const date = document.createElement('span');
        date.className = 'muted';
        date.textContent = formatDate(item.date);

        li.append(from, date);
        if (item.id !== message.id) {
          li.addEventListener('click', () => selectMessage(item.id));
        }
        return li;
      }),
    );

    container.replaceChildren(title, list);
  }

  // --- Sync ---

  async function syncNow() {
    const button = el('sync-button');
    button.disabled = true;
    button.textContent = 'Синхронизация…';
    try {
      const data = await fetchJson(`${API_BASE}/sync`, { method: 'POST' });
      const summary = (data.results || [])
        .map((result) => {
          if (result.error) return `${result.account}: ошибка (${result.error})`;
          const hidden =
            result.hidden > 0 ? `, скрыто ${result.hidden}` : '';
          return `${result.account}: +${result.ingested}${hidden}`;
        })
        .join(', ');
      const rules = data.rules
        ? ` · правила: ${data.rules.applied}/${data.rules.processed}`
        : '';
      button.textContent = summary
        ? `${summary}${rules}`
        : 'Аккаунты не настроены';
      await Promise.all([loadStats(), loadMessages()]);
      if (state.selectedId) {
        state.detail = await fetchJson(
          `${API_BASE}/messages/${state.selectedId}`,
        );
        renderDetail();
      }
    } catch (error) {
      button.textContent = 'Ошибка синхронизации';
      console.error(error);
    } finally {
      button.disabled = false;
      setTimeout(() => {
        button.textContent = 'Синхронизировать';
      }, 5000);
    }
  }

  // --- Rules catalog ---

  const EFFECT_LABELS = {
    markRead: '✓ прочитано',
    archive: '📥 архив',
    hide: '🙈 скрыть',
    createGtdTask: 'GTD',
  };

  function effectChips(effects) {
    const chips = [];
    for (const key of ['markRead', 'archive', 'hide', 'createGtdTask']) {
      if (effects[key]) chips.push(EFFECT_LABELS[key]);
    }
    if (effects.label) chips.push(`🏷 ${effects.label}`);
    return chips;
  }

  async function loadRules() {
    const data = await fetchJson(`${API_BASE}/rules`);
    state.rules = data.rules;
    renderRules();
  }

  function renderRules() {
    const list = el('rules-list');
    el('rules-empty').classList.toggle('hidden', state.rules.length > 0);
    list.replaceChildren(
      ...state.rules.map((rule) => {
        const row = document.createElement('div');
        row.className = 'rule-row';
        if (!rule.enabled) row.classList.add('disabled');

        const main = document.createElement('div');
        main.className = 'rule-main';
        // The condition text is the rule's identity (no separate name)
        const cond = document.createElement('div');
        cond.className = 'rule-name';
        cond.textContent = rule.condition;
        const chips = document.createElement('div');
        chips.className = 'rule-chips';
        chips.replaceChildren(
          ...effectChips(rule.effects).map((text) => {
            const chip = document.createElement('span');
            chip.className = 'meta-chip';
            chip.textContent = text;
            return chip;
          }),
        );
        main.append(cond, chips);

        const controls = document.createElement('div');
        controls.className = 'rule-controls';

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'icon-btn';
        toggle.textContent = rule.enabled ? '⏸' : '▶';
        toggle.title = rule.enabled ? 'Выключить' : 'Включить';
        toggle.addEventListener('click', () => toggleRule(rule));

        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'icon-btn';
        edit.textContent = '✏️';
        edit.title = 'Редактировать';
        edit.addEventListener('click', () => openRuleForm(rule));

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'icon-btn';
        del.textContent = '🗑';
        del.title = 'Удалить';
        del.addEventListener('click', () => deleteRule(rule));

        controls.append(toggle, edit, del);
        row.append(main, controls);
        return row;
      }),
    );
  }

  function openRuleForm(rule) {
    const form = el('rule-form');
    const editing = Boolean(rule);
    const e = rule?.effects || {};
    form.innerHTML = `
      <textarea name="condition" rows="2" placeholder="Опишите правило своими словами: какие письма и что с ними делать"></textarea>
      <div class="rule-effects">
        <label><input type="checkbox" name="markRead" /> ✓ прочитано</label>
        <label><input type="checkbox" name="archive" /> 📥 архив</label>
        <label><input type="checkbox" name="hide" /> 🙈 скрыть</label>
        <label><input type="checkbox" name="createGtdTask" /> GTD-задача</label>
        <input name="label" type="text" placeholder="🏷 ярлык (необязательно)" />
        <input name="priority" type="number" title="Приоритет" value="0" />
      </div>
      <div class="rule-form-actions">
        <button type="button" class="ghost-btn" data-cancel>Отмена</button>
        <button type="submit" class="primary-btn">${editing ? 'Сохранить' : 'Создать'}</button>
      </div>`;
    form.condition.value = rule?.condition || '';
    form.markRead.checked = Boolean(e.markRead);
    form.archive.checked = Boolean(e.archive);
    form.hide.checked = Boolean(e.hide);
    form.createGtdTask.checked = Boolean(e.createGtdTask);
    form.label.value = e.label || '';
    form.priority.value = String(rule?.priority ?? 0);
    form.dataset.ruleId = editing ? String(rule.id) : '';
    form.classList.remove('hidden');
    form.querySelector('[data-cancel]').addEventListener('click', () => {
      form.classList.add('hidden');
    });
    form.name.focus();
  }

  async function saveRule(event) {
    event.preventDefault();
    const form = el('rule-form');
    const payload = {
      condition: form.condition.value.trim(),
      effects: {
        markRead: form.markRead.checked,
        archive: form.archive.checked,
        hide: form.hide.checked,
        createGtdTask: form.createGtdTask.checked,
        label: form.label.value.trim() || undefined,
      },
      priority: Number(form.priority.value) || 0,
    };
    if (!payload.condition) {
      alert('Опишите правило');
      return;
    }
    const id = form.dataset.ruleId;
    const url = id ? `${API_BASE}/rules/${id}` : `${API_BASE}/rules`;
    try {
      await fetchJson(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      form.classList.add('hidden');
      await loadRules();
    } catch (error) {
      console.error(error);
      alert('Не удалось сохранить правило');
    }
  }

  async function toggleRule(rule) {
    await fetchJson(`${API_BASE}/rules/${rule.id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: !rule.enabled }),
    });
    await loadRules();
    if (state.detail) renderDetail();
  }

  async function deleteRule(rule) {
    const ok = await window.AppDialog.confirm(
      `Удалить правило «${rule.condition}»?`,
      { danger: true, confirmLabel: 'Удалить' },
    );
    if (!ok) return;
    await fetchJson(`${API_BASE}/rules/${rule.id}`, { method: 'DELETE' });
    await loadRules();
    if (state.detail) renderDetail();
  }

  // Detail-pane: run the classifier against the open message (dry-run) and
  // report which rule would match, without applying anything.
  async function testRules() {
    if (!state.detail) return;
    const result = el('test-rules-result');
    result.textContent = 'Проверяю…';
    result.className = 'test-rules-result muted';
    try {
      const data = await fetchJson(
        `${API_BASE}/messages/${state.detail.id}/test-rules`,
        { method: 'POST' },
      );
      if (data.rulesTested === 0) {
        result.textContent = 'Нет активных правил';
        return;
      }
      if (data.matchedRuleId) {
        const pct = Math.round((data.confidence || 0) * 100);
        result.className = 'test-rules-result matched';
        result.textContent = `✓ «${data.matchedRuleCondition}» (${pct}%) — ${data.reasoning}`;
      } else {
        result.className = 'test-rules-result';
        result.textContent = `Ни одно правило не подошло${data.reasoning ? ` — ${data.reasoning}` : ''}`;
      }
    } catch (error) {
      console.error(error);
      result.className = 'test-rules-result';
      result.textContent = 'Ошибка проверки';
    }
  }

  // Classify the open message and apply effects if a rule matches confidently.
  async function applyRulesNow() {
    if (!state.detail) return;
    const result = el('test-rules-result');
    const button = el('apply-rules-btn');
    button.disabled = true;
    result.textContent = 'Применяю…';
    result.className = 'test-rules-result muted';
    try {
      const data = await fetchJson(
        `${API_BASE}/messages/${state.detail.id}/process-rules`,
        { method: 'POST' },
      );
      if (data.message) {
        patchLocal(state.detail.id, {
          seen: data.message.seen,
          archived: data.message.archived,
          hidden: data.message.hidden,
          important: data.message.important,
          labels: data.message.labels,
          status: data.message.status,
          gtdTaskId: data.message.gtdTaskId,
        });
      }
      let text;
      let className = 'test-rules-result';
      if (data.status === 'error') {
        text = `Ошибка: ${data.error || 'не удалось применить'}`;
      } else if (data.applied) {
        const pct = Math.round((data.confidence || 0) * 100);
        const ruleLabel = data.matchedRuleCondition
          ? `«${data.matchedRuleCondition}» `
          : '';
        className = 'test-rules-result matched';
        text = `Применено ${ruleLabel}(${pct}%) — ${data.reasoning}`;
      } else if (data.matchedRuleId) {
        const pct = Math.round((data.confidence || 0) * 100);
        const ruleLabel = data.matchedRuleCondition
          ? `«${data.matchedRuleCondition}» `
          : '';
        text = `Совпадение слабое ${ruleLabel}(${pct}%), не применено — ${data.reasoning}`;
      } else {
        text = `Ни одно правило не подошло${data.reasoning ? ` — ${data.reasoning}` : ''}`;
      }
      // renderDetail (via patchLocal) clears the result line — restore it
      result.textContent = text;
      result.className = className;
      await loadRules();
    } catch (error) {
      console.error(error);
      result.className = 'test-rules-result';
      result.textContent = 'Ошибка применения';
    } finally {
      button.disabled = false;
    }
  }

  // --- Journal ---

  async function loadLog() {
    const data = await fetchJson(`${API_BASE}/log`);
    const list = el('log-list');
    el('log-empty').classList.toggle('hidden', data.entries.length > 0);
    list.replaceChildren(
      ...data.entries.map((entry) => {
        const row = document.createElement('div');
        row.className = 'log-row';
        if (entry.result !== 'ok') row.classList.add('log-error');

        const when = document.createElement('span');
        when.className = 'log-when muted';
        when.textContent = formatDate(entry.createdAt);

        const action = document.createElement('span');
        action.className = 'log-action';
        const param =
          entry.param && entry.source !== 'sync' ? ` ${entry.param}` : '';
        action.textContent = entry.action + param;

        const src = document.createElement('span');
        src.className = 'meta-chip log-source';
        if (entry.source === 'rule') {
          const condition = entry.rule?.condition?.trim();
          src.textContent = condition
            ? `⚙️ ${condition}`
            : entry.ruleId
              ? `⚙️ правило #${entry.ruleId}`
              : '⚙️ правило';
          if (condition) src.title = condition;
        } else if (entry.source === 'sync') {
          src.textContent = '📭 Gmail';
          src.title =
            'Исчезло из входящих Gmail (архив или удаление)';
        } else {
          src.textContent = '👆 вручную';
        }

        const subj = document.createElement('button');
        subj.type = 'button';
        subj.className = 'log-subject';
        subj.textContent = entry.message?.subject || '(без темы)';
        if (entry.message?.id) {
          subj.title = 'Открыть письмо';
          subj.addEventListener('click', () =>
            void openMessageFromLog(entry.message),
          );
        } else {
          subj.disabled = true;
        }

        row.append(when, action, src, subj);
        if (entry.result !== 'ok') {
          const err = document.createElement('span');
          err.className = 'log-err';
          err.textContent = entry.error || 'ошибка';
          row.append(err);
        }
        return row;
      }),
    );
  }

  // --- Wiring ---

  el('rules-toggle').addEventListener('click', () => {
    el('rules-panel').classList.toggle('hidden');
  });
  el('log-toggle').addEventListener('click', () => {
    const panel = el('log-panel');
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) void loadLog();
  });
  async function toGtd() {
    if (!state.detail || state.detail.gtdTaskId) return;
    const button = el('to-gtd-btn');
    const result = el('test-rules-result');
    button.disabled = true;
    result.textContent = 'Формулирую задачу…';
    result.className = 'test-rules-result muted';
    try {
      const data = await fetchJson(
        `${API_BASE}/messages/${state.detail.id}/to-gtd`,
        { method: 'POST' },
      );
      patchLocal(state.detail.id, { gtdTaskId: data.task?.id || true });
      const resultLine = el('test-rules-result');
      resultLine.className = 'test-rules-result matched';
      resultLine.textContent = data.created
        ? `Задача: ${data.task?.content || ''}`
        : `Уже было: ${data.task?.content || ''}`;
    } catch (error) {
      console.error(error);
      result.className = 'test-rules-result';
      result.textContent =
        error instanceof Error ? error.message : 'Не удалось создать задачу';
      button.disabled = false;
    }
  }

  el('test-rules-btn').addEventListener('click', () => void testRules());
  el('apply-rules-btn').addEventListener('click', () => void applyRulesNow());
  el('to-gtd-btn').addEventListener('click', () => void toGtd());
  el('rule-add').addEventListener('click', () => openRuleForm(null));
  el('rule-form').addEventListener('submit', (event) => void saveRule(event));

  el('filter-query').addEventListener('input', (event) => {
    state.filters.query = event.target.value;
    renderList();
  });
  el('filter-account').addEventListener('change', (event) => {
    state.filters.account = event.target.value;
    renderList();
  });
  el('filter-flag').addEventListener('change', (event) => {
    state.filters.flag = event.target.value;
    renderList();
  });
  el('important-toggle').addEventListener('click', () => {
    state.importantCollapsed = !state.importantCollapsed;
    renderList();
  });
  el('sync-button').addEventListener('click', () => void syncNow());

  async function loadLabels() {
    const data = await fetchJson(`${API_BASE}/labels`);
    state.labels = data.labels;
  }

  Promise.all([
    loadStats(),
    loadMessages(),
    loadLabels(),
    loadRules(),
  ]).catch((error) => {
    console.error(error);
    el('list-empty').textContent = 'Не удалось загрузить данные';
    el('list-empty').classList.remove('hidden');
  });
})();
