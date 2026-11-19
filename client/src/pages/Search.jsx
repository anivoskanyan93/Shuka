import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useStore } from '../store';
import { Empty, ErrorBox, Pagination, ProductCard, Spinner } from '../components/ui';

const SORTS = [['newest', 'Newest'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low'], ['rating', 'Customer rating']];

export default function Search() {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const { categories } = useStore();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const q = params.get('q') || '';
  const sort = params.get('sort') || 'newest';
  const page = parseInt(params.get('page'), 10) || 1;
  const minPrice = params.get('minPrice') || '';
  const maxPrice = params.get('maxPrice') || '';
  const [minIn, setMinIn] = useState(minPrice);
  const [maxIn, setMaxIn] = useState(maxPrice);
  const category = categories.find((c) => c.slug === slug);

  useEffect(() => { setMinIn(minPrice); setMaxIn(maxPrice); }, [minPrice, maxPrice]);

  useEffect(() => {
    const qs = new URLSearchParams(params);
    if (slug) qs.set('category', slug);
    setData(null); setError(null);
    api(`/products?${qs}`).then(setData).catch(setError);
  }, [params, slug]);

  const update = (changes) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) { if (v === '' || v == null) next.delete(k); else next.set(k, v); }
    if (!('page' in changes)) next.delete('page');
    setParams(next);
  };
  const goCategory = (s) => {
    const next = new URLSearchParams(params);
    next.delete('page');
    nav(s ? `/c/${s}?${next}` : `/search?${next}`);
  };
  const applyPrice = (e) => { e.preventDefault(); update({ minPrice: minIn, maxPrice: maxIn }); setShowFilters(false); };

  const title = q ? `Results for “${q}”` : category ? category.name : 'All products';

  return (
    <div className="search-page">
      <aside className={`filters ${showFilters ? 'open' : ''}`}>
        <div className="filters-head"><b>Filters</b><button className="btn btn-ghost show-sm" onClick={() => setShowFilters(false)}>✕</button></div>
        <div className="filter-block">
          <h4>Category</h4>
          <button className={`filter-opt ${!slug ? 'active' : ''}`} onClick={() => goCategory(null)}>All categories</button>
          {categories.map((c) => (
            <button key={c.slug} className={`filter-opt ${slug === c.slug ? 'active' : ''}`} onClick={() => goCategory(c.slug)}>{c.name}</button>
          ))}
        </div>
        <form className="filter-block" onSubmit={applyPrice}>
          <h4>Price (AMD)</h4>
          <div className="price-range">
            <input type="number" min="0" placeholder="From" value={minIn} onChange={(e) => setMinIn(e.target.value)} />
            <span>–</span>
            <input type="number" min="0" placeholder="To" value={maxIn} onChange={(e) => setMaxIn(e.target.value)} />
          </div>
          <div className="row gap-sm">
            <button className="btn btn-primary btn-sm" type="submit">Apply</button>
            {(minPrice || maxPrice) && <button className="btn btn-ghost btn-sm" type="button" onClick={() => update({ minPrice: '', maxPrice: '' })}>Clear</button>}
          </div>
        </form>
      </aside>

      <section className="results">
        <div className="results-head">
          <div>
            <h1 className="page-title">{title}</h1>
            <div className="muted">{data ? `${data.total} ${data.total === 1 ? 'result' : 'results'}` : '…'}
              {(minPrice || maxPrice) && <> · price {minPrice || 0} – {maxPrice || '∞'} ֏</>}</div>
          </div>
          <div className="row gap-sm">
            <button className="btn btn-light show-sm" onClick={() => setShowFilters(true)}>Filters</button>
            <label className="sort">
              <span className="hide-sm">Sort by</span>
              <select value={sort} onChange={(e) => update({ sort: e.target.value })}>
                {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          </div>
        </div>
        <ErrorBox error={error} />
        {!data && !error && <Spinner />}
        {data && data.products.length === 0 && (
          <Empty title="No products found" icon="🔍">
            <p className="muted">Try another word, remove a filter, or browse everything.</p>
            <Link to="/search" className="btn btn-primary">See all products</Link>
          </Empty>
        )}
        {data && data.products.length > 0 && (
          <>
            <div className="grid">{data.products.map((p) => <ProductCard key={p.id} p={p} />)}</div>
            <Pagination page={data.page} pages={data.pages} onPage={(n) => { update({ page: n }); window.scrollTo(0, 0); }} />
          </>
        )}
      </section>
    </div>
  );
}
