import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useStore } from '../store';
import { ErrorBox, ProductCard, Spinner } from '../components/ui';

const CAT_ICONS = { electronics: '🎧', fashion: '👕', 'home-kitchen': '☕', books: '📚', beauty: '🌹', sports: '⚽', toys: '🧸', food: '🍑' };

export default function Home() {
  const { categories, user } = useStore();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    api('/products?sort=newest&limit=12').then(setData).catch(setError);
  }, []);
  return (
    <div className="home">
      <section className="hero">
        <div className="hero-text">
          <span className="hero-kicker">Շուկա · Armenian marketplace</span>
          <h1>Everything from local sellers, delivered across Armenia.</h1>
          <p>Shop from many stores in one cart. Pay in cash when your order arrives — in Yerevan or any of the 10 marzer.</p>
          <div className="hero-cta">
            <Link to="/search" className="btn btn-primary btn-lg">Start shopping</Link>
            <Link to={user?.is_seller ? '/seller' : '/sell'} className="btn btn-light btn-lg">{user?.is_seller ? 'Seller dashboard' : 'Sell on Shuka'}</Link>
          </div>
        </div>
        <div className="hero-perks">
          <div><b>💵 Cash on delivery</b><span>No cards, no prepayment</span></div>
          <div><b>🚚 All of Armenia</b><span>Yerevan + 10 marzer</span></div>
          <div><b>⭐ Real reviews</b><span>Only from delivered orders</span></div>
        </div>
      </section>

      <section>
        <h2 className="section-title">Shop by category</h2>
        <div className="cat-grid">
          {categories.map((c) => (
            <Link key={c.slug} to={`/c/${c.slug}`} className={`cat-tile cat-${c.slug}`}>
              <span className="cat-tile-icon">{CAT_ICONS[c.slug] || '🛒'}</span>
              <b>{c.name}</b>
              <span>{c.product_count} products</span>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div className="section-head">
          <h2 className="section-title">New arrivals</h2>
          <Link to="/search?sort=newest" className="link">See all →</Link>
        </div>
        <ErrorBox error={error} />
        {!data && !error ? <Spinner /> : data && (
          <div className="grid">{data.products.map((p) => <ProductCard key={p.id} p={p} />)}</div>
        )}
      </section>
    </div>
  );
}
