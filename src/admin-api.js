// Qara Bazar — API админ-панели
const express = require('express');
const multer = require('multer');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { db, hashPassword, verifyPassword, uniqueSlug, setSetting, getAllSettings } = require('./db');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024, files: 8 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, ALLOWED_EXT.has(ext));
  }
});

// ---------- сессии ----------
const SESSION_DAYS = 7;

function createSession(adminId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare(`INSERT INTO sessions (token, admin_id, expires_at)
              VALUES (?, ?, datetime('now', '+${SESSION_DAYS} days'))`).run(token, adminId);
  return token;
}

function getSessionAdmin(req) {
  const token = req.cookies ? req.cookies.qb_session : null;
  if (!token) return null;
  db.prepare(`DELETE FROM sessions WHERE expires_at < datetime('now')`).run();
  const row = db.prepare(
    `SELECT a.id, a.login FROM sessions s JOIN admins a ON a.id = s.admin_id
     WHERE s.token = ? AND s.expires_at >= datetime('now')`).get(token);
  return row || null;
}

function requireAuth(req, res, next) {
  const admin = getSessionAdmin(req);
  if (!admin) return res.status(401).json({ error: 'unauthorized' });
  req.admin = admin;
  next();
}

router.post('/login', (req, res) => {
  const { login, password } = req.body || {};
  const admin = db.prepare('SELECT * FROM admins WHERE login = ?').get(String(login || ''));
  if (!admin || !verifyPassword(String(password || ''), admin.salt, admin.pass_hash)) {
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }
  const token = createSession(admin.id);
  res.cookie('qb_session', token, {
    httpOnly: true, sameSite: 'lax', maxAge: SESSION_DAYS * 24 * 3600 * 1000
  });
  res.json({ ok: true, login: admin.login });
});

router.post('/logout', (req, res) => {
  const token = req.cookies ? req.cookies.qb_session : null;
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.clearCookie('qb_session');
  res.json({ ok: true });
});

// 200 и login:null без сессии — чтобы не сыпать 401 в консоль при открытии
router.get('/me', (req, res) => {
  const admin = getSessionAdmin(req);
  res.json({ login: admin ? admin.login : null });
});

// всё ниже — только с авторизацией
router.use(requireAuth);

// ---------- дашборд ----------
router.get('/stats', (req, res) => {
  const q = (sql) => db.prepare(sql).get();
  res.json({
    products: q('SELECT COUNT(*) AS c FROM products').c,
    products_active: q('SELECT COUNT(*) AS c FROM products WHERE active = 1').c,
    sellers: q('SELECT COUNT(*) AS c FROM sellers').c,
    categories: q('SELECT COUNT(*) AS c FROM categories').c,
    orders: q('SELECT COUNT(*) AS c FROM orders').c,
    orders_new: q(`SELECT COUNT(*) AS c FROM orders WHERE status = 'new'`).c,
    revenue: q(`SELECT COALESCE(SUM(total), 0) AS c FROM orders WHERE status != 'cancelled'`).c,
    paid: q(`SELECT COALESCE(SUM(total), 0) AS c FROM orders WHERE payment_status = 'paid'`).c,
    users: q('SELECT COUNT(*) AS c FROM users').c,
    reviews: q('SELECT COUNT(*) AS c FROM reviews').c,
    recent_orders: db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 5').all()
  });
});

// ---------- загрузка изображений ----------
router.post('/upload', upload.array('images', 8), (req, res) => {
  const files = (req.files || []).map(f => `/uploads/${f.filename}`);
  res.json({ files });
});

// ---------- категории ----------
router.get('/categories', (req, res) => {
  res.json({ items: db.prepare('SELECT * FROM categories ORDER BY sort, id').all() });
});

router.post('/categories', (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Укажите название' });
  const info = db.prepare('INSERT INTO categories (name, slug, emblem, sort) VALUES (?, ?, ?, ?)')
    .run(name, uniqueSlug('categories', name), String(req.body.emblem || 'star'), parseInt(req.body.sort) || 0);
  res.json({ ok: true, id: Number(info.lastInsertRowid) });
});

