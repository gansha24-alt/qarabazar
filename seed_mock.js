const { db, uniqueSlug } = require('./src/db');
const crypto = require('node:crypto');

// Helpers
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

// 1. Users
const users = [
  { name: 'Алина', email: 'alina@example.com', phone: '+7 777 111 2233' },
  { name: 'Бекзат', email: 'bekzat@example.com', phone: '+7 701 555 4433' },
  { name: 'Динара', email: 'dinara@example.com', phone: '+7 707 999 8877' }
];

const userIds = [];
for (const u of users) {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(u.email);
  if (existing) {
    userIds.push(existing.id);
  } else {
    const salt = crypto.randomBytes(16).toString('hex');
    const info = db.prepare('INSERT INTO users (name, email, phone, pass_hash, salt) VALUES (?, ?, ?, ?, ?)')
      .run(u.name, u.email, u.phone, hashPassword('password123', salt), salt);
    userIds.push(info.lastInsertRowid);
  }
}

// 2. Sellers (link to users)
const sellers = [
  { user_id: userIds[0], name: 'Керамика от Алины', kind: 'master', location: 'Алматы', bio: 'Создаю уникальную посуду.' },
  { user_id: userIds[1], name: 'Ethno Style', kind: 'brand', location: 'Астана', bio: 'Современная одежда с национальным колоритом.' },
];

const sellerIds = [];
for (const s of sellers) {
  const existing = db.prepare('SELECT id FROM sellers WHERE name = ?').get(s.name);
  if (existing) {
    sellerIds.push(existing.id);
  } else {
    const info = db.prepare(
      `INSERT INTO sellers (user_id, name, slug, kind, location, bio) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(s.user_id, s.name, uniqueSlug('sellers', s.name), s.kind, s.location, s.bio);
    sellerIds.push(info.lastInsertRowid);
  }
}

// 3. Products
const categories = db.prepare('SELECT id, slug FROM categories').all();
const categoryMap = {};
categories.forEach(c => categoryMap[c.slug] = c.id);

const products = [
  { title: 'Пиала "Тюльпан"', price: 5000, stock: 10, category_id: categoryMap['keramika'], seller_id: sellerIds[0], description: 'Керамическая пиала ручной работы.' },
  { title: 'Ваза "Горы"', price: 12000, stock: 3, category_id: categoryMap['keramika'], seller_id: sellerIds[0], description: 'Ваза с фактурой гор.' },
  { title: 'Худи "Qazaq"', price: 18000, stock: 15, category_id: categoryMap['odezhda'], seller_id: sellerIds[1], description: 'Теплое худи с вышивкой.' },
  { title: 'Сумка из войлока', price: 15000, stock: 5, category_id: categoryMap['tekstil'], seller_id: sellerIds[1], description: 'Экологичная сумка из 100% шерсти.' },
];

const productIds = [];
for (const p of products) {
  const existing = db.prepare('SELECT id FROM products WHERE title = ?').get(p.title);
  if (existing) {
    productIds.push(existing.id);
  } else {
    const info = db.prepare(
      `INSERT INTO products (title, slug, price, stock, category_id, seller_id, description) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(p.title, uniqueSlug('products', p.title), p.price, p.stock, p.category_id, p.seller_id, p.description);
    productIds.push(info.lastInsertRowid);
  }
}

// 4. Orders
const orders = [
  { customer_name: 'Тимур', phone: '+7 705 123 4567', total: 5000, status: 'new', items: [{ product_id: productIds[0], seller_id: sellerIds[0], title: 'Пиала "Тюльпан"', price: 5000, qty: 1 }] },
  { customer_name: 'Сабина', phone: '+7 702 765 4321', total: 33000, status: 'processing', items: [
    { product_id: productIds[2], seller_id: sellerIds[1], title: 'Худи "Qazaq"', price: 18000, qty: 1 },
    { product_id: productIds[3], seller_id: sellerIds[1], title: 'Сумка из войлока', price: 15000, qty: 1 }
  ]}
];

for (const o of orders) {
  const info = db.prepare(
    `INSERT INTO orders (number, customer_name, phone, total, status) VALUES (?, ?, ?, ?, ?)`
  ).run(`QB-TEST-${crypto.randomBytes(3).toString('hex').toUpperCase()}`, o.customer_name, o.phone, o.total, o.status);
  
  const orderId = info.lastInsertRowid;
  const insItem = db.prepare('INSERT INTO order_items (order_id, product_id, seller_id, title, price, qty) VALUES (?, ?, ?, ?, ?, ?)');
  for (const i of o.items) {
    insItem.run(orderId, i.product_id, i.seller_id, i.title, i.price, i.qty);
  }
}

console.log('Mock data seeded successfully.');
