import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useSport } from '../App.jsx';
import { TeamBadge, MatchRow } from './Home.jsx';

function StandingsTable({ rows, sport }) {
  const vb = ['volleyball', 'beach_volleyball'].includes(sport);
  const fb = sport === 'football';
  return (
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
  );
}

export default function Standings() {
  const { sport } = useSport();
  const [data, setData] = useState(null);
  useEffect(() => { api(`/standings?sport=${sport}`).then(setData); }, [sport]);
  if (!data) return null;
  const fmt = data.format || 'league';
  const vb = ['volleyball', 'beach_volleyball'].includes(sport);
  const fb = sport === 'football';
  return (
    <>
      <h1>{fmt === 'knockout' ? 'Eleme Tablosu' : 'Puan Durumu'}</h1>

      {fmt === 'league' && (
        <div className="card"><StandingsTable rows={data.standings || []} sport={sport} /></div>
      )}

      {fmt === 'groups_knockout' && (data.groups || []).map(g => (
        <div className="card" key={g.name}>
          <h2 style={{ marginTop: 0 }}>{g.name} Grubu</h2>
          <StandingsTable rows={g.standings} sport={sport} />
        </div>
      ))}

      {(data.knockout || []).length > 0 && (
        <>
          <h1 style={{ marginTop: 24 }}>🏆 Eleme Aşaması</h1>
          {data.knockout.map((r, i) => (
            <div className="card" key={i}>
              <h2 style={{ marginTop: 0 }}>{r.label}</h2>
              {r.matches.map(m => <MatchRow key={m.id} m={m} />)}
            </div>
          ))}
        </>
      )}

      {fmt === 'knockout' && (data.knockout || []).length === 0 && (
        <p className="muted">Eleme fikstürü henüz oluşturulmadı.</p>
      )}

      {fmt !== 'knockout' && (
        <p className="muted" style={{ marginTop: 10 }}>
          {vb ? 'O: Oynanan · G: Galibiyet · M: Mağlubiyet · AS/VS: Alınan/Verilen set · SA/SV: Sayı'
             : fb ? 'O: Oynanan · G: Galibiyet · B: Beraberlik · M: Mağlubiyet · A/Y: Atılan/Yenilen gol'
                  : 'O: Oynanan · G: Galibiyet · M: Mağlubiyet · A/Y: Atılan/Yenilen sayı'}
        </p>
      )}
    </>
  );
}
