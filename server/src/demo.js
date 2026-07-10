// Demo turnuva: voleybol sezonunda oynanmis maclar + gercekci istatistikler + canli mac
import { initSchema, qGet, qAll, qRun, qInsert } from './db.js';

await initSchema();

const season = await qGet("SELECT * FROM seasons WHERE is_active = 1 AND sport = 'volleyball'");
if (!season) { console.log('Aktif voleybol sezonu yok, once seed calistirin.'); process.exit(1); }
const existing = (await qGet('SELECT COUNT(*) AS c FROM matches WHERE season_id = ?', [season.id])).c;
if (existing) { console.log('Bu sezonda zaten mac var, demo atlandi.'); process.exit(0); }

const teams = await qAll('SELECT id, name FROM teams WHERE season_id = ?', [season.id]);
const roster = async (tid) => (await qAll(
  "SELECT id FROM players WHERE team_id = ? AND status = 'approved'", [tid])).map(p => p.id);

const ids = teams.map(t => t.id);
const arr = [...ids];
const rounds = [];
for (let r = 0; r < arr.length - 1; r++) {
  const pairs = [];
  for (let i = 0; i < arr.length / 2; i++) {
    const a = arr[i], b = arr[arr.length - 1 - i];
    pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
  }
  rounds.push(pairs);
  arr.splice(1, 0, arr.pop());
}

