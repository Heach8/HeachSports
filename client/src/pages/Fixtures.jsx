import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useSport } from '../App.jsx';
import { MatchRow } from './Home.jsx';

export default function Fixtures() {
  const { sport } = useSport();
  const [matches, setMatches] = useState([]);
  useEffect(() => { api(`/fixtures?sport=${sport}`).then(d => setMatches(d.matches)); }, [sport]);
  const labels = [...new Set(matches.map(m => m.stage_label || `${m.round}. Hafta`))];
  return (
    <>
      <h1>Fikstür</h1>
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
