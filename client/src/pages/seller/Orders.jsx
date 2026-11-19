import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { amd, api, fmtDateTime, STATUS_LABEL } from '../../api';
import { useStore } from '../../store';
import { Empty, ErrorBox, Spinner, StatusBadge } from '../../components/ui';
import { History } from '../Orders';

const TABS = ['placed', 'confirmed', 'shipped', 'delivered', 'cancelled'];
const MOVE_LABEL = { confirmed: 'Confirm order', shipped: 'Mark as shipped', delivered: 'Mark as delivered (cash received)', cancelled: 'Cancel order' };

export function SellerOrders() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    setD(null);
    api(`/seller/orders${status ? `?status=${status}` : ''}`).then(setD).catch(setError);
  }, [status]);
  const all = d ? Object.values(d.counts).reduce((a, b) => a + b, 0) : 0;
  return (
    <div>
      <div className="tabs">
        <button className={!status ? 'active' : ''} onClick={() => setParams({})}>All {d && <span>{all}</span>}</button>
        {TABS.map((s) => <button key={s} className={status === s ? 'active' : ''} onClick={() => setParams({ status: s })}>{STATUS_LABEL[s]} {d && <span>{d.counts[s]}</span>}</button>)}
      </div>
      <ErrorBox error={error} />
      {!d ? <Spinner /> : d.orders.length === 0 ? <Empty title="No orders here" icon="📭" /> : (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>Order</th><th>Date</th><th>Deliver to</th><th>Items</th><th>Cash to collect</th><th>Status</th></tr></thead>
            <tbody>
              {d.orders.map((o) => (
                <tr key={o.id} className="clickable">
                  <td data-label="Order"><Link to={`/seller/orders/${o.id}`} className="tbl-title">#{o.id}</Link></td>
                  <td data-label="Date">{fmtDateTime(o.created_at)}</td>
                  <td data-label="Deliver to">{o.recipient}<div className="muted small">{o.city}, {o.region}</div></td>
                  <td data-label="Items">{o.item_count}</td>
                  <td data-label="Cash">{amd(o.subtotal_amd)}</td>
                  <td data-label="Status"><Link to={`/seller/orders/${o.id}`}><StatusBadge status={o.status} /></Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function SellerOrderDetail() {
  const { id } = useParams();
  const [o, setO] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const { notify } = useStore();
  const load = useCallback(() => api(`/seller/orders/${id}`).then((d) => setO(d.order)).catch(setError), [id]);
  useEffect(() => { load(); }, [load]);

  const move = async (to) => {
    if (to === 'cancelled' && !window.confirm('Cancel this order? The stock will be returned.')) return;
    setBusy(true); setError(null);
    try { await api(`/seller/orders/${id}/status`, { method: 'POST', body: { to } }); notify(`Order moved to ${STATUS_LABEL[to]}`); await load(); } catch (e) { setError(e); } finally { setBusy(false); }
  };

  if (!o) return error ? <Empty title="Order not found" icon="📭"><Link to="/seller/orders" className="btn btn-primary">All orders</Link></Empty> : <Spinner />;
  const b = o.buyer_order;
  return (
    <div>
      <nav className="crumbs"><Link to="/seller/orders">Orders</Link> › #{o.id}</nav>
      <div className="row between wrap mb">
        <h2 className="row gap-sm">Order #{o.id} <StatusBadge status={o.status} /></h2>
        <span className="muted">Placed {fmtDateTime(b.created_at)}</span>
      </div>
      <ErrorBox error={error} />
      <div className="two-col">
        <div className="card">
          <h3 className="card-title">Items</h3>
          {o.items.map((i) => (
            <div key={i.id} className="order-item">
              <div className="cart-thumb">{i.image && <img src={i.image.thumb} alt="" />}</div>
              <div className="grow"><b>{i.title}</b><div className="muted small">{i.quantity} × {amd(i.unit_price_amd)} (price at purchase)</div></div>
              <b>{amd(i.line_total)}</b>
            </div>
          ))}
          <div className="cash-box"><span>Cash to collect</span><b>{amd(o.cash_to_collect_amd)}</b></div>
          {o.allowed_moves.length > 0 && (
            <div className="moves">
              {o.allowed_moves.map((m) => (
                <button key={m} disabled={busy} className={`btn ${m === 'cancelled' ? 'btn-danger-ghost' : 'btn-accent'}`} onClick={() => move(m)}>{MOVE_LABEL[m]}</button>
              ))}
            </div>
          )}
        </div>
        <div>
          <div className="card address-card">
            <h3 className="card-title">Deliver to</h3>
            <div className="big"><b>{b.recipient}</b></div>
            <div>📞 <a href={`tel:${b.phone.replace(/\s/g, '')}`}>{b.phone}</a></div>
            <div>📍 {b.street}{b.apartment && `, ${b.apartment}`}<br />{b.city}, {b.region}, Armenia</div>
            {b.note && <div className="note">📝 {b.note}</div>}
            <div className="muted small mt">Buyer account: {b.buyer_name}</div>
          </div>
          <div className="card">
            <h3 className="card-title">Status history</h3>
            <History history={o.history} />
          </div>
        </div>
      </div>
    </div>
  );
}
