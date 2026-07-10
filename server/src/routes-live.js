import { Router } from 'express';
import { qGet, qAll, qRun, qInsert } from './db.js';
import { requireRole, ah } from './auth.js';
import { broadcast } from './live.js';
import { sportOf, sportConfigForClient, isSetBased } from './sports.js';
import { advanceAfterFinish } from './tournament.js';

export const liveRouter = Router();
const scorer = requireRole('scorekeeper', 'admin');

async function matchSeason(match) {
  return (await qGet('SELECT sport, court_size, yellow_limit, red_ban FROM seasons WHERE id = ?', [match.season_id])) || {};
}

// Bu mac icin cezali oyuncular: onceki macta kirmizi goren / sari kart sinirini asan
async function computeSuspensions(match, season) {
  const out = {};
  if (season.sport !== 'football') return out;
  const yl = season.yellow_limit || 0;
  const rb = season.red_ban || 0;
  if (!yl && !rb) return out;
  for (const teamId of [match.home_team_id, match.away_team_id]) {
    const prev = await qAll(`
      SELECT id FROM matches
      WHERE season_id = ? AND status = 'finished' AND (home_team_id = ? OR away_team_id = ?) AND id != ?
      ORDER BY round, id
    `, [match.season_id, teamId, teamId, match.id]);
    if (!prev.length) continue;
    const lastId = prev[prev.length - 1].id;
    const ids = prev.map(m => m.id);
    if (rb) {
      const reds = await qAll(
        `SELECT DISTINCT player_id FROM stat_events WHERE match_id = ? AND team_id = ? AND type = 'red_card' AND player_id IS NOT NULL`,
        [lastId, teamId]);
      for (const r of reds) out[r.player_id] = 'Kırmızı kart cezalısı';
    }
    if (yl) {
      const marks = ids.map(() => '?').join(',');
      const rows = await qAll(`
        SELECT player_id,
          SUM(CASE WHEN match_id = ? THEN 1 ELSE 0 END) AS in_last,
          COUNT(*) AS total
        FROM stat_events
        WHERE match_id IN (${marks}) AND team_id = ? AND type = 'yellow_card' AND player_id IS NOT NULL
        GROUP BY player_id
      `, [lastId, ...ids, teamId]);
      for (const r of rows) {
        const before = r.total - r.in_last;
        // Sinir son macta asildiysa bu macta cezali
        if (Math.floor(r.total / yl) > Math.floor(before / yl) && !out[r.player_id]) {
          out[r.player_id] = `${yl} sarı kart cezalısı`;
        }
      }
    }
  }
  return out;
}

async function matchSport(match) {
  return (await matchSeason(match)).sport || 'volleyball';
}

function statColsSelect(sportKey) {
  const s = sportOf(sportKey);
  return s.statCols.map(c => {
    const agg = c.sum ? 'SUM(CASE WHEN ' + c.cond + ' THEN e.points ELSE 0 END)'
                      : 'SUM(CASE WHEN ' + c.cond + ' THEN 1 ELSE 0 END)';
    return 'COALESCE(' + agg + ', 0) AS ' + c.key;
  }).join(', ');
}

export async function getMatchState(matchId) {
  const match = await qGet('SELECT * FROM matches WHERE id = ?', [matchId]);
  if (!match) return null;
  const season = await matchSeason(match);
  const sportKey = season.sport || 'volleyball';
  const roster = (teamId) => qAll(
    "SELECT id, first_name, last_name, jersey_no FROM players WHERE team_id = ? AND status = 'approved' ORDER BY jersey_no",
    [teamId]);
  // Bagimsiz sorgular paralel: uzak veritabaninda gecikmeyi ciddi azaltir
  const [sets, playerStats, homeTeam, awayTeam, homeRoster, awayRoster] = await Promise.all([
    qAll('SELECT * FROM match_sets WHERE match_id = ? ORDER BY set_no', [matchId]),
    qAll(`
      SELECT p.id, p.first_name, p.last_name, p.jersey_no, p.team_id, ${statColsSelect(sportKey)}
      FROM stat_events e JOIN players p ON p.id = e.player_id
      WHERE e.match_id = ? GROUP BY p.id ORDER BY 6 DESC
    `, [matchId]),
    qGet('SELECT id, name, logo_path FROM teams WHERE id = ?', [match.home_team_id]),
    qGet('SELECT id, name, logo_path FROM teams WHERE id = ?', [match.away_team_id]),
    roster(match.home_team_id),
    roster(match.away_team_id)
  ]);
  const current = sets.find(s => !s.finished) || null;
  let totals = { home: 0, away: 0 };
  for (const s of sets) { totals.home += s.home_points; totals.away += s.away_points; }
  const sportCfg = sportConfigForClient(sportKey);
  const suspended = match.status === 'finished' ? {} : await computeSuspensions(match, season);
  return {
    match, sport: sportCfg,
    court_size: season.court_size || sportCfg.defaultCourtSize || 6,
    suspended,
    rules: { yellow_limit: season.yellow_limit || 0, red_ban: season.red_ban || 0 },
    home_team: homeTeam, away_team: awayTeam,
    sets, current_set: current, totals, playerStats,
    home_roster: homeRoster, away_roster: awayRoster
  };
}

