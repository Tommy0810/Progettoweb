import test from 'node:test';
import assert from 'node:assert/strict';
import { generate, levelConfig, dailyConfig, rot, rotCCW, tapsBetween, DIRS, KIND, FIXED_FROM, REVERSE_FROM, LINKED_FROM, groupTaps } from '../www/js/generator.js';

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
    const groups = [...new Set(p.groups.filter((g) => g >= 0))];
    const expected = p.cur.reduce((s, m, i) => s + (p.groups[i] < 0 ? tapsBetween(m, p.sol[i], p.kinds[i]) : 0), 0)
      + groups.reduce((s, g) => s + groupTaps(p.groups.flatMap((x, j) => (x === g ? [j] : [])), p.cur, p.sol), 0);
    assert.equal(p.par, expected);
    assert.ok(Number.isFinite(p.par) && p.par > 0);
    assert.deepEqual(generate(cfg).cur, p.cur, 'same seed => same puzzle');
  }
});

test('rotCCW undoes rot', () => {
  for (let m = 0; m < 16; m++) assert.equal(rotCCW(rot(m)), m);
});

test('special tiles appear only from their unlock level, and fixed tiles are pre-solved', () => {
  const count = (l, k) => generate(levelConfig(l)).kinds.filter((x) => x === k).length;
  for (let l = 1; l < FIXED_FROM; l++) assert.equal(count(l, KIND.FIXED) + count(l, KIND.REVERSE), 0);
  for (let l = FIXED_FROM; l < REVERSE_FROM; l++) assert.equal(count(l, KIND.REVERSE), 0);
  let fixed = 0, reverse = 0;
  for (let l = REVERSE_FROM; l < REVERSE_FROM + 20; l++) {
    const p = generate(levelConfig(l));
    p.kinds.forEach((k, i) => { if (k === KIND.FIXED) assert.equal(p.cur[i], p.sol[i]); });
    fixed += count(l, KIND.FIXED); reverse += count(l, KIND.REVERSE);
  }
  assert.ok(fixed > 0 && reverse > 0);
});

test('linked pairs appear from their unlock level and are always solvable together', () => {
  for (let l = 1; l < LINKED_FROM; l++) assert.ok(generate(levelConfig(l)).groups.every((g) => g === -1));
  for (let l = LINKED_FROM; l < LINKED_FROM + 40; l++) {
    const p = generate(levelConfig(l));
    const groups = [...new Set(p.groups.filter((g) => g >= 0))];
    assert.ok(groups.length > 0, `level ${l} has linked tiles`);
    for (const g of groups) {
      const members = p.groups.flatMap((x, j) => (x === g ? [j] : []));
      assert.equal(members.length, 2);
      assert.ok(members.every((i) => p.kinds[i] === KIND.LINKED));
      assert.ok(Number.isFinite(groupTaps(members, p.cur, p.sol)));
    }
  }
});

test('difficulty grows overall', () => {
  const area = (l) => { const c = levelConfig(l); return c.w * c.h; };
  assert.ok(area(1) < area(20) && area(20) < area(100) && area(100) <= area(250));
});
