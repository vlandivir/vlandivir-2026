(() => {
  const STAT_ICONS = {
    views:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>',
    likes:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
    replies:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    reposts:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m17 1 4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="m7 23-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
    shares:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>',
  };
  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function formatWhen(stamp) {
    if (!stamp) return '—';
    const parsed = new Date(stamp);
    if (Number.isNaN(parsed.getTime())) return String(stamp).slice(0, 16);
    const pad = (value) => String(value).padStart(2, '0');
    return `${pad(parsed.getDate())}.${pad(parsed.getMonth() + 1)} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
  }
  function preview(text, empty = 'Пустой черновик') {
    const line = String(text || '')
      .split('\n')
      .map((item) => item.trim())
      .find(Boolean);
    if (!line) return empty;
    return line.length > 140 ? `${line.slice(0, 139)}…` : line;
  }
  function appendStat(
    row,
    kind,
    label,
    current,
    previous,
    showMissing = false,
    approximate = false,
  ) {
    if (typeof current !== 'number' && !showMissing) return;
    const item = node('span', 'stat-item');
    item.title = label;
    const icon = node('span', 'stat-icon');
    icon.innerHTML = STAT_ICONS[kind] || '';
    const value =
      typeof current === 'number' ? `${approximate ? '≈' : ''}${current}` : '—';
    item.setAttribute('aria-label', `${label}: ${value}`);
    item.append(icon, node('span', '', value));
    if (
      !approximate &&
      typeof current === 'number' &&
      typeof previous === 'number' &&
      current !== previous
    ) {
      item.append(
        node(
          'span',
          'muted',
          `${current > previous ? '+' : ''}${current - previous}`,
        ),
      );
    }
    row.append(item);
  }
  function replyArticle(item, depth, freshIds, options) {
    const article = node('article', 'reply');
    article.dataset.depth = String(Math.min(depth, 4));
    const id = String(item.id || '');
    const fresh = freshIds.has(id);
    if (fresh) article.classList.add('reply-new');
    const head = node('header', 'reply-head');
    const who = node('a', 'reply-who', `@${item.username || 'unknown'}`);
    who.href = item.permalink || '#';
    if (item.permalink) {
      who.target = '_blank';
      who.rel = 'noopener noreferrer';
    } else who.addEventListener('click', (event) => event.preventDefault());
    head.append(who);
    if (item.is_reply_owned_by_me === true || item.username === 'vlandivir')
      head.append(node('span', 'reply-you', options.ownLabel || 'вы'));
    if (item.timestamp)
      head.append(node('time', 'muted', formatWhen(item.timestamp)));
    if (item.hide_status && item.hide_status !== 'NOT_HUSHED')
      head.append(
        node('span', 'muted', String(item.hide_status).toLowerCase()),
      );
    if (fresh)
      head.append(
        node('span', 'reply-new-mark', options.freshLabel || 'новое'),
      );
    article.append(head);
    if (item.text) article.append(node('p', 'reply-text', String(item.text)));
    const mediaUrl = item.thumbnail_url || item.media_url || item.gif_url;
    if (mediaUrl) {
      const image = node('img', 'reply-media');
      image.src = mediaUrl;
      image.alt = '';
      article.append(image);
    }
    if (typeof item.likes === 'number')
      article.append(
        node(
          'span',
          'muted',
          `${options.likesLabel || 'лайки'}: ${item.likes}`,
        ),
      );
    return article;
  }
  function appendReplies(
    box,
    replies,
    rootId,
    freshIds = new Set(),
    options = {},
  ) {
    const known = new Set(replies.map((item) => String(item.id || '')));
    const children = new Map();
    for (const item of replies) {
      const parentValue = item.replied_to;
      let parent = String(
        typeof parentValue === 'object' && parentValue
          ? parentValue.id || ''
          : parentValue || rootId,
      );
      if (!known.has(parent) || parent === String(item.id)) parent = rootId;
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent).push(item);
    }
    const seen = new Set();
    // Keep every nesting level without recursive calls or growing the indent forever.
    const stack = (children.get(rootId) || [])
      .slice()
      .reverse()
      .map((item) => ({ item, depth: 0, parent: box }));
    while (stack.length) {
      const { item, depth, parent } = stack.pop();
      const id = String(item.id || '');
      if (seen.has(id)) continue;
      seen.add(id);
      const article = replyArticle(item, depth, freshIds, options);
      parent.append(article);
      const kids = (children.get(id) || []).filter(
        (kid) => !seen.has(String(kid.id)),
      );
      if (kids.length) {
        const nest = node('div', 'reply-children');
        article.append(nest);
        for (const kid of kids.slice().reverse())
          stack.push({ item: kid, depth: depth + 1, parent: nest });
      }
    }
    // Malformed/cyclic parent links must not make a saved reply disappear.
    for (const item of replies)
      if (!seen.has(String(item.id || '')))
        box.append(replyArticle(item, 0, freshIds, options));
  }
  const mobile = window.matchMedia('(max-width: 640px)');
  const detailColumns = () => (mobile.matches ? 4 : 6);
  mobile.addEventListener('change', () => {
    document
      .querySelectorAll('.threads-table .post-detail > td')
      .forEach((cell) => {
        cell.colSpan = detailColumns();
      });
  });
  window.ThreadsUI = {
    appendStat,
    appendReplies,
    formatWhen,
    preview,
    detailColumns,
  };
})();
