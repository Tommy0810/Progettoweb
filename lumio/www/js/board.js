// Canvas board: rendering, input, animation and win detection.
import { DIRS, turn, KIND } from './generator.js';

const TAU = Math.PI * 2;

export class Board {
  constructor(canvas, callbacks) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.cb = callbacks;
    this.particles = [];
    this.raf = 0;
    this.last = 0;
    this.time = 0;
    canvas.addEventListener('pointerdown', (e) => this.onPointer(e));
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
  }

  load(puzzle, theme) {
    this.p = puzzle;
    this.theme = theme;
    this.w = puzzle.w;
    this.h = puzzle.h;
    this.tiles = puzzle.cur.map((m, i) => ({
      m, sol: puzzle.sol[i], kind: puzzle.kinds?.[i] ?? KIND.NORMAL, anim: 0, locked: false,
      power: 0, shake: 0, wave: 0, pop: 0,
    }));
    this.taps = 0;
    this.won = false;
    this.history = [];
    this.particles = [];
    this.bulbs = [];
    this.tiles.forEach((t, i) => {
      if (i !== puzzle.src && [1, 2, 4, 8].includes(t.sol)) this.bulbs.push(i);
    });
    this.computePower();
    this.litCount = this.countLit();
    this.tiles.forEach((t, i) => (t.power = this.powered[i]));
    this.resize();
    this.start();
  }

  setTheme(theme) { this.theme = theme; }

  resize() {
    if (!this.p) return;
    const parent = this.c.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.c.width = Math.round(parent.width * dpr);
    this.c.height = Math.round(parent.height * dpr);
    this.c.style.width = parent.width + 'px';
    this.c.style.height = parent.height + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pad = 12;
    this.cell = Math.floor(Math.min((parent.width - pad * 2) / this.w, (parent.height - pad * 2) / this.h, 104));
    this.ox = (parent.width - this.cell * this.w) / 2;
    this.oy = (parent.height - this.cell * this.h) / 2;
    this.vw = parent.width;
    this.vh = parent.height;
  }

  start() {
    if (this.raf) return;
    this.last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.update(dt);
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  // ---------- logic ----------
  computePower() {
    const { w, h } = this;
    const powered = new Uint8Array(w * h);
    const stack = [this.p.src];
    powered[this.p.src] = 1;
    while (stack.length) {
      const i = stack.pop();
      const x = i % w, y = (i / w) | 0;
      const m = this.tiles[i].m;
      for (const d of DIRS) {
        if (!(m & d.b)) continue;
        const nx = x + d.dx, ny = y + d.dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (powered[j] || !(this.tiles[j].m & d.o)) continue;
        powered[j] = 1;
        stack.push(j);
      }
    }
    this.powered = powered;
  }

  countLit() {
    return this.bulbs.reduce((s, i) => s + this.powered[i], 0);
  }

  // A spanning tree has exactly N-1 edges, so reaching every tile through
  // mutual connections implies no loose ends: the puzzle is solved.
  isSolved() {
    return this.powered.every((v) => v === 1);
  }

  onPointer(e) {
    if (!this.p || this.won) return;
    const rect = this.c.getBoundingClientRect();
    const col = Math.floor((e.clientX - rect.left - this.ox) / this.cell);
    const row = Math.floor((e.clientY - rect.top - this.oy) / this.cell);
    if (col < 0 || row < 0 || col >= this.w || row >= this.h) return;
    this.tap(row * this.w + col);
  }

  tap(i) {
    const t = this.tiles[i];
    if (t.locked || t.kind === KIND.FIXED) {
      t.shake = 1;
      this.cb.onLocked?.();
      return;
    }
    const prev = t.m;
    const d = this.spin(t);
    this.history.push({ i, prev, d });
    t.pop = 1;
    this.taps++;
    this.afterChange();
    this.cb.onTap?.(this.taps, this.litCount / this.bulbs.length);
  }

  /** Turn a tile one step in its own direction; returns the animation offset applied. */
  spin(t) {
    t.m = turn(t.kind, t.m);
    const d = t.kind === KIND.REVERSE ? Math.PI / 2 : -Math.PI / 2;
    t.anim += d;
    return d;
  }

  /** Take back the last rotation. Doesn't refund the tap. */
  undo() {
    if (this.won || !this.history.length) return false;
    const { i, prev, d } = this.history.pop();
    const t = this.tiles[i];
    t.m = prev;
    t.anim -= d;
    t.pop = 1;
    this.afterChange();
    return true;
  }

  canUndo() { return !this.won && this.history.length > 0; }

  afterChange() {
    const before = this.litCount;
    this.computePower();
    this.litCount = this.countLit();
    if (this.litCount > before) this.cb.onBulb?.(this.litCount, this.bulbs.length);
    if (this.isSolved()) this.win();
  }

  /** Rotate one wrong tile into place and lock it. Returns false if none left. */
  hint() {
    if (this.won) return false;
    const wrong = [];
    this.tiles.forEach((t, i) => { if (!t.locked && t.kind !== KIND.FIXED && t.m !== t.sol) wrong.push(i); });
    if (!wrong.length) return false;
    // Prefer tiles touching the lit network: the hint feels like "the next step".
    const near = wrong.filter((i) => this.neighbors(i).some((j) => this.powered[j]));
    const i = (near.length ? near : wrong)[0];
    const t = this.tiles[i];
    while (t.m !== t.sol) this.spin(t);
    t.locked = true;
    this.history = []; // a locked tile can't be undone
    t.pop = 1;
    this.afterChange();
    return true;
  }

  neighbors(i) {
    const x = i % this.w, y = (i / this.w) | 0;
    const out = [];
    for (const d of DIRS) {
      const nx = x + d.dx, ny = y + d.dy;
      if (nx >= 0 && ny >= 0 && nx < this.w && ny < this.h) out.push(ny * this.w + nx);
    }
    return out;
  }

  win() {
    this.won = true;
    this.cb.onSolved?.();
    const sx = this.p.src % this.w, sy = (this.p.src / this.w) | 0;
    this.tiles.forEach((t, i) => {
      const x = i % this.w, y = (i / this.w) | 0;
      t.wave = -(Math.abs(x - sx) + Math.abs(y - sy)) * 0.06; // ripple delay
    });
    for (const i of this.bulbs) this.burst(i, 10);
    this.burst(this.p.src, 24);
    setTimeout(() => this.cb.onWin?.({ taps: this.taps, par: this.p.par }), 950);
  }

  burst(i, count) {
    const { x, y } = this.center(i);
    for (let k = 0; k < count; k++) {
      const a = Math.random() * TAU;
      const s = 60 + Math.random() * 220;
      this.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40,
        life: 1, decay: 0.8 + Math.random() * 0.8, r: 1.5 + Math.random() * 2.5,
      });
    }
  }

  center(i) {
    const x = i % this.w, y = (i / this.w) | 0;
    return { x: this.ox + (x + 0.5) * this.cell, y: this.oy + (y + 0.5) * this.cell };
  }

  // ---------- animation ----------
  update(dt) {
    this.time += dt;
    for (let i = 0; i < this.tiles?.length; i++) {
      const t = this.tiles[i];
      t.anim += (0 - t.anim) * Math.min(1, dt * 16);
      if (Math.abs(t.anim) < 0.002) t.anim = 0;
      t.power += ((this.powered[i] ? 1 : 0) - t.power) * Math.min(1, dt * 9);
      t.shake = Math.max(0, t.shake - dt * 3);
      t.pop = Math.max(0, t.pop - dt * 5);
      if (this.won) t.wave += dt;
    }
    for (const p of this.particles) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += 260 * dt; p.vx *= 0.98;
      p.life -= p.decay * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  draw() {
    const ctx = this.ctx, th = this.theme;
    ctx.clearRect(0, 0, this.vw, this.vh);
    if (!this.p) return;
    const cs = this.cell;
    const lw = Math.max(3, cs * 0.16);

    for (let i = 0; i < this.tiles.length; i++) {
      const t = this.tiles[i];
      const { x, y } = this.center(i);
      const shake = t.shake ? Math.sin(t.shake * 30) * t.shake * cs * 0.06 : 0;
      const waveK = this.won && t.wave > 0 && t.wave < 0.5 ? Math.sin((t.wave / 0.5) * Math.PI) : 0;
      const scale = 1 - t.pop * 0.06 + waveK * 0.08;

      ctx.save();
      ctx.translate(x + shake, y);
      ctx.scale(scale, scale);

      // tile background
      const s = cs * 0.92;
      ctx.fillStyle = t.locked || t.kind === KIND.FIXED ? th.tileLocked : th.tile;
      roundRect(ctx, -s / 2, -s / 2, s, s, cs * 0.18);
      ctx.fill();
      if (t.kind === KIND.FIXED) {
        // four bolts: "this one doesn't move"
        ctx.fillStyle = th.off;
        const b = s * 0.34, br = Math.max(1.5, cs * 0.035);
        for (const [bx, by] of [[-b, -b], [b, -b], [-b, b], [b, b]]) { circle(ctx, bx, by, br); ctx.fill(); }
      } else if (t.kind === KIND.REVERSE) {
        // counter-clockwise arrow in the corner
        ctx.globalAlpha = 0.95;
        ctx.strokeStyle = th.src;
        ctx.lineWidth = Math.max(1.5, cs * 0.035);
        const ax = -s * 0.3, ay = -s * 0.3, ar = cs * 0.09;
        ctx.beginPath();
        ctx.arc(ax, ay, ar, -0.2 * Math.PI, 1.2 * Math.PI);
        ctx.stroke();
        const ex = ax + Math.cos(-0.2 * Math.PI) * ar, ey = ay + Math.sin(-0.2 * Math.PI) * ar;
        ctx.beginPath();
        ctx.moveTo(ex - ar * 0.55, ey - ar * 0.15);
        ctx.lineTo(ex, ey);
        ctx.lineTo(ex + ar * 0.1, ey - ar * 0.6);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (waveK > 0) {
        ctx.globalAlpha = waveK * 0.35;
        ctx.fillStyle = th.on;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      ctx.rotate(t.anim);
      const half = cs / 2;
      const segs = [];
      for (const d of DIRS) if (t.m & d.b) segs.push([d.dx * half, d.dy * half]);

      ctx.lineCap = 'round';
      // unpowered base
      ctx.strokeStyle = th.off;
      ctx.lineWidth = lw;
      strokeSegs(ctx, segs);
      if (t.power > 0.02) {
        // cheap glow (no shadowBlur: much faster on phones)
        ctx.globalAlpha = 0.22 * t.power;
        ctx.strokeStyle = th.glow;
        ctx.lineWidth = lw * 2.6;
        strokeSegs(ctx, segs);
        ctx.globalAlpha = t.power;
        ctx.strokeStyle = th.on;
        ctx.lineWidth = lw;
        strokeSegs(ctx, segs);
        ctx.globalAlpha = 1;
      }

      if (i === this.p.src) {
        ctx.rotate(-t.anim + this.time * 0.8);
        const r = cs * 0.2;
        ctx.fillStyle = th.src;
        ctx.globalAlpha = 0.25 + 0.1 * Math.sin(this.time * 3);
        circle(ctx, 0, 0, r * 1.9); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = th.src;
        ctx.lineWidth = Math.max(2, cs * 0.04);
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * TAU;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r * 1.2, Math.sin(a) * r * 1.2);
          ctx.lineTo(Math.cos(a) * r * 1.55, Math.sin(a) * r * 1.55);
          ctx.stroke();
        }
        circle(ctx, 0, 0, r); ctx.fill();
      } else if (this.bulbs.includes(i)) {
        const r = cs * 0.17;
        if (t.power > 0.02) {
          ctx.globalAlpha = t.power * (0.28 + 0.08 * Math.sin(this.time * 4 + i));
          ctx.fillStyle = th.glow;
          circle(ctx, 0, 0, r * 2.1); ctx.fill();
          ctx.globalAlpha = 1;
        }
        ctx.fillStyle = th.tile;
        circle(ctx, 0, 0, r); ctx.fill();
        ctx.strokeStyle = th.off;
        ctx.lineWidth = Math.max(2, cs * 0.05);
        ctx.stroke();
        if (t.power > 0.02) {
          ctx.globalAlpha = t.power;
          ctx.fillStyle = th.on;
          circle(ctx, 0, 0, r); ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
      ctx.restore();
    }

    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.life > 0.5 ? th.on : th.src;
      circle(ctx, p.x, p.y, p.r);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

function strokeSegs(ctx, segs) {
  ctx.beginPath();
  for (const [x, y] of segs) { ctx.moveTo(0, 0); ctx.lineTo(x, y); }
  ctx.stroke();
}

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