liveRouter.get('/:matchId/state', ah(async (req, res) => {
  const state = await getMatchState(Number(req.params.matchId));
  if (!state) return res.status(404).json({ error: 'Mac bulunamadi' });
  res.json(state);
}));

liveRouter.post('/:matchId/start', scorer, ah(async (req, res) => {
  const id = Number(req.params.matchId);
  const match = await qGet('SELECT * FROM matches WHERE id = ?', [id]);
  if (!match) return res.status(404).json({ error: 'Mac bulunamadi' });
  if (match.status === 'finished') return res.status(400).json({ error: 'Mac bitti' });
  if (match.status === 'scheduled') {
    await qRun("UPDATE matches SET status = 'live' WHERE id = ?", [id]);
    await qRun('INSERT INTO match_sets (match_id, set_no) VALUES (?, 1) ON CONFLICT (match_id, set_no) DO NOTHING', [id]);
  }
  const state = await getMatchState(id);
  broadcast(id, state);
  res.json(state);
}));

liveRouter.post('/:matchId/event', scorer, ah(async (req, res) => {
  const id = Number(req.params.matchId);
  const match = await qGet('SELECT * FROM matches WHERE id = ?', [id]);
  if (!match || match.status !== 'live') return res.status(400).json({ error: 'Mac canli degil' });
  const sport = sportOf(await matchSport(match));
  const { team, type, player_id } = req.body;
  if (!['home', 'away'].includes(team)) return res.status(400).json({ error: 'Gecersiz takim' });
  const et = sport.eventTypes[type];
  if (!et) return res.status(400).json({ error: 'Gecersiz islem turu' });
  if (et.needsPlayer && !player_id) return res.status(400).json({ error: 'Oyuncu secilmeli' });
  // Cezali oyuncu kontrolu (futbol kart kurallari)
  if (et.needsPlayer) {
    const season = await matchSeason(match);
    const susp = await computeSuspensions(match, season);
    if (susp[player_id]) return res.status(400).json({ error: 'Bu oyuncu bu macta cezali: ' + susp[player_id] });
  }
  // Detay dogrulama (orn. golun sekli)
  let detail = null;
  if (req.body.detail && et.details) {
    const ok = et.details.find(d => d.key === req.body.detail);
    if (!ok) return res.status(400).json({ error: 'Gecersiz detay' });
    detail = req.body.detail;
  }
  const current = await qGet('SELECT * FROM match_sets WHERE match_id = ? AND finished = 0 ORDER BY set_no LIMIT 1', [id]);
  if (!current) return res.status(400).json({ error: 'Acik periyot yok' });
  const teamId = team === 'home' ? match.home_team_id : match.away_team_id;
  const evId = await qInsert('INSERT INTO stat_events (match_id, set_no, team_id, player_id, type, points, detail) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, current.set_no, teamId, et.needsPlayer ? player_id : null, type, et.points, detail]);
  // Asist: gole bagli ikinci kayit
  if (et.allowAssist && req.body.assist_player_id) {
    const aid = Number(req.body.assist_player_id);
    if (aid !== Number(player_id)) {
      const ap = await qGet('SELECT * FROM players WHERE id = ? AND team_id = ?', [aid, teamId]);
      if (ap) {
        await qRun('INSERT INTO stat_events (match_id, set_no, team_id, player_id, type, points, related_id) VALUES (?, ?, ?, ?, ?, 0, ?)',
          [id, current.set_no, teamId, aid, 'assist', evId]);
      }
    }
  }
  if (et.points > 0) {
    const col = team === 'home' ? 'home_points' : 'away_points';
    await qRun(`UPDATE match_sets SET ${col} = ${col} + ? WHERE id = ?`, [et.points, current.id]);
  }
  const state = await getMatchState(id);
  broadcast(id, state);
  res.json(state);
}));

liveRouter.post('/:matchId/undo', scorer, ah(async (req, res) => {
  const id = Number(req.params.matchId);
  const match = await qGet('SELECT * FROM matches WHERE id = ?', [id]);
  if (!match || match.status !== 'live') return res.status(400).json({ error: 'Mac canli degil' });
  let last = await qGet('SELECT * FROM stat_events WHERE match_id = ? ORDER BY id DESC LIMIT 1', [id]);
  if (!last) return res.status(400).json({ error: 'Geri alinacak islem yok' });
  // Son kayit bir gole bagli asistse, once golu bul (ikisi birlikte geri alinir)
  if (last.related_id) {
    const parent = await qGet('SELECT * FROM stat_events WHERE id = ?', [last.related_id]);
    await qRun('DELETE FROM stat_events WHERE id = ?', [last.id]);
    if (parent) last = parent;
  } else {
    // Gole bagli asist varsa birlikte sil
    await qRun('DELETE FROM stat_events WHERE related_id = ?', [last.id]);
  }
  const sportKey = await matchSport(match);
  const set = await qGet('SELECT * FROM match_sets WHERE match_id = ? AND set_no = ?', [id, last.set_no]);
  if (set.finished) {
    await qRun('UPDATE match_sets SET finished = 0 WHERE id = ?', [set.id]);
    if (isSetBased(sportKey)) {
      const winnerCol = set.home_points > set.away_points ? 'home_sets' : 'away_sets';
      await qRun(`UPDATE matches SET ${winnerCol} = ${winnerCol} - 1 WHERE id = ?`, [id]);
    }
    await qRun('DELETE FROM match_sets WHERE match_id = ? AND set_no > ? AND home_points = 0 AND away_points = 0 AND finished = 0',
      [id, last.set_no]);
  }
  if (last.points > 0) {
    const col = last.team_id === match.home_team_id ? 'home_points' : 'away_points';
    await qRun(`UPDATE match_sets SET ${col} = ${col} - ? WHERE match_id = ? AND set_no = ?`,
      [last.points, id, last.set_no]);
  }
  await qRun('DELETE FROM stat_events WHERE id = ?', [last.id]);
  const state = await getMatchState(id);
  broadcast(id, state);
  res.json(state);
}));

liveRouter.post('/:matchId/finish-set', scorer, ah(async (req, res) => {
  const id = Number(req.params.matchId);
  const match = await qGet('SELECT * FROM matches WHERE id = ?', [id]);
  if (!match || match.status !== 'live') return res.status(400).json({ error: 'Mac canli degil' });
  const sportKey = await matchSport(match);
  const sport = sportOf(sportKey);
  const current = await qGet('SELECT * FROM match_sets WHERE match_id = ? AND finished = 0 ORDER BY set_no LIMIT 1', [id]);
  if (!current) return res.status(400).json({ error: 'Acik periyot yok' });

  if (isSetBased(sportKey)) {
    if (current.home_points === current.away_points) return res.status(400).json({ error: 'Beraberlikte set bitirilemez' });
    await qRun('UPDATE match_sets SET finished = 1 WHERE id = ?', [current.id]);
    const col = current.home_points > current.away_points ? 'home_sets' : 'away_sets';
    await qRun(`UPDATE matches SET ${col} = ${col} + 1 WHERE id = ?`, [id]);
    const updated = await qGet('SELECT * FROM matches WHERE id = ?', [id]);
    const needed = Math.floor(updated.best_of / 2) + 1;
    if (updated.home_sets < needed && updated.away_sets < needed) {
      await qRun('INSERT INTO match_sets (match_id, set_no) VALUES (?, ?)', [id, current.set_no + 1]);
    }
  } else {
    await qRun('UPDATE match_sets SET finished = 1 WHERE id = ?', [current.id]);
    if (current.set_no < sport.regularPeriods) {
      await qRun('INSERT INTO match_sets (match_id, set_no) VALUES (?, ?)', [id, current.set_no + 1]);
    }
  }
  const state = await getMatchState(id);
  broadcast(id, state);
  res.json(state);
}));

liveRouter.post('/:matchId/add-period', scorer, ah(async (req, res) => {
  const id = Number(req.params.matchId);
  const match = await qGet('SELECT * FROM matches WHERE id = ?', [id]);
  if (!match || match.status !== 'live') return res.status(400).json({ error: 'Mac canli degil' });
  const open = (await qGet('SELECT COUNT(*) AS c FROM match_sets WHERE match_id = ? AND finished = 0', [id])).c;
  if (open) return res.status(400).json({ error: 'Once acik periyodu bitirin' });
  const maxNo = (await qGet('SELECT MAX(set_no) AS m FROM match_sets WHERE match_id = ?', [id])).m || 0;
  await qRun('INSERT INTO match_sets (match_id, set_no) VALUES (?, ?)', [id, maxNo + 1]);
  const state = await getMatchState(id);
  broadcast(id, state);
  res.json(state);
}));

// MVP'yi sonradan ata/degistir (bitmis maclarda). Ileride oylama sonucu da buraya yazilabilir.
liveRouter.post('/:matchId/mvp', scorer, ah(async (req, res) => {
  const id = Number(req.params.matchId);
  const match = await qGet('SELECT * FROM matches WHERE id = ?', [id]);
  if (!match) return res.status(404).json({ error: 'Mac bulunamadi' });
  if (match.status !== 'finished') return res.status(400).json({ error: 'MVP sadece bitmis maclarda atanabilir' });
  const pid = req.body.mvp_player_id || null;
  if (pid) {
    const p = await qGet('SELECT * FROM players WHERE id = ?', [pid]);
    if (!p || ![match.home_team_id, match.away_team_id].includes(p.team_id)) {
      return res.status(400).json({ error: 'Oyuncu bu macin kadrolarinda degil' });
    }
  }
  await qRun('UPDATE matches SET mvp_player_id = ? WHERE id = ?', [pid, id]);
  const state = await getMatchState(id);
  broadcast(id, state);
  res.json(state);
}));

liveRouter.post('/:matchId/finish', scorer, ah(async (req, res) => {
  const id = Number(req.params.matchId);
  const match = await qGet('SELECT * FROM matches WHERE id = ?', [id]);
  if (!match || match.status !== 'live') return res.status(400).json({ error: 'Mac canli degil' });
  const sportKey = await matchSport(match);
  const sport = sportOf(sportKey);
  const sets = await qAll('SELECT * FROM match_sets WHERE match_id = ?', [id]);
  let hp = 0, ap = 0;
  for (const s of sets) { hp += s.home_points; ap += s.away_points; }

  if (isSetBased(sportKey)) {
    if (match.home_sets === match.away_sets) return res.status(400).json({ error: 'Set esitliginde mac bitirilemez' });
  } else {
    // Eleme macinda beraberlik olamaz (uzatma/penaltilarla kazanan belirlenmeli)
    if ((!sport.allowDraw || match.stage === 'knockout') && hp === ap) {
      return res.status(400).json({ error: match.stage === 'knockout'
        ? 'Eleme macinda beraberlik olamaz: uzatma periyodu ekleyin veya penalti gollerini isleyin'
        : 'Beraberlikte mac bitirilemez, uzatma periyodu ekleyin' });
    }
    await qRun('UPDATE matches SET home_sets = ?, away_sets = ? WHERE id = ?', [hp, ap, id]);
  }
  await qRun("UPDATE matches SET status = 'finished', mvp_player_id = ? WHERE id = ?",
    [req.body.mvp_player_id || null, id]);
  await qRun('DELETE FROM match_sets WHERE match_id = ? AND finished = 0 AND home_points = 0 AND away_points = 0', [id]);
  // Turnuva formati: tur tamamlandiysa sonraki asamayi olustur
  const advanceMsg = await advanceAfterFinish(id);
  const state = await getMatchState(id);
  state.advance_message = advanceMsg;
  broadcast(id, state);
  res.json(state);
}));
