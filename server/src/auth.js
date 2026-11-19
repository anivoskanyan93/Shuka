const crypto = require('crypto');
const { db } = require('./db');

const SECRET = process.env.SESSION_SECRET || 'dev-only-secret-change-me';
const COOKIE = 'shuka_sid';
const MAX_AGE_MS = 30 * 24 * 3600 * 1000;

const sign = (payload) => crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');

function makeToken(userId) {
  const payload = `${userId}.${Date.now() + MAX_AGE_MS}`;
  return `${payload}.${sign(payload)}`;
}

function readToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const payload = `${parts[0]}.${parts[1]}`;
  const expected = sign(payload);
  const a = Buffer.from(parts[2]);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (Number(parts[1]) < Date.now()) return null;
  return Number(parts[0]);
}

function setSession(res, userId) {
  res.cookie(COOKIE, makeToken(userId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: MAX_AGE_MS,
    path: '/',
  });
}
function clearSession(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

const getUser = db.prepare('SELECT id, email, name, phone, store_name, created_at FROM users WHERE id = ?');

// attaches req.user (or null) on every request
function loadUser(req, _res, next) {
  const id = readToken(req.cookies && req.cookies[COOKIE]);
  req.user = id ? getUser.get(id) || null : null;
  next();
}

module.exports = { loadUser, setSession, clearSession };
