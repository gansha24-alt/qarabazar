/* Qara Bazar — страница избранного */
(function () {
  'use strict';

  const grid = document.getElementById('favGrid');
  const emptyEl = document.getElementById('favEmpty');

  async function render() {
    const ids = QB.Fav.ids();
    if (!ids.length) {
      grid.innerHTML = '';
      emptyEl.hidden = false;
      return;
    }
    try {
      const res = await fetch('/api/cart/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      });
      const data = await res.json();
      emptyEl.hidden = data.items.length > 0;
      grid.innerHTML = data.items.map(p => QB.productCardHTML(p)).join('');
    } catch {
      QB.toast('Не удалось загрузить избранное');
    }
  }

  document.addEventListener('qb:fav-change', (e) => {
    if (!e.detail.added) {
      const card = grid.querySelector(`[data-product-id="${e.detail.id}"]`);
      if (card) card.remove();
      if (!QB.Fav.ids().length) emptyEl.hidden = false;
    }
  });

  render();
})();
