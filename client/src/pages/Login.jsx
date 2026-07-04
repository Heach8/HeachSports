import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { setUser } = useAuth();
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const d = await api('/auth/login', { method: 'POST', body: { email, password } });
      setUser(d.user);
      const target = d.user.role === 'captain' ? '/kaptan'
        : d.user.role === 'scorekeeper' ? '/konsol' : '/admin';
      navigate(target);
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="card" style={{ maxWidth: 400, margin: '60px auto' }}>
      <h1>Giriş</h1>
      {error && <div className="error">{error}</div>}
      <form onSubmit={submit}>
        <label>E-posta</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
        <label>Şifre</label>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
        <button className="btn primary" style={{ marginTop: 16, width: '100%' }}>Giriş Yap</button>
      </form>
    </div>
  );
}
