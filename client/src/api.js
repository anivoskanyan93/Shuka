// Small fetch wrapper. Errors come back as { error: { code, message, ... } } from the server.
export class ApiError extends Error {
  constructor(status, body) {
    const e = (body && body.error) || {};
    super(e.message || `Request failed (${status})`);
    this.status = status;
    this.code = e.code;
    this.fields = e.fields || {};
    this.data = e;
  }
}

let wakeListener = null;
export const onWaking = (fn) => { wakeListener = fn; };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function api(path, { method = 'GET', body, form } = {}) {
  const opts = { method, credentials: 'include', headers: {} };
  if (form) opts.body = form;
  else if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
  // the free server may be asleep: retry gateway errors for up to ~90s on safe requests
  const retries = method === 'GET' ? 9 : 2;
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch('/api' + path, opts);
    } catch (e) {
      if (attempt < retries) { wakeListener?.(true); await sleep(5000); continue; }
      wakeListener?.(false);
      throw new ApiError(0, { error: { message: 'Network error — check your connection' } });
    }
    if ([502, 503, 504].includes(res.status) && attempt < retries) { wakeListener?.(true); await sleep(5000); continue; }
    wakeListener?.(false);
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* not json */ }
    if (!res.ok) throw new ApiError(res.status, data);
    return data;
  }
}

export const amd = (n) => new Intl.NumberFormat('en-US').format(n) + ' ֏';

export const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
export const fmtDateTime = (iso) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export const REGIONS = ['Yerevan', 'Aragatsotn', 'Ararat', 'Armavir', 'Gegharkunik', 'Kotayk', 'Lori', 'Shirak', 'Syunik', 'Tavush', 'Vayots Dzor'];

export const STATUS_LABEL = { placed: 'Placed', confirmed: 'Confirmed', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled' };

export function randomKey() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
}

// Downscale big photos in the browser before upload (keeps uploads fast on phones).
export async function shrinkImage(file, max = 2000) {
  if (!file.type.startsWith('image/') || file.size < 1.5 * 1024 * 1024 || file.type === 'image/gif') return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.88));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
