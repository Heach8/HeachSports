import { Router } from 'express';
import { qGet, qAll, getActiveSeason, resolveOrg } from './db.js';
import { ah } from './auth.js';
import { computeStandings } from './standings.js';
import { SPORTS, SPORT_KEYS, sportOf, sportConfigForClient, isSetBased } from './sports.js';
import { knockoutLabel } from './tournament.js';

export const publicRouter = Router();

const reqSport = (req) => (SPORT_KEYS.includes(req.query.sport) ? req.query.sport : 'volleyball');

// Sezon secimi: ?season_id verilirse (arsiv) o sezon, yoksa org'un aktif sezonu
async function pickSeason(req) {
  const org = await resolveOrg(req);
  if (req.query.season_id) {
    const s = await qGet('SELECT * FROM seasons WHERE id = ? AND organization_id = ?', [Number(req.query.season_id), org?.id]);
    if (s) return s;
  }
  return getActiveSeason(reqSport(req), org?.id);
}

async function matchWithNames(m) {
  const h = await qGet('SELECT name, logo_path FROM teams WHERE id = ?', [m.home_team_id]) || {};
  const a = await qGet('SELECT name, logo_path FROM teams WHERE id = ?', [m.away_team_id]) || {};
  const out = { ...m, home_team: h.name, away_team: a.name, home_logo: h.logo_path, away_logo: a.logo_path };
  if (m.status === 'live') {
    const season = await qGet('SELECT sport FROM seasons WHERE id = ?', [m.season_id]);
    const sport = season?.sport || 'volleyball';
    const sets = await qAll('SELECT * FROM match_sets WHERE match_id = ? ORDER BY set_no', [m.id]);
    const cur = sets.find(s => !s.finished);
    let th = 0, ta = 0;
    for (const s of sets) { th += s.home_points; ta += s.away_points; }
    const pn = sportOf(sport).periodName.toLowerCase();
    if (isSetBased(sport)) {
      out.live_detail = cur ? `${cur.set_no}. ${pn}: ${cur.home_points}-${cur.away_points}` : '';
    } else {
      out.home_sets = th; out.away_sets = ta;
      out.live_detail = cur ? `${cur.set_no}. ${pn}` : '';
    }
  }
  return out;
}

async function stageLabels(seasonId, matches) {
  // Eleme turlari icin etiket (Ceyrek Final vb.), gruplar icin "A Grubu"
  const labels = {};
  const season = await qGet('SELECT two_legged FROM seasons WHERE id = ?', [seasonId]);
  const twoLegged = !!season?.two_legged;
  const koRounds = [...new Set(matches.filter(m => m.stage === 'knockout').map(m => m.round))].sort((a, b) => a - b);
  for (const r of koRounds) {
    let cnt = matches.filter(m => m.stage === 'knockout' && m.round === r).length;
    if (twoLegged) cnt = Math.ceil(cnt / 2);
    labels['ko' + r] = knockoutLabel(cnt * 2);
  }
  let groupOf = {};
  if (matches.some(m => m.stage === 'group')) {
    const rows = await qAll('SELECT id, group_name FROM teams WHERE season_id = ?', [seasonId]);
    groupOf = Object.fromEntries(rows.map(t => [t.id, t.group_name]));
  }
  return matches.map(m => {
    if (m.stage === 'knockout') {
      const legTag = m.leg === 1 ? ' · 1. Maç' : m.leg === 2 ? ' · Rövanş' : '';
      return { ...m, stage_label: labels['ko' + m.round] + legTag };
    }
    if (m.stage === 'group') return { ...m, stage_label: `${groupOf[m.home_team_id] || '?'} Grubu · ${m.round}. Hafta`, group_name: groupOf[m.home_team_id] };
    return { ...m, stage_label: `${m.round}. Hafta` };
  });
}

async function decorateAll(matches) {
  if (!matches.length) return [];
  // Tum takimlari tek sorguda cek
  const teams = await qAll('SELECT id, name, logo_path FROM teams');
  const tmap = new Map(teams.map(t => [t.id, t]));
  const out = [];
  for (const m of matches) {
    const h = tmap.get(m.home_team_id) || {};
    const a = tmap.get(m.away_team_id) || {};
    const item = { ...m, home_team: h.name, away_team: a.name, home_logo: h.logo_path, away_logo: a.logo_path };
    if (m.status === 'live') out.push(await matchWithNames(m)); // canli detay icin tam yol
    else out.push(item);
  }
  return out;
}

