const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { UPLOADS_DIR } = require('./db');

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB per image
const ALLOWED = new Set(['jpeg', 'png', 'webp', 'gif', 'avif', 'heif']);

class ImageError extends Error {}

// Validates real content (not file extension), resizes to thumb + large, writes webp files.
// Returns the base path stored in SQLite, e.g. "img_ab12cd".
// Must be called OUTSIDE of any DB transaction (brief: keep transactions short).
async function saveImage(buffer) {
  if (!buffer || buffer.length === 0) throw new ImageError('Empty file');
  if (buffer.length > MAX_BYTES) throw new ImageError('Image is too large (max 8 MB)');
  let meta;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    throw new ImageError('File is not a valid image (JPEG, PNG, WebP)');
  }
  if (!ALLOWED.has(meta.format)) throw new ImageError('Unsupported image type: ' + meta.format);
  const base = 'img_' + crypto.randomBytes(8).toString('hex');
  const img = sharp(buffer, { failOn: 'error' }).rotate();
  await img.clone().resize(400, 400, { fit: 'cover' }).webp({ quality: 78 }).toFile(path.join(UPLOADS_DIR, base + '_thumb.webp'));
  await img.clone().resize(1200, 1200, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toFile(path.join(UPLOADS_DIR, base + '_large.webp'));
  return base;
}

const imageUrls = (base) => ({ thumb: `/uploads/${base}_thumb.webp`, large: `/uploads/${base}_large.webp` });

module.exports = { saveImage, imageUrls, ImageError, MAX_BYTES };
