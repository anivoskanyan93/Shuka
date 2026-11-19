# Shuka — Amazon-style marketplace for Armenia

Anyone can register, buy from several sellers in one cart, and become a seller. Prices are in AMD,
delivery is inside Armenia, payment is cash on delivery.

**Stack:** React + Vite (frontend) · Node.js + Express (REST JSON API) · SQLite via better-sqlite3 · sharp for images.

## Run locally — one command

```bash
npm run dev        # installs everything, builds the frontend, starts http://localhost:3000
```

On the first start the server applies the migrations and seeds demo data
(8 categories, 3 sellers, 47 products with images, 2 buyers). All demo passwords are `shuka1234`:

| Role   | Email |
|--------|-------|
| Seller | `ani@shuka.am`, `gor@shuka.am`, `lilit@shuka.am` |
| Buyer  | `buyer1@shuka.am`, `buyer2@shuka.am` |

For frontend hot reload: `npm start` in one terminal and `npm run dev --prefix client` in another (Vite proxies `/api` to port 3000).

Other scripts: `npm run seed:reset` (wipe + reseed), `npm run backup`, `npm run test:break-it [URL]`.

## How it is built

```
server/
  migrations/001_init.sql   numbered SQL migrations (10 STRICT tables), applied by src/db.js
  scripts/seed.js           demo data, generated product images
  scripts/break-it.js       the 9 break-it tests from the brief
  scripts/backup.js         VACUUM INTO backup
  src/db.js                 one connection: WAL, foreign_keys=ON, busy_timeout=5000
  src/app.js                every endpoint + permission checks
  src/images.js             type/size check, resize to thumb (400px) + large (1200px) webp
  src/index.js              migrate, seed if empty, daily backup, listen
client/                     React app (storefront + seller dashboard)
```

All API routes are under `/api` (e.g. `POST /api/auth/register`, `GET /api/products?q=&category=&minPrice=&maxPrice=&sort=&page=`).
Errors always look like `{ "error": { "code", "message" } }` with 400 / 401 / 403 / 404 / 409.

### The hard parts

| # | Problem | Solution in code |
|---|---------|------------------|
| 1 | Overselling | `POST /orders` runs in `BEGIN IMMEDIATE` (`db.transaction(...).immediate()`); stock is reduced with `UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?` and `changes` is checked; any failure rolls back the whole order → 409 with the product name. Cancelling returns stock in the same transaction as the status change. |
| 2 | "Database is locked" | WAL + `busy_timeout = 5000`; transactions are short, image resizing happens before the transaction. |
| 3 | Price changes | `cart_items.price_when_added`; checkout stops with `409 price_changed` and the new price. Title, unit price and address are copied into `order_items` / `orders`. |
| 4 | One cart, many sellers | One `orders` row → one `seller_orders` row per seller, each with its own status. |
| 5 | Illegal status moves | `SELLER_MOVES` / `BUYER_MOVES` tables in `app.js`; anything else → 409. Every move inserts a `status_history` row (a trigger makes the table insert-only). |
| 6 | Other people's data | Every query is scoped: `WHERE id = ? AND seller_id = ?` / `AND buyer_id = ?` → 404. |
| 7 | Double checkout | The page sends a random `request_key`; `orders.request_key` is UNIQUE; a repeat returns the existing order. The button also locks after one click. |
| 8 | Broken references | `PRAGMA foreign_keys = ON` on the connection; products are unpublished, never deleted. |
| 9 | Images | multer (8 MB limit) + sharp checks the real content, writes `_thumb.webp` and `_large.webp` into `DATA_DIR/uploads`; SQLite stores only the path. |

### Break-it tests

```bash
npm start                         # in one terminal
npm run test:break-it             # in another (or pass the live URL)
```

## Deployment

* **Backend — Render** (`render.yaml`): web service, `npm run build` / `npm start`, a persistent disk mounted at `/var/data`
  (`DATA_DIR`) holds `shuka.db`, `uploads/` and `backups/`. `SESSION_SECRET` is an environment variable.
  A backup is written every day with `VACUUM INTO` (last 7 kept).
* **Frontend — Netlify** (`netlify.toml`): base directory `client`, publishes `dist`, and proxies `/api/*` and `/uploads/*`
  to the Render service, so the site has one URL and the httpOnly session cookie is first-party.