const insEv = (matchId, setNo, tid, pid, type, date, points = 1) => qRun(
  'INSERT INTO stat_events (match_id, set_no, team_id, player_id, type, points, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  [matchId, setNo, tid, pid, type, points, date]);

const rnd = (n) => Math.floor(Math.random() * n);
const pickType = () => {
  const x = Math.random();
  if (x < 0.52) return 'attack';
  if (x < 0.66) return 'block';
  if (x < 0.78) return 'ace';
  return 'opp_error';
};
const pickPlayer = (list) => list[Math.min(rnd(list.length), rnd(list.length))];

async function playSet(matchId, setNo, homeId, awayId, homeRoster, awayRoster, homeEdge, date, target = 25) {
  let h = 0, a = 0;
  while (true) {
    const homeScores = Math.random() < homeEdge;
    const type = pickType();
    const [tid, list] = homeScores ? [homeId, homeRoster] : [awayId, awayRoster];
    const [otherTid, otherList] = homeScores ? [awayId, awayRoster] : [homeId, homeRoster];
    await insEv(matchId, setNo, tid, type === 'opp_error' ? null : pickPlayer(list), type, date);
    if (type === 'ace') {
      await insEv(matchId, setNo, otherTid, pickPlayer(otherList), 'rec_err', date, 0);
    } else if (Math.random() < 0.55) {
      await insEv(matchId, setNo, otherTid, pickPlayer(otherList), 'rec_ok', date, 0);
    }
    if (type === 'attack' && Math.random() < 0.3) {
      await insEv(matchId, setNo, otherTid, pickPlayer(otherList), 'dig', date, 0);
    }
    homeScores ? h++ : a++;
    if ((h >= target || a >= target) && Math.abs(h - a) >= 2) break;
    if (h >= target + 8 || a >= target + 8) break;
  }
  return [h, a];
}

async function simulateMatch(matchId, homeId, awayId, homeEdge, date) {
  const hr = await roster(homeId), ar = await roster(awayId);
  let hs = 0, as = 0, setNo = 1;
  while (hs < 3 && as < 3) {
    const target = setNo === 5 ? 15 : 25;
    const [h, a] = await playSet(matchId, setNo, homeId, awayId, hr, ar, homeEdge, date, target);
    await qRun('INSERT INTO match_sets (match_id, set_no, home_points, away_points, finished) VALUES (?, ?, ?, ?, 1)',
      [matchId, setNo, h, a]);
    h > a ? hs++ : as++;
    setNo++;
  }
  const winner = hs > as ? homeId : awayId;
  const mvp = await qGet(`
    SELECT player_id, COUNT(*) c FROM stat_events
    WHERE match_id = ? AND team_id = ? AND player_id IS NOT NULL AND points > 0
    GROUP BY player_id ORDER BY c DESC LIMIT 1
  `, [matchId, winner]);
  await qRun("UPDATE matches SET status = 'finished', home_sets = ?, away_sets = ?, mvp_player_id = ? WHERE id = ?",
    [hs, as, mvp?.player_id || null, matchId]);
}

const day = 86400000;
const iso = (t) => new Date(t).toISOString().slice(0, 16).replace('T', ' ');
const now = Date.now();

let matchIds = [];
for (let i = 0; i < rounds.length; i++) {
  for (const [h, a] of rounds[i]) {
    const when = i < 2 ? now - (12 - i * 5) * day : now + (matchIds.length % 2 === 0 ? 0 : 2 * day);
    const id = await qInsert(
      'INSERT INTO matches (season_id, round, home_team_id, away_team_id, best_of, scheduled_at) VALUES (?, ?, ?, ?, 5, ?)',
      [season.id, i + 1, h, a, iso(when)]);
    matchIds.push({ id, round: i + 1, home: h, away: a });
  }
}

const edges = [0.56, 0.47, 0.53, 0.58];
const played = matchIds.filter(m => m.round <= 2);
for (let i = 0; i < played.length; i++) {
  const m = played[i];
  await simulateMatch(m.id, m.home, m.away, edges[i % edges.length], iso(now - (12 - (m.round - 1) * 5) * day));
}

// 3. hafta ilk mac: CANLI (1-1, 3. set ortasi)
const live = matchIds.find(m => m.round === 3);
const lhr = await roster(live.home), lar = await roster(live.away);
await qRun("UPDATE matches SET status = 'live' WHERE id = ?", [live.id]);
const [s1h, s1a] = await playSet(live.id, 1, live.home, live.away, lhr, lar, 0.55, iso(now));
await qRun('INSERT INTO match_sets (match_id, set_no, home_points, away_points, finished) VALUES (?, 1, ?, ?, 1)', [live.id, s1h, s1a]);
const [s2h, s2a] = await playSet(live.id, 2, live.home, live.away, lhr, lar, 0.44, iso(now));
await qRun('INSERT INTO match_sets (match_id, set_no, home_points, away_points, finished) VALUES (?, 2, ?, ?, 1)', [live.id, s2h, s2a]);
const hSets = (s1h > s1a ? 1 : 0) + (s2h > s2a ? 1 : 0);
await qRun('UPDATE matches SET home_sets = ?, away_sets = ? WHERE id = ?', [hSets, 2 - hSets, live.id]);
let ch = 0, ca = 0;
while (ch + ca < 25) {
  const homeScores = Math.random() < 0.55;
  const type = pickType();
  const [tid, list] = homeScores ? [live.home, lhr] : [live.away, lar];
  const [otid, olist] = homeScores ? [live.away, lar] : [live.home, lhr];
  await insEv(live.id, 3, tid, type === 'opp_error' ? null : pickPlayer(list), type, iso(now));
  if (type === 'ace') await insEv(live.id, 3, otid, pickPlayer(olist), 'rec_err', iso(now), 0);
  else if (Math.random() < 0.55) await insEv(live.id, 3, otid, pickPlayer(olist), 'rec_ok', iso(now), 0);
  if (type === 'attack' && Math.random() < 0.3) await insEv(live.id, 3, otid, pickPlayer(olist), 'dig', iso(now), 0);
  homeScores ? ch++ : ca++;
}
await qRun('INSERT INTO match_sets (match_id, set_no, home_points, away_points, finished) VALUES (?, 3, ?, ?, 0)', [live.id, ch, ca]);

const anyPlayer = await qGet(
  'SELECT p.id FROM players p JOIN teams t ON t.id = p.team_id WHERE t.season_id = ? LIMIT 1 OFFSET 5', [season.id]);
if (anyPlayer) {
  await qRun("INSERT INTO penalties (player_id, type, note) VALUES (?, 'yellow', 'Hakem karari itiraz')", [anyPlayer.id]);
}

// --- FUTBOL DEMO: 2 hafta oynanmis (gol sekli + asist + kartlar) ---
const fSeason = await qGet("SELECT * FROM seasons WHERE is_active = 1 AND sport = 'football'");
if (fSeason && !(await qGet('SELECT COUNT(*) c FROM matches WHERE season_id = ?', [fSeason.id])).c) {
  // Kart kurallari: 2 sari = 1 mac, kirmizi = 1 mac
  await qRun('UPDATE seasons SET yellow_limit = 2, red_ban = 1 WHERE id = ?', [fSeason.id]);
  const fTeams = (await qAll('SELECT id FROM teams WHERE season_id = ?', [fSeason.id])).map(t => t.id);
  const fArr = [...fTeams];
  const fRounds = [];
  for (let r = 0; r < fArr.length - 1; r++) {
    const pairs = [];
    for (let i = 0; i < fArr.length / 2; i++) {
      const a = fArr[i], b = fArr[fArr.length - 1 - i];
      pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    fRounds.push(pairs);
    fArr.splice(1, 0, fArr.pop());
  }
  const gDetail = () => { const x = Math.random(); return x < .45 ? 'right_foot' : x < .75 ? 'left_foot' : x < .9 ? 'head' : x < .95 ? 'penalty' : 'other'; };
  const fIds = [];
  for (let i = 0; i < fRounds.length; i++) {
    for (const [h, a] of fRounds[i]) {
      const mid = await qInsert(
        'INSERT INTO matches (season_id, round, home_team_id, away_team_id, best_of, scheduled_at) VALUES (?, ?, ?, ?, 5, ?)',
        [fSeason.id, i + 1, h, a, iso(now + (i - 1) * 5 * day)]);
      fIds.push({ id: mid, round: i + 1, home: h, away: a });
    }
  }
  for (const m of fIds.filter(x => x.round <= 2)) {
    const hr = await roster(m.home), ar = await roster(m.away);
    let th = 0, ta = 0;
    for (const half of [1, 2]) {
      let hh = 0, ha = 0;
      const goalCount = rnd(4);
      for (let g = 0; g < goalCount; g++) {
        const homeScores = Math.random() < 0.55;
        const [tid, list] = homeScores ? [m.home, hr] : [m.away, ar];
        const scorer = pickPlayer(list.slice(3)); // forvetler/orta saha agirlikli
        const gid = await qInsert(
          'INSERT INTO stat_events (match_id, set_no, team_id, player_id, type, points, detail) VALUES (?, ?, ?, ?, ?, 1, ?)',
          [m.id, half, tid, scorer, 'goal', gDetail()]);
        if (Math.random() < 0.7) {
          let assist = pickPlayer(list);
          if (assist !== scorer) {
            await qRun('INSERT INTO stat_events (match_id, set_no, team_id, player_id, type, points, related_id) VALUES (?, ?, ?, ?, ?, 0, ?)',
              [m.id, half, tid, assist, 'assist', gid]);
          }
        }
        homeScores ? hh++ : ha++;
      }
      // kaleci kurtarislari + kartlar
      await insEv(m.id, half, m.home, hr[0], 'save', iso(now), 0);
      await insEv(m.id, half, m.away, ar[0], 'save', iso(now), 0);
      if (Math.random() < 0.6) await insEv(m.id, half, m.home, pickPlayer(hr), 'yellow_card', iso(now), 0);
      if (Math.random() < 0.6) await insEv(m.id, half, m.away, pickPlayer(ar), 'yellow_card', iso(now), 0);
      await qRun('INSERT INTO match_sets (match_id, set_no, home_points, away_points, finished) VALUES (?, ?, ?, ?, 1)', [m.id, half, hh, ha]);
      th += hh; ta += ha;
    }
    const winner = th > ta ? m.home : ta > th ? m.away : null;
    let mvpId = null;
    if (winner) {
      const top = await qGet(`SELECT player_id, COUNT(*) c FROM stat_events WHERE match_id = ? AND team_id = ? AND type = 'goal' AND player_id IS NOT NULL GROUP BY player_id ORDER BY c DESC LIMIT 1`, [m.id, winner]);
      mvpId = top?.player_id || null;
    }
    await qRun("UPDATE matches SET status = 'finished', home_sets = ?, away_sets = ?, mvp_player_id = ? WHERE id = ?", [th, ta, mvpId, m.id]);
  }
  console.log('Futbol demosu: 4 mac oynandi (gol detaylari + asistler + kartlar).');
}

// --- BASKETBOL DEMO: 2 hafta oynanmis (sayi/ribaund/asist/top calma/blok/faul) ---
const bSeason = await qGet("SELECT * FROM seasons WHERE is_active = 1 AND sport = 'basketball'");
if (bSeason && !(await qGet('SELECT COUNT(*) c FROM matches WHERE season_id = ?', [bSeason.id])).c) {
  await qRun('UPDATE seasons SET foul_limit = 5, period_count = 4 WHERE id = ?', [bSeason.id]);
  const bTeams = (await qAll('SELECT id FROM teams WHERE season_id = ?', [bSeason.id])).map(t => t.id);
  const bArr = [...bTeams];
  const bRounds = [];
  for (let r = 0; r < bArr.length - 1; r++) {
    const pairs = [];
    for (let i = 0; i < bArr.length / 2; i++) {
      const a = bArr[i], b = bArr[bArr.length - 1 - i];
      pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    bRounds.push(pairs);
    bArr.splice(1, 0, bArr.pop());
  }
  const bIds = [];
  for (let i = 0; i < bRounds.length; i++) {
    for (const [h, a] of bRounds[i]) {
      const mid = await qInsert(
        'INSERT INTO matches (season_id, round, home_team_id, away_team_id, best_of, scheduled_at) VALUES (?, ?, ?, ?, 5, ?)',
        [bSeason.id, i + 1, h, a, iso(now + (i - 1) * 5 * day)]);
      bIds.push({ id: mid, round: i + 1, home: h, away: a });
    }
  }
  const shotType = () => { const x = Math.random(); return x < .55 ? 'p2' : x < .8 ? 'p3' : 'p1'; };
  for (const m of bIds.filter(x => x.round <= 2)) {
    const hr = await roster(m.home), ar = await roster(m.away);
    let th = 0, ta = 0;
    for (let q = 1; q <= 4; q++) {
      let hh = 0, ha = 0;
      const plays = 14 + rnd(8);
      for (let k = 0; k < plays; k++) {
        const homeSide = Math.random() < 0.53;
        const [tid, list, otid, olist] = homeSide ? [m.home, hr, m.away, ar] : [m.away, ar, m.home, hr];
        const t = shotType();
        const pts = t === 'p3' ? 3 : t === 'p2' ? 2 : 1;
        await qRun('INSERT INTO stat_events (match_id, set_no, team_id, player_id, type, points) VALUES (?, ?, ?, ?, ?, ?)',
          [m.id, q, tid, pickPlayer(list), t, pts]);
        homeSide ? hh += pts : ha += pts;
        if (Math.random() < 0.5) await insEv(m.id, q, tid, pickPlayer(list), 'assist', iso(now), 0);
        if (Math.random() < 0.4) await insEv(m.id, q, otid, pickPlayer(olist), 'rebound', iso(now), 0);
        if (Math.random() < 0.12) await insEv(m.id, q, otid, pickPlayer(olist), 'steal', iso(now), 0);
        if (Math.random() < 0.1) await insEv(m.id, q, otid, pickPlayer(olist), 'block', iso(now), 0);
        if (Math.random() < 0.15) await insEv(m.id, q, otid, pickPlayer(olist), 'foul', iso(now), 0);
      }
      await qRun('INSERT INTO match_sets (match_id, set_no, home_points, away_points, finished) VALUES (?, ?, ?, ?, 1)', [m.id, q, hh, ha]);
      th += hh; ta += ha;
    }
    if (th === ta) { th += 2; await qRun('UPDATE match_sets SET home_points = home_points + 2 WHERE match_id = ? AND set_no = 4', [m.id]); }
    const winner = th > ta ? m.home : m.away;
    const top = await qGet(`SELECT player_id, SUM(points) c FROM stat_events WHERE match_id = ? AND team_id = ? AND points > 0 GROUP BY player_id ORDER BY c DESC LIMIT 1`, [m.id, winner]);
    await qRun("UPDATE matches SET status = 'finished', home_sets = ?, away_sets = ?, mvp_player_id = ? WHERE id = ?", [th, ta, top?.player_id || null, m.id]);
  }
  console.log('Basketbol demosu: 4 mac oynandi (tum istatistiklerle).');
}

const done = (await qGet("SELECT COUNT(*) c FROM matches WHERE season_id = ? AND status = 'finished'", [season.id])).c;
const evc = (await qGet('SELECT COUNT(*) c FROM stat_events')).c;
console.log(`Demo hazir: ${done} voleybol maci oynandi, 1 mac CANLI, ${evc} istatistik olayi uretildi.`);
process.exit(0);
