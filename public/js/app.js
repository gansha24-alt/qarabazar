/* Qara Bazar — общий клиентский модуль */
(function () {
  'use strict';

  const CURRENCY = document.body.dataset.currency || '₸';

  // ---------- хранилища ----------
  const store = {
    read(key) {
      try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; }
    },
    write(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  };

  const Cart = {
    items() { return store.read('qb_cart'); },
    count() { return this.items().reduce((s, i) => s + i.qty, 0); },
    add(id, qty = 1) {
      const items = this.items();
      const found = items.find(i => i.id === id);
      if (found) found.qty = Math.min(found.qty + qty, 99);
      else items.push({ id, qty: Math.min(qty, 99) });
      store.write('qb_cart', items);
      updateBadges(true);
    },
    setQty(id, qty) {
      let items = this.items();
      if (qty <= 0) items = items.filter(i => i.id !== id);
      else items.forEach(i => { if (i.id === id) i.qty = Math.min(qty, 99); });
      store.write('qb_cart', items);
      updateBadges();
    },
    remove(id) { this.setQty(id, 0); },
    clear() { store.write('qb_cart', []); updateBadges(); }
  };

  const Fav = {
    ids() { return store.read('qb_fav'); },
    has(id) { return this.ids().includes(id); },
    toggle(id) {
      let ids = this.ids();
      const had = ids.includes(id);
      ids = had ? ids.filter(x => x !== id) : [...ids, id];
      store.write('qb_fav', ids);
      updateBadges();
      return !had;
    }
  };

  window.QB = { Cart, Fav, toast, formatPrice, CURRENCY, productCardHTML };

  // ---------- бейджи в шапке ----------
  function updateBadges(bumpCart = false) {
    const cartBadge = document.querySelector('[data-cart-count]');
    const favBadge = document.querySelector('[data-fav-count]');
    if (cartBadge) {
      const n = Cart.count();
      cartBadge.textContent = n;
      cartBadge.hidden = n === 0;
      if (bumpCart && n > 0) {
        cartBadge.classList.remove('bump');
        void cartBadge.offsetWidth;
        cartBadge.classList.add('bump');
      }
    }
    if (favBadge) {
      const n = Fav.ids().length;
      favBadge.textContent = n;
      favBadge.hidden = n === 0;
    }
  }

  // ---------- toast ----------
  function toast(message) {
    const stack = document.getElementById('toastStack');
    if (!stack) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 320);
    }, 2600);
  }

  function formatPrice(n) {
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Number(n) || 0);
  }

  // ---------- карточка товара (для клиентского рендера) ----------
  function productCardHTML(p) {
    const img = p.images && p.images.length
      ? `<img src="${p.images[0]}" alt="${escapeHtml(p.title)}" loading="lazy">`
      : `<span class="pc-placeholder"><svg><use href="#qb-brand"/></svg></span>`;
    const sale = p.old_price && p.old_price > p.price
      ? `<span class="pc-sale">−${Math.round((1 - p.price / p.old_price) * 100)}%</span>` : '';
    const featured = p.featured ? `<span class="pc-featured">Выбор базара</span>` : '';
    const cat = p.category ? `<span class="pc-cat">${escapeHtml(p.category.name)}</span>` : '';
    const seller = p.seller
      ? `<a class="pc-seller" href="/seller/${p.seller.slug}">${escapeHtml(p.seller.name)}${p.seller.location ? ' · ' + escapeHtml(p.seller.location) : ''}</a>` : '';
    const old = p.old_price && p.old_price > p.price ? `<s>${formatPrice(p.old_price)}</s>` : '';
    return `
    <article class="product-card reveal visible" data-product-id="${p.id}">
      <a href="/product/${p.slug}" class="pc-media">${img}${sale}${featured}</a>
      <button class="pc-fav ${Fav.has(p.id) ? 'active' : ''}" data-fav-btn="${p.id}" aria-label="В избранное">
        <svg><use href="#qb-heart"/></svg>
      </button>
      <div class="pc-body">
        ${cat}
        <h3 class="pc-title"><a href="/product/${p.slug}">${escapeHtml(p.title)}</a></h3>
        ${seller}
        <div class="pc-foot">
          <span class="pc-price">${formatPrice(p.price)} ${CURRENCY} ${old}</span>
          <button class="pc-add" data-add-to-cart="${p.id}" aria-label="В корзину">
            <svg><use href="#qb-bag"/></svg>
          </button>
        </div>
      </div>
    </article>`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  window.QB.escapeHtml = escapeHtml;

  // ---------- глобальные клики: корзина + избранное ----------
  document.addEventListener('click', (e) => {
    const addBtn = e.target.closest('[data-add-to-cart]');
    if (addBtn) {
      e.preventDefault();
      const id = Number(addBtn.dataset.addToCart);
      let qty = 1;
      if (addBtn.hasAttribute('data-qty-source')) {
        const input = document.querySelector('[data-qty-input]');
        if (input) qty = Math.max(parseInt(input.value) || 1, 1);
      }
      Cart.add(id, qty);
      addBtn.classList.add('added');
      setTimeout(() => addBtn.classList.remove('added'), 900);
      toast('Добавлено в корзину');
      return;
    }

    const favBtn = e.target.closest('[data-fav-btn]');
    if (favBtn) {
      e.preventDefault();
      const id = Number(favBtn.dataset.favBtn);
      const added = Fav.toggle(id);
      favBtn.classList.toggle('active', added);
      toast(added ? 'В избранном ◆' : 'Убрано из избранного');
      document.dispatchEvent(new CustomEvent('qb:fav-change', { detail: { id, added } }));
    }
  });

  // отметить избранное на серверном рендере
  function markFavorites() {
    document.querySelectorAll('[data-fav-btn]').forEach(btn => {
      btn.classList.toggle('active', Fav.has(Number(btn.dataset.favBtn)));
    });
  }

  // ---------- количество (степпер) ----------
  document.addEventListener('click', (e) => {
    const stepper = e.target.closest('[data-qty]');
    if (!stepper) return;
    const input = stepper.querySelector('[data-qty-input]');
    if (!input) return;
    if (e.target.closest('[data-qty-minus]')) input.value = Math.max((parseInt(input.value) || 1) - 1, 1);
    if (e.target.closest('[data-qty-plus]')) input.value = Math.min((parseInt(input.value) || 1) + 1, 99);
  });

  // ---------- шапка: поиск и мобильное меню ----------
  const searchToggle = document.getElementById('searchToggle');
  const searchBar = document.getElementById('searchBar');
  if (searchToggle && searchBar) {
    searchToggle.addEventListener('click', () => {
      searchBar.hidden = !searchBar.hidden;
      if (!searchBar.hidden) document.getElementById('searchInput').focus();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') searchBar.hidden = true;
    });
  }

  const burger = document.getElementById('burgerBtn');
  const mobileNav = document.getElementById('mobileNav');
  const mobileNavClose = document.getElementById('mobileNavClose');
  if (burger && mobileNav) {
    burger.addEventListener('click', () => {
      const open = mobileNav.hidden;
      mobileNav.hidden = !open;
      burger.classList.toggle('open', open);
      document.body.style.overflow = open ? 'hidden' : '';
    });
    
    if (mobileNavClose) {
      mobileNavClose.addEventListener('click', () => {
        mobileNav.hidden = true;
        burger.classList.remove('open');
        document.body.style.overflow = '';
      });
    }
    
    // Закрываем меню при клике на любую ссылку внутри него
    const navLinks = mobileNav.querySelectorAll('a');
    navLinks.forEach(link => {
      link.addEventListener('click', () => {
        mobileNav.hidden = true;
        burger.classList.remove('open');
        document.body.style.overflow = '';
      });
    });
  }

  // ---------- reveal-анимации при скролле ----------
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -30px 0px' });

  function observeReveals(root = document) {
    root.querySelectorAll('.reveal:not(.visible)').forEach(el => io.observe(el));
  }
  window.QB.observeReveals = observeReveals;

  // ---------- счётчики чисел ----------
  const counterIO = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      counterIO.unobserve(el);
      const target = Number(el.dataset.countup) || 0;
      const dur = 1200;
      const start = performance.now();
      (function tick(now) {
        const k = Math.min((now - start) / dur, 1);
        el.textContent = Math.round(target * (1 - Math.pow(1 - k, 3)));
        if (k < 1) requestAnimationFrame(tick);
      })(start);
    });
  }, { threshold: 0.4 });

  document.querySelectorAll('[data-countup]').forEach(el => counterIO.observe(el));

  // init
  updateBadges();
  markFavorites();
  observeReveals();
})();
