import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';

export default function ConsoleList() {
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);

  useEffect(() => {
    api('/sports').then(async d => {
      const results = await Promise.all(d.sports.map(s => api(`/fixtures?sport=${s.key}`).then(f => ({ s, f }))));
      const gs = [];
      for (const { s, f } of results) {
        const active = f.matches.filter(m => m.status !== 'finished');
        const finished = f.matches.filter(m => m.status === 'finished').slice(-3).reverse();
        if (active.length || finished.length) gs.push({ label: s.label, matches: active, finished });
      }
      setGroups(gs);
    });
  }, []);

  if (user === undefined) return null;
  if (!user || !['scorekeeper', 'admin', 'super_admin'].includes(user.role)) {
    return <p className="muted">Bu sayfa masa görevlilerine özeldir. Lütfen giriş yapın.</p>;
  }
  return (
    <>
      <h1>Maç Konsolu</h1>
      <p className="muted">Yönetmek istediğiniz maçı seçin.</p>
      {groups.length === 0 && <div className="card"><p className="muted">Yönetilecek maç yok.</p></div>}
      {groups.map(g => (
        <div className="card" key={g.label}>
          <h2 style={{ marginTop: 0 }}>{g.label}</h2>
          {g.matches.map(m => (
            <div className="matchrow" key={m.id}>
              <span className={`badge ${m.status}`}>{m.status === 'live' ? 'CANLI' : `${m.round}. Hafta`}</span>
              <span className="teams">{m.home_team} <span className="score">{m.status === 'live' ? '●' : 'vs'}</span> {m.away_team}</span>
              <Link className="btn primary sm" to={`/konsol/${m.id}`}>{m.status === 'live' ? 'Devam Et' : 'Yönet'}</Link>
            </div>
          ))}
          {g.finished.length > 0 && <p className="muted" style={{ margin: '10px 0 4px', fontSize: 12 }}>Son biten maçlar (MVP seçimi / düzeltme):</p>}
          {g.finished.map(m => (
            <div className="matchrow" key={m.id}>
              <span className="badge finished">Bitti</span>
              <span className="teams">{m.home_team} <span className="score">{m.home_sets}-{m.away_sets}</span> {m.away_team}</span>
              <Link className="btn sm" to={`/konsol/${m.id}`}>Aç</Link>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
