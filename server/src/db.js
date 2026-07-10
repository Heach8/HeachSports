// Veritabani katmani: DATABASE_URL varsa PostgreSQL (Supabase), yoksa SQLite.
// Tum sorgular async yardimcilarla calisir: qAll, qGet, qRun, qInsert
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Basit .env yukleyici (server/.env) ---
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i > 0 && !process.env[t.slice(0, i)]) {
      process.env[t.slice(0, i)] = t.slice(i + 1).trim();
    }
  }
}

export let IS_PG = false;

let pool = null;   // pg
let sqlite = null; // node:sqlite

const maskPw = (cs) => cs.replace(/:[^:@/]+@/, ':****@');

// Supabase icin baglanti adaylari: dogrudan adres + pooler varyantlari
function pgCandidates(url) {
  const out = [url];
  const m = url.match(/^postgresql:\/\/postgres:(.*)@db\.([a-z0-9]+)\.supabase\.co:\d+\/postgres$/);
  if (m) {
    const [, pw, ref] = m;
    for (const host of ['aws-0-eu-central-1', 'aws-1-eu-central-1']) {
      for (const port of [5432, 6543]) {
        out.push(`postgresql://postgres.${ref}:${pw}@${host}.pooler.supabase.com:${port}/postgres`);
      }
    }
  }
  return out;
}

async function tryPostgres() {
  if (!process.env.DATABASE_URL) return null;
  const { default: pg } = await import('pg');
  pg.types.setTypeParser(20, v => parseInt(v, 10));
  pg.types.setTypeParser(1700, v => parseFloat(v));
  for (const cs of pgCandidates(process.env.DATABASE_URL)) {
    const p = new pg.Pool({
      connectionString: cs,
      ssl: { rejectUnauthorized: false },
      max: 10,
      connectionTimeoutMillis: 6000
    });
    try {
      await p.query('SELECT 1');
      console.log('Veritabani: PostgreSQL (Supabase) ->', maskPw(cs));
      return p;
    } catch (e) {
      console.log('  baglanti denemesi basarisiz:', maskPw(cs), '|', e.code || e.message);
      await p.end().catch(() => {});
    }
  }
  return null;
}

pool = await tryPostgres();
if (pool) {
  IS_PG = true;
} else {
  if (process.env.DATABASE_URL) {
    console.log('');
    console.log('UYARI: Supabase baglantisi kurulamadi (tum adresler denendi).');
    console.log('Uygulama YEREL SQLite ile devam ediyor - veriler simdilik bu bilgisayarda tutulacak.');
    console.log('Supabase icin: Dashboard > Settings > Database > Connection string > "Session pooler"');
    console.log('adresini server/.env dosyasindaki DATABASE_URL satirina yapistirip yeniden baslatin.');
    console.log('');
  }
  const { DatabaseSync } = await import('node:sqlite');
  const DATA_DIR = path.join(__dirname, '..', 'data');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  sqlite = new DatabaseSync(path.join(DATA_DIR, 'ncl.sqlite'));
  sqlite.exec('PRAGMA foreign_keys = ON;');
  if (!process.env.DATABASE_URL) console.log('Veritabani: SQLite (yerel)');
}

// ? yer tutucularini PostgreSQL icin $1, $2... bicimine cevir
function toPg(sql) {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}

export async function qAll(sql, params = []) {
  if (IS_PG) return (await pool.query(toPg(sql), params)).rows;
  return sqlite.prepare(sql).all(...params);
}

export async function qGet(sql, params = []) {
  if (IS_PG) return (await pool.query(toPg(sql), params)).rows[0] || null;
  return sqlite.prepare(sql).get(...params) || null;
}

export async function qRun(sql, params = []) {
  if (IS_PG) { const r = await pool.query(toPg(sql), params); return { changes: r.rowCount }; }
  const r = sqlite.prepare(sql).run(...params);
  return { changes: Number(r.changes) };
}

// INSERT yapip yeni kaydin id'sini dondurur
export async function qInsert(sql, params = []) {
  if (IS_PG) {
    const r = await pool.query(toPg(sql) + ' RETURNING id', params);
    return Number(r.rows[0].id);
  }
  const r = sqlite.prepare(sql).run(...params);
  return Number(r.lastInsertRowid);
}

