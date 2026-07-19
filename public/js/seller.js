(function () {
  'use strict';

  // Вкладки
  const tabs = document.querySelectorAll('.snav-btn');
  const panels = document.querySelectorAll('.stab');

  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.hidden = true);
      btn.classList.add('active');
      const tabId = 'tab-' + btn.dataset.tab;
      document.getElementById(tabId).hidden = false;
      
      if (btn.dataset.tab === 'products') loadProducts();
      if (btn.dataset.tab === 'orders') loadOrders();
    });
  });

  // Профиль
  const profileForm = document.getElementById('sellerProfileForm');
  if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(profileForm);
      const data = Object.fromEntries(fd.entries());
      const res = await fetch('/api/seller/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const json = await res.json();
      if (res.ok) QB.toast('Профиль сохранён');
      else QB.toast(json.error || 'Ошибка');
    });
  }

  // Категории
  let categories = [];
  async function loadCats() {
    const res = await fetch('/api/seller/categories');
    const json = await res.json();
    categories = json.items || [];
    const sel = document.getElementById('catSelect');
    if (sel) {
      sel.innerHTML = '<option value="">Без категории</option>' + 
        categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    }
  }
  loadCats();

  // Товары
  let products = [];
  async function loadProducts() {
    document.getElementById('productsList').innerHTML = 'Загрузка...';
    const res = await fetch('/api/seller/products');
    const json = await res.json();
    products = json.items || [];
    renderProducts();
  }

  function renderProducts() {
    const list = document.getElementById('productsList');
    if (!products.length) {
      list.innerHTML = '<p style="color:var(--muted)">У вас пока нет товаров.</p>';
      return;
    }
    list.innerHTML = `
      <table class="seller-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Название</th>
            <th>Цена</th>
            <th>Категория</th>
            <th>Статус</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          ${products.map(p => `
            <tr>
              <td>${p.id}</td>
              <td>${QB.escapeHtml(p.title)}</td>
              <td>${QB.formatPrice(p.price)} ₸</td>
              <td>${p.category_name || '-'}</td>
              <td>${p.active ? '<span style="color:var(--ok)">Активен</span>' : '<span style="color:var(--danger)">Скрыт</span>'}</td>
              <td>
                <button class="btn btn-ghost btn-sm" onclick="editProduct(${p.id})" style="padding:4px 8px; font-size:11px">Изменить</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  window.openProductModal = () => {
    document.getElementById('productForm').reset();
    document.getElementById('productForm').elements.id.value = '';
    document.getElementById('productModalTitle').textContent = 'Добавить товар';
    document.getElementById('productModal').hidden = false;
  };

  window.editProduct = (id) => {
    const p = products.find(x => x.id === id);
    if (!p) return;
    const f = document.getElementById('productForm').elements;
    f.id.value = p.id;
    f.title.value = p.title || '';
    f.price.value = p.price || '';
    f.old_price.value = p.old_price || '';
    f.stock.value = p.stock || 0;
    f.category_id.value = p.category_id || '';
    f.materials.value = p.materials || '';
    f.description.value = p.description || '';
    f.active.value = p.active ? '1' : '0';
    document.getElementById('productModalTitle').textContent = 'Редактировать товар';
    document.getElementById('productModal').hidden = false;
  };

  document.getElementById('productForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());
    data.active = data.active === '1';
    
    const id = data.id;
    delete data.id;
    
    const url = id ? `/api/seller/products/${id}` : '/api/seller/products';
    const method = id ? 'PUT' : 'POST';
    
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const json = await res.json();
    if (res.ok) {
      QB.toast('Товар сохранён');
      document.getElementById('productModal').hidden = true;
      loadProducts();
    } else {
      QB.toast(json.error || 'Ошибка');
    }
  });

  // Заказы
  let orders = [];
  async function loadOrders() {
    document.getElementById('ordersList').innerHTML = 'Загрузка...';
    const res = await fetch('/api/seller/orders');
    const json = await res.json();
    orders = json.items || [];
    renderOrders();
  }

  function renderOrders() {
    const list = document.getElementById('ordersList');
    if (!orders.length) {
      list.innerHTML = '<p style="color:var(--muted)">Заказов пока нет.</p>';
      return;
    }
    
    list.innerHTML = orders.map(o => `
      <div class="uorder" style="margin-bottom:20px; background:var(--surface-2); padding:20px; border-radius:8px">
        <div class="uorder-head" style="margin-bottom:15px; border-bottom:1px solid var(--line-soft); padding-bottom:15px">
          <span style="font-weight:bold; margin-right:15px">Заказ ${o.number}</span>
          <span style="color:var(--muted); margin-right:15px">${new Date(o.created_at + 'Z').toLocaleDateString('ru-RU')}</span>
          <span style="color:var(--gold); margin-right:15px">
            Сумма ваших товаров: ${QB.formatPrice(o.seller_total)} ₸
          </span>
          <div style="margin-top:10px; font-size:13px; color:var(--muted)">
            Покупатель: ${QB.escapeHtml(o.customer_name)}<br>
            Телефон: ${QB.escapeHtml(o.phone)}<br>
            Адрес: ${QB.escapeHtml(o.address || 'Самовывоз')}
          </div>
        </div>
        <ul style="list-style:none; padding:0; margin:0">
          ${o.items.map(i => `
            <li style="display:flex; justify-content:space-between; margin-bottom:5px; font-size:14px">
              <span>${QB.escapeHtml(i.title)} × ${i.qty}</span>
              <span>${QB.formatPrice(i.price * i.qty)} ₸</span>
            </li>
          `).join('')}
        </ul>
      </div>
    `).join('');
  }

})();
