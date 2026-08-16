(function () {
  const fileList = document.querySelector('#fileList');
  const emptyState = document.querySelector('#emptyState');
  const totalCount = document.querySelector('#totalCount');
  const sourceCount = document.querySelector('#sourceCount');
  const refreshButton = document.querySelector('#refreshButton');
  const searchInput = document.querySelector('#searchInput');
  let allPages = [];
  const isEn = document.documentElement.lang?.toLowerCase().startsWith('en');
  const TEXT = isEn
    ? {
        kinds: { subs: 'Subtitles', gpx: 'GPX → PNG' },
        untitled: 'Untitled page',
        open: 'Open page',
        empty:
          'No pages yet. Upload a video on /subs or a GPX file on /gpx-route-png.',
        noMatches: 'No pages match this search.',
        locale: 'en-US',
        missingDate: 'date unknown',
        signedIn: 'Synced across devices',
        localOnly: 'This device',
      }
    : {
        kinds: { subs: 'Субтитры', gpx: 'GPX → PNG' },
        untitled: 'Страница без названия',
        open: 'Открыть страницу',
        empty:
          'Пока нет страниц. Загрузите видео на /subs или GPX на /gpx-route-png.',
        noMatches: 'По этому запросу страницы не найдены.',
        locale: 'ru-RU',
        missingDate: 'дата неизвестна',
        signedIn: 'Синхронизировано между устройствами',
        localOnly: 'Это устройство',
      };

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return TEXT.missingDate;
    return date.toLocaleString(TEXT.locale);
  }

  function localizedPageUrl(page) {
    const path = page.pageUrl || (page.kind === 'gpx'
      ? `/gpx-route-png/${page.hash}`
      : `/subs/${page.hash}`);
    if (!isEn) return path;
    if (path.startsWith('/subs/') && !path.startsWith('/subs/en')) {
      return path.replace('/subs/', '/subs/en/');
    }
    if (
      path.startsWith('/gpx-route-png/') &&
      !path.startsWith('/gpx-route-png/en')
    ) {
      return path.replace('/gpx-route-png/', '/gpx-route-png/en/');
    }
    return path;
  }

  function searchableText(page) {
    return [page.title, page.hash, page.pageUrl, TEXT.kinds[page.kind], page.comment]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  }

  function filterPages(pages) {
    const query = searchInput?.value.trim().toLowerCase();
    if (!query) return pages;
    return pages.filter((page) => searchableText(page).includes(query));
  }

  function makeCard(page) {
    const card = document.createElement('article');
    card.className = 'file-card file-card--page';
    const href = localizedPageUrl(page);

    const content = document.createElement('div');
    const head = document.createElement('div');
    head.className = 'file-card__head';
    const title = document.createElement('h2');
    title.textContent = page.title || TEXT.untitled;
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = TEXT.kinds[page.kind] || page.kind;
    head.append(title, badge);

    const meta = document.createElement('p');
    meta.className = 'file-card__meta';
    meta.textContent = `${formatDate(page.updatedAt || page.createdAt)} · ${page.hash}`;

    content.append(head, meta);

    const actions = document.createElement('div');
    actions.className = 'file-card__actions';
    const open = document.createElement('a');
    open.className = 'file-card__button file-card__button--primary';
    open.href = href;
    open.textContent = TEXT.open;
    actions.append(open);

    card.append(content, actions);
    return card;
  }

  function renderList(session) {
    const pages = filterPages(allPages);
    fileList.replaceChildren(...pages.map(makeCard));
    emptyState.hidden = pages.length > 0;
    emptyState.textContent = allPages.length > 0 ? TEXT.noMatches : TEXT.empty;
    totalCount.textContent = String(pages.length);
    sourceCount.textContent = session?.authenticated
      ? TEXT.signedIn
      : TEXT.localOnly;
  }

  async function render() {
    allPages = window.ToolPages?.listPages
      ? await window.ToolPages.listPages()
      : [];
    const session = window.ToolPages?.me ? await window.ToolPages.me() : null;
    renderList(session);
  }

  refreshButton.addEventListener('click', () => {
    void render();
  });
  searchInput?.addEventListener('input', () => {
    void window.ToolPages?.me().then(renderList);
  });
  void render();
})();
