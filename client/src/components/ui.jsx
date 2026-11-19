import { Link, Navigate, useLocation } from 'react-router-dom';
import { amd, STATUS_LABEL } from '../api';
import { useStore } from '../store';

export function Stars({ value = 0, count, size = 'sm' }) {
  const full = Math.round(value * 2) / 2;
  return (
    <span className={`stars stars-${size}`} title={`${value.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= full ? 'on' : i - 0.5 === full ? 'half' : ''}>★</span>
      ))}
      {count !== undefined && <span className="stars-count">{count > 0 ? `${value.toFixed(1)} (${count})` : 'No reviews'}</span>}
    </span>
  );
}

export const Price = ({ value, className = '' }) => <span className={`price ${className}`}>{amd(value)}</span>;

export function StatusBadge({ status }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABEL[status] || status}</span>;
}

export function ProductCard({ p }) {
  return (
    <Link to={`/p/${p.id}`} className="pcard">
      <div className="pcard-img">
        {p.image ? <img src={p.image.thumb} alt={p.title} loading="lazy" /> : <div className="noimg">No image</div>}
        {p.stock === 0 && <span className="pcard-flag">Sold out</span>}
        {p.stock > 0 && p.stock <= 3 && <span className="pcard-flag warn">Only {p.stock} left</span>}
      </div>
      <div className="pcard-body">
        <div className="pcard-title">{p.title}</div>
        <Stars value={p.rating_avg} count={p.rating_count} />
        <Price value={p.price_amd} />
        {p.store_name && <div className="pcard-store">{p.store_name}</div>}
      </div>
    </Link>
  );
}

export function Field({ label, error, hint, children }) {
  return (
    <label className={`field ${error ? 'has-error' : ''}`}>
      <span className="field-label">{label}</span>
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export const Spinner = ({ label = 'Loading…' }) => <div className="spinner-wrap"><div className="spinner" /><span>{label}</span></div>;

export function ErrorBox({ error }) {
  if (!error) return null;
  return <div className="alert alert-error">{error.message || String(error)}</div>;
}

export function Empty({ title, children, icon = '🛍️' }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function RequireAuth({ children, seller }) {
  const { user, ready } = useStore();
  const loc = useLocation();
  if (!ready) return <Spinner />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (seller && !user.is_seller) return <Navigate to="/sell" replace />;
  return children;
}

export function Pagination({ page, pages, onPage }) {
  if (pages <= 1) return null;
  const nums = [];
  for (let i = Math.max(1, page - 2); i <= Math.min(pages, page + 2); i++) nums.push(i);
  return (
    <nav className="pagination">
      <button className="btn btn-ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹ Prev</button>
      {nums[0] > 1 && <><button className="btn btn-ghost" onClick={() => onPage(1)}>1</button>{nums[0] > 2 && <span>…</span>}</>}
      {nums.map((n) => <button key={n} className={`btn ${n === page ? 'btn-primary' : 'btn-ghost'}`} onClick={() => onPage(n)}>{n}</button>)}
      {nums[nums.length - 1] < pages && <>{nums[nums.length - 1] < pages - 1 && <span>…</span>}<button className="btn btn-ghost" onClick={() => onPage(pages)}>{pages}</button></>}
      <button className="btn btn-ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next ›</button>
    </nav>
  );
}

export function QtyInput({ value, max, onChange, disabled }) {
  return (
    <div className="qty">
      <button type="button" disabled={disabled || value <= 1} onClick={() => onChange(value - 1)} aria-label="Decrease">−</button>
      <input
        type="number" min={1} max={max} value={value} disabled={disabled}
        onChange={(e) => { const n = parseInt(e.target.value, 10); if (n >= 1) onChange(Math.min(n, max || n)); }}
      />
      <button type="button" disabled={disabled || (max !== undefined && value >= max)} onClick={() => onChange(value + 1)} aria-label="Increase">+</button>
    </div>
  );
}
