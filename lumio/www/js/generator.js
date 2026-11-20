// Procedural puzzle generator.
// Each tile is a 4-bit mask of connections: N=1, E=2, S=4, W=8.
// A random spanning tree over the grid is the solution, so every puzzle is
// guaranteed solvable; the tiles are then rotated randomly to scramble it.

export const DIRS = [
  { b: 1, dx: 0, dy: -1, o: 4 }, // N
  { b: 2, dx: 1, dy: 0, o: 8 },  // E
  { b: 4, dx: 0, dy: 1, o: 1 },  // S
  { b: 8, dx: -1, dy: 0, o: 2 }, // W
];

/** Rotate a mask 90° clockwise. */
export const rot = (m) => ((m << 1) | (m >> 3)) & 15;

/** Rotate a mask 90° counter-clockwise. */
export const rotCCW = (m) => ((m >> 1) | ((m & 1) << 3)) & 15;

// Tile kinds: normal tiles turn clockwise, fixed tiles never move,
// reverse tiles turn counter-clockwise.
export const KIND = { NORMAL: 0, FIXED: 1, REVERSE: 2 };

export function turn(kind, m) {
  return kind === KIND.REVERSE ? rotCCW(m) : rot(m);
}

/** Minimum taps to turn `from` into `to` for a tile of this kind (Infinity if impossible). */
export function tapsBetween(from, to, kind = KIND.NORMAL) {
  if (kind === KIND.FIXED) return from === to ? 0 : Infinity;
  let m = from;
  for (let k = 0; k < 4; k++) {
    if (m === to) return k;
    m = turn(kind, m);
  }
  return Infinity;
}

/** Deterministic PRNG (mulberry32) so every player gets the same level N. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function generate({ w, h, seed, scramble = 1, fixed = 0, reverse = 0 }) {
  const r = rng(seed);
  const n = w * h;
  const sol = new Array(n).fill(0);
  const src = Math.floor(h / 2) * w + Math.floor(w / 2);

  // Randomized Prim: produces many short branches => many bulbs to light.
  const inTree = new Array(n).fill(false);
  const frontier = [];
  const addFrontier = (i) => {
    const x = i % w, y = (i / w) | 0;
    for (const d of DIRS) {
      const nx = x + d.dx, ny = y + d.dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (!inTree[j]) frontier.push([i, j, d]);
    }
  };
  inTree[src] = true;
  addFrontier(src);
  while (frontier.length) {
    const k = Math.floor(r() * frontier.length);
    const [i, j, d] = frontier[k];
    frontier[k] = frontier[frontier.length - 1];
    frontier.pop();
    if (inTree[j]) continue;
    inTree[j] = true;
    sol[i] |= d.b;
    sol[j] |= d.o;
    addFrontier(j);
  }

  // Scramble.
  const cur = sol.map((m) => {
    if (r() > scramble) return m;
    let x = m;
    const k = Math.floor(r() * 4);
    for (let t = 0; t < k; t++) x = rot(x);
    return x;
  });

  // Make sure the puzzle is never trivially solved.
  const minWrong = Math.max(2, Math.floor(n * 0.4 * scramble));
  let wrong = cur.filter((m, i) => m !== sol[i]).length;
  for (let guard = 0; wrong < minWrong && guard < n * 8; guard++) {
    const i = Math.floor(r() * n);
    if (cur[i] !== sol[i] || rot(sol[i]) === sol[i]) continue; // cross tiles can't be wrong
    cur[i] = rot(cur[i]);
    if (cur[i] !== sol[i]) wrong++;
  }

  // Special tiles (only drawn from the RNG when enabled, so early levels stay identical).
  const kinds = new Array(n).fill(KIND.NORMAL);
  if (fixed || reverse) {
    for (let i = 0; i < n; i++) {
      if (i === src) continue;
      const roll = r();
      if (roll < fixed) {
        // Cross tiles look identical in every orientation: fixing them adds nothing.
        if (rot(sol[i]) !== sol[i]) {
          kinds[i] = KIND.FIXED;
          cur[i] = sol[i];
        }
      } else if (roll < fixed + reverse) {
        kinds[i] = KIND.REVERSE;
      }
    }
  }

  const par = cur.reduce((s, m, i) => s + tapsBetween(m, sol[i], kinds[i]), 0);
  return { w, h, src, sol, cur, kinds, par };
}

// Difficulty curve: grid grows over time, with a "breather" every 5th level
// and a tougher "boss" every 10th to keep a satisfying rhythm.
const SIZES = [
  [3, 3], [3, 4], [4, 4], [4, 5], [5, 5], [5, 6],
  [6, 6], [6, 7], [7, 7], [7, 8], [7, 9], [8, 9], [8, 10],
];
export const FIXED_FROM = 31;
export const REVERSE_FROM = 46;
const TIER_UNTIL = [2, 5, 9, 14, 21, 30, 42, 56, 75, 100, 140, 200];

export function levelConfig(level) {
  let tier = TIER_UNTIL.findIndex((u) => level <= u);
  if (tier === -1) tier = SIZES.length - 1;
  const boss = level % 10 === 0 && level > 5;
  const breather = level % 5 === 0 && !boss;
  if (boss) tier = Math.min(SIZES.length - 1, tier + 1);
  if (breather) tier = Math.max(0, tier - 1);
  const [w, h] = SIZES[tier];
  return {
    w, h,
    seed: (level * 7919 + 104729) >>> 0,
    scramble: level <= 2 ? 0.55 : 1,
    fixed: level >= FIXED_FROM ? 0.12 : 0,
    reverse: level >= REVERSE_FROM ? 0.18 : 0,
    boss, breather,
  };
}

export function dailyConfig(dateKey) {
  return { w: 6, h: 8, seed: hashString('lumio-daily-' + dateKey), scramble: 1 };
}