// --- Sema ---
const PK = IS_PG ? 'INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
const NOW = IS_PG ? "to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD HH24:MI:SS')" : "(datetime('now'))";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS seasons (
  id ${PK},
  name TEXT NOT NULL,
  sport TEXT NOT NULL DEFAULT 'volleyball' CHECK (sport IN ('volleyball','beach_volleyball','football','basketball')),
  court_size INTEGER,
  yellow_limit INTEGER,
  red_ban INTEGER,
  format TEXT NOT NULL DEFAULT 'league' CHECK (format IN ('league','groups_knockout','knockout')),
  group_count INTEGER,
  advance_count INTEGER,
  knockout_byes TEXT,
  is_active INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS teams (
  id ${PK},
  season_id INTEGER NOT NULL REFERENCES seasons(id),
  name TEXT NOT NULL,
  company TEXT,
  logo_path TEXT,
  group_name TEXT,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);
CREATE TABLE IF NOT EXISTS users (
  id ${PK},
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin','admin','scorekeeper','captain')),
  team_id INTEGER REFERENCES teams(id),
  must_change_password INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS players (
  id ${PK},
  team_id INTEGER NOT NULL REFERENCES teams(id),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  height_cm INTEGER,
  weight_kg INTEGER,
  jersey_no INTEGER,
  position TEXT,
  photo_path TEXT,
  eligibility_doc_path TEXT,
  kvkk_consent INTEGER NOT NULL DEFAULT 0,
  national_id_hash TEXT,
  national_id_mask TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  pending_changes TEXT,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);
CREATE TABLE IF NOT EXISTS matches (
  id ${PK},
  season_id INTEGER NOT NULL REFERENCES seasons(id),
  round INTEGER NOT NULL DEFAULT 1,
  home_team_id INTEGER NOT NULL REFERENCES teams(id),
  away_team_id INTEGER NOT NULL REFERENCES teams(id),
  scheduled_at TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','live','finished')),
  home_sets INTEGER NOT NULL DEFAULT 0,
  away_sets INTEGER NOT NULL DEFAULT 0,
  best_of INTEGER NOT NULL DEFAULT 5,
  stage TEXT NOT NULL DEFAULT 'league',
  mvp_player_id INTEGER REFERENCES players(id)
);
CREATE TABLE IF NOT EXISTS match_sets (
  id ${PK},
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  set_no INTEGER NOT NULL,
  home_points INTEGER NOT NULL DEFAULT 0,
  away_points INTEGER NOT NULL DEFAULT 0,
  finished INTEGER NOT NULL DEFAULT 0,
  UNIQUE (match_id, set_no)
);
CREATE TABLE IF NOT EXISTS stat_events (
  id ${PK},
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  set_no INTEGER NOT NULL,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  player_id INTEGER REFERENCES players(id),
  type TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 1,
  detail TEXT,
  related_id INTEGER,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);
CREATE TABLE IF NOT EXISTS penalties (
  id ${PK},
  player_id INTEGER NOT NULL REFERENCES players(id),
  match_id INTEGER REFERENCES matches(id),
  type TEXT NOT NULL CHECK (type IN ('yellow','red','ban')),
  ban_matches INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);
CREATE INDEX IF NOT EXISTS idx_stat_events_match ON stat_events (match_id);
CREATE INDEX IF NOT EXISTS idx_stat_events_player ON stat_events (player_id);
CREATE INDEX IF NOT EXISTS idx_matches_season ON matches (season_id);
`;

export async function initSchema() {
  if (IS_PG) await pool.query(SCHEMA);
  else sqlite.exec(SCHEMA);
  // Sonradan eklenen kolonlar (zaten varsa hata sessizce yutulur)
  for (const stmt of [
    'ALTER TABLE players ADD COLUMN national_id_hash TEXT',
    'ALTER TABLE players ADD COLUMN national_id_mask TEXT',
    'ALTER TABLE seasons ADD COLUMN court_size INTEGER',
    'ALTER TABLE seasons ADD COLUMN yellow_limit INTEGER',
    'ALTER TABLE seasons ADD COLUMN red_ban INTEGER',
    'ALTER TABLE stat_events ADD COLUMN detail TEXT',
    'ALTER TABLE stat_events ADD COLUMN related_id INTEGER',
    "ALTER TABLE seasons ADD COLUMN format TEXT NOT NULL DEFAULT 'league'",
    'ALTER TABLE seasons ADD COLUMN group_count INTEGER',
    'ALTER TABLE seasons ADD COLUMN advance_count INTEGER',
    'ALTER TABLE seasons ADD COLUMN knockout_byes TEXT',
    'ALTER TABLE teams ADD COLUMN group_name TEXT',
    "ALTER TABLE matches ADD COLUMN stage TEXT NOT NULL DEFAULT 'league'"
  ]) {
    try { IS_PG ? await pool.query(stmt) : sqlite.exec(stmt); } catch {}
  }
}

// --- TC Kimlik No: dogrulama + geri dondurulemez ozet (KVKK: acik halde saklanmaz) ---
export function validateNationalId(tc) {
  if (!/^[1-9][0-9]{10}$/.test(tc)) return false;
  const d = tc.split('').map(Number);
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  if (((odd * 7 - even) % 10 + 10) % 10 !== d[9]) return false;
  if (d.slice(0, 10).reduce((a, b) => a + b, 0) % 10 !== d[10]) return false;
  return true;
}

export function hashNationalId(tc) {
  const pepper = process.env.ID_PEPPER || process.env.SESSION_SECRET || 'ncl-kimlik-tuzu';
  return createHmac('sha256', pepper).update(String(tc)).digest('hex');
}

export function maskNationalId(tc) {
  return tc.slice(0, 2) + '*******' + tc.slice(-2);
}

// --- Sifreleme (node:crypto scrypt) ---
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return salt + ':' + hash;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const candidate = scryptSync(password, salt, 64);
  return timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}

// --- Ayarlar ---
export async function getSetting(key, def = null) {
  const row = await qGet('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? row.value : def;
}

export async function setSetting(key, value) {
  await qRun(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    [key, String(value)]
  );
}

export async function getActiveSeason(sport = 'volleyball') {
  return qGet('SELECT * FROM seasons WHERE is_active = 1 AND sport = ?', [sport]);
}
