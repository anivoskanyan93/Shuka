import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useStore } from '../store';
import { Field } from '../components/ui';

export default function Account() {
  const { user, setUser, notify } = useStore();
  const [form, setForm] = useState({ name: user.name, phone: user.phone });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErrors({});
    try { const r = await api('/me', { method: 'PATCH', body: form }); setUser(r.user); notify('Saved'); } catch (err) { setErrors(err.fields || { name: err.message }); } finally { setBusy(false); }
  };
  return (
    <div className="narrow">
      <h1 className="page-title">Your account</h1>
      <form className="card" onSubmit={submit}>
        <Field label="Email"><input value={user.email} disabled /></Field>
        <Field label="Name" error={errors.name}><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Phone" error={errors.phone}><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
        <button className="btn btn-primary" disabled={busy}>Save changes</button>
      </form>
      <div className="card row between wrap">
        {user.is_seller ? <span>Your store: <b>{user.store_name}</b></span> : <span>Want to sell your products?</span>}
        <Link className="btn btn-light" to={user.is_seller ? '/seller' : '/sell'}>{user.is_seller ? 'Seller dashboard' : 'Sell on Shuka'}</Link>
      </div>
    </div>
  );
}
