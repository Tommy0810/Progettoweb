import { generate, levelConfig, dailyConfig, rushConfig, FIXED_FROM, REVERSE_FROM, LINKED_FROM } from './generator.js';
import { ACHIEVEMENTS, checkAchievements } from './achievements.js';
import { Board } from './board.js';
import { THEMES, applyTheme } from './themes.js';
import { haptic, sfx, unlockAudio, share, showRewarded, showInterstitial, scheduleReminder, setMusic } from './platform.js';
import { t, translateDom } from './i18n.js';
import { load, save, dateKey, yesterdayKey, dailyNumber } from './storage.js';

const HINT_COST = 30;
const FREE_COINS = 25;
const INTERSTITIAL_EVERY = 4;   // levels between interstitials
const INTERSTITIAL_AFTER = 8;   // no ads at all during the first levels
const RUSH_FROM = 6;            // Time Attack unlocks once the basics are learned
const RUSH_START = 60;          // seconds on the clock
const RUSH_BONUS = 8;           // seconds added per solved puzzle
const GIFTS = [                 // 7-day gift calendar
  { coins: 20 }, { coins: 30 }, { coins: 40, hints: 1 }, { coins: 50 },
  { coins: 60 }, { coins: 80, hints: 1 }, { coins: 150, hints: 2 },
];

const S = load();
let theme = applyTheme(S.theme);
sfx.enabled = S.sound;

const $ = (sel) => document.querySelector(sel);
let mode = null;     // { type: 'level', level, cfg } | { type: 'daily', key } | { type: 'rush' }
let rush = null;     // Time Attack state while a run is in progress
let audioUnlocked = false;
let puzzle = null;
let hintsThisLevel = 0;

const board = new Board($('#board'), {
  onTap: (taps, progress) => {
    sfx.tap(progress);
    haptic('light', S.haptics);
    updateHud();
  },
  onBulb: (lit) => {
    sfx.bulb(lit);
    haptic('medium', S.haptics);
  },
  onLocked: () => {
    sfx.locked();
    haptic('heavy', S.haptics);
  },
  onSolved: () => {
    sfx.win();
    haptic('success', S.haptics);
    $('#tutorial').classList.remove('show');
    if (rush) rush.paused = true; // the celebration doesn't eat the clock
  },
  onWin: (r) => (mode.type === 'rush' ? rushSolved() : onWin(r)),
});

// ---------------- screens ----------------
function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  if (id !== 'game') board.stop();
}

function refreshCoins() {
  document.querySelectorAll('[data-coins]').forEach((el) => (el.textContent = S.coins));
}

function animateCoins(from, to) {
  const start = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - start) / 700);
    const v = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
    document.querySelectorAll('[data-coins]').forEach((el) => (el.textContent = v));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function renderHome() {
  refreshCoins();
  $('#trophy-count').textContent = `${S.achievements.length}/${ACHIEVEMENTS.length}`;
  $('#play-level').textContent = `${t('level')} ${S.level}`;
  const doneToday = S.lastDaily === dateKey();
  $('#daily-info').textContent = doneToday ? t('dailyDone') : t('dailyNew', { n: dailyReward(nextStreak()) });
  $('#btn-daily').classList.toggle('done', doneToday);
  $('#btn-daily').classList.toggle('pulse', !doneToday);
  const rushOpen = S.level >= RUSH_FROM;
  $('#rush-info').textContent = !rushOpen ? t('rushLocked', { n: RUSH_FROM })
    : S.rushBest ? t('rushBest', { n: S.rushBest }) : t('rushNew');
  $('#btn-rush').classList.toggle('done', !rushOpen);
  $('#btn-gift').classList.toggle('hidden', !giftAvailable());
  const alive = S.lastDaily === dateKey() || S.lastDaily === yesterdayKey();
  $('#streak-home').textContent = alive && S.streak > 0 ? (S.streak === 1 ? t('streakOne') : t('streak', { n: S.streak })) : '';
}

