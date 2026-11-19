import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { amd, api } from '../../api';
import { useStore } from '../../store';
import { Empty, ErrorBox, Spinner } from '../../components/ui';

export default function SellerProducts() {
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  const { notify } = useStore();
  const load = () => api('/seller/products').then((d) => setList(d.products)).catch(setError);
  useEffect(() => { load(); }, []);

  const toggle = async (p) => {
    try {
      await api(`/seller/products/${p.id}`, { method: 'PATCH', body: { is_published: !p.is_published } });
      notify(p.is_published ? 'Product unpublished' : 'Product published');
      load();
    } catch (e) { setError(e); }
  };

  if (!list) return error ? <ErrorBox error={error} /> : <Spinner />;
  return (
    <div>
      <div className="row between mb">
        <span className="muted">{list.length} products</span>
        <Link to="/seller/products/new" className="btn btn-accent">+ Add product</Link>
      </div>
      <ErrorBox error={error} />
      {list.length === 0 ? (
        <Empty title="No products yet" icon="📦"><Link to="/seller/products/new" className="btn btn-primary">Add your first product</Link></Empty>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th></th><th>Title</th><th>Price</th><th>Stock</th><th>Status</th><th>Sold</th><th></th></tr></thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} className={p.is_published ? '' : 'dim'}>
                  <td><div className="tbl-thumb">{p.image ? <img src={p.image.thumb} alt="" /> : '—'}</div></td>
                  <td data-label="Title"><Link to={`/p/${p.id}`} className="tbl-title">{p.title}</Link><div className="muted small">{p.category_name}</div></td>
                  <td data-label="Price">{amd(p.price_amd)}</td>
                  <td data-label="Stock"><span className={p.stock === 0 ? 'stock out' : p.stock <= 3 ? 'stock low' : ''}>{p.stock}</span></td>
                  <td data-label="Status">{p.is_published ? <span className="badge badge-delivered">Published</span> : <span className="badge badge-cancelled">Unpublished</span>}</td>
                  <td data-label="Sold">{p.units_sold}</td>
                  <td className="tbl-actions">
                    <Link to={`/seller/products/${p.id}`} className="btn btn-light btn-sm">Edit</Link>
                    <button className="btn btn-ghost btn-sm" onClick={() => toggle(p)}>{p.is_published ? 'Unpublish' : 'Publish'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
