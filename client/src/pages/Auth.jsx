import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useStore } from '../store';
import { ErrorBox, Field } from '../components/ui';

function useAfterAuth() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { refresh } = useStore();
  return async () => { await refresh(); nav(params.get('next') || '/', { replace: true }); };
}

export function Login() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [params] = useSearchParams();
  const done = useAfterAuth();
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(null);
    try { await api('/auth/login', { method: 'POST', body: form }); await done(); } catch (err) { setError(err); setBusy(false); }
  };
  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={submit}>
        <h1>Sign in</h1>
        <ErrorBox error={error} />
        <Field label="Email"><input type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></Field>
        <Field label="Password"><input type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></Field>
        <button className="btn btn-accent btn-block btn-lg" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <div className="demo-hint">
          <b>Demo accounts</b> (password <code>shuka1234</code>):<br />
          Buyer: <code>buyer1@shuka.am</code> · Seller: <code>ani@shuka.am</code>
        </div>
        <div className="auth-alt">New to Shuka? <Link to={`/register${params.get('next') ? `?next=${encodeURIComponent(params.get('next'))}` : ''}`}>Create your account</Link></div>
      </form>
    </div>
  );
}

export function Register() {
  const [form, setForm] = useState({ name: '', email: '', phone: '+374 ', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const done = useAfterAuth();
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(null);
    try { await api('/auth/register', { method: 'POST', body: form }); await done(); } catch (err) { setError(err); setBusy(false); }
  };
  const fe = error?.fields || {};
  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={submit}>
        <h1>Create account</h1>
        {error && !Object.keys(fe).length && <ErrorBox error={error} />}
        <Field label="Your name" error={fe.name}><input autoComplete="name" value={form.name} onChange={set('name')} required /></Field>
        <Field label="Email" error={fe.email}><input type="email" autoComplete="email" value={form.email} onChange={set('email')} required /></Field>
        <Field label="Phone" error={fe.phone}><input type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} required /></Field>
        <Field label="Password" error={fe.password} hint="At least 8 characters"><input type="password" autoComplete="new-password" value={form.password} onChange={set('password')} required minLength={8} /></Field>
        <button className="btn btn-accent btn-block btn-lg" disabled={busy}>{busy ? 'Creating…' : 'Create your Shuka account'}</button>
        <div className="auth-alt">Already have an account? <Link to="/login">Sign in</Link></div>
      </form>
    </div>
  );
}
