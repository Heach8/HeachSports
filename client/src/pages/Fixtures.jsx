import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useSport } from '../App.jsx';
import { MatchRow } from './Home.jsx';

export default function Fixtures() {
  const { sport } = useSport();
  const [matches, setMatches] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [seasonId, setSeasonId] = useState('');
  useEffect(() => { api(`/seasons-list?sport=${sport}`).then(d => { setSeasons(d.seasons); setSeasonId(''); }); }, [sport]);
  useEffect(() => { api(`/fixtures?sport=${sport}${seasonId ? `&season_id=${seasonId}` : ''}`).then(d => setMatches(d.matches)); }, [sport, seasonId]);
  const labels = [...new Set(matches.map(m => m.stage_label || `${m.round}. Hafta`))];
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ marginBottom: 16 }}>Fikstür</h1>
        {seasons.length > 1 && (
          <select style={{ width: 'auto', marginBottom: 16 }} value={seasonId} onChange={e => setSeasonId(e.target.value)}>
            {seasons.map(s => <option key={s.id} value={s.is_active ? '' : s.id}>{s.name}{s.is_active ? ' (Aktif)' : ' (Arşiv)'}</option>)}
          </select>
        )}
      </div>
      {labels.length === 0 && <p className="muted">Bu branşta fikstür henüz oluşturulmadı.</p>}
      {labels.map(lb => (
        <div className="card" key={lb}>
          <h2 style={{ marginTop: 0 }}>{lb}</h2>
          {matches.filter(m => (m.stage_label || `${m.round}. Hafta`) === lb).map(m => <MatchRow key={m.id} m={m} />)}
        </div>
      ))}
    </>
  );
}
