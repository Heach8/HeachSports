import { Router } from 'express';
import { qGet, qAll, qRun, qInsert, getSetting, validateNationalId, hashNationalId, maskNationalId } from './db.js';
import { requireRole, ah } from './auth.js';
import { upload } from './uploads.js';
import { sportOf } from './sports.js';

export const captainRouter = Router();
captainRouter.use(requireRole('captain'));

const EDITABLE = ['first_name', 'last_name', 'height_cm', 'weight_kg', 'jersey_no', 'position'];

async function ownPlayer(req, res) {
  const p = await qGet('SELECT * FROM players WHERE id = ?', [req.params.id]);
  if (!p || p.team_id !== req.session.user.team_id) {
    res.status(404).json({ error: 'Oyuncu bulunamadi' });
    return null;
  }
  return p;
}

captainRouter.get('/players', ah(async (req, res) => {
  const players = await qAll('SELECT * FROM players WHERE team_id = ? ORDER BY jersey_no', [req.session.user.team_id]);
  const row = await qGet(
    'SELECT s.sport FROM teams t JOIN seasons s ON s.id = t.season_id WHERE t.id = ?',
    [req.session.user.team_id]);
  const sport = row?.sport || 'volleyball';
  res.json({
    players: players.map(p => ({ ...p, pending_changes: p.pending_changes ? JSON.parse(p.pending_changes) : null })),
    eligibility_required: (await getSetting('eligibility_check_enabled', '1')) === '1',
    sport, sport_label: sportOf(sport).label
  });
}));

captainRouter.post('/players',
  upload.fields([{ name: 'photo', maxCount: 1 }, { name: 'eligibility_doc', maxCount: 1 }]),
  ah(async (req, res) => {
    const b = req.body;
    if (!b.first_name || !b.last_name) return res.status(400).json({ error: 'Ad ve soyad zorunlu' });
    if (b.kvkk_consent !== '1') return res.status(400).json({ error: 'KVKK acik riza onayi zorunlu' });
    const tc = String(b.national_id || '').trim();
    if (!validateNationalId(tc)) return res.status(400).json({ error: 'Gecerli bir T.C. kimlik numarasi girin (11 hane)' });
    const idHash = hashNationalId(tc);
    // Ayni sezonda (herhangi bir takimda) ayni kisi kayitli mi?
    const dup = await qGet(`
      SELECT p.id, t.name AS team_name FROM players p
      JOIN teams t ON t.id = p.team_id
      WHERE p.national_id_hash = ? AND p.status != 'rejected'
        AND t.season_id = (SELECT season_id FROM teams WHERE id = ?)
    `, [idHash, req.session.user.team_id]);
    if (dup) return res.status(400).json({ error: `Bu kimlik numarasi bu sezonda zaten kayitli (${dup.team_name})` });
    const eligibilityRequired = (await getSetting('eligibility_check_enabled', '1')) === '1';
    const doc = req.files?.eligibility_doc?.[0];
    if (eligibilityRequired && !doc) {
      return res.status(400).json({ error: 'Calisan belgesi zorunlu (uygunluk kontrolu acik)' });
    }
    const photo = req.files?.photo?.[0];
    const id = await qInsert(`
      INSERT INTO players (team_id, first_name, last_name, height_cm, weight_kg, jersey_no, position, photo_path, eligibility_doc_path, kvkk_consent, national_id_hash, national_id_mask, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 'pending')
    `, [
      req.session.user.team_id, b.first_name.trim(), b.last_name.trim(),
      b.height_cm ? Number(b.height_cm) : null, b.weight_kg ? Number(b.weight_kg) : null,
      b.jersey_no ? Number(b.jersey_no) : null, b.position || null,
      photo ? '/uploads/' + photo.filename : null,
      doc ? '/uploads/' + doc.filename : null,
      idHash, maskNationalId(tc)
    ]);
    res.json({ id, status: 'pending' });
  })
);

captainRouter.put('/players/:id', upload.fields([{ name: 'photo', maxCount: 1 }]), ah(async (req, res) => {
  const p = await ownPlayer(req, res);
  if (!p) return;
  const changes = {};
  for (const f of EDITABLE) {
    if (req.body[f] !== undefined && req.body[f] !== '') changes[f] = req.body[f];
  }
  const photo = req.files?.photo?.[0];
  if (photo) changes.photo_path = '/uploads/' + photo.filename;
  if (req.body.national_id) {
    const tc = String(req.body.national_id).trim();
    if (!validateNationalId(tc)) return res.status(400).json({ error: 'Gecerli bir T.C. kimlik numarasi girin' });
    changes.national_id_hash = hashNationalId(tc);
    changes.national_id_mask = maskNationalId(tc);
  }
  if (Object.keys(changes).length === 0) return res.status(400).json({ error: 'Degisiklik yok' });

  if (p.status === 'pending' || p.status === 'rejected') {
    const sets = Object.keys(changes).map(k => `${k} = ?`).join(', ');
    await qRun(`UPDATE players SET ${sets}, status = 'pending' WHERE id = ?`, [...Object.values(changes), p.id]);
    return res.json({ ok: true, direct: true });
  }
  await qRun('UPDATE players SET pending_changes = ? WHERE id = ?', [JSON.stringify(changes), p.id]);
  res.json({ ok: true, pending_approval: true });
}));

captainRouter.delete('/players/:id', ah(async (req, res) => {
  const p = await ownPlayer(req, res);
  if (!p) return;
  if (p.status !== 'approved') {
    await qRun('DELETE FROM stat_events WHERE player_id = ?', [p.id]);
    await qRun('DELETE FROM players WHERE id = ?', [p.id]);
    return res.json({ ok: true, deleted: true });
  }
  await qRun('UPDATE players SET pending_changes = ? WHERE id = ?', [JSON.stringify({ _delete: true }), p.id]);
  res.json({ ok: true, pending_approval: true });
}));
