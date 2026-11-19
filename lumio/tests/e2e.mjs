// Plays the real game in Chromium with a phone viewport: solves levels by
// clicking tiles, checks the win flow, daily challenge and shop. Screenshots go to tests/out/.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';

const root = new URL('../www/', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/json' };
const server = createServer(async (req, res) => {
  try {
    const p = join(root, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
    res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' });
    res.end(await readFile(p));
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const url = `http://localhost:${server.address().port}/`;
const out = new URL('./out/', import.meta.url).pathname;
await mkdir(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: process.env.LANG_TEST || 'it-IT', hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const ok = (cond, msg) => { if (!cond) throw new Error('FAIL: ' + msg); console.log('ok -', msg); };

await page.goto(url);
await page.screenshot({ path: out + '1-home.png' });

async function solveByClicking() {
  // Ask the board which taps are needed, then click each tile like a player would.
  const plan = await page.evaluate(() => {
    const b = window.__lumio.board;
    const rect = b.c.getBoundingClientRect();
    const rotate = (m) => ((m << 1) | (m >> 3)) & 15;
    return b.tiles.map((t, i) => {
      let k = 0, m = t.m;
      while (m !== t.sol && k < 4) { m = rotate(m); k++; }
      const { x, y } = b.center(i);
      return { k, x: rect.left + x, y: rect.top + y };
    }).filter((p) => p.k > 0);
  });
  for (const p of plan) for (let i = 0; i < p.k; i++) await page.mouse.click(p.x, p.y);
  return plan.reduce((s, p) => s + p.k, 0);
}

// Level 1
await page.click('#btn-play');
await page.waitForTimeout(400);
await page.screenshot({ path: out + '2-level1.png' });
const taps = await solveByClicking();
ok(await page.evaluate(() => window.__lumio.board.won), `level 1 solved with ${taps} taps`);
await page.waitForSelector('#modal:not(.hidden) #m-next');
await page.waitForTimeout(900);
await page.screenshot({ path: out + '3-win.png' });
ok((await page.evaluate(() => window.__lumio.state.level)) === 2, 'progress saved: now at level 2');
ok((await page.evaluate(() => window.__lumio.state.coins)) > 50, 'coins awarded');

// Next levels, use a hint on level 2
await page.click('#m-next');
await page.waitForTimeout(300);
await page.click('#btn-hint');
ok((await page.evaluate(() => window.__lumio.board.tiles.some((t) => t.locked))), 'hint locks a tile');
await solveByClicking();
await page.waitForSelector('#modal:not(.hidden) #m-next');
await page.click('#m-next');

// A mid-game level for a nicer screenshot
await page.evaluate(() => window.__lumio.startLevel(24));
await page.waitForTimeout(300);
for (let i = 0; i < 6; i++) {
  const b = await page.evaluate(() => { const b = window.__lumio.board, r = b.c.getBoundingClientRect(), c = b.center(b.p.src); return { x: r.left + c.x, y: r.top + c.y, cell: b.cell }; });
  await page.mouse.click(b.x + (i % 3 - 1) * b.cell, b.y + (i < 3 ? -b.cell : b.cell));
}
await page.waitForTimeout(500);
await page.screenshot({ path: out + '4-level24.png' });

// Daily challenge
await page.click('#btn-back');
await page.click('#btn-daily');
await page.waitForTimeout(300);
await solveByClicking();
await page.waitForSelector('#modal:not(.hidden) #m-next');
await page.waitForTimeout(1000);
await page.screenshot({ path: out + '5-daily-win.png' });
ok((await page.evaluate(() => window.__lumio.state.streak)) === 1, 'daily streak started');
await page.click('#m-next');

// Shop: buy & apply a theme
await page.evaluate(() => { window.__lumio.state.coins = 1000; });
await page.click('#btn-shop');
await page.locator('.theme-card', { hasText: 'Ember' }).locator('button').click();
ok((await page.evaluate(() => window.__lumio.state.theme)) === 'ember', 'theme bought and applied');
await page.screenshot({ path: out + '6-shop.png' });
await page.click('#btn-shop-back');
await page.screenshot({ path: out + '7-home-after.png' });

// Persistence across reload
await page.reload();
ok((await page.evaluate(() => JSON.parse(localStorage.getItem('lumio_save_v1')).level)) === 3, 'save survives reload');

ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
server.close();
