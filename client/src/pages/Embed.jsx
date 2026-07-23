import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, subscribeLive, setOrgSlug } from '../api.js';

// Musteri sitesine iframe ile gomulen ekran. Parametreler:
//   ?org=slug&sport=volleyball&view=standings|fixtures|leaders|live&theme=dark|light&season_id=..
export default function Embed() {
  const [sp] = useSearchParams();
  const org = sp.get('org');
  const sport = sp.get('sport') || 'volleyball';
  const view = sp.get('view') || 'standings';
  const theme = sp.get('theme') === 'light' ? 'light' : 'dark';
  const seasonQ = sp.get('season_id') ? `&season_id=${sp.get('season_id')}` : '';

  const [data, setData] = useState(null);
  const [season, setSeason] = useState(null);

  useEffect(() => {
    if (org) setOrgSlug(org);
    document.body.classList.add('embed-body', theme === 'light' ? 'embed-light' : 'embed-dark');
    const load = () => {
      api(`/season?sport=${sport}${seasonQ}`).then(d => setSeason(d.season));
      if (view === 'standings') api(`/standings?sport=${sport}${seasonQ}`).then(setData);
      else if (view === 'fixtures') api(`/fixtures?sport=${sport}${seasonQ}`).then(setData);
      else if (view === 'leaders') api(`/leaders?sport=${sport}${seasonQ}`).then(setData);
      else if (view === 'live') api('/live-matches').then(setData);
    };
    load();
    const un = subscribeLive(null, load);
    return () => { un(); document.body.classList.remove('embed-body', 'embed-light', 'embed-dark'); };
  }, [org, sport, view, theme, seasonQ]);

  if (!data) return <div className="embed-wrap"><p className="muted" style={{ textAlign: 'center' }}>Yükleniyor…</p></div>;

  return (
    <div className="embed-wrap">
      {season && <div className="embed-title">{season.name}</div>}
      {view === 'standings' && <EmbedStandings data={data} sport={sport} />}
      {view === 'fixtures' && <EmbedFixtures data={data} />}
      {view === 'leaders' && <EmbedLeaders data={data} />}
      {view === 'live' && <EmbedLive data={data} />}
      <a className="embed-brand" href="https://ncl-turnuva.onrender.com" target="_blank" rel="noreferrer">Heach8 Sports</a>
    </div>
  );
}

const TeamCell = ({ name, logo }) => (
  <span className="et"> {logo && <img src={logo} alt="" />} {name}</span>
);

function EmbedStandings({ data, sport }) {
  const rows = data.standings || [];
  const vb = ['volleyball', 'beach_volleyball'].includes(sport);
  const fb = sport === 'football';
  if (!rows.length) return <p className="muted">Henüz puan durumu yok.</p>;
  return (
    <table className="etbl">
      <thead><tr><th>#</th><th>Takım</th><th>O</th><th>G</th>{fb && <th>B</th>}<th>M</th>{vb ? <th>Set O.</th> : <th>{fb ? 'Av' : 'F'}</th>}<th>P</th></tr></thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.team_id}>
            <td>{r.rank}</td><td><TeamCell name={r.name} logo={r.logo_path} /></td>
            <td>{r.played}</td><td>{r.won}</td>{fb && <td>{r.drawn}</td>}<td>{r.lost}</td>
            <td>{vb ? r.set_ratio : (r.diff > 0 ? '+' + r.diff : r.diff)}</td>
            <td><b>{r.points}</b></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EmbedFixtures({ data }) {
  const ms = data.matches || [];
  const labels = [...new Set(ms.map(m => m.stage_label || `${m.round}. Hafta`))];
  return labels.map(lb => (
    <div key={lb} className="egroup">
      <div className="egroup-h">{lb}</div>
      {ms.filter(m => (m.stage_label || `${m.round}. Hafta`) === lb).map(m => (
        <div className="erow" key={m.id}>
          <TeamCell name={m.home_team} logo={m.home_logo} />
          <span className="escore">{m.status === 'scheduled' ? 'vs' : `${m.home_sets}-${m.away_sets}`}{m.status === 'live' && ' 🔴'}</span>
          <TeamCell name={m.away_team} logo={m.away_logo} />
        </div>
      ))}
    </div>
  ));
}

function EmbedLeaders({ data }) {
  return (data.titles || []).slice(0, 4).map(t => (
    <div key={t.key} className="egroup">
      <div className="egroup-h">{t.label}</div>
      {(data.leaders[t.key] || []).slice(0, 5).map((p, i) => (
        <div className="erow" key={p.id}>
          <span>{i + 1}. {p.first_name} {p.last_name} <span className="muted">({p.team_name})</span></span>
          <b>{p.value}{t.suffix || ''}</b>
        </div>
      ))}
    </div>
  ));
}

function EmbedLive({ data }) {
  const ms = data.matches || [];
  if (!ms.length) return <p className="muted">Şu an canlı maç yok.</p>;
  return ms.map(m => (
    <div className="erow live" key={m.id}>
      <TeamCell name={m.home_team} logo={m.home_logo} />
      <span className="escore">{m.home_sets}-{m.away_sets}<span className="edet">{m.live_detail}</span></span>
      <TeamCell name={m.away_team} logo={m.away_logo} />
    </div>
  ));
}
