const fs = require('fs');
const path = require('path');
const { db, migrate, DATA_DIR } = require('./db');
const { seed } = require('../scripts/seed');
const app = require('./app');

const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const KEEP_BACKUPS = 7;

function backup() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const file = path.join(BACKUP_DIR, `shuka-${new Date().toISOString().slice(0, 10)}.db`);
  if (fs.existsSync(file)) return;
  db.prepare('VACUUM INTO ?').run(file);
  const all = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.db')).sort();
  for (const old of all.slice(0, Math.max(0, all.length - KEEP_BACKUPS))) fs.unlinkSync(path.join(BACKUP_DIR, old));
  console.log('backup written:', file);
}

(async () => {
  migrate();
  // first start on an empty disk: create demo data so the shop is never empty
  if (db.prepare('SELECT COUNT(*) n FROM users').get().n === 0) await seed();
  try { backup(); } catch (e) { console.error('backup failed', e); }
  setInterval(() => { try { backup(); } catch (e) { console.error('backup failed', e); } }, 3600 * 1000);
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => console.log(`Shuka running on http://localhost:${port}`));
})();
