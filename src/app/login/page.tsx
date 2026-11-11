'use client';
import { useState } from 'react';
import { browserClient } from '@/lib/supabase/client';

export default function Login() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setInfo(''); setBusy(true);
    const sb = browserClient();
    if (mode === 'in') {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) { setErr(error.message); setBusy(false); return; }
      window.location.href = '/dashboard';
    } else {
      if (password.length < 8) { setErr('Use a password with at least 8 characters.'); setBusy(false); return; }
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name: name }, emailRedirectTo: `${window.location.origin}/auth/callback` } });
      if (error) { setErr(error.message); setBusy(false); return; }
      if (data.session) window.location.href = '/dashboard';
      else { setInfo('Check your email and open the confirmation link to finish signing up.'); setBusy(false); }
    }
  }

  return (
    <div className="auth">
      <div className="card">
        <div className="brand" style={{ padding: 0 }}><div className="mark">GX</div><div><b>GoXL Commerce</b><span>CLARITY BEFORE ACTION</span></div></div>
        <h1>{mode === 'in' ? 'Sign in' : 'Create your account'}</h1>
        {err && <div className="flash err" role="alert">{err}</div>}
        {info && <div className="flash" role="status">{info}</div>}
        <form onSubmit={submit}>
          {mode === 'up' && <label className="f">Your name<input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required /></label>}
          <label className="f">Email<input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label>
          <label className="f">Password<input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} required /></label>
          <button className="btn pri" style={{ width: '100%' }} disabled={busy}>{busy ? 'Please wait' : mode === 'in' ? 'Sign in' : 'Create account'}</button>
        </form>
        <p className="muted" style={{ marginTop: 14 }}>
          {mode === 'in' ? 'New to GoXL Commerce? ' : 'Already have an account? '}
          <a href="#" onClick={(e) => { e.preventDefault(); setMode(mode === 'in' ? 'up' : 'in'); setErr(''); setInfo(''); }}>{mode === 'in' ? 'Create an account' : 'Sign in'}</a>
        </p>
      </div>
    </div>
  );
}
