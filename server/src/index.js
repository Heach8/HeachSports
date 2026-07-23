import express from 'express';
import session from 'express-session';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { authRouter } from './auth.js';
import { publicRouter } from './routes-public.js';
import { captainRouter } from './routes-captain.js';
import { adminRouter } from './routes-admin.js';
import { liveRouter } from './routes-live.js';
import { sseHandler } from './live.js';
import { UPLOAD_DIR } from './uploads.js';
import { initSchema, IS_PG } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set('trust proxy', 1); // Render/Vercel gibi proxy arkasinda dogru IP/cookie davranisi
const PORT = process.env.PORT || 3001;

app.use((req, res, next) => {
  // /embed ve /overlay sayfalarinin baska sitelere iframe ile gomulmesine izin ver
  if (req.path.startsWith('/embed') || req.path.startsWith('/overlay')) {
    res.setHeader('Content-Security-Policy', 'frame-ancestors *');
  }
  next();
});
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'ncl-gizli-anahtar-degistirin',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 12 }
}));

app.use('/uploads', express.static(UPLOAD_DIR));
app.use('/logos', express.static(path.join(__dirname, '..', 'logos')));
app.get('/api/live/stream', sseHandler);
app.use('/api/auth', authRouter);
app.use('/api/live', liveRouter);
app.use('/api/captain', captainRouter);
app.use('/api/admin', adminRouter);
app.use('/api', publicRouter);

// Production: client build'ini sun
const dist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api|\/uploads|\/logos).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Sunucu hatasi' });
});

await initSchema();
app.listen(PORT, () => console.log(`NCL sunucusu http://localhost:${PORT} adresinde calisiyor (${IS_PG ? 'Supabase/PostgreSQL' : 'SQLite'})`));
