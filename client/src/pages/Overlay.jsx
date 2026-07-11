import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, subscribeLive } from '../api.js';

// YouTube/OBS yayin overlay'i: seffaf arka plan, kompakt skor bandi.
// OBS > Kaynaklar > Browser Source > URL: /overlay/<macId>  (onerilen 900x140)
export default function Overlay() {
  const { id } = useParams();
  const [s, setS] = useState(null);

  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    api(`/live/${id}/state`).then(setS).catch(() => {});
    const un = subscribeLive(Number(id), setS);
    return () => {
      un();
      document.documentElement.style.background = '';
      document.body.style.background = '';
    };
  }, [id]);

  if (!s) return null;
  const m = s.match;
  const cur = s.current_set;
  const isSetBased = s.sport.winnerBy === 'periods';
  const bigHome = isSetBased ? (cur ? cur.home_points : m.home_sets) : s.totals.home;
  const bigAway = isSetBased ? (cur ? cur.away_points : m.away_sets) : s.totals.away;
  const mid = m.status === 'finished' ? 'MS'
    : cur ? `${cur.set_no}. ${s.sport.periodName.toUpperCase()}`
    : m.status === 'live' ? 'ARA' : '';
  const sub = isSetBased
    ? `SET ${m.home_sets} - ${m.away_sets}`
    : (cur ? `${cur.home_points} - ${cur.away_points}` : '');

  const short = (name) => name.length > 14 ? name.slice(0, 13) + '…' : name;

  return (
    <div className="scorebug">
      <div className="sb-team home">
        {s.home_team.logo_path && <img src={s.home_team.logo_path} alt="" />}
        <span className="sb-name">{short(s.home_team.name)}</span>
      </div>
      <div className="sb-score">
        <span key={'h' + bigHome} className="sb-num">{bigHome}</span>
        <span className="sb-mid">
          <span className="sb-stage">{mid}</span>
          {sub && <span className="sb-sub">{sub}</span>}
          {m.shootout_home != null && <span className="sb-sub">P: {m.shootout_home}-{m.shootout_away}</span>}
        </span>
        <span key={'a' + bigAway} className="sb-num">{bigAway}</span>
      </div>
      <div className="sb-team away">
        <span className="sb-name">{short(s.away_team.name)}</span>
        {s.away_team.logo_path && <img src={s.away_team.logo_path} alt="" />}
      </div>
    </div>
  );
}