// ---------------- game flow ----------------
function startLevel(level) {
  const cfg = levelConfig(level);
  mode = { type: 'level', level, cfg };
  puzzle = generate(cfg);
  $('#g-title').textContent = cfg.boss ? `⚡ ${t('boss')} ${level}` : cfg.breather ? `🌙 ${t('level')} ${level}` : `${t('level')} ${level}`;
  const tut = { 1: t('tut1'), 2: t('tut2'), [FIXED_FROM]: t('tutFixed'), [REVERSE_FROM]: t('tutReverse'), [LINKED_FROM]: t('tutLinked') }[level] || '';
  $('#tutorial').textContent = tut;
  $('#tutorial').classList.toggle('show', !!tut);
  enterGame();
}

function startDaily() {
  const key = dateKey();
  mode = { type: 'daily', key };
  puzzle = generate(dailyConfig(key));
  $('#g-title').textContent = `☀️ ${t('dailyLabel', { n: dailyNumber() })}`;
  $('#tutorial').classList.remove('show');
  enterGame();
}

function enterGame() {
  showScreen('game');
  $('#game').classList.toggle('rush', mode.type === 'rush');
  refreshCoins();
  hintsThisLevel = 0;
  board.load(puzzle, theme);
  updateHud();
}

function updateHud() {
  const sub = $('#g-sub');
  if (rush) {
    sub.textContent = t('rushHud', { s: Math.max(0, Math.ceil(rush.time)), n: rush.score });
    sub.classList.toggle('low', rush.time < 10);
  } else {
    sub.textContent = `${t('taps')}: ${board.taps} · ${t('par')} ${puzzle.par}`;
    sub.classList.remove('low');
  }
  $('#hint-count').textContent = S.freeHints > 0 ? S.freeHints : `${HINT_COST}🪙`;
  $('#btn-undo').disabled = !board.canUndo();
}

function starsFor(taps, par) {
  if (taps <= par) return 3;
  if (taps <= par + Math.ceil(par * 0.5)) return 2;
  return 1;
}

function nextStreak() {
  if (S.lastDaily === dateKey()) return S.streak;
  return S.lastDaily === yesterdayKey() ? S.streak + 1 : 1;
}

function dailyReward(streak) {
  return 50 + 10 * Math.min(streak, 7);
}

function onWin({ taps, par }) {
  const stars = starsFor(taps, par);
  const before = S.coins;
  let reward;
  let extra = '';
  let shareWhat;

  if (mode.type === 'level') {
    const n = mode.level;
    const firstClear = n === S.level;
    reward = firstClear ? 5 + stars * 5 : 2;
    S.stars[n] = Math.max(S.stars[n] || 0, stars);
    if (firstClear) S.level = n + 1;
    if (mode.cfg.boss && hintsThisLevel === 0) S.stats.bossNoHint++;
    shareWhat = `${t('level')} ${n}`;
  } else {
    const firstToday = S.lastDaily !== mode.key;
    if (firstToday) {
      S.streak = nextStreak();
      S.bestStreak = Math.max(S.bestStreak, S.streak);
      S.lastDaily = mode.key;
      reward = dailyReward(S.streak);
    } else {
      reward = 0;
    }
    extra = `<p class="streak-big">${S.streak > 1 ? t('streakLong', { n: S.streak }) : t('streakFirst')}</p><p class="muted">${t('bestStreak', { n: S.bestStreak })}</p>`;
    shareWhat = t('dailyLabel', { n: dailyNumber() });
  }
  S.coins += reward;
  S.stats.wins++;
  const trophies = checkAchievements(S);
  save(S);
  if (mode.type === 'daily') remind(true); // first good moment to ask for notifications

  const starsHtml = [0, 1, 2].map((i) => `<span class="star ${i < stars ? 'on' : ''}" style="animation-delay:${0.15 + i * 0.18}s">★</span>`).join('');
  openModal(`
    <h2>${t('solved')}</h2>
    <div class="stars">${starsHtml}</div>
    <p class="muted">${t('taps')}: ${taps} · ${t('par')} ${par}</p>
    ${reward ? `<p class="reward">+${reward} 🪙</p>` : ''}
    ${extra}
    <div class="row">
      ${reward ? `<button class="btn small" id="m-double">${t('double')}</button>` : ''}
      <button class="btn small" id="m-share">${t('share')}</button>
    </div>
    <button class="btn primary big" id="m-next">${mode.type === 'level' ? t('next') + ' →' : t('home')}</button>
  `, { dismissable: false });

  [0, 1, 2].forEach((i) => { if (i < stars) setTimeout(() => { sfx.star(i); haptic('light', S.haptics); }, 150 + i * 180); });
  setTimeout(() => { if (reward || trophies.length) { sfx.coin(); animateCoins(before, S.coins); } }, 700);
  trophies.forEach((a, k) => setTimeout(() => announceTrophy(a), 1500 + k * 2000));

  $('#m-double')?.addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    if (await showRewarded()) {
      const b = S.coins;
      S.coins += reward;
      save(S);
      sfx.coin();
      animateCoins(b, S.coins);
      e.currentTarget.textContent = `+${reward} 🪙 ✓`;
    } else {
      e.currentTarget.disabled = false;
    }
  });

  $('#m-share').addEventListener('click', async () => {
    const text = t('shareText', { what: shareWhat, taps, stars: '⭐'.repeat(stars) });
    if ((await share(text)) === 'copied') toast(t('copied'));
  });

  $('#m-next').addEventListener('click', async () => {
    closeModal();
    if (mode.type === 'daily') {
      renderHome();
      showScreen('home');
      return;
    }
    S.levelsSinceAd++;
    save(S);
    if (!S.noAds && S.level > INTERSTITIAL_AFTER && S.levelsSinceAd >= INTERSTITIAL_EVERY) {
      S.levelsSinceAd = 0;
      save(S);
      await showInterstitial();
    }
    startLevel(mode.level + 1);
  });
}

