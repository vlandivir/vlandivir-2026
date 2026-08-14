/*
 * Shared i18n runtime for the vlandivir web pages.
 *
 * Goal: one HTML file per page (no more duplicated index.html / en.html).
 * A page declares its strings once and marks up the DOM with data-i18n
 * attributes; this runtime picks the active language and fills everything in.
 *
 * How a page opts in
 * ------------------
 *   1. Ship a dictionary that assigns window.PAGE_I18N before this script runs,
 *      e.g. a co-located /<page>/i18n.js:
 *        window.PAGE_I18N = {
 *          ru: { title: 'Заголовок', lead: 'Текст', subsHref: '/subs/' },
 *          en: { title: 'Title',     lead: 'Text',  subsHref: '/subs/en' },
 *        };
 *   2. Load the dictionary, then this runtime, BEFORE any other script that
 *      reads the language or the translated DOM (the shared header, page
 *      app.js, video-upload-block.js, ...). Load them WITHOUT defer so the
 *      language is set synchronously first. Put them first in <head>, or first
 *      among the end-of-<body> scripts when the page keeps its scripts there:
 *        <script src="/<page>/i18n.js"></script>
 *        <script src="/shared/i18n.js"></script>
 *        <!-- ...then site-header.js, app.js, etc. -->
 *      When placed at the end of <body>, the runtime localizes the parsed DOM
 *      (including data-* attributes) immediately, before the scripts after it.
 *   3. Mark the DOM:
 *        <title data-i18n="title">Заголовок</title>
 *        <meta name="description" data-i18n-attr="content:metaDescription" ... />
 *        <h1 data-i18n="pageTitle">Заголовок</h1>
 *        <a data-i18n="subsCta" data-i18n-attr="href:subsHref">Перейти</a>
 *
 * The RU text is kept inline as the default, so the page is fully readable with
 * JavaScript disabled and RU visitors never see a flash. Only EN visitors get a
 * (near-instant, pre-paint) swap.
 *
 * Language detection precedence:
 *   1. ?lang=ru|en query parameter (explicit deep links / local testing)
 *   2. URL path locale segment: /en, /<page>/en, /<page>/en/<rest>
 *   3. <html lang="..."> attribute
 *   4. 'ru' (default)
 *
 * Runtime API (window.SiteI18n):
 *   .lang            -> active language code ('ru' | 'en' | ...)
 *   .t(key, fallback)-> translated string for the active language
 *   .dict            -> the strings object for the active language
 *   .apply(root)     -> (re)apply translations under an optional root element
 * window.SITE_LANG mirrors .lang for convenience in page scripts.
 */
(function () {
  const SUPPORTED = ['ru', 'en'];
  const DEFAULT_LANG = 'ru';
  const dict = window.PAGE_I18N || {};

  function fromQuery() {
    try {
      const q = new URLSearchParams(location.search).get('lang');
      return q && SUPPORTED.includes(q) ? q : null;
    } catch (e) {
      return null;
    }
  }

  function fromPath() {
    const path = location.pathname.replace(/\/+$/, '');
    // '/en', '/subs/en', '/gpx-route-png/en', '/subs/en/<hash>' ...
    if (path === '/en' || /(^|\/)en(\/|$)/.test(path)) return 'en';
    return null;
  }

  function fromHtml() {
    const l = (document.documentElement.lang || '').toLowerCase();
    return SUPPORTED.find((code) => l.startsWith(code)) || null;
  }

  const lang =
    fromQuery() || fromPath() || fromHtml() || DEFAULT_LANG;

  document.documentElement.lang = lang;
  window.SITE_LANG = lang;

  function strings() {
    return dict[lang] || dict[DEFAULT_LANG] || {};
  }

  function t(key, fallback) {
    const s = strings();
    return key in s ? s[key] : fallback !== undefined ? fallback : key;
  }

  function applyText(root, s) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (key && key in s) el.textContent = s[key];
    });
  }

  function applyAttrs(root, s) {
    const scope = root || document;
    // data-i18n-attr="content:metaDescription; href:subsHref; aria-label:openLabel"
    scope.querySelectorAll('[data-i18n-attr]').forEach((el) => {
      el.getAttribute('data-i18n-attr')
        .split(/[;,]/)
        .forEach((pair) => {
          const idx = pair.indexOf(':');
          if (idx === -1) return;
          const attr = pair.slice(0, idx).trim();
          const key = pair.slice(idx + 1).trim();
          if (attr && key && key in s) el.setAttribute(attr, s[key]);
        });
    });
  }

  function apply(root) {
    const s = strings();
    applyText(root, s);
    applyAttrs(root, s);
  }

  window.SiteI18n = {
    get lang() {
      return lang;
    },
    get dict() {
      return strings();
    },
    t,
    apply,
  };

  // apply() is idempotent, so run it twice on purpose to support both script
  // placements without a build step or defer juggling:
  //   * placed first at the end of <body>: this immediate call localizes the
  //     already-parsed DOM (and any data-* attributes) BEFORE later scripts
  //     (e.g. video-upload-block.js) read them;
  //   * placed in <head>: the immediate call is a no-op (body not parsed yet)
  //     and the DOMContentLoaded pass does the work.
  // In every case document.documentElement.lang is set synchronously above,
  // before any consumer script runs.
  try {
    apply();
  } catch (e) {
    /* DOM not ready yet; the DOMContentLoaded pass will handle it */
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      apply();
    });
  }
})();
