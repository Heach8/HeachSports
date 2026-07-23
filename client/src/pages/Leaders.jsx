import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useSport } from '../App.jsx';

export default function Leaders() {
  const { sport } = useSport();
  const [data, setData] = useState(null);
  useEffect(() => { api(`/leaders?sport=${sport}`).then(setData); }, [sport]);
  if (!data) return null;
  return (
    <>
      <h1>İstatistik Liderleri</h1>
      <div className="grid cols2">
        {data.titles.map(t => (
          <div className="card" key={t.key}>
            <h2 style={{ marginTop: 0 }}>{t.key === 'mvp' ? '⭐ ' : ''}{t.label}</h2>
            <table>
              <tbody>
                {(data.leaders[t.key] || []).map((p, i) => (
                  <tr key={p.id}>
                    <td style={{ width: 30 }}>{i + 1}</td>
                    <td style={{ width: 44 }}>{p.photo_path
                      ? <img className="avatar" src={p.photo_path} alt="" />
                      : <span className="avatar">{p.first_name[0]}{p.last_name[0]}</span>}</td>
                    <td>
                      <Link to={`/oyuncu/${p.id}`}>{p.first_name} {p.last_name}</Link>
                      <div className="muted" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        {p.team_logo && <img className="teamlogo sm" src={p.team_logo} alt="" />}{p.team_name}
                      </div>
                    </td>
                    <td className="num"><b style={{ color: 'var(--accent)', fontSize: 17 }}>{p.value}{t.suffix || ''}</b></td>
                  </tr>
                ))}
                {(data.leaders[t.key] || []).length === 0 && <tr><td className="muted">Henüz veri yok</td></tr>}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </>
  );
}
