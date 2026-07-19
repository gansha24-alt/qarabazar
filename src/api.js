// Qara Bazar — публичное API
const express = require('express');
const crypto = require('node:crypto');
const { db } = require('./db');
const { getUser, requireUser } = require('./user-auth');

const router = express.Router();

function productRow(p) {
  return {
    id: p.id,
    title: p.title,
    slug: p.slug,
    description: p.description,
    materials: p.materials,
    price: p.price,
    old_price: p.old_price,
    images: JSON.parse(p.images || '[]'),
    stock: p.stock,
    featured: !!p.featured,
    created_at: p.created_at,
    category: p.category_id ? { id: p.category_id, name: p.category_name, slug: p.category_slug } : null,
    seller: p.seller_id ? { id: p.seller_id, name: p.seller_name, slug: p.seller_slug, location: p.seller_location } : null
  };
}

const PRODUCT_SELECT = `
  SELECT p.*,
         c.name AS category_name, c.slug AS category_slug,
         s.name AS seller_name, s.slug AS seller_slug, s.location AS seller_location
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN sellers s ON s.id = p.seller_id
`;

// GET /api/products?category=&seller=&q=&sort=&min=&max=&featured=1&limit=&offset=
router.get('/products', (req, res) => {
  const where = ['p.active = 1'];
  const params = [];

  if (req.query.category) { where.push('c.slug = ?'); params.push(req.query.category); }
  if (req.query.seller) { where.push('s.slug = ?'); params.push(req.query.seller); }
  if (req.query.featured === '1') where.push('p.featured = 1');
  if (req.query.q) {
    where.push('(qb_contains(p.title, ?) OR qb_contains(p.description, ?) OR qb_contains(p.materials, ?) OR qb_contains(s.name, ?))');
    const q = String(req.query.q);
    params.push(q, q, q, q);
  }
  const min = parseFloat(req.query.min);
  const max = parseFloat(req.query.max);
  if (!Number.isNaN(min)) { where.push('p.price >= ?'); params.push(min); }
  if (!Number.isNaN(max)) { where.push('p.price <= ?'); params.push(max); }

  const sorts = {
    new: 'p.created_at DESC, p.id DESC',
    price_asc: 'p.price ASC',
    price_desc: 'p.price DESC',
    featured: 'p.featured DESC, p.created_at DESC'
  };
  const orderBy = sorts[req.query.sort] || sorts.new;

  const limit = Math.min(parseInt(req.query.limit) || 12, 48);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);

  const whereSql = `WHERE ${where.join(' AND ')}`;
  const total = db.prepare(
    `SELECT COUNT(*) AS c FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN sellers s ON s.id = p.seller_id ${whereSql}`
  ).get(...params).c;

  const rows = db.prepare(`${PRODUCT_SELECT} ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);

  res.json({ total, items: rows.map(productRow) });
});

router.get('/products/:slug', (req, res) => {
  const p = db.prepare(`${PRODUCT_SELECT} WHERE p.slug = ? AND p.active = 1`).get(req.params.slug);
  if (!p) return res.status(404).json({ error: 'not_found' });
  const related = db.prepare(
    `${PRODUCT_SELECT} WHERE p.active = 1 AND p.id != ? AND (p.category_id = ? OR p.seller_id = ?)
     ORDER BY p.created_at DESC LIMIT 4`
  ).all(p.id, p.category_id || -1, p.seller_id || -1);
  res.json({ item: productRow(p), related: related.map(productRow) });
});

// корзина: получить актуальные данные по списку id
router.post('/cart/resolve', (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Number.isInteger).slice(0, 100) : [];
  if (!ids.length) return res.json({ items: [] });
  const marks = ids.map(() => '?').join(',');
  const rows = db.prepare(`${PRODUCT_SELECT} WHERE p.id IN (${marks}) AND p.active = 1`).all(...ids);
  res.json({ items: rows.map(productRow) });
});

router.get('/categories', (req, res) => {
  const rows = db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.active = 1) AS product_count
    FROM categories c ORDER BY c.sort, c.id`).all();
  res.json({ items: rows });
});

router.get('/sellers', (req, res) => {
  const rows = db.prepare(`
    SELECT s.*, (SELECT COUNT(*) FROM products p WHERE p.seller_id = s.id AND p.active = 1) AS product_count
    FROM sellers s WHERE s.active = 1
    ORDER BY s.featured DESC, s.created_at DESC`).all();
  res.json({ items: rows });
});

