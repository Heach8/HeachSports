import { Router } from 'express';
import { qGet, qAll, qRun, qInsert, hashPassword, getActiveSeason, resolveOrg, getSetting, setSetting } from './db.js';
import { requireRole, ah } from './auth.js';
import { upload } from './uploads.js';
import { SPORT_KEYS, sportOf } from './sports.js';
import { createKnockoutBracket } from './tournament.js';

export const adminRouter = Router();
adminRouter.use(requireRole('admin'));

// --- Onay kuyrugu ---
adminRouter.get('/approvals', ah(async (req, res) => {
  const org = await resolveOrg(req);
  const rows = await qAll(`
    SELECT p.*, t.name AS team_name FROM players p
    JOIN teams t ON t.id = p.team_id
    JOIN seasons s ON s.id = t.season_id
    WHERE (p.status = 'pending' OR p.pending_changes IS NOT NULL) AND s.organization_id = ?
    ORDER BY p.created_at
  `, [org.id]);
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
  const org = await resolveOrg(req);
  res.json({ seasons: await qAll('SELECT * FROM seasons WHERE organization_id = ? ORDER BY id DESC', [org.id]) });
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
  const gm = format === 'groups_knockout' && Number(req.body.group_matches) >= 2
    ? Math.min(10, Number(req.body.group_matches)) : null; // null = tam lig
  const tl = format !== 'league' && req.body.two_legged ? 1 : 0;
  const fee = Number(req.body.entry_fee) > 0 ? Number(req.body.entry_fee) : null;
  const org = await resolveOrg(req);
  const isSuper = req.session.user.role === 'super_admin';

  // Platform ucreti: sezon acmak takim basi ucretlidir (super admin haric)
  const unitPrice = Number(await getSetting('platform_team_price', '0')) || 0;
  const quota = Math.max(2, Math.min(64, Number(req.body.team_quota) || 0));
  let approval = 'approved', payMethod = null, platformFee = 0;
  if (!isSuper && unitPrice > 0) {
    if (!req.body.team_quota) return res.status(400).json({ error: 'Takim sayisi (kontenjan) secilmeli' });
    payMethod = ['havale', 'nakit', 'kart'].includes(req.body.payment_method) ? req.body.payment_method : null;
    if (!payMethod) return res.status(400).json({ error: 'Odeme yontemi secilmeli (havale/nakit/kart)' });
    platformFee = unitPrice * quota;
    // Kart: odeme sistemden alinir, sezon aninda kullanilabilir.
    // (POS entegrasyonuna hazir: simdilik test modunda odeme basarili kabul edilir)
    // Havale/Nakit: super admin onayina duser.
    approval = payMethod === 'kart' ? 'approved' : 'pending';
  }

  const id = await qInsert(
    'INSERT INTO seasons (organization_id, name, sport, court_size, yellow_limit, red_ban, foul_limit, period_count, two_legged, entry_fee, format, group_count, advance_count, group_matches, approval_status, payment_method, team_quota, platform_fee, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)',
    [org.id, name, sport, cs, yl, rb, fl, pc, tl, fee, format, gc, ac, gm, approval, payMethod, req.body.team_quota ? quota : null, platformFee || null]);
  if (!isSuper && unitPrice > 0) {
    await qInsert(
      'INSERT INTO platform_payments (organization_id, season_id, amount, method, status, note) VALUES (?, ?, ?, ?, ?, ?)',
      [org.id, id, platformFee, payMethod, payMethod === 'kart' ? 'paid' : 'pending',
       payMethod === 'kart' ? 'Kart ile online odeme (test modu)' : 'Super admin onayi bekleniyor']);
  }
  res.json({ id, approval_status: approval, platform_fee: platformFee });
}));
adminRouter.post('/seasons/:id/activate', ah(async (req, res) => {
  const season = await qGet('SELECT * FROM seasons WHERE id = ?', [req.params.id]);
  if (!season) return res.status(404).json({ error: 'Sezon bulunamadi' });
  if (season.approval_status !== 'approved') {
    return res.status(400).json({ error: 'Bu sezon henuz onaylanmadi: odeme onayi sonrasi kullanilabilir' });
  }
  await qRun('UPDATE seasons SET is_active = 0 WHERE sport = ? AND organization_id = ?', [season.sport, season.organization_id]);
  await qRun('UPDATE seasons SET is_active = 1 WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

// --- Takimlar ---
adminRouter.post('/teams', upload.fields([{ name: 'logo', maxCount: 1 }]), ah(async (req, res) => {
  const { name, company, season_id, sport } = req.body;
  const org = await resolveOrg(req);
  const sid = season_id || (await getActiveSeason(sport || 'volleyball', org.id))?.id;
  if (!name || !sid) return res.status(400).json({ error: 'Takim adi ve sezon gerekli' });
  const seasonRow = await qGet('SELECT * FROM seasons WHERE id = ?', [sid]);
  if (seasonRow?.approval_status !== 'approved') {
    return res.status(400).json({ error: 'Sezon onaylanmadan takim eklenemez' });
  }
  if (seasonRow.team_quota) {
    const cnt = (await qGet('SELECT COUNT(*) AS c FROM teams WHERE season_id = ?', [sid])).c;
    if (cnt >= seasonRow.team_quota) {
      return res.status(400).json({ error: `Kontenjan dolu (${seasonRow.team_quota} takim). Ek takim icin super admin ile iletisime gecin.` });
    }
  }
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
  const org = await resolveOrg(req);
  res.json({ teams: await qAll(`
    SELECT t.id, t.name, s.sport, s.name AS season_name
    FROM teams t JOIN seasons s ON s.id = t.season_id
    WHERE s.organization_id = ? ORDER BY s.sport, t.name
  `, [org.id]) });
}));

// --- Kullanicilar ---
adminRouter.get('/users', ah(async (req, res) => {
  const org = await resolveOrg(req);
  res.json({ users: await qAll(`
    SELECT u.id, u.email, u.name, u.role, u.team_id, t.name AS team_name
    FROM users u LEFT JOIN teams t ON t.id = u.team_id
    WHERE u.organization_id = ? OR u.role = 'super_admin' ORDER BY u.role, u.name
  `, [org.id]) });
}));
adminRouter.post('/users', ah(async (req, res) => {
  const { email, password, name, role, team_id } = req.body;
  if (!email || !password || !name || !role) return res.status(400).json({ error: 'Tum alanlar zorunlu' });
  if (role === 'super_admin' && req.session.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Super admin sadece super admin olusturabilir' });
  }
  if (role === 'captain' && !team_id) return res.status(400).json({ error: 'Kaptan icin takim secilmeli' });
  try {
    const org = await resolveOrg(req);
    const id = await qInsert(
      'INSERT INTO users (email, password_hash, name, role, organization_id, team_id, must_change_password) VALUES (?, ?, ?, ?, ?, ?, 1)',
      [String(email).toLowerCase().trim(), hashPassword(password), name, role, role === 'super_admin' ? null : org.id, role === 'captain' ? team_id : null]);
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
  const org = await resolveOrg(req);
  const season = await getActiveSeason(SPORT_KEYS.includes(req.body.sport) ? req.body.sport : 'volleyball', org.id);
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
      const K = season.group_matches;
      if (K && K < groups[g].length - 1) {
        // KURA USULU: her takim gruptan K farkli rakiple oynar (dengeli cember eslemesi).
        // Kura sirasi cemberi belirler: manuel noter kurasinda cekilis sirasi aynen kullanilir.
        const ring = [...groups[g]];
        const n = ring.length;
        if ((K * n) % 2 === 1) {
          return res.status(400).json({ error: `${letters[g]} grubunda ${n} takimla takim basi ${K} mac kurulamaz (tek sayi carpimi). Takim veya mac sayisini degistirin.` });
        }
        const pairs = [];
        for (let d = 1; d <= Math.floor(K / 2); d++) {
          for (let i = 0; i < n; i++) {
            const a = ring[i], b = ring[(i + d) % n];
            pairs.push(i % 2 === 0 ? [a, b] : [b, a]);
          }
        }
        if (K % 2 === 1) {
          const h = n / 2;
          for (let i = 0; i < h; i++) pairs.push([ring[i], ring[i + h]]);
        }
        // Haftalara dagit: ayni takim ayni haftada iki mac oynamasin
        const roundsArr = [];
        for (const [a, b] of pairs) {
          let r = 0;
          while (roundsArr[r] && roundsArr[r].some(([x, y]) => x === a || y === a || x === b || y === b)) r++;
          (roundsArr[r] = roundsArr[r] || []).push([a, b]);
        }
        for (let r = 0; r < roundsArr.length; r++) {
          for (const [h, aw] of roundsArr[r]) {
            await qRun("INSERT INTO matches (season_id, round, home_team_id, away_team_id, best_of, stage) VALUES (?, ?, ?, ?, ?, 'group')",
              [season.id, r + 1, h, aw, bestOfKO]);
          }
        }
      } else {
        // TAM LIG: grup ici tek devreli round-robin
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
  const org = await resolveOrg(req);
  res.json({ penalties: await qAll(`
    SELECT pe.*, p.first_name, p.last_name, t.name AS team_name
    FROM penalties pe JOIN players p ON p.id = pe.player_id JOIN teams t ON t.id = p.team_id
    JOIN seasons s ON s.id = t.season_id WHERE s.organization_id = ?
    ORDER BY pe.created_at DESC
  `, [org.id]) });
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
  const org = await resolveOrg(req);
  const season = await getActiveSeason(SPORT_KEYS.includes(req.query.sport) ? req.query.sport : 'volleyball', org.id);
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
  const org = await resolveOrg(req);
  res.json({ eligibility_check_enabled: org.eligibility_required === 1 });
}));
adminRouter.put('/settings', ah(async (req, res) => {
  const org = await resolveOrg(req);
  if (req.body.eligibility_check_enabled !== undefined) {
    await qRun('UPDATE organizations SET eligibility_required = ? WHERE id = ?',
      [req.body.eligibility_check_enabled ? 1 : 0, org.id]);
  }
  res.json({ ok: true });
}));

// --- Platform: birim fiyat (tum adminler okur) ---
adminRouter.get('/platform-price', ah(async (req, res) => {
  res.json({ platform_team_price: Number(await getSetting('platform_team_price', '0')) || 0 });
}));

// --- Platform yonetimi (sadece super admin) ---
adminRouter.get('/platform', ah(async (req, res) => {
  if (req.session.user.role !== 'super_admin') return res.status(403).json({ error: 'Yetkisiz' });
  const pending = await qAll(`
    SELECT s.id, s.name, s.sport, s.team_quota, s.platform_fee, s.payment_method, o.name AS org_name
    FROM seasons s JOIN organizations o ON o.id = s.organization_id
    WHERE s.approval_status = 'pending' ORDER BY s.id DESC
  `);
  const payments = await qAll(`
    SELECT p.*, o.name AS org_name, s.name AS season_name
    FROM platform_payments p
    JOIN organizations o ON o.id = p.organization_id
    LEFT JOIN seasons s ON s.id = p.season_id
    ORDER BY p.id DESC LIMIT 100
  `);
  res.json({
    platform_team_price: Number(await getSetting('platform_team_price', '0')) || 0,
    pending, payments
  });
}));

adminRouter.put('/platform/price', ah(async (req, res) => {
  if (req.session.user.role !== 'super_admin') return res.status(403).json({ error: 'Yetkisiz' });
  const p = Number(req.body.platform_team_price);
  if (!(p >= 0)) return res.status(400).json({ error: 'Gecerli fiyat girin' });
  await setSetting('platform_team_price', String(p));
  res.json({ ok: true });
}));

adminRouter.post('/platform/seasons/:id/approve', ah(async (req, res) => {
  if (req.session.user.role !== 'super_admin') return res.status(403).json({ error: 'Yetkisiz' });
  await qRun("UPDATE seasons SET approval_status = 'approved' WHERE id = ?", [req.params.id]);
  await qRun("UPDATE platform_payments SET status = 'paid', note = 'Super admin onayladi (odeme alindi)' WHERE season_id = ? AND status = 'pending'", [req.params.id]);
  res.json({ ok: true });
}));

adminRouter.post('/platform/seasons/:id/reject', ah(async (req, res) => {
  if (req.session.user.role !== 'super_admin') return res.status(403).json({ error: 'Yetkisiz' });
  await qRun("UPDATE seasons SET approval_status = 'rejected' WHERE id = ?", [req.params.id]);
  await qRun("UPDATE platform_payments SET status = 'rejected' WHERE season_id = ? AND status = 'pending'", [req.params.id]);
  res.json({ ok: true });
}));

// --- Organizasyonlar (sadece super admin) ---
adminRouter.get('/organizations', ah(async (req, res) => {
  if (req.session.user.role !== 'super_admin') return res.status(403).json({ error: 'Yetkisiz' });
  res.json({ organizations: await qAll('SELECT * FROM organizations ORDER BY id') });
}));
adminRouter.post('/organizations', ah(async (req, res) => {
  if (req.session.user.role !== 'super_admin') return res.status(403).json({ error: 'Yetkisiz' });
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Organizasyon adi gerekli' });
  const slug = (req.body.slug || name).toLowerCase()
    .replaceAll('ı','i').replaceAll('ğ','g').replaceAll('ü','u').replaceAll('ş','s').replaceAll('ö','o').replaceAll('ç','c')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  try {
    const id = await qInsert('INSERT INTO organizations (name, slug) VALUES (?, ?)', [name, slug]);
    res.json({ id, slug });
  } catch {
    res.status(400).json({ error: 'Bu kisa ad (slug) zaten kullanimda' });
  }
}));

adminRouter.get('/players', ah(async (req, res) => {
  const org = await resolveOrg(req);
  res.json({ players: await qAll(`
    SELECT p.*, t.name AS team_name FROM players p JOIN teams t ON t.id = p.team_id
    JOIN seasons s ON s.id = t.season_id WHERE s.organization_id = ?
    ORDER BY t.name, p.jersey_no
  `, [org.id]) });
}));
