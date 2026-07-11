import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, subscribeLive } from '../api.js';

// YouTube/OBS yayin overlay'i: seffaf arka plan, TV tarzi skor bandi.
// OBS > Kaynaklar > Browser Source > URL: /overlay/<macId>  (onerilen 900x320)
export default function Overlay() {
  const { id } = useParams();
  const [s, setS] = useState(null);
  const [banner, setBanner] = useState(null); // yeni gol bildirimi
  const lastGoalRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    api(`/live/${id}/state`).then(st => {
      lastGoalRef.current = st.goals?.length ? st.goals[st.goals.length - 1].id : 0;
      setS(st);
    }).catch(() => {});
    const un = subscribeLive(Number(id), (st) => {
      // Yeni gol geldiyse 8 saniyelik GOL bandi goster
      const goals = st.goals || [];
      const newest = goals.length ? goals[goals.length - 1] : null;
      if (newest && lastGoalRef.current !== null && newest.id > lastGoalRef.current && st.match.status === 'live') {
        setBanner(newest);
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setBanner(null), 8000);
      }
      if (newest) lastGoalRef.current = newest.id;
      setS(st);
    });
    return () => {
      un();
      clearTimeout(timerRef.current);
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
  const shortP = (full) => {
    if (!full) return '';
    const parts = full.split(' ');
    return parts.length > 1 ? `${parts.slice(0, -1).join(' ')} ${parts.at(-1)[0]}.` : full;
  };
  const goalLine = (g) => {
    const min = g.minute ? `${g.period > 1 ? g.period + 'Y ' : ''}${g.minute}'` : `${g.period}. devre`;
    if (g.own_goal) return `⚽ ${min} (K.K.)`;
    return `⚽ ${min} ${shortP(g.scorer)}${g.detail === 'penalty' ? ' (P)' : ''}`;
  };
  const homeGoals = (s.goals || []).filter(g => g.team_id === m.home_team_id);
  const awayGoals = (s.goals || []).filter(g => g.team_id === m.away_team_id);

  return (
    <div className="overlay-wrap">
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

      {/* Turnuva amblemi */}
      <div className="sb-emblem">
        <img src={`/logos/ncl-${s.sport.key}.svg`} alt="NCL" />
      </div>

      {/* Futbol: skor altinda goller ve dakikalari */}
      {(homeGoals.length > 0 || awayGoals.length > 0) && (
        <div className="sb-goals">
          <div className="sb-goals-col home">
            {homeGoals.map(g => <div key={g.id} className="sb-goal">{goalLine(g)}</div>)}
          </div>
          <div className="sb-goals-col away">
            {awayGoals.map(g => <div key={g.id} className="sb-goal">{goalLine(g)}</div>)}
          </div>
        </div>
      )}

      {/* Yeni gol bandi (8 sn) */}
      {banner && (
        <div className="sb-banner">
          ⚽ GOL! {banner.minute ? `${banner.minute}' ` : ''}{banner.own_goal ? 'Kendi kalesine' : banner.scorer}
          {banner.assist && <span className="sb-banner-assist"> · Asist: {banner.assist}</span>}
        </div>
      )}
    </div>
  );
}
