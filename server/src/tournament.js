// Turnuva format motoru: eleme fikstürü, tur atlama, grup -> eleme gecisi
import { qGet, qAll, qRun } from './db.js';
import { computeStandings } from './standings.js';

export function knockoutLabel(teamCount) {
  if (teamCount <= 2) return 'Final';
  if (teamCount <= 4) return 'Yarı Final';
  if (teamCount <= 8) return 'Çeyrek Final';
  if (teamCount <= 16) return 'Son 16';
  return `Son ${teamCount}`;
}

const shuffle = (a) => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };

async function insertKnockoutMatches(season, pairs, round, bestOf) {
  const twoLegged = !!season.two_legged;
  for (const [h, a] of pairs) {
    await qRun(
      "INSERT INTO matches (season_id, round, home_team_id, away_team_id, best_of, stage, leg) VALUES (?, ?, ?, ?, ?, 'knockout', ?)",
      [season.id, round, h, a, bestOf, twoLegged ? 1 : null]);
    if (twoLegged) {
      await qRun(
        "INSERT INTO matches (season_id, round, home_team_id, away_team_id, best_of, stage, leg) VALUES (?, ?, ?, ?, ?, 'knockout', 2)",
        [season.id, round, a, h, bestOf]);
    }
  }
}

// Eleme macinda/eslesmesinde kazanani belirle
export function matchWinner(m) {
  if (m.home_sets !== m.away_sets) return m.home_sets > m.away_sets ? m.home_team_id : m.away_team_id;
  if (m.shootout_home != null && m.shootout_away != null && m.shootout_home !== m.shootout_away) {
    return m.shootout_home > m.shootout_away ? m.home_team_id : m.away_team_id;
  }
  return null;
}

// Rovansli eslesme: toplam skor, esitlikte rovans macinin penaltilari
export function tieWinner(leg1, leg2) {
  const teamA = leg1.home_team_id, teamB = leg1.away_team_id;
  const aggA = leg1.home_sets + leg2.away_sets;
  const aggB = leg1.away_sets + leg2.home_sets;
  if (aggA !== aggB) return aggA > aggB ? teamA : teamB;
  // Toplam esit: yalnizca rovans macinin penalti serisi belirler
  if (leg2.shootout_home != null && leg2.shootout_away != null && leg2.shootout_home !== leg2.shootout_away) {
    return leg2.shootout_home > leg2.shootout_away ? leg2.home_team_id : leg2.away_team_id;
  }
  return null;
}

// Direkt eleme: 1. tur (guc-2 degilse fazla takimlar on eleme oynar, digerleri bay gecer)
export async function createKnockoutBracket(season, teamIds, bestOf, startRound = 1, opts = {}) {
  const teams = opts.ordered ? [...teamIds] : shuffle(teamIds);
  let p = 1;
  while (p * 2 <= teams.length) p *= 2;              // brackete sigan guc-2
  const extra = teams.length - p;                     // on eleme oynayacak fazla takim ciftleri
  const playIn = teams.slice(0, extra * 2);           // 2*extra takim on eleme oynar
  const byes = teams.slice(extra * 2);                // kalanlar bay
  const pairs = [];
  if (extra > 0) {
    for (let i = 0; i < playIn.length; i += 2) pairs.push([playIn[i], playIn[i + 1]]);
    await insertKnockoutMatches(season, pairs, startRound, bestOf);
    await qRun('UPDATE seasons SET knockout_byes = ? WHERE id = ?', [JSON.stringify(byes), season.id]);
  } else {
    for (let i = 0; i < teams.length; i += 2) pairs.push([teams[i], teams[i + 1]]);
    await insertKnockoutMatches(season, pairs, startRound, bestOf);
    await qRun('UPDATE seasons SET knockout_byes = NULL WHERE id = ?', [season.id]);
  }
}

