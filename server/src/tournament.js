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
  for (const [h, a] of pairs) {
    await qRun(
      "INSERT INTO matches (season_id, round, home_team_id, away_team_id, best_of, stage) VALUES (?, ?, ?, ?, ?, 'knockout')",
      [season.id, round, h, a, bestOf]);
  }
}

// Direkt eleme: 1. tur (guc-2 degilse fazla takimlar on eleme oynar, digerleri bay gecer)
export async function createKnockoutBracket(season, teamIds, bestOf, startRound = 1) {
  const teams = shuffle(teamIds);
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
  if (adv === 2 && qualifiersByRank.length === 2) {
    // Capraz eslesme: A1-B2, B1-A2 ...
    const firsts = qualifiersByRank[0], seconds = qualifiersByRank[1];
    const pairs = firsts.map((t, i) => [t, seconds[(i + 1) % seconds.length]]);
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
    const winners = roundMatches
      .sort((a, b) => a.id - b.id)
      .map(m => (m.home_sets > m.away_sets ? m.home_team_id : m.away_team_id));
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
