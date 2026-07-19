/* Qara Bazar — админ-панель (SPA) */
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const viewRoot = $('#viewRoot');
  const cache = { categories: [], sellers: [], settings: {} };

  // ---------- API ----------
  async function api(path, options = {}) {
    const res = await fetch('/api/admin' + path, {
      headers: options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      ...options
    });
    if (res.status === 401 && path !== '/me') {
      showLogin();
      throw new Error('Требуется вход');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Ошибка сервера');
    return data;
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function toast(msg, isError = false) {
    const el = document.createElement('div');
    el.className = 'a-toast' + (isError ? ' error' : '');
    el.textContent = msg;
    $('#aToastStack').appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  function fmt(n) { return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Number(n) || 0); }
  function cur() { return cache.settings.currency || '₸'; }
  function fmtDate(s) {
    const d = new Date(s + 'Z');
    return isNaN(d) ? s : d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  // ---------- вход/выход ----------
  function showLogin() {
    $('#adminShell').hidden = true;
    $('#loginScreen').hidden = false;
  }

  async function showPanel() {
    $('#loginScreen').hidden = true;
    $('#adminShell').hidden = false;
    await refreshCache();
    navigate('dashboard');
  }

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const errEl = $('#loginError');
    errEl.hidden = true;
    try {
      await api('/login', { method: 'POST', body: JSON.stringify({ login: fd.get('login'), password: fd.get('password') }) });
      await showPanel();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.hidden = false;
    }
  });

  $('#logoutBtn').addEventListener('click', async () => {
    await api('/logout', { method: 'POST' }).catch(() => {});
    showLogin();
  });

  async function refreshCache() {
    const [cats, sellers, settings, users] = await Promise.all([
      api('/categories'), api('/sellers'), api('/settings'), api('/users')
    ]);
    cache.categories = cats.items;
    cache.sellers = sellers.items;
    cache.settings = settings.settings;
    cache.users = users.items;
  }

  // ---------- навигация ----------
  const views = {};

  function navigate(name) {
    document.querySelectorAll('#adminNav button').forEach(b =>
      b.classList.toggle('active', b.dataset.view === name));
    viewRoot.innerHTML = '<div class="a-view"></div>';
    views[name](viewRoot.firstElementChild);
  }

  $('#adminNav').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-view]');
    if (btn) navigate(btn.dataset.view);
  });

  // ---------- модалка ----------
  const backdrop = $('#modalBackdrop');
  const modalBox = $('#modalBox');

  function openModal(title, bodyHTML, onMount) {
    modalBox.innerHTML = `
      <div class="a-modal-head">
        <h3>${esc(title)}</h3>
        <button class="a-modal-close" id="modalClose">✕</button>
      </div>
      ${bodyHTML}`;
    backdrop.hidden = false;
    document.body.style.overflow = 'hidden';
    $('#modalClose').addEventListener('click', closeModal);
    if (onMount) onMount(modalBox);
  }

  function closeModal() {
    backdrop.hidden = true;
    modalBox.innerHTML = '';
    document.body.style.overflow = '';
  }

  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !backdrop.hidden) closeModal(); });

  // ============================================================
  // ОБЗОР
  // ============================================================
  views.dashboard = async (root) => {
    const s = await api('/stats');
    $('#newOrdersBadge').hidden = s.orders_new === 0;
    $('#newOrdersBadge').textContent = s.orders_new;

    root.innerHTML = `
      <div class="a-head">
        <h2 class="a-title">Обзор<small>что происходит на базаре</small></h2>
        <button class="a-btn a-btn-gold" id="quickAdd">+ Добавить товар</button>
      </div>
      <div class="stat-grid">
        <div class="stat-card"><b>${s.products_active}</b><span>товаров на витрине</span></div>
        <div class="stat-card ${s.orders_new ? 'accent' : ''}"><b>${s.orders_new}</b><span>новых заказов</span></div>
        <div class="stat-card"><b>${fmt(s.revenue)} ${cur()}</b><span>сумма заказов</span></div>
        <div class="stat-card"><b>${fmt(s.paid)} ${cur()}</b><span>оплачено онлайн (тест)</span></div>
        <div class="stat-card"><b>${s.sellers}</b><span>мастеров и брендов</span></div>
        <div class="stat-card"><b>${s.users}</b><span>клиентов</span></div>
        <div class="stat-card"><b>${s.reviews}</b><span>отзывов</span></div>
        <div class="stat-card"><b>${s.categories}</b><span>категорий</span></div>
      </div>
      <div class="a-head"><h2 class="a-title" style="font-size:17px">Последние заказы</h2></div>
      ${s.recent_orders.length ? `
      <div class="a-table-wrap"><table class="a-table">
        <thead><tr><th>№</th><th>Клиент</th><th>Сумма</th><th>Статус</th><th>Дата</th></tr></thead>
        <tbody>
          ${s.recent_orders.map(o => `
            <tr>
              <td class="a-cell-title">${esc(o.number)}</td>
              <td>${esc(o.customer_name)}<div class="a-cell-sub">${esc(o.phone)}</div></td>
              <td>${fmt(o.total)} ${cur()}</td>
              <td>${statusTag(o.status)}</td>
              <td class="a-cell-sub">${fmtDate(o.created_at)}</td>
            </tr>`).join('')}
        </tbody>
      </table></div>`
      : `<div class="a-empty"><b>Заказов пока нет</b>Как только покупатели начнут оформлять заказы — они появятся здесь.</div>`}
    `;
    $('#quickAdd', root).addEventListener('click', () => { navigate('products'); setTimeout(() => $('#addProductBtn') && $('#addProductBtn').click(), 50); });
  };

  function statusTag(status) {
    const map = {
      new: ['terra', 'Новый'],
      processing: ['blue', 'В обработке'],
      shipped: ['gold', 'Отправлен'],
      done: ['ok', 'Выполнен'],
      cancelled: ['danger', 'Отменён']
    };
    const [cls, label] = map[status] || ['muted', status];
    return `<span class="a-tag ${cls}">${label}</span>`;
  }

  function payTag(o) {
    if (o.payment_method === 'card') {
      return o.payment_status === 'paid'
        ? '<span class="a-tag ok">Оплачен · тест</span>'
        : '<span class="a-tag terra">Ждёт оплаты</span>';
    }
    return '<span class="a-tag muted">При получении</span>';
  }

  // ============================================================
  // ТОВАРЫ
  // ============================================================
  views.products = async (root) => {
    const { items } = await api('/products');
    root.innerHTML = `
      <div class="a-head">
        <h2 class="a-title">Товары<small>${items.length} всего</small></h2>
        <button class="a-btn a-btn-gold" id="addProductBtn">+ Добавить товар</button>
      </div>
      ${items.length ? `
      <div class="a-table-wrap"><table class="a-table">
        <thead><tr><th></th><th>Название</th><th>Цена</th><th>Наличие</th><th>Статус</th><th></th></tr></thead>
        <tbody>
          ${items.map(p => `
            <tr data-id="${p.id}">
              <td>${p.images.length ? `<img class="a-thumb" src="${p.images[0]}" alt="">` : `<div class="a-thumb-ph">◆</div>`}</td>
              <td>
                <div class="a-cell-title">${esc(p.title)}</div>
                <div class="a-cell-sub">${esc(p.category_name || 'без категории')} · ${esc(p.seller_name || 'без мастера')}</div>
              </td>
              <td>${fmt(p.price)} ${cur()}${p.old_price ? `<div class="a-cell-sub"><s>${fmt(p.old_price)}</s></div>` : ''}</td>
              <td>${p.stock > 0 ? `${p.stock} шт.` : '<span class="a-cell-sub">под заказ</span>'}</td>
              <td>${p.active ? '<span class="a-tag ok">Виден</span>' : '<span class="a-tag muted">Скрыт</span>'}${p.featured ? ' <span class="a-tag gold">◆</span>' : ''}</td>
              <td class="a-actions">
                <button class="a-btn a-btn-ghost a-btn-sm" data-edit="${p.id}">Изменить</button>
                <button class="a-btn a-btn-danger a-btn-sm" data-del="${p.id}">✕</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table></div>`
      : `<div class="a-empty"><b>Витрина пуста</b>Добавьте первый товар — он сразу появится на сайте.</div>`}
    `;

    $('#addProductBtn', root).addEventListener('click', () => productForm());
    root.addEventListener('click', async (e) => {
      const editBtn = e.target.closest('[data-edit]');
      if (editBtn) {
        const p = items.find(x => x.id === Number(editBtn.dataset.edit));
        productForm(p);
        return;
      }
      const delBtn = e.target.closest('[data-del]');
      if (delBtn) {
        const p = items.find(x => x.id === Number(delBtn.dataset.del));
        if (!confirm(`Удалить «${p.title}»? Действие необратимо.`)) return;
        await api('/products/' + p.id, { method: 'DELETE' });
        toast('Товар удалён');
        navigate('products');
      }
    });
  };

  function productForm(p = null) {
    let images = p ? [...p.images] : [];

    const catOptions = cache.categories.map(c =>
      `<option value="${c.id}" ${p && p.category_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    const sellerOptions = cache.sellers.map(s =>
      `<option value="${s.id}" ${p && p.seller_id === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('');

    openModal(p ? 'Изменить товар' : 'Новый товар', `
      <form class="a-form" id="productForm">
        <label class="a-field">Название *
          <input name="title" required value="${p ? esc(p.title) : ''}" placeholder="Например: Пиала «Степное золото»">
        </label>
        <div class="a-form-row">
          <label class="a-field">Категория
            <select name="category_id"><option value="">— не выбрана —</option>${catOptions}</select>
          </label>
          <label class="a-field">Мастер / бренд
            <select name="seller_id"><option value="">— не выбран —</option>${sellerOptions}</select>
          </label>
        </div>
        <div class="a-form-row-3">
          <label class="a-field">Цена *<input name="price" type="number" min="0" step="0.01" required value="${p ? p.price : ''}"></label>
          <label class="a-field">Старая цена<input name="old_price" type="number" min="0" step="0.01" value="${p && p.old_price ? p.old_price : ''}" placeholder="для скидки"></label>
          <label class="a-field">В наличии, шт.<input name="stock" type="number" min="0" value="${p ? p.stock : 1}"></label>
        </div>
        <label class="a-field">Описание
          <textarea name="description" rows="4" placeholder="История изделия, размеры, особенности…">${p ? esc(p.description) : ''}</textarea>
        </label>
        <label class="a-field">Материалы и техника
          <textarea name="materials" rows="2" placeholder="Глина, глазурь, обжиг в дровяной печи…">${p ? esc(p.materials) : ''}</textarea>
        </label>
        <div class="a-field">Фотографии (до 8, первая — обложка)
          <div class="a-upload-zone" id="uploadZone">Перетащите файлы или <b>выберите</b><br><span style="font-size:11px">JPG, PNG, WebP · до 8 МБ</span></div>
          <input type="file" id="fileInput" accept="image/*" multiple hidden>
          <div class="a-previews" id="previews"></div>
        </div>
        <div class="a-form-row">
          <label class="a-check"><input type="checkbox" name="featured" ${p && p.featured ? 'checked' : ''}> Выбор базара (на главной)</label>
          <label class="a-check"><input type="checkbox" name="active" ${!p || p.active ? 'checked' : ''}> Показывать на витрине</label>
        </div>
        <div class="a-modal-foot">
          <button type="button" class="a-btn a-btn-ghost" id="cancelBtn">Отмена</button>
          <button type="submit" class="a-btn a-btn-gold" id="saveBtn">${p ? 'Сохранить' : 'Добавить товар'}</button>
        </div>
      </form>
    `, (box) => {
      const zone = $('#uploadZone', box);
      const fileInput = $('#fileInput', box);
      const previews = $('#previews', box);

      function renderPreviews() {
        previews.innerHTML = images.map((img, i) => `
          <div class="a-preview">
            <img src="${img}" alt="">
            ${i === 0 ? '<span class="is-main">обложка</span>' : ''}
            <button type="button" data-rm="${i}">✕</button>
          </div>`).join('');
      }
      renderPreviews();

      previews.addEventListener('click', (e) => {
        const rm = e.target.closest('[data-rm]');
        if (rm) { images.splice(Number(rm.dataset.rm), 1); renderPreviews(); }
      });

      async function uploadFiles(files) {
        if (!files.length) return;
        const fd = new FormData();
        [...files].slice(0, 8 - images.length).forEach(f => fd.append('images', f));
        zone.textContent = 'Загружаем…';
        try {
          const data = await api('/upload', { method: 'POST', body: fd });
          images = images.concat(data.files).slice(0, 8);
          renderPreviews();
        } catch (err) {
          toast(err.message, true);
        }
        zone.innerHTML = 'Перетащите файлы или <b>выберите</b><br><span style="font-size:11px">JPG, PNG, WebP · до 8 МБ</span>';
      }

      zone.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', () => uploadFiles(fileInput.files));
      zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
      zone.addEventListener('drop', (e) => {
        e.preventDefault(); zone.classList.remove('drag');
        uploadFiles(e.dataTransfer.files);
      });

      $('#cancelBtn', box).addEventListener('click', closeModal);
      $('#productForm', box).addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const payload = {
          title: fd.get('title'),
          category_id: fd.get('category_id') || null,
          seller_id: fd.get('seller_id') || null,
          price: fd.get('price'),
          old_price: fd.get('old_price') || null,
          stock: fd.get('stock'),
          description: fd.get('description'),
          materials: fd.get('materials'),
          images,
          featured: fd.get('featured') === 'on',
          active: fd.get('active') === 'on'
        };
        const btn = $('#saveBtn', box);
        btn.disabled = true;
        try {
          if (p) await api('/products/' + p.id, { method: 'PUT', body: JSON.stringify(payload) });
          else await api('/products', { method: 'POST', body: JSON.stringify(payload) });
          toast(p ? 'Товар обновлён' : 'Товар добавлен на витрину ◆');
          closeModal();
          navigate('products');
        } catch (err) {
          toast(err.message, true);
          btn.disabled = false;
        }
      });
    });
  }

  // ============================================================
  // ЗАКАЗЫ
  // ============================================================
  views.orders = async (root) => {
    let filter = '';
    const statuses = [
      ['', 'Все'], ['new', 'Новые'], ['processing', 'В обработке'],
      ['shipped', 'Отправлены'], ['done', 'Выполнены'], ['cancelled', 'Отменённые']
    ];

    async function render() {
      const { items } = await api('/orders' + (filter ? '?status=' + filter : ''));
      root.innerHTML = `
      <div class="a-head"><h2 class="a-title">Заказы<small>${items.length} показано</small></h2></div>
      <div class="order-filters">
        ${statuses.map(([v, label]) =>
          `<button class="of-btn ${filter === v ? 'active' : ''}" data-filter="${v}">${label}</button>`).join('')}
      </div>
      ${items.length ? items.map(o => `
        <div class="order-card" data-id="${o.id}">
          <div class="order-head">
            <span class="order-num">${esc(o.number)}</span>
            <span class="order-meta">${esc(o.customer_name)} · ${fmtDate(o.created_at)}</span>
            ${statusTag(o.status)}
            ${payTag(o)}
            <span class="order-total">${fmt(o.total)} ${cur()}</span>
          </div>
          <div class="order-body">
            <p class="order-contact"><b>${esc(o.customer_name)}</b> · ${esc(o.phone)}${o.email ? ' · ' + esc(o.email) : ''}</p>
            <p class="order-contact">${deliveryLabel(o.delivery)}${o.address ? ' — ' + esc(o.address) : ''}</p>
            ${o.comment ? `<p class="order-contact">Комментарий: ${esc(o.comment)}</p>` : ''}
            <ul class="order-items">
              ${o.items.map(i => `<li><span>${esc(i.title)} × ${i.qty}</span><span>${fmt(i.price * i.qty)} ${cur()}</span></li>`).join('')}
            </ul>
            <div class="order-status-row">
              <select data-status-for="${o.id}">
                <option value="new" ${o.status === 'new' ? 'selected' : ''}>Новый</option>
                <option value="processing" ${o.status === 'processing' ? 'selected' : ''}>В обработке</option>
                <option value="shipped" ${o.status === 'shipped' ? 'selected' : ''}>Отправлен</option>
                <option value="done" ${o.status === 'done' ? 'selected' : ''}>Выполнен</option>
                <option value="cancelled" ${o.status === 'cancelled' ? 'selected' : ''}>Отменён</option>
              </select>
              <button class="a-btn a-btn-ghost a-btn-sm" data-save-status="${o.id}">Обновить статус</button>
            </div>
          </div>
        </div>`).join('')
      : `<div class="a-empty"><b>Заказов нет</b>${filter ? 'В этом статусе пусто.' : 'Когда покупатели оформят заказ, он появится здесь.'}</div>`}
      `;
    }

    root.addEventListener('click', async (e) => {
      const fbtn = e.target.closest('[data-filter]');
      if (fbtn) { filter = fbtn.dataset.filter; render(); return; }

      const saveBtn = e.target.closest('[data-save-status]');
      if (saveBtn) {
        const id = saveBtn.dataset.saveStatus;
        const select = root.querySelector(`[data-status-for="${id}"]`);
        await api(`/orders/${id}/status`, { method: 'PUT', body: JSON.stringify({ status: select.value }) });
        toast('Статус обновлён');
        render();
        return;
      }

      const head = e.target.closest('.order-head');
      if (head) head.parentElement.classList.toggle('open');
    });

    await render();
  };

  function deliveryLabel(d) {
    return { pickup: 'Самовывоз', courier: 'Курьер по городу', international: 'Международная доставка' }[d] || d;
  }

  // ============================================================
  // МАСТЕРА
  // ============================================================
  views.sellers = async (root) => {
    const { items } = await api('/sellers');
    cache.sellers = items;
    root.innerHTML = `
      <div class="a-head">
        <h2 class="a-title">Мастера и бренды<small>${items.length} всего</small></h2>
        <button class="a-btn a-btn-gold" id="addSellerBtn">+ Добавить мастера</button>
      </div>
      ${items.length ? `
      <div class="a-table-wrap"><table class="a-table">
        <thead><tr><th></th><th>Имя</th><th>Тип</th><th>Локация</th><th>Товары</th><th>Статус</th><th></th></tr></thead>
        <tbody>
          ${items.map(s => `
            <tr>
              <td>${s.avatar ? `<img class="a-thumb" src="${s.avatar}" alt="" style="border-radius:50%">` : `<div class="a-thumb-ph" style="border-radius:50%">◆</div>`}</td>
              <td class="a-cell-title">${esc(s.name)}<div class="a-cell-sub">${s.user_email ? 'Аккаунт: ' + esc(s.user_email) : 'Без аккаунта'}</div></td>
              <td><span class="a-tag ${s.kind === 'brand' ? 'gold' : s.kind === 'studio' ? 'blue' : 'terra'}">${s.kind === 'brand' ? 'Бренд' : s.kind === 'studio' ? 'Студия' : 'Мастер'}</span></td>
              <td class="a-cell-sub">${esc(s.location || '—')}</td>
              <td>${s.product_count}</td>
              <td>${s.active ? '<span class="a-tag ok">Виден</span>' : '<span class="a-tag muted">Скрыт</span>'}</td>
              <td class="a-actions">
                <button class="a-btn a-btn-ghost a-btn-sm" data-edit="${s.id}">Изменить</button>
                <button class="a-btn a-btn-danger a-btn-sm" data-del="${s.id}">✕</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table></div>`
      : `<div class="a-empty"><b>Пока никого</b>Добавьте первого мастера или бренд — им можно будет присваивать товары.</div>`}
    `;

    $('#addSellerBtn', root).addEventListener('click', () => sellerForm());
    root.addEventListener('click', async (e) => {
      const editBtn = e.target.closest('[data-edit]');
      if (editBtn) { sellerForm(items.find(x => x.id === Number(editBtn.dataset.edit))); return; }
      const delBtn = e.target.closest('[data-del]');
      if (delBtn) {
        const s = items.find(x => x.id === Number(delBtn.dataset.del));
        if (!confirm(`Удалить «${s.name}»? Товары мастера останутся, но потеряют привязку.`)) return;
        await api('/sellers/' + s.id, { method: 'DELETE' });
        toast('Удалено');
        await refreshCache();
        navigate('sellers');
      }
    });
  };

  function sellerForm(s = null) {
    let avatar = s ? s.avatar : '';
    let cover = s ? s.cover : '';

    openModal(s ? 'Изменить мастера' : 'Новый мастер / бренд', `
      <form class="a-form" id="sellerForm">
        <div class="a-form-row">
          <label class="a-field">Имя / название *<input name="name" required value="${s ? esc(s.name) : ''}"></label>
          <label class="a-field">Тип
            <select name="kind">
              <option value="master" ${!s || s.kind === 'master' ? 'selected' : ''}>Мастер</option>
              <option value="brand" ${s && s.kind === 'brand' ? 'selected' : ''}>Бренд</option>
              <option value="studio" ${s && s.kind === 'studio' ? 'selected' : ''}>Студия</option>
            </select>
          </label>
        </div>
        <div class="a-form-row">
          <label class="a-field">Локация (город)<input name="location" value="${s ? esc(s.location) : ''}"></label>
          <label class="a-field">Привязка к клиенту (email)
            <select name="user_id">
              <option value="">-- Без привязки --</option>
              ${cache.users.map(u => `<option value="${u.id}" ${s && s.user_id === u.id ? 'selected' : ''}>${esc(u.email)} (${esc(u.name)})</option>`).join('')}
            </select>
          </label>
        </div>
        <label class="a-field">О себе<textarea name="bio" rows="3">${s ? esc(s.bio) : ''}</textarea></label>
        <div class="a-form-row">
          <label class="a-field">Instagram<input name="instagram" value="${s ? esc(s.instagram) : ''}" placeholder="без @"></label>
          <label class="a-field">Сайт<input name="website" value="${s ? esc(s.website) : ''}" placeholder="https://…"></label>
        </div>
        <div class="a-form-row">
          <div class="a-field">Аватар
            <div class="a-upload-zone" id="avatarZone">${avatar ? 'Заменить' : 'Загрузить'} фото</div>
            <input type="file" id="avatarInput" accept="image/*" hidden>
            <div class="a-previews" id="avatarPreview"></div>
          </div>
          <div class="a-field">Обложка страницы
            <div class="a-upload-zone" id="coverZone">${cover ? 'Заменить' : 'Загрузить'} фото</div>
            <input type="file" id="coverInput" accept="image/*" hidden>
            <div class="a-previews" id="coverPreview"></div>
          </div>
        </div>
        <div class="a-form-row">
          <label class="a-check"><input type="checkbox" name="featured" ${s && s.featured ? 'checked' : ''}> Показывать первым</label>
          <label class="a-check"><input type="checkbox" name="active" ${!s || s.active ? 'checked' : ''}> Виден на сайте</label>
        </div>
        <div class="a-modal-foot">
          <button type="button" class="a-btn a-btn-ghost" id="cancelBtn">Отмена</button>
          <button type="submit" class="a-btn a-btn-gold" id="saveBtn">${s ? 'Сохранить' : 'Добавить'}</button>
        </div>
      </form>
    `, (box) => {
      function bindSingleUpload(zoneId, inputId, previewId, get, set) {
        const zone = $(zoneId, box), input = $(inputId, box), preview = $(previewId, box);
        function render() {
          preview.innerHTML = get()
            ? `<div class="a-preview"><img src="${get()}" alt=""><button type="button" data-clear>✕</button></div>` : '';
        }
        render();
        zone.addEventListener('click', () => input.click());
        preview.addEventListener('click', (e) => {
          if (e.target.closest('[data-clear]')) { set(''); render(); }
        });
        input.addEventListener('change', async () => {
          if (!input.files.length) return;
          const fd = new FormData();
          fd.append('images', input.files[0]);
          try {
            const data = await api('/upload', { method: 'POST', body: fd });
            if (data.files[0]) { set(data.files[0]); render(); }
          } catch (err) { toast(err.message, true); }
        });
      }
      bindSingleUpload('#avatarZone', '#avatarInput', '#avatarPreview', () => avatar, v => avatar = v);
      bindSingleUpload('#coverZone', '#coverInput', '#coverPreview', () => cover, v => cover = v);

      $('#cancelBtn', box).addEventListener('click', closeModal);
      $('#sellerForm', box).addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const payload = {
          name: fd.get('name'), kind: fd.get('kind'), location: fd.get('location'),
          user_id: fd.get('user_id') || null,
          bio: fd.get('bio'), instagram: fd.get('instagram'), website: fd.get('website'),
          avatar, cover,
          featured: fd.get('featured') === 'on',
          active: fd.get('active') === 'on'
        };
        try {
          if (s) await api('/sellers/' + s.id, { method: 'PUT', body: JSON.stringify(payload) });
          else await api('/sellers', { method: 'POST', body: JSON.stringify(payload) });
          toast(s ? 'Сохранено' : 'Мастер добавлен ◆');
          closeModal();
          await refreshCache();
          navigate('sellers');
        } catch (err) { toast(err.message, true); }
      });
    });
  }

  // ============================================================
  // КАТЕГОРИИ
  // ============================================================
  views.categories = async (root) => {
    const { items } = await api('/categories');
    cache.categories = items;
    const emblems = ['star', 'horn', 'yurt', 'sun', 'vessel', 'weave', 'shield', 'compass'];

    root.innerHTML = `
      <div class="a-head">
        <h2 class="a-title">Категории<small>ряды базара</small></h2>
        <button class="a-btn a-btn-gold" id="addCatBtn">+ Добавить категорию</button>
      </div>
      <div class="a-table-wrap"><table class="a-table">
        <thead><tr><th>Название</th><th>Слаг</th><th>Орнамент</th><th>Порядок</th><th></th></tr></thead>
        <tbody>
          ${items.map(c => `
            <tr>
              <td class="a-cell-title">${esc(c.name)}</td>
              <td class="a-cell-sub">${esc(c.slug)}</td>
              <td class="a-cell-sub">${esc(c.emblem)}</td>
              <td>${c.sort}</td>
              <td class="a-actions">
                <button class="a-btn a-btn-ghost a-btn-sm" data-edit="${c.id}">Изменить</button>
                <button class="a-btn a-btn-danger a-btn-sm" data-del="${c.id}">✕</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table></div>
    `;

    function catForm(c = null) {
      openModal(c ? 'Изменить категорию' : 'Новая категория', `
        <form class="a-form" id="catForm">
          <label class="a-field">Название *<input name="name" required value="${c ? esc(c.name) : ''}"></label>
          <div class="a-form-row">
            <label class="a-field">Орнамент-иконка
              <select name="emblem">
                ${emblems.map(e => `<option value="${e}" ${c && c.emblem === e ? 'selected' : ''}>${e}</option>`).join('')}
              </select>
            </label>
            <label class="a-field">Порядок<input name="sort" type="number" value="${c ? c.sort : items.length}"></label>
          </div>
          <div class="a-modal-foot">
            <button type="button" class="a-btn a-btn-ghost" id="cancelBtn">Отмена</button>
            <button type="submit" class="a-btn a-btn-gold">${c ? 'Сохранить' : 'Добавить'}</button>
          </div>
        </form>
      `, (box) => {
        $('#cancelBtn', box).addEventListener('click', closeModal);
        $('#catForm', box).addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          const payload = { name: fd.get('name'), emblem: fd.get('emblem'), sort: fd.get('sort') };
          try {
            if (c) await api('/categories/' + c.id, { method: 'PUT', body: JSON.stringify(payload) });
            else await api('/categories', { method: 'POST', body: JSON.stringify(payload) });
            toast('Сохранено');
            closeModal();
            await refreshCache();
            navigate('categories');
          } catch (err) { toast(err.message, true); }
        });
      });
    }

    $('#addCatBtn', root).addEventListener('click', () => catForm());
    root.addEventListener('click', async (e) => {
      const editBtn = e.target.closest('[data-edit]');
      if (editBtn) { catForm(items.find(x => x.id === Number(editBtn.dataset.edit))); return; }
      const delBtn = e.target.closest('[data-del]');
      if (delBtn) {
        const c = items.find(x => x.id === Number(delBtn.dataset.del));
        if (!confirm(`Удалить категорию «${c.name}»? Товары останутся без категории.`)) return;
        await api('/categories/' + c.id, { method: 'DELETE' });
        toast('Удалено');
        await refreshCache();
        navigate('categories');
      }
    });
  };

  // ============================================================
  // КЛИЕНТЫ
  // ============================================================
  views.users = async (root) => {
    const { items } = await api('/users');
    root.innerHTML = `
      <div class="a-head"><h2 class="a-title">Клиенты<small>${items.length} зарегистрировано</small></h2></div>
      ${items.length ? `
      <div class="a-table-wrap"><table class="a-table">
        <thead><tr><th>Имя</th><th>Email</th><th>Телефон</th><th>Заказы</th><th>Сумма покупок</th><th>Регистрация</th></tr></thead>
        <tbody>
          ${items.map(u => `
            <tr>
              <td class="a-cell-title">${esc(u.name)}</td>
              <td>${esc(u.email)}</td>
              <td class="a-cell-sub">${esc(u.phone || '—')}</td>
              <td>${u.order_count}</td>
              <td>${fmt(u.order_total)} ${cur()}</td>
              <td class="a-cell-sub">${fmtDate(u.created_at)}</td>
            </tr>`).join('')}
        </tbody>
      </table></div>`
      : `<div class="a-empty"><b>Клиентов пока нет</b>Когда покупатели зарегистрируются на витрине, они появятся здесь.</div>`}
    `;
  };

  // ============================================================
  // ОТЗЫВЫ
  // ============================================================
  views.reviews = async (root) => {
    const { items } = await api('/reviews');
    root.innerHTML = `
      <div class="a-head"><h2 class="a-title">Отзывы<small>${items.length} всего</small></h2></div>
      ${items.length ? `
      <div class="a-table-wrap"><table class="a-table">
        <thead><tr><th>Товар</th><th>Клиент</th><th>Оценка</th><th>Текст</th><th>Дата</th><th></th></tr></thead>
        <tbody>
          ${items.map(r => `
            <tr>
              <td class="a-cell-title"><a href="/product/${r.product_slug}" target="_blank">${esc(r.product_title)}</a></td>
              <td>${esc(r.user_name)}<div class="a-cell-sub">${esc(r.user_email)}</div></td>
              <td><span class="a-tag gold">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span></td>
              <td class="a-cell-sub" style="max-width:340px">${esc(r.text || '—')}</td>
              <td class="a-cell-sub">${fmtDate(r.created_at)}</td>
              <td class="a-actions"><button class="a-btn a-btn-danger a-btn-sm" data-del="${r.id}">✕</button></td>
            </tr>`).join('')}
        </tbody>
      </table></div>`
      : `<div class="a-empty"><b>Отзывов пока нет</b>Отзывы покупателей о товарах появятся здесь — их можно будет модерировать.</div>`}
    `;

    root.addEventListener('click', async (e) => {
      const delBtn = e.target.closest('[data-del]');
      if (!delBtn) return;
      if (!confirm('Удалить этот отзыв?')) return;
      await api('/reviews/' + delBtn.dataset.del, { method: 'DELETE' });
      toast('Отзыв удалён');
      navigate('reviews');
    });
  };

  // ============================================================
  // НАСТРОЙКИ
  // ============================================================
  views.settings = async (root) => {
    const { settings } = await api('/settings');
    cache.settings = settings;
    root.innerHTML = `
      <div class="a-head"><h2 class="a-title">Настройки<small>витрина и контакты</small></h2></div>
      <form class="a-form" id="settingsForm" style="max-width:560px">
        <label class="a-field">Слоган на витрине
          <input name="site_tagline" value="${esc(settings.site_tagline)}"></label>
        <div class="a-form-row">
          <label class="a-field">Валюта (символ)<input name="currency" value="${esc(settings.currency)}" maxlength="6"></label>
          <label class="a-field">Телефон<input name="contact_phone" value="${esc(settings.contact_phone)}"></label>
        </div>
        <div class="a-form-row">
          <label class="a-field">Email<input name="contact_email" value="${esc(settings.contact_email)}"></label>
          <label class="a-field">Instagram (без @)<input name="contact_instagram" value="${esc(settings.contact_instagram)}"></label>
        </div>
        <button type="submit" class="a-btn a-btn-gold" style="align-self:flex-start">Сохранить настройки</button>
      </form>

      <div class="a-head" style="margin-top:44px"><h2 class="a-title" style="font-size:17px">Смена пароля</h2></div>
      <form class="a-form" id="passwordForm" style="max-width:560px">
        <div class="a-form-row">
          <label class="a-field">Текущий пароль<input name="current" type="password" required autocomplete="current-password"></label>
          <label class="a-field">Новый пароль (мин. 6)<input name="next" type="password" required minlength="6" autocomplete="new-password"></label>
        </div>
        <button type="submit" class="a-btn a-btn-ghost" style="align-self:flex-start">Сменить пароль</button>
      </form>
    `;

    $('#settingsForm', root).addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = Object.fromEntries(fd.entries());
      try {
        await api('/settings', { method: 'PUT', body: JSON.stringify(payload) });
        cache.settings = { ...cache.settings, ...payload };
        toast('Настройки сохранены');
      } catch (err) { toast(err.message, true); }
    });

    $('#passwordForm', root).addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await api('/password', { method: 'PUT', body: JSON.stringify({ current: fd.get('current'), next: fd.get('next') }) });
        toast('Пароль изменён');
        e.target.reset();
      } catch (err) { toast(err.message, true); }
    });
  };

  // ---------- старт ----------
  (async function init() {
    try {
      const me = await api('/me');
      if (me.login) await showPanel();
      else showLogin();
    } catch {
      showLogin();
    }
  })();
})();
