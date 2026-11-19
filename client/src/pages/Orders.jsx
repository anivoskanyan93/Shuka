import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { amd, api, fmtDate, fmtDateTime, STATUS_LABEL } from '../api';
import { useStore } from '../store';
import { Empty, ErrorBox, Field, Spinner, StatusBadge } from '../components/ui';

export function Orders() {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { api('/orders').then((d) => setOrders(d.orders)).catch(setError); }, []);
  if (error) return <ErrorBox error={error} />;
  if (!orders) return <Spinner />;
  if (!orders.length) return <Empty title="No orders yet" icon="📦"><Link className="btn btn-primary" to="/search">Start shopping</Link></Empty>;
  return (
    <div className="narrow-wide">
      <h1 className="page-title">Your orders</h1>
      {orders.map((o) => (
        <Link key={o.id} to={`/orders/${o.id}`} className="card order-row">
          <div className="order-row-head">
            <div><span className="muted small">ORDER PLACED</span><b>{fmtDate(o.created_at)}</b></div>
            <div><span className="muted small">TOTAL</span><b>{amd(o.total_amd)}</b></div>
            <div><span className="muted small">ITEMS</span><b>{o.item_count}</b></div>
            <div className="grow right"><span className="muted small">ORDER #</span><b>{o.id}</b></div>
          </div>
          <div className="order-row-sellers">
            {o.sellers.map((s) => <div key={s.id} className="row gap-sm"><StatusBadge status={s.status} /><span>{s.store_name}</span><span className="muted">· {amd(s.subtotal_amd)}</span></div>)}
          </div>
        </Link>
      ))}
    </div>
  );
}

function ReviewForm({ item, onDone }) {
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const { notify } = useStore();
  const submit = async (e) => {
    e.preventDefault();
    if (!rating) return setError({ message: 'Choose 1 to 5 stars' });
    setBusy(true);
    try { await api(`/products/${item.product_id}/reviews`, { method: 'POST', body: { rating, body } }); notify('Thanks for your review!'); onDone(); } catch (err) { setError(err); setBusy(false); }
  };
  return (
    <form className="review-form" onSubmit={submit}>
      <div className="star-input">
        {[1, 2, 3, 4, 5].map((n) => <button type="button" key={n} className={n <= rating ? 'on' : ''} onClick={() => setRating(n)} aria-label={`${n} stars`}>★</button>)}
      </div>
      <Field label="Your review (optional)"><textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What did you like or dislike?" /></Field>
      <ErrorBox error={error} />
      <button className="btn btn-primary btn-sm" disabled={busy}>Submit review</button>
    </form>
  );
}

function History({ history }) {
  return (
    <ol className="timeline">
      {history.map((h, i) => (
        <li key={i} className={`tl-${h.to_status}`}>
          <b>{STATUS_LABEL[h.to_status]}</b>
          <span className="muted small"> · {fmtDateTime(h.created_at)} · by {h.actor}</span>
        </li>
      ))}
    </ol>
  );
}
export { History };

export function OrderDetail() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);
  const [reviewing, setReviewing] = useState(null);
  const [busy, setBusy] = useState(false);
  const { notify } = useStore();
  const load = useCallback(() => api(`/orders/${id}`).then((d) => setOrder(d.order)).catch(setError), [id]);
  useEffect(() => { load(); }, [load]);

  const cancel = async (so) => {
    if (!window.confirm(`Cancel the part of this order from ${so.store_name}?`)) return;
    setBusy(true);
    try { await api(`/orders/${id}/sellers/${so.id}/cancel`, { method: 'POST' }); notify('Order cancelled'); await load(); } catch (e) { setError(e); } finally { setBusy(false); }
  };

  if (error && !order) return <Empty title="Order not found" icon="📦"><Link to="/orders" className="btn btn-primary">Your orders</Link></Empty>;
  if (!order) return <Spinner />;
  return (
    <div className="narrow-wide">
      <nav className="crumbs"><Link to="/orders">Your orders</Link> › Order #{order.id}</nav>
      <h1 className="page-title">Order #{order.id}</h1>
      <div className="muted">Placed on {fmtDateTime(order.created_at)} · Total <b>{amd(order.total_amd)}</b> · Cash on delivery</div>
      <ErrorBox error={error} />
      <div className="card address-card">
        <h3>Delivery address</h3>
        <div><b>{order.recipient}</b> · {order.phone}</div>
        <div>{order.street}{order.apartment && `, ${order.apartment}`}, {order.city}, {order.region}</div>
        {order.note && <div className="muted">Note: {order.note}</div>}
      </div>
      {order.sellers.map((so) => (
        <div key={so.id} className="card">
          <div className="seller-group-head">
            <span className="row gap-sm"><StatusBadge status={so.status} /> from <b>{so.store_name}</b></span>
            <span>{amd(so.subtotal_amd)}</span>
          </div>
          {so.items.map((i) => (
            <div key={i.id} className="order-item">
              <Link to={`/p/${i.product_id}`} className="cart-thumb">{i.image && <img src={i.image.thumb} alt="" />}</Link>
              <div className="grow">
                <Link to={`/p/${i.product_id}`}><b>{i.title}</b></Link>
                <div className="muted small">{i.quantity} × {amd(i.unit_price_amd)} = {amd(i.line_total)}</div>
                {i.can_review && reviewing !== i.id && <button className="btn btn-light btn-sm mt" onClick={() => setReviewing(i.id)}>Write a review</button>}
                {i.reviewed && <div className="small stock in">✓ You reviewed this product</div>}
                {reviewing === i.id && <ReviewForm item={i} onDone={() => { setReviewing(null); load(); }} />}
              </div>
            </div>
          ))}
          <div className="so-footer">
            <div><h4>Status history</h4><History history={so.history} /></div>
            {so.can_cancel && <button className="btn btn-danger-ghost" disabled={busy} onClick={() => cancel(so)}>Cancel this part</button>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function OrderPlaced() {
  const { id } = useParams();
  return (
    <div className="narrow">
      <div className="card placed">
        <div className="placed-icon">✓</div>
        <h1>Thank you! Your order is placed.</h1>
        <p>Order number <b className="order-no">#{id}</b></p>
        <p className="muted">The sellers will confirm it soon. Pay the courier in cash when it arrives.</p>
        <div className="row gap-sm center wrap">
          <Link className="btn btn-primary" to={`/orders/${id}`}>View order</Link>
          <Link className="btn btn-light" to="/">Continue shopping</Link>
        </div>
      </div>
    </div>
  );
}