router.put('/categories/:id', (req, res) => {
  const id = Number(req.params.id);
  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  if (!cat) return res.status(404).json({ error: 'not_found' });
  const name = String(req.body.name || cat.name).trim();
  db.prepare('UPDATE categories SET name = ?, emblem = ?, sort = ? WHERE id = ?')
    .run(name, String(req.body.emblem ?? cat.emblem), parseInt(req.body.sort) || 0, id);
  res.json({ ok: true });
});

router.delete('/categories/:id', (req, res) => {
  db.prepare('DELETE FROM categories WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ---------- мастера / бренды ----------
router.get('/sellers', (req, res) => {
  res.json({
    items: db.prepare(`
      SELECT s.*, 
             (SELECT COUNT(*) FROM products p WHERE p.seller_id = s.id) AS product_count,
             (SELECT email FROM users u WHERE u.id = s.user_id) AS user_email
      FROM sellers s ORDER BY s.id DESC`).all()
  });
});

function sellerPayload(body, existing = {}) {
  return {
    user_id: body.user_id ? Number(body.user_id) : (existing.user_id || null),
    name: String(body.name ?? existing.name ?? '').trim(),
    kind: ['master', 'brand', 'studio'].includes(body.kind) ? body.kind : (existing.kind || 'master'),
    location: String(body.location ?? existing.location ?? '').trim(),
    bio: String(body.bio ?? existing.bio ?? '').trim(),
    avatar: String(body.avatar ?? existing.avatar ?? ''),
    cover: String(body.cover ?? existing.cover ?? ''),
    instagram: String(body.instagram ?? existing.instagram ?? '').trim().replace(/^@/, ''),
    website: String(body.website ?? existing.website ?? '').trim(),
    featured: body.featured ? 1 : 0,
    active: body.active === undefined ? (existing.active ?? 1) : (body.active ? 1 : 0)
  };
}

router.post('/sellers', (req, res) => {
  const s = sellerPayload(req.body);
  if (!s.name) return res.status(400).json({ error: 'Укажите имя мастера или бренда' });
  const info = db.prepare(
    `INSERT INTO sellers (user_id, name, slug, kind, location, bio, avatar, cover, instagram, website, featured, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(s.user_id, s.name, uniqueSlug('sellers', s.name), s.kind, s.location, s.bio, s.avatar, s.cover,
        s.instagram, s.website, s.featured, s.active);
  res.json({ ok: true, id: Number(info.lastInsertRowid) });
});

router.put('/sellers/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM sellers WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const s = sellerPayload(req.body, existing);
  db.prepare(
    `UPDATE sellers SET user_id = ?, name = ?, kind = ?, location = ?, bio = ?, avatar = ?, cover = ?,
     instagram = ?, website = ?, featured = ?, active = ? WHERE id = ?`
  ).run(s.user_id, s.name, s.kind, s.location, s.bio, s.avatar, s.cover, s.instagram, s.website,
        s.featured, s.active, id);
  res.json({ ok: true });
});

router.delete('/sellers/:id', (req, res) => {
  db.prepare('DELETE FROM sellers WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ---------- товары ----------
router.get('/products', (req, res) => {
  const rows = db.prepare(`
    SELECT p.*, c.name AS category_name, s.name AS seller_name
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN sellers s ON s.id = p.seller_id
    ORDER BY p.id DESC`).all();
  res.json({ items: rows.map(p => ({ ...p, images: JSON.parse(p.images || '[]') })) });
});

function productPayload(body, existing = {}) {
  let images = existing.images ? JSON.parse(existing.images) : [];
  if (Array.isArray(body.images)) {
    images = body.images.filter(x => typeof x === 'string' && x.startsWith('/uploads/')).slice(0, 8);
  }
  return {
    title: String(body.title ?? existing.title ?? '').trim(),
    description: String(body.description ?? existing.description ?? '').trim(),
    materials: String(body.materials ?? existing.materials ?? '').trim(),
    price: Math.max(parseFloat(body.price) || 0, 0),
    old_price: body.old_price ? Math.max(parseFloat(body.old_price) || 0, 0) : null,
    category_id: body.category_id ? Number(body.category_id) : null,
    seller_id: body.seller_id ? Number(body.seller_id) : null,
    images: JSON.stringify(images),
    stock: Math.max(parseInt(body.stock) || 0, 0),
    featured: body.featured ? 1 : 0,
    active: body.active === undefined ? (existing.active ?? 1) : (body.active ? 1 : 0)
  };
}

router.post('/products', (req, res) => {
  const p = productPayload(req.body);
  if (!p.title) return res.status(400).json({ error: 'Укажите название товара' });
  if (p.price <= 0) return res.status(400).json({ error: 'Укажите цену' });
  const info = db.prepare(
    `INSERT INTO products (title, slug, description, materials, price, old_price,
       category_id, seller_id, images, stock, featured, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(p.title, uniqueSlug('products', p.title), p.description, p.materials, p.price, p.old_price,
        p.category_id, p.seller_id, p.images, p.stock, p.featured, p.active);
  res.json({ ok: true, id: Number(info.lastInsertRowid) });
});

router.put('/products/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const p = productPayload(req.body, existing);
  if (!p.title) return res.status(400).json({ error: 'Укажите название товара' });
  db.prepare(
    `UPDATE products SET title = ?, description = ?, materials = ?, price = ?, old_price = ?,
     category_id = ?, seller_id = ?, images = ?, stock = ?, featured = ?, active = ? WHERE id = ?`
  ).run(p.title, p.description, p.materials, p.price, p.old_price, p.category_id, p.seller_id,
        p.images, p.stock, p.featured, p.active, id);
  res.json({ ok: true });
});

router.delete('/products/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT images FROM products WHERE id = ?').get(id);
  if (existing) {
    for (const img of JSON.parse(existing.images || '[]')) {
      const file = path.join(UPLOAD_DIR, path.basename(img));
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  }
  db.prepare('DELETE FROM products WHERE id = ?').run(id);
  res.json({ ok: true });
});

// ---------- заказы ----------
router.get('/orders', (req, res) => {
  const where = req.query.status ? 'WHERE status = ?' : '';
  const params = req.query.status ? [req.query.status] : [];
  const orders = db.prepare(`SELECT * FROM orders ${where} ORDER BY id DESC`).all(...params);
  const itemsStmt = db.prepare('SELECT * FROM order_items WHERE order_id = ?');
  res.json({ items: orders.map(o => ({ ...o, items: itemsStmt.all(o.id) })) });
});

router.put('/orders/:id/status', (req, res) => {
  const status = String(req.body.status || '');
  if (!['new', 'processing', 'shipped', 'done', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Неизвестный статус' });
  }
  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, Number(req.params.id));
  res.json({ ok: true });
});

// ---------- клиенты ----------
router.get('/users', (req, res) => {
  const items = db.prepare(`
    SELECT u.id, u.name, u.email, u.phone, u.created_at,
           (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS order_count,
           (SELECT COALESCE(SUM(total), 0) FROM orders o WHERE o.user_id = u.id AND o.status != 'cancelled') AS order_total
    FROM users u ORDER BY u.id DESC`).all();
  res.json({ items });
});

// ---------- отзывы ----------
router.get('/reviews', (req, res) => {
  const items = db.prepare(`
    SELECT r.id, r.rating, r.text, r.created_at,
           u.name AS user_name, u.email AS user_email,
           p.title AS product_title, p.slug AS product_slug
    FROM reviews r
    JOIN users u ON u.id = r.user_id
    JOIN products p ON p.id = r.product_id
    ORDER BY r.id DESC`).all();
  res.json({ items });
});

router.delete('/reviews/:id', (req, res) => {
  db.prepare('DELETE FROM reviews WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ---------- настройки ----------
router.get('/settings', (req, res) => res.json({ settings: getAllSettings() }));

router.put('/settings', (req, res) => {
  const allowed = ['site_tagline', 'currency', 'contact_email', 'contact_phone', 'contact_instagram'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) setSetting(key, String(req.body[key]).slice(0, 500));
  }
  res.json({ ok: true });
});

router.put('/password', (req, res) => {
  const { current, next } = req.body || {};
  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.admin.id);
  if (!verifyPassword(String(current || ''), admin.salt, admin.pass_hash)) {
    return res.status(400).json({ error: 'Текущий пароль неверен' });
  }
  if (String(next || '').length < 6) {
    return res.status(400).json({ error: 'Новый пароль — минимум 6 символов' });
  }
  const salt = crypto.randomBytes(16).toString('hex');
  db.prepare('UPDATE admins SET pass_hash = ?, salt = ? WHERE id = ?')
    .run(hashPassword(String(next), salt), salt, admin.id);
  res.json({ ok: true });
});

module.exports = router;
