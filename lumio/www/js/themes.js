// Cosmetic themes: unlocked with coins (or via in-app purchase).
export const THEMES = {
  aurora: {
    price: 0, name: 'Aurora',
    bg: '#0b1020', bg2: '#1a2350', tile: '#18213f', tileLocked: '#22305e',
    off: '#3a4672', on: '#5ef2ff', glow: '#5ef2ff', src: '#ffd166', text: '#e8ecff', muted: '#8d97c4',
  },
  ember: {
    price: 300, name: 'Ember',
    bg: '#170908', bg2: '#3a1410', tile: '#2b1512', tileLocked: '#432018',
    off: '#5a322a', on: '#ffb347', glow: '#ff7b29', src: '#fff1a8', text: '#ffeede', muted: '#c49a8a',
  },
  mint: {
    price: 400, name: 'Mint',
    bg: '#e3f5ee', bg2: '#bfe8d8', tile: '#ffffff', tileLocked: '#d9f2e8',
    off: '#b5cfc4', on: '#0fb48a', glow: '#21d6a5', src: '#ff8a5b', text: '#12332a', muted: '#4f7a6c',
  },
  neon: {
    price: 600, name: 'Neon',
    bg: '#0a0014', bg2: '#2a0846', tile: '#1a0a2e', tileLocked: '#2d1150',
    off: '#45306a', on: '#b6ff3b', glow: '#d14dff', src: '#ff4dd8', text: '#f3e8ff', muted: '#a68cc9',
  },
};

export function applyTheme(key) {
  const t = THEMES[key] || THEMES.aurora;
  const root = document.documentElement.style;
  root.setProperty('--bg', t.bg);
  root.setProperty('--bg2', t.bg2);
  root.setProperty('--tile', t.tile);
  root.setProperty('--accent', t.on);
  root.setProperty('--glow', t.glow);
  root.setProperty('--src', t.src);
  root.setProperty('--text', t.text);
  root.setProperty('--muted', t.muted);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.bg);
  return t;
}
