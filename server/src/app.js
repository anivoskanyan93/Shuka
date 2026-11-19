const path = require('path');
const fs = require('fs');
const express = require('express');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { db, UPLOADS_DIR, now } = require('./db');
const { loadUser, setSession, clearSession } = require('./auth');
const { saveImage, imageUrls, ImageError, MAX_BYTES } = require('./images');

// ---------- helpers ----------
class ApiError extends Error {
  constructor(status, code, message, extra) { super(message); this.status = status; this.code = code; this.extra = extra; }
}
const bad = (message, fields) => new ApiError(400, 'invalid_input', message, fields ? { fields } : undefined);
const notFound = (what = 'Not found') => new ApiError(404, 'not_found', what);
const conflict = (code, message, extra) => new ApiError(409, code, message, extra);

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const requireUser = (req, _res, next) => (req.user ? next() : next(new ApiError(401, 'unauthenticated', 'Please sign in')));
const requireSeller = (req, _res, next) => {
  if (!req.user) return next(new ApiError(401, 'unauthenticated', 'Please sign in'));
  if (!req.user.store_name) return next(new ApiError(403, 'not_seller', 'Become a seller first'));
  next();
};
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const intId = (v) => { const n = Number(v); if (!Number.isInteger(n) || n <= 0) throw notFound(); return n; };

const REGIONS = ['Yerevan', 'Aragatsotn', 'Ararat', 'Armavir', 'Gegharkunik', 'Kotayk', 'Lori', 'Shirak', 'Syunik', 'Tavush', 'Vayots Dzor'];
const STATUSES = ['placed', 'confirmed', 'shipped', 'delivered', 'cancelled'];
// The only allowed moves. Everything else -> 409.
const SELLER_MOVES = { placed: ['confirmed', 'cancelled'], confirmed: ['shipped', 'cancelled'], shipped: ['delivered'], delivered: [], cancelled: [] };
const BUYER_MOVES = { placed: ['cancelled'], confirmed: ['cancelled'], shipped: [], delivered: [], cancelled: [] };
const PAGE_SIZE = 12;

const phoneOk = (p) => /^\+?[0-9 ()-]{6,20}$/.test(p);
const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// ---------- prepared statements ----------
const q = {
  mainImage: db.prepare('SELECT file_path FROM product_images WHERE product_id = ? ORDER BY position LIMIT 1'),
  images: db.prepare('SELECT id, file_path, position FROM product_images WHERE product_id = ? ORDER BY position'),
  product: db.prepare(`SELECT p.*, c.name AS category_name, c.slug AS category_slug, u.store_name
    FROM products p JOIN categories c ON c.id = p.category_id JOIN users u ON u.id = p.seller_id WHERE p.id = ?`),
};

const imgOut = (base) => (base ? imageUrls(base) : null);
function productCard(p) {
  const m = q.mainImage.get(p.id);
  return {
    id: p.id, title: p.title, price_amd: p.price_amd, stock: p.stock,
    rating_avg: p.rating_avg, rating_count: p.rating_count,
    category: p.category_slug ? { name: p.category_name, slug: p.category_slug } : undefined,
    store_name: p.store_name, image: imgOut(m && m.file_path), created_at: p.created_at,
  };
}

// ---------- app ----------
const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(loadUser);

const api = express.Router();

api.get('/health', (_req, res) => res.json({ ok: true, time: now() }));

// ===== Auth =====
const publicUser = (u) => u && ({ id: u.id, email: u.email, name: u.name, phone: u.phone, store_name: u.store_name, is_seller: !!u.store_name });

api.post('/auth/register', wrap(async (req, res) => {
  const email = str(req.body.email).toLowerCase(), name = str(req.body.name), phone = str(req.body.phone);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const fields = {};
  if (!emailOk(email)) fields.email = 'Enter a valid email';
  if (password.length < 8) fields.password = 'At least 8 characters';
  if (name.length < 2 || name.length > 80) fields.name = 'Enter your name';
  if (!phoneOk(phone)) fields.phone = 'Enter a valid phone, e.g. +374 91 123456';
  if (Object.keys(fields).length) throw bad('Please fix the highlighted fields', fields);
  const hash = await bcrypt.hash(password, 10);
  try {
    const id = db.prepare('INSERT INTO users (email, password_hash, name, phone) VALUES (?,?,?,?)').run(email, hash, name, phone).lastInsertRowid;
    setSession(res, id);
    res.status(201).json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)) });
  } catch (e) {
    if (String(e.code).startsWith('SQLITE_CONSTRAINT')) throw conflict('email_taken', 'This email is already registered', { fields: { email: 'Already registered' } });
    throw e;
  }
}));

