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
};

export function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
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
