import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, subscribeLive } from '../api.js';
import { useAuth } from '../App.jsx';

// Sahadaki varsayilan dizilim: yari saha icinde % konumlar (turnuvanin saha ici sayisina gore)
function defaultPositions(count, sportKey) {
  // Kucuk kadrolar (plaj 2/3/4 vb.) icin genel dizilimler
  const SMALL = {
    2: [[62, 32], [40, 68]],
    3: [[66, 25], [40, 50], [66, 75]],
    4: [[66, 28], [66, 72], [38, 28], [38, 72]],
    5: [[68, 25], [68, 75], [44, 50], [30, 28], [30, 72]]
  };
  if (count <= 5 && SMALL[count] && (sportKey === 'volleyball' || sportKey === 'beach_volleyball')) {
    return SMALL[count];
  }
  if ((sportKey === 'volleyball' || sportKey === 'beach_volleyball') && count >= 6) {
    return [[72, 22], [72, 50], [72, 78], [34, 22], [34, 50], [34, 78]].concat(extraGrid(count - 6));
  }
  if (sportKey === 'football') {
    const spots = [[10, 50], [32, 25], [32, 75], [52, 50], [66, 25], [66, 75], [82, 50], [45, 25], [45, 75]];
    return spots.slice(0, count).concat(extraGrid(Math.max(0, count - spots.length)));
  }
  if (sportKey === 'basketball') {
    const spots = [[30, 50], [52, 22], [52, 78], [74, 34], [74, 66], [40, 30], [40, 70]];
    return spots.slice(0, count).concat(extraGrid(Math.max(0, count - spots.length)));
  }
  return extraGrid(count);
}
function extraGrid(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push([15 + (i % 3) * 25, 20 + Math.floor(i / 3) * 28]);
  return out;
}

