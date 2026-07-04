import { Router } from 'express';
import { qGet, qRun, verifyPassword, hashPassword } from './db.js';

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
