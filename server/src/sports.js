// Brans tanimlari: sayi turleri, periyot adlari, puanlama kurallari
const VOLLEY_EVENTS = {
  attack:    { label: 'Hücum',              short: 'HÜC', points: 1, needsPlayer: true },
  ace:       { label: 'Servis (As)',        short: 'AS',  points: 1, needsPlayer: true },
  block:     { label: 'Blok',               short: 'BLK', points: 1, needsPlayer: true },
  opp_error: { label: 'Rakip Hatası',       short: 'RH',  points: 1, needsPlayer: false },
  dig:       { label: 'Savunma (Dig)',      short: 'DIG', points: 0, needsPlayer: true },
  rec_ok:    { label: 'Karşılama Başarılı', short: 'K✓', points: 0, needsPlayer: true },
  rec_err:   { label: 'Karşılama Hatası',   short: 'K✗', points: 0, needsPlayer: true }
};

const VOLLEY_LEADERS = [
  { key: 'points',  label: 'Skor Krallığı',    cond: "e.type IN ('attack','ace','block')" },
  { key: 'attacks', label: 'Hücum',             cond: "e.type = 'attack'" },
  { key: 'aces',    label: 'Servis (As)',       cond: "e.type = 'ace'" },
  { key: 'blocks',  label: 'Blok',              cond: "e.type = 'block'" },
  { key: 'digs',    label: 'Savunma (Dig)',     cond: "e.type = 'dig'" },
  { key: 'rec_pct', label: 'Karşılama Oranı',   ratio: { ok: 'rec_ok', err: 'rec_err', min: 5 } }
];

const VOLLEY_STATCOLS = [
  { key: 'total_points', label: 'Sayı',   cond: "e.type IN ('attack','ace','block')" },
  { key: 'attacks', label: 'Hücum',        cond: "e.type = 'attack'" },
  { key: 'aces',    label: 'As',           cond: "e.type = 'ace'" },
  { key: 'blocks',  label: 'Blok',         cond: "e.type = 'block'" },
  { key: 'digs',    label: 'Dig',          cond: "e.type = 'dig'" },
  { key: 'rec_ok',  label: 'Karş. ✓',     cond: "e.type = 'rec_ok'" },
  { key: 'rec_err', label: 'Karş. ✗',     cond: "e.type = 'rec_err'" }
];

// ok+err'den yuzde hesaplanip tabloya eklenir (frontend)
const VOLLEY_RATIOCOLS = [{ key: 'rec_pct', label: 'Karşılama %', ok: 'rec_ok', err: 'rec_err' }];

