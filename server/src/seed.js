import { initSchema, qGet, qInsert, qRun, hashPassword } from './db.js';

try { await initSchema(); }
catch { process.exit(1); }

const userCount = (await qGet('SELECT COUNT(*) AS c FROM users')).c;
if (userCount > 0) {
  console.log('Veritabani zaten dolu, seed atlandi.');
  process.exit(0);
}

const firstNames = ['Mehmet', 'Ali', 'Ayşe', 'Fatma', 'Emre', 'Zeynep', 'Burak', 'Elif', 'Can', 'Selin', 'Murat', 'Deniz', 'Cem', 'Ece', 'Kaan', 'Merve', 'Onur', 'Pelin', 'Serkan', 'Tuğçe'];
const lastNames = ['Yılmaz', 'Kaya', 'Demir', 'Çelik', 'Şahin', 'Öztürk', 'Arslan', 'Doğan', 'Kılıç', 'Aydın', 'Polat', 'Erdoğan', 'Koç', 'Kurt', 'Özdemir', 'Aksoy', 'Güneş', 'Karaca', 'Tekin', 'Yıldız'];

const addUser = (email, pass, name, role, orgId, teamId) => qInsert(
  'INSERT INTO users (email, password_hash, name, role, organization_id, team_id, must_change_password) VALUES (?, ?, ?, ?, ?, ?, 0)',
  [email, hashPassword(pass), name, role, orgId, teamId]);

// Iki demo musteri (organizasyon)
const ORGS = [
  {
    name: 'Marmara Şirketler Ligi', slug: 'marmara', sport: 'volleyball', squad: 8,
    positions: ['Pasör', 'Smaçör', 'Orta Oyuncu', 'Libero', 'Pasör Çaprazı', 'Smaçör', 'Orta Oyuncu', 'Smaçör'],
    archiveName: '2025 Güz Sezonu - Voleybol', activeName: '2026 Bahar Sezonu - Voleybol',
    companies: [
      { name: 'Yapı Kredi', company: 'Yapı ve Kredi Bankası A.Ş.', logo: '/logos/yapikredi.svg' },
      { name: 'Bosch', company: 'Bosch Türkiye', logo: '/logos/bosch.svg' },
      { name: 'JTI', company: 'JTI Türkiye', logo: '/logos/jti.svg' },
      { name: 'Decathlon', company: 'Decathlon Türkiye', logo: '/logos/decathlon.svg' }
    ],
    adminEmail: 'marmara@ncl.com', scorerEmail: 'hakem@ncl.com', captains: true
  },
  {
    name: 'Ege Kurumsal Turnuvaları', slug: 'ege', sport: 'football', squad: 13,
    positions: ['Kaleci', 'Defans', 'Defans', 'Defans', 'Defans', 'Orta Saha', 'Orta Saha', 'Orta Saha', 'Orta Saha', 'Forvet', 'Forvet', 'Defans', 'Orta Saha'],
    archiveName: '2025 Kurumsal Futbol Kupası', activeName: '2026 Kurumsal Futbol Ligi',
    companies: [
      { name: 'Arçelik', company: 'Arçelik A.Ş.', logo: '/logos/arcelik.svg' },
      { name: 'THY', company: 'Türk Hava Yolları A.O.', logo: '/logos/thy.svg' },
      { name: 'Getir', company: 'Getir Perakende Lojistik A.Ş.', logo: '/logos/getir.svg' },
      { name: 'Migros', company: 'Migros Ticaret A.Ş.', logo: '/logos/migros.svg' }
    ],
    adminEmail: 'admin@ncl.com', extraAdmin: 'ege@ncl.com', scorerEmail: 'hakem2@ncl.com', captains: false
  }
];

await addUser('admin@adminim.com', 'admin123', 'Platform Sahibi', 'super_admin', null, null);
await qRun("INSERT INTO settings (key, value) VALUES ('platform_team_price', '500') ON CONFLICT (key) DO NOTHING");

let nameIdx = 0, captainNo = 1;
for (const cfg of ORGS) {
  const orgId = await qInsert('INSERT INTO organizations (name, slug) VALUES (?, ?)', [cfg.name, cfg.slug]);
  await addUser(cfg.adminEmail, 'admin123', cfg.name + ' Yöneticisi', 'admin', orgId, null);
  if (cfg.extraAdmin) await addUser(cfg.extraAdmin, 'admin123', cfg.name + ' Yardımcı Yönetici', 'admin', orgId, null);
  await addUser(cfg.scorerEmail, 'hakem123', cfg.name + ' Masa Görevlisi', 'scorekeeper', orgId, null);

  for (const seasonDef of [
    { name: cfg.archiveName, active: 0 },
    { name: cfg.activeName, active: 1 }
  ]) {
    const extra = cfg.sport === 'football' ? ', yellow_limit, red_ban' : '';
    const extraVals = cfg.sport === 'football' ? ', 2, 1' : '';
    const sid = await qInsert(
      `INSERT INTO seasons (organization_id, name, sport, is_active${extra}) VALUES (?, ?, ?, ?${extraVals})`,
      [orgId, seasonDef.name, cfg.sport, seasonDef.active]);
    for (const c of cfg.companies) {
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
      if (cfg.captains && seasonDef.active) {
        await addUser(`kaptan${captainNo}@ncl.com`, 'kaptan123', `${c.name} Kaptanı`, 'captain', orgId, tid);
        captainNo++;
      }
    }
  }
}

console.log('Seed tamamlandı: 2 organizasyon (Marmara/voleybol, Ege/futbol), her birinde arşiv + aktif sezon');
console.log('Girişler:');
console.log('  Platform süper admin : admin@adminim.com / admin123');
console.log('  Marmara admini       : marmara@ncl.com / admin123 | hakem@ncl.com / hakem123');
console.log('  Ege adminleri        : admin@ncl.com ve ege@ncl.com / admin123 | hakem2@ncl.com / hakem123');
console.log('  Kaptanlar (Marmara)  : kaptan1..4@ncl.com / kaptan123');
process.exit(0);
