// Qara Bazar — база данных (встроенный node:sqlite, Node >= 22.5)
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'qarabazar.db'));
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// регистронезависимый поиск для кириллицы (LIKE в SQLite знает только ASCII)
db.function('qb_contains', { deterministic: true }, (haystack, needle) => {
  if (!haystack || !needle) return 0;
  return String(haystack).toLowerCase().includes(String(needle).toLowerCase()) ? 1 : 0;
});

db.exec(`
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  login TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  emblem TEXT DEFAULT '',           -- ключ орнамента-иконки
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sellers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'master',   -- master | brand | studio
  location TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  avatar TEXT DEFAULT '',
  cover TEXT DEFAULT '',
  instagram TEXT DEFAULT '',
  website TEXT DEFAULT '',
  featured INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  materials TEXT DEFAULT '',
  price REAL NOT NULL DEFAULT 0,
  old_price REAL,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  seller_id INTEGER REFERENCES sellers(id) ON DELETE SET NULL,
  images TEXT NOT NULL DEFAULT '[]',     -- JSON-массив путей
  stock INTEGER NOT NULL DEFAULT 1,
  featured INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT DEFAULT '',
  address TEXT DEFAULT '',
  delivery TEXT NOT NULL DEFAULT 'pickup',  -- pickup | courier | international
  comment TEXT DEFAULT '',
  total REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new',       -- new | processing | shipped | done | cancelled
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT DEFAULT '',
  pass_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL DEFAULT 5,
  text TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(product_id, user_id)
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  seller_id INTEGER REFERENCES sellers(id) ON DELETE SET NULL,
  title TEXT NOT NULL,          -- снимок на момент заказа
  price REAL NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_seller ON products(seller_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);
`);

// миграции для существующих баз: недостающие колонки
function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some(c => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}
ensureColumn('orders', 'user_id', 'user_id INTEGER REFERENCES users(id) ON DELETE SET NULL');
ensureColumn('orders', 'payment_method', `payment_method TEXT NOT NULL DEFAULT 'cash'`);   // cash | card
ensureColumn('orders', 'payment_status', `payment_status TEXT NOT NULL DEFAULT 'none'`);   // none | pending | paid
ensureColumn('orders', 'paid_at', 'paid_at TEXT');
ensureColumn('sellers', 'user_id', 'user_id INTEGER REFERENCES users(id) ON DELETE SET NULL');
ensureColumn('order_items', 'seller_id', 'seller_id INTEGER REFERENCES sellers(id) ON DELETE SET NULL');

db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_sellers_user ON sellers(user_id) WHERE user_id IS NOT NULL;');

// ---------- утилиты ----------
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password, salt, hash) {
  const candidate = Buffer.from(hashPassword(password, salt), 'hex');
  const stored = Buffer.from(hash, 'hex');
  return candidate.length === stored.length && crypto.timingSafeEqual(candidate, stored);
}

const TRANSLIT = {
  а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',
  н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',
  ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',ә:'a',ғ:'g',қ:'q',ң:'n',ө:'o',ұ:'u',ү:'u',һ:'h',і:'i'
};

function slugify(text) {
  const base = String(text).toLowerCase().trim()
    .split('').map(ch => TRANSLIT[ch] !== undefined ? TRANSLIT[ch] : ch).join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return base || 'item';
}

function uniqueSlug(table, text, excludeId = null) {
  const base = slugify(text);
  let slug = base;
  let i = 2;
  const sql = excludeId
    ? `SELECT id FROM ${table} WHERE slug = ? AND id != ?`
    : `SELECT id FROM ${table} WHERE slug = ?`;
  while (true) {
    const row = excludeId ? db.prepare(sql).get(slug, excludeId) : db.prepare(sql).get(slug);
    if (!row) return slug;
    slug = `${base}-${i++}`;
  }
}

function getSetting(key, fallback = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function setSetting(key, value) {
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, String(value));
}

function getAllSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

// ---------- сид ----------
function seed() {
  const adminCount = db.prepare('SELECT COUNT(*) AS c FROM admins').get().c;
  if (adminCount === 0) {
    const salt = crypto.randomBytes(16).toString('hex');
    db.prepare('INSERT INTO admins (login, pass_hash, salt) VALUES (?, ?, ?)')
      .run('admin', hashPassword('qara2026', salt), salt);
    console.log('▸ Создан администратор — логин: admin, пароль: qara2026 (смените в админке → Настройки)');
  }

  const catCount = db.prepare('SELECT COUNT(*) AS c FROM categories').get().c;
  if (catCount === 0) {
    const cats = [
      ['Керамика', 'keramika', 'vessel'],
      ['Текстиль и войлок', 'tekstil', 'weave'],
      ['Украшения', 'ukrasheniya', 'star'],
      ['Живопись и графика', 'zhivopis', 'sun'],
      ['Декор для дома', 'dekor', 'yurt'],
      ['Одежда', 'odezhda', 'horn'],
      ['Аксессуары и кожа', 'aksessuary', 'shield'],
      ['Авторские проекты', 'proekty', 'compass']
    ];
    const ins = db.prepare('INSERT INTO categories (name, slug, emblem, sort) VALUES (?, ?, ?, ?)');
    cats.forEach((c, i) => ins.run(c[0], c[1], c[2], i));
  }

  const defaults = {
    site_tagline: 'От локального творчества — к международным проектам',
    currency: '₸',
    contact_email: 'hello@qarabazar.example',
    contact_phone: '+7 700 000 00 00',
    contact_instagram: 'qarabazar'
  };
  for (const [k, v] of Object.entries(defaults)) {
    if (getSetting(k, null) === null) setSetting(k, v);
  }
}

seed();

module.exports = { db, hashPassword, verifyPassword, slugify, uniqueSlug, getSetting, setSetting, getAllSettings };
