import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useSport } from '../App.jsx';
import { MatchRow } from './Home.jsx';

export default function Fixtures() {
  const { sport } = useSport();
  const [matches, setMatches] = useState([]);
  useEffect(() => { api(`/fixtures?sport=${sport}`).then(d => setMatches(d.matches)); }, [sport]);
  const rounds = [...new Set(matches.map(m => m.round))];
  return (
    <>
      <h1>Fikstür</h1>
      {rounds.length === 0 && <p className="muted">Bu branşta fikstür henüz oluşturulmadı.</p>}
      {rounds.map(r => (
        <div className="card" key={r}>
          <h2 style={{ marginTop: 0 }}>{r}. Hafta</h2>
          {matches.filter(m => m.round === r).map(m => <MatchRow key={m.id} m={m} />)}
        </div>
      ))}
    </>
  );
}
