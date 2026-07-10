import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, subscribeLive } from '../api.js';
import { TeamBadge } from './Home.jsx';

export default function MatchDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);

  const load = () => api(`/matches/${id}`).then(setData);
  useEffect(() => {
    load();
    return subscribeLive(Number(id), () => load());
  }, [id]);

  if (!data) return null;
  const { match: m, sets, playerStats: stats, sport } = data;
  const isVb = sport.winnerBy === 'periods';
  const totals = sets.reduce((a, s) => ({ h: a.h + s.home_points, w: a.w + s.away_points }), { h: 0, w: 0 });
  const scoreText = m.status === 'scheduled' ? 'vs'
    : isVb ? `${m.home_sets} - ${m.away_sets}`
    : m.status === 'live' ? `${totals.h} - ${totals.w}` : `${m.home_sets} - ${m.away_sets}`;

  return (
    <>
      <div className="card" style={{ textAlign: 'center' }}>
        {m.status === 'live' && <span className="badge live">CANLI</span>}
        <div className="console-score" style={{ marginTop: 10 }}>
          <div className="team-name"><Link to={`/takim/${m.home_team_id}`}><TeamBadge name={m.home_team} logo={m.home_logo} /></Link></div>
          <div className="sets">{scoreText}</div>
          <div className="team-name"><Link to={`/takim/${m.away_team_id}`}><TeamBadge name={m.away_team} logo={m.away_logo} right /></Link></div>
        </div>
        <table style={{ maxWidth: 420, margin: '0 auto' }}>
          <thead><tr><th>{sport.periodName}</th><th className="num">{m.home_team}</th><th className="num">{m.away_team}</th></tr></thead>
          <tbody>
            {sets.map(s => (
              <tr key={s.set_no}>
                <td>{s.set_no}. {sport.periodName} {!s.finished && m.status === 'live' ? '(oynanıyor)' : ''}</td>
                <td className="num"><b>{s.home_points}</b></td>
                <td className="num"><b>{s.away_points}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.mvp && <p style={{ marginTop: 12, color: 'var(--accent)' }}>⭐ Maçın Oyuncusu: <Link to={`/oyuncu/${data.mvp.id}`}>{data.mvp.first_name} {data.mvp.last_name}</Link></p>}
        {m.status === 'live' && <p style={{ marginTop: 10 }}><Link className="btn sm" to={`/scoreboard/${m.id}`} target="_blank">Skorboard Görünümü ↗</Link></p>}
      </div>
      {sport.key === 'football' && data.goals?.length > 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>⚽ Goller</h2>
          {data.goals.map((g, i) => (
            <p key={i} style={{ padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
              <span className="muted">{g.period}. Devre</span> · <b>{g.team_id === m.home_team_id ? m.home_team : m.away_team}</b> ·{' '}
              {g.own_goal ? 'Kendi kalesine gol' : <>⚽ {g.scorer}{g.detail_label && <span className="muted"> ({g.detail_label})</span>}{g.assist && <span> · <span className="muted">Asist:</span> {g.assist}</span>}</>}
            </p>
          ))}
        </div>
      )}
      {stats.length > 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Oyuncu İstatistikleri</h2>
          <table>
            <thead><tr><th>Oyuncu</th><th>Takım</th>{sport.statCols.map(c => <th key={c.key} className="num">{c.label}</th>)}{sport.ratioCols.map(c => <th key={c.key} className="num">{c.label}</th>)}</tr></thead>
            <tbody>
              {stats.map(p => (
                <tr key={p.id}>
                  <td><Link to={`/oyuncu/${p.id}`}>#{p.jersey_no} {p.first_name} {p.last_name}</Link></td>
                  <td className="muted">{p.team_id === m.home_team_id ? m.home_team : m.away_team}</td>
                  {sport.statCols.map((c, i) => <td key={c.key} className="num">{i === 0 ? <b>{p[c.key]}</b> : p[c.key]}</td>)}
                  {sport.ratioCols.map(c => {
                    const t = (p[c.ok] || 0) + (p[c.err] || 0);
                    return <td key={c.key} className="num">{t ? Math.round(100 * (p[c.ok] || 0) / t) + '%' : '-'}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
