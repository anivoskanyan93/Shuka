import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, fmtDate } from '../api';
import { useStore } from '../store';
import { Empty, ErrorBox, Price, QtyInput, Spinner, Stars } from '../components/ui';

function stockLabel(stock) {
  if (stock === 0) return <span className="stock out">Out of stock</span>;
  if (stock <= 3) return <span className="stock low">Only {stock} left</span>;
  return <span className="stock in">In stock</span>;
}

export default function Product() {
  const { id } = useParams();
  const { user, setCartCount, notify } = useStore();
  const nav = useNavigate();
  const loc = useLocation();
  const [p, setP] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [error, setError] = useState(null);
  const [active, setActive] = useState(0);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [addError, setAddError] = useState(null);

  useEffect(() => {
    setP(null); setError(null); setActive(0); setQty(1);
    api(`/products/${id}`).then((d) => setP(d.product)).catch(setError);
    api(`/products/${id}/reviews`).then((d) => setReviews(d.reviews)).catch(() => {});
  }, [id]);

  const add = async (buyNow) => {
    if (!user) return nav(`/login?next=${encodeURIComponent(loc.pathname)}`);
    setBusy(true); setAddError(null);
    try {
      const cart = await api(`/cart/items/${p.id}`, { method: 'PUT', body: { quantity: qty, add: true } });
      setCartCount(cart.count);
      if (buyNow) nav('/cart'); else notify(`Added ${qty} × ${p.title} to cart`);
    } catch (e) {
      setAddError(e);
    } finally { setBusy(false); }
  };

  if (error) return <Empty title="Product not found" icon="🤷"><Link to="/search" className="btn btn-primary">Browse products</Link></Empty>;
  if (!p) return <Spinner />;

  return (
    <div className="product-page">
      <nav className="crumbs"><Link to="/">Home</Link> › <Link to={`/c/${p.category.slug}`}>{p.category.name}</Link> › <span>{p.title}</span></nav>
      <div className="product-main">
        <div className="gallery">
          <div className="gallery-main">
            {p.images.length ? <img src={p.images[active].large} alt={p.title} /> : <div className="noimg">No image</div>}
          </div>
          {p.images.length > 1 && (
            <div className="gallery-thumbs">
              {p.images.map((im, i) => (
                <button key={im.id} className={i === active ? 'active' : ''} onClick={() => setActive(i)} onMouseEnter={() => setActive(i)}>
                  <img src={im.thumb} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="product-info">
          <h1>{p.title}</h1>
          <div className="muted">Sold by <b>{p.store_name}</b></div>
          <a href="#reviews"><Stars value={p.rating_avg} count={p.rating_count} size="md" /></a>
          <hr />
          <Price value={p.price_amd} className="price-xl" />
          <div className="muted small">Pay in cash on delivery</div>
          <h3>About this item</h3>
          <p className="desc">{p.description}</p>
        </div>
        <div className="buybox">
          <Price value={p.price_amd} className="price-lg" />
          <div className="small muted">Delivery across Armenia</div>
          {stockLabel(p.stock)}
          {!p.is_published && <div className="alert alert-warn">This product is unpublished — only you can see it.</div>}
          {p.is_own ? (
            <div className="alert alert-info">This is your product. <Link to={`/seller/products/${p.id}`}>Edit it</Link></div>
          ) : p.stock > 0 && p.is_published ? (
            <>
              <label className="row gap-sm qty-row"><span>Quantity</span><QtyInput value={qty} max={p.stock} onChange={setQty} /></label>
              <button className="btn btn-primary btn-block btn-lg" disabled={busy} onClick={() => add(false)}>Add to cart</button>
              <button className="btn btn-accent btn-block btn-lg" disabled={busy} onClick={() => add(true)}>Buy now</button>
              <ErrorBox error={addError} />
            </>
          ) : null}
          <div className="buybox-meta">
            <div><span>Ships from</span><b>{p.store_name}</b></div>
            <div><span>Payment</span><b>Cash on delivery</b></div>
          </div>
        </div>
      </div>

      <section id="reviews" className="reviews">
        <h2 className="section-title">Customer reviews</h2>
        <div className="reviews-summary"><Stars value={p.rating_avg} size="lg" /> <b>{p.rating_count ? `${p.rating_avg.toFixed(1)} out of 5` : 'No reviews yet'}</b> <span className="muted">{p.rating_count} ratings</span></div>
        {reviews.length === 0 && <p className="muted">Reviews come from buyers whose order was delivered.</p>}
        {reviews.map((r) => (
          <div key={r.id} className="review">
            <div className="review-head"><span className="avatar">{r.buyer_name[0]}</span><b>{r.buyer_name}</b></div>
            <div className="row gap-sm"><Stars value={r.rating} /><span className="muted small">{fmtDate(r.created_at)} · Verified purchase</span></div>
            {r.body && <p>{r.body}</p>}
          </div>
        ))}
      </section>
    </div>
  );
}
