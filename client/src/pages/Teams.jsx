import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useSport } from '../App.jsx';

export default function Teams() {
  const { sport } = useSport();
  const [teams, setTeams] = useState([]);
  useEffect(() => { api(`/teams?sport=${sport}`).then(d => setTeams(d.teams)); }, [sport]);
  return (
    <>
      <h1>Takımlar</h1>
      <div className="grid cols3">
        {teams.map(t => (
          <Link to={`/takim/${t.id}`} className="card teamcard" key={t.id}>
            {t.logo_path ? <img className="teamlogo xl" src={t.logo_path} alt="" /> : <span className="avatar lg">{t.name[0]}</span>}
            <h2 style={{ margin: '10px 0 2px' }}>{t.name}</h2>
            <p className="muted">{t.company}</p>
            <p className="muted">{t.player_count} onaylı oyuncu</p>
          </Link>
        ))}
      </div>
    </>
  );
}
