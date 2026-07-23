import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, setOrgSlug } from '../api.js';
import { useAuth } from '../App.jsx';

export default function Register() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [f, setF] = useState({
    account_type: 'company', org_name: '', contact_name: '',
    tax_id: '', address: '', email: '', password: '', password_confirm: ''
  });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const company = f.account_type === 'company';

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const d = await api('/auth/register', { method: 'POST', body: f });
      setUser(d.user);
      if (d.org?.slug) setOrgSlug(d.org.slug);
      navigate('/admin');
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="card" style={{ maxWidth: 560, margin: '40px auto' }}>
      <h1>Ücretsiz Hesap Oluştur</h1>

      <div className="notice info">
        ℹ️ Bu kayıt <b>turnuva düzenleyen</b> kurum ve kişiler içindir. Oyuncu veya takım
        kaptanıysanız hesap oluşturmayın — turnuva yöneticiniz size giriş bilgisi verecektir.
      </div>

      {error && <div className="error">{error}</div>}
      <form onSubmit={submit}>
        <label>Hesap Türü</label>
        <div className="tabs" style={{ marginBottom: 4 }}>
          <button type="button" className={company ? 'active' : ''} onClick={() => setF({ ...f, account_type: 'company' })}>🏢 Şirket</button>
          <button type="button" className={!company ? 'active' : ''} onClick={() => setF({ ...f, account_type: 'individual' })}>👤 Bireysel</button>
        </div>
        <label>Organizasyon / Turnuva Adı *</label>
        <input value={f.org_name} onChange={set('org_name')} required placeholder="örn. Ankara Şirketler Ligi" />
        <div className="formrow">
          <div><label>Ad Soyad *</label><input value={f.contact_name} onChange={set('contact_name')} required placeholder="Yetkili kişi" /></div>
          <div><label>{company ? 'Vergi Kimlik No (VKN) *' : 'T.C. Kimlik No *'}</label>
            <input value={f.tax_id} onChange={set('tax_id')} required inputMode="numeric"
              maxLength={company ? 10 : 11} placeholder={company ? '10 haneli' : '11 haneli'} /></div>
        </div>
        <label>Açık Adres *</label>
        <input value={f.address} onChange={set('address')} required placeholder="Fatura adresi" />
        <label>E-posta *</label>
        <input type="email" value={f.email} onChange={set('email')} required />
        <div className="formrow">
          <div><label>Şifre * (en az 6 karakter)</label><input type="password" value={f.password} onChange={set('password')} required minLength={6} /></div>
          <div><label>Şifre (tekrar) *</label>
            <input type="password" value={f.password_confirm} onChange={set('password_confirm')} required
              style={f.password_confirm && f.password !== f.password_confirm ? { borderColor: 'var(--red)' } : {}} /></div>
        </div>

        <div className="notice warn" style={{ marginTop: 12 }}>
          ⚠️ Sezon ücreti ödemelerinizin <b>faturası yukarıda verdiğiniz bilgilere kesilecektir</b>.
          Lütfen {company ? 'vergi kimlik numaranızın' : 'T.C. kimlik numaranızın'}, ad soyad ve adres
          bilgilerinizin hatasız olduğundan emin olun.
        </div>

        <button className="btn primary big" style={{ marginTop: 14, width: '100%' }}>Hesabı Oluştur</button>
      </form>
      <p className="muted" style={{ marginTop: 12, textAlign: 'center' }}>
        Zaten hesabınız var mı? <Link to="/giris" style={{ color: 'var(--accent)' }}>Giriş yapın</Link>
      </p>
    </div>
  );
}