// ---------------- Time Attack ----------------
function startRush() {
  if (S.level < RUSH_FROM) {
    toast(t('rushLocked', { n: RUSH_FROM }));
    haptic('heavy', S.haptics);
    return;
  }
  stopRush();
  mode = { type: 'rush' };
  rush = { score: 0, time: RUSH_START, paused: false, last: performance.now(), timer: 0 };
  $('#g-title').textContent = t('rushTitle');
  $('#tutorial').classList.remove('show');
  nextRushPuzzle();
  rush.timer = setInterval(rushTick, 100);
}

function nextRushPuzzle() {
  puzzle = generate(rushConfig(rush.score, (Math.random() * 2 ** 32) >>> 0));
  enterGame();
}

function rushTick() {
  const now = performance.now();
  const dt = (now - rush.last) / 1000;
  rush.last = now;
  if (rush.paused || document.hidden) return;
  rush.time -= dt;
  updateHud();
  if (rush.time <= 0) endRush();
}

function rushSolved() {
  rush.score++;
  rush.time += RUSH_BONUS;
  rush.paused = false;
  rush.last = performance.now();
  toast(t('rushBonus', { n: RUSH_BONUS }));
  nextRushPuzzle();
}

function stopRush() {
  if (rush) clearInterval(rush.timer);
  rush = null;
  $('#toast').classList.remove('show'); // drop a leftover "+8s"
}

function endRush() {
  const score = rush.score;
  stopRush();
  board.frozen = true;
  sfx.locked();
  haptic('heavy', S.haptics);
  const record = score > S.rushBest;
  S.rushBest = Math.max(S.rushBest, score);
  const reward = score * 4;
  const before = S.coins;
  S.coins += reward;
  const trophies = checkAchievements(S);
  save(S);
  openModal(`
    <h2>${t('timeUp')}</h2>
    <p class="big-score">${score}</p>
    <p class="muted">${t('rushScore', { n: score })}</p>
    ${record && score > 0 ? `<p class="streak-big">${t('newRecord')}</p>` : `<p class="muted">${t('rushBest', { n: S.rushBest })}</p>`}
    ${reward ? `<p class="reward">+${reward} 🪙</p>` : ''}
    <div class="row">
      <button class="btn small" id="r-share">${t('share')}</button>
      <button class="btn small" id="r-home">${t('home')}</button>
    </div>
    <button class="btn primary big" id="r-retry">${t('retry')} ↻</button>
  `, { dismissable: false });
  if (reward || trophies.length) setTimeout(() => { sfx.coin(); animateCoins(before, S.coins); }, 500);
  trophies.forEach((a, k) => setTimeout(() => announceTrophy(a), 1300 + k * 2000));
  $('#r-share').addEventListener('click', async () => {
    if ((await share(t('rushShare', { n: score }))) === 'copied') toast(t('copied'));
  });
  $('#r-home').addEventListener('click', goHome);
  $('#r-retry').addEventListener('click', () => { closeModal(); startRush(); });
}

