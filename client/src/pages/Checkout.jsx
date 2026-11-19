import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { amd, api, randomKey, REGIONS } from '../api';
import { useStore } from '../store';
import { Empty, Field, Price, Spinner } from '../components/ui';

export default function Checkout() {
  const { user, lastAddress, setCartCount, refresh } = useStore();
  const nav = useNavigate();
  const [cart, setCart] = useState(null);
  const [form, setForm] = useState(() => ({
    recipient: lastAddress?.recipient || user.name, phone: lastAddress?.phone || user.phone,
    region: lastAddress?.region || 'Yerevan', city: lastAddress?.city || (lastAddress ? '' : 'Yerevan'),
    street: lastAddress?.street || '', apartment: lastAddress?.apartment || '', note: '',
  }));
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [placing, setPlacing] = useState(false);
  // one random key per checkout attempt: a double click or a retry sends the same key -> one order
  const requestKey = useRef(randomKey());

  useEffect(() => { api('/cart').then(setCart).catch(setError); }, []);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (placing) return;
    setPlacing(true); setError(null); setErrors({});
    try {
      const r = await api('/orders', { method: 'POST', body: { ...form, request_key: requestKey.current } });
      setCartCount(0);
      refresh();
      nav(`/orders/${r.order_id}/placed`, { replace: true });
    } catch (err) {
      setErrors(err.fields || {});
      setError(err);
      if (err.code === 'price_changed' || err.code === 'out_of_stock') {
        api('/cart').then(setCart).catch(() => {});
        requestKey.current = randomKey();
      }
      setPlacing(false);
    }
  };

  const acceptPrices = async () => {
    setCart(await api('/cart/accept-prices', { method: 'POST' }));
    setError(null);
  };

  if (!cart) return <Spinner />;
  if (cart.groups.length === 0) return <Empty title="Your cart is empty" icon="🛒"><Link to="/search" className="btn btn-primary">Browse products</Link></Empty>;

  return (
    <form className="checkout-page" onSubmit={submit}>
      <div className="checkout-main">
        <h1 className="page-title">Checkout</h1>
        {error && (
          <div className="alert alert-error">
            <b>{error.message}</b>
            {error.code === 'price_changed' && (
              <>
                <ul>{error.data.items.map((i) => <li key={i.product_id}>{i.title}: <s>{amd(i.old_price)}</s> → <b>{amd(i.new_price)}</b></li>)}</ul>
                <button type="button" className="btn btn-sm btn-primary" onClick={acceptPrices}>Accept new prices</button>
              </>
            )}
            {error.code === 'out_of_stock' && <div><Link to="/cart">Go back to the cart</Link> to change the quantity.</div>}
          </div>
        )}
        <div className="card">
          <h2 className="card-title">1. Delivery address</h2>
          {lastAddress && <div className="small muted mb">Pre-filled with your last address.</div>}
          <div className="form-grid">
            <Field label="Recipient name" error={errors.recipient}><input value={form.recipient} onChange={set('recipient')} required /></Field>
            <Field label="Phone" error={errors.phone}><input value={form.phone} onChange={set('phone')} type="tel" required placeholder="+374 91 123456" /></Field>
            <Field label="Region" error={errors.region}>
              <select value={form.region} onChange={set('region')}>{REGIONS.map((r) => <option key={r}>{r}</option>)}</select>
            </Field>
            <Field label="City or village" error={errors.city}><input value={form.city} onChange={set('city')} required /></Field>
            <Field label="Street and building" error={errors.street}><input value={form.street} onChange={set('street')} required placeholder="Abovyan St 12" /></Field>
            <Field label="Apartment (optional)" error={errors.apartment}><input value={form.apartment} onChange={set('apartment')} placeholder="Apt 5, floor 3" /></Field>
          </div>
          <Field label="Note for delivery (optional)" error={errors.note}><textarea value={form.note} onChange={set('note')} rows={2} placeholder="Call before arriving, entrance from the yard…" /></Field>
        </div>
        <div className="card">
          <h2 className="card-title">2. Payment</h2>
          <div className="pay-option"><span className="radio-dot" /> <b>Cash on delivery</b> <span className="muted">— pay the courier when your order arrives</span></div>
        </div>
        <div className="card">
          <h2 className="card-title">3. Review items</h2>
          {cart.groups.map((g) => (
            <div key={g.seller_id} className="checkout-group">
              <div className="seller-group-head"><span>From <b>{g.store_name}</b></span><b>{amd(g.subtotal_amd)}</b></div>
              {g.items.map((i) => (
                <div key={i.product_id} className="checkout-item">
                  {i.image && <img src={i.image.thumb} alt="" />}
                  <span className="grow">{i.title} <span className="muted">× {i.quantity}</span></span>
                  <b>{amd(i.line_total)}</b>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <aside className="card cart-summary">
        <button className="btn btn-accent btn-block btn-lg" type="submit" disabled={placing}>{placing ? 'Placing order…' : 'Place order'}</button>
        <hr />
        <div className="row between"><span>Items ({cart.count})</span><span>{amd(cart.total_amd)}</span></div>
        <div className="row between"><span>Delivery</span><span>Free</span></div>
        <hr />
        <div className="row between total"><span>Order total</span><Price value={cart.total_amd} /></div>
        <div className="pay-note">Payment: <b>cash on delivery</b></div>
      </aside>
    </form>
  );
}