// оформление заказа
router.post('/orders', (req, res) => {
  const b = req.body || {};
  const name = String(b.customer_name || '').trim();
  const phone = String(b.phone || '').trim();
  const items = Array.isArray(b.items) ? b.items : [];

  if (name.length < 2) return res.status(400).json({ error: 'Укажите имя' });
  if (phone.length < 5) return res.status(400).json({ error: 'Укажите телефон' });
  if (!items.length) return res.status(400).json({ error: 'Корзина пуста' });
  const delivery = ['pickup', 'courier', 'international'].includes(b.delivery) ? b.delivery : 'pickup';

  const clean = [];
  for (const it of items.slice(0, 100)) {
    const id = Number(it.id);
    const qty = Math.min(Math.max(parseInt(it.qty) || 1, 1), 99);
    if (!Number.isInteger(id)) continue;
    const p = db.prepare('SELECT id, title, price, stock, seller_id FROM products WHERE id = ? AND active = 1').get(id);
    if (p) clean.push({ product: p, qty });
  }
  if (!clean.length) return res.status(400).json({ error: 'Товары недоступны' });

  const total = clean.reduce((sum, x) => sum + x.product.price * x.qty, 0);
  const number = `QB-${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const user = getUser(req);
  const paymentMethod = b.payment_method === 'card' ? 'card' : 'cash';
  const paymentStatus = paymentMethod === 'card' ? 'pending' : 'none';

  db.exec('BEGIN');
  try {
    const info = db.prepare(
      `INSERT INTO orders (number, customer_name, phone, email, address, delivery, comment, total,
                           user_id, payment_method, payment_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(number, name, phone, String(b.email || '').trim(), String(b.address || '').trim(),
          delivery, String(b.comment || '').trim().slice(0, 2000), total,
          user ? user.id : null, paymentMethod, paymentStatus);

    const orderId = Number(info.lastInsertRowid);
    const insItem = db.prepare(
      'INSERT INTO order_items (order_id, product_id, seller_id, title, price, qty) VALUES (?, ?, ?, ?, ?, ?)');
    const decStock = db.prepare('UPDATE products SET stock = MAX(stock - ?, 0) WHERE id = ?');
    for (const x of clean) {
      insItem.run(orderId, x.product.id, x.product.seller_id, x.product.title, x.product.price, x.qty);
      decStock.run(x.qty, x.product.id);
    }
    db.exec('COMMIT');
    res.json({ ok: true, number, total, payment_method: paymentMethod });
  } catch (e) {
    db.exec('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'Не удалось оформить заказ' });
  }
});

// моковая оплата: имитируем платёжный шлюз (тестовый режим)
router.post('/pay/:number', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE number = ?').get(String(req.params.number));
  if (!order) return res.status(404).json({ error: 'Заказ не найден' });
  if (order.payment_method !== 'card') return res.status(400).json({ error: 'Заказ не требует онлайн-оплаты' });
  if (order.payment_status === 'paid') return res.json({ ok: true, already: true });

  const digits = String((req.body || {}).card_number || '').replace(/\D/g, '');
  if (digits.length !== 16) return res.status(400).json({ error: 'Введите 16 цифр номера карты' });

  db.prepare(`UPDATE orders SET payment_status = 'paid', paid_at = datetime('now') WHERE id = ?`).run(order.id);
  res.json({ ok: true, number: order.number });
});

// ---------- отзывы ----------
router.get('/reviews/:productId', (req, res) => {
  const productId = Number(req.params.productId);
  const items = db.prepare(
    `SELECT r.id, r.rating, r.text, r.created_at, u.name AS user_name
     FROM reviews r JOIN users u ON u.id = r.user_id
     WHERE r.product_id = ? ORDER BY r.id DESC`).all(productId);
  const agg = db.prepare('SELECT AVG(rating) AS avg, COUNT(*) AS cnt FROM reviews WHERE product_id = ?').get(productId);
  res.json({ items, avg: agg.avg ? Math.round(agg.avg * 10) / 10 : null, count: agg.cnt });
});

router.post('/reviews', requireUser, (req, res) => {
  const b = req.body || {};
  const productId = Number(b.product_id);
  const rating = Math.min(Math.max(parseInt(b.rating) || 0, 1), 5);
  const text = String(b.text || '').trim().slice(0, 2000);

  const product = db.prepare('SELECT id FROM products WHERE id = ? AND active = 1').get(productId);
  if (!product) return res.status(404).json({ error: 'Товар не найден' });
  if (!b.rating) return res.status(400).json({ error: 'Поставьте оценку' });

  db.prepare(
    `INSERT INTO reviews (product_id, user_id, rating, text) VALUES (?, ?, ?, ?)
     ON CONFLICT(product_id, user_id) DO UPDATE SET rating = excluded.rating,
       text = excluded.text, created_at = datetime('now')`
  ).run(productId, req.user.id, rating, text);
  res.json({ ok: true });
});

module.exports = router;
