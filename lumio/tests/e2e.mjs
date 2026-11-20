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
    const cw = (m) => ((m << 1) | (m >> 3)) & 15;
    const ccw = (m) => ((m >> 1) | ((m & 1) << 3)) & 15;
    return b.tiles.map((t, i) => {
      let k = 0, m = t.m;
      if (t.kind === 1) return { k: 0 }; // fixed: already right
      while (m !== t.sol && k < 4) { m = t.kind === 2 ? ccw(m) : cw(m); k++; }
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

// Level 2: undo, then hint
await page.click('#m-next');
await page.waitForTimeout(300);
ok(await page.locator('#btn-undo').isDisabled(), 'undo disabled before any move');
const before = await page.evaluate(() => window.__lumio.board.tiles.map((t) => t.m).join());
const c0 = await page.evaluate(() => { const b = window.__lumio.board, r = b.c.getBoundingClientRect(), c = b.center(0); return { x: r.left + c.x, y: r.top + c.y }; });
await page.mouse.click(c0.x, c0.y);
await page.click('#btn-undo');
ok((await page.evaluate(() => window.__lumio.board.tiles.map((t) => t.m).join())) === before, 'undo restores the board');
await page.click('#btn-hint');
ok((await page.evaluate(() => window.__lumio.board.tiles.some((t) => t.locked))), 'hint locks a tile');
await solveByClicking();
await page.waitForSelector('#modal:not(.hidden) #m-next');
await page.click('#m-next');

ok((await page.evaluate(() => window.__lumio.state.achievements)).includes('first'), 'trophy "first" unlocked');

// Special tiles: level 46 has fixed and reverse tiles, and must be solvable by clicking
await page.evaluate(() => window.__lumio.startLevel(46));
await page.waitForTimeout(400);
const kinds = await page.evaluate(() => window.__lumio.board.tiles.map((t) => t.kind));
ok(kinds.includes(1) && kinds.includes(2), 'level 46 has fixed and reverse tiles');
await page.screenshot({ path: out + '4b-level46.png' });
const fixedIdx = kinds.indexOf(1);
const fm = await page.evaluate((i) => window.__lumio.board.tiles[i].m, fixedIdx);
const fc = await page.evaluate((i) => { const b = window.__lumio.board, r = b.c.getBoundingClientRect(), c = b.center(i); return { x: r.left + c.x, y: r.top + c.y }; }, fixedIdx);
await page.mouse.click(fc.x, fc.y);
ok((await page.evaluate((i) => window.__lumio.board.tiles[i].m, fixedIdx)) === fm, 'fixed tile does not rotate');
const t46 = await solveByClicking();
ok(await page.evaluate(() => window.__lumio.board.won), `level 46 solved by clicking (${t46} taps, reverse tiles turn the other way)`);
await page.waitForSelector('#modal:not(.hidden) #m-next');
await page.click('#m-next');
ok((await page.evaluate(() => window.__lumio.board.p.w * 1000 + window.__lumio.board.p.h)) > 0 && (await page.textContent('#g-title')).includes('47'), 'next after a replay goes to the following level');

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
await page.waitForTimeout(400);
await page.screenshot({ path: out + '7-home-after.png' });

// Level map and trophies
await page.click('#btn-levels');
await page.waitForTimeout(300);
ok((await page.locator('.lvl:not(.locked)').count()) === 3, 'level map shows the 3 unlocked levels');
await page.screenshot({ path: out + '8-levels.png' });
await page.locator('.lvl').first().click();
ok((await page.textContent('#g-title')).includes('1'), 'level map replays level 1');
await page.click('#btn-back');
await page.click('#btn-trophies');
await page.waitForTimeout(300);
const got = await page.evaluate(() => window.__lumio.state.achievements.length);
ok(got >= 1 && (await page.locator('.trophy.got').count()) === got, `trophies screen shows the ${got} unlocked trophy`);
await page.screenshot({ path: out + '9-trophies.png' });
await page.click('#btn-trophies-back');

// Persistence across reload
await page.reload();
ok((await page.evaluate(() => JSON.parse(localStorage.getItem('lumio_save_v1')).level)) === 3, 'save survives reload');

ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
server.close();