// ---------------- daily gift ----------------
function giftAvailable() {
  return S.level > 1 && S.lastGift !== dateKey();
}

function giftIndex() {
  return S.lastGift === yesterdayKey() ? S.giftNext : 0; // missing a day restarts the calendar
}

function openGift() {
  if (!giftAvailable()) return;
  const idx = giftIndex();
  const days = GIFTS.map((g, i) => `
    <div class="gift-day ${i < idx ? 'claimed' : i === idx ? 'today' : ''}">
      <small>${t('giftDay', { n: i + 1 })}</small>
      <b>${i < idx ? '✓' : i === GIFTS.length - 1 ? '🎁' : '🪙'}</b>
      <span>${g.coins}${g.hints ? ' ' + t('giftHint', { n: g.hints }) : ''}</span>
    </div>`).join('');
  openModal(`
    <h2>${t('giftTitle')}</h2>
    <p class="muted">${t('giftSub')}</p>
    <div class="gift-grid">${days}</div>
    <button class="btn primary big" id="g-claim">${t('claim')}</button>
    <button class="btn" id="g-double">${t('claimDouble')}</button>
  `);
  $('#g-claim').addEventListener('click', () => claimGift(idx, 1));
  $('#g-double').addEventListener('click', async () => {
    if (await showRewarded()) claimGift(idx, 2);
  });
}

function claimGift(idx, mult) {
  if (!giftAvailable()) return;
  const g = GIFTS[idx];
  const before = S.coins;
  S.coins += g.coins * mult;
  S.freeHints += g.hints || 0;
  S.lastGift = dateKey();
  S.giftNext = (idx + 1) % GIFTS.length;
  save(S);
  closeModal();
  sfx.coin();
  haptic('success', S.haptics);
  animateCoins(before, S.coins);
  renderHome();
}

function announceTrophy(a) {
  toast(t('trophyToast', { name: `${a.icon} ${t('ach_' + a.id)}`, n: a.reward }));
  sfx.star(2);
  haptic('success', S.haptics);
}

function remind(ask = false) {
  const alive = S.lastDaily === dateKey() || S.lastDaily === yesterdayKey();
  scheduleReminder({
    ask,
    doneToday: S.lastDaily === dateKey(),
    title: t('remindTitle'),
    body: alive && S.streak > 0 ? t('remindStreak', { n: S.streak }) : t('remindNew'),
  });
}

// ---------------- hints ----------------
function requestHint() {
  if (board.won) return;
  if (S.freeHints > 0) {
    S.freeHints--;
    save(S);
    applyHint();
    return;
  }
  openModal(`
    <h2>${t('hintTitle')}</h2>
    <button class="btn primary" id="h-buy">${t('hintBuy', { n: HINT_COST })}</button>
    <button class="btn" id="h-ad">${t('hintAd')}</button>
    <button class="btn ghost" id="h-close">${t('close')}</button>
  `);
  $('#h-buy').addEventListener('click', () => {
    if (S.coins < HINT_COST) { toast(t('noCoins')); haptic('heavy', S.haptics); return; }
    S.coins -= HINT_COST;
    save(S);
    refreshCoins();
    closeModal();
    applyHint();
  });
  $('#h-ad').addEventListener('click', async () => {
    closeModal();
    if (await showRewarded()) applyHint();
  });
  $('#h-close').addEventListener('click', closeModal);
}

