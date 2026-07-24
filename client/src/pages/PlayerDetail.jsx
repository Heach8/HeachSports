import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';

const PENALTY_LABEL = { yellow: 'Sarı Kart', red: 'Kırmızı Kart', ban: 'Men Cezası' };

export default function PlayerDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  useEffect(() => { api(`/players/${id}`).then(setData); }, [id]);
  if (!data) return null;
  const { player, stats, penalties, mvp_count, sport } = data;
  return (
    <>
      <div className="card" style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
        {player.photo_path
          ? <img className="avatar lg" src={player.photo_path} alt="" />
          : <span className="avatar lg">{player.first_name[0]}{player.last_name[0]}</span>}
        <div>
          <h1 style={{ marginBottom: 4 }}>#{player.jersey_no} {player.first_name} {player.last_name}</h1>
          <p className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {player.team_logo && <img className="teamlogo" src={player.team_logo} alt="" />}
            <Link to={`/takim/${player.team_id}`}>{player.team_name}</Link> · {player.position}
          </p>
          {mvp_count > 0 && <p style={{ color: 'var(--accent)', marginTop: 6 }}>⭐ {mvp_count} kez maçın oyuncusu</p>}
        </div>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Sezon İstatistikleri ({sport.label})</h2>
        <table>
          <thead><tr><th className="num">Maç</th>{sport.statCols.map(c => <th key={c.key} className="num">{c.label}</th>)}{sport.ratioCols.map(c => <th key={c.key} className="num">{c.label}</th>)}</tr></thead>
          <tbody><tr>
            <td className="num">{stats.matches_played || 0}</td>
            {sport.statCols.map((c, i) => <td key={c.key} className="num">{i === 0 ? <b>{stats[c.key] || 0}</b> : (stats[c.key] || 0)}</td>)}
            {sport.ratioCols.map(c => {
              const t = (stats[c.ok] || 0) + (stats[c.err] || 0);
              return <td key={c.key} className="num">{t ? Math.round(100 * (stats[c.ok] || 0) / t) + '%' : '-'}</td>;
            })}
          </tr></tbody>
        </table>
      </div>
      {data.career.length > 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Turnuva Geçmişi</h2>
          <table>
            <thead><tr><th>Turnuva</th><th>Branş</th><th>Takım</th><th className="num">Maç</th><th className="num">Toplam Sayı</th></tr></thead>
            <tbody>
              {data.career.map(c => (
                <tr key={c.player_id} style={c.player_id === player.id ? { background: 'rgba(245,158,11,.06)' } : {}}>
                  <td>{c.player_id === player.id ? <b>{c.season_name}</b> : <Link to={`/oyuncu/${c.player_id}`}>{c.season_name}</Link>}</td>
                  <td className="muted">{c.sport_label}</td>
                  <td style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {c.team_logo && <img className="teamlogo sm" src={c.team_logo} alt="" />}{c.team_name}
                  </td>
                  <td className="num">{c.matches_played}</td>
                  <td className="num"><b>{c.total_points}</b></td>
                </tr>
              ))}
              {data.career.length > 1 && (
                <tr style={{ borderTop: '2px solid var(--border)' }}>
                  <td colSpan={3}><b>Kariyer Toplamı</b></td>
                  <td className="num"><b>{data.career.reduce((a, c) => a + c.matches_played, 0)}</b></td>
                  <td className="num"><b style={{ color: 'var(--accent)' }}>{data.career.reduce((a, c) => a + c.total_points, 0)}</b></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {penalties.length > 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Disiplin</h2>
          {penalties.map(pe => (
            <p key={pe.id} style={{ padding: '6px 0' }}>
              {PENALTY_LABEL[pe.type]}{pe.ban_matches ? ` (${pe.ban_matches} maç)` : ''} — <span className="muted">{pe.note || ''} {pe.created_at?.slice(0, 10)}</span>
            </p>
          ))}
        </div>
      )}
    </>
  );
}