// Grup asamasi bitti -> gruplardan cikanlarla eleme kur
export async function createKnockoutFromGroups(season, bestOf) {
  const adv = season.advance_count || 2;
  const groups = await qAll(
    'SELECT DISTINCT group_name FROM teams WHERE season_id = ? AND group_name IS NOT NULL ORDER BY group_name', [season.id]);
  const qualifiersByRank = []; // [rank][groupIdx] = team_id
  for (const g of groups) {
    const table = await computeStandings(season.id, g.group_name);
    table.slice(0, adv).forEach((row, rank) => {
      if (!qualifiersByRank[rank]) qualifiersByRank[rank] = [];
      qualifiersByRank[rank].push(row.team_id);
    });
  }
  const nextRound = 100; // eleme turlari 100'den baslar (grup haftalariyla karismasin)
  if (groups.length === 2 && adv >= 1 && qualifiersByRank.length === adv && qualifiersByRank.every(r => r.length === 2)) {
    // Klasik capraz: A1-B(son), A2-B(son-1)... ve B1-A(son)...
    // qualifiersByRank[rank] = [Agrubu, Bgrubu]
    const A = qualifiersByRank.map(r => r[0]);
    const B = qualifiersByRank.map(r => r[1]);
    const pairs = [];
    for (let i = 0; i < adv; i++) {
      // Eslesme sabit: A(i+1) vs B(adv-i). Ev sahipligi donusumlu.
      const x = A[i], y = B[adv - 1 - i];
      pairs.push(i % 2 === 0 ? [x, y] : [y, x]);
    }
    await insertKnockoutMatches(season, pairs, nextRound, bestOf);
    await qRun('UPDATE seasons SET knockout_byes = NULL WHERE id = ?', [season.id]);
  } else {
    const all = qualifiersByRank.flat();
    await createKnockoutBracket(season, all, bestOf, nextRound);
  }
}

// Bir mac bittikten sonra: tur tamamlandiysa sonraki turu olustur
export async function advanceAfterFinish(matchId) {
  const match = await qGet('SELECT * FROM matches WHERE id = ?', [matchId]);
  if (!match) return null;
  const season = await qGet('SELECT * FROM seasons WHERE id = ?', [match.season_id]);
  if (!season || season.format === 'league') return null;
  const bestOf = match.best_of || 5;

  if (match.stage === 'group') {
    const open = (await qGet(
      "SELECT COUNT(*) c FROM matches WHERE season_id = ? AND stage = 'group' AND status != 'finished'", [season.id])).c;
    if (open === 0) {
      await createKnockoutFromGroups(season, bestOf);
      return 'Grup aşaması tamamlandı — eleme fikstürü oluşturuldu!';
    }
    return null;
  }

  if (match.stage === 'knockout') {
    const roundMatches = await qAll(
      "SELECT * FROM matches WHERE season_id = ? AND stage = 'knockout' AND round = ?", [season.id, match.round]);
    if (roundMatches.some(m => m.status !== 'finished')) return null;
    // Kazananlar (mac sirasiyla) + varsa bay gecenler
    let winners;
    if (season.two_legged) {
      // Rovansli: ayni takim ciftinin iki macini birlestir
      const ties = new Map();
      for (const m of roundMatches.sort((a, b) => a.id - b.id)) {
        const key = [Math.min(m.home_team_id, m.away_team_id), Math.max(m.home_team_id, m.away_team_id)].join('-');
        if (!ties.has(key)) ties.set(key, []);
        ties.get(key).push(m);
      }
      winners = [];
      for (const legs of ties.values()) {
        const leg1 = legs.find(x => x.leg === 1) || legs[0];
        const leg2 = legs.find(x => x.leg === 2) || legs[1] || legs[0];
        winners.push(legs.length > 1 ? tieWinner(leg1, leg2) : matchWinner(leg1));
      }
    } else {
      winners = roundMatches.sort((a, b) => a.id - b.id).map(m => matchWinner(m));
    }
    if (winners.some(w => !w)) return null; // kazanani belli olmayan eslesme var (penalti bekleniyor)
    let pool = [...winners];
    if (season.knockout_byes) {
      try { pool = pool.concat(JSON.parse(season.knockout_byes)); } catch {}
      await qRun('UPDATE seasons SET knockout_byes = NULL WHERE id = ?', [season.id]);
      pool = shuffle(pool);
    }
    if (pool.length < 2) return 'Turnuva tamamlandı — şampiyon belli oldu! 🏆';
    const pairs = [];
    for (let i = 0; i < pool.length; i += 2) pairs.push([pool[i], pool[i + 1]]);
    await insertKnockoutMatches(season, pairs, match.round + 1, bestOf);
    return `${knockoutLabel(pool.length)} eşleşmeleri oluşturuldu!`;
  }
  return null;
}
