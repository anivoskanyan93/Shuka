// Manual backup: copies the live database with VACUUM INTO (safe while the server runs).
const path = require('path');
const fs = require('fs');
const { db, DATA_DIR } = require('../src/db');
const dir = path.join(DATA_DIR, 'backups');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `shuka-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
db.prepare('VACUUM INTO ?').run(file);
console.log('Backup written to', file);
