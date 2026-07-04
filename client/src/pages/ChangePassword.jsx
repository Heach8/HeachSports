import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';

export default function ChangePassword({ forced = false }) {
  const { user, setUser } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  if (!user) return <p className="muted">Giriş yapmalısınız.</p>;

  const mismatch = confirm.length > 0 && password !== confirm;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) return setError('Şifre en az 6 karakter olmalı.');
    if (password !== confirm) return setError('Şifreler eşleşmiyor.');
    try {
      const d = await api('/auth/change-password', { method: 'POST', body: { password, password_confirm: confirm } });
      setUser(d.user);
      if (!forced) navigate('/');
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="card" style={{ maxWidth: 440, margin: '60px auto' }}>
      <h1>Şifre Belirle</h1>
      {forced && (
        <p className="muted" style={{ marginBottom: 10 }}>
          Merhaba {user.name}! Güvenliğiniz için, size verilen geçici şifreyi değiştirmeden devam edemezsiniz.
        </p>
      )}
      {error && <div className="error">{error}</div>}
      <form onSubmit={submit}>
        <label>Yeni Şifre (en az 6 karakter)</label>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
        <label>Yeni Şifre (tekrar)</label>
        <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required
          style={mismatch ? { borderColor: 'var(--red)' } : confirm ? { borderColor: 'var(--green)' } : {}} />
        {mismatch && <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 4 }}>Şifreler eşleşmiyor</p>}
        <button className="btn primary" style={{ marginTop: 16, width: '100%' }} disabled={mismatch || !password}>
          Şifreyi Kaydet
        </button>
      </form>
    </div>
  );
}
