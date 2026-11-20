const KEY = 'lumio_save_v1';

const DEFAULTS = {
  level: 1,
  stars: {},          // level -> best stars
  coins: 50,
  freeHints: 3,
  theme: 'aurora',
  owned: ['aurora'],
  sound: true,
  haptics: true,
  streak: 0,
  bestStreak: 0,
  lastDaily: null,    // 'YYYY-MM-DD'
  levelsSinceAd: 0,
  noAds: false,       // set by the "Remove ads" in-app purchase
  achievements: [],   // unlocked trophy ids
  music: true,
  rushBest: 0,        // Time Attack record
  giftNext: 0,        // next day (0-6) of the daily gift calendar
  lastGift: null,     // 'YYYY-MM-DD' of the last gift claimed
  stats: { wins: 0, hints: 0, bossNoHint: 0 },
};

export function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    const base = structuredClone(DEFAULTS);
    return { ...base, ...saved, stats: { ...base.stats, ...saved.stats } };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full/blocked */ }
}

export function dateKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function yesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return dateKey(d);
}

/** Sequential daily number, shown in shares ("Daily #312"). */
export function dailyNumber(d = new Date()) {
  const start = new Date(2026, 0, 1);
  return Math.floor((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - start) / 86400000) + 1;
}
