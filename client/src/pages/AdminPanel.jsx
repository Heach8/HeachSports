import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';

const TABS = ['Onaylar', 'Takımlar', 'Kullanıcılar', 'Fikstür', 'Sezonlar', 'Tahsilat', 'Web Sitene Ekle', 'Cezalar', 'Ayarlar'];
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
  const tabs = user.role === 'super_admin' ? [...TABS, 'Organizasyonlar', 'Platform'] : TABS;

  return (
    <>
      <h1>Yönetim Paneli</h1>
      {msg && <div className={msg.ok ? 'success' : 'error'}>{msg.text}</div>}
      <div className="tabs">
        {tabs.map(t => <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>)}
      </div>
      {tab === 'Onaylar' && <Approvals flash={flash} />}
      {tab === 'Takımlar' && <TeamsTab flash={flash} />}
      {tab === 'Kullanıcılar' && <UsersTab flash={flash} isSuper={user.role === 'super_admin'} />}
      {tab === 'Fikstür' && <FixtureTab flash={flash} />}
      {tab === 'Sezonlar' && <SeasonsTab flash={flash} isSuper={user.role === 'super_admin'} />}
      {tab === 'Tahsilat' && <BillingTab flash={flash} />}
      {tab === 'Web Sitene Ekle' && <EmbedTab flash={flash} />}
      {tab === 'Cezalar' && <PenaltiesTab flash={flash} />}
      {tab === 'Ayarlar' && <SettingsTab flash={flash} />}
      {tab === 'Organizasyonlar' && <OrgsTab flash={flash} />}
      {tab === 'Platform' && <PlatformTab flash={flash} />}
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

function UsersTab({ flash, isSuper }) {
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
              {isSuper && <option value="super_admin">Süper Admin (platform geneli)</option>}
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
  const [season, setSeason] = useState(null);
  const [matches, setMatches] = useState([]);
  const [allTeams, setAllTeams] = useState([]);
  const [doubleRound, setDoubleRound] = useState(false);
  const [bestOf, setBestOf] = useState(5);
  // Manuel kura (noter cekimi) durumu
  const [drawMode, setDrawMode] = useState('auto'); // auto | manual
  const [drawn, setDrawn] = useState([]);           // lig/eleme: cekilis sirasi (takim id)
  const [drawGroups, setDrawGroups] = useState({}); // gruplu: { A: [id], B: [id] }
  const [activeGroup, setActiveGroup] = useState('A');

  const load = () => {
    api(`/fixtures?sport=${sport}`).then(d => setMatches(d.matches));
    api(`/season?sport=${sport}`).then(d => setSeason(d.season));
    api(`/teams?sport=${sport}`).then(d => setAllTeams(d.teams));
  };
  useEffect(() => { load(); setDrawn([]); setDrawGroups({}); setActiveGroup('A'); setDrawMode('auto'); }, [sport]);

  const format = season?.format || 'league';
  const letters = 'ABCDEFGH'.slice(0, season?.group_count || 2).split('');
  const placedIds = format === 'groups_knockout'
    ? Object.values(drawGroups).flat()
    : drawn;
  const remaining = allTeams.filter(t => !placedIds.includes(t.id));
  const allPlaced = allTeams.length >= 2 && remaining.length === 0;
  const nameOf = (id) => allTeams.find(t => t.id === id)?.name || id;

  const pick = (t) => {
    if (format === 'groups_knockout') {
      setDrawGroups(g => ({ ...g, [activeGroup]: [...(g[activeGroup] || []), t.id] }));
    } else {
      setDrawn(d => [...d, t.id]);
    }
  };
  const undoPick = () => {
    if (format === 'groups_knockout') {
      // en son eklenen takimi bul ve cikar
      let lastG = null, lastIdx = -1;
      for (const [g, arr] of Object.entries(drawGroups)) {
        if (arr.length) { lastG = g; }
      }
      // basitce: aktif gruptan son ekleneni cikar; bos ise dolulardan birinden
      const target = (drawGroups[activeGroup] || []).length ? activeGroup
        : Object.keys(drawGroups).find(g => (drawGroups[g] || []).length);
      if (!target) return;
      setDrawGroups(g => ({ ...g, [target]: g[target].slice(0, -1) }));
    } else {
      setDrawn(d => d.slice(0, -1));
    }
  };

  const generate = async (manual) => {
    if (matches.length && !confirm('Mevcut fikstür silinip yeniden oluşturulacak. Emin misiniz?')) return;
    const body = { sport, double_round: doubleRound, best_of: Number(bestOf) };
    if (manual) {
      if (format === 'groups_knockout') body.draw_groups = drawGroups;
      else body.draw_order = drawn;
    }
    try {
      const d = await api('/admin/fixtures/generate', { method: 'POST', body });
      flash(manual ? 'Fikstür noter kurasına göre oluşturuldu!' : `Fikstür oluşturuldu${d.rounds ? `: ${d.rounds} hafta` : ''}.`);
      setDrawn([]); setDrawGroups({});
      load();
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
          Kura:
          <select style={{ width: 'auto' }} value={drawMode} onChange={e => setDrawMode(e.target.value)}>
            <option value="auto">Sistem kurası (rastgele)</option>
            <option value="manual">Manuel kura (noter çekimi)</option>
          </select>
        </label>
        {format === 'league' && <label style={{ display: 'flex', gap: 6, alignItems: 'center', margin: 0 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={doubleRound} onChange={e => setDoubleRound(e.target.checked)} />
          Çift devreli
        </label>}
        {['volleyball', 'beach_volleyball'].includes(sport) && <label style={{ display: 'flex', gap: 6, alignItems: 'center', margin: 0 }}>
          Set formatı:
          <select style={{ width: 'auto' }} value={bestOf} onChange={e => setBestOf(e.target.value)}>
            <option value={5}>5 set (3 kazanan)</option>
            <option value={3}>3 set (2 kazanan)</option>
          </select>
        </label>}
        {drawMode === 'auto' && <button className="btn primary" onClick={() => generate(false)}>Fikstür Oluştur</button>}
        <span className="muted" style={{ fontSize: 12 }}>
          Format: {{ league: 'Lig', groups_knockout: `${season?.group_count || 2} Grup + Eleme`, knockout: 'Direkt Eleme' }[format]}
        </span>
      </div>

      {drawMode === 'manual' && (
        <div className="card" style={{ border: '1px solid var(--accent)' }}>
          <h2 style={{ marginTop: 0 }}>📜 Noter Kurası Yerleşimi</h2>
          <p className="muted" style={{ fontSize: 13 }}>
            {format === 'groups_knockout'
              ? 'Önce hedef grubu seçin, sonra noterin çektiği takıma tıklayın — takım o gruba eklenir.'
              : format === 'knockout'
                ? 'Noterin çektiği sırayla takımlara tıklayın: 1. ve 2. çekilen ilk maçı, 3. ve 4. çekilen ikinci maçı oynar... (İlk çekilen ev sahibi olur.)'
                : 'Noterin çektiği sırayla takımlara tıklayın; fikstür bu kura numaralarına göre kurulur.'}
          </p>
          {format === 'groups_knockout' && (
            <div className="tabs">
              {letters.map(g => (
                <button key={g} className={activeGroup === g ? 'active' : ''} onClick={() => setActiveGroup(g)}>
                  {g} Grubu ({(drawGroups[g] || []).length})
                </button>
              ))}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label>Çekilmeyi Bekleyenler ({remaining.length})</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {remaining.map(t => (
                  <button key={t.id} className="btn" onClick={() => pick(t)}>{t.name}</button>
                ))}
                {remaining.length === 0 && <span className="muted">Tüm takımlar yerleşti ✓</span>}
              </div>
            </div>
            <div>
              <label>Kura Sonucu</label>
              {format === 'groups_knockout' ? (
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  {letters.map(g => (
                    <div key={g}>
                      <b>{g} Grubu</b>
                      {(drawGroups[g] || []).map((id, i) => <div key={id} className="muted">{i + 1}. {nameOf(id)}</div>)}
                    </div>
                  ))}
                </div>
              ) : format === 'knockout' ? (
                <div>
                  {Array.from({ length: Math.ceil(drawn.length / 2) }, (_, i) => (
                    <div key={i} className="muted">{i + 1}. Maç: <b>{nameOf(drawn[i * 2])}</b> — {drawn[i * 2 + 1] ? <b>{nameOf(drawn[i * 2 + 1])}</b> : '...'}</div>
                  ))}
                </div>
              ) : (
                drawn.map((id, i) => <div key={id} className="muted">{i + 1}. {nameOf(id)}</div>)
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button className="btn" onClick={undoPick} disabled={placedIds.length === 0}>↩ Son Çekimi Geri Al</button>
            <button className="btn" onClick={() => { setDrawn([]); setDrawGroups({}); }} disabled={placedIds.length === 0}>Sıfırla</button>
            <span style={{ flex: 1 }} />
            <button className="btn primary" disabled={!allPlaced} onClick={() => generate(true)}>
              ✅ Fikstürü Bu Kuraya Göre Oluştur
            </button>
          </div>
        </div>
      )}

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
  const [org, setOrg] = useState(null);
  const [logo, setLogo] = useState(null);
  useEffect(() => {
    api('/admin/settings').then(d => setEligibility(d.eligibility_check_enabled));
    api('/admin/organization').then(d => setOrg(d.organization));
  }, []);
  const save = async (value) => {
    setEligibility(value);
    await api('/admin/settings', { method: 'PUT', body: { eligibility_check_enabled: value } });
    flash('Ayar kaydedildi.');
  };
  return (
    <>
    {org && (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Organizasyon Profili</h2>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 12 }}>
          {org.logo_path
            ? <img src={org.logo_path} alt="" style={{ width: 64, height: 64, borderRadius: 12, objectFit: 'cover', background: '#fff' }} />
            : <span className="avatar lg">{org.name?.[0]}</span>}
          <div>
            <b>{org.name}</b>
            <div className="muted" style={{ fontSize: 12 }}>Logonuz sitenin üst menüsünde ve sayfalarınızda görünür.</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
              <input type="file" accept="image/*" style={{ width: 'auto' }} onChange={e => setLogo(e.target.files[0])} />
              <button className="btn sm primary" disabled={!logo} onClick={async () => {
                const fd = new FormData(); fd.append('logo', logo);
                try { await api('/admin/organization/logo', { method: 'POST', body: fd }); flash('Logo güncellendi — sayfa yenileniyor.'); setTimeout(() => window.location.reload(), 800); }
                catch (e2) { flash(e2.message, false); }
              }}>Logoyu Yükle</button>
            </div>
          </div>
        </div>
        <div className="formrow">
          <div><label>Organizasyon Adı</label><input value={org.name || ''} onChange={e => setOrg({ ...org, name: e.target.value })} /></div>
          <div><label>Yetkili Ad Soyad</label><input value={org.contact_name || ''} onChange={e => setOrg({ ...org, contact_name: e.target.value })} /></div>
          <div><label>{org.account_type === 'company' ? 'VKN' : 'TCKN/VKN'}</label><input value={org.tax_id || ''} onChange={e => setOrg({ ...org, tax_id: e.target.value })} /></div>
        </div>
        <label>Fatura Adresi</label>
        <input value={org.address || ''} onChange={e => setOrg({ ...org, address: e.target.value })} />
        <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>⚠️ Sezon ücreti faturalarınız bu bilgilere kesilir; hatasız olduğundan emin olun.</p>
        <button className="btn primary" style={{ marginTop: 10 }} onClick={async () => {
          try { await api('/admin/organization', { method: 'PUT', body: org }); flash('Organizasyon bilgileri kaydedildi.'); }
          catch (e2) { flash(e2.message, false); }
        }}>Bilgileri Kaydet</button>
      </div>
    )}
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
    </>
  );
}


const DEFAULT_COURT = { volleyball: 6, beach_volleyball: 2, football: 7, basketball: 5 };

function SeasonsTab({ flash, isSuper }) {
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
  const [groupMatches, setGroupMatches] = useState(0); // 0 = tam lig
  const [teamQuota, setTeamQuota] = useState(4);
  const [payMethod, setPayMethod] = useState('havale');
  const [unitPrice, setUnitPrice] = useState(0);
  const [cardModal, setCardModal] = useState(null);
  const load = () => api('/admin/seasons').then(d => setSeasons(d.seasons));
  useEffect(() => { load(); api('/admin/platform-price').then(d => setUnitPrice(d.platform_team_price)); }, []);
  const seasonBody = () => ({ name, sport, court_size: Number(courtSize), yellow_limit: sport === 'football' ? Number(yellowLimit) : 0, red_ban: sport === 'football' ? redBan : false, format, group_count: Number(groupCount), advance_count: Number(advanceCount), group_matches: Number(groupMatches) || 0, foul_limit: sport === 'basketball' ? Number(foulLimit) : 0, period_count: sport === 'basketball' ? Number(periodCount) : null, two_legged: format !== 'league' && twoLegged, entry_fee: entryFee ? Number(entryFee) : 0, team_quota: Number(teamQuota), payment_method: payMethod });
  const submitSeason = async (body) => {
    const d = await api('/admin/seasons', { method: 'POST', body });
    if (d.approval_status === 'pending') flash('Sezon oluşturuldu — ödeme (havale/nakit) sonrası süper admin onayıyla kullanıma açılacak.');
    else if (d.platform_fee) flash('Ödeme alındı, sezon kullanıma hazır! 🎉');
    else flash('Sezon eklendi.');
    setName(''); load();
  };
  const add = async (e) => {
    e.preventDefault();
    try {
      if (!isSuper && unitPrice > 0 && payMethod === 'kart') {
        setCardModal({ number: '', holder: '', exp: '', cvv: '' });
        return;
      }
      await submitSeason(seasonBody());
    } catch (err) { flash(err.message, false); }
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
                  {[1, 2, 3, 4].map(n => <option key={n} value={n}>İlk {n}</option>)}
                </select>
              </div>
              <div><label>Grup İçi Maç Sayısı</label>
                <select value={groupMatches} onChange={e => setGroupMatches(e.target.value)}>
                  <option value={0}>Herkes herkesle (tam lig)</option>
                  {[2, 3, 4, 5, 6].map(n => <option key={n} value={n}>Takım başı {n} maç (kura ile)</option>)}
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
          {!isSuper && unitPrice > 0 && (
            <>
              <div><label>Takım Sayısı (kontenjan) *</label>
                <select value={teamQuota} onChange={e => setTeamQuota(e.target.value)}>
                  {[2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32].map(n => <option key={n} value={n}>{n} takım</option>)}
                </select>
              </div>
              <div><label>Sezon Ücreti Ödemesi</label>
                <select value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                  <option value="havale">Havale/EFT (onay gerekir)</option>
                  <option value="nakit">Nakit (onay gerekir)</option>
                  <option value="kart">Kredi Kartı (anında aktif)</option>
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <span style={{ fontWeight: 800, color: 'var(--accent)' }}>
                  Tutar: {(unitPrice * teamQuota).toLocaleString('tr-TR')} ₺
                  <span className="muted" style={{ fontWeight: 400 }}> ({unitPrice} ₺ × {teamQuota})</span>
                </span>
              </div>
            </>
          )}
          <div style={{ display: 'flex', alignItems: 'flex-end' }}><button className="btn primary">Ekle</button></div>
        </form>
        <p className="muted" style={{ marginTop: 8 }}>Her branşın kendi aktif sezonu vardır; yeni sezonu aktifleştirince öncekisi arşive düşer. Saha içi sayısı maç konsolundaki dizilimi belirler (örn. plaj voleybolu 2, 3 veya 4 kişilik oynanabilir); geri kalan oyuncular yedek kulübesinde görünür.</p>
      </div>
      {cardModal && (
        <div className="goal-modal-backdrop" onClick={() => setCardModal(null)}>
          <div className="goal-modal card" onClick={e => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>💳 Kart ile Ödeme</h2>
            <p className="muted" style={{ fontSize: 13 }}>Tutar: <b style={{ color: 'var(--accent)' }}>{(unitPrice * teamQuota).toLocaleString('tr-TR')} ₺</b> — ödeme onaylanınca sezon anında kullanıma açılır. <i>(Test modu: gerçek POS entegrasyonu için sanal POS bilgileriniz bağlanacaktır.)</i></p>
            <label>Kart Numarası</label>
            <input inputMode="numeric" maxLength={19} placeholder="0000 0000 0000 0000" value={cardModal.number} onChange={e => setCardModal({ ...cardModal, number: e.target.value })} />
            <label>Kart Üzerindeki İsim</label>
            <input value={cardModal.holder} onChange={e => setCardModal({ ...cardModal, holder: e.target.value })} />
            <div className="formrow">
              <div><label>SKT (AA/YY)</label><input maxLength={5} placeholder="12/27" value={cardModal.exp} onChange={e => setCardModal({ ...cardModal, exp: e.target.value })} /></div>
              <div><label>CVV</label><input maxLength={3} placeholder="123" value={cardModal.cvv} onChange={e => setCardModal({ ...cardModal, cvv: e.target.value })} /></div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button className="btn green big" style={{ flex: 1 }} onClick={async () => {
                try { await submitSeason(seasonBody()); setCardModal(null); }
                catch (err) { flash(err.message, false); }
              }}>Öde ve Sezonu Aç</button>
              <button className="btn" onClick={() => setCardModal(null)}>Vazgeç</button>
            </div>
          </div>
        </div>
      )}
      <div className="card">
        <table>
          <thead><tr><th>Sezon</th><th>Branş</th><th>Saha İçi</th><th>Durum</th><th></th></tr></thead>
          <tbody>
            {seasons.map(se => (
              <tr key={se.id}>
                <td style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {se.image_path && <img src={se.image_path} alt="" style={{ width: 34, height: 34, borderRadius: 6, objectFit: 'cover' }} />}
                  <b>{se.name}</b>
                </td>
                <td>{L[se.sport]}<div className="muted" style={{ fontSize: 11 }}>{{ league: 'Lig', groups_knockout: 'Grup+Eleme', knockout: 'Eleme' }[se.format || 'league']}</div></td>
                <td>{se.court_size || DEFAULT_COURT[se.sport] || 6}
                  {se.sport === 'football' && <div className="muted" style={{ fontSize: 11 }}>
                    {se.yellow_limit ? `${se.yellow_limit} sarı = ceza` : 'sarı kuralı yok'}{se.red_ban ? ' · kırmızı = ceza' : ''}
                  </div>}
                  {se.format === 'groups_knockout' && <div className="muted" style={{ fontSize: 11 }}>
                    {se.group_matches ? `takım başı ${se.group_matches} maç · ilk ${se.advance_count || 2} çıkar` : `tam lig · ilk ${se.advance_count || 2} çıkar`}
                  </div>}
                  {se.sport === 'basketball' && <div className="muted" style={{ fontSize: 11 }}>
                    {se.foul_limit ? `${se.foul_limit} faul = oyun dışı` : 'faul limiti yok'} · {se.period_count === 2 ? '2 devre' : '4 çeyrek'}
                  </div>}
                </td>
                <td>
                  {se.approval_status === 'pending' ? <span className="badge pending">Onay Bekliyor</span>
                    : se.approval_status === 'rejected' ? <span className="badge rejected">Reddedildi</span>
                    : se.is_active ? <span className="badge approved">Aktif</span> : <span className="badge finished">Arşiv</span>}
                  {se.platform_fee ? <div className="muted" style={{ fontSize: 11 }}>{Number(se.platform_fee).toLocaleString('tr-TR')} ₺ · {se.payment_method}{se.team_quota ? ` · ${se.team_quota} takım` : ''}</div> : null}
                </td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <label className="btn sm" style={{ cursor: 'pointer' }}>
                    {se.image_path ? '🖼 Görseli Değiştir' : '🖼 Sezon Görseli'}
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={async e => {
                      const file = e.target.files[0];
                      if (!file) return;
                      const fd = new FormData(); fd.append('image', file);
                      try { await api(`/admin/seasons/${se.id}/image`, { method: 'POST', body: fd }); flash('Sezon görseli yüklendi.'); load(); }
                      catch (err) { flash(err.message, false); }
                    }} />
                  </label>{' '}
                  {se.image_path && <button className="btn sm red" onClick={async () => { await api(`/admin/seasons/${se.id}/image`, { method: 'DELETE' }); flash('Görsel kaldırıldı.'); load(); }}>✕</button>}{' '}
                  {!se.is_active && se.approval_status === 'approved' && <button className="btn sm" onClick={() => activate(se.id)}>Aktifleştir</button>}
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


function OrgsTab({ flash }) {
  const [orgs, setOrgs] = useState([]);
  const [name, setName] = useState('');
  const load = () => api('/admin/organizations').then(d => setOrgs(d.organizations));
  useEffect(() => { load(); }, []);
  const add = async (e) => {
    e.preventDefault();
    try { await api('/admin/organizations', { method: 'POST', body: { name } }); flash('Organizasyon (müşteri) oluşturuldu.'); setName(''); load(); }
    catch (err) { flash(err.message, false); }
  };
  return (
    <>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Yeni Organizasyon (Müşteri)</h2>
        <form onSubmit={add} className="formrow">
          <div><label>Organizasyon Adı *</label><input value={name} onChange={e => setName(e.target.value)} required placeholder="örn. Ankara Şirketler Ligi" /></div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}><button className="btn primary">Oluştur</button></div>
        </form>
        <p className="muted" style={{ marginTop: 8 }}>Her müşterinin sezonları, takımları, kullanıcıları ve ayarları tamamen ayrıdır. Üstteki organizasyon seçici ile müşteriler arasında geçiş yapıp her birini ayrı yönetebilirsiniz.</p>
      </div>
      <div className="card">
        <table>
          <thead><tr><th>Organizasyon</th><th>Kısa Ad (URL)</th><th>Uygunluk Kontrolü</th></tr></thead>
          <tbody>
            {orgs.map(o => (
              <tr key={o.id}>
                <td><b>{o.name}</b></td>
                <td className="muted">{o.slug}</td>
                <td>{o.eligibility_required ? 'Açık' : 'Kapalı'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}


function PlatformTab({ flash }) {
  const [data, setData] = useState(null);
  const [price, setPrice] = useState('');
  const load = () => api('/admin/platform').then(d => { setData(d); setPrice(d.platform_team_price); });
  useEffect(() => { load(); }, []);
  if (!data) return null;
  const PM = { havale: 'Havale/EFT', nakit: 'Nakit', kart: 'Kredi Kartı' };
  const act = async (id, action) => {
    try { await api(`/admin/platform/seasons/${id}/${action}`, { method: 'POST' }); flash(action === 'approve' ? 'Sezon onaylandı — müşteri kullanabilir.' : 'Sezon reddedildi.'); load(); }
    catch (e) { flash(e.message, false); }
  };
  return (
    <>
      <div className="card" style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div><label>Takım Başı Sezon Ücreti (₺)</label>
          <input type="number" min="0" style={{ width: 160 }} value={price} onChange={e => setPrice(e.target.value)} /></div>
        <button className="btn primary" onClick={async () => {
          try { await api('/admin/platform/price', { method: 'PUT', body: { platform_team_price: Number(price) } }); flash('Fiyat güncellendi.'); load(); }
          catch (e) { flash(e.message, false); }
        }}>Kaydet</button>
        <span className="muted" style={{ fontSize: 12 }}>0 = ücretsiz mod (onay akışı kapalı). Üyelik her zaman ücretsizdir; ücret yalnızca sezon açarken alınır.</span>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>💰 Onay Bekleyen Sezonlar (Havale/Nakit)</h2>
        {data.pending.length === 0 && <p className="muted">Bekleyen sezon yok. 🎉</p>}
        {data.pending.map(s => (
          <div key={s.id} className="matchrow">
            <div style={{ flex: 1 }}>
              <b>{s.org_name}</b> — {s.name}
              <div className="muted">{s.team_quota} takım · {Number(s.platform_fee).toLocaleString('tr-TR')} ₺ · {PM[s.payment_method]}</div>
            </div>
            <div style={{ whiteSpace: 'nowrap' }}>
              <button className="btn sm green" onClick={() => act(s.id, 'approve')}>Ödeme Alındı — Onayla</button>{' '}
              <button className="btn sm red" onClick={() => act(s.id, 'reject')}>Reddet</button>
            </div>
          </div>
        ))}
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Platform Ödeme Geçmişi</h2>
        <table>
          <thead><tr><th>Müşteri</th><th>Sezon</th><th className="num">Tutar</th><th>Yöntem</th><th>Durum</th><th>Tarih</th></tr></thead>
          <tbody>
            {data.payments.map(p => (
              <tr key={p.id}>
                <td>{p.org_name}</td>
                <td className="muted">{p.season_name || '-'}</td>
                <td className="num"><b>{Number(p.amount).toLocaleString('tr-TR')} ₺</b></td>
                <td>{PM[p.method]}</td>
                <td><span className={`badge ${p.status === 'paid' ? 'approved' : p.status === 'rejected' ? 'rejected' : 'pending'}`}>
                  {p.status === 'paid' ? 'Ödendi' : p.status === 'rejected' ? 'Reddedildi' : 'Bekliyor'}</span></td>
                <td className="muted">{p.created_at?.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}


function EmbedTab({ flash }) {
  const [org, setOrg] = useState(null);
  const [sport, setSport] = useState('volleyball');
  const [view, setView] = useState('standings');
  const [theme, setTheme] = useState('dark');
  const [height, setHeight] = useState(500);
  useEffect(() => { api('/admin/organization').then(d => setOrg(d.organization)); }, []);
  if (!org) return null;
  const base = window.location.origin;
  const url = `${base}/embed?org=${org.slug}&sport=${sport}&view=${view}&theme=${theme}`;
  const code = `<iframe src="${url}" style="width:100%;height:${height}px;border:0;" title="Turnuva"></iframe>`;
  const VIEWS = { standings: 'Puan Durumu', fixtures: 'Fikstür', leaders: 'İstatistik Liderleri', live: 'Canlı Skorlar' };
  return (
    <>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>🌐 Web Sitene Ekle</h2>
        <p className="muted" style={{ fontSize: 13 }}>
          Aşağıdaki kodu kendi web sitenizin HTML'ine yapıştırın — turnuva ekranınız sitenizin içinde,
          canlı güncellenerek görünür. Skor girdikçe otomatik yenilenir.
        </p>
        <div className="formrow">
          <div><label>Görünüm</label>
            <select value={view} onChange={e => setView(e.target.value)}>
              {Object.entries(VIEWS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div><label>Branş</label>
            <select value={sport} onChange={e => setSport(e.target.value)}>
              <option value="volleyball">Voleybol</option>
              <option value="beach_volleyball">Plaj Voleybolu</option>
              <option value="football">Futbol</option>
              <option value="basketball">Basketbol</option>
            </select>
          </div>
          <div><label>Tema</label>
            <select value={theme} onChange={e => setTheme(e.target.value)}>
              <option value="dark">Koyu</option>
              <option value="light">Açık</option>
            </select>
          </div>
          <div><label>Yükseklik (px)</label>
            <input type="number" min="200" step="50" value={height} onChange={e => setHeight(e.target.value)} />
          </div>
        </div>
        <label>Gömme Kodu</label>
        <textarea readOnly value={code} rows={3} style={{ fontFamily: 'monospace', fontSize: 12 }} onClick={e => e.target.select()} />
        <button className="btn primary" style={{ marginTop: 8 }} onClick={() => { navigator.clipboard.writeText(code); flash('Gömme kodu kopyalandı!'); }}>Kodu Kopyala</button>
        <a className="btn" style={{ marginTop: 8, marginLeft: 8 }} href={url} target="_blank" rel="noreferrer">Önizle ↗</a>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Canlı Önizleme</h2>
        <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', background: theme === 'light' ? '#fff' : 'var(--bg2)' }}>
          <iframe src={url} style={{ width: '100%', height: height + 'px', border: 0 }} title="onizleme" />
        </div>
      </div>
    </>
  );
}
