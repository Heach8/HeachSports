import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';

const TABS = ['Onaylar', 'Takımlar', 'Kullanıcılar', 'Fikstür', 'Sezonlar', 'Tahsilat', 'Cezalar', 'Ayarlar'];
const SPORT_OPTS = [
  { key: 'volleyball', label: 'Voleybol' },
  { key: 'beach_volleyball', label: 'Plaj Voleybolu' },
  { key: 'football', label: 'Futbol' },
  { key: 'basketball', label: 'Basketbol' }
];
const ROLE_LABEL = { super_admin: 'Süper Admin', admin: 'Admin', scorekeeper: 'Masa Görevlisi', captain: 'Kaptan' };

export default function AdminPanel() {
  const { user } = useAuth();
  const [tab, setTab] = useState('Onaylar');
  const [msg, setMsg] = useState(null);

  if (user === undefined) return null;
  if (!user || !['admin', 'super_admin'].includes(user.role)) {
    return <p className="muted">Bu sayfa yöneticilere özeldir. Lütfen giriş yapın.</p>;
  }

  const flash = (text, ok = true) => { setMsg({ text, ok }); setTimeout(() => setMsg(null), 4000); };

  return (
    <>
      <h1>Yönetim Paneli</h1>
      {msg && <div className={msg.ok ? 'success' : 'error'}>{msg.text}</div>}
      <div className="tabs">
        {TABS.map(t => <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>)}
      </div>
      {tab === 'Onaylar' && <Approvals flash={flash} />}
      {tab === 'Takımlar' && <TeamsTab flash={flash} />}
      {tab === 'Kullanıcılar' && <UsersTab flash={flash} />}
      {tab === 'Fikstür' && <FixtureTab flash={flash} />}
      {tab === 'Sezonlar' && <SeasonsTab flash={flash} />}
      {tab === 'Tahsilat' && <BillingTab flash={flash} />}
      {tab === 'Cezalar' && <PenaltiesTab flash={flash} />}
      {tab === 'Ayarlar' && <SettingsTab flash={flash} />}
    </>
  );
}