publicRouter.get('/orgs', ah(async (req, res) => {
  res.json({ orgs: await qAll('SELECT id, name, slug, logo_path FROM organizations ORDER BY id') });
}));

publicRouter.get('/sports', ah(async (req, res) => {
  const org = await resolveOrg(req);
  const list = [];
  for (const k of SPORT_KEYS) {
    list.push({ key: k, label: SPORTS[k].label, has_season: !!(await getActiveSeason(k, org?.id)) });
  }
  res.json({ sports: list, org: org ? { name: org.name, slug: org.slug, logo_path: org.logo_path } : null });
}));

// Arsiv: bu brans + org'un tum sezonlari
publicRouter.get('/seasons-list', ah(async (req, res) => {
  const org = await resolveOrg(req);
  res.json({ seasons: await qAll(
    "SELECT id, name, is_active, format FROM seasons WHERE sport = ? AND organization_id = ? AND approval_status = 'approved' ORDER BY id DESC",
    [reqSport(req), org?.id]) });
}));

publicRouter.get('/season', ah(async (req, res) => {
  const sport = reqSport(req);
  res.json({ season: await pickSeason(req), sport: sportConfigForClient(sport) });
}));

publicRouter.get('/standings', ah(async (req, res) => {
  const season = await pickSeason(req);
  if (!season) return res.json({ standings: [], sport: reqSport(req), format: 'league' });
  const format = season.format || 'league';
  const out = { sport: season.sport, format, standings: [], groups: [], knockout: [] };
  if (format === 'league') {
    out.standings = await computeStandings(season.id);
  } else if (format === 'groups_knockout') {
    const groups = await qAll(
      'SELECT DISTINCT group_name FROM teams WHERE season_id = ? AND group_name IS NOT NULL ORDER BY group_name', [season.id]);
    for (const g of groups) {
      out.groups.push({ name: g.group_name, standings: await computeStandings(season.id, g.group_name) });
    }
  }
  // Eleme agaci (varsa)
  let ko = await qAll("SELECT * FROM matches WHERE season_id = ? AND stage = 'knockout' ORDER BY round, id", [season.id]);
  if (ko.length) {
    ko = await stageLabels(season.id, ko);
    const decorated = await decorateAll(ko);
    const rounds = [...new Set(decorated.map(m => m.round))].sort((a, b) => a - b);
    out.knockout = rounds.map(r => ({
      label: decorated.find(m => m.round === r)?.stage_label,
      matches: decorated.filter(m => m.round === r)
    }));
  }
  res.json(out);
}));

publicRouter.get('/fixtures', ah(async (req, res) => {
  const season = await pickSeason(req);
  if (!season) return res.json({ matches: [] });
  let matches = await qAll('SELECT * FROM matches WHERE season_id = ? ORDER BY round, scheduled_at, id', [season.id]);
  matches = await stageLabels(season.id, matches);
  res.json({ matches: await decorateAll(matches), format: season.format || 'league' });
}));

publicRouter.get('/live-matches', ah(async (req, res) => {
  const org = await resolveOrg(req);
  const matches = await qAll(
    "SELECT m.*, s.sport FROM matches m JOIN seasons s ON s.id = m.season_id WHERE m.status = 'live' AND s.organization_id = ?", [org?.id]);
  const out = [];
  for (const m of matches) {
    out.push({ ...(await matchWithNames(m)), sport_label: sportOf(m.sport).label });
  }
  res.json({ matches: out });
}));

publicRouter.get('/teams', ah(async (req, res) => {
  const season = await pickSeason(req);
  if (!season) return res.json({ teams: [] });
  const teams = await qAll(`
    SELECT t.*, (SELECT COUNT(*) FROM players p WHERE p.team_id = t.id AND p.status = 'approved') AS player_count
    FROM teams t WHERE t.season_id = ? ORDER BY t.name
  `, [season.id]);
  res.json({ teams });
}));

publicRouter.get('/teams/:id', ah(async (req, res) => {
  const team = await qGet('SELECT * FROM teams WHERE id = ?', [req.params.id]);
  if (!team) return res.status(404).json({ error: 'Takim bulunamadi' });
  const season = await qGet('SELECT * FROM seasons WHERE id = ?', [team.season_id]);
  const players = await qAll(
    "SELECT id, first_name, last_name, height_cm, weight_kg, jersey_no, position, photo_path FROM players WHERE team_id = ? AND status = 'approved' ORDER BY jersey_no",
    [team.id]);
  const matches = await qAll(
    'SELECT * FROM matches WHERE home_team_id = ? OR away_team_id = ? ORDER BY round',
    [team.id, team.id]);
  res.json({ team, players, matches: await decorateAll(matches), sport: sportConfigForClient(season?.sport || 'volleyball') });
}));