export default function LiveConsole() {
  const { id } = useParams();
  const { user } = useAuth();
  const [s, setS] = useState(null);
  const [error, setError] = useState('');
  const [mvpId, setMvpId] = useState('');
  const [positions, setPositions] = useState({});   // { playerId: {x, y} } tum saha %
  const [lineup, setLineup] = useState(null);        // { home: [ids], away: [ids] }
  const [benchDrag, setBenchDrag] = useState(null);  // { id, side, cx, cy }
  const [portrait, setPortrait] = useState(false); // dar ekranda saha dikey cizilir
  const courtRef = useRef(null);
  const dragRef = useRef(null);
  const dragOriginRef = useRef(null); // takas icin baslangic konumu

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 700px)');
    const update = () => setPortrait(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Saklanan koordinat sistemi sabittir: x = file eksenine dik (ev 0 -> dep 100), y = saha genisligi.
  // Portre modda ekranda 90 derece cevrilir.
  const toScreen = (pos) => (portrait ? { left: pos.y, top: pos.x } : { left: pos.x, top: pos.y });
  const posToPx = (pos, r) => {
    const sc = toScreen(pos);
    return { x: r.left + (sc.left / 100) * r.width, y: r.top + (sc.top / 100) * r.height };
  };
  const pointerToPos = (e, r) => {
    const relX = ((e.clientX - r.left) / r.width) * 100;
    const relY = ((e.clientY - r.top) / r.height) * 100;
    const x = portrait ? relY : relX;
    const y = portrait ? relX : relY;
    return { x: Math.min(96, Math.max(4, x)), y: Math.min(94, Math.max(6, y)) };
  };

  useEffect(() => {
    api(`/live/${id}/state`).then(setS).catch(e => setError(e.message));
    const saved = localStorage.getItem(`court-${id}`);
    if (saved) {
      try {
        const d = JSON.parse(saved);
        if (d.positions) setPositions(d.positions);
        if (d.lineup) setLineup(d.lineup);
      } catch {}
    }
    return subscribeLive(Number(id), setS);
  }, [id]);

  const persist = (pos, lu) => {
    localStorage.setItem(`court-${id}`, JSON.stringify({ positions: pos, lineup: lu }));
  };

  // Kadro geldiginde: ilk N oyuncu sahada, kalani yedek; konumsuzlari yerlestir
  useEffect(() => {
    if (!s) return;
    const size = s.court_size || s.sport.defaultCourtSize || 6;
    setLineup(prevLu => {
      const lu = { home: [...(prevLu?.home || [])], away: [...(prevLu?.away || [])] };
      const fix = (roster, key) => {
        const ids = roster.map(p => p.id);
        lu[key] = lu[key].filter(pid => ids.includes(pid));
        for (const pid of ids) {
          if (lu[key].length >= Math.min(size, ids.length)) break;
          if (!lu[key].includes(pid)) lu[key].push(pid);
        }
      };
      fix(s.home_roster, 'home');
      fix(s.away_roster, 'away');
      setPositions(prevPos => {
        const next = { ...prevPos };
        const place = (idsOnCourt, isHome) => {
          const defs = defaultPositions(idsOnCourt.length, s.sport.key);
          idsOnCourt.forEach((pid, i) => {
            if (!next[pid]) {
              const [hx, hy] = defs[i] || [50, 50];
              next[pid] = { x: isHome ? hx * 0.5 : 100 - hx * 0.5, y: hy };
            }
          });
        };
        place(lu.home, true);
        place(lu.away, false);
        persist(next, lu);
        return next;
      });
      return lu;
    });
  }, [s?.home_roster?.length, s?.away_roster?.length, s?.sport?.key]);

  // --- Saha ici surukleme ---
  const onDragStart = (e, playerId) => {
    e.preventDefault();
    dragRef.current = playerId;
    dragOriginRef.current = positions[playerId] ? { ...positions[playerId] } : null;
    e.target.setPointerCapture?.(e.pointerId);
  };
  const onDragMove = (e) => {
    if (benchDrag) {
      setBenchDrag(b => (b ? { ...b, cx: e.clientX, cy: e.clientY } : b));
      return;
    }
    if (!dragRef.current || !courtRef.current) return;
    const r = courtRef.current.getBoundingClientRect();
    setPositions(prev => ({ ...prev, [dragRef.current]: pointerToPos(e, r) }));
  };
  const onDragEnd = () => {
    if (benchDrag) { finishBenchDrag(); return; }
    const draggedId = dragRef.current;
    if (!draggedId) return;
    dragRef.current = null;
    const origin = dragOriginRef.current;
    dragOriginRef.current = null;
    setPositions(prev => {
      let next = prev;
      // Ayni takimdan baska bir oyuncunun uzerine birakildiysa yer degistir
      if (courtRef.current && lineup && origin) {
        const side = lineup.home.includes(draggedId) ? 'home' : 'away';
        const r = courtRef.current.getBoundingClientRect();
        const dpx = posToPx(prev[draggedId], r);
        let target = null, best = 1e9;
        for (const pid of lineup[side]) {
          if (pid === draggedId) continue;
          const pos = prev[pid];
          if (!pos) continue;
          const pt = posToPx(pos, r);
          const d = Math.hypot(pt.x - dpx.x, pt.y - dpx.y);
          if (d < best) { best = d; target = pid; }
        }
        if (target && best < 65) {
          next = { ...prev, [draggedId]: { ...prev[target] }, [target]: origin };
        }
      }
      persist(next, lineup);
      return next;
    });
  };

  // --- Yedekten oyuncu degisikligi: yedegi sahadaki oyuncunun uzerine birak ---
  const onBenchDragStart = (e, playerId, side) => {
    e.preventDefault();
    setBenchDrag({ id: playerId, side, cx: e.clientX, cy: e.clientY });
  };
  const finishBenchDrag = () => {
    const b = benchDrag;
    setBenchDrag(null);
    if (!b || !courtRef.current || !lineup) return;
    const r = courtRef.current.getBoundingClientRect();
    let target = null, best = 1e9;
    for (const pid of lineup[b.side]) {
      const pos = positions[pid];
      if (!pos) continue;
      const pt = posToPx(pos, r);
      const d = Math.hypot(pt.x - b.cx, pt.y - b.cy);
      if (d < best) { best = d; target = pid; }
    }
    if (!target || best > 70) return;
    const nextLineup = { ...lineup, [b.side]: lineup[b.side].map(pid => (pid === target ? b.id : pid)) };
    const nextPos = { ...positions, [b.id]: positions[target] };
    setLineup(nextLineup);
    setPositions(nextPos);
    persist(nextPos, nextLineup);
  };

  if (user === undefined) return null;
  if (!user || !['scorekeeper', 'admin', 'super_admin'].includes(user.role)) {
    return <p className="muted">Bu sayfa masa görevlilerine özeldir.</p>;
  }
  if (!s) return error ? <div className="error">{error}</div> : null;

  const call = async (path, body) => {
    setError('');
    try { setS(await api(`/live/${id}${path}`, { method: 'POST', body })); }
    catch (e) { setError(e.message); }
  };

  const cur = s.current_set;
  const m = s.match;
  const sport = s.sport;
  const isSetBased = sport.winnerBy === 'periods';
  const playerEvents = sport.eventTypes.filter(et => et.needsPlayer);
  const teamEvents = sport.eventTypes.filter(et => !et.needsPlayer);
  const canScore = m.status === 'live' && !!cur;

  let canFinish = false;
  if (m.status === 'live') {
    if (isSetBased) {
      const needed = Math.floor(m.best_of / 2) + 1;
      canFinish = m.home_sets >= needed || m.away_sets >= needed;
    } else {
      canFinish = !cur && s.sets.filter(x => x.finished).length >= sport.regularPeriods;
    }
  }
  const needExtra = !isSetBased && m.status === 'live' && !cur && !sport.allowDraw && s.totals.home === s.totals.away;

  const statOf = (pid) => s.playerStats.find(x => x.id === pid);
  const byId = (pid) => [...s.home_roster, ...s.away_roster].find(p => p.id === pid);
  const onCourt = (side) => (lineup?.[side] || []).map(byId).filter(Boolean);
  const onBench = (side) => {
    const roster = side === 'home' ? s.home_roster : s.away_roster;
    return roster.filter(p => !(lineup?.[side] || []).includes(p.id));
  };

  // On planda: aktif set/periyot skoru
  const bigHome = cur ? cur.home_points : (isSetBased ? m.home_sets : s.totals.home);
  const bigAway = cur ? cur.away_points : (isSetBased ? m.away_sets : s.totals.away);
  const bigLabel = m.status === 'finished' ? 'MAÇ SONU'
    : cur ? `${cur.set_no}. ${sport.periodName.toUpperCase()}`
    : m.status === 'live' ? `${sport.periodName.toUpperCase()} ARASI` : 'BAŞLAMADI';
  const subScore = isSetBased
    ? `Setler: ${m.home_sets} - ${m.away_sets}`
    : `Toplam: ${s.totals.home} - ${s.totals.away}`;
  const periodHistory = s.sets.filter(x => x.finished).map(x => `${x.home_points}-${x.away_points}`).join(' · ');

  const chip = (p, side) => {
    const pos = positions[p.id] || { x: side === 'home' ? 25 : 75, y: 50 };
    const sc = toScreen(pos);
    const st = statOf(p.id);
    const total = st ? (st.total_points ?? st.goals ?? 0) : 0;
    return (
      <div key={p.id} className={`chip ${side}`} style={{ left: sc.left + '%', top: sc.top + '%' }}>
        <div className="chip-head" onPointerDown={(e) => onDragStart(e, p.id)} title="Sürükleyerek taşıyın">
          <span className="chip-no">{p.jersey_no}</span>
          <span className="chip-name">{p.first_name} {p.last_name.charAt(0)}.</span>
          {total > 0 && <span className="chip-total">{total}</span>}
        </div>
        <div className="chip-btns">
          {playerEvents.map(et => (
            <button key={et.key}
              className={et.points > 0 ? 'ev-score' : et.key.includes('err') || et.key.includes('red') || et.key === 'foul' ? 'ev-bad' : 'ev-neutral'}
              disabled={!canScore}
              title={et.label + (et.points ? ` (+${et.points} sayı)` : '')}
              onClick={() => call('/event', { team: side, type: et.key, player_id: p.id })}>
              {et.short || et.label}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const bench = (side) => {
    const list = onBench(side);
    const team = side === 'home' ? s.home_team : s.away_team;
    return (
      <div className={`bench ${side}`}>
        <div className="bench-title">
          {team.logo_path && <img src={team.logo_path} alt="" />}
          <span>Yedekler</span>
        </div>
        {list.length === 0 && <p className="muted" style={{ fontSize: 11, textAlign: 'center' }}>Yedek yok</p>}
        {list.map(p => (
          <div key={p.id} className={`bench-chip ${side} ${benchDrag?.id === p.id ? 'dragging' : ''}`}
            onPointerDown={(e) => onBenchDragStart(e, p.id, side)}
            title="Sahadaki bir oyuncunun üzerine sürükleyip bırakın (oyuncu değişikliği)">
            <span className="chip-no">{p.jersey_no}</span>
            <span className="chip-name">{p.first_name} {p.last_name.charAt(0)}.</span>
          </div>
        ))}
        {list.length > 0 && <p className="bench-hint">Değişiklik: yedeği sahadaki oyuncunun üzerine bırakın</p>}
      </div>
    );
  };

  return (
    <>
      <p><Link className="muted" to="/konsol">← Maç listesi</Link></p>

      <div className="card scorehead">
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>{sport.label}{isSetBased ? ` · ${m.best_of} set üzerinden` : ''}</p>
        <div className="scorehead-main">
          <div className="scorehead-team">
            {s.home_team.logo_path && <img src={s.home_team.logo_path} alt="" />}
            <span>{s.home_team.name}</span>
          </div>
          <div className="scorehead-mid">
            <div className="scorehead-label">{bigLabel}</div>
            <div className="scorehead-pts">
              <span key={'h' + bigHome} className="pts-num">{bigHome}</span>
              <span className="pts-sep">:</span>
              <span key={'a' + bigAway} className="pts-num">{bigAway}</span>
            </div>
            <div className="scorehead-sub">
              <b>{subScore}</b>{periodHistory ? ` · (${periodHistory})` : ''}
            </div>
          </div>
          <div className="scorehead-team right">
            <span>{s.away_team.name}</span>
            {s.away_team.logo_path && <img src={s.away_team.logo_path} alt="" />}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 8 }}>
          {m.status === 'scheduled' && <button className="btn primary big" onClick={() => call('/start')}>Maçı Başlat</button>}
          {m.status === 'live' && (
            <>
              <button className="btn" onClick={() => call('/undo')}>↩ Geri Al</button>
              {cur && (
                <button className="btn primary" disabled={isSetBased && cur.home_points === cur.away_points}
                  onClick={() => confirm(`${cur.set_no}. ${sport.periodName.toLowerCase()} bitirilsin mi?`) && call('/finish-set')}>
                  {sport.periodName} Bitir
                </button>
              )}
              {needExtra && <button className="btn" onClick={() => call('/add-period')}>Uzatma Periyodu Ekle</button>}
              {!cur && !needExtra && !canFinish && <button className="btn" onClick={() => call('/add-period')}>Yeni {sport.periodName} Ekle</button>}
              {canFinish && !needExtra && <button className="btn green" onClick={() => confirm('Maç bitirilsin mi? (Maçın oyuncusunu sonradan seçebilirsiniz)') && call('/finish', {})}>Maçı Bitir</button>}
              <Link className="btn" to={`/scoreboard/${m.id}`} target="_blank">Skorboard ↗</Link>
            </>
          )}
        </div>
      </div>
      {error && <div className="error">{error}</div>}

      {m.status !== 'finished' && (
        <div className="console-wrap" onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerLeave={onDragEnd}>
          {bench('home')}
          <div className={`court ${sport.key} ${portrait ? 'portrait' : ''}`} ref={courtRef}>
            <div className="court-half home">
              <span className="court-team">
                {s.home_team.name} {cur && <b className="court-pts">{cur.home_points}</b>}
              </span>
            </div>
            <div className="court-net" />
            <div className="court-half away">
              <span className="court-team">
                {cur && <b className="court-pts">{cur.away_points}</b>} {s.away_team.name}
              </span>
            </div>
            {onCourt('home').map(p => chip(p, 'home'))}
            {onCourt('away').map(p => chip(p, 'away'))}
          </div>
          {bench('away')}
        </div>
      )}

      {benchDrag && (() => {
        const p = byId(benchDrag.id);
        return p ? (
          <div className="bench-ghost" style={{ left: benchDrag.cx, top: benchDrag.cy }}>
            <span className="chip-no">{p.jersey_no}</span> {p.first_name} {p.last_name.charAt(0)}.
          </div>
        ) : null;
      })()}

      {m.status !== 'finished' && teamEvents.length > 0 && (
        <div className="grid cols2" style={{ marginTop: 14 }}>
          <div className="card" style={{ textAlign: 'center' }}>
            {teamEvents.map(et => (
              <button key={et.key} className="btn big green" disabled={!canScore} style={{ margin: 4 }}
                onClick={() => call('/event', { team: 'home', type: et.key })}>
                {s.home_team.name}: {et.label} +{et.points}
              </button>
            ))}
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            {teamEvents.map(et => (
              <button key={et.key} className="btn big green" disabled={!canScore} style={{ margin: 4 }}
                onClick={() => call('/event', { team: 'away', type: et.key })}>
                {s.away_team.name}: {et.label} +{et.points}
              </button>
            ))}
          </div>
        </div>
      )}

      {m.status === 'finished' && (
        <div className="card" style={{ border: '1px solid var(--accent)', marginTop: 14 }}>
          <h2 style={{ marginTop: 0 }}>⭐ Maçın Oyuncusu (MVP)</h2>
          {m.mvp_player_id && (() => {
            const mp = byId(m.mvp_player_id);
            return mp ? <p style={{ color: 'var(--accent)', marginBottom: 10 }}>Seçili: #{mp.jersey_no} {mp.first_name} {mp.last_name}</p> : null;
          })()}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select style={{ maxWidth: 340 }} value={mvpId} onChange={e => setMvpId(e.target.value)}>
              <option value="">MVP seçilmedi</option>
              {[...s.home_roster.map(p => ({ ...p, t: s.home_team.name })), ...s.away_roster.map(p => ({ ...p, t: s.away_team.name }))]
                .map(p => <option key={p.id} value={p.id}>#{p.jersey_no} {p.first_name} {p.last_name} ({p.t})</option>)}
            </select>
            <button className="btn primary" onClick={() => call('/mvp', { mvp_player_id: mvpId ? Number(mvpId) : null })}>Kaydet</button>
          </div>
          <p className="muted" style={{ marginTop: 10, fontSize: 12 }}>
            MVP istediğiniz zaman değiştirilebilir. (Not: ileride oylama/Instagram anket sonucu da bu alana bağlanabilir.)
          </p>
        </div>
      )}

      {s.playerStats.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <h2 style={{ marginTop: 0 }}>Maç İstatistikleri</h2>
          <table>
            <thead><tr><th>Oyuncu</th>{sport.statCols.map(c => <th key={c.key} className="num">{c.label}</th>)}{sport.ratioCols.map(c => <th key={c.key} className="num">{c.label}</th>)}</tr></thead>
            <tbody>
              {s.playerStats.map(p => (
                <tr key={p.id}>
                  <td>#{p.jersey_no} {p.first_name} {p.last_name}</td>
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
