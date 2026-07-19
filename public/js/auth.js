/* Qara Bazar — вход и регистрация */
(function () {
  'use strict';

  const tabs = document.querySelectorAll('.auth-tab');
  const forms = document.querySelectorAll('.auth-form');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.toggle('active', t === tab));
      forms.forEach(f => f.hidden = f.dataset.form !== tab.dataset.tab);
    });
  });

  function nextUrl() {
    const next = window.QB_NEXT || '';
    return next.startsWith('/') ? next : '/account';
  }

  forms.forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = form.querySelector('[data-error]');
      const btn = form.querySelector('button[type=submit]');
      errEl.hidden = true;
      btn.disabled = true;

      const fd = new FormData(form);
      const payload = Object.fromEntries(fd.entries());
      const endpoint = form.dataset.form === 'register' ? '/api/auth/register' : '/api/auth/login';

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Ошибка');
        location.href = nextUrl();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.hidden = false;
        btn.disabled = false;
      }
    });
  });
})();
