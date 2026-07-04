import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, subscribeLive } from '../api.js';

export default function Scoreboard() {
  const { id } = useParams();
  const [s, setS] = useState(null);

  useEffect(() => {
    api(`/live/${id}/state`).then(setS);
    return subscribeLive(Number(id), setS);
  }, [id]);

  if (!s) return <div className="scoreboard"><div className="tname">Yükleniyor…</div></div>;
  const cur = s.current_set;
  const isVb = s.sport.winnerBy === 'periods';
  const finishedSets = s.sets.filter(x => x.finished);
  const homeBig = isVb ? (cur ? cur.home_points : s.match.home_sets) : s.totals.home;
  const awayBig = isVb ? (cur ? cur.away_points : s.match.away_sets) : s.totals.away;
  const homeSub = isVb ? `Set: ${s.match.home_sets}` : (cur ? `${cur.set_no}. ${s.sport.periodName}: ${cur.home_points}` : '');
  const awaySub = isVb ? `Set: ${s.match.away_sets}` : (cur ? `${cur.set_no}. ${s.sport.periodName}: ${cur.away_points}` : '');

  return (
    <div className="scoreboard">
      <img src={`/logos/ncl-${s.sport.key}.svg`} alt="NCL" style={{ height: 'clamp(40px, 6vw, 70px)', marginBottom: 30, opacity: .9 }} />
      <div className="big">
        <div>
          {s.home_team.logo_path && <img className="sb-logo" src={s.home_team.logo_path} alt="" />}
          <div className="tname">{s.home_team.name}</div>
          <div className="tpts" key={"h" + homeBig}>{homeBig}</div>
          <div className="tsets">{homeSub}</div>
        </div>
        <div className="tname" style={{ color: 'var(--muted)' }}>
          {s.match.status === 'finished' ? 'MAÇ SONU' : (cur ? `${cur.set_no}. ${s.sport.periodName.toUpperCase()}` : '')}
        </div>
        <div>
          {s.away_team.logo_path && <img className="sb-logo" src={s.away_team.logo_path} alt="" />}
          <div className="tname">{s.away_team.name}</div>
          <div className="tpts" key={"a" + awayBig}>{awayBig}</div>
          <div className="tsets">{awaySub}</div>
        </div>
      </div>
      <div className="sethistory">
        {finishedSets.map(x => <span key={x.set_no}>{x.set_no}. {s.sport.periodName.toLowerCase()}: {x.home_points}-{x.away_points}</span>)}
      </div>
    </div>
  );
}
