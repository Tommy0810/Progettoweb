import { generate, levelConfig, dailyConfig } from './generator.js';
import { Board } from './board.js';
import { THEMES, applyTheme } from './themes.js';
import { haptic, sfx, unlockAudio, share, showRewarded, showInterstitial } from './platform.js';
import { t, translateDom } from './i18n.js';
import { load, save, dateKey, yesterdayKey, dailyNumber } from './storage.js';

const HINT_COST = 30;
const FREE_COINS = 25;
const INTERSTITIAL_EVERY = 4;   // levels between interstitials
const INTERSTITIAL_AFTER = 8;   // no ads at all during the first levels

const S = load();
let theme = applyTheme(S.theme);
sfx.enabled = S.sound;

const $ = (sel) => document.querySelector(sel);
let mode = null;     // { type: 'level', level, cfg } | { type: 'daily', key }
let puzzle = null;

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
  },
  onWin: (r) => onWin(r),
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
  $('#play-level').textContent = `${t('level')} ${S.level}`;
  const doneToday = S.lastDaily === dateKey();
  $('#daily-info').textContent = doneToday ? t('dailyDone') : t('dailyNew', { n: dailyReward(nextStreak()) });
  $('#btn-daily').classList.toggle('done', doneToday);
  $('#btn-daily').classList.toggle('pulse', !doneToday);
  const alive = S.lastDaily === dateKey() || S.lastDaily === yesterdayKey();
  $('#streak-home').textContent = alive && S.streak > 0 ? t('streak', { n: S.streak }) : '';
}

// ---------------- game flow ----------------
function startLevel(level) {
  const cfg = levelConfig(level);
  mode = { type: 'level', level, cfg };
  puzzle = generate(cfg);
  $('#g-title').textContent = cfg.boss ? `⚡ ${t('boss')} ${level}` : cfg.breather ? `🌙 ${t('level')} ${level}` : `${t('level')} ${level}`;
  const tut = level === 1 ? t('tut1') : level === 2 ? t('tut2') : '';
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
  refreshCoins();
  board.load(puzzle, theme);
  updateHud();
}

function updateHud() {
  $('#g-sub').textContent = `${t('taps')}: ${board.taps} · ${t('par')} ${puzzle.par}`;
  $('#hint-count').textContent = S.freeHints > 0 ? S.freeHints : `${HINT_COST}🪙`;
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
  save(S);

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
  setTimeout(() => { if (reward) { sfx.coin(); animateCoins(before, S.coins); } }, 700);

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
    startLevel(S.level);
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
  if (board.hint()) { sfx.bulb(5); haptic('medium', S.haptics); }
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
      save(S);
      renderShop();
    });
    list.appendChild(card);
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
  openModal(`
    <h2>${t('settings')}</h2>
    <label class="toggle"><span>${t('sound')}</span><input type="checkbox" id="s-sound" ${S.sound ? 'checked' : ''}></label>
    <label class="toggle"><span>${t('haptics')}</span><input type="checkbox" id="s-hap" ${S.haptics ? 'checked' : ''}></label>
    <button class="btn ghost" id="s-close">${t('close')}</button>
  `);
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
  closeModal();
  renderHome();
  showScreen('home');
}

translateDom();
renderHome();

document.addEventListener('pointerdown', unlockAudio, { once: true });
$('#btn-play').addEventListener('click', () => startLevel(S.level));
$('#btn-daily').addEventListener('click', startDaily);
$('#btn-shop').addEventListener('click', () => { renderShop(); showScreen('shop'); });
$('#btn-shop-back').addEventListener('click', goHome);
$('#btn-free-coins').addEventListener('click', freeCoins);
$('#btn-settings').addEventListener('click', openSettings);
$('#btn-back').addEventListener('click', goHome);
$('#btn-restart').addEventListener('click', () => { if (!board.won) { board.load(puzzle, theme); updateHud(); } });
$('#btn-hint').addEventListener('click', requestHint);
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' && modalDismissable) closeModal(); });

document.addEventListener('visibilitychange', () => {
  if (document.hidden) board.stop();
  else if ($('#game').classList.contains('active')) board.start();
});

// Android hardware back button.
window.Capacitor?.Plugins?.App?.addListener?.('backButton', () => {
  if (modalOpen()) { if (modalDismissable) closeModal(); return; }
  if (!$('#home').classList.contains('active')) { goHome(); return; }
  window.Capacitor.Plugins.App.exitApp();
});

// Exposed for automated tests only.
window.__lumio = { board, state: S, startLevel, startDaily };