export const SPORTS = {
  volleyball: {
    label: 'Voleybol',
    defaultCourtSize: 6,
    periodName: 'Set',
    winnerBy: 'periods',
    regularPeriods: null,
    defaultBestOf: 5,
    setTarget: 25, lastSetTarget: 15,
    allowDraw: false,
    eventTypes: VOLLEY_EVENTS,
    leaders: VOLLEY_LEADERS,
    statCols: VOLLEY_STATCOLS,
    ratioCols: VOLLEY_RATIOCOLS
  },
  beach_volleyball: {
    label: 'Plaj Voleybolu',
    defaultCourtSize: 2,
    periodName: 'Set',
    winnerBy: 'periods',
    regularPeriods: null,
    defaultBestOf: 3,
    setTarget: 21, lastSetTarget: 15,
    allowDraw: false,
    eventTypes: VOLLEY_EVENTS,
    leaders: VOLLEY_LEADERS,
    statCols: VOLLEY_STATCOLS,
    ratioCols: VOLLEY_RATIOCOLS
  },
  football: {
    label: 'Futbol',
    defaultCourtSize: 7,
    periodName: 'Devre',
    winnerBy: 'points',
    regularPeriods: 2,
    defaultBestOf: 5,
    allowDraw: true,
    eventTypes: {
      goal:        { label: 'Gol',                 short: 'GOL', points: 1, needsPlayer: true,
        details: [
          { key: 'right_foot', label: 'Sağ Ayak' },
          { key: 'left_foot',  label: 'Sol Ayak' },
          { key: 'head',       label: 'Kafa' },
          { key: 'penalty',    label: 'Penaltı' },
          { key: 'other',      label: 'Diğer' }
        ], allowAssist: true },
      own_goal:    { label: 'K.K. Gol (rakipten)', short: 'KK',  points: 1, needsPlayer: false },
      assist:      { label: 'Asist',               short: 'AST', points: 0, needsPlayer: true },
      save:        { label: 'Kurtarış',            short: 'KUR', points: 0, needsPlayer: true },
      yellow_card: { label: 'Sarı Kart',           short: 'SK',  points: 0, needsPlayer: true },
      red_card:    { label: 'Kırmızı Kart',        short: 'KART', points: 0, needsPlayer: true }
    },
    leaders: [
      { key: 'goals',   label: 'Gol Krallığı', cond: "e.type = 'goal'" },
      { key: 'assists', label: 'Asist',         cond: "e.type = 'assist'" },
      { key: 'saves',   label: 'Kurtarış',      cond: "e.type = 'save'" },
      { key: 'yellows', label: 'Sarı Kart',     cond: "e.type = 'yellow_card'" }
    ],
    statCols: [
      { key: 'goals',   label: 'Gol',      cond: "e.type = 'goal'" },
      { key: 'assists', label: 'Asist',    cond: "e.type = 'assist'" },
      { key: 'saves',   label: 'Kurtarış', cond: "e.type = 'save'" },
      { key: 'yellows', label: 'Sarı',     cond: "e.type = 'yellow_card'" },
      { key: 'reds',    label: 'Kırmızı',  cond: "e.type = 'red_card'" }
    ],
    ratioCols: []
  },
  basketball: {
    label: 'Basketbol',
    defaultCourtSize: 5,
    periodName: 'Çeyrek',
    winnerBy: 'points',
    regularPeriods: 4,
    defaultBestOf: 5,
    allowDraw: false,
    eventTypes: {
      p2:      { label: '2 Sayı',        short: '+2',  points: 2, needsPlayer: true },
      p3:      { label: '3 Sayı',        short: '+3',  points: 3, needsPlayer: true },
      p1:      { label: 'Serbest Atış',  short: '+1',  points: 1, needsPlayer: true },
      rebound: { label: 'Ribaund',       short: 'RIB', points: 0, needsPlayer: true },
      assist:  { label: 'Asist',         short: 'AST', points: 0, needsPlayer: true },
      steal:   { label: 'Top Çalma',     short: 'TÇ',  points: 0, needsPlayer: true },
      block:   { label: 'Blok',          short: 'BLK', points: 0, needsPlayer: true },
      foul:    { label: 'Faul',          short: 'FL',  points: 0, needsPlayer: true }
    },
    leaders: [
      { key: 'points',   label: 'Sayı Krallığı', cond: "e.type IN ('p1','p2','p3')", sum: true },
      { key: 'threes',   label: '3 Sayılık',      cond: "e.type = 'p3'" },
      { key: 'rebounds', label: 'Ribaund',        cond: "e.type = 'rebound'" },
      { key: 'assists',  label: 'Asist',          cond: "e.type = 'assist'" },
      { key: 'steals',   label: 'Top Çalma',      cond: "e.type = 'steal'" },
      { key: 'blocks',   label: 'Blok',           cond: "e.type = 'block'" }
    ],
    statCols: [
      { key: 'total_points', label: 'Sayı',  cond: "e.type IN ('p1','p2','p3')", sum: true },
      { key: 'threes',   label: "3'lük",     cond: "e.type = 'p3'" },
      { key: 'rebounds', label: 'Rib.',      cond: "e.type = 'rebound'" },
      { key: 'assists',  label: 'Asist',     cond: "e.type = 'assist'" },
      { key: 'steals',   label: 'T.Ç.',      cond: "e.type = 'steal'" },
      { key: 'blocks',   label: 'Blok',      cond: "e.type = 'block'" },
      { key: 'fouls',    label: 'Faul',      cond: "e.type = 'foul'" }
    ],
    ratioCols: []
  }
};

export const SPORT_KEYS = Object.keys(SPORTS);

export function sportOf(key) {
  return SPORTS[key] || SPORTS.volleyball;
}

export function isSetBased(key) {
  return sportOf(key).winnerBy === 'periods';
}

export function sportConfigForClient(key) {
  const s = sportOf(key);
  return {
    key, label: s.label, periodName: s.periodName,
    defaultCourtSize: s.defaultCourtSize,
    winnerBy: s.winnerBy, regularPeriods: s.regularPeriods, allowDraw: s.allowDraw,
    setTarget: s.setTarget || null, lastSetTarget: s.lastSetTarget || null,
    eventTypes: Object.entries(s.eventTypes).map(([k, v]) => ({ key: k, ...v })),
    statCols: s.statCols.map(c => ({ key: c.key, label: c.label })),
    ratioCols: s.ratioCols || []
  };
}
