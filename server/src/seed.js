import { initSchema, qGet, qInsert, qRun, hashPassword, setSetting } from './db.js';

try { await initSchema(); }
catch { process.exit(1); }

const userCount = (await qGet('SELECT COUNT(*) AS c FROM users')).c;
if (userCount > 0) {
  console.log('Veritabani zaten dolu, seed atlandi.');
  process.exit(0);
}

await setSetting('eligibility_check_enabled', '1');

const COMPANIES = [
  { name: 'Yapı Kredi', company: 'Yapı ve Kredi Bankası A.Ş.', logo: '/logos/yapikredi.svg' },
  { name: 'Bosch', company: 'Bosch Türkiye', logo: '/logos/bosch.svg' },
  { name: 'JTI', company: 'JTI Türkiye', logo: '/logos/jti.svg' },
  { name: 'Decathlon', company: 'Decathlon Türkiye', logo: '/logos/decathlon.svg' }
];

const SPORT_SETUP = {
  volleyball: { seasonName: '2026 Bahar Sezonu - Voleybol', squad: 8, positions: ['Pasör', 'Smaçör', 'Orta Oyuncu', 'Libero', 'Pasör Çaprazı', 'Smaçör', 'Orta Oyuncu', 'Smaçör'] },
  beach_volleyball: { seasonName: '2026 Yaz Sezonu - Plaj Voleybolu', squad: 4, positions: ['Defans', 'Blokçu', 'Defans', 'Blokçu'] },
  football:   { seasonName: '2026 Bahar Sezonu - Futbol',   squad: 9, positions: ['Kaleci', 'Defans', 'Defans', 'Orta Saha', 'Orta Saha', 'Forvet', 'Forvet', 'Defans', 'Orta Saha'] },
  basketball: { seasonName: '2026 Bahar Sezonu - Basketbol', squad: 7, positions: ['Oyun Kurucu', 'Şutör Guard', 'Kısa Forvet', 'Uzun Forvet', 'Pivot', 'Guard', 'Forvet'] }
};

const firstNames = ['Mehmet', 'Ali', 'Ayşe', 'Fatma', 'Emre', 'Zeynep', 'Burak', 'Elif', 'Can', 'Selin', 'Murat', 'Deniz', 'Cem', 'Ece', 'Kaan', 'Merve', 'Onur', 'Pelin', 'Serkan', 'Tuğçe'];
const lastNames = ['Yılmaz', 'Kaya', 'Demir', 'Çelik', 'Şahin', 'Öztürk', 'Arslan', 'Doğan', 'Kılıç', 'Aydın', 'Polat', 'Erdoğan', 'Koç', 'Kurt', 'Özdemir', 'Aksoy', 'Güneş', 'Karaca', 'Tekin', 'Yıldız'];

const addUser = (email, pass, name, role, teamId, mustChange) => qInsert(
  'INSERT INTO users (email, password_hash, name, role, team_id, must_change_password) VALUES (?, ?, ?, ?, ?, ?)',
  [email, hashPassword(pass), name, role, teamId, mustChange]);

await addUser('admin@ncl.com', 'admin123', 'Sistem Yöneticisi', 'super_admin', null, 0);
await addUser('hakem@ncl.com', 'hakem123', 'Masa Görevlisi', 'scorekeeper', null, 0);

let nameIdx = 0, captainNo = 1;
for (const [sport, cfg] of Object.entries(SPORT_SETUP)) {
  const sid = await qInsert('INSERT INTO seasons (name, sport, is_active) VALUES (?, ?, 1)', [cfg.seasonName, sport]);
  for (const c of COMPANIES) {
    const tid = await qInsert('INSERT INTO teams (season_id, name, company, logo_path) VALUES (?, ?, ?, ?)',
      [sid, c.name, c.company, c.logo]);
    for (let j = 0; j < cfg.squad; j++) {
      await qRun(`
        INSERT INTO players (team_id, first_name, last_name, height_cm, weight_kg, jersey_no, position, kvkk_consent, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'approved')
      `, [
        tid,
        firstNames[nameIdx % firstNames.length],
        lastNames[(nameIdx * 7 + 3) % lastNames.length],
        168 + ((nameIdx * 13) % 35),
        62 + ((nameIdx * 11) % 38),
        j + 1,
        cfg.positions[j]
      ]);
      nameIdx++;
    }
    if (sport === 'volleyball') {
      await addUser(`kaptan${captainNo}@ncl.com`, 'kaptan123', `${c.name} Kaptanı`, 'captain', tid, 0);
      captainNo++;
    }
  }
}

console.log('Seed tamamlandı: 4 branş x 4 takım (Yapı Kredi, Bosch, JTI, Decathlon)');
console.log('Giriş bilgileri:');
console.log('  Süper admin   : admin@ncl.com / admin123');
console.log('  Masa görevlisi: hakem@ncl.com / hakem123');
console.log('  Kaptanlar (voleybol): kaptan1@ncl.com ... kaptan4@ncl.com / kaptan123');
process.exit(0);
