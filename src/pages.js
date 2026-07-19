// Qara Bazar — серверный рендер публичных страниц
const express = require('express');
const { db, getAllSettings } = require('./db');
const { getUser } = require('./user-auth');
const { getSeller } = require('./seller-api');
const { getTranslator } = require('./locales');

const router = express.Router();

function ctx(req, extra = {}) {
  const settings = getAllSettings();
  const categories = db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.active = 1) AS product_count
    FROM categories c ORDER BY c.sort, c.id`).all();
  const lang = req ? req.lang : 'ru';
  const t = getTranslator(lang);
  const fmt = n => new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'ru-RU', { maximumFractionDigits: 2 }).format(Number(n) || 0);
  const user = req ? getUser(req) : null;
  return { settings, categories, fmt, user, t, lang, ...extra };
}

function parseProducts(rows) {
  return rows.map(p => ({ ...p, images: JSON.parse(p.images || '[]') }));
}

const PRODUCT_SELECT = `
  SELECT p.*, c.name AS category_name, c.slug AS category_slug,
         s.name AS seller_name, s.slug AS seller_slug, s.location AS seller_location
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN sellers s ON s.id = p.seller_id
`;

router.get('/', (req, res) => {
  const latest = parseProducts(db.prepare(
    `${PRODUCT_SELECT} WHERE p.active = 1 ORDER BY p.created_at DESC, p.id DESC LIMIT 8`).all());
  const featured = parseProducts(db.prepare(
    `${PRODUCT_SELECT} WHERE p.active = 1 AND p.featured = 1 ORDER BY p.created_at DESC LIMIT 4`).all());
  const sellers = db.prepare(`
    SELECT s.*, (SELECT COUNT(*) FROM products p WHERE p.seller_id = s.id AND p.active = 1) AS product_count
    FROM sellers s WHERE s.active = 1 ORDER BY s.featured DESC, s.created_at DESC LIMIT 4`).all();
  const stats = {
    sellers: db.prepare('SELECT COUNT(*) AS c FROM sellers WHERE active = 1').get().c,
    products: db.prepare('SELECT COUNT(*) AS c FROM products WHERE active = 1').get().c,
    cities: db.prepare(`SELECT COUNT(DISTINCT location) AS c FROM sellers WHERE active = 1 AND location != ''`).get().c
  };
  res.render('home', ctx(req, { title: null, latest, featured, sellers, stats }));
});

router.get('/catalog', (req, res) => {
  res.render('catalog', ctx(req, {
    title: 'Каталог',
    activeCategory: req.query.category || '',
    initialQuery: req.query.q || ''
  }));
});

router.get('/product/:slug', (req, res) => {
  const p = db.prepare(`${PRODUCT_SELECT} WHERE p.slug = ? AND p.active = 1`).get(req.params.slug);
  if (!p) return res.status(404).render('404', ctx(req, { title: 'Товар не найден' }));
  const product = { ...p, images: JSON.parse(p.images || '[]') };
  const related = parseProducts(db.prepare(
    `${PRODUCT_SELECT} WHERE p.active = 1 AND p.id != ? AND (p.category_id = ? OR p.seller_id = ?)
     ORDER BY p.created_at DESC LIMIT 4`).all(p.id, p.category_id || -1, p.seller_id || -1));
  const reviews = db.prepare(
    `SELECT r.id, r.rating, r.text, r.created_at, r.user_id, u.name AS user_name
     FROM reviews r JOIN users u ON u.id = r.user_id
     WHERE r.product_id = ? ORDER BY r.id DESC`).all(p.id);
  const ratingAgg = db.prepare('SELECT AVG(rating) AS avg, COUNT(*) AS cnt FROM reviews WHERE product_id = ?').get(p.id);
  res.render('product', ctx(req, {
    title: product.title, product, related, reviews,
    ratingAvg: ratingAgg.avg ? Math.round(ratingAgg.avg * 10) / 10 : null,
    ratingCount: ratingAgg.cnt
  }));
});

router.get('/sellers', (req, res) => {
  const sellers = db.prepare(`
    SELECT s.*, (SELECT COUNT(*) FROM products p WHERE p.seller_id = s.id AND p.active = 1) AS product_count
    FROM sellers s WHERE s.active = 1 ORDER BY s.featured DESC, s.created_at DESC`).all();
  res.render('sellers', ctx(req, { title: 'Мастера и бренды', sellers }));
});

router.get('/seller/:slug', (req, res) => {
  const seller = db.prepare('SELECT * FROM sellers WHERE slug = ? AND active = 1').get(req.params.slug);
  if (!seller) return res.status(404).render('404', ctx(req, { title: 'Мастер не найден' }));
  const products = parseProducts(db.prepare(
    `${PRODUCT_SELECT} WHERE p.active = 1 AND p.seller_id = ? ORDER BY p.created_at DESC`).all(seller.id));
  res.render('seller', ctx(req, { title: seller.name, seller, products }));
});

router.get('/cart', (req, res) => res.render('cart', ctx(req, { title: 'Корзина' })));

router.get('/favorites', (req, res) => res.render('favorites', ctx(req, { title: 'Избранное' })));

// ---------- аккаунт ----------
router.get('/login', (req, res) => {
  const user = getUser(req);
  if (user) return res.redirect('/account');
  res.render('login', ctx(req, { title: 'Вход', next: String(req.query.next || '') }));
});

router.get('/account', (req, res) => {
  const user = getUser(req);
  if (!user) return res.redirect('/login?next=/account');
  const orders = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC').all(user.id);
  const itemsStmt = db.prepare('SELECT * FROM order_items WHERE order_id = ?');
  const seller = getSeller(user.id);
  res.render('account', ctx(req, {
    title: 'Личный кабинет',
    orders: orders.map(o => ({ ...o, items: itemsStmt.all(o.id) })),
    seller
  }));
});

router.get('/seller-panel', (req, res) => {
  const user = getUser(req);
  if (!user) return res.redirect('/login?next=/seller-panel');
  const seller = getSeller(user.id);
  res.render('seller-panel', ctx(req, {
    title: 'Панель продавца',
    seller
  }));
});

router.get('/about', (req, res) => {
  const stats = {
    sellers: db.prepare('SELECT COUNT(*) AS c FROM sellers WHERE active = 1').get().c,
    products: db.prepare('SELECT COUNT(*) AS c FROM products WHERE active = 1').get().c,
    cities: db.prepare(`SELECT COUNT(DISTINCT location) AS c FROM sellers WHERE active = 1 AND location != ''`).get().c
  };
  res.render('about', ctx(req, { title: 'О проекте', stats }));
});

module.exports = router;
module.exports.pageContext = ctx;
