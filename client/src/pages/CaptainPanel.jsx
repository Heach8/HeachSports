import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';

const POSITIONS_BY_SPORT = {
  volleyball: ['Pasör', 'Smaçör', 'Orta Oyuncu', 'Libero', 'Pasör Çaprazı'],
  beach_volleyball: ['Defans', 'Blokçu'],
  football: ['Kaleci', 'Defans', 'Orta Saha', 'Forvet'],
  basketball: ['Oyun Kurucu', 'Şutör Guard', 'Kısa Forvet', 'Uzun Forvet', 'Pivot']
};
const STATUS_LABEL = { pending: 'Onay Bekliyor', approved: 'Onaylı', rejected: 'Reddedildi' };

const emptyForm = { first_name: '', last_name: '', height_cm: '', weight_kg: '', jersey_no: '', position: '', national_id: '' };

export default function CaptainPanel() {
  const { user } = useAuth();
  const [players, setPlayers] = useState([]);
  const [sportLabel, setSportLabel] = useState('');
  const [positions, setPositions] = useState(POSITIONS_BY_SPORT.volleyball);
  const [eligibilityRequired, setEligibilityRequired] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [photo, setPhoto] = useState(null);
  const [doc, setDoc] = useState(null);
  const [kvkk, setKvkk] = useState(false);
  const [editing, setEditing] = useState(null); // oyuncu id
  const [msg, setMsg] = useState(null);

  const load = () => api('/captain/players').then(d => {
    setPlayers(d.players);
    setEligibilityRequired(d.eligibility_required);
    setSportLabel(d.sport_label);
    setPositions(POSITIONS_BY_SPORT[d.sport] || POSITIONS_BY_SPORT.volleyball);
  });
  useEffect(() => { if (user) load(); }, [user]);

  if (user === undefined) return null;
  if (!user || user.role !== 'captain') return <p className="muted">Bu sayfa takım kaptanlarına özeldir. Lütfen giriş yapın.</p>;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setMsg(null);
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => v !== '' && fd.append(k, v));
    if (photo) fd.append('photo', photo);
    try {
      if (editing) {
        await api(`/captain/players/${editing}`, { method: 'PUT', body: fd });
        setMsg({ ok: true, text: 'Değişiklik kaydedildi. Onaylı oyuncularda güncelleme admin onayından sonra yayınlanır.' });
      } else {
        if (doc) fd.append('eligibility_doc', doc);
        fd.append('kvkk_consent', kvkk ? '1' : '0');
        await api('/captain/players', { method: 'POST', body: fd });
        setMsg({ ok: true, text: 'Oyuncu eklendi, admin onayı bekleniyor.' });
      }
      setForm(emptyForm); setPhoto(null); setDoc(null); setKvkk(false); setEditing(null);
      e.target.reset?.();
      load();
    } catch (err) { setMsg({ ok: false, text: err.message }); }
  };

  const startEdit = (p) => {
    setEditing(p.id);
    setForm({
      first_name: p.first_name, last_name: p.last_name,
      height_cm: p.height_cm || '', weight_kg: p.weight_kg || '',
      jersey_no: p.jersey_no || '', position: p.position || '', national_id: ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const remove = async (p) => {
    if (!confirm(`${p.first_name} ${p.last_name} silinsin mi?`)) return;
    const d = await api(`/captain/players/${p.id}`, { method: 'DELETE' });
    setMsg({ ok: true, text: d.deleted ? 'Oyuncu silindi.' : 'Silme talebi admin onayına gönderildi.' });
    load();
  };

  return (
    <>
      <h1>Kaptan Paneli {sportLabel && <span className="muted" style={{ fontSize: 15 }}>({sportLabel})</span>}</h1>
      {msg && <div className={msg.ok ? 'success' : 'error'}>{msg.text}</div>}
      <div className="card">
        <h2 style={{ marginTop: 0 }}>{editing ? 'Oyuncu Düzenle' : 'Yeni Oyuncu Ekle'}</h2>
        <form onSubmit={submit}>
          <div className="formrow">
            <div><label>Ad *</label><input value={form.first_name} onChange={set('first_name')} required /></div>
            <div><label>Soyad *</label><input value={form.last_name} onChange={set('last_name')} required /></div>
            <div><label>T.C. Kimlik No *</label>
              <input value={form.national_id} onChange={set('national_id')} required={!editing}
                inputMode="numeric" maxLength={11} placeholder="11 haneli"
                style={form.national_id && form.national_id.length !== 11 ? { borderColor: 'var(--red)' } : {}} />
            </div>
            <div><label>Boy (cm)</label><input type="number" value={form.height_cm} onChange={set('height_cm')} /></div>
            <div><label>Kilo (kg)</label><input type="number" value={form.weight_kg} onChange={set('weight_kg')} /></div>
            <div><label>Forma No</label><input type="number" value={form.jersey_no} onChange={set('jersey_no')} /></div>
            <div><label>Mevki</label>
              <select value={form.position} onChange={set('position')}>
                <option value="">Seçin…</option>
                {positions.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div className="formrow" style={{ marginTop: 6 }}>
            <div><label>Fotoğraf (jpg/png)</label><input type="file" accept="image/*" onChange={e => setPhoto(e.target.files[0])} /></div>
            {!editing && eligibilityRequired && (
              <div><label>Çalışan Belgesi * (pdf/görsel)</label><input type="file" accept="image/*,.pdf" onChange={e => setDoc(e.target.files[0])} /></div>
            )}
          </div>
          {!editing && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, fontSize: 13 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={kvkk} onChange={e => setKvkk(e.target.checked)} />
              Oyuncunun kişisel bilgilerinin ve fotoğrafının platformda yayınlanması için açık rızası alınmıştır (KVKK). Kimlik numarası yayınlanmaz; yalnızca oyuncunun farklı turnuvalardaki kayıtlarını eşleştirmek için geri döndürülemez şekilde şifrelenerek saklanır. *
            </label>
          )}
          <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
            <button className="btn primary">{editing ? 'Değişikliği Gönder' : 'Oyuncu Ekle'}</button>
            {editing && <button type="button" className="btn" onClick={() => { setEditing(null); setForm(emptyForm); }}>Vazgeç</button>}
          </div>
        </form>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Kadrom</h2>
        <table>
          <thead><tr><th>#</th><th>Oyuncu</th><th>Mevki</th><th>Durum</th><th></th></tr></thead>
          <tbody>
            {players.map(p => (
              <tr key={p.id}>
                <td>{p.jersey_no}</td>
                <td>{p.first_name} {p.last_name}
                  {p.national_id_mask && <div className="muted">🪪 {p.national_id_mask}</div>}
                  {!p.national_id_mask && <div className="muted" style={{ color: 'var(--accent2)' }}>Kimlik no eksik — düzenleyip ekleyin</div>}
                  {p.pending_changes && <div className="muted">⏳ {p.pending_changes._delete ? 'Silme talebi' : 'Değişiklik'} onay bekliyor</div>}
                </td>
                <td>{p.position}</td>
                <td><span className={`badge ${p.status}`}>{STATUS_LABEL[p.status]}</span></td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button className="btn sm" onClick={() => startEdit(p)}>Düzenle</button>{' '}
                  <button className="btn sm red" onClick={() => remove(p)}>Sil</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
