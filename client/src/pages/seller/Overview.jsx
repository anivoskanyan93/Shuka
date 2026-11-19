import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { amd, api, fmtDate, STATUS_LABEL } from '../../api';
import { ErrorBox, Spinner, StatusBadge } from '../../components/ui';

export default function Overview() {
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { api('/seller/overview').then(setD).catch(setError); }, []);
  if (error) return <ErrorBox error={error} />;
  if (!d) return <Spinner />;
  return (
    <div>
      <div className="stats">
        <Link to="/seller/orders?status=placed" className="stat stat-attn"><span>To confirm</span><b>{d.to_confirm}</b><small>orders placed</small></Link>
        <Link to="/seller/orders?status=confirmed" className="stat stat-attn2"><span>To ship</span><b>{d.to_ship}</b><small>orders confirmed</small></Link>
        <div className="stat stat-money"><span>Revenue, last 30 days</span><b>{amd(d.revenue_30d_amd)}</b><small>from delivered orders</small></div>
        <Link to="/seller/products" className="stat"><span>Products</span><b>{d.products.published}<em>/{d.products.total}</em></b><small>published{d.products.out_of_stock ? ` · ${d.products.out_of_stock} out of stock` : ''}</small></Link>
      </div>
      <div className="two-col">
        <div className="card">
          <h3 className="card-title">Orders by status</h3>
          {Object.entries(d.counts).map(([s, n]) => {
            const max = Math.max(1, ...Object.values(d.counts));
            return (
              <Link key={s} to={`/seller/orders?status=${s}`} className="bar-row">
                <span className="bar-label">{STATUS_LABEL[s]}</span>
                <span className="bar"><span className={`bar-fill fill-${s}`} style={{ width: `${(n / max) * 100}%` }} /></span>
                <b>{n}</b>
              </Link>
            );
          })}
          <div className="muted small mt">All-time revenue from delivered orders: <b>{amd(d.revenue_all_amd)}</b></div>
        </div>
        <div className="card">
          <div className="row between"><h3 className="card-title">Recent orders</h3><Link to="/seller/orders" className="link small">All orders →</Link></div>
          {d.recent_orders.length === 0 && <p className="muted">No orders yet. <Link to="/seller/products/new">Add a product</Link> to start selling.</p>}
          {d.recent_orders.map((o) => (
            <Link key={o.id} to={`/seller/orders/${o.id}`} className="mini-order">
              <span><b>#{o.id}</b> · {o.recipient}, {o.city}<br /><span className="muted small">{fmtDate(o.created_at)}</span></span>
              <span className="right"><StatusBadge status={o.status} /><br /><b>{amd(o.subtotal_amd)}</b></span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
