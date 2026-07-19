// Qara Bazar — сервер
const express = require('express');
const path = require('node:path');

const apiRouter = require('./src/api');
const adminRouter = require('./src/admin-api');
const sellerApiRouter = require('./src/seller-api');
const userAuthRouter = require('./src/user-auth');
const pagesRouter = require('./src/pages');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// мини-парсер cookie (без внешней зависимости)
app.use((req, res, next) => {
  req.cookies = {};
  const raw = req.headers.cookie;
  if (raw) {
    for (const part of raw.split(';')) {
      const idx = part.indexOf('=');
      if (idx > -1) req.cookies[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  next();
});

// Middleware для выбора языка
app.use((req, res, next) => {
  if (req.query.lang && ['ru', 'en'].includes(req.query.lang)) {
    res.cookie('lang', req.query.lang, { maxAge: 31536000000, httpOnly: false });
    req.lang = req.query.lang;
  } else {
    req.lang = req.cookies.lang === 'en' ? 'en' : 'ru';
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public'), { index: false, redirect: false }));

app.use('/api/auth', userAuthRouter);
app.use('/api/seller', sellerApiRouter);
app.use('/api', apiRouter);
app.use('/api/admin', adminRouter);

// админ-панель (SPA)
app.get(['/admin', '/admin/*'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

app.use('/', pagesRouter);

app.use((req, res) => res.status(404).render('404', pagesRouter.pageContext(req, { title: 'Страница не найдена' })));

app.listen(PORT, () => {
  console.log('');
  console.log('  ◆ QARA BAZAR');
  console.log(`  ▸ Витрина:  http://localhost:${PORT}`);
  console.log(`  ▸ Админка:  http://localhost:${PORT}/admin`);
  console.log('');
});
