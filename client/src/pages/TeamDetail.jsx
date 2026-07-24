import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { MatchRow } from './Home.jsx';

export default function TeamDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  useEffect(() => { api(`/teams/${id}`).then(setData); }, [id]);
  if (!data) return null;
  return (
    <>
      <div className="card" style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
        {data.team.logo_path ? <img className="teamlogo xl" src={data.team.logo_path} alt="" /> : <span className="avatar lg">{data.team.name[0]}</span>}
        <div>
          <h1 style={{ marginBottom: 2 }}>{data.team.name}</h1>
          <p className="muted">{data.team.company} · {data.sport.label}</p>
        </div>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Kadro</h2>
        <table>
          <thead><tr><th></th><th>#</th><th>Oyuncu</th><th>Mevki</th></tr></thead>
          <tbody>
            {data.players.map(p => (
              <tr key={p.id}>
                <td>{p.photo_path
                  ? <img className="avatar" src={p.photo_path} alt="" />
                  : <span className="avatar">{p.first_name[0]}{p.last_name[0]}</span>}</td>
                <td><b>{p.jersey_no}</b></td>
                <td><Link to={`/oyuncu/${p.id}`}>{p.first_name} {p.last_name}</Link></td>
                <td>{p.position}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Maçlar</h2>
        {data.matches.map(m => <MatchRow key={m.id} m={m} />)}
      </div>
    </>
  );
}
