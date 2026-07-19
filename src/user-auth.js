// Qara Bazar — аккаунты покупателей: регистрация, вход, профиль
const express = require('express');
const crypto = require('node:crypto');
const { db, hashPassword, verifyPassword } = require('./db');

const router = express.Router();
const SESSION_DAYS = 30;

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare(`INSERT INTO user_sessions (token, user_id, expires_at)
              VALUES (?, ?, datetime('now', '+${SESSION_DAYS} days'))`).run(token, userId);
  return token;
}

function setSessionCookie(res, token) {
  res.cookie('qb_user', token, {
    httpOnly: true, sameSite: 'lax', maxAge: SESSION_DAYS * 24 * 3600 * 1000
  });
}

// достаёт пользователя из cookie (для страниц и API)
function getUser(req) {
  const token = req.cookies ? req.cookies.qb_user : null;
  if (!token) return null;
  const row = db.prepare(
    `SELECT u.id, u.name, u.email, u.phone, u.created_at
     FROM user_sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at >= datetime('now')`).get(token);
  return row || null;
}

function requireUser(req, res, next) {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: 'Войдите в аккаунт' });
  req.user = user;
  next();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/register', (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim();
  const email = String(b.email || '').trim().toLowerCase();
  const phone = String(b.phone || '').trim();
  const password = String(b.password || '');

  if (name.length < 2) return res.status(400).json({ error: 'Укажите имя' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Некорректный email' });
  if (password.length < 6) return res.status(400).json({ error: 'Пароль — минимум 6 символов' });
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
    return res.status(400).json({ error: 'Этот email уже зарегистрирован' });
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const info = db.prepare('INSERT INTO users (name, email, phone, pass_hash, salt) VALUES (?, ?, ?, ?, ?)')
    .run(name, email, phone, hashPassword(password, salt), salt);
  setSessionCookie(res, createSession(Number(info.lastInsertRowid)));
  res.json({ ok: true, user: { name, email } });
});

router.post('/login', (req, res) => {
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  const password = String((req.body || {}).password || '');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !verifyPassword(password, user.salt, user.pass_hash)) {
    return res.status(401).json({ error: 'Неверный email или пароль' });
  }
  setSessionCookie(res, createSession(user.id));
  res.json({ ok: true, user: { name: user.name, email: user.email } });
});

router.post('/logout', (req, res) => {
  const token = req.cookies ? req.cookies.qb_user : null;
  if (token) db.prepare('DELETE FROM user_sessions WHERE token = ?').run(token);
  res.clearCookie('qb_user');
  res.json({ ok: true });
});

// 200 и user:null без сессии — чтобы не сыпать 401 в консоль
router.get('/me', (req, res) => {
  db.prepare(`DELETE FROM user_sessions WHERE expires_at < datetime('now')`).run();
  res.json({ user: getUser(req) });
});

router.put('/profile', requireUser, (req, res) => {
  const name = String((req.body || {}).name || '').trim();
  const phone = String((req.body || {}).phone || '').trim();
  if (name.length < 2) return res.status(400).json({ error: 'Укажите имя' });
  db.prepare('UPDATE users SET name = ?, phone = ? WHERE id = ?').run(name, phone, req.user.id);
  res.json({ ok: true });
});

router.get('/orders', requireUser, (req, res) => {
  const orders = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC').all(req.user.id);
  const itemsStmt = db.prepare('SELECT * FROM order_items WHERE order_id = ?');
  res.json({ items: orders.map(o => ({ ...o, items: itemsStmt.all(o.id) })) });
});

module.exports = router;
module.exports.getUser = getUser;
module.exports.requireUser = requireUser;