api.post('/auth/login', wrap(async (req, res) => {
  const email = str(req.body.email);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!u || !(await bcrypt.compare(password, u.password_hash))) throw new ApiError(401, 'bad_credentials', 'Wrong email or password');
  setSession(res, u.id);
  res.json({ user: publicUser(u) });
}));

api.post('/auth/logout', (req, res) => { clearSession(res); res.json({ ok: true }); });

const lastAddress = db.prepare('SELECT recipient, phone, region, city, street, apartment FROM orders WHERE buyer_id = ? ORDER BY id DESC LIMIT 1');
const cartCount = db.prepare('SELECT COALESCE(SUM(quantity),0) n FROM cart_items WHERE user_id = ?');

api.get('/me', requireUser, (req, res) => {
  res.json({ user: publicUser(req.user), last_address: lastAddress.get(req.user.id) || null, cart_count: cartCount.get(req.user.id).n });
});

api.patch('/me', requireUser, (req, res) => {
  const name = req.body.name !== undefined ? str(req.body.name) : req.user.name;
  const phone = req.body.phone !== undefined ? str(req.body.phone) : req.user.phone;
  const fields = {};
  if (name.length < 2 || name.length > 80) fields.name = 'Enter your name';
  if (!phoneOk(phone)) fields.phone = 'Enter a valid phone';
  if (Object.keys(fields).length) throw bad('Please fix the highlighted fields', fields);
  db.prepare('UPDATE users SET name = ?, phone = ? WHERE id = ?').run(name, phone, req.user.id);
  res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) });
});

// ===== Catalog =====
api.get('/categories', (_req, res) => {
  res.json({ categories: db.prepare(`SELECT c.id, c.name, c.slug, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.is_published = 1) AS product_count
    FROM categories c ORDER BY c.id`).all() });
});

api.get('/products', (req, res) => {
  const where = ['p.is_published = 1'];
  const params = [];
  const qs = str(req.query.q);
  if (qs) {
    for (const word of qs.split(/\s+/).slice(0, 6)) {
      const like = '%' + word.replace(/[%_\\]/g, (m) => '\\' + m) + '%';
      where.push("(p.title LIKE ? ESCAPE '\\' OR p.description LIKE ? ESCAPE '\\')");
      params.push(like, like);
    }
  }
  const cat = str(req.query.category);
  if (cat) { where.push('c.slug = ?'); params.push(cat); }
  const minP = parseInt(req.query.minPrice, 10), maxP = parseInt(req.query.maxPrice, 10);
  if (Number.isFinite(minP) && minP > 0) { where.push('p.price_amd >= ?'); params.push(minP); }
  if (Number.isFinite(maxP) && maxP > 0) { where.push('p.price_amd <= ?'); params.push(maxP); }
  const sorts = {
    newest: 'p.created_at DESC, p.id DESC',
    price_asc: 'p.price_amd ASC, p.id DESC',
    price_desc: 'p.price_amd DESC, p.id DESC',
    rating: 'p.rating_avg DESC, p.rating_count DESC, p.id DESC',
  };
  const sort = sorts[req.query.sort] ? req.query.sort : 'newest';
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(48, Math.max(1, parseInt(req.query.limit, 10) || PAGE_SIZE));
  const base = `FROM products p JOIN categories c ON c.id = p.category_id JOIN users u ON u.id = p.seller_id WHERE ${where.join(' AND ')}`;
  const total = db.prepare(`SELECT COUNT(*) n ${base}`).get(...params).n;
  const rows = db.prepare(`SELECT p.*, c.name AS category_name, c.slug AS category_slug, u.store_name ${base} ORDER BY ${sorts[sort]} LIMIT ? OFFSET ?`)
    .all(...params, limit, (page - 1) * limit);
  res.json({ products: rows.map(productCard), total, page, pages: Math.max(1, Math.ceil(total / limit)), sort });
});

api.get('/products/:id', (req, res) => {
  const p = q.product.get(intId(req.params.id));
  if (!p || (!p.is_published && (!req.user || req.user.id !== p.seller_id))) throw notFound('Product not found');
  res.json({
    product: {
      ...productCard(p), description: p.description, is_published: !!p.is_published, seller_id: p.seller_id,
      category: { id: p.category_id, name: p.category_name, slug: p.category_slug },
      images: q.images.all(p.id).map((i) => ({ id: i.id, ...imageUrls(i.file_path) })),
      is_own: !!(req.user && req.user.id === p.seller_id),
    },
  });
});

api.get('/products/:id/reviews', (req, res) => {
  const id = intId(req.params.id);
  res.json({ reviews: db.prepare(`SELECT r.id, r.rating, r.body, r.created_at, u.name AS buyer_name
    FROM reviews r JOIN users u ON u.id = r.buyer_id WHERE r.product_id = ? ORDER BY r.created_at DESC, r.id DESC`).all(id) });
});

