(function () {
  const INSTAGRAM_URL = 'https://www.instagram.com/vlandivir/';

  const COPY = {
    ru: {
      brand: 'vlandivir',
      navLabel: 'Навигация',
      langLabel: 'Выбор языка',
      home: 'Главная',
      places: 'Карта',
      subs: 'Subs',
      gpx: 'GPX',
      files: 'Ваши файлы',
      gtd: 'GTD',
      instagram: 'Instagram',
      instagramLabel: 'Открыть Instagram @vlandivir',
      login: 'Войти',
      logout: 'Выйти',
    },
    en: {
      brand: 'vlandivir',
      navLabel: 'Navigation',
      langLabel: 'Language',
      home: 'Home',
      places: 'Map',
      subs: 'Subs',
      gpx: 'GPX',
      files: 'Files',
      gtd: 'GTD',
      instagram: 'Instagram',
      instagramLabel: 'Open Instagram @vlandivir',
      login: 'Sign in',
      logout: 'Sign out',
    },
  };

  // Google session info, fetched once and shared by every header on the page
  let mePromise = null;
  function fetchMe() {
    if (!mePromise) {
      mePromise = fetch('/auth/me')
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null);
    }
    return mePromise;
  }

  function currentLanguage() {
    return document.documentElement.lang?.toLowerCase().startsWith('en')
      ? 'en'
      : 'ru';
  }

  function pagePaths(lang) {
    return {
      home: lang === 'en' ? '/en' : '/',
      places: '/places/',
      subs: lang === 'en' ? '/subs/en' : '/subs/',
      gpx: lang === 'en' ? '/gpx-route-png/en' : '/gpx-route-png/',
      files: lang === 'en' ? '/files/en' : '/files/',
      gtd: '/gtd',
    };
  }

  function makeLink({ href, text, active, external }) {
    const link = document.createElement('a');
    link.href = href;
    link.textContent = text;
    if (active) link.setAttribute('aria-current', 'page');
    if (external) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.className = 'v-site-header__external';
    }
    return link;
  }

  function renderHeader(mount) {
    const lang = currentLanguage();
    const copy = COPY[lang];
    const paths = pagePaths(lang);
    const active = mount.dataset.active || '';

    mount.className = 'v-site-header';

    const left = document.createElement('div');
    left.className = 'v-site-header__left';

    const instagram = document.createElement('a');
    instagram.className = 'v-site-header__instagram';
    instagram.href = INSTAGRAM_URL;
    instagram.target = '_blank';
    instagram.rel = 'noopener noreferrer';
    instagram.setAttribute('aria-label', copy.instagramLabel);
    instagram.innerHTML =
      '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="3" width="18" height="18" rx="5" ry="5" fill="none" stroke="currentColor" stroke-width="2"></rect><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"></circle><circle cx="17.5" cy="6.5" r="1.5" fill="currentColor"></circle></svg>';

    const brand = makeLink({
      href: paths.home,
      text: '',
    });
    brand.className = 'v-site-header__brand';
    brand.setAttribute('aria-label', copy.brand);

    const name = document.createElement('span');
    name.className = 'v-site-header__name';
    name.textContent = copy.brand;
    brand.append(name);
    left.append(instagram, brand);

    const right = document.createElement('div');
    right.className = 'v-site-header__right';

    const nav = document.createElement('nav');
    nav.className = 'v-site-header__nav';
    nav.setAttribute('aria-label', copy.navLabel);
    nav.append(
      makeLink({
        href: paths.places,
        text: copy.places,
        active: active === 'places',
      }),
      makeLink({
        href: paths.subs,
        text: copy.subs,
        active: active === 'subs',
      }),
      makeLink({ href: paths.gpx, text: copy.gpx, active: active === 'gpx' }),
      makeLink({
        href: paths.files,
        text: copy.files,
        active: active === 'files',
      }),
    );

    const langNav = document.createElement('nav');
    langNav.className = 'v-site-header__lang';
    langNav.setAttribute('aria-label', copy.langLabel);
    langNav.append(
      makeLink({
        href: mount.dataset.langRu || '/',
        text: 'RU',
        active: lang === 'ru',
      }),
      makeLink({
        href: mount.dataset.langEn || '/en',
        text: 'EN',
        active: lang === 'en',
      }),
    );

    right.append(nav);
    // App-like single-language pages set data-lang-none to hide the switcher
    if (!('langNone' in mount.dataset)) right.append(langNav);

    const account = document.createElement('div');
    account.className = 'v-site-header__account';
    right.append(account);
    void fetchMe().then((me) => {
      if (me && me.authenticated) {
        nav.append(
          makeLink({
            href: paths.gtd,
            text: copy.gtd,
            active: active === 'gtd',
          }),
        );
        const email = document.createElement('span');
        email.className = 'v-site-header__email';
        email.textContent = me.email;
        email.title = me.name || me.email;
        const logout = makeLink({ href: '/auth/logout', text: copy.logout });
        account.append(email, logout);
      } else {
        const redirect = encodeURIComponent(
          location.pathname + location.search,
        );
        account.append(
          makeLink({
            href: `/auth/google?redirect=${redirect}`,
            text: copy.login,
          }),
        );
      }
    });

    mount.replaceChildren(left, right);
  }

  document.querySelectorAll('[data-site-header]').forEach(renderHeader);
})();
