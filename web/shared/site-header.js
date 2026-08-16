(function () {
  const INSTAGRAM_URL = 'https://www.instagram.com/vlandivir/';

  const COPY = {
    ru: {
      brand: 'vlandivir',
      langLabel: 'Выбор языка',
      instagramLabel: 'Открыть Instagram @vlandivir',
      login: 'Войти',
      logout: 'Выйти',
    },
    en: {
      brand: 'vlandivir',
      langLabel: 'Language',
      instagramLabel: 'Open Instagram @vlandivir',
      login: 'Log in',
      logout: 'Log out',
    },
  };

  const TOOL_LABELS = {
    places: { ru: 'Карта', en: 'Map' },
    subs: { ru: 'Субтитры', en: 'Subs' },
    gpx: { ru: 'GPX', en: 'GPX' },
    files: { ru: 'Файлы', en: 'Files' },
    trip: { ru: 'Поездка', en: 'Trip' },
    diary: { ru: 'Дневник', en: 'Diary' },
    email: { ru: 'Почта', en: 'Mail' },
    reels: { ru: 'Reels', en: 'Reels' },
    gtd: { ru: 'GTD', en: 'GTD' },
  };

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

  function makeLink({ href, text, active }) {
    const link = document.createElement('a');
    link.href = href;
    link.textContent = text;
    if (active) link.setAttribute('aria-current', 'page');
    return link;
  }

  function renderHeader(mount) {
    const lang = currentLanguage();
    const copy = COPY[lang];
    const active = mount.dataset.active || '';
    const homeHref = lang === 'en' ? '/en' : '/';

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

    const brand = makeLink({ href: homeHref, text: '' });
    brand.className = 'v-site-header__brand';
    brand.setAttribute('aria-label', copy.brand);
    const name = document.createElement('span');
    name.className = 'v-site-header__name';
    name.textContent = copy.brand;
    brand.append(name);
    left.append(instagram, brand);

    const toolLabel = TOOL_LABELS[active]?.[lang];
    if (toolLabel) {
      const tool = document.createElement('span');
      tool.className = 'v-site-header__tool';
      tool.textContent = toolLabel;
      left.append(tool);
    }

    const right = document.createElement('div');
    right.className = 'v-site-header__right';

    const account = document.createElement('div');
    account.className = 'v-site-header__account';
    right.append(account);

    if (!('langNone' in mount.dataset)) {
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
      right.append(langNav);
    }

    void fetchMe().then((me) => {
      if (me && me.authenticated) {
        const who = document.createElement('span');
        who.className = 'v-site-header__who';
        who.textContent = me.name || me.email;
        who.title = me.email || me.name || '';
        const logout = makeLink({ href: '/auth/logout', text: copy.logout });
        logout.className = 'mini-btn';
        account.append(who, logout);
      } else {
        const redirect = encodeURIComponent(
          location.pathname + location.search,
        );
        const login = makeLink({
          href: `/auth/google?redirect=${redirect}`,
          text: copy.login,
        });
        login.className = 'mini-btn';
        account.append(login);
      }
    });

    mount.replaceChildren(left, right);
  }

  document.querySelectorAll('[data-site-header]').forEach(renderHeader);
})();
