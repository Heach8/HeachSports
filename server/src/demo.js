// Demo turnuvalar: her organizasyonda tamamlanmis bir arsiv sezonu + devam eden (canli macli) aktif sezon
import { initSchema, qGet, qAll, qRun, qInsert } from './db.js';

try { await initSchema(); } catch { process.exit(1); }

const day = 86400000;
const iso = (t) => new Date(t).toISOString().slice(0, 16).replace('T', ' ');
const now = Date.now();
const rnd = (n) => Math.floor(Math.random() * n);
const pickPlayer = (list) => list[Math.min(rnd(list.length), rnd(list.length))];
const roster = async (tid) => (await qAll("SELECT id FROM players WHERE team_id = ? AND status = 'approved'", [tid])).map(p => p.id);

const insEv = (matchId, setNo, tid, pid, type, date, points = 1, detail = null, relatedId = null) => qInsert(
  'INSERT INTO stat_events (match_id, set_no, team_id, player_id, type, points, created_at, detail, related_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  [matchId, setNo, tid, pid, type, points, date, detail, relatedId]);

function rrRounds(ids) {
  const arr = [...ids]; const rounds = [];
  for (let r = 0; r < arr.length - 1; r++) {
    const pairs = [];
    for (let i = 0; i < arr.length / 2; i++) {
      const a = arr[i], b = arr[arr.length - 1 - i];
      pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs); arr.splice(1, 0, arr.pop());
  }
  return rounds;
}

async function createMatches(season, baseTime, liveRoundOffset) {
  const teams = (await qAll('SELECT id FROM teams WHERE season_id = ?', [season.id])).map(t => t.id);
  const rounds = rrRounds(teams);
  const out = [];
  for (let i = 0; i < rounds.length; i++) {
    for (const [h, a] of rounds[i]) {
      const id = await qInsert(
        'INSERT INTO matches (season_id, round, home_team_id, away_team_id, best_of, scheduled_at) VALUES (?, ?, ?, ?, 5, ?)',
        [season.id, i + 1, h, a, iso(baseTime + i * 5 * day)]);
      out.push({ id, round: i + 1, home: h, away: a });
    }
  }
  return out;
}

// --- VOLEYBOL SIMULASYONU ---
const vType = () => { const x = Math.random(); return x < .52 ? 'attack' : x < .66 ? 'block' : x < .78 ? 'ace' : 'opp_error'; };
async function vPlaySet(mid, setNo, homeId, awayId, hr, ar, edge, date, target = 25) {
  let h = 0, a = 0;
  while (true) {
    const hs = Math.random() < edge;
    const type = vType();
    const [tid, list, otid, olist] = hs ? [homeId, hr, awayId, ar] : [awayId, ar, homeId, hr];
    await insEv(mid, setNo, tid, type === 'opp_error' ? null : pickPlayer(list), type, date);
    if (type === 'ace') await insEv(mid, setNo, otid, pickPlayer(olist), 'rec_err', date, 0);
    else if (Math.random() < 0.55) await insEv(mid, setNo, otid, pickPlayer(olist), 'rec_ok', date, 0);
    if (type === 'attack' && Math.random() < 0.3) await insEv(mid, setNo, otid, pickPlayer(olist), 'dig', date, 0);
    hs ? h++ : a++;
    if ((h >= target || a >= target) && Math.abs(h - a) >= 2) break;
    if (h >= target + 8 || a >= target + 8) break;
  }
  return [h, a];
}
async function vFinishMatch(m, edge, date) {
  const hr = await roster(m.home), ar = await roster(m.away);
  let hs = 0, as = 0, setNo = 1;
  while (hs < 3 && as < 3) {
    const [h, a] = await vPlaySet(m.id, setNo, m.home, m.away, hr, ar, edge, date, setNo === 5 ? 15 : 25);
    await qRun('INSERT INTO match_sets (match_id, set_no, home_points, away_points, finished, started_at) VALUES (?, ?, ?, ?, 1, ?)', [m.id, setNo, h, a, date]);
    h > a ? hs++ : as++; setNo++;
  }
  const winner = hs > as ? m.home : m.away;
  const mvp = await qGet("SELECT player_id FROM stat_events WHERE match_id = ? AND team_id = ? AND player_id IS NOT NULL AND points > 0 GROUP BY player_id ORDER BY COUNT(*) DESC LIMIT 1", [m.id, winner]);
  await qRun("UPDATE matches SET status = 'finished', home_sets = ?, away_sets = ?, mvp_player_id = ? WHERE id = ?", [hs, as, mvp?.player_id || null, m.id]);
}
async function vSeason(season, mode, baseTime) {
  if ((await qGet('SELECT COUNT(*) c FROM matches WHERE season_id = ?', [season.id])).c) return;
  const ms = await createMatches(season, baseTime);
  const edges = [0.56, 0.47, 0.53, 0.58, 0.5, 0.55];
  const playRounds = mode === 'finished' ? 99 : 2;
  for (let i = 0; i < ms.length; i++) {
    if (ms[i].round <= playRounds) await vFinishMatch(ms[i], edges[i % edges.length], iso(baseTime + (ms[i].round - 1) * 5 * day));
  }
  if (mode === 'ongoing') {
    const live = ms.find(m => m.round === 3);
    const hr = await roster(live.home), ar = await roster(live.away);
    await qRun("UPDATE matches SET status = 'live' WHERE id = ?", [live.id]);
    const [s1h, s1a] = await vPlaySet(live.id, 1, live.home, live.away, hr, ar, 0.55, iso(now));
    await qRun('INSERT INTO match_sets (match_id, set_no, home_points, away_points, finished, started_at) VALUES (?, 1, ?, ?, 1, ?)', [live.id, s1h, s1a, iso(now - 50 * 60000)]);
    const [s2h, s2a] = await vPlaySet(live.id, 2, live.home, live.away, hr, ar, 0.44, iso(now));
    await qRun('INSERT INTO match_sets (match_id, set_no, home_points, away_points, finished, started_at) VALUES (?, 2, ?, ?, 1, ?)', [live.id, s2h, s2a, iso(now - 25 * 60000)]);
    const hSets = (s1h > s1a ? 1 : 0) + (s2h > s2a ? 1 : 0);
    await qRun('UPDATE matches SET home_sets = ?, away_sets = ? WHERE id = ?', [hSets, 2 - hSets, live.id]);
    let ch = 0, ca = 0;
    while (ch + ca < 25) {
      const hs = Math.random() < 0.55;
      const type = vType();
      const [tid, list, otid, olist] = hs ? [live.home, hr, live.away, ar] : [live.away, ar, live.home, hr];
      await insEv(live.id, 3, tid, type === 'opp_error' ? null : pickPlayer(list), type, iso(now));
      if (type === 'ace') await insEv(live.id, 3, otid, pickPlayer(olist), 'rec_err', iso(now), 0);
      else if (Math.random() < 0.55) await insEv(live.id, 3, otid, pickPlayer(olist), 'rec_ok', iso(now), 0);
      hs ? ch++ : ca++;
    }
    await qRun('INSERT INTO match_sets (match_id, set_no, home_points, away_points, finished, started_at) VALUES (?, 3, ?, ?, 0, ?)', [live.id, ch, ca, iso(now - 10 * 60000)]);
  }
}

// --- FUTBOL SIMULASYONU ---
const gDetail = () => { const x = Math.random(); return x < .45 ? 'right_foot' : x < .75 ? 'left_foot' : x < .9 ? 'head' : x < .95 ? 'penalty' : 'other'; };
async function fPlayHalf(mid, half, m, hr, ar, halfStart) {
  let hh = 0, ha = 0;
  const goals = rnd(4);
  for (let g = 0; g < goals; g++) {
    const hs = Math.random() < 0.55;
    const [tid, list] = hs ? [m.home, hr] : [m.away, ar];
    const scorer = pickPlayer(list.slice(3));
    const gTime = iso(halfStart + (2 + rnd(26)) * 60000);
    const gid = await insEv(mid, half, tid, scorer, 'goal', gTime, 1, gDetail());
    if (Math.random() < 0.7) {
      const assist = pickPlayer(list);
      if (assist !== scorer) await insEv(mid, half, tid, assist, 'assist', gTime, 0, null, gid);
    }
    hs ? hh++ : ha++;
  }
  await insEv(mid, half, m.home, hr[0], 'save', iso(halfStart), 0);
  await insEv(mid, half, m.away, ar[0], 'save', iso(halfStart), 0);
  if (Math.random() < 0.6) await insEv(mid, half, m.home, pickPlayer(hr), 'yellow_card', iso(halfStart), 0);
  if (Math.random() < 0.6) await insEv(mid, half, m.away, pickPlayer(ar), 'yellow_card', iso(halfStart), 0);
  return [hh, ha];
}
async function fFinishMatch(m, baseTime) {
  const hr = await roster(m.home), ar = await roster(m.away);
  let th = 0, ta = 0;
  for (const half of [1, 2]) {
    const halfStart = baseTime + (half - 1) * 35 * 60000;
    const [hh, ha] = await fPlayHalf(m.id, half, m, hr, ar, halfStart);
    await qRun('INSERT INTO match_sets (match_id, set_no, home_points, away_points, finished, started_at) VALUES (?, ?, ?, ?, 1, ?)', [m.id, half, hh, ha, iso(halfStart)]);
    th += hh; ta += ha;
  }
  const winner = th > ta ? m.home : ta > th ? m.away : null;
  let mvpId = null;
  if (winner) {
    const top = await qGet("SELECT player_id FROM stat_events WHERE match_id = ? AND team_id = ? AND type = 'goal' AND player_id IS NOT NULL GROUP BY player_id ORDER BY COUNT(*) DESC LIMIT 1", [m.id, winner]);
    mvpId = top?.player_id || null;
  }
  await qRun("UPDATE matches SET status = 'finished', home_sets = ?, away_sets = ?, mvp_player_id = ? WHERE id = ?", [th, ta, mvpId, m.id]);
}
async function fSeason(season, mode, baseTime) {
  if ((await qGet('SELECT COUNT(*) c FROM matches WHERE season_id = ?', [season.id])).c) return;
  const ms = await createMatches(season, baseTime);
  const playRounds = mode === 'finished' ? 99 : 2;
  for (const m of ms) {
    if (m.round <= playRounds) await fFinishMatch(m, baseTime + (m.round - 1) * 5 * day);
  }
  if (mode === 'ongoing') {
    const live = ms.find(m => m.round === 3);
    const hr = await roster(live.home), ar = await roster(live.away);
    await qRun("UPDATE matches SET status = 'live' WHERE id = ?", [live.id]);
    const p1Start = now - 40 * 60000;
    const [h1, a1] = await fPlayHalf(live.id, 1, live, hr, ar, p1Start);
    await qRun('INSERT INTO match_sets (match_id, set_no, home_points, away_points, finished, started_at) VALUES (?, 1, ?, ?, 1, ?)', [live.id, h1, a1, iso(p1Start)]);
    const p2Start = now - 12 * 60000;
    // 2. devre: 1 gol + acik periyot
    const scorer = pickPlayer(hr.slice(3));
    const gid = await insEv(live.id, 2, live.home, scorer, 'goal', iso(p2Start + 8 * 60000), 1, gDetail());
    await insEv(live.id, 2, live.home, pickPlayer(hr), 'assist', iso(p2Start + 8 * 60000), 0, null, gid);
    await qRun('INSERT INTO match_sets (match_id, set_no, home_points, away_points, finished, started_at) VALUES (?, 2, 1, 0, 0, ?)', [live.id, iso(p2Start)]);
  }
}

// === CALISTIR: her org icin arsiv (bitmis) + aktif (devam eden) ===
const orgs = await qAll('SELECT * FROM organizations ORDER BY id');
for (const org of orgs) {
  const seasons = await qAll('SELECT * FROM seasons WHERE organization_id = ? ORDER BY id', [org.id]);
  for (const season of seasons) {
    const mode = season.is_active ? 'ongoing' : 'finished';
    const baseTime = season.is_active ? now - 12 * day : now - 120 * day;
    if (season.sport === 'volleyball') await vSeason(season, mode, baseTime);
    else if (season.sport === 'football') await fSeason(season, mode, baseTime);
  }
  console.log(`${org.name}: arşiv sezonu tamamlandı + aktif sezon canlı maçla hazır.`);
}
// Tahsilat ornegi (Marmara aktif sezon)
const mAct = await qGet("SELECT s.* FROM seasons s JOIN organizations o ON o.id = s.organization_id WHERE o.slug = 'marmara' AND s.is_active = 1");
if (mAct && !mAct.entry_fee) {
  await qRun('UPDATE seasons SET entry_fee = 15000 WHERE id = ?', [mAct.id]);
  const t1 = await qGet('SELECT id FROM teams WHERE season_id = ? ORDER BY id LIMIT 1', [mAct.id]);
  await qRun("INSERT INTO payments (team_id, amount, method, paid_at, invoice_no) VALUES (?, 15000, 'havale', ?, 'MSL-2026-001')", [t1.id, iso(now - 5 * day).slice(0, 10)]);
}
const evc = (await qGet('SELECT COUNT(*) c FROM stat_events')).c;
console.log(`Demo hazir: toplam ${evc} istatistik olayi.`);
process.exit(0);