// ===== Cart =====
function buildCart(userId) {
  const rows = db.prepare(`SELECT ci.product_id, ci.quantity, ci.price_when_added, p.title, p.price_amd, p.stock, p.is_published,
      p.seller_id, u.store_name FROM cart_items ci JOIN products p ON p.id = ci.product_id JOIN users u ON u.id = p.seller_id
      WHERE ci.user_id = ? ORDER BY u.store_name, p.title`).all(userId);
  const groups = new Map();
  let total = 0, count = 0, hasProblems = false;
  for (const r of rows) {
    const m = q.mainImage.get(r.product_id);
    const item = {
      product_id: r.product_id, title: r.title, quantity: r.quantity, price_amd: r.price_amd, price_when_added: r.price_when_added,
      stock: r.stock, image: imgOut(m && m.file_path), line_total: r.price_amd * r.quantity,
      price_changed: r.price_amd !== r.price_when_added,
      sold_out: !r.is_published || r.stock === 0,
      over_stock: r.is_published && r.stock > 0 && r.quantity > r.stock,
    };
    if (item.price_changed || item.sold_out || item.over_stock) hasProblems = true;
    if (!groups.has(r.seller_id)) groups.set(r.seller_id, { seller_id: r.seller_id, store_name: r.store_name, items: [], subtotal_amd: 0 });
    const g = groups.get(r.seller_id);
    g.items.push(item);
    if (!item.sold_out) { g.subtotal_amd += item.line_total; total += item.line_total; }
    count += r.quantity;
  }
  return { groups: [...groups.values()], total_amd: total, count, has_problems: hasProblems };
}

api.get('/cart', requireUser, (req, res) => res.json(buildCart(req.user.id)));

api.put('/cart/items/:productId', requireUser, (req, res) => {
  const pid = intId(req.params.productId);
  const qty = Number(req.body.quantity);
  if (!Number.isInteger(qty) || qty < 1 || qty > 999) throw bad('Quantity must be a whole number from 1');
  const p = db.prepare('SELECT id, title, seller_id, price_amd, stock, is_published FROM products WHERE id = ?').get(pid);
  if (!p || !p.is_published) throw notFound('Product not found');
  if (p.seller_id === req.user.id) throw new ApiError(403, 'own_product', 'You cannot buy your own product');
  const existing = db.prepare('SELECT quantity FROM cart_items WHERE user_id = ? AND product_id = ?').get(req.user.id, pid);
  const finalQty = req.body.add ? qty + (existing ? existing.quantity : 0) : qty;
  if (finalQty > p.stock) {
    throw conflict('not_enough_stock', p.stock === 0 ? `${p.title} is out of stock` : `Only ${p.stock} of "${p.title}" in stock`, { stock: p.stock, in_cart: existing ? existing.quantity : 0 });
  }
  if (existing) {
    // keep the old price_when_added, so a price change is still detected — unless the buyer accepts the new price
    db.prepare(`UPDATE cart_items SET quantity = ?, price_when_added = CASE WHEN ? THEN ? ELSE price_when_added END WHERE user_id = ? AND product_id = ?`)
      .run(finalQty, req.body.acceptPrice ? 1 : 0, p.price_amd, req.user.id, pid);
  } else {
    db.prepare('INSERT INTO cart_items (user_id, product_id, quantity, price_when_added) VALUES (?,?,?,?)').run(req.user.id, pid, finalQty, p.price_amd);
  }
  res.json(buildCart(req.user.id));
});

api.post('/cart/accept-prices', requireUser, (req, res) => {
  db.prepare(`UPDATE cart_items SET price_when_added = (SELECT price_amd FROM products WHERE products.id = cart_items.product_id) WHERE user_id = ?`).run(req.user.id);
  res.json(buildCart(req.user.id));
});

api.delete('/cart/items/:productId', requireUser, (req, res) => {
  db.prepare('DELETE FROM cart_items WHERE user_id = ? AND product_id = ?').run(req.user.id, intId(req.params.productId));
  res.json(buildCart(req.user.id));
});

// ===== Checkout =====
const insHistory = db.prepare('INSERT INTO status_history (seller_order_id, from_status, to_status, changed_by, created_at) VALUES (?,?,?,?,?)');

