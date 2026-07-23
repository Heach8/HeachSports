import { Router } from 'express';
import { qGet, qRun, qInsert, verifyPassword, hashPassword, validateNationalId } from './db.js';

export const authRouter = Router();

export function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Giris yapmalisiniz' });
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    const u = req.session.user;
    if (!u) return res.status(401).json({ error: 'Giris yapmalisiniz' });
    if (u.role === 'super_admin' || roles.includes(u.role)) return next();
    return res.status(403).json({ error: 'Bu islem icin yetkiniz yok' });
  };
}

// Async handler'larda hatalari yakala
export const ah = (fn) => (req, res, next) => fn(req, res, next).catch(next);

authRouter.post('/login', ah(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'E-posta ve sifre gerekli' });
  const user = await qGet('SELECT * FROM users WHERE email = ?', [String(email).toLowerCase().trim()]);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'E-posta veya sifre hatali' });
  }
  req.session.user = {
    id: user.id, email: user.email, name: user.name, role: user.role,
    organization_id: user.organization_id || null,
    team_id: user.team_id, must_change_password: user.must_change_password === 1
  };
  res.json({ user: req.session.user });
}));

authRouter.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

authRouter.get('/me', (req, res) => {
  res.json({ user: req.session.user || null });
});

// Ucretsiz organizasyon (turnuva duzenleyici) kaydi
authRouter.post('/register', ah(async (req, res) => {
  const b = req.body || {};
  const accountType = b.account_type === 'company' ? 'company' : 'individual';
  const orgName = String(b.org_name || '').trim();
  const contactName = String(b.contact_name || '').trim();
  const taxId = String(b.tax_id || '').replace(/\s/g, '');
  const address = String(b.address || '').trim();
  const email = String(b.email || '').toLowerCase().trim();
  const password = String(b.password || '');

  if (!orgName || orgName.length < 3) return res.status(400).json({ error: 'Organizasyon/turnuva adi en az 3 karakter olmali' });
  if (!contactName || !contactName.includes(' ')) return res.status(400).json({ error: 'Ad ve soyad zorunludur' });
  if (!address || address.length < 10) return res.status(400).json({ error: 'Acik adres zorunludur (fatura icin)' });
  if (accountType === 'individual') {
    if (!validateNationalId(taxId)) return res.status(400).json({ error: 'Gecerli bir T.C. kimlik numarasi girin (11 hane)' });
  } else {
    if (!/^[0-9]{10}$/.test(taxId)) return res.status(400).json({ error: 'Gecerli bir vergi kimlik numarasi girin (10 hane)' });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Gecerli bir e-posta girin' });
  if (password.length < 6) return res.status(400).json({ error: 'Sifre en az 6 karakter olmali' });
  if (password !== b.password_confirm) return res.status(400).json({ error: 'Sifreler eslesmiyor' });
  if (await qGet('SELECT id FROM users WHERE email = ?', [email])) {
    return res.status(400).json({ error: 'Bu e-posta zaten kayitli' });
  }

  // Slug uret (benzersiz)
  let slug = orgName.toLowerCase()
    .replaceAll('ı','i').replaceAll('ğ','g').replaceAll('ü','u').replaceAll('ş','s').replaceAll('ö','o').replaceAll('ç','c')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'org';
  let final = slug, n = 1;
  while (await qGet('SELECT id FROM organizations WHERE slug = ?', [final])) final = slug + '-' + (++n);

  const orgId = await qInsert(
    'INSERT INTO organizations (name, slug, account_type, tax_id, contact_name, address) VALUES (?, ?, ?, ?, ?, ?)',
    [orgName, final, accountType, taxId, contactName, address]);
  const userId = await qInsert(
    'INSERT INTO users (email, password_hash, name, role, organization_id, must_change_password) VALUES (?, ?, ?, ?, ?, 0)',
    [email, hashPassword(password), contactName, 'admin', orgId]);

  req.session.user = { id: userId, email, name: contactName, role: 'admin', organization_id: orgId, team_id: null, must_change_password: false };
  res.json({ user: req.session.user, org: { slug: final, name: orgName } });
}));

// Ilk giriste zorunlu sifre degistirme
authRouter.post('/change-password', requireAuth, ah(async (req, res) => {
  const { password, password_confirm } = req.body || {};
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Sifre en az 6 karakter olmali' });
  }
  if (password !== password_confirm) {
    return res.status(400).json({ error: 'Sifreler eslesmiyor' });
  }
  await qRun('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?',
    [hashPassword(password), req.session.user.id]);
  req.session.user.must_change_password = false;
  res.json({ ok: true, user: req.session.user });
}));