publicRouter.get('/players/:id', ah(async (req, res) => {
  const player = await qGet(`
    SELECT p.id, p.first_name, p.last_name, p.height_cm, p.weight_kg, p.jersey_no,
           p.position, p.photo_path, p.team_id, t.name AS team_name, t.logo_path AS team_logo, t.season_id
    FROM players p JOIN teams t ON t.id = p.team_id
    WHERE p.id = ? AND p.status = 'approved'
  `, [req.params.id]);
  if (!player) return res.status(404).json({ error: 'Oyuncu bulunamadi' });
  const season = await qGet('SELECT * FROM seasons WHERE id = ?', [player.season_id]);
  const sportKey = season?.sport || 'volleyball';
  const sport = sportOf(sportKey);
  const cols = sport.statCols.map(c => {
    const agg = c.sum ? `SUM(CASE WHEN ${c.cond} THEN e.points ELSE 0 END)` : `SUM(CASE WHEN ${c.cond} THEN 1 ELSE 0 END)`;
    return `COALESCE(${agg}, 0) AS ${c.key}`;
  }).join(', ');
  const stats = await qGet(`
    SELECT COUNT(DISTINCT e.match_id) AS matches_played, ${cols}
    FROM stat_events e WHERE e.player_id = ?
  `, [player.id]);
  const penalties = await qAll('SELECT * FROM penalties WHERE player_id = ? ORDER BY created_at DESC', [player.id]);
  const mvpCount = (await qGet(
    "SELECT COUNT(*) AS c FROM matches WHERE mvp_player_id = ? AND status = 'finished'", [player.id])).c;

  // Turnuva gecmisi: ayni kimlik numarasina (hash) sahip tum oyuncu kayitlari
  const idRow = await qGet('SELECT national_id_hash FROM players WHERE id = ?', [player.id]);
  let career = [];
  if (idRow?.national_id_hash) {
    career = await qAll(`
      SELECT p.id AS player_id, se.name AS season_name, se.sport, t.name AS team_name, t.logo_path AS team_logo,
        COUNT(DISTINCT e.match_id) AS matches_played,
        COALESCE(SUM(CASE WHEN e.points > 0 THEN e.points ELSE 0 END), 0) AS total_points
      FROM players p
      JOIN teams t ON t.id = p.team_id
      JOIN seasons se ON se.id = t.season_id
      LEFT JOIN stat_events e ON e.player_id = p.id
      WHERE p.national_id_hash = ? AND p.status = 'approved'
      GROUP BY p.id, se.name, se.sport, t.name, t.logo_path
      ORDER BY se.id DESC
    `, [idRow.national_id_hash]);
    career = career.map(c => ({ ...c, sport_label: sportOf(c.sport).label }));
  }
  res.json({ player, stats, penalties, mvp_count: mvpCount, sport: sportConfigForClient(sportKey), career });
}));

