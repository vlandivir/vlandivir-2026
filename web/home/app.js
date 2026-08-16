(function () {
  fetch('/auth/me')
    .then((response) => (response.ok ? response.json() : null))
    .then((me) => {
      if (!me || !me.isAdmin) return;
      document.querySelectorAll('[data-admin-tools]').forEach((el) => {
        el.hidden = false;
      });
    })
    .catch(() => undefined);
})();
