/* Qara Bazar — каталог: фильтры, поиск, сортировка, подгрузка */
(function () {
  'use strict';

  const PAGE_SIZE = 12;
  const state = {
    category: (window.QB_CATALOG && window.QB_CATALOG.category) || '',
    q: (window.QB_CATALOG && window.QB_CATALOG.q) || '',
    sort: 'new',
    min: '',
    max: '',
    offset: 0,
    total: 0,
    loading: false
  };

  const grid = document.getElementById('catalogGrid');
  const countEl = document.getElementById('catalogCount');
  const emptyEl = document.getElementById('catalogEmpty');
  const moreBtn = document.getElementById('loadMore');
  const searchInput = document.getElementById('catalogSearch');
  const sortSelect = document.getElementById('catalogSort');

  async function load(reset = true) {
    if (state.loading) return;
    state.loading = true;
    if (reset) { state.offset = 0; }

    const params = new URLSearchParams({ limit: PAGE_SIZE, offset: state.offset, sort: state.sort });
    if (state.category) params.set('category', state.category);
    if (state.q) params.set('q', state.q);
    if (state.min !== '') params.set('min', state.min);
    if (state.max !== '') params.set('max', state.max);

    try {
      const res = await fetch('/api/products?' + params);
      const data = await res.json();
      state.total = data.total;

      const html = data.items.map(p => QB.productCardHTML(p)).join('');
      if (reset) grid.innerHTML = html;
      else grid.insertAdjacentHTML('beforeend', html);

      emptyEl.hidden = state.total !== 0;
      countEl.textContent = state.total
        ? `Найдено: ${state.total}`
        : '';
      state.offset += data.items.length;
      moreBtn.hidden = state.offset >= state.total;
    } catch {
      QB.toast('Не удалось загрузить каталог');
    } finally {
      state.loading = false;
    }
  }

  // категории
  document.querySelectorAll('.fcat').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.fcat').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.category = btn.dataset.cat;
      const url = new URL(location.href);
      if (state.category) url.searchParams.set('category', state.category);
      else url.searchParams.delete('category');
      history.replaceState(null, '', url);
      load();
    });
  });

  // поиск с debounce
  let searchTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.q = searchInput.value.trim();
      load();
    }, 350);
  });

  sortSelect.addEventListener('change', () => { state.sort = sortSelect.value; load(); });

  document.getElementById('applyPrice').addEventListener('click', () => {
    state.min = document.getElementById('priceMin').value;
    state.max = document.getElementById('priceMax').value;
    load();
  });

  moreBtn.addEventListener('click', () => load(false));

  const filtersToggle = document.getElementById('filtersToggle');
  filtersToggle.addEventListener('click', () => {
    document.getElementById('catalogFilters').classList.toggle('open');
  });

  load();
})();
