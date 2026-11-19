// Break-it tests from the brief. Run against any running server:
//   node scripts/break-it.js                       (http://localhost:3000)
//   node scripts/break-it.js https://your-site.netlify.app
// The foreign-key test opens the local SQLite file, so it runs only when the DB is on this machine.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BASE = (process.argv[2] || process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const PASS = 'shuka1234';
let failures = 0;

function client() {
  let cookie = '';
  return async function call(method, p, body, isForm) {
    const headers = { cookie };
    let payload;
    if (isForm) payload = body;
    else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(BASE + '/api' + p, { method, headers, body: payload });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* */ }
    return { status: res.status, body: json, text };
  };
}
const uid = () => crypto.randomBytes(4).toString('hex');
async function newUser(prefix = 'bt') {
  const c = client();
  const r = await c('POST', '/auth/register', { email: `${prefix}-${uid()}@test.am`, password: PASS, name: 'Test ' + prefix, phone: '+374 91 000000' });
  if (r.status !== 201) throw new Error('register failed ' + r.text);
  return c;
}
async function newSeller() {
  const c = await newUser('seller');
  await c('POST', '/seller/activate', { store_name: 'Test Store ' + uid(), phone: '+374 91 000000' });
  return c;
}
// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
async function newProduct(seller, { stock = 10, price = 5000, title = 'Break-it item ' + uid() } = {}) {
  const r = await seller('POST', '/seller/products', { title, description: 'Created by the break-it test script.', price_amd: price, stock, category_id: 1 });
  const id = r.body.product.id;
  const fd = new FormData();
  fd.append('images', new Blob([PNG], { type: 'image/png' }), 'a.png');
  const up = await seller('POST', `/seller/products/${id}/images`, fd, true);
  if (up.status !== 201) throw new Error('upload failed ' + up.text);
  await seller('PATCH', `/seller/products/${id}`, { is_published: true });
  return id;
}
const ADDR = { recipient: 'Test Buyer', phone: '+374 91 000000', region: 'Yerevan', city: 'Yerevan', street: 'Abovyan 1', apartment: '2', note: '' };
const checkout = (buyer, key = crypto.randomUUID()) => buyer('POST', '/orders', { ...ADDR, request_key: key });
const stockOf = async (id) => (await client()('GET', `/products/${id}`)).body.product.stock;

