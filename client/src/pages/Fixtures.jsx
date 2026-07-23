import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import FancySelect from '../components/FancySelect.jsx';
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
          <div style={{ marginBottom: 16 }}>
            <FancySelect size="md" icon="📅"
              value={seasonId}
              options={seasons.map(s => ({ value: s.is_active ? '' : String(s.id), label: s.name, hint: s.is_active ? 'Aktif' : 'Arşiv' }))}
              onChange={setSeasonId}
            />
          </div>
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
