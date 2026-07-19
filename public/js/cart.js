/* Qara Bazar — корзина и оформление заказа */
(function () {
  'use strict';

  const content = document.getElementById('cartContent');
  const emptyEl = document.getElementById('cartEmpty');
  const successEl = document.getElementById('orderSuccess');
  const itemsEl = document.getElementById('cartItems');
  const form = document.getElementById('checkoutForm');

  let resolved = []; // актуальные данные товаров с сервера

  async function render() {
    const cart = QB.Cart.items();
    if (!cart.length) {
      content.hidden = true;
      emptyEl.hidden = false;
      return;
    }

    try {
      const res = await fetch('/api/cart/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: cart.map(i => i.id) })
      });
      const data = await res.json();
      resolved = data.items;
    } catch {
      QB.toast('Не удалось загрузить корзину');
      return;
    }

    // выкидываем из корзины то, чего больше нет
    const validIds = new Set(resolved.map(p => p.id));
    cart.filter(i => !validIds.has(i.id)).forEach(i => QB.Cart.remove(i.id));

    const items = QB.Cart.items();
    if (!items.length) {
      content.hidden = true;
      emptyEl.hidden = false;
      return;
    }

    emptyEl.hidden = true;
    content.hidden = false;

    itemsEl.innerHTML = items.map(ci => {
      const p = resolved.find(x => x.id === ci.id);
      const img = p.images.length
        ? `<img class="ci-img" src="${p.images[0]}" alt="${QB.escapeHtml(p.title)}">`
        : `<span class="ci-img-ph"><svg><use href="#qb-brand"/></svg></span>`;
      return `
      <div class="cart-item" data-id="${p.id}">
        ${img}
        <div class="ci-info">
          <h4><a href="/product/${p.slug}">${QB.escapeHtml(p.title)}</a></h4>
          ${p.seller ? `<span class="ci-seller">${QB.escapeHtml(p.seller.name)}</span>` : ''}
          <div class="ci-price">${QB.formatPrice(p.price)} ${QB.CURRENCY}</div>
        </div>
        <div class="ci-side">
          <div class="qty-stepper" data-qty>
            <button type="button" data-qty-minus>−</button>
            <input type="number" value="${ci.qty}" min="1" max="99" data-qty-input data-cart-qty="${p.id}">
            <button type="button" data-qty-plus>+</button>
          </div>
          <button class="ci-remove" data-remove="${p.id}">убрать</button>
        </div>
      </div>`;
    }).join('');

    updateSummary();
  }

  function updateSummary() {
    const items = QB.Cart.items();
    let total = 0, count = 0;
    items.forEach(ci => {
      const p = resolved.find(x => x.id === ci.id);
      if (p) { total += p.price * ci.qty; count += ci.qty; }
    });
    document.getElementById('summaryCount').textContent = count;
    document.getElementById('summaryTotal').textContent = `${QB.formatPrice(total)} ${QB.CURRENCY}`;
    document.getElementById('summaryGrand').textContent = `${QB.formatPrice(total)} ${QB.CURRENCY}`;
  }

  itemsEl.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('[data-remove]');
    if (removeBtn) {
      QB.Cart.remove(Number(removeBtn.dataset.remove));
      render();
      return;
    }
    // клик по степперу: input уже обновлён обработчиком app.js
    if (e.target.closest('[data-qty-minus], [data-qty-plus]')) {
      const input = e.target.closest('[data-qty]').querySelector('[data-cart-qty]');
      QB.Cart.setQty(Number(input.dataset.cartQty), parseInt(input.value) || 1);
      updateSummary();
    }
  });

  itemsEl.addEventListener('change', (e) => {
    const input = e.target.closest('[data-cart-qty]');
    if (!input) return;
    QB.Cart.setQty(Number(input.dataset.cartQty), parseInt(input.value) || 1);
    render();
  });

  // предзаполнение формы данными профиля
  (async function prefill() {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (!data.user) return;
      const f = form.elements;
      if (!f.customer_name.value) f.customer_name.value = data.user.name || '';
      if (!f.phone.value) f.phone.value = data.user.phone || '';
      if (!f.email.value) f.email.value = data.user.email || '';
    } catch { /* гость */ }
  })();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('checkoutBtn');
    btn.disabled = true;
    btn.textContent = 'Оформляем…';

    const fd = new FormData(form);
    const payload = {
      customer_name: fd.get('customer_name'),
      phone: fd.get('phone'),
      email: fd.get('email'),
      address: fd.get('address'),
      delivery: fd.get('delivery'),
      payment_method: fd.get('payment_method'),
      comment: fd.get('comment'),
      items: QB.Cart.items()
    };

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка оформления');

      QB.Cart.clear();
      if (data.payment_method === 'card') {
        openPayModal(data.number, data.total);
      } else {
        showSuccess(data.number, 'Мастер свяжется с вами для подтверждения деталей и оплаты при получении. Рахмет за поддержку локального творчества! ◆');
      }
    } catch (err) {
      QB.toast(err.message);
      btn.disabled = false;
      btn.textContent = 'Оформить заказ';
    }
  });

  function showSuccess(number, note) {
    content.hidden = true;
    emptyEl.hidden = true;
    document.getElementById('payBackdrop').hidden = true;
    successEl.hidden = false;
    document.getElementById('orderNumber').textContent = number;
    if (note) document.getElementById('orderPayNote').textContent = note;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------- моковая оплата ----------
  const payBackdrop = document.getElementById('payBackdrop');
  const payForm = document.getElementById('payForm');
  const cardInput = payForm.elements.card_number;
  const expInput = payForm.elements.exp;

  function openPayModal(number, total) {
    payForm.dataset.number = number;
    document.getElementById('payAmount').textContent = `${QB.formatPrice(total)} ${QB.CURRENCY}`;
    payBackdrop.hidden = false;
    document.body.style.overflow = 'hidden';
    cardInput.focus();
  }

  // маски ввода
  cardInput.addEventListener('input', () => {
    const digits = cardInput.value.replace(/\D/g, '').slice(0, 16);
    cardInput.value = digits.replace(/(.{4})/g, '$1 ').trim();
    document.getElementById('pcvNumber').textContent =
      (digits.padEnd(16, '•')).replace(/(.{4})/g, '$1 ').trim();
  });
  expInput.addEventListener('input', () => {
    const d = expInput.value.replace(/\D/g, '').slice(0, 4);
    expInput.value = d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d;
    document.getElementById('pcvExp').textContent = expInput.value || '••/••';
  });

  document.getElementById('payCancel').addEventListener('click', () => {
    document.body.style.overflow = '';
    showSuccess(payForm.dataset.number,
      'Заказ создан, но не оплачен. Мастер свяжется с вами — оплатить можно будет при подтверждении.');
  });

  payForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('payError');
    errEl.hidden = true;

    const digits = cardInput.value.replace(/\D/g, '');
    if (digits.length !== 16) { errEl.textContent = 'Введите 16 цифр номера карты'; errEl.hidden = false; return; }
    if (!/^\d{2}\/\d{2}$/.test(expInput.value)) { errEl.textContent = 'Срок в формате MM/ГГ'; errEl.hidden = false; return; }

    payForm.hidden = true;
    document.getElementById('payProcessing').hidden = false;

    // имитация обращения к платёжному шлюзу
    await new Promise(r => setTimeout(r, 1600));

    try {
      const res = await fetch('/api/pay/' + encodeURIComponent(payForm.dataset.number), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card_number: digits })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Оплата не прошла');
      document.body.style.overflow = '';
      showSuccess(payForm.dataset.number,
        'Оплата прошла успешно (тестовый режим — деньги не списаны). Мастер уже собирает ваш заказ. Рахмет! ◆');
    } catch (err) {
      payForm.hidden = false;
      document.getElementById('payProcessing').hidden = true;
      errEl.textContent = err.message;
      errEl.hidden = false;
    }
  });

  render();
})();
