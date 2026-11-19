import { useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { useStore } from '../../store';
import { ErrorBox, Field } from '../../components/ui';

export default function BecomeSeller() {
  const { user, setUser, notify } = useStore();
  const nav = useNavigate();
  const [form, setForm] = useState({ store_name: '', phone: user.phone });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const justActivated = useRef(false);
  if (justActivated.current) return <Navigate to="/seller/products/new" replace />;
  if (user.is_seller) return <Navigate to="/seller" replace />;
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const r = await api('/seller/activate', { method: 'POST', body: form });
      justActivated.current = true;
      setUser(r.user); notify('Your store is open! Add your first product.');
    } catch (err) { setError(err); setBusy(false); }
  };
  const fe = error?.fields || {};
  return (
    <div className="sell-hero">
      <div className="sell-pitch">
        <h1>Sell on Shuka</h1>
        <p>Reach buyers in all of Armenia. No fees, no setup — your store is active right away.</p>
        <ul className="checklist">
          <li>List products with up to 5 photos</li>
          <li>See every order with the buyer's phone and address</li>
          <li>Buyers pay the courier in cash on delivery</li>
        </ul>
      </div>
      <form className="card auth-card" onSubmit={submit}>
        <h2>Open your store</h2>
        {error && !Object.keys(fe).length && <ErrorBox error={error} />}
        <Field label="Store name" error={fe.store_name}><input value={form.store_name} onChange={(e) => setForm({ ...form, store_name: e.target.value })} required placeholder="e.g. Yerevan Crafts" /></Field>
        <Field label="Store phone" error={fe.phone}><input value={form.phone} type="tel" onChange={(e) => setForm({ ...form, phone: e.target.value })} required /></Field>
        <button className="btn btn-accent btn-block btn-lg" disabled={busy}>Become a seller</button>
      </form>
    </div>
  );
}
