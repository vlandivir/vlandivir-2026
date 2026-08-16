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
    const record = {
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
      await window.UserPagesRegistry.upsert(record).catch((error) => {
        console.warn('Failed to remember tool page locally', error);
      });
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
        }),
      });
    } catch (error) {
      console.warn('Failed to sync tool page', error);
    }
    return record;
  }

  async function listPages() {
    const local = window.UserPagesRegistry?.list
      ? await window.UserPagesRegistry.list().catch(() => [])
      : [];
    const session = await me();
    if (!session?.authenticated) {
      return local.sort((a, b) =>
        String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')),
      );
    }

    let remote = [];
    try {
      const response = await fetch('/user-pages-api/pages');
      if (response.ok) {
        const payload = await response.json();
        remote = Array.isArray(payload.pages) ? payload.pages : [];
      }
    } catch (error) {
      console.warn('Failed to load synced pages', error);
    }

    const byId = new Map();
    for (const page of [...local, ...remote]) {
      if (!page?.kind || !HASH_RE.test(page.hash || '')) continue;
      const id = pageId(page);
      const next = { ...page, id };
      const prev = byId.get(id);
      if (
        !prev ||
        String(next.updatedAt || '') > String(prev.updatedAt || '')
      ) {
        byId.set(id, next);
      }
    }

    const merged = [...byId.values()].sort((a, b) =>
      String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')),
    );
    if (window.UserPagesRegistry?.upsert) {
      await Promise.all(
        merged.map((page) =>
          window.UserPagesRegistry.upsert(page).catch(() => null),
        ),
      );
    }

    const remoteIds = new Set(remote.map((page) => pageId(page)));
    await Promise.all(
      local
        .filter((page) => page?.kind && HASH_RE.test(page.hash || ''))
        .filter((page) => !remoteIds.has(pageId(page)))
        .map((page) => rememberPage(page)),
    );

    return merged;
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
