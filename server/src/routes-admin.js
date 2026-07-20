import { Router } from 'express';
import { qGet, qAll, qRun, qInsert, hashPassword, getSetting, setSetting, getActiveSeason } from './db.js';
import { requireRole, ah } from './auth.js';
import { upload } from './uploads.js';
import { SPORT_KEYS, sportOf } from './sports.js';
import { createKnockoutBracket } from './tournament.js';

export const adminRouter = Router();
adminRouter.use(requireRole('admin'));

// --- Onay kuyrugu ---
adminRouter.get('/approvals', ah(async (req, res) => {
  const rows = await qAll(`
    SELECT p.*, t.name AS team_name FROM players p JOIN teams t ON t.id = p.team_id
    WHERE p.status = 'pending' OR p.pending_changes IS NOT NULL
    ORDER BY p.created_at
  `);
  res.json({ approvals: rows.map(p => ({ ...p, pending_changes: p.pending_changes ? JSON.parse(p.pending_changes) : null })) });
}));

adminRouter.post('/approvals/:id/approve', ah(async (req, res) => {
  const p = await qGet('SELECT * FROM players WHERE id = ?', [req.params.id]);
  if (!p) return res.status(404).json({ error: 'Oyuncu bulunamadi' });
  if (p.pending_changes) {
    const changes = JSON.parse(p.pending_changes);
    if (changes._delete) {
      await qRun("UPDATE players SET status = 'rejected', pending_changes = NULL WHERE id = ?", [p.id]);
      return res.json({ ok: true, removed: true });
    }
    const allowed = ['first_name','last_name','height_cm','weight_kg','jersey_no','position','photo_path','national_id_hash','national_id_mask'];
    const keys = Object.keys(changes).filter(k => allowed.includes(k));
    if (keys.length) {
      const sets = keys.map(k => `${k} = ?`).join(', ');
      await qRun(`UPDATE players SET ${sets}, pending_changes = NULL WHERE id = ?`,
        [...keys.map(k => changes[k]), p.id]);
    } else {
      await qRun('UPDATE players SET pending_changes = NULL WHERE id = ?', [p.id]);
    }
    return res.json({ ok: true });
  }
  await qRun("UPDATE players SET status = 'approved' WHERE id = ?", [p.id]);
  res.json({ ok: true });
}));

adminRouter.post('/approvals/:id/reject', ah(async (req, res) => {
  const p = await qGet('SELECT * FROM players WHERE id = ?', [req.params.id]);
  if (!p) return res.status(404).json({ error: 'Oyuncu bulunamadi' });
  if (p.pending_changes) {
    await qRun('UPDATE players SET pending_changes = NULL WHERE id = ?', [p.id]);
  } else {
    await qRun("UPDATE players SET status = 'rejected' WHERE id = ?", [p.id]);
  }
  res.json({ ok: true });
}));