function placeOrder(userId, addr, requestKey) {
  // Runs inside BEGIN IMMEDIATE (see .immediate() below): only one writer at a time, no stale reads.
  const existing = db.prepare('SELECT id, buyer_id FROM orders WHERE request_key = ?').get(requestKey);
  if (existing) {
    if (existing.buyer_id !== userId) throw conflict('request_key_used', 'This request key was already used');
    return { id: existing.id, repeated: true };
  }
  const items = db.prepare(`SELECT ci.product_id, ci.quantity, ci.price_when_added, p.title, p.price_amd, p.seller_id, p.is_published
      FROM cart_items ci JOIN products p ON p.id = ci.product_id WHERE ci.user_id = ? ORDER BY p.seller_id, p.id`).all(userId);
  if (items.length === 0) throw bad('Your cart is empty');

  const changed = items.filter((i) => i.price_amd !== i.price_when_added);
  if (changed.length) {
    throw conflict('price_changed', `The price of "${changed[0].title}" changed to ${changed[0].price_amd} AMD`, {
      items: changed.map((i) => ({ product_id: i.product_id, title: i.title, old_price: i.price_when_added, new_price: i.price_amd })),
    });
  }
  const ts = now();
  const decStock = db.prepare('UPDATE products SET stock = stock - ?, updated_at = ? WHERE id = ? AND stock >= ? AND is_published = 1');
  for (const i of items) {
    if (i.seller_id === userId) throw conflict('own_product', `You cannot buy your own product "${i.title}"`);
    const r = decStock.run(i.quantity, ts, i.product_id, i.quantity);
    if (r.changes !== 1) throw conflict('out_of_stock', `Not enough stock for "${i.title}"`, { product_id: i.product_id, title: i.title });
  }
  const total = items.reduce((s, i) => s + i.price_amd * i.quantity, 0);
  const orderId = db.prepare(`INSERT INTO orders (buyer_id, recipient, phone, region, city, street, apartment, note, total_amd, request_key, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(userId, addr.recipient, addr.phone, addr.region, addr.city, addr.street, addr.apartment, addr.note, total, requestKey, ts).lastInsertRowid;
  const bySeller = new Map();
  for (const i of items) { if (!bySeller.has(i.seller_id)) bySeller.set(i.seller_id, []); bySeller.get(i.seller_id).push(i); }
  const insSo = db.prepare('INSERT INTO seller_orders (order_id, seller_id, status, subtotal_amd, updated_at) VALUES (?,?,?,?,?)');
  const insItem = db.prepare('INSERT INTO order_items (seller_order_id, product_id, title, unit_price_amd, quantity) VALUES (?,?,?,?,?)');
  for (const [sellerId, list] of bySeller) {
    const sub = list.reduce((s, i) => s + i.price_amd * i.quantity, 0);
    const soId = insSo.run(orderId, sellerId, 'placed', sub, ts).lastInsertRowid;
    for (const i of list) insItem.run(soId, i.product_id, i.title, i.price_amd, i.quantity);
    insHistory.run(soId, null, 'placed', userId, ts);
  }
  db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(userId);
  return { id: orderId, repeated: false };
}
const placeOrderTx = db.transaction(placeOrder);

api.post('/orders', requireUser, (req, res) => {
  const b = req.body || {};
  const requestKey = str(b.request_key);
  const addr = {
    recipient: str(b.recipient), phone: str(b.phone), region: str(b.region), city: str(b.city),
    street: str(b.street), apartment: str(b.apartment), note: str(b.note),
  };
  const fields = {};
  if (requestKey.length < 8 || requestKey.length > 100) fields.request_key = 'Missing request key';
  if (addr.recipient.length < 2) fields.recipient = 'Enter the recipient name';
  if (!phoneOk(addr.phone)) fields.phone = 'Enter a valid phone';
  if (!REGIONS.includes(addr.region)) fields.region = 'Choose a region';
  if (addr.city.length < 2) fields.city = 'Enter a city or village';
  if (addr.street.length < 2) fields.street = 'Enter street and building';
  if (addr.apartment.length > 50) fields.apartment = 'Too long';
  if (addr.note.length > 500) fields.note = 'Max 500 characters';
  if (Object.keys(fields).length) throw bad('Please fix the highlighted fields', fields);
  const r = placeOrderTx.immediate(req.user.id, addr, requestKey);
  res.status(r.repeated ? 200 : 201).json({ order_id: r.id, repeated: r.repeated });
});

// ===== Orders (buyer & seller share loaders) =====
function sellerOrderDetail(so) {
  const items = db.prepare('SELECT id, product_id, title, unit_price_amd, quantity FROM order_items WHERE seller_order_id = ? ORDER BY id').all(so.id)
    .map((i) => { const m = q.mainImage.get(i.product_id); return { ...i, line_total: i.unit_price_amd * i.quantity, image: imgOut(m && m.file_path) }; });
  const history = db.prepare(`SELECT h.from_status, h.to_status, h.created_at, u.name AS changed_by_name,
      CASE WHEN h.changed_by = ? THEN 'seller' ELSE 'buyer' END AS actor
      FROM status_history h JOIN users u ON u.id = h.changed_by WHERE h.seller_order_id = ? ORDER BY h.id`).all(so.seller_id, so.id);
  return { ...so, items, history };
}

api.get('/orders', requireUser, (req, res) => {
  const orders = db.prepare('SELECT id, total_amd, created_at FROM orders WHERE buyer_id = ? ORDER BY id DESC').all(req.user.id);
  const parts = db.prepare(`SELECT so.id, so.status, so.subtotal_amd, u.store_name FROM seller_orders so JOIN users u ON u.id = so.seller_id WHERE so.order_id = ? ORDER BY so.id`);
  const cnt = db.prepare('SELECT COALESCE(SUM(oi.quantity),0) n FROM order_items oi JOIN seller_orders so ON so.id = oi.seller_order_id WHERE so.order_id = ?');
  res.json({ orders: orders.map((o) => ({ ...o, item_count: cnt.get(o.id).n, sellers: parts.all(o.id) })) });
});

api.get('/orders/:id', requireUser, (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id = ? AND buyer_id = ?').get(intId(req.params.id), req.user.id);
  if (!o) throw notFound('Order not found');
  const sos = db.prepare(`SELECT so.*, u.store_name FROM seller_orders so JOIN users u ON u.id = so.seller_id WHERE so.order_id = ? ORDER BY so.id`).all(o.id);
  const reviewed = new Set(db.prepare('SELECT product_id FROM reviews WHERE buyer_id = ?').all(req.user.id).map((r) => r.product_id));
  delete o.request_key;
  res.json({
    order: {
      ...o,
      sellers: sos.map((so) => {
        const d = sellerOrderDetail(so);
        d.items = d.items.map((i) => ({ ...i, reviewed: reviewed.has(i.product_id), can_review: so.status === 'delivered' && !reviewed.has(i.product_id) }));
        d.can_cancel = BUYER_MOVES[so.status].includes('cancelled');
        return d;
      }),
    },
  });
});

// One function decides every status change. Runs in BEGIN IMMEDIATE; returns stock on cancel in the same transaction.
const changeStatusTx = db.transaction((soId, from, to, actorId) => {
  const ts = now();
  const r = db.prepare('UPDATE seller_orders SET status = ?, updated_at = ? WHERE id = ? AND status = ?').run(to, ts, soId, from);
  if (r.changes !== 1) throw conflict('status_conflict', 'The order was changed by someone else, reload the page');
  if (to === 'cancelled') {
    const items = db.prepare('SELECT product_id, quantity FROM order_items WHERE seller_order_id = ?').all(soId);
    const inc = db.prepare('UPDATE products SET stock = stock + ?, updated_at = ? WHERE id = ?');
    for (const i of items) inc.run(i.quantity, ts, i.product_id);
  }
  insHistory.run(soId, from, to, actorId, ts);
});

api.post('/orders/:id/sellers/:sellerOrderId/cancel', requireUser, (req, res) => {
  const so = db.prepare(`SELECT so.* FROM seller_orders so JOIN orders o ON o.id = so.order_id
      WHERE so.id = ? AND so.order_id = ? AND o.buyer_id = ?`).get(intId(req.params.sellerOrderId), intId(req.params.id), req.user.id);
  if (!so) throw notFound('Order not found');
  if (!BUYER_MOVES[so.status].includes('cancelled')) throw conflict('move_not_allowed', `An order that is ${so.status} cannot be cancelled`);
  changeStatusTx.immediate(so.id, so.status, 'cancelled', req.user.id);
  res.json({ ok: true, status: 'cancelled' });
});

// ===== Reviews =====
api.post('/products/:id/reviews', requireUser, (req, res) => {
  const pid = intId(req.params.id);
  const rating = Number(req.body.rating);
  const body = str(req.body.body);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw bad('Rating must be 1 to 5 stars', { rating: 'Choose 1 to 5 stars' });
  if (body.length > 2000) throw bad('Review is too long', { body: 'Max 2000 characters' });
  const delivered = db.prepare(`SELECT 1 FROM order_items oi JOIN seller_orders so ON so.id = oi.seller_order_id JOIN orders o ON o.id = so.order_id
      WHERE oi.product_id = ? AND o.buyer_id = ? AND so.status = 'delivered' LIMIT 1`).get(pid, req.user.id);
  if (!delivered) throw new ApiError(403, 'not_delivered', 'You can review only products that were delivered to you');
  db.transaction(() => {
    try {
      db.prepare('INSERT INTO reviews (product_id, buyer_id, rating, body, created_at) VALUES (?,?,?,?,?)').run(pid, req.user.id, rating, body, now());
    } catch (e) {
      if (String(e.code).startsWith('SQLITE_CONSTRAINT')) throw conflict('already_reviewed', 'You already reviewed this product');
      throw e;
    }
    db.prepare(`UPDATE products SET rating_count = (SELECT COUNT(*) FROM reviews WHERE product_id = ?),
        rating_avg = (SELECT ROUND(AVG(rating), 2) FROM reviews WHERE product_id = ?) WHERE id = ?`).run(pid, pid, pid);
  }).immediate();
  const p = db.prepare('SELECT rating_avg, rating_count FROM products WHERE id = ?').get(pid);
  res.status(201).json({ ok: true, ...p });
});

// ===== Seller =====
api.post('/seller/activate', requireUser, (req, res) => {
  const store = str(req.body.store_name), phone = str(req.body.phone);
  const fields = {};
  if (store.length < 2 || store.length > 60) fields.store_name = 'Store name must be 2–60 characters';
  if (!phoneOk(phone)) fields.phone = 'Enter a valid phone';
  if (Object.keys(fields).length) throw bad('Please fix the highlighted fields', fields);
  if (req.user.store_name) throw conflict('already_seller', 'You are already a seller');
  const taken = db.prepare('SELECT 1 FROM users WHERE store_name = ? COLLATE NOCASE').get(store);
  if (taken) throw conflict('store_taken', 'This store name is taken', { fields: { store_name: 'This store name is taken' } });
  db.prepare('UPDATE users SET store_name = ?, phone = ? WHERE id = ?').run(store, phone, req.user.id);
  res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) });
});

api.get('/seller/overview', requireSeller, (req, res) => {
  const sid = req.user.id;
  // plain SQL, as required by the brief
  const byStatus = db.prepare('SELECT status, COUNT(*) AS n FROM seller_orders WHERE seller_id = ? GROUP BY status').all(sid);
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const r of byStatus) counts[r.status] = r.n;
  const revenue30 = db.prepare(`SELECT COALESCE(SUM(subtotal_amd), 0) AS amd FROM seller_orders
      WHERE seller_id = ? AND status = 'delivered' AND updated_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days')`).get(sid).amd;
  const revenueAll = db.prepare(`SELECT COALESCE(SUM(subtotal_amd), 0) AS amd FROM seller_orders WHERE seller_id = ? AND status = 'delivered'`).get(sid).amd;
  const products = db.prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(is_published), 0) AS published, COALESCE(SUM(CASE WHEN stock = 0 THEN 1 ELSE 0 END), 0) AS out_of_stock
      FROM products WHERE seller_id = ?`).get(sid);
  const recent = db.prepare(`SELECT so.id, so.status, so.subtotal_amd, o.created_at, o.recipient, o.city
      FROM seller_orders so JOIN orders o ON o.id = so.order_id WHERE so.seller_id = ? ORDER BY so.id DESC LIMIT 5`).all(sid);
  res.json({ counts, to_confirm: counts.placed, to_ship: counts.confirmed, revenue_30d_amd: revenue30, revenue_all_amd: revenueAll, products, recent_orders: recent });
});

function validateProduct(b, partial) {
  const fields = {};
  const out = {};
  const has = (k) => b[k] !== undefined;
  if (!partial || has('title')) { out.title = str(b.title); if (out.title.length < 3 || out.title.length > 120) fields.title = 'Title must be 3–120 characters'; }
  if (!partial || has('description')) { out.description = str(b.description); if (out.description.length < 10 || out.description.length > 5000) fields.description = 'Description must be 10–5000 characters'; }
  if (!partial || has('price_amd')) {
    out.price_amd = Number(b.price_amd);
    if (!Number.isInteger(out.price_amd) || out.price_amd <= 0 || out.price_amd > 100_000_000) fields.price_amd = 'Price must be a whole number of dram, above 0';
  }
  if (!partial || has('stock')) {
    out.stock = Number(b.stock);
    if (!Number.isInteger(out.stock) || out.stock < 0 || out.stock > 100000) fields.stock = 'Stock must be a whole number, 0 or more';
  }
  if (!partial || has('category_id')) {
    out.category_id = Number(b.category_id);
    if (!db.prepare('SELECT 1 FROM categories WHERE id = ?').get(out.category_id)) fields.category_id = 'Choose a category';
  }
  if (has('is_published')) out.is_published = b.is_published ? 1 : 0;
  if (Object.keys(fields).length) throw bad('Please fix the highlighted fields', fields);
  return out;
}

const sellerProduct = (id, sellerId) => db.prepare('SELECT * FROM products WHERE id = ? AND seller_id = ?').get(id, sellerId);

api.get('/seller/products', requireSeller, (req, res) => {
  const rows = db.prepare(`SELECT p.id, p.title, p.price_amd, p.stock, p.is_published, p.rating_avg, p.rating_count, p.created_at, c.name AS category_name,
      (SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi JOIN seller_orders so ON so.id = oi.seller_order_id
        WHERE oi.product_id = p.id AND so.status != 'cancelled') AS units_sold
      FROM products p JOIN categories c ON c.id = p.category_id WHERE p.seller_id = ? ORDER BY p.created_at DESC, p.id DESC`).all(req.user.id);
  res.json({ products: rows.map((r) => { const m = q.mainImage.get(r.id); return { ...r, is_published: !!r.is_published, image: imgOut(m && m.file_path) }; }) });
});

api.get('/seller/products/:id', requireSeller, (req, res) => {
  const p = sellerProduct(intId(req.params.id), req.user.id);
  if (!p) throw notFound('Product not found');
  res.json({ product: { ...p, is_published: !!p.is_published, images: q.images.all(p.id).map((i) => ({ id: i.id, position: i.position, ...imageUrls(i.file_path) })) } });
});

api.post('/seller/products', requireSeller, (req, res) => {
  const v = validateProduct(req.body, false);
  const ts = now();
  // new products start unpublished until they have at least one image
  const id = db.prepare(`INSERT INTO products (seller_id, category_id, title, description, price_amd, stock, is_published, created_at, updated_at)
      VALUES (?,?,?,?,?,?,0,?,?)`).run(req.user.id, v.category_id, v.title, v.description, v.price_amd, v.stock, ts, ts).lastInsertRowid;
  res.status(201).json({ product: { id } });
});

api.patch('/seller/products/:id', requireSeller, (req, res) => {
  const p = sellerProduct(intId(req.params.id), req.user.id);
  if (!p) throw notFound('Product not found');
  const v = validateProduct(req.body, true);
  if (v.is_published === 1 && q.images.all(p.id).length === 0) throw bad('Add at least one image before publishing', { images: 'Add at least one image' });
  const mainId = req.body.main_image_id !== undefined ? Number(req.body.main_image_id) : null;
  db.transaction(() => {
    const keys = Object.keys(v);
    if (keys.length) {
      db.prepare(`UPDATE products SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ? AND seller_id = ?`)
        .run(...keys.map((k) => v[k]), now(), p.id, req.user.id);
    }
    if (mainId) {
      const imgs = q.images.all(p.id);
      if (!imgs.find((i) => i.id === mainId)) throw bad('Image not found');
      const order = [mainId, ...imgs.filter((i) => i.id !== mainId).map((i) => i.id)];
      const setPos = db.prepare('UPDATE product_images SET position = ? WHERE id = ?');
      order.forEach((id, idx) => setPos.run(-1 - idx, id));
      order.forEach((id, idx) => setPos.run(idx, id));
    }
  })();
  res.json({ ok: true });
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 5 },
});

api.post('/seller/products/:id/images', requireSeller, (req, res, next) => {
  upload.array('images', 5)(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return next(bad(`File is too large. Maximum is ${MAX_BYTES / 1024 / 1024} MB per image`));
      if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') return next(bad('You can upload up to 5 images'));
      return next(err);
    }
    next();
  });
}, wrap(async (req, res) => {
  const p = sellerProduct(intId(req.params.id), req.user.id);
  if (!p) throw notFound('Product not found');
  const files = req.files || [];
  if (!files.length) throw bad('Choose at least one image');
  const existing = q.images.all(p.id);
  if (existing.length + files.length > 5) throw bad(`A product can have at most 5 images (it has ${existing.length})`);
  // resize & write files first — no DB transaction is open during this slow work
  const bases = [];
  try {
    for (const f of files) {
      if (!/^image\//.test(f.mimetype)) throw new ImageError(`"${f.originalname}" is not an image`);
      bases.push(await saveImage(f.buffer));
    }
  } catch (e) {
    for (const b of bases) for (const s of ['_thumb.webp', '_large.webp']) fs.rm(path.join(UPLOADS_DIR, b + s), () => {});
    if (e instanceof ImageError) throw bad(e.message.startsWith('"') ? e.message : `"${files[bases.length].originalname}": ${e.message}`);
    throw e;
  }
  db.transaction(() => {
    const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) m FROM product_images WHERE product_id = ?').get(p.id).m;
    const ins = db.prepare('INSERT INTO product_images (product_id, file_path, position) VALUES (?,?,?)');
    bases.forEach((b, i) => ins.run(p.id, b, maxPos + 1 + i));
    db.prepare('UPDATE products SET updated_at = ? WHERE id = ?').run(now(), p.id);
  }).immediate();
  res.status(201).json({ images: q.images.all(p.id).map((i) => ({ id: i.id, position: i.position, ...imageUrls(i.file_path) })) });
}));

api.delete('/seller/products/:id/images', requireSeller, (req, res) => {
  const p = sellerProduct(intId(req.params.id), req.user.id);
  if (!p) throw notFound('Product not found');
  const imageId = Number(req.body?.image_id ?? req.query.image_id);
  const img = db.prepare('SELECT * FROM product_images WHERE id = ? AND product_id = ?').get(imageId, p.id);
  if (!img) throw notFound('Image not found');
  const remaining = q.images.all(p.id).length - 1;
  if (remaining === 0 && p.is_published) throw bad('A published product needs at least one image. Unpublish it first or add another image.');
  db.transaction(() => {
    db.prepare('DELETE FROM product_images WHERE id = ?').run(img.id);
    const rest = q.images.all(p.id);
    const setPos = db.prepare('UPDATE product_images SET position = ? WHERE id = ?');
    rest.forEach((r, i) => setPos.run(-1 - i, r.id));
    rest.forEach((r, i) => setPos.run(i, r.id));
  })();
  for (const s of ['_thumb.webp', '_large.webp']) fs.rm(path.join(UPLOADS_DIR, img.file_path + s), () => {});
  res.json({ images: q.images.all(p.id).map((i) => ({ id: i.id, position: i.position, ...imageUrls(i.file_path) })) });
});

// ----- seller orders -----
api.get('/seller/orders', requireSeller, (req, res) => {
  const status = str(req.query.status);
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const r of db.prepare('SELECT status, COUNT(*) n FROM seller_orders WHERE seller_id = ? GROUP BY status').all(req.user.id)) counts[r.status] = r.n;
  const params = [req.user.id];
  let filter = '';
  if (STATUSES.includes(status)) { filter = 'AND so.status = ?'; params.push(status); }
  const rows = db.prepare(`SELECT so.id, so.order_id, so.status, so.subtotal_amd, so.updated_at, o.created_at, o.recipient, o.city, o.region,
      (SELECT COALESCE(SUM(quantity),0) FROM order_items WHERE seller_order_id = so.id) AS item_count
      FROM seller_orders so JOIN orders o ON o.id = so.order_id WHERE so.seller_id = ? ${filter} ORDER BY so.id DESC`).all(...params);
  res.json({ orders: rows, counts });
});

api.get('/seller/orders/:id', requireSeller, (req, res) => {
  // scoped to the current seller: another seller's order is simply "not found"
  const so = db.prepare('SELECT * FROM seller_orders WHERE id = ? AND seller_id = ?').get(intId(req.params.id), req.user.id);
  if (!so) throw notFound('Order not found');
  const o = db.prepare(`SELECT o.id, o.recipient, o.phone, o.region, o.city, o.street, o.apartment, o.note, o.created_at, u.name AS buyer_name, u.email AS buyer_email
      FROM orders o JOIN users u ON u.id = o.buyer_id WHERE o.id = ?`).get(so.order_id);
  res.json({ order: { ...sellerOrderDetail(so), buyer_order: o, cash_to_collect_amd: so.subtotal_amd, allowed_moves: SELLER_MOVES[so.status] } });
});

api.post('/seller/orders/:id/status', requireSeller, (req, res) => {
  const so = db.prepare('SELECT * FROM seller_orders WHERE id = ? AND seller_id = ?').get(intId(req.params.id), req.user.id);
  if (!so) throw notFound('Order not found');
  const to = str(req.body.to);
  if (!STATUSES.includes(to)) throw bad('Unknown status');
  if (!SELLER_MOVES[so.status].includes(to)) throw conflict('move_not_allowed', `Cannot move an order from ${so.status} to ${to}`);
  changeStatusTx.immediate(so.id, so.status, to, req.user.id);
  res.json({ ok: true, status: to, allowed_moves: SELLER_MOVES[to] });
});

api.use((_req, _res, next) => next(notFound('Unknown API endpoint')));

app.use('/api', api);

// uploaded images (only paths are stored in SQLite)
app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '30d', immutable: true, fallthrough: false }));

// built frontend (single process serves API + SPA)
const DIST = process.env.CLIENT_DIST || path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST, { index: false, maxAge: '1h' }));
  app.get(/^(?!\/api|\/uploads).*/, (_req, res) => res.sendFile(path.join(DIST, 'index.html')));
}

// single error shape: { error: { code, message } }
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  if (err instanceof ApiError) return res.status(err.status).json({ error: { code: err.code, message: err.message, ...(err.extra || {}) } });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'invalid_json', message: 'Invalid JSON body' } });
  if (err.status === 404) return res.status(404).json({ error: { code: 'not_found', message: 'Not found' } });
  if (err.code === 'SQLITE_BUSY') {
    console.error('SQLITE_BUSY', req.method, req.path);
    return res.status(503).json({ error: { code: 'busy', message: 'Server is busy, please retry' } });
  }
  console.error(err);
  res.status(500).json({ error: { code: 'server_error', message: 'Something went wrong' } });
});

module.exports = app;
