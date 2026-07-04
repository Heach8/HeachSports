import { qGet, qAll } from './db.js';

// Voleybol/plaj: 3 puanli sistem (yakin maglubiyete 1 puan)
// Futbol: 3/1/0 - Basketbol: 2/1
export async function computeStandings(seasonId) {
  const season = await qGet('SELECT * FROM seasons WHERE id = ?', [seasonId]);
  const sport = season?.sport || 'volleyball';
  const teams = await qAll('SELECT * FROM teams WHERE season_id = ?', [seasonId]);
  const rows = new Map();
  for (const t of teams) {
    rows.set(t.id, {
      team_id: t.id, name: t.name, company: t.company, logo_path: t.logo_path,
      played: 0, won: 0, drawn: 0, lost: 0, points: 0,
      sets_won: 0, sets_lost: 0, points_for: 0, points_against: 0
    });
  }
  const matches = await qAll("SELECT * FROM matches WHERE season_id = ? AND status = 'finished'", [seasonId]);
  const allSets = await qAll(
    "SELECT ms.* FROM match_sets ms JOIN matches m ON m.id = ms.match_id WHERE m.season_id = ?", [seasonId]);
  const setsByMatch = new Map();
  for (const s of allSets) {
    if (!setsByMatch.has(s.match_id)) setsByMatch.set(s.match_id, []);
    setsByMatch.get(s.match_id).push(s);
  }
  for (const m of matches) {
    const home = rows.get(m.home_team_id);
    const away = rows.get(m.away_team_id);
    if (!home || !away) continue;
    const sets = setsByMatch.get(m.id) || [];
    let hp = 0, ap = 0;
    for (const s of sets) { hp += s.home_points; ap += s.away_points; }
    home.played++; away.played++;
    home.points_for += hp; home.points_against += ap;
    away.points_for += ap; away.points_against += hp;

    if (sport === 'volleyball' || sport === 'beach_volleyball') {
      home.sets_won += m.home_sets; home.sets_lost += m.away_sets;
      away.sets_won += m.away_sets; away.sets_lost += m.home_sets;
      const homeWon = m.home_sets > m.away_sets;
      const winner = homeWon ? home : away;
      const loser = homeWon ? away : home;
      winner.won++; loser.lost++;
      const closeLoss = Math.min(m.home_sets, m.away_sets) >= Math.floor((m.best_of || 5) / 2);
      if (closeLoss) { winner.points += 2; loser.points += 1; }
      else { winner.points += 3; }
    } else if (sport === 'football') {
      if (hp === ap) { home.drawn++; away.drawn++; home.points++; away.points++; }
      else {
        const winner = hp > ap ? home : away;
        const loser = hp > ap ? away : home;
        winner.won++; winner.points += 3; loser.lost++;
      }
    } else {
      const winner = hp > ap ? home : away;
      const loser = hp > ap ? away : home;
      winner.won++; winner.points += 2; loser.lost++; loser.points += 1;
    }
  }
  const list = [...rows.values()];
  const ratio = (a, b) => (b === 0 ? (a === 0 ? 0 : 1e9) : a / b);
  if (sport === 'volleyball' || sport === 'beach_volleyball') {
    list.sort((x, y) =>
      y.points - x.points ||
      ratio(y.sets_won, y.sets_lost) - ratio(x.sets_won, x.sets_lost) ||
      ratio(y.points_for, y.points_against) - ratio(x.points_for, x.points_against) ||
      x.name.localeCompare(y.name, 'tr'));
  } else {
    list.sort((x, y) =>
      y.points - x.points ||
      (y.points_for - y.points_against) - (x.points_for - x.points_against) ||
      y.points_for - x.points_for ||
      x.name.localeCompare(y.name, 'tr'));
  }
  return list.map((r, i) => ({
    rank: i + 1, ...r,
    diff: r.points_for - r.points_against,
    set_ratio: r.sets_lost === 0 ? (r.sets_won > 0 ? 'MAX' : '-') : (r.sets_won / r.sets_lost).toFixed(2)
  }));
}
