(function () {
  const HASH_RE = /^[a-f0-9]{24}$/;

  async function me() {
    try {
      const response = await fetch('/auth/me');
      if (!response.ok) return null;
      return response.json();
    } catch {
      return null;
    }
  }

  function pageId(page) {
    return `${page.kind}:${page.hash}`;
  }

  async function rememberPage(page) {
    if (!page?.kind || !HASH_RE.test(page.hash || '')) return null;
    let record = {
      id: pageId(page),
      kind: page.kind,
      hash: page.hash,
      title: page.title || page.hash,
      pageUrl: page.pageUrl,
      createdAt: page.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      comment: page.comment || '',
    };
    if (window.UserPagesRegistry?.upsert) {
      const saved = await window.UserPagesRegistry.upsert(record).catch((error) => {
        console.warn('Failed to remember tool page locally', error);
        return null;
      });
      if (saved) record = saved;
    }
    const session = await me();
    if (!session?.authenticated) return record;
    try {
      await fetch('/user-pages-api/pages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: record.kind,
          hash: record.hash,
          title: record.title,
          pageUrl: record.pageUrl,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        }),
      });
    } catch (error) {
      console.warn('Failed to sync tool page', error);
    }
    return record;
  }

  function sortPages(pages) {
    return [...pages].sort((a, b) =>
      String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')),
    );
  }

  function toListItem(page) {
    if (!page?.kind || !HASH_RE.test(page.hash || '')) return null;
    return { ...page, id: pageId(page) };
  }

  async function pushPagesToServer(pages) {
    const payload = pages.map(toListItem).filter(Boolean).map((page) => ({
      kind: page.kind,
      hash: page.hash,
      title: page.title,
      pageUrl: page.pageUrl,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
    }));
    if (!payload.length) return null;
    const response = await fetch('/user-pages-api/pages/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pages: payload }),
    });
    if (!response.ok) throw new Error('Failed to import local pages');
    const body = await response.json();
    return Array.isArray(body.pages) ? body.pages : [];
  }

  async function fetchServerPages() {
    const response = await fetch('/user-pages-api/pages');
    if (!response.ok) throw new Error('Failed to load synced pages');
    const payload = await response.json();
    return Array.isArray(payload.pages) ? payload.pages : [];
  }

  async function listPages() {
    const local = window.UserPagesRegistry?.list
      ? await window.UserPagesRegistry.list().catch(() => [])
      : [];
    const session = await me();
    if (!session?.authenticated) return sortPages(local);

    try {
      const imported = await pushPagesToServer(local);
      const remote = imported || (await fetchServerPages());
      return sortPages(remote.map(toListItem).filter(Boolean));
    } catch (error) {
      console.warn('Failed to load synced pages', error);
      return sortPages(local);
    }
  }

  function renderArtifacts(root, artifacts, copy) {
    if (!root) return;
    const items = Array.isArray(artifacts) ? artifacts : [];
    root.hidden = items.length === 0;
    if (!items.length) {
      root.replaceChildren();
      return;
    }

    const list = document.createElement('ul');
    list.className = 'artifact-list';
    for (const artifact of items) {
      const row = document.createElement('li');
      row.className = 'artifact-row';
      const name = document.createElement('div');
      name.className = 'artifact-row__name';
      name.textContent =
        (copy?.labels && copy.labels[artifact.id]) ||
        artifact.name ||
        artifact.id;
      const meta = document.createElement('p');
      meta.className = 'artifact-row__meta';
      meta.textContent = artifact.name || artifact.id;
      name.append(meta);
      const link = document.createElement('a');
      link.className = 'ghost-btn artifact-row__download';
      link.href = artifact.url;
      link.download = artifact.name || 'file';
      link.rel = 'noopener noreferrer';
      link.textContent = copy?.download || 'Download';
      row.append(name, link);
      list.append(row);
    }
    root.replaceChildren(list);
  }

  window.ToolPages = {
    me,
    rememberPage,
    listPages,
    renderArtifacts,
  };
})();
