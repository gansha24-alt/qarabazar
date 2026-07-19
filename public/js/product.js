/* Qara Bazar — страница товара: галерея + отзывы */
(function () {
  'use strict';

  // галерея
  if (document.getElementById('galleryMainImg')) {
    document.querySelectorAll('.pg-thumb').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.pg-thumb').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        // замена узла перезапускает CSS-анимацию появления
        const current = document.getElementById('galleryMainImg');
        const clone = current.cloneNode();
        clone.src = btn.dataset.img;
        current.replaceWith(clone);
      });
    });
  }

  // форма отзыва
  const form = document.getElementById('reviewForm');
  if (!form) return;

  let rating = 0;
  const rateBtns = document.querySelectorAll('#rateInput [data-rate]');

  function paint(upTo) {
    rateBtns.forEach(b => b.classList.toggle('lit', Number(b.dataset.rate) <= upTo));
  }

  rateBtns.forEach(btn => {
    btn.addEventListener('mouseenter', () => paint(Number(btn.dataset.rate)));
    btn.addEventListener('mouseleave', () => paint(rating));
    btn.addEventListener('click', () => {
      rating = Number(btn.dataset.rate);
      paint(rating);
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!rating) { QB.toast('Поставьте оценку — от 1 до 5 звёзд'); return; }
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: Number(form.dataset.productId),
          rating,
          text: form.querySelector('[name=text]').value
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка');
      QB.toast('Рахмет за отзыв! ◆');
      setTimeout(() => location.reload(), 700);
    } catch (err) {
      QB.toast(err.message);
      btn.disabled = false;
    }
  });
})();
