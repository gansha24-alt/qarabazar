// Qara Bazar — API кабинета продавца (мастера/бренда)
const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const multer = require('multer');
const { db, uniqueSlug } = require('./db');
const { requireUser } = require('./user-auth');

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

router.use(requireUser);

function getSeller(userId) {
  return db.prepare('SELECT * FROM sellers WHERE user_id = ?').get(userId);
}

// Регистрация продавца (привязка к текущему пользователю)
router.post('/register', (req, res) => {
  const existing = getSeller(req.user.id);
  if (existing) return res.status(400).json({ error: 'Вы уже зарегистрированы как продавец' });

  const b = req.body || {};
  const name = String(b.name || '').trim();
  const kind = ['master', 'brand', 'studio'].includes(b.kind) ? b.kind : 'master';
  if (!name) return res.status(400).json({ error: 'Укажите название' });

  const info = db.prepare(
    `INSERT INTO sellers (user_id, name, slug, kind) VALUES (?, ?, ?, ?)`
  ).run(req.user.id, name, uniqueSlug('sellers', name), kind);
  
  res.json({ ok: true, id: Number(info.lastInsertRowid) });
});

// Проверка наличия профиля продавца у пользователя (middleware)
function requireSeller(req, res, next) {
  const seller = getSeller(req.user.id);
  if (!seller) return res.status(403).json({ error: 'Доступно только продавцам' });
  req.seller = seller;
  next();
}

// Загрузка изображений для товаров и профиля
router.post('/upload', requireSeller, upload.array('images', 8), (req, res) => {
  const files = (req.files || []).map(f => `/uploads/${f.filename}`);
  res.json({ files });
});

// Получить профиль продавца
router.get('/profile', requireSeller, (req, res) => {
  res.json({ seller: req.seller });
});

// Обновить профиль продавца
router.put('/profile', requireSeller, (req, res) => {
  const b = req.body || {};
  const name = String(b.name || req.seller.name).trim();
  const kind = ['master', 'brand', 'studio'].includes(b.kind) ? b.kind : req.seller.kind;
  const location = String(b.location ?? req.seller.location ?? '').trim();
  const bio = String(b.bio ?? req.seller.bio ?? '').trim();
  const avatar = String(b.avatar ?? req.seller.avatar ?? '');
  const cover = String(b.cover ?? req.seller.cover ?? '');
  const instagram = String(b.instagram ?? req.seller.instagram ?? '').trim().replace(/^@/, '');
  const website = String(b.website ?? req.seller.website ?? '').trim();

  if (!name) return res.status(400).json({ error: 'Укажите название' });

  db.prepare(
    `UPDATE sellers SET name = ?, kind = ?, location = ?, bio = ?, avatar = ?, cover = ?,
     instagram = ?, website = ? WHERE id = ?`
  ).run(name, kind, location, bio, avatar, cover, instagram, website, req.seller.id);
  
  res.json({ ok: true });
});

// Получить товары продавца
router.get('/products', requireSeller, (req, res) => {
  const rows = db.prepare(`
    SELECT p.*, c.name AS category_name
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.seller_id = ?
    ORDER BY p.id DESC`).all(req.seller.id);
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
    images: JSON.stringify(images),
    stock: Math.max(parseInt(body.stock) || 0, 0),
    active: body.active === undefined ? (existing.active ?? 1) : (body.active ? 1 : 0)
  };
}

// Создать товар
router.post('/products', requireSeller, (req, res) => {
  const p = productPayload(req.body);
  if (!p.title) return res.status(400).json({ error: 'Укажите название товара' });
  if (p.price <= 0) return res.status(400).json({ error: 'Укажите цену' });
  
  const info = db.prepare(
    `INSERT INTO products (title, slug, description, materials, price, old_price,
       category_id, seller_id, images, stock, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(p.title, uniqueSlug('products', p.title), p.description, p.materials, p.price, p.old_price,
        p.category_id, req.seller.id, p.images, p.stock, p.active);
  res.json({ ok: true, id: Number(info.lastInsertRowid) });
});

// Обновить товар
router.put('/products/:id', requireSeller, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM products WHERE id = ? AND seller_id = ?').get(id, req.seller.id);
  if (!existing) return res.status(404).json({ error: 'Товар не найден' });
  
  const p = productPayload(req.body, existing);
  if (!p.title) return res.status(400).json({ error: 'Укажите название товара' });
  
  db.prepare(
    `UPDATE products SET title = ?, description = ?, materials = ?, price = ?, old_price = ?,
     category_id = ?, images = ?, stock = ?, active = ? WHERE id = ?`
  ).run(p.title, p.description, p.materials, p.price, p.old_price, p.category_id,
        p.images, p.stock, p.active, id);
  res.json({ ok: true });
});

// Удалить товар
router.delete('/products/:id', requireSeller, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT images FROM products WHERE id = ? AND seller_id = ?').get(id, req.seller.id);
  if (!existing) return res.status(404).json({ error: 'Товар не найден' });
  
  if (existing) {
    for (const img of JSON.parse(existing.images || '[]')) {
      const file = path.join(UPLOAD_DIR, path.basename(img));
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  }
  db.prepare('DELETE FROM products WHERE id = ?').run(id);
  res.json({ ok: true });
});

// Получить заказы, в которых есть товары этого продавца
router.get('/orders', requireSeller, (req, res) => {
  const items = db.prepare(`
    SELECT oi.*, o.number, o.customer_name, o.phone, o.email, o.address, o.delivery, 
           o.comment, o.status, o.payment_status, o.created_at
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE oi.seller_id = ?
    ORDER BY oi.order_id DESC
  `).all(req.seller.id);
  
  const ordersMap = new Map();
  for (const item of items) {
    if (!ordersMap.has(item.order_id)) {
      ordersMap.set(item.order_id, {
        id: item.order_id,
        number: item.number,
        customer_name: item.customer_name,
        phone: item.phone,
        email: item.email,
        address: item.address,
        delivery: item.delivery,
        comment: item.comment,
        status: item.status,
        payment_status: item.payment_status,
        created_at: item.created_at,
        seller_total: 0,
        items: []
      });
    }
    const order = ordersMap.get(item.order_id);
    order.items.push({
      id: item.id,
      product_id: item.product_id,
      title: item.title,
      price: item.price,
      qty: item.qty
    });
    order.seller_total += (item.price * item.qty);
  }
  
  res.json({ items: Array.from(ordersMap.values()) });
});

// Получить категории (для формы создания товара)
router.get('/categories', (req, res) => {
  res.json({ items: db.prepare('SELECT * FROM categories ORDER BY sort, id').all() });
});

module.exports = router;
module.exports.getSeller = getSeller;
