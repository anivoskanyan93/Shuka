import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../store';
import { onWaking } from '../api';

function SearchBar() {
  const [params] = useSearchParams();
  const loc = useLocation();
  const [q, setQ] = useState(params.get('q') || '');
  const nav = useNavigate();
  useEffect(() => { if (loc.pathname === '/search') setQ(params.get('q') || ''); }, [params, loc.pathname]);
  const submit = (e) => {
    e.preventDefault();
    const next = new URLSearchParams();
    if (q.trim()) next.set('q', q.trim());
    nav(`/search?${next}`);
  };
  return (
    <form className="searchbar" onSubmit={submit} role="search">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products…" aria-label="Search" />
      <button type="submit" aria-label="Search">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      </button>
    </form>
  );
}

function AccountMenu() {
  const { user, logout, notify } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef();
  const nav = useNavigate();
  const loc = useLocation();
  useEffect(() => { setOpen(false); }, [loc.pathname]);
  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, []);
  if (!user) {
    return <Link to="/login" className="hdr-link"><span className="hdr-small">Hello, sign in</span><b>Account</b></Link>;
  }
  return (
    <div className="acct" ref={ref}>
      <button className="hdr-link" onClick={() => setOpen(!open)}>
        <span className="hdr-small">Hello, {user.name.split(' ')[0]}</span><b>Account ▾</b>
      </button>
      {open && (
        <div className="acct-menu">
          <Link to="/orders">My orders</Link>
          {user.is_seller ? <Link to="/seller">Seller dashboard</Link> : <Link to="/sell">Sell on Shuka</Link>}
          <Link to="/account">Account settings</Link>
          <button onClick={async () => { await logout(); notify('Signed out'); nav('/'); }}>Log out</button>
        </div>
      )}
    </div>
  );
}

function Header() {
  const { cartCount, categories, user } = useStore();
  return (
    <header className="hdr">
      <div className="hdr-top container">
        <Link to="/" className="logo"><span className="logo-mark">🛍</span><span>Shuka</span></Link>
        <SearchBar />
        <nav className="hdr-actions">
          <AccountMenu />
          <Link to="/orders" className="hdr-link hide-sm"><span className="hdr-small">Returns</span><b>& Orders</b></Link>
          <Link to="/cart" className="cart-link" aria-label="Cart">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2" /><circle cx="10" cy="20" r="1.4" /><circle cx="17" cy="20" r="1.4" /></svg>
            <span className="cart-count">{cartCount}</span>
            <b className="hide-sm">Cart</b>
          </Link>
        </nav>
      </div>
      <div className="hdr-cats">
        <div className="container hdr-cats-inner">
          <NavLink to="/search" end className="cat-pill">All</NavLink>
          {categories.map((c) => <NavLink key={c.slug} to={`/c/${c.slug}`} className="cat-pill">{c.name}</NavLink>)}
          <span className="spacer" />
          {user?.is_seller
            ? <NavLink to="/seller" className="cat-pill sell-pill">Seller dashboard</NavLink>
            : <NavLink to="/sell" className="cat-pill sell-pill">Sell on Shuka</NavLink>}
        </div>
      </div>
    </header>
  );
}

export default function Layout() {
  const { toast } = useStore();
  const [waking, setWaking] = useState(false);
  const loc = useLocation();
  useEffect(() => { onWaking(setWaking); }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);
  return (
    <>
      <Header />
      {waking && <div className="waking">Waking up the server… this can take up to a minute the first time.</div>}
      <main className="container main"><Outlet /></main>
      <footer className="footer">
        <div className="container footer-inner">
          <div><b>Shuka</b> — the Armenian marketplace. Prices in AMD, delivery across Armenia, cash on delivery.</div>
          <div className="footer-links"><Link to="/search">All products</Link><Link to="/sell">Sell on Shuka</Link><Link to="/orders">My orders</Link></div>
        </div>
      </footer>
      {toast && <div key={toast.id} className={`toast toast-${toast.kind}`}>{toast.message}</div>}
    </>
  );
}