// --- Sezonlar ---
adminRouter.get('/seasons', ah(async (req, res) => {
  res.json({ seasons: await qAll('SELECT * FROM seasons ORDER BY id DESC') });
}));
adminRouter.post('/seasons', ah(async (req, res) => {
  const { name, sport, court_size } = req.body;
  if (!name) return res.status(400).json({ error: 'Sezon adi gerekli' });
  if (!SPORT_KEYS.includes(sport)) return res.status(400).json({ error: 'Gecersiz brans' });
  let cs = Number(court_size) || null;
  if (cs !== null && (cs < 2 || cs > 11)) return res.status(400).json({ error: 'Saha ici oyuncu sayisi 2-11 arasinda olmali' });
  // Futbol kart kurallari (0/bos = kural kapali)
  const yl = Number(req.body.yellow_limit) || 0;
  const rb = req.body.red_ban ? 1 : 0;
  const format = ['league', 'groups_knockout', 'knockout'].includes(req.body.format) ? req.body.format : 'league';
  // Basketbol kurallari
  const fl = Number(req.body.foul_limit) || 0;
  const pc = [2, 4].includes(Number(req.body.period_count)) ? Number(req.body.period_count) : null;
  const gc = format === 'groups_knockout' ? Math.max(2, Math.min(8, Number(req.body.group_count) || 2)) : null;
  const ac = format === 'groups_knockout' ? Math.max(1, Math.min(4, Number(req.body.advance_count) || 2)) : null;
  const tl = format !== 'league' && req.body.two_legged ? 1 : 0;
  const fee = Number(req.body.entry_fee) > 0 ? Number(req.body.entry_fee) : null;
  const id = await qInsert(
    'INSERT INTO seasons (name, sport, court_size, yellow_limit, red_ban, foul_limit, period_count, two_legged, entry_fee, format, group_count, advance_count, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)',
    [name, sport, cs, yl, rb, fl, pc, tl, fee, format, gc, ac]);
  res.json({ id });
}));
adminRouter.post('/seasons/:id/activate', ah(async (req, res) => {
  const season = await qGet('SELECT * FROM seasons WHERE id = ?', [req.params.id]);
  if (!season) return res.status(404).json({ error: 'Sezon bulunamadi' });
  await qRun('UPDATE seasons SET is_active = 0 WHERE sport = ?', [season.sport]);
  await qRun('UPDATE seasons SET is_active = 1 WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

// --- Takimlar ---
adminRouter.post('/teams', upload.fields([{ name: 'logo', maxCount: 1 }]), ah(async (req, res) => {
  const { name, company, season_id, sport } = req.body;
  const sid = season_id || (await getActiveSeason(sport || 'volleyball'))?.id;
  if (!name || !sid) return res.status(400).json({ error: 'Takim adi ve sezon gerekli' });
  const logo = req.files?.logo?.[0];
  const id = await qInsert('INSERT INTO teams (season_id, name, company, logo_path) VALUES (?, ?, ?, ?)',
    [sid, name, company || null, logo ? '/uploads/' + logo.filename : null]);
  res.json({ id });
}));
adminRouter.delete('/teams/:id', ah(async (req, res) => {
  const hasMatch = (await qGet(
    'SELECT COUNT(*) AS c FROM matches WHERE home_team_id = ? OR away_team_id = ?',
    [req.params.id, req.params.id])).c;
  if (hasMatch) return res.status(400).json({ error: 'Maci olan takim silinemez' });
  await qRun('DELETE FROM players WHERE team_id = ?', [req.params.id]);
  await qRun('DELETE FROM teams WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

adminRouter.get('/teams-all', ah(async (req, res) => {
  res.json({ teams: await qAll(`
    SELECT t.id, t.name, s.sport, s.name AS season_name
    FROM teams t JOIN seasons s ON s.id = t.season_id ORDER BY s.sport, t.name
  `) });
}));

// --- Kullanicilar ---
adminRouter.get('/users', ah(async (req, res) => {
  res.json({ users: await qAll(`
    SELECT u.id, u.email, u.name, u.role, u.team_id, t.name AS team_name
    FROM users u LEFT JOIN teams t ON t.id = u.team_id ORDER BY u.role, u.name
  `) });
}));
adminRouter.post('/users', ah(async (req, res) => {
  const { email, password, name, role, team_id } = req.body;
  if (!email || !password || !name || !role) return res.status(400).json({ error: 'Tum alanlar zorunlu' });
  if (role === 'super_admin' && req.session.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Super admin sadece super admin olusturabilir' });
  }
  if (role === 'captain' && !team_id) return res.status(400).json({ error: 'Kaptan icin takim secilmeli' });
  try {
    const id = await qInsert(
      'INSERT INTO users (email, password_hash, name, role, team_id, must_change_password) VALUES (?, ?, ?, ?, ?, 1)',
      [String(email).toLowerCase().trim(), hashPassword(password), name, role, role === 'captain' ? team_id : null]);
    res.json({ id, must_change_password: true });
  } catch {
    res.status(400).json({ error: 'Bu e-posta zaten kayitli' });
  }
}));
adminRouter.delete('/users/:id', ah(async (req, res) => {
  if (Number(req.params.id) === req.session.user.id) return res.status(400).json({ error: 'Kendinizi silemezsiniz' });
  await qRun("DELETE FROM users WHERE id = ? AND role != 'super_admin'", [req.params.id]);
  res.json({ ok: true });
}));

// --- Fikstur ---
adminRouter.post('/fixtures/generate', ah(async (req, res) => {
  const season = await getActiveSeason(SPORT_KEYS.includes(req.body.sport) ? req.body.sport : 'volleyball');
  if (!season) return res.status(400).json({ error: 'Aktif sezon yok' });
  const existing = (await qGet(
    "SELECT COUNT(*) AS c FROM matches WHERE season_id = ? AND status != 'scheduled'", [season.id])).c;
  if (existing) return res.status(400).json({ error: 'Oynanmis/canli mac var, fikstur yeniden olusturulamaz' });
  const teams = (await qAll('SELECT id FROM teams WHERE season_id = ?', [season.id])).map(t => t.id);
  if (teams.length < 2) return res.status(400).json({ error: 'En az 2 takim gerekli' });

  // --- Manuel kura (noter cekimi) dogrulamasi ---
  const teamSet = new Set(teams);
  const sameSet = (arr) => arr.length === teams.length && arr.every(t => teamSet.has(Number(t))) && new Set(arr.map(Number)).size === arr.length;
  let drawOrder = null, drawGroups = null;
  if (Array.isArray(req.body.draw_order) && req.body.draw_order.length) {
    const order = req.body.draw_order.map(Number);
    if (!sameSet(order)) return res.status(400).json({ error: 'Kura sirasi tum takimlari tam olarak bir kez icermeli' });
    drawOrder = order;
  }
  if (req.body.draw_groups && typeof req.body.draw_groups === 'object') {
    const flat = Object.values(req.body.draw_groups).flat().map(Number);
    if (!sameSet(flat)) return res.status(400).json({ error: 'Gruplara dagitim tum takimlari tam olarak bir kez icermeli' });
    for (const [g, arr] of Object.entries(req.body.draw_groups)) {
      if (!Array.isArray(arr) || arr.length < 2) return res.status(400).json({ error: `${g} grubunda en az 2 takim olmali` });
    }
    drawGroups = req.body.draw_groups;
  }

  await qRun('DELETE FROM matches WHERE season_id = ?', [season.id]);
  await qRun('UPDATE teams SET group_name = NULL WHERE season_id = ?', [season.id]);
  await qRun('UPDATE seasons SET knockout_byes = NULL WHERE id = ?', [season.id]);
  const bestOfKO = [3, 5].includes(Number(req.body.best_of)) ? Number(req.body.best_of) : (sportOf(season.sport).defaultBestOf || 5);

  // --- DIREKT ELEME ---
  if (season.format === 'knockout') {
    await createKnockoutBracket(season, drawOrder || teams, bestOfKO, 1, { ordered: !!drawOrder });
    return res.json({ ok: true, format: 'knockout', manual_draw: !!drawOrder });
  }

  // --- GRUPLAR + ELEME: kura cek, grup ici lig fikstürleri ---
  if (season.format === 'groups_knockout') {
    const gc = season.group_count || 2;
    if (teams.length < gc * 2) return res.status(400).json({ error: `${gc} grup icin en az ${gc * 2} takim gerekli` });
    const letters = 'ABCDEFGH';
    let groups;
    if (drawGroups) {
      // Noter kurasindaki dagitim aynen uygulanir
      groups = Array.from({ length: gc }, (_, g) => (drawGroups[letters[g]] || []).map(Number));
      if (groups.some(g => g.length < 2)) return res.status(400).json({ error: 'Her grupta en az 2 takim olmali (grup sayisi ayariyla uyumsuz dagitim)' });
    } else {
      const shuffled = [...teams].sort(() => Math.random() - .5);
      groups = Array.from({ length: gc }, () => []);
      shuffled.forEach((t, i) => groups[i % gc].push(t));
    }
    for (let g = 0; g < gc; g++) {
      for (const tid of groups[g]) {
        await qRun('UPDATE teams SET group_name = ? WHERE id = ?', [letters[g], tid]);
      }
      // grup ici tek devreli lig
      const ids = [...groups[g]];
      if (ids.length % 2 === 1) ids.push(null);
      const n = ids.length;
      let roundNo = 1;
      for (let r = 0; r < n - 1; r++) {
        for (let i = 0; i < n / 2; i++) {
          const a = ids[i], b = ids[n - 1 - i];
          if (a !== null && b !== null) {
            const [h, aw] = r % 2 === 0 ? [a, b] : [b, a];
            await qRun("INSERT INTO matches (season_id, round, home_team_id, away_team_id, best_of, stage) VALUES (?, ?, ?, ?, ?, 'group')",
              [season.id, roundNo, h, aw, bestOfKO]);
          }
        }
        roundNo++;
        ids.splice(1, 0, ids.pop());
      }
    }
    return res.json({ ok: true, format: 'groups_knockout', groups: gc });
  }

  const ids = [...(drawOrder || teams)];
  if (ids.length % 2 === 1) ids.push(null);
  const n = ids.length;
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = ids[i], b = ids[n - 1 - i];
      if (a !== null && b !== null) pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    ids.splice(1, 0, ids.pop());
  }
  const doubleRound = req.body.double_round === true;
  const bestOf = [3, 5].includes(Number(req.body.best_of)) ? Number(req.body.best_of) : (sportOf(season.sport).defaultBestOf || 5);
  let roundNo = 1;
  for (const pairs of rounds) {
    for (const [h, a] of pairs) {
      await qRun('INSERT INTO matches (season_id, round, home_team_id, away_team_id, best_of) VALUES (?, ?, ?, ?, ?)',
        [season.id, roundNo, h, a, bestOf]);
    }
    roundNo++;
  }
  if (doubleRound) {
    for (const pairs of rounds) {
      for (const [h, a] of pairs) {
        await qRun('INSERT INTO matches (season_id, round, home_team_id, away_team_id, best_of) VALUES (?, ?, ?, ?, ?)',
          [season.id, roundNo, a, h, bestOf]);
      }
      roundNo++;
    }
  }
  res.json({ ok: true, rounds: roundNo - 1 });
}));

adminRouter.put('/matches/:id', ah(async (req, res) => {
  const { scheduled_at } = req.body;
  await qRun('UPDATE matches SET scheduled_at = ? WHERE id = ?', [scheduled_at || null, req.params.id]);
  res.json({ ok: true });
}));

// --- Cezalar ---
adminRouter.get('/penalties', ah(async (req, res) => {
  res.json({ penalties: await qAll(`
    SELECT pe.*, p.first_name, p.last_name, t.name AS team_name
    FROM penalties pe JOIN players p ON p.id = pe.player_id JOIN teams t ON t.id = p.team_id
    ORDER BY pe.created_at DESC
  `) });
}));
adminRouter.post('/penalties', ah(async (req, res) => {
  const { player_id, match_id, type, ban_matches, note } = req.body;
  if (!player_id || !type) return res.status(400).json({ error: 'Oyuncu ve ceza turu gerekli' });
  const id = await qInsert('INSERT INTO penalties (player_id, match_id, type, ban_matches, note) VALUES (?, ?, ?, ?, ?)',
    [player_id, match_id || null, type, ban_matches || 0, note || null]);
  res.json({ id });
}));
adminRouter.delete('/penalties/:id', ah(async (req, res) => {
  await qRun('DELETE FROM penalties WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

// --- Tahsilat / Fatura ---
adminRouter.get('/billing', ah(async (req, res) => {
  const season = await getActiveSeason(SPORT_KEYS.includes(req.query.sport) ? req.query.sport : 'volleyball');
  if (!season) return res.json({ season: null, teams: [] });
  const teams = await qAll(`
    SELECT t.id, t.name, t.company, t.billing_title, t.tax_office, t.tax_number, t.billing_address, t.billing_email,
      COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.team_id = t.id), 0) AS paid
    FROM teams t WHERE t.season_id = ? ORDER BY t.name
  `, [season.id]);
  const payments = await qAll(`
    SELECT p.*, t.name AS team_name FROM payments p JOIN teams t ON t.id = p.team_id
    WHERE t.season_id = ? ORDER BY p.id DESC
  `, [season.id]);
  res.json({ season, teams, payments });
}));

adminRouter.put('/seasons/:id/fee', ah(async (req, res) => {
  const fee = Number(req.body.entry_fee);
  if (!(fee >= 0)) return res.status(400).json({ error: 'Gecerli bir ucret girin' });
  await qRun('UPDATE seasons SET entry_fee = ? WHERE id = ?', [fee || null, req.params.id]);
  res.json({ ok: true });
}));

adminRouter.put('/teams/:id/billing', ah(async (req, res) => {
  const f = req.body;
  await qRun(
    'UPDATE teams SET billing_title = ?, tax_office = ?, tax_number = ?, billing_address = ?, billing_email = ? WHERE id = ?',
    [f.billing_title || null, f.tax_office || null, f.tax_number || null, f.billing_address || null, f.billing_email || null, req.params.id]);
  res.json({ ok: true });
}));

adminRouter.post('/payments', ah(async (req, res) => {
  const { team_id, amount, method, paid_at, note, invoice_no } = req.body;
  if (!team_id || !(Number(amount) > 0)) return res.status(400).json({ error: 'Takim ve tutar zorunlu' });
  const m = ['havale', 'nakit', 'kart', 'diger'].includes(method) ? method : 'havale';
  const id = await qInsert(
    'INSERT INTO payments (team_id, amount, method, paid_at, note, invoice_no) VALUES (?, ?, ?, ?, ?, ?)',
    [team_id, Number(amount), m, paid_at || null, note || null, invoice_no || null]);
  res.json({ id });
}));

adminRouter.delete('/payments/:id', ah(async (req, res) => {
  await qRun('DELETE FROM payments WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

// --- Ayarlar ---
adminRouter.get('/settings', ah(async (req, res) => {
  res.json({ eligibility_check_enabled: (await getSetting('eligibility_check_enabled', '1')) === '1' });
}));
adminRouter.put('/settings', ah(async (req, res) => {
  if (req.body.eligibility_check_enabled !== undefined) {
    await setSetting('eligibility_check_enabled', req.body.eligibility_check_enabled ? '1' : '0');
  }
  res.json({ ok: true });
}));

adminRouter.get('/players', ah(async (req, res) => {
  res.json({ players: await qAll(`
    SELECT p.*, t.name AS team_name FROM players p JOIN teams t ON t.id = p.team_id ORDER BY t.name, p.jersey_no
  `) });
}));