function applyHint() {
  if (board.hint()) {
    sfx.bulb(5);
    haptic('medium', S.haptics);
    hintsThisLevel++;
    S.stats.hints++;
    save(S);
  }
  updateHud();
}

// ---------------- shop ----------------
function renderShop() {
  refreshCoins();
  const list = $('#shop-list');
  list.innerHTML = '';
  for (const [key, th] of Object.entries(THEMES)) {
    const owned = S.owned.includes(key);
    const selected = S.theme === key;
    const card = document.createElement('div');
    card.className = 'theme-card' + (selected ? ' selected' : '');
    card.innerHTML = `
      <div class="swatch" style="background:linear-gradient(135deg,${th.bg},${th.bg2})">
        <i style="background:${th.on};box-shadow:0 0 12px ${th.glow}"></i><i style="background:${th.src}"></i><i style="background:${th.off}"></i>
      </div>
      <div class="theme-name">${th.name}</div>
      <button class="btn small ${selected ? 'ghost' : owned ? '' : 'primary'}">${selected ? t('selected') : owned ? t('owned') : t('buy', { n: th.price })}</button>`;
    card.querySelector('button').addEventListener('click', () => {
      if (selected) return;
      if (!owned) {
        if (S.coins < th.price) { toast(t('noCoins')); haptic('heavy', S.haptics); return; }
        S.coins -= th.price;
        S.owned.push(key);
        sfx.coin();
      }
      S.theme = key;
      theme = applyTheme(key);
      board.setTheme(theme);
      const trophies = checkAchievements(S);
      save(S);
      renderShop();
      trophies.forEach((a, k) => setTimeout(() => announceTrophy(a), 400 + k * 2000));
    });
    list.appendChild(card);
  }
}

// ---------------- level map ----------------
function renderLevels() {
  refreshCoins();
  const grid = $('#levels-grid');
  grid.innerHTML = '';
  const last = S.level + 4; // show a few locked ones as a teaser
  for (let n = 1; n <= last; n++) {
    const b = document.createElement('button');
    const locked = n > S.level;
    const stars = S.stars[n] || 0;
    const cfg = levelConfig(n);
    b.className = 'lvl' + (locked ? ' locked' : '') + (n === S.level ? ' current' : '') + (cfg.boss ? ' boss' : '');
    b.innerHTML = locked
      ? `<b>🔒</b>`
      : `<b>${n}</b><small>${n === S.level ? '▶' : '★'.repeat(stars) + '☆'.repeat(3 - stars)}</small>`;
    if (!locked) b.addEventListener('click', () => startLevel(n));
    grid.appendChild(b);
  }
  requestAnimationFrame(() => grid.querySelector('.current')?.scrollIntoView({ block: 'center' }));
}

// ---------------- trophies ----------------
function renderTrophies() {
  refreshCoins();
  const list = $('#trophy-list');
  list.innerHTML = '';
  for (const a of ACHIEVEMENTS) {
    const got = S.achievements.includes(a.id);
    const row = document.createElement('div');
    row.className = 'trophy' + (got ? ' got' : '');
    row.innerHTML = `<span class="t-icon">${got ? a.icon : '🔒'}</span>
      <div class="t-text"><b>${t('ach_' + a.id)}</b><small>${t('ach_' + a.id + '_d')}</small></div>
      <span class="t-reward">${got ? '✓' : '+' + a.reward + ' 🪙'}</span>`;
    list.appendChild(row);
  }
}

async function freeCoins() {
  if (await showRewarded()) {
    const b = S.coins;
    S.coins += FREE_COINS;
    save(S);
    sfx.coin();
    animateCoins(b, S.coins);
  }
}