function Approvals({ flash }) {
  const [rows, setRows] = useState([]);
  const load = () => api('/admin/approvals').then(d => setRows(d.approvals));
  useEffect(() => { load(); }, []);
  const act = async (id, action) => {
    try { await api(`/admin/approvals/${id}/${action}`, { method: 'POST' }); flash('İşlem tamamlandı.'); load(); }
    catch (e) { flash(e.message, false); }
  };
  return (
    <div className="card">
      {rows.length === 0 && <p className="muted">Onay bekleyen kayıt yok. 🎉</p>}
      {rows.map(p => (
        <div key={p.id} className="matchrow" style={{ alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <b>{p.first_name} {p.last_name}</b> <span className="muted">— {p.team_name}</span>
            <div className="muted">
              {p.pending_changes
                ? (p.pending_changes._delete
                  ? '🗑️ Silme talebi'
                  : 'Değişiklik: ' + Object.entries(p.pending_changes).map(([k, v]) => `${k}=${v}`).join(', '))
                : `Yeni oyuncu · #${p.jersey_no ?? '-'} · ${p.position ?? '-'} · ${p.height_cm ?? '-'} cm / ${p.weight_kg ?? '-'} kg${p.national_id_mask ? ' · 🪪 ' + p.national_id_mask : ''}`}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              {p.photo_path && <a className="muted" href={p.photo_path} target="_blank" rel="noreferrer">📷 Fotoğraf</a>}
              {p.eligibility_doc_path && <a className="muted" href={p.eligibility_doc_path} target="_blank" rel="noreferrer">📄 Çalışan belgesi</a>}
              {!p.pending_changes && !p.eligibility_doc_path && <span className="muted">Belge yok</span>}
            </div>
          </div>
          <div style={{ whiteSpace: 'nowrap' }}>
            <button className="btn sm green" onClick={() => act(p.id, 'approve')}>Onayla</button>{' '}
            <button className="btn sm red" onClick={() => act(p.id, 'reject')}>Reddet</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function TeamsTab({ flash }) {
  const [sport, setSport] = useState('volleyball');
  const [teams, setTeams] = useState([]);
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [logo, setLogo] = useState(null);
  const load = () => api(`/teams?sport=${sport}`).then(d => setTeams(d.teams));
  useEffect(() => { load(); }, [sport]);
  const add = async (e) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append('name', name); fd.append('company', company); fd.append('sport', sport);
    if (logo) fd.append('logo', logo);
    try { await api('/admin/teams', { method: 'POST', body: fd }); flash('Takım eklendi.'); setName(''); setCompany(''); setLogo(null); load(); }
    catch (err) { flash(err.message, false); }
  };
  const del = async (id) => {
    if (!confirm('Takım silinsin mi?')) return;
    try { await api(`/admin/teams/${id}`, { method: 'DELETE' }); flash('Takım silindi.'); load(); }
    catch (err) { flash(err.message, false); }
  };
  return (
    <>
      <div className="tabs">
        {SPORT_OPTS.map(s => <button key={s.key} className={sport === s.key ? 'active' : ''} onClick={() => setSport(s.key)}>{s.label}</button>)}
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Yeni Takım</h2>
        <form onSubmit={add} className="formrow">
          <div><label>Takım Adı *</label><input value={name} onChange={e => setName(e.target.value)} required /></div>
          <div><label>Şirket</label><input value={company} onChange={e => setCompany(e.target.value)} /></div>
          <div><label>Logo</label><input type="file" accept="image/*" onChange={e => setLogo(e.target.files[0])} /></div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}><button className="btn primary">Ekle</button></div>
        </form>
      </div>
      <div className="card">
        <table>
          <thead><tr><th>Takım</th><th>Şirket</th><th className="num">Oyuncu</th><th></th></tr></thead>
          <tbody>
            {teams.map(t => (
              <tr key={t.id}>
                <td><b>{t.name}</b></td><td>{t.company}</td><td className="num">{t.player_count}</td>
                <td style={{ textAlign: 'right' }}><button className="btn sm red" onClick={() => del(t.id)}>Sil</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function UsersTab({ flash }) {
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [f, setF] = useState({ email: '', password: '', name: '', role: 'captain', team_id: '' });
  const load = () => { api('/admin/users').then(d => setUsers(d.users)); api('/admin/teams-all').then(d => setTeams(d.teams)); };
  useEffect(() => { load(); }, []);
  const add = async (e) => {
    e.preventDefault();
    try {
      await api('/admin/users', { method: 'POST', body: { ...f, team_id: f.team_id ? Number(f.team_id) : null } });
      flash('Kullanıcı oluşturuldu. İlk girişte şifresini değiştirmesi istenecek.'); setF({ email: '', password: '', name: '', role: 'captain', team_id: '' }); load();
    } catch (err) { flash(err.message, false); }
  };
  const del = async (id) => {
    if (!confirm('Kullanıcı silinsin mi?')) return;
    try { await api(`/admin/users/${id}`, { method: 'DELETE' }); load(); } catch (err) { flash(err.message, false); }
  };
  return (
    <>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Yeni Kullanıcı</h2>
        <form onSubmit={add} className="formrow">
          <div><label>Ad Soyad *</label><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required /></div>
          <div><label>E-posta *</label><input type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} required /></div>
          <div><label>Şifre *</label><input value={f.password} onChange={e => setF({ ...f, password: e.target.value })} required /></div>
          <div><label>Rol</label>
            <select value={f.role} onChange={e => setF({ ...f, role: e.target.value })}>
              <option value="captain">Kaptan</option>
              <option value="scorekeeper">Masa Görevlisi</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {f.role === 'captain' && (
            <div><label>Takım *</label>
              <select value={f.team_id} onChange={e => setF({ ...f, team_id: e.target.value })} required>
                <option value="">Seçin…</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name} ({{ volleyball: 'Voleybol', beach_volleyball: 'Plaj V.', football: 'Futbol', basketball: 'Basketbol' }[t.sport]})</option>)}
              </select>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'flex-end' }}><button className="btn primary">Oluştur</button></div>
        </form>
        <p className="muted" style={{ marginTop: 10 }}>
          Buraya yazdığınız şifre <b>geçici</b>dir: kullanıcı ilk girişinde yeni şifresini iki kez girerek belirlemek zorundadır.
        </p>
      </div>
      <div className="card">
        <table>
          <thead><tr><th>Ad</th><th>E-posta</th><th>Rol</th><th>Takım</th><th></th></tr></thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td>{u.name}</td><td className="muted">{u.email}</td>
                <td>{ROLE_LABEL[u.role]}</td><td>{u.team_name || '-'}</td>
                <td style={{ textAlign: 'right' }}>
                  {u.role !== 'super_admin' && <button className="btn sm red" onClick={() => del(u.id)}>Sil</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function FixtureTab({ flash }) {
  const [sport, setSport] = useState('volleyball');
  const [matches, setMatches] = useState([]);
  const [doubleRound, setDoubleRound] = useState(false);
  const [bestOf, setBestOf] = useState(5);
  const load = () => api(`/fixtures?sport=${sport}`).then(d => setMatches(d.matches));
  useEffect(() => { load(); }, [sport]);
  const generate = async () => {
    if (matches.length && !confirm('Mevcut fikstür silinip yeniden oluşturulacak. Emin misiniz?')) return;
    try {
      const d = await api('/admin/fixtures/generate', { method: 'POST', body: { sport, double_round: doubleRound, best_of: Number(bestOf) } });
      flash(`Fikstür oluşturuldu: ${d.rounds} hafta.`); load();
    } catch (err) { flash(err.message, false); }
  };
  const setDate = async (m, value) => {
    try { await api(`/admin/matches/${m.id}`, { method: 'PUT', body: { scheduled_at: value } }); load(); }
    catch (err) { flash(err.message, false); }
  };
  return (
    <>
      <div className="tabs">
        {SPORT_OPTS.map(s => <button key={s.key} className={sport === s.key ? 'active' : ''} onClick={() => setSport(s.key)}>{s.label}</button>)}
      </div>
      <div className="card" style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', margin: 0 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={doubleRound} onChange={e => setDoubleRound(e.target.checked)} />
          Çift devreli
        </label>
        {['volleyball', 'beach_volleyball'].includes(sport) && <label style={{ display: 'flex', gap: 6, alignItems: 'center', margin: 0 }}>
          Set formatı:
          <select style={{ width: 'auto' }} value={bestOf} onChange={e => setBestOf(e.target.value)}>
            <option value={5}>5 set (3 kazanan)</option>
            <option value={3}>3 set (2 kazanan)</option>
          </select>
        </label>}
        <button className="btn primary" onClick={generate}>Fikstür Oluştur</button>
      </div>
      <div className="card">
        <table>
          <thead><tr><th>Aşama</th><th>Maç</th><th>Durum</th><th>Tarih/Saat</th></tr></thead>
          <tbody>
            {matches.map(m => (
              <tr key={m.id}>
                <td>{m.stage_label || m.round}</td>
                <td>{m.home_team} — {m.away_team} {m.status !== 'scheduled' && <b>({m.home_sets}-{m.away_sets})</b>}</td>
                <td><span className={`badge ${m.status}`}>{m.status === 'live' ? 'CANLI' : m.status === 'finished' ? 'Bitti' : 'Planlandı'}</span></td>
                <td>
                  {m.status === 'scheduled'
                    ? <input type="datetime-local" style={{ width: 'auto' }} defaultValue={m.scheduled_at || ''} onBlur={e => setDate(m, e.target.value)} />
                    : <span className="muted">{m.scheduled_at?.replace('T', ' ') || '-'}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function PenaltiesTab({ flash }) {
  const [penalties, setPenalties] = useState([]);
  const [players, setPlayers] = useState([]);
  const [f, setF] = useState({ player_id: '', type: 'yellow', ban_matches: 0, note: '' });
  const load = () => {
    api('/admin/penalties').then(d => setPenalties(d.penalties));
    api('/admin/players').then(d => setPlayers(d.players.filter(p => p.status === 'approved')));
  };
  useEffect(() => { load(); }, []);
  const add = async (e) => {
    e.preventDefault();
    try {
      await api('/admin/penalties', { method: 'POST', body: { ...f, player_id: Number(f.player_id), ban_matches: Number(f.ban_matches) } });
      flash('Ceza kaydedildi.'); setF({ player_id: '', type: 'yellow', ban_matches: 0, note: '' }); load();
    } catch (err) { flash(err.message, false); }
  };
  const del = async (id) => { await api(`/admin/penalties/${id}`, { method: 'DELETE' }); load(); };
  const LABEL = { yellow: 'Sarı Kart', red: 'Kırmızı Kart', ban: 'Men' };
  return (
    <>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Ceza Ekle</h2>
        <form onSubmit={add} className="formrow">
          <div><label>Oyuncu *</label>
            <select value={f.player_id} onChange={e => setF({ ...f, player_id: e.target.value })} required>
              <option value="">Seçin…</option>
              {players.map(p => <option key={p.id} value={p.id}>{p.first_name} {p.last_name} ({p.team_name})</option>)}
            </select>
          </div>
          <div><label>Tür</label>
            <select value={f.type} onChange={e => setF({ ...f, type: e.target.value })}>
              <option value="yellow">Sarı Kart</option>
              <option value="red">Kırmızı Kart</option>
              <option value="ban">Men Cezası</option>
            </select>
          </div>
          {f.type === 'ban' && <div><label>Maç Sayısı</label><input type="number" value={f.ban_matches} onChange={e => setF({ ...f, ban_matches: e.target.value })} /></div>}
          <div><label>Not</label><input value={f.note} onChange={e => setF({ ...f, note: e.target.value })} /></div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}><button className="btn primary">Kaydet</button></div>
        </form>
      </div>
      <div className="card">
        <table>
          <thead><tr><th>Oyuncu</th><th>Takım</th><th>Ceza</th><th>Not</th><th>Tarih</th><th></th></tr></thead>
          <tbody>
            {penalties.map(pe => (
              <tr key={pe.id}>
                <td>{pe.first_name} {pe.last_name}</td><td className="muted">{pe.team_name}</td>
                <td>{LABEL[pe.type]}{pe.ban_matches ? ` (${pe.ban_matches} maç)` : ''}</td>
                <td className="muted">{pe.note}</td><td className="muted">{pe.created_at?.slice(0, 10)}</td>
                <td><button className="btn sm red" onClick={() => del(pe.id)}>Sil</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SettingsTab({ flash }) {
  const [eligibility, setEligibility] = useState(true);
  useEffect(() => { api('/admin/settings').then(d => setEligibility(d.eligibility_check_enabled)); }, []);
  const save = async (value) => {
    setEligibility(value);
    await api('/admin/settings', { method: 'PUT', body: { eligibility_check_enabled: value } });
    flash('Ayar kaydedildi.');
  };
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Genel Ayarlar</h2>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
        <input type="checkbox" style={{ width: 'auto' }} checked={eligibility} onChange={e => save(e.target.checked)} />
        Oyuncu uygunluk kontrolü (çalışan belgesi zorunluluğu)
      </label>
      <p className="muted" style={{ marginTop: 8 }}>
        Açıkken kaptanlar yeni oyuncu eklerken şirket çalışanı olduğunu gösteren belge yüklemek zorundadır.
      </p>
    </div>
  );
}


const DEFAULT_COURT = { volleyball: 6, beach_volleyball: 2, football: 7, basketball: 5 };

function SeasonsTab({ flash }) {
  const [seasons, setSeasons] = useState([]);
  const [name, setName] = useState('');
  const [sport, setSport] = useState('volleyball');
  const [courtSize, setCourtSize] = useState(DEFAULT_COURT.volleyball);
  const [yellowLimit, setYellowLimit] = useState(2);
  const [redBan, setRedBan] = useState(true);
  const [format, setFormat] = useState('league');
  const [foulLimit, setFoulLimit] = useState(5);
  const [twoLegged, setTwoLegged] = useState(false);
  const [entryFee, setEntryFee] = useState('');
  const [periodCount, setPeriodCount] = useState(4);
  const [groupCount, setGroupCount] = useState(2);
  const [advanceCount, setAdvanceCount] = useState(2);
  const load = () => api('/admin/seasons').then(d => setSeasons(d.seasons));
  useEffect(() => { load(); }, []);
  const add = async (e) => {
    e.preventDefault();
    try { await api('/admin/seasons', { method: 'POST', body: { name, sport, court_size: Number(courtSize), yellow_limit: sport === 'football' ? Number(yellowLimit) : 0, red_ban: sport === 'football' ? redBan : false, format, group_count: Number(groupCount), advance_count: Number(advanceCount), foul_limit: sport === 'basketball' ? Number(foulLimit) : 0, period_count: sport === 'basketball' ? Number(periodCount) : null, two_legged: format !== 'league' && twoLegged, entry_fee: entryFee ? Number(entryFee) : 0 } }); flash('Sezon eklendi.'); setName(''); load(); }
    catch (err) { flash(err.message, false); }
  };
  const activate = async (id) => {
    try { await api(`/admin/seasons/${id}/activate`, { method: 'POST' }); flash('Sezon aktifleştirildi.'); load(); }
    catch (err) { flash(err.message, false); }
  };
  const L = { volleyball: 'Voleybol', beach_volleyball: 'Plaj Voleybolu', football: 'Futbol', basketball: 'Basketbol' };
  return (
    <>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Yeni Sezon</h2>
        <form onSubmit={add} className="formrow">
          <div><label>Sezon Adı *</label><input value={name} onChange={e => setName(e.target.value)} required placeholder="örn. 2026 Güz Sezonu" /></div>
          <div><label>Branş</label>
            <select value={sport} onChange={e => { setSport(e.target.value); setCourtSize(DEFAULT_COURT[e.target.value] || 6); }}>
              {SPORT_OPTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          <div><label>Katılım Ücreti (₺, takım başı — boş = ücretsiz)</label>
            <input type="number" min="0" step="0.01" value={entryFee} onChange={e => setEntryFee(e.target.value)} placeholder="örn. 15000" />
          </div>
          <div><label>Turnuva Formatı</label>
            <select value={format} onChange={e => setFormat(e.target.value)}>
              <option value="league">Lig Usulü (herkes herkesle)</option>
              <option value="groups_knockout">Gruplar + Eleme</option>
              <option value="knockout">Direkt Eleme</option>
            </select>
          </div>
          {sport === 'basketball' && (
            <>
              <div><label>Faul Limiti (oyuncu oyun dışı)</label>
                <select value={foulLimit} onChange={e => setFoulLimit(e.target.value)}>
                  <option value={0}>Kural kapalı</option>
                  <option value={5}>5 faul</option>
                  <option value={6}>6 faul</option>
                </select>
              </div>
              <div><label>Periyot Formatı</label>
                <select value={periodCount} onChange={e => setPeriodCount(e.target.value)}>
                  <option value={4}>4 çeyrek</option>
                  <option value={2}>2 devre</option>
                </select>
              </div>
            </>
          )}
          {format !== 'league' && (
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', margin: 0, fontSize: 13 }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={twoLegged} onChange={e => setTwoLegged(e.target.checked)} />
                Elemeler rövanşlı (iki maçlı, toplam skor)
              </label>
            </div>
          )}
          {format === 'groups_knockout' && (
            <>
              <div><label>Grup Sayısı</label>
                <select value={groupCount} onChange={e => setGroupCount(e.target.value)}>
                  {[2, 3, 4].map(n => <option key={n} value={n}>{n} grup</option>)}
                </select>
              </div>
              <div><label>Gruptan Çıkacak Takım</label>
                <select value={advanceCount} onChange={e => setAdvanceCount(e.target.value)}>
                  {[1, 2].map(n => <option key={n} value={n}>İlk {n}</option>)}
                </select>
              </div>
            </>
          )}
          <div><label>Saha İçi Oyuncu Sayısı</label>
            <select value={courtSize} onChange={e => setCourtSize(e.target.value)}>
              {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(n => <option key={n} value={n}>{n} oyuncu</option>)}
            </select>
          </div>
          {sport === 'football' && (
            <>
              <div><label>Kaç sarı kartta 1 maç ceza?</label>
                <select value={yellowLimit} onChange={e => setYellowLimit(e.target.value)}>
                  <option value={0}>Kural kapalı</option>
                  <option value={2}>2 sarı kart</option>
                  <option value={3}>3 sarı kart</option>
                  <option value={4}>4 sarı kart</option>
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', margin: 0, fontSize: 13 }}>
                  <input type="checkbox" style={{ width: 'auto' }} checked={redBan} onChange={e => setRedBan(e.target.checked)} />
                  Kırmızı kart: sonraki maçta ceza
                </label>
              </div>
            </>
          )}
          <div style={{ display: 'flex', alignItems: 'flex-end' }}><button className="btn primary">Ekle</button></div>
        </form>
        <p className="muted" style={{ marginTop: 8 }}>Her branşın kendi aktif sezonu vardır; yeni sezonu aktifleştirince öncekisi arşive düşer. Saha içi sayısı maç konsolundaki dizilimi belirler (örn. plaj voleybolu 2, 3 veya 4 kişilik oynanabilir); geri kalan oyuncular yedek kulübesinde görünür.</p>
      </div>
      <div className="card">
        <table>
          <thead><tr><th>Sezon</th><th>Branş</th><th>Saha İçi</th><th>Durum</th><th></th></tr></thead>
          <tbody>
            {seasons.map(se => (
              <tr key={se.id}>
                <td><b>{se.name}</b></td>
                <td>{L[se.sport]}<div className="muted" style={{ fontSize: 11 }}>{{ league: 'Lig', groups_knockout: 'Grup+Eleme', knockout: 'Eleme' }[se.format || 'league']}</div></td>
                <td>{se.court_size || DEFAULT_COURT[se.sport] || 6}
                  {se.sport === 'football' && <div className="muted" style={{ fontSize: 11 }}>
                    {se.yellow_limit ? `${se.yellow_limit} sarı = ceza` : 'sarı kuralı yok'}{se.red_ban ? ' · kırmızı = ceza' : ''}
                  </div>}
                  {se.sport === 'basketball' && <div className="muted" style={{ fontSize: 11 }}>
                    {se.foul_limit ? `${se.foul_limit} faul = oyun dışı` : 'faul limiti yok'} · {se.period_count === 2 ? '2 devre' : '4 çeyrek'}
                  </div>}
                </td>
                <td>{se.is_active ? <span className="badge approved">Aktif</span> : <span className="badge finished">Arşiv</span>}</td>
                <td style={{ textAlign: 'right' }}>
                  {!se.is_active && <button className="btn sm" onClick={() => activate(se.id)}>Aktifleştir</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}


const PAY_METHOD = { havale: 'Havale/EFT', nakit: 'Nakit', kart: 'Kredi Kartı', diger: 'Diğer' };
const tl = (n) => (Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 }) + ' ₺';

function BillingTab({ flash }) {
  const [sport, setSport] = useState('volleyball');
  const [data, setData] = useState(null);
  const [fee, setFee] = useState('');
  const [billModal, setBillModal] = useState(null);   // takim fatura bilgileri
  const [payModal, setPayModal] = useState(null);     // odeme ekleme + gecmis
  const load = () => api(`/admin/billing?sport=${sport}`).then(d => { setData(d); setFee(d.season?.entry_fee || ''); });
  useEffect(() => { load(); }, [sport]);
  if (!data) return null;
  const season = data.season;
  const feeNum = Number(season?.entry_fee) || 0;
  const expected = feeNum * (data.teams?.length || 0);
  const collected = (data.teams || []).reduce((a, t) => a + Number(t.paid), 0);
  const statusOf = (t) => {
    if (!feeNum) return t.paid > 0 ? 'approved' : 'finished';
    if (t.paid >= feeNum) return 'approved';
    return t.paid > 0 ? 'pending' : 'rejected';
  };
  const statusLabel = { approved: 'Ödendi', pending: 'Kısmi', rejected: 'Bekliyor', finished: '-' };

  const saveFee = async () => {
    try { await api(`/admin/seasons/${season.id}/fee`, { method: 'PUT', body: { entry_fee: Number(fee) || 0 } }); flash('Ücret güncellendi.'); load(); }
    catch (e) { flash(e.message, false); }
  };

  const exportCsv = () => {
    const rows = [['Takım', 'Şirket', 'Fatura Ünvanı', 'Vergi Dairesi', 'Vergi No', 'Adres', 'E-posta', 'Ücret', 'Ödenen', 'Kalan', 'Durum']];
    for (const t of data.teams) {
      rows.push([t.name, t.company || '', t.billing_title || '', t.tax_office || '', t.tax_number || '',
        (t.billing_address || '').replace(/\n/g, ' '), t.billing_email || '',
        feeNum, t.paid, Math.max(0, feeNum - t.paid), statusLabel[statusOf(t)]]);
    }
    const csv = '\ufeff' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `tahsilat-${season?.name || 'sezon'}.csv`;
    a.click();
  };

  return (
    <>
      <div className="tabs">
        {SPORT_OPTS.map(s => <button key={s.key} className={sport === s.key ? 'active' : ''} onClick={() => setSport(s.key)}>{s.label}</button>)}
      </div>
      {!season ? <p className="muted">Bu branşta aktif sezon yok.</p> : (
        <>
          <div className="grid cols3">
            <div className="card"><p className="muted">Beklenen Toplam</p><h2 style={{ margin: 0 }}>{tl(expected)}</h2></div>
            <div className="card"><p className="muted">Tahsil Edilen</p><h2 style={{ margin: 0, color: 'var(--green)' }}>{tl(collected)}</h2></div>
            <div className="card"><p className="muted">Kalan</p><h2 style={{ margin: 0, color: 'var(--accent)' }}>{tl(Math.max(0, expected - collected))}</h2></div>
          </div>
          <div className="card" style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div><label>Katılım Ücreti (takım başı, ₺)</label>
              <input type="number" min="0" step="0.01" style={{ width: 160 }} value={fee} onChange={e => setFee(e.target.value)} /></div>
            <button className="btn primary" onClick={saveFee}>Kaydet</button>
            <span style={{ flex: 1 }} />
            <button className="btn" onClick={exportCsv}>📄 Muhasebe Raporu (CSV)</button>
          </div>
          <div className="card">
            <table>
              <thead><tr><th>Takım</th><th>Fatura Bilgileri</th><th className="num">Ödenen</th><th className="num">Kalan</th><th>Durum</th><th></th></tr></thead>
              <tbody>
                {data.teams.map(t => (
                  <tr key={t.id}>
                    <td><b>{t.name}</b><div className="muted">{t.company}</div></td>
                    <td>
                      {t.billing_title
                        ? <>{t.billing_title}<div className="muted">{t.tax_office} / {t.tax_number}</div></>
                        : <span className="muted" style={{ color: 'var(--accent2)' }}>Eksik</span>}
                      {' '}<button className="btn sm" onClick={() => setBillModal({ ...t })}>Düzenle</button>
                    </td>
                    <td className="num">{tl(t.paid)}</td>
                    <td className="num">{tl(Math.max(0, feeNum - t.paid))}</td>
                    <td><span className={`badge ${statusOf(t)}`}>{statusLabel[statusOf(t)]}</span></td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn sm green" onClick={() => setPayModal({ team: t, amount: Math.max(0, feeNum - t.paid) || '', method: 'havale', paid_at: new Date().toISOString().slice(0, 10), note: '', invoice_no: '' })}>Ödeme Ekle</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {billModal && (
            <div className="goal-modal-backdrop" onClick={() => setBillModal(null)}>
              <div className="goal-modal card" onClick={e => e.stopPropagation()}>
                <h2 style={{ marginTop: 0 }}>Fatura Bilgileri — {billModal.name}</h2>
                <label>Fatura Ünvanı</label><input value={billModal.billing_title || ''} onChange={e => setBillModal({ ...billModal, billing_title: e.target.value })} />
                <div className="formrow">
                  <div><label>Vergi Dairesi</label><input value={billModal.tax_office || ''} onChange={e => setBillModal({ ...billModal, tax_office: e.target.value })} /></div>
                  <div><label>Vergi No / TCKN</label><input value={billModal.tax_number || ''} onChange={e => setBillModal({ ...billModal, tax_number: e.target.value })} /></div>
                </div>
                <label>Fatura Adresi</label><input value={billModal.billing_address || ''} onChange={e => setBillModal({ ...billModal, billing_address: e.target.value })} />
                <label>Fatura E-postası</label><input type="email" value={billModal.billing_email || ''} onChange={e => setBillModal({ ...billModal, billing_email: e.target.value })} />
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <button className="btn primary" style={{ flex: 1 }} onClick={async () => {
                    try { await api(`/admin/teams/${billModal.id}/billing`, { method: 'PUT', body: billModal }); flash('Fatura bilgileri kaydedildi.'); setBillModal(null); load(); }
                    catch (e) { flash(e.message, false); }
                  }}>Kaydet</button>
                  <button className="btn" onClick={() => setBillModal(null)}>Vazgeç</button>
                </div>
              </div>
            </div>
          )}

          {payModal && (
            <div className="goal-modal-backdrop" onClick={() => setPayModal(null)}>
              <div className="goal-modal card" onClick={e => e.stopPropagation()}>
                <h2 style={{ marginTop: 0 }}>💰 Ödeme — {payModal.team.name}</h2>
                <div className="formrow">
                  <div><label>Tutar (₺)</label><input type="number" min="0" step="0.01" value={payModal.amount} onChange={e => setPayModal({ ...payModal, amount: e.target.value })} /></div>
                  <div><label>Yöntem</label>
                    <select value={payModal.method} onChange={e => setPayModal({ ...payModal, method: e.target.value })}>
                      {Object.entries(PAY_METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div><label>Tarih</label><input type="date" value={payModal.paid_at} onChange={e => setPayModal({ ...payModal, paid_at: e.target.value })} /></div>
                </div>
                <div className="formrow">
                  <div><label>Fatura No (kesildiyse)</label><input value={payModal.invoice_no} onChange={e => setPayModal({ ...payModal, invoice_no: e.target.value })} /></div>
                  <div><label>Not</label><input value={payModal.note} onChange={e => setPayModal({ ...payModal, note: e.target.value })} /></div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <button className="btn green" style={{ flex: 1 }} onClick={async () => {
                    try {
                      await api('/admin/payments', { method: 'POST', body: { team_id: payModal.team.id, amount: Number(payModal.amount), method: payModal.method, paid_at: payModal.paid_at, note: payModal.note, invoice_no: payModal.invoice_no } });
                      flash('Ödeme kaydedildi.'); setPayModal(null); load();
                    } catch (e) { flash(e.message, false); }
                  }}>Kaydet</button>
                  <button className="btn" onClick={() => setPayModal(null)}>Vazgeç</button>
                </div>
                {data.payments.filter(p => p.team_id === payModal.team.id).length > 0 && (
                  <>
                    <h2 style={{ fontSize: 14, marginTop: 16 }}>Geçmiş Ödemeler</h2>
                    {data.payments.filter(p => p.team_id === payModal.team.id).map(p => (
                      <p key={p.id} style={{ fontSize: 13, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                        {tl(p.amount)} · {PAY_METHOD[p.method]} · {p.paid_at || p.created_at?.slice(0, 10)}
                        {p.invoice_no && <span className="muted"> · Fatura: {p.invoice_no}</span>}
                        {' '}<button className="btn sm red" onClick={async () => { await api(`/admin/payments/${p.id}`, { method: 'DELETE' }); load(); setPayModal(null); }}>Sil</button>
                      </p>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