publicRouter.get('/leaders', ah(async (req, res) => {
  const sportKey = reqSport(req);
  const season = await pickSeason(req);
  const sport = sportOf(sportKey);
  const titles = sport.leaders.map(l => ({ key: l.key, label: l.label, suffix: l.ratio ? '%' : '' }));
  if (!season) return res.json({ leaders: {}, titles });
  const leaders = {};
  for (const l of sport.leaders) {
    if (l.ratio) {
      leaders[l.key] = await qAll(`
        SELECT p.id, p.first_name, p.last_name, p.photo_path, t.name AS team_name, t.logo_path AS team_logo,
          ROUND(100.0 * SUM(CASE WHEN e.type = '${l.ratio.ok}' THEN 1 ELSE 0 END)
            / (SUM(CASE WHEN e.type = '${l.ratio.ok}' THEN 1 ELSE 0 END) + SUM(CASE WHEN e.type = '${l.ratio.err}' THEN 1 ELSE 0 END))) AS value,
          COUNT(*) AS attempts
        FROM stat_events e
        JOIN players p ON p.id = e.player_id
        JOIN teams t ON t.id = p.team_id
        JOIN matches m ON m.id = e.match_id
        WHERE m.season_id = ? AND e.type IN ('${l.ratio.ok}','${l.ratio.err}')
        GROUP BY p.id, t.name, t.logo_path HAVING COUNT(*) >= ${l.ratio.min}
        ORDER BY value DESC LIMIT 10
      `, [season.id]);
      continue;
    }
    const agg = l.sum ? 'SUM(e.points)' : 'COUNT(*)';
    leaders[l.key] = await qAll(`
      SELECT p.id, p.first_name, p.last_name, p.photo_path, t.name AS team_name, t.logo_path AS team_logo, ${agg} AS value
      FROM stat_events e
      JOIN players p ON p.id = e.player_id
      JOIN teams t ON t.id = p.team_id
      JOIN matches m ON m.id = e.match_id
      WHERE m.season_id = ? AND e.player_id IS NOT NULL AND ${l.cond}
      GROUP BY p.id, t.name, t.logo_path ORDER BY value DESC LIMIT 10
    `, [season.id]);
  }
  // Macin Oyuncusu (MVP) siralamasi - tum branslar
  titles.push({ key: 'mvp', label: 'Maçın Oyuncusu', suffix: '' });
  leaders.mvp = await qAll(`
    SELECT p.id, p.first_name, p.last_name, p.photo_path, t.name AS team_name, t.logo_path AS team_logo,
      COUNT(*) AS value
    FROM matches m
    JOIN players p ON p.id = m.mvp_player_id
    JOIN teams t ON t.id = p.team_id
    WHERE m.season_id = ? AND m.status = 'finished' AND m.mvp_player_id IS NOT NULL
    GROUP BY p.id, t.name, t.logo_path ORDER BY value DESC LIMIT 10
  `, [season.id]);
  res.json({ leaders, titles });
}));

publicRouter.get('/matches/:id', ah(async (req, res) => {
  const match = await qGet('SELECT * FROM matches WHERE id = ?', [req.params.id]);
  if (!match) return res.status(404).json({ error: 'Mac bulunamadi' });
  const season = await qGet('SELECT * FROM seasons WHERE id = ?', [match.season_id]);
  const sportKey = season?.sport || 'volleyball';
  const sport = sportOf(sportKey);
  const sets = await qAll('SELECT * FROM match_sets WHERE match_id = ? ORDER BY set_no', [match.id]);
  const cols = sport.statCols.map(c => {
    const agg = c.sum ? `SUM(CASE WHEN ${c.cond} THEN e.points ELSE 0 END)` : `SUM(CASE WHEN ${c.cond} THEN 1 ELSE 0 END)`;
    return `COALESCE(${agg}, 0) AS ${c.key}`;
  }).join(', ');
  const playerStats = await qAll(`
    SELECT p.id, p.first_name, p.last_name, p.jersey_no, p.team_id, ${cols}
    FROM stat_events e JOIN players p ON p.id = e.player_id
    WHERE e.match_id = ? GROUP BY p.id ORDER BY 6 DESC
  `, [match.id]);
  const mvp = match.mvp_player_id
    ? await qGet('SELECT id, first_name, last_name FROM players WHERE id = ?', [match.mvp_player_id])
    : null;

  // Futbol: gol listesi (sekli + asistiyle)
  let goals = [];
  if (sportKey === 'football') {
    const detailLabels = Object.fromEntries((sport.eventTypes.goal?.details || []).map(d => [d.key, d.label]));
    const rows = await qAll(`
      SELECT e.id, e.set_no, e.team_id, e.type, e.detail,
        p.first_name || ' ' || p.last_name AS scorer
      FROM stat_events e LEFT JOIN players p ON p.id = e.player_id
      WHERE e.match_id = ? AND e.type IN ('goal', 'own_goal')
      ORDER BY e.id
    `, [match.id]);
    for (const g of rows) {
      const assist = await qGet(`
        SELECT p.first_name || ' ' || p.last_name AS name
        FROM stat_events a JOIN players p ON p.id = a.player_id
        WHERE a.related_id = ? AND a.type = 'assist' LIMIT 1
      `, [g.id]);
      goals.push({
        period: g.set_no, team_id: g.team_id,
        scorer: g.type === 'own_goal' ? null : g.scorer,
        detail_label: detailLabels[g.detail] || null,
        assist: assist?.name || null,
        own_goal: g.type === 'own_goal'
      });
    }
  }
  res.json({ match: await matchWithNames(match), sets, playerStats, mvp, sport: sportConfigForClient(sportKey), goals });
}));