// ---------------- settings ----------------
function openSettings() {
  const stars = Object.values(S.stars);
  const stat = (k, v) => `<div class="stat"><b>${v}</b><small>${t(k)}</small></div>`;
  openModal(`
    <h2>${t('settings')}</h2>
    <label class="toggle"><span>${t('music')}</span><input type="checkbox" id="s-music" ${S.music ? 'checked' : ''}></label>
    <label class="toggle"><span>${t('sound')}</span><input type="checkbox" id="s-sound" ${S.sound ? 'checked' : ''}></label>
    <label class="toggle"><span>${t('haptics')}</span><input type="checkbox" id="s-hap" ${S.haptics ? 'checked' : ''}></label>
    <h3>${t('stats')}</h3>
    <div class="stats">
      ${stat('st_levels', S.level - 1)}
      ${stat('st_stars', stars.reduce((a, b) => a + b, 0))}
      ${stat('st_perfect', stars.filter((v) => v === 3).length)}
      ${stat('st_streak', S.bestStreak)}
      ${stat('st_rush', S.rushBest)}
      ${stat('st_hints', S.stats.hints)}
    </div>
    <button class="btn ghost" id="s-close">${t('close')}</button>
  `);
  $('#s-music').addEventListener('change', (e) => { S.music = e.target.checked; save(S); setMusic(S.music); });
  $('#s-sound').addEventListener('change', (e) => { S.sound = sfx.enabled = e.target.checked; save(S); });
  $('#s-hap').addEventListener('change', (e) => { S.haptics = e.target.checked; save(S); });
  $('#s-close').addEventListener('click', closeModal);
}

// ---------------- modal & toast ----------------
let modalDismissable = true;
function openModal(html, { dismissable = true } = {}) {
  modalDismissable = dismissable;
  $('#modal-card').innerHTML = html;
  $('#modal').classList.remove('hidden');
}
function closeModal() { $('#modal').classList.add('hidden'); }
function modalOpen() { return !$('#modal').classList.contains('hidden'); }

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

// ---------------- wiring ----------------
function goHome() {
  stopRush();
  closeModal();
  renderHome();
  showScreen('home');
}

translateDom();
renderHome();
remind(); // refresh tomorrow's reminder (only if permission was already granted)

document.addEventListener('pointerdown', () => {
  unlockAudio();
  audioUnlocked = true;
  if (S.music) setMusic(true);
}, { once: true });
if (giftAvailable()) setTimeout(openGift, 700);
$('#btn-rush').addEventListener('click', startRush);
$('#btn-gift').addEventListener('click', openGift);
$('#btn-play').addEventListener('click', () => startLevel(S.level));
$('#btn-daily').addEventListener('click', startDaily);
$('#btn-shop').addEventListener('click', () => { renderShop(); showScreen('shop'); });
$('#btn-shop-back').addEventListener('click', goHome);
$('#btn-levels').addEventListener('click', () => { showScreen('levels'); renderLevels(); });
$('#btn-levels-back').addEventListener('click', goHome);
$('#btn-trophies').addEventListener('click', () => { renderTrophies(); showScreen('trophies'); });
$('#btn-trophies-back').addEventListener('click', goHome);
$('#btn-undo').addEventListener('click', () => { if (board.undo()) { sfx.tap(0); haptic('light', S.haptics); } updateHud(); });
$('#btn-free-coins').addEventListener('click', freeCoins);
$('#btn-settings').addEventListener('click', openSettings);
$('#btn-back').addEventListener('click', goHome);
$('#btn-restart').addEventListener('click', () => { if (!board.won) { board.load(puzzle, theme); updateHud(); } });
$('#btn-hint').addEventListener('click', requestHint);
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' && modalDismissable) closeModal(); });

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    board.stop();
    setMusic(false);
  } else {
    if ($('#game').classList.contains('active')) board.start();
    if (S.music && audioUnlocked) setMusic(true);
  }
});

// Android hardware back button.
window.Capacitor?.Plugins?.App?.addListener?.('backButton', () => {
  if (modalOpen()) { if (modalDismissable) closeModal(); return; }
  if (!$('#home').classList.contains('active')) { goHome(); return; }
  window.Capacitor.Plugins.App.exitApp();
});

// Exposed for automated tests only.
window.__lumio = { board, state: S, startLevel, startDaily, getRush: () => rush };
