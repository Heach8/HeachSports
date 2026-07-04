import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useSport } from '../App.jsx';
import { TeamBadge } from './Home.jsx';

export default function Standings() {
  const { sport } = useSport();
  const [rows, setRows] = useState([]);
  useEffect(() => { api(`/standings?sport=${sport}`).then(d => setRows(d.standings)); }, [sport]);
  const vb = ['volleyball', 'beach_volleyball'].includes(sport);
  const fb = sport === 'football';
  return (
    <>
      <h1>Puan Durumu</h1>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>#</th><th>Takım</th><th className="num">O</th><th className="num">G</th>
              {fb && <th className="num">B</th>}
              <th className="num">M</th>
              {vb ? (
                <><th className="num">AS</th><th className="num">VS</th><th className="num">Set O.</th><th className="num">SA</th><th className="num">SV</th></>
              ) : (
                <><th className="num">A</th><th className="num">Y</th><th className="num">{fb ? 'Av.' : 'Fark'}</th></>
              )}
              <th className="num">Puan</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.team_id}>
                <td>{r.rank}</td>
                <td><Link to={`/takim/${r.team_id}`}><TeamBadge name={<b>{r.name}</b>} logo={r.logo_path} /></Link><div className="muted">{r.company}</div></td>
                <td className="num">{r.played}</td><td className="num">{r.won}</td>
                {fb && <td className="num">{r.drawn}</td>}
                <td className="num">{r.lost}</td>
                {vb ? (
                  <><td className="num">{r.sets_won}</td><td className="num">{r.sets_lost}</td><td className="num">{r.set_ratio}</td><td className="num">{r.points_for}</td><td className="num">{r.points_against}</td></>
                ) : (
                  <><td className="num">{r.points_for}</td><td className="num">{r.points_against}</td><td className="num">{r.diff > 0 ? '+' + r.diff : r.diff}</td></>
                )}
                <td className="num"><b style={{ color: 'var(--accent)' }}>{r.points}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted" style={{ marginTop: 10 }}>
          {vb ? 'O: Oynanan · G: Galibiyet · M: Mağlubiyet · AS/VS: Alınan/Verilen set · SA/SV: Sayı · Puan: 3-0/3-1 galibiyet 3, 3-2 galibiyet 2, 2-3 mağlubiyet 1'
             : fb ? 'O: Oynanan · G: Galibiyet · B: Beraberlik · M: Mağlubiyet · A/Y: Atılan/Yenilen gol · Galibiyet 3, beraberlik 1 puan'
                  : 'O: Oynanan · G: Galibiyet · M: Mağlubiyet · A/Y: Atılan/Yenilen sayı · Galibiyet 2, mağlubiyet 1 puan'}
        </p>
      </div>
    </>
  );
}
