(() => {
  const LABELS = {
    ru: {
      cancel: 'Отмена',
      confirm: 'Подтвердить',
      ok: 'OK',
      delete: 'Удалить',
    },
    en: {
      cancel: 'Cancel',
      confirm: 'Confirm',
      ok: 'OK',
      delete: 'Delete',
    },
  };

  /** @type {null | { mode: 'confirm' | 'prompt', resolve: (value: any) => void }} */
  let state = null;
  /** @type {HTMLElement | null} */
  let root = null;
  /** @type {HTMLElement | null} */
  let titleEl = null;
  /** @type {HTMLElement | null} */
  let messageEl = null;
  /** @type {HTMLElement | null} */
  let fieldEl = null;
  /** @type {HTMLInputElement | null} */
  let inputEl = null;
  /** @type {HTMLButtonElement | null} */
  let cancelBtn = null;
  /** @type {HTMLButtonElement | null} */
  let confirmBtn = null;

  function lang() {
    const htmlLang = document.documentElement.lang || '';
    if (htmlLang.toLowerCase().startsWith('en')) return 'en';
    if (window.SITE_LANG === 'en') return 'en';
    return 'ru';
  }

  function labels() {
    return LABELS[lang()] || LABELS.ru;
  }

  function ensure() {
    if (root) return;
    root = document.createElement('div');
    root.id = 'v-app-dialog';
    root.className = 'v-app-dialog';
    root.hidden = true;
    root.innerHTML = `
      <div class="v-app-dialog__card editor-card" role="dialog" aria-modal="true" aria-labelledby="v-app-dialog-title">
        <h2 class="v-app-dialog__title" id="v-app-dialog-title"></h2>
        <p class="v-app-dialog__message" id="v-app-dialog-message"></p>
        <div class="v-app-dialog__field" id="v-app-dialog-field" hidden>
          <label>
            <span class="visually-hidden" id="v-app-dialog-input-label"></span>
            <input id="v-app-dialog-input" type="text" maxlength="200" autocomplete="off" />
          </label>
        </div>
        <div class="v-app-dialog__actions">
          <button class="ghost-btn" type="button" id="v-app-dialog-cancel"></button>
          <button class="primary-btn" type="button" id="v-app-dialog-confirm"></button>
        </div>
      </div>
    `;
    document.body.appendChild(root);

    titleEl = root.querySelector('#v-app-dialog-title');
    messageEl = root.querySelector('#v-app-dialog-message');
    fieldEl = root.querySelector('#v-app-dialog-field');
    inputEl = root.querySelector('#v-app-dialog-input');
    cancelBtn = root.querySelector('#v-app-dialog-cancel');
    confirmBtn = root.querySelector('#v-app-dialog-confirm');

    cancelBtn.addEventListener('click', () => {
      close(state?.mode === 'prompt' ? null : false);
    });
    confirmBtn.addEventListener('click', () => {
      if (!state) return;
      if (state.mode === 'prompt') close(inputEl.value);
      else close(true);
    });
    root.addEventListener('click', (event) => {
      if (event.target === root) {
        close(state?.mode === 'prompt' ? null : false);
      }
    });
    inputEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        confirmBtn.click();
      }
    });
    document.addEventListener(
      'keydown',
      (event) => {
        if (!state || root.hidden) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          close(state.mode === 'prompt' ? null : false);
        }
      },
      true,
    );
  }

  function close(result) {
    if (!state) return;
    const { resolve } = state;
    state = null;
    if (root) root.hidden = true;
    if (confirmBtn) confirmBtn.classList.remove('is-danger');
    if (fieldEl) fieldEl.hidden = true;
    resolve(result);
  }

  function open(options) {
    ensure();
    if (state) close(options.mode === 'prompt' ? null : false);

    return new Promise((resolve) => {
      const mode = options.mode || 'confirm';
      const L = labels();
      state = { mode, resolve };

      const title = options.title || '';
      const message = options.message || '';
      titleEl.textContent = title;
      titleEl.hidden = !title;
      messageEl.textContent = message;
      messageEl.hidden = !message;

      cancelBtn.textContent = options.cancelLabel || L.cancel;
      confirmBtn.textContent =
        options.confirmLabel ||
        (mode === 'prompt' ? L.ok : options.danger ? L.delete : L.confirm);
      confirmBtn.classList.toggle('is-danger', Boolean(options.danger));

      if (mode === 'prompt') {
        fieldEl.hidden = false;
        const label = root.querySelector('#v-app-dialog-input-label');
        if (label) label.textContent = title || message || '';
        inputEl.value = options.defaultValue || '';
      } else {
        fieldEl.hidden = true;
      }

      root.hidden = false;
      queueMicrotask(() => {
        if (mode === 'prompt') {
          inputEl.focus();
          inputEl.select();
        } else {
          confirmBtn.focus();
        }
      });
    });
  }

  function confirm(message, options = {}) {
    return open({
      mode: 'confirm',
      message,
      title: options.title,
      confirmLabel: options.confirmLabel,
      cancelLabel: options.cancelLabel,
      danger: options.danger,
    });
  }

  function prompt(message, defaultValue = '', options = {}) {
    return open({
      mode: 'prompt',
      message,
      title: options.title,
      defaultValue,
      confirmLabel: options.confirmLabel,
      cancelLabel: options.cancelLabel,
    });
  }

  window.AppDialog = {
    confirm,
    prompt,
    ensure,
    labels,
  };
})();
