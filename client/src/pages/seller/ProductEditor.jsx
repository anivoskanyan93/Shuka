import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, shrinkImage } from '../../api';
import { useStore } from '../../store';
import { ErrorBox, Field, Spinner } from '../../components/ui';

const MAX_MB = 8;
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/heic', 'image/heif'];

export default function ProductEditor() {
  const { id } = useParams();
  const isNew = !id;
  const nav = useNavigate();
  const { categories, notify } = useStore();
  const [form, setForm] = useState({ title: '', category_id: '', description: '', price_amd: '', stock: '1', is_published: true });
  const [images, setImages] = useState([]); // saved images
  const [pending, setPending] = useState([]); // {file, url} not uploaded yet (new product)
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (isNew) return;
    api(`/seller/products/${id}`).then(({ product: p }) => {
      setForm({ title: p.title, category_id: String(p.category_id), description: p.description, price_amd: String(p.price_amd), stock: String(p.stock), is_published: p.is_published });
      setImages(p.images);
      setLoading(false);
    }).catch((e) => { setError(e); setLoading(false); });
  }, [id, isNew]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const total = images.length + pending.length;

  const checkFiles = (files) => {
    for (const f of files) {
      if (!TYPES.includes(f.type)) return `"${f.name}" is not a supported image (JPEG, PNG, WebP)`;
      if (f.size > MAX_MB * 1024 * 1024) return `"${f.name}" is too large (${(f.size / 1048576).toFixed(1)} MB). Maximum is ${MAX_MB} MB.`;
    }
    if (total + files.length > 5) return `You can have at most 5 images (you have ${total}).`;
    return null;
  };

  const uploadFiles = async (productId, files) => {
    const fd = new FormData();
    for (const f of files) fd.append('images', await shrinkImage(f));
    return api(`/seller/products/${productId}/images`, { method: 'POST', form: fd });
  };

  const onPick = async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    const msg = checkFiles(files);
    if (msg) { setErrors({ ...errors, images: msg }); return; }
    setErrors({ ...errors, images: null });
    if (isNew) {
      setPending([...pending, ...files.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
      return;
    }
    setUploading(true);
    try { const r = await uploadFiles(id, files); setImages(r.images); notify('Images uploaded'); } catch (err) { setErrors({ ...errors, images: err.message }); } finally { setUploading(false); }
  };

  const removeImage = async (img) => {
    try { const r = await api(`/seller/products/${id}/images?image_id=${img.id}`, { method: 'DELETE' }); setImages(r.images); } catch (err) { setErrors({ ...errors, images: err.message }); }
  };
  const makeMain = async (img) => {
    try { await api(`/seller/products/${id}`, { method: 'PATCH', body: { main_image_id: img.id } }); setImages([img, ...images.filter((i) => i.id !== img.id)]); } catch (err) { setError(err); }
  };
  const pendingMain = (idx) => setPending([pending[idx], ...pending.filter((_, i) => i !== idx)]);

  const submit = async (e) => {
    e.preventDefault();
    setErrors({}); setError(null);
    const body = { ...form, price_amd: Number(form.price_amd), stock: Number(form.stock), category_id: Number(form.category_id) };
    if (isNew && form.is_published && pending.length === 0) { setErrors({ images: 'Add at least one image' }); return; }
    setSaving(true);
    try {
      if (isNew) {
        const { is_published, ...rest } = body;
        const r = await api('/seller/products', { method: 'POST', body: rest });
        const pid = r.product.id;
        if (pending.length) {
          try { await uploadFiles(pid, pending.map((p) => p.file)); } catch (err) {
            notify('Product saved, but images failed: ' + err.message, 'error');
            nav(`/seller/products/${pid}`, { replace: true }); return;
          }
        }
        if (is_published && pending.length) await api(`/seller/products/${pid}`, { method: 'PATCH', body: { is_published: true } });
        notify('Product created');
        nav('/seller/products');
      } else {
        await api(`/seller/products/${id}`, { method: 'PATCH', body });
        notify('Product saved');
        nav('/seller/products');
      }
    } catch (err) {
      setErrors(err.fields || {}); if (!err.fields || !Object.keys(err.fields).length) setError(err);
      setSaving(false);
    }
  };

  if (loading) return <Spinner />;
  const shown = isNew ? pending.map((p, i) => ({ id: 'p' + i, thumb: p.url, idx: i })) : images;

  return (
    <form className="editor" onSubmit={submit}>
      <div className="row between mb">
        <h2>{isNew ? 'Add a product' : 'Edit product'}</h2>
        <Link to="/seller/products" className="link">← Back to products</Link>
      </div>
      <ErrorBox error={error} />
      <div className="editor-grid">
        <div className="card">
          <Field label="Title" error={errors.title}><input value={form.title} onChange={set('title')} placeholder="e.g. Handmade ceramic mug" /></Field>
          <Field label="Category" error={errors.category_id}>
            <select value={form.category_id} onChange={set('category_id')}>
              <option value="">Choose a category…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Description" error={errors.description} hint="At least 10 characters"><textarea rows={6} value={form.description} onChange={set('description')} /></Field>
          <div className="form-grid">
            <Field label="Price (AMD)" error={errors.price_amd}><div className="input-suffix"><input type="number" min="1" step="1" value={form.price_amd} onChange={set('price_amd')} /><span>֏</span></div></Field>
            <Field label="Stock" error={errors.stock}><input type="number" min="0" step="1" value={form.stock} onChange={set('stock')} /></Field>
          </div>
          <label className="check"><input type="checkbox" checked={form.is_published} onChange={set('is_published')} /> Published (visible in the store)</label>
        </div>
        <div className="card">
          <h3 className="card-title">Images <span className="muted small">({total}/5)</span></h3>
          <div className="img-grid">
            {shown.map((img, i) => (
              <div key={img.id} className={`img-slot ${i === 0 ? 'is-main' : ''}`}>
                <img src={img.thumb} alt="" />
                {i === 0 ? <span className="img-main-tag">Main</span> : (
                  <button type="button" className="img-btn" onClick={() => (isNew ? pendingMain(img.idx) : makeMain(img))}>Make main</button>
                )}
                <button type="button" className="img-del" aria-label="Remove" onClick={() => (isNew ? setPending(pending.filter((_, j) => j !== img.idx)) : removeImage(img))}>✕</button>
              </div>
            ))}
            {total < 5 && (
              <label className="img-add">
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={onPick} hidden />
                <span>{uploading ? 'Uploading…' : '+ Add photos'}</span>
                <small>JPEG, PNG, WebP · max {MAX_MB} MB</small>
              </label>
            )}
          </div>
          {errors.images && <div className="field-error">{errors.images}</div>}
          <p className="muted small">The first image is the main one shown in search results.</p>
        </div>
      </div>
      <div className="editor-actions">
        <Link to="/seller/products" className="btn btn-ghost">Cancel</Link>
        <button className="btn btn-accent btn-lg" disabled={saving || uploading}>{saving ? 'Saving…' : 'Save product'}</button>
      </div>
    </form>
  );
}
