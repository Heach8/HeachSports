import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, subscribeLive } from '../api.js';
import { useSport } from '../App.jsx';

export function TeamBadge({ name, logo, right = false }) {
  const img = logo ? <img className="teamlogo" src={logo} alt="" /> : null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexDirection: right ? 'row-reverse' : 'row' }}>
      {img}{name}
    </span>
  );
}

export function MatchRow({ m }) {
  return (
    <Link to={`/mac/${m.id}`} className="matchrow">
      <span className={`badge ${m.status}`}>
        {m.status === 'live' ? 'CANLI' : m.status === 'finished' ? 'Bitti' : (m.scheduled_at ? new Date(m.scheduled_at).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : (m.stage_label || `${m.round}. Hafta`))}
      </span>
      <span className="teams">
        <TeamBadge name={m.home_team} logo={m.home_logo} />
        <span className="score">
          {m.status === 'scheduled' ? 'vs' : `${m.home_sets} - ${m.away_sets}`}
          {m.status === 'live' && m.live_detail && <span className="livedetail">{m.live_detail}</span>}
        </span>
        <TeamBadge name={m.away_team} logo={m.away_logo} right />
      </span>
    </Link>
  );
}

export default function Home() {
  const { sport } = useSport();
  const [live, setLive] = useState([]);
  const [fixtures, setFixtures] = useState([]);
  const [standings, setStandings] = useState([]);
  const [season, setSeason] = useState(null);

  const load = () => {
    api('/live-matches').then(d => setLive(d.matches));
    api(`/fixtures?sport=${sport}`).then(d => setFixtures(d.matches));
    api(`/standings?sport=${sport}`).then(d => setStandings(d.standings || []));
    api(`/season?sport=${sport}`).then(d => setSeason(d.season));
  };

  useEffect(() => {
    load();
    return subscribeLive(null, load);
  }, [sport]);

  const upcoming = fixtures.filter(m => m.status === 'scheduled').slice(0, 5);
  const recent = fixtures.filter(m => m.status === 'finished').slice(-5).reverse();

  return (
    <>
      {live.length > 0 && (
        <div className="ticker">
          <div className="ticker-inner">
            {[...live, ...live].map((m, i) => (
              <span key={i} className="ticker-item">
                🔴 <b>{m.sport_label}</b> · {m.home_team} <b className="ticker-score">{m.home_sets}-{m.away_sets}</b> {m.away_team}
                {m.live_detail ? ` (${m.live_detail})` : ''}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="hero">
        <img className="herologo" src={`/logos/ncl-${sport}.svg`} alt="NCL" />
        <div className="hero-divider" />
        <div>
          <h1 style={{ margin: 0 }}>{season ? season.name : 'NCL Kurumsal Ligleri'}</h1>
          <p className="muted">Şirketler arası turnuva · canlı skorlar · istatistikler</p>
        </div>
      </div>
      {live.length > 0 && (
        <div className="card live-card">
          <h2 style={{ marginTop: 0 }}>🔴 Şu An Sahada</h2>
          {live.map(m => (
            <div key={m.id}>
              <span className="muted" style={{ fontSize: 12 }}>{m.sport_label}</span>
              <MatchRow m={m} />
            </div>
          ))}
        </div>
      )}
      <div className="grid cols2">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Yaklaşan Maçlar</h2>
          {upcoming.length === 0 && <p className="muted">Planlanmış maç yok.</p>}
          {upcoming.map(m => <MatchRow key={m.id} m={m} />)}
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Son Sonuçlar</h2>
          {recent.length === 0 && <p className="muted">Henüz oynanmış maç yok.</p>}
          {recent.map(m => <MatchRow key={m.id} m={m} />)}
        </div>
      </div>
      {standings.length > 0 && <div className="card">
        <h2 style={{ marginTop: 0 }}>Puan Durumu</h2>
        <table>
          <thead><tr><th>#</th><th>Takım</th><th className="num">O</th><th className="num">G</th><th className="num">M</th><th className="num">Puan</th></tr></thead>
          <tbody>
            {standings.slice(0, 6).map(r => (
              <tr key={r.team_id}>
                <td>{r.rank}</td>
                <td><Link to={`/takim/${r.team_id}`}><TeamBadge name={r.name} logo={r.logo_path} /></Link></td>
                <td className="num">{r.played}</td><td className="num">{r.won}</td>
                <td className="num">{r.lost}</td><td className="num"><b>{r.points}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>}
    </>
  );
}
