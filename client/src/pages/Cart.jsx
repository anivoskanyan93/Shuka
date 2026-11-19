import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { amd, api } from '../api';
import { useStore } from '../store';
import { Empty, ErrorBox, Price, QtyInput, Spinner } from '../components/ui';

export default function Cart() {
  const { setCartCount } = useStore();
  const [cart, setCart] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  const apply = (c) => { setCart(c); setCartCount(c.count); };
  useEffect(() => { api('/cart').then(apply).catch(setError); }, []); // eslint-disable-line

  const run = async (fn) => {
    setBusy(true); setError(null);
    try { apply(await fn()); } catch (e) { setError(e); api('/cart').then(apply).catch(() => {}); } finally { setBusy(false); }
  };
  const setQty = (pid, quantity) => run(() => api(`/cart/items/${pid}`, { method: 'PUT', body: { quantity } }));
  const remove = (pid) => run(() => api(`/cart/items/${pid}`, { method: 'DELETE' }));
  const acceptPrices = () => run(() => api('/cart/accept-prices', { method: 'POST' }));

  if (!cart) return error ? <ErrorBox error={error} /> : <Spinner />;
  if (cart.groups.length === 0) {
    return <Empty title="Your cart is empty" icon="🛒"><p className="muted">Find something you like and add it here.</p><Link to="/search" className="btn btn-primary">Browse products</Link></Empty>;
  }
  const anyPriceChanged = cart.groups.some((g) => g.items.some((i) => i.price_changed));
  const blocked = cart.groups.some((g) => g.items.some((i) => i.sold_out || i.over_stock));

  return (
    <div className="cart-page">
      <div className="cart-main">
        <h1 className="page-title">Shopping cart</h1>
        <ErrorBox error={error} />
        {anyPriceChanged && (
          <div className="alert alert-warn row between wrap">
            <span>Some prices changed since you added the items. Please review the new prices.</span>
            <button className="btn btn-sm btn-primary" onClick={acceptPrices} disabled={busy}>Accept new prices</button>
          </div>
        )}
        {cart.groups.map((g) => (
          <div key={g.seller_id} className="card seller-group">
            <div className="seller-group-head"><span>Sold by <b>{g.store_name}</b></span><span>Subtotal: <b>{amd(g.subtotal_amd)}</b></span></div>
            {g.items.map((i) => (
              <div key={i.product_id} className={`cart-item ${i.sold_out ? 'is-out' : ''}`}>
                <Link to={`/p/${i.product_id}`} className="cart-thumb">{i.image && <img src={i.image.thumb} alt="" />}</Link>
                <div className="cart-item-info">
                  <Link to={`/p/${i.product_id}`} className="cart-item-title">{i.title}</Link>
                  {i.sold_out && <div className="tag tag-danger">Sold out — remove it to continue</div>}
                  {i.over_stock && <div className="tag tag-warn">Only {i.stock} left — lower the quantity</div>}
                  {i.price_changed && (
                    <div className="tag tag-warn">Price changed: <s>{amd(i.price_when_added)}</s> → <b>{amd(i.price_amd)}</b></div>
                  )}
                  {!i.sold_out && i.stock <= 3 && !i.over_stock && <div className="small stock low">Only {i.stock} left</div>}
                  <div className="row gap-sm wrap cart-item-actions">
                    {!i.sold_out && <QtyInput value={i.quantity} max={i.stock} onChange={(n) => setQty(i.product_id, n)} disabled={busy} />}
                    <button className="btn btn-ghost btn-sm" onClick={() => remove(i.product_id)} disabled={busy}>Remove</button>
                  </div>
                </div>
                <div className="cart-item-price"><Price value={i.line_total} />{i.quantity > 1 && <div className="small muted">{amd(i.price_amd)} each</div>}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <aside className="card cart-summary">
        <div className="row between"><span>Items ({cart.count})</span><b>{amd(cart.total_amd)}</b></div>
        <div className="row between muted"><span>Sellers</span><span>{cart.groups.length}</span></div>
        <hr />
        <div className="row between total"><span>Total</span><Price value={cart.total_amd} /></div>
        <div className="small muted">Payment: cash on delivery</div>
        <button className="btn btn-accent btn-block btn-lg" disabled={busy || blocked || anyPriceChanged} onClick={() => nav('/checkout')}>Proceed to checkout</button>
        {(blocked || anyPriceChanged) && <div className="small muted">Fix the warnings above to continue.</div>}
      </aside>
    </div>
  );
}
