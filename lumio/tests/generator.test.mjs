import test from 'node:test';
import assert from 'node:assert/strict';
import { generate, levelConfig, dailyConfig, rot, tapsBetween, DIRS } from '../www/js/generator.js';

function solvedNetworkOk(p) {
  // The solution must be a spanning tree: consistent edges, no edges leaving the grid, all connected.
  const { w, h, sol } = p;
  let half = 0;
  for (let i = 0; i < w * h; i++) {
    const x = i % w, y = (i / w) | 0;
    for (const d of DIRS) {
      if (!(sol[i] & d.b)) continue;
      half++;
      const nx = x + d.dx, ny = y + d.dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) return false;
      if (!(sol[ny * w + nx] & d.o)) return false;
    }
  }
  return half === 2 * (w * h - 1);
}

test('rot cycles in 4 steps', () => {
  for (let m = 0; m < 16; m++) assert.equal(rot(rot(rot(rot(m)))), m);
});

test('levels 1..300 and dailies are valid, scrambled and deterministic', () => {
  const cfgs = [];
  for (let l = 1; l <= 300; l++) cfgs.push(levelConfig(l));
  for (let d = 1; d <= 60; d++) cfgs.push(dailyConfig(`2026-12-${String(d).padStart(2, '0')}`));
  for (const cfg of cfgs) {
    const p = generate(cfg);
    assert.ok(solvedNetworkOk(p), 'solution is a spanning tree');
    assert.ok(p.cur.some((m, i) => m !== p.sol[i]), 'puzzle is not pre-solved');
    assert.equal(p.par, p.cur.reduce((s, m, i) => s + tapsBetween(m, p.sol[i]), 0));
    assert.ok(Number.isFinite(p.par) && p.par > 0);
    assert.deepEqual(generate(cfg).cur, p.cur, 'same seed => same puzzle');
  }
});

test('difficulty grows overall', () => {
  const area = (l) => { const c = levelConfig(l); return c.w * c.h; };
  assert.ok(area(1) < area(20) && area(20) < area(100) && area(100) <= area(250));
});
