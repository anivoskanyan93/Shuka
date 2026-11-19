// Seed: categories, 3 sellers, 45 products with generated images, 2 demo buyers.
// Usage: node scripts/seed.js        (only seeds an empty database)
//        node scripts/seed.js --force (wipes data first)
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const sharp = require('sharp');
const { db, migrate, DB_PATH, UPLOADS_DIR } = require('../src/db');
const { saveImage } = require('../src/images');

const CATEGORIES = [
  ['Electronics', 'electronics', '#2563eb', '#60a5fa'],
  ['Fashion', 'fashion', '#db2777', '#f9a8d4'],
  ['Home & Kitchen', 'home-kitchen', '#ea580c', '#fdba74'],
  ['Books', 'books', '#7c3aed', '#c4b5fd'],
  ['Beauty', 'beauty', '#e11d48', '#fecdd3'],
  ['Sports & Outdoors', 'sports', '#059669', '#6ee7b7'],
  ['Toys & Kids', 'toys', '#d97706', '#fde68a'],
  ['Armenian Food', 'food', '#b45309', '#fcd34d'],
];

// simple icon shapes per category (drawn in a 200x200 box, white)
const ICONS = {
  electronics: '<rect x="55" y="20" width="90" height="160" rx="16" fill="#fff"/><rect x="65" y="36" width="70" height="120" rx="4" fill="currentColor" opacity=".35"/><circle cx="100" cy="168" r="5" fill="currentColor" opacity=".5"/>',
  fashion: '<path d="M60 40 L85 28 Q100 45 115 28 L140 40 L170 75 L148 92 L140 82 L140 175 L60 175 L60 82 L52 92 L30 75 Z" fill="#fff"/>',
  'home-kitchen': '<path d="M45 70 h110 v70 a30 30 0 0 1 -30 30 h-50 a30 30 0 0 1 -30 -30z" fill="#fff"/><path d="M155 85 h15 a18 18 0 0 1 0 36 h-15" stroke="#fff" stroke-width="10" fill="none"/><path d="M75 30 q10 15 0 28 M100 25 q10 15 0 33 M125 30 q10 15 0 28" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round"/>',
  books: '<path d="M30 50 q35 -15 70 5 v120 q-35 -20 -70 -5z" fill="#fff"/><path d="M170 50 q-35 -15 -70 5 v120 q35 -20 70 -5z" fill="#fff" opacity=".85"/>',
  beauty: '<rect x="80" y="20" width="40" height="40" rx="6" fill="#fff" opacity=".85"/><rect x="62" y="60" width="76" height="120" rx="18" fill="#fff"/><rect x="75" y="95" width="50" height="40" rx="6" fill="currentColor" opacity=".3"/>',
  sports: '<circle cx="100" cy="100" r="72" fill="#fff"/><path d="M100 28 v144 M28 100 h144 M50 50 q50 50 0 100 M150 50 q-50 50 0 100" stroke="currentColor" stroke-width="5" fill="none" opacity=".4"/>',
  toys: '<rect x="40" y="90" width="55" height="55" rx="8" fill="#fff"/><rect x="105" y="90" width="55" height="55" rx="8" fill="#fff" opacity=".85"/><rect x="72" y="30" width="55" height="55" rx="8" fill="#fff" opacity=".92"/><circle cx="67" cy="117" r="9" fill="currentColor" opacity=".4"/><circle cx="132" cy="117" r="9" fill="currentColor" opacity=".4"/><circle cx="100" cy="57" r="9" fill="currentColor" opacity=".4"/>',
  food: '<path d="M45 80 h110 l-12 90 h-86z" fill="#fff"/><rect x="38" y="62" width="124" height="22" rx="6" fill="#fff" opacity=".85"/><circle cx="85" cy="125" r="14" fill="currentColor" opacity=".35"/><circle cx="118" cy="135" r="11" fill="currentColor" opacity=".35"/>',
};

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function svgFor(cat, title, variant) {
  const [, slug, c1, c2] = cat;
  const angle = [135, 45, 200][variant % 3];
  const words = title.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > 20) { lines.push(cur.trim()); cur = w; } else cur += ' ' + w;
  }
  lines.push(cur.trim());
  const text = lines.slice(0, 2).map((l, i) =>
    `<text x="400" y="${640 + i * 52}" font-family="DejaVu Sans, sans-serif" font-size="44" font-weight="700" fill="#fff" text-anchor="middle">${esc(l)}</text>`).join('');
  const scale = [2.2, 2.5, 2.0][variant % 3];
  const tx = 400 - 100 * scale, ty = 330 - 100 * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800">
  <defs><linearGradient id="g" gradientTransform="rotate(${angle} .5 .5)"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
  <rect width="800" height="800" fill="url(#g)"/>
  <circle cx="${[650, 150, 620][variant % 3]}" cy="${[120, 140, 700][variant % 3]}" r="180" fill="#fff" opacity=".12"/>
  <circle cx="${[120, 680, 140][variant % 3]}" cy="${[720, 650, 120][variant % 3]}" r="120" fill="#fff" opacity=".10"/>
  <g transform="translate(${tx} ${ty}) scale(${scale})" color="${c1}" style="filter:drop-shadow(0 6px 10px rgba(0,0,0,.18))">${ICONS[slug]}</g>
  ${text}
  <text x="400" y="770" font-family="DejaVu Sans, sans-serif" font-size="22" fill="#fff" opacity=".75" text-anchor="middle">${variant === 0 ? 'SHUKA' : variant === 1 ? 'Detail view' : 'Package'}</text>