function check(name, ok, detail) {
  console.log(`${ok ? '\x1b[32m✔ PASS' : '\x1b[31m✘ FAIL'}\x1b[0m  ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) failures++;
}

async function lastUnits() {
  const seller = await newSeller();
  const pid = await newProduct(seller, { stock: 3 });
  const buyers = [];
  for (let i = 0; i < 30; i++) buyers.push(await newUser('race'));
  for (const b of buyers) await b('PUT', `/cart/items/${pid}`, { quantity: 1 });
  const results = await Promise.all(buyers.map((b) => checkout(b)));
  const created = results.filter((r) => r.status === 201).length;
  const conflicts = results.filter((r) => r.status === 409).length;
  const locked = results.filter((r) => /locked|busy/i.test(r.text) || r.status >= 500).length;
  const stock = await stockOf(pid);
  check('1. Last units: 30 parallel checkouts for stock 3', created === 3 && conflicts === 27 && stock === 0 && locked === 0,
    `orders=${created}, 409s=${conflicts}, stock=${stock}, locked/5xx=${locked}`);
}

async function doubleClick() {
  const seller = await newSeller();
  const pid = await newProduct(seller, { stock: 10 });
  const b = await newUser('dbl');
  await b('PUT', `/cart/items/${pid}`, { quantity: 1 });
  const key = crypto.randomUUID();
  const [r1, r2] = await Promise.all([checkout(b, key), checkout(b, key)]);
  const r3 = await checkout(b, key);
  const orders = (await b('GET', '/orders')).body.orders;
  check('2. Double click: same request key sent 3 times', orders.length === 1 && r1.body.order_id === r2.body.order_id && r2.body.order_id === r3.body.order_id && (await stockOf(pid)) === 9,
    `orders=${orders.length}, ids=${r1.body.order_id},${r2.body.order_id},${r3.body.order_id}`);
}

async function priceChanged() {
  const seller = await newSeller();
  const pid = await newProduct(seller, { price: 5000 });
  const b = await newUser('price');
  await b('PUT', `/cart/items/${pid}`, { quantity: 1 });
  await seller('PATCH', `/seller/products/${pid}`, { price_amd: 7000 });
  const r = await checkout(b);
  const item = r.body?.error?.items?.[0];
  check('3. Price changed: checkout stops and shows the new price', r.status === 409 && r.body.error.code === 'price_changed' && item.new_price === 7000,
    `status=${r.status}, ${r.body?.error?.message}`);
}

async function oldOrderAfterEdit() {
  const seller = await newSeller();
  const pid = await newProduct(seller, { price: 5000, title: 'Original title' });
  const b = await newUser('old');
  await b('PUT', `/cart/items/${pid}`, { quantity: 2 });
  const { body } = await checkout(b);
  await seller('PATCH', `/seller/products/${pid}`, { title: 'Renamed product', price_amd: 9999 });
  const o = (await b('GET', `/orders/${body.order_id}`)).body.order;
  const it = o.sellers[0].items[0];
  check('4. Old order after edit keeps old title and price', it.title === 'Original title' && it.unit_price_amd === 5000 && o.total_amd === 10000,
    `title="${it.title}", price=${it.unit_price_amd}, total=${o.total_amd}`);
}

async function someoneElses() {
  const sellerA = await newSeller();
  const sellerB = await newSeller();
  const pid = await newProduct(sellerA);
  const buyerA = await newUser('ba');
  const buyerB = await newUser('bb');
  await buyerA('PUT', `/cart/items/${pid}`, { quantity: 1 });
  const { body } = await checkout(buyerA);
  const soId = (await buyerA('GET', `/orders/${body.order_id}`)).body.order.sellers[0].id;
  const r1 = await sellerB('GET', `/seller/orders/${soId}`);
  const r2 = await buyerB('GET', `/orders/${body.order_id}`);
  const r3 = await sellerB('POST', `/seller/orders/${soId}/status`, { to: 'confirmed' });
  const r4 = await buyerB('POST', `/orders/${body.order_id}/sellers/${soId}/cancel`);
  const r5 = await client()('GET', `/orders/${body.order_id}`);
  const ok = [r1, r2, r3, r4].every((r) => [403, 404].includes(r.status) && !r.text.includes('Abovyan')) && r5.status === 401;
  check("5. Someone else's order: other seller / buyer / guest get no data", ok, `statuses=${[r1, r2, r3, r4, r5].map((r) => r.status).join(',')}`);
}

async function moveNotAllowed() {
  const seller = await newSeller();
  const pid = await newProduct(seller);
  const b = await newUser('mv');
  await b('PUT', `/cart/items/${pid}`, { quantity: 1 });
  const { body } = await checkout(b);
  const soId = (await b('GET', `/orders/${body.order_id}`)).body.order.sellers[0].id;
  const r1 = await seller('POST', `/seller/orders/${soId}/status`, { to: 'delivered' });
  const s1 = (await seller('GET', `/seller/orders/${soId}`)).body.order;
  await seller('POST', `/seller/orders/${soId}/status`, { to: 'confirmed' });
  await seller('POST', `/seller/orders/${soId}/status`, { to: 'shipped' });
  const r2 = await b('POST', `/orders/${body.order_id}/sellers/${soId}/cancel`);
  const s2 = (await seller('GET', `/seller/orders/${soId}`)).body.order;
  check('6. Move not allowed: placed→delivered and cancelling a shipped order', r1.status === 409 && s1.status === 'placed' && s1.history.length === 1 && r2.status === 409 && s2.status === 'shipped' && s2.history.length === 3,
    `placed→delivered=${r1.status}, cancel shipped=${r2.status}, status=${s2.status}`);
}

async function cancelReturnsStock() {
  const seller = await newSeller();
  const pid = await newProduct(seller, { stock: 10 });
  const b = await newUser('cx');
  await b('PUT', `/cart/items/${pid}`, { quantity: 4 });
  const { body } = await checkout(b);
  const before = await stockOf(pid);
  const soId = (await b('GET', `/orders/${body.order_id}`)).body.order.sellers[0].id;
  const r = await b('POST', `/orders/${body.order_id}/sellers/${soId}/cancel`);
  const after = await stockOf(pid);
  check('7. Cancel returns stock', r.status === 200 && before === 6 && after === 10, `stock after order=${before}, after cancel=${after}`);
}

async function foreignKeys() {
  const dbFile = path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'shuka.db');
  if (!fs.existsSync(dbFile) || !/localhost|127\.0\.0\.1/.test(BASE)) {
    console.log('-  8. Foreign keys: skipped (needs the local database; run on the server with `npm run test:fk`)');
    return;
  }
  const { db } = require('../src/db');
  let err = null;
  try { db.prepare('INSERT INTO order_items (seller_order_id, product_id, title, unit_price_amd, quantity) VALUES (1, 999999999, ?, 100, 1)').run('ghost'); } catch (e) { err = e; }
  check('8. Foreign keys: order item for a missing product is rejected by SQLite', err && err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY', err ? err.code : 'inserted!');
}

async function badUpload() {
  const seller = await newSeller();
  const r = await seller('POST', '/seller/products', { title: 'Upload test', description: 'Testing bad uploads here.', price_amd: 100, stock: 1, category_id: 1 });
  const id = r.body.product.id;
  const big = new FormData();
  big.append('images', new Blob([Buffer.alloc(30 * 1024 * 1024, 1)], { type: 'image/jpeg' }), 'huge.jpg');
  const r1 = await seller('POST', `/seller/products/${id}/images`, big, true);
  const exe = new FormData();
  exe.append('images', new Blob([Buffer.concat([Buffer.from('MZ\x90\x00'), crypto.randomBytes(5000)])], { type: 'image/jpeg' }), 'photo.jpg');
  const r2 = await seller('POST', `/seller/products/${id}/images`, exe, true);
  check('9. Bad upload: 30 MB file and a renamed .exe are rejected', r1.status === 400 && r2.status === 400,
    `30MB → ${r1.status} "${r1.body?.error?.message}"; fake .jpg → ${r2.status} "${r2.body?.error?.message}"`);
}

(async () => {
  console.log(`Break-it tests against ${BASE}\n`);
  for (const t of [lastUnits, doubleClick, priceChanged, oldOrderAfterEdit, someoneElses, moveNotAllowed, cancelReturnsStock, foreignKeys, badUpload]) {
    try { await t(); } catch (e) { check(t.name, false, e.message); }
  }
  console.log(failures ? `\n${failures} test(s) failed` : '\nAll tests passed');
  process.exit(failures ? 1 : 0);
})();