</svg>`;
}

const SELLERS = [
  { email: 'ani@shuka.am', name: 'Ani Hakobyan', phone: '+374 91 111111', store: 'Ani Tech Store' },
  { email: 'gor@shuka.am', name: 'Gor Petrosyan', phone: '+374 93 222222', store: 'Gor Home & Style' },
  { email: 'lilit@shuka.am', name: 'Lilit Sargsyan', phone: '+374 77 333333', store: 'Lilit Market' },
];
const BUYERS = [
  { email: 'buyer1@shuka.am', name: 'Aram Grigoryan', phone: '+374 94 444444' },
  { email: 'buyer2@shuka.am', name: 'Mariam Avetisyan', phone: '+374 98 555555' },
];
const PASSWORD = 'shuka1234';

// [seller index, category slug, title, price, stock, description]
const PRODUCTS = [
  [0, 'electronics', 'Wireless Earbuds Pro', 24900, 25, 'Bluetooth 5.3 earbuds with active noise cancellation, 30 hours of battery with the charging case and a water-resistant design.'],
  [0, 'electronics', 'Smartphone 128GB', 159000, 8, 'A 6.5" OLED display, 50 MP camera, 5000 mAh battery and 128 GB of storage. Two SIM slots. One-year local warranty.'],
  [0, 'electronics', 'USB-C Fast Charger 65W', 9900, 40, 'GaN charger with two USB-C ports and one USB-A. Charges a laptop and a phone at the same time.'],
  [0, 'electronics', 'Mechanical Keyboard', 32500, 12, 'Compact 75% layout, hot-swappable brown switches and white backlight. Works over USB-C or Bluetooth.'],
  [0, 'electronics', 'Smart Watch Active', 45000, 15, 'Heart rate, sleep tracking, GPS and 7-day battery life. Notifications from your phone on your wrist.'],
  [0, 'electronics', 'Portable Speaker', 18500, 20, 'Waterproof IPX7 speaker with deep bass and 12 hours of playback. Great for picnics at Sevan.'],
  [0, 'electronics', '27" Monitor QHD', 129000, 5, 'A 27-inch IPS panel with 2560×1440 resolution, 75 Hz and thin bezels. VESA mount included.'],
  [0, 'electronics', 'Wireless Mouse', 7500, 50, 'Quiet clicks, ergonomic shape and a battery that lasts 18 months. Includes a USB receiver.'],
  [0, 'electronics', 'Power Bank 20000 mAh', 14900, 30, 'Charges a phone up to 5 times. 22.5 W fast charging and a digital battery display.'],
  [0, 'electronics', 'HD Web Camera', 16900, 3, '1080p web camera with a built-in microphone and privacy cover. Plug and play.'],
  [0, 'sports', 'Yoga Mat Premium', 11900, 18, 'Non-slip 6 mm mat with a carrying strap. Easy to clean.'],
  [0, 'sports', 'Adjustable Dumbbells', 54000, 6, 'Pair of dumbbells adjustable from 2 to 20 kg each. Saves space at home.'],
  [0, 'sports', 'Hiking Backpack 40L', 27500, 10, 'Lightweight backpack with a rain cover, perfect for hiking Aragats and Dilijan trails.'],
  [0, 'toys', 'Remote Control Car', 19900, 9, 'Fast 4x4 RC car with a rechargeable battery. Drives on grass, sand and asphalt.'],
  [0, 'toys', 'Building Blocks Set 500 pcs', 15500, 14, 'Colorful building blocks compatible with major brands. Ages 5 and up.'],
  [1, 'fashion', 'Classic Cotton T-Shirt', 6900, 60, '100% cotton, regular fit. Available in one color: navy. Machine washable.'],
  [1, 'fashion', 'Denim Jacket', 28900, 12, 'Classic blue denim jacket with metal buttons. Unisex fit.'],
  [1, 'fashion', 'Leather Belt', 9500, 25, 'Genuine leather belt handmade in Gyumri. 3.5 cm wide.'],
  [1, 'fashion', 'Wool Scarf', 12500, 20, 'Soft merino wool scarf. Keeps you warm in the Yerevan winter.'],
  [1, 'fashion', 'Running Sneakers', 34900, 16, 'Light running shoes with a cushioned sole and breathable mesh.'],
  [1, 'fashion', 'Sunglasses Polarized', 8900, 30, 'Polarized lenses with UV400 protection and a durable frame.'],
  [1, 'home-kitchen', 'Armenian Coffee Jazzve Set', 13500, 22, 'Copper jazzve with two ceramic cups. Brew real Armenian coffee at home.'],
  [1, 'home-kitchen', 'Non-stick Frying Pan 28cm', 15900, 18, 'Granite-coated pan for all stove types including induction.'],
  [1, 'home-kitchen', 'Ceramic Dinner Set 18 pcs', 39000, 7, 'Handmade ceramic plates and bowls for six people, decorated with pomegranate patterns.'],
  [1, 'home-kitchen', 'Electric Kettle 1.7L', 12900, 25, 'Stainless steel kettle with auto shut-off. Boils water in 3 minutes.'],
  [1, 'home-kitchen', 'Carpet Runner Handwoven', 65000, 4, 'Handwoven wool carpet runner with traditional Armenian ornaments. 70 × 200 cm.'],
  [1, 'home-kitchen', 'Scented Candle Set', 7900, 35, 'Three soy candles: apricot, lavender and pine. 25 hours each.'],
  [1, 'home-kitchen', 'Bed Linen Set Cotton', 24500, 11, 'Double bed linen made of soft cotton satin. Duvet cover, sheet and two pillowcases.'],
  [1, 'beauty', 'Rose Face Cream', 8500, 26, 'Natural face cream with rose oil and shea butter. For all skin types.'],
  [1, 'beauty', 'Hair Dryer Ionic', 21900, 10, '2000 W ionic hair dryer with three heat settings and a cool shot button.'],
  [2, 'books', 'Armenian Cookbook', 9900, 20, 'More than 150 traditional recipes from dolma to gata, with colorful photos.'],
  [2, 'books', 'History of Armenia', 12900, 15, 'Illustrated history from Urartu to the present day. Hardcover, 420 pages.'],
  [2, 'books', 'Learn Python in 30 Days', 8900, 18, 'A beginner friendly guide to programming with daily exercises.'],
  [2, 'books', 'Children\'s Fairy Tales', 5900, 30, 'A collection of Armenian folk tales for children with beautiful illustrations.'],
  [2, 'books', 'Notebook Set A5', 3900, 50, 'Three dotted notebooks with recycled paper covers.'],
  [2, 'beauty', 'Natural Soap Collection', 4900, 40, 'Six handmade soaps with herbs from the Armenian highlands.'],
  [2, 'beauty', 'Perfume Apricot Blossom', 29900, 9, 'Eau de parfum with notes of apricot, jasmine and sandalwood. 50 ml.'],
  [2, 'beauty', 'Lip Balm Trio', 3500, 45, 'Three nourishing lip balms with honey, mint and berries.'],
  [2, 'food', 'Apricot Jam 500g', 2900, 60, 'Homemade jam from Ararat valley apricots. No preservatives.'],
  [2, 'food', 'Dried Fruit Mix 1kg', 7500, 35, 'Dried apricots, plums, figs and peaches from Armenian orchards.'],
  [2, 'food', 'Armenian Coffee 500g', 4500, 50, 'Finely ground roasted arabica, ready for your jazzve.'],
  [2, 'food', 'Sujukh with Walnuts', 3900, 40, 'Traditional grape and walnut sweet, made in Ashtarak.'],
  [2, 'food', 'Mountain Herbal Tea', 2500, 55, 'Thyme, mint and rosehip collected on Mount Aragats. 100 g.'],
  [2, 'food', 'Lavash Pack (10 pcs)', 1200, 80, 'Fresh thin lavash baked in a tonir. Delivered within Yerevan.'],
  [2, 'toys', 'Wooden Puzzle Map of Armenia', 6500, 12, 'Educational wooden puzzle with all 11 regions of Armenia.'],
  [2, 'toys', 'Plush Teddy Bear', 8900, 2, 'Soft and cuddly 40 cm teddy bear. Safe for babies.'],
  [2, 'sports', 'Tennis Racket', 22900, 8, 'Lightweight graphite racket for beginners and intermediate players.'],
];

async function main() {
  const force = process.argv.includes('--force');
  migrate();
  const count = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  if (count > 0 && !force) { console.log('Database already has data, skipping seed.'); return; }
  if (force) {
    db.exec(`PRAGMA foreign_keys = OFF;
      DELETE FROM reviews; DELETE FROM order_items; DROP TRIGGER IF EXISTS status_history_no_delete;
      DELETE FROM status_history; DELETE FROM seller_orders; DELETE FROM orders; DELETE FROM cart_items;
      DELETE FROM product_images; DELETE FROM products; DELETE FROM categories; DELETE FROM users;
      CREATE TRIGGER status_history_no_delete BEFORE DELETE ON status_history BEGIN SELECT RAISE(ABORT, 'status_history is insert-only'); END;
      PRAGMA foreign_keys = ON;`);
    for (const f of fs.readdirSync(UPLOADS_DIR)) fs.unlinkSync(path.join(UPLOADS_DIR, f));
  }
  const insCat = db.prepare('INSERT INTO categories (name, slug) VALUES (?, ?)');
  const catBySlug = {};
  for (const c of CATEGORIES) catBySlug[c[1]] = { id: insCat.run(c[0], c[1]).lastInsertRowid, def: c };

  const hash = bcrypt.hashSync(PASSWORD, 10);
  const insUser = db.prepare('INSERT INTO users (email, password_hash, name, phone, store_name) VALUES (?,?,?,?,?)');
  const sellerIds = SELLERS.map((s) => insUser.run(s.email, hash, s.name, s.phone, s.store).lastInsertRowid);
  for (const b of BUYERS) insUser.run(b.email, hash, b.name, b.phone, null);

  // generate images first (outside transactions), then insert rows
  const insProd = db.prepare(`INSERT INTO products (seller_id, category_id, title, description, price_amd, stock, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?)`);
  const insImg = db.prepare('INSERT INTO product_images (product_id, file_path, position) VALUES (?,?,?)');
  const start = Date.now() - PRODUCTS.length * 3600_000;
  for (let i = 0; i < PRODUCTS.length; i++) {
    const [si, slug, title, price, stock, desc] = PRODUCTS[i];
    const cat = catBySlug[slug];
    const bases = [];
    for (let v = 0; v < 3; v++) {
      const png = await sharp(Buffer.from(svgFor(cat.def, title, v))).png().toBuffer();
      bases.push(await saveImage(png));
    }
    const ts = new Date(start + i * 3600_000).toISOString();
    db.transaction(() => {
      const pid = insProd.run(sellerIds[si], cat.id, title, desc, price, stock, ts, ts).lastInsertRowid;
      bases.forEach((b, pos) => insImg.run(pid, b, pos));
    })();
  }
  console.log(`Seeded ${CATEGORIES.length} categories, ${SELLERS.length} sellers, ${BUYERS.length} buyers, ${PRODUCTS.length} products. DB: ${DB_PATH}`);
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { seed: main };
