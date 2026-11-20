// Native bridges (Capacitor) with web fallbacks: haptics, sound, share, ads.
// Everything degrades gracefully in a desktop browser.

const Cap = () => window.Capacitor?.Plugins || {};

// ---------- haptics ----------
export function haptic(kind = 'light', enabled = true) {
  if (!enabled) return;
  const H = Cap().Haptics;
  if (H) {
    if (kind === 'success') H.notification?.({ type: 'SUCCESS' });
    else H.impact?.({ style: kind === 'heavy' ? 'HEAVY' : kind === 'medium' ? 'MEDIUM' : 'LIGHT' });
  } else if (navigator.vibrate) {
    navigator.vibrate(kind === 'success' ? [20, 40, 30] : kind === 'heavy' ? 25 : 8);
  }
}

// ---------- sound (synthesized: no audio assets needed) ----------
let ac = null;
function audio() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}

function tone(freq, dur, { type = 'sine', vol = 0.12, delay = 0, slide = 0 } = {}) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5];

export const sfx = {
  enabled: true,
  // Pitch rises with progress: the board "sings" as you get closer.
  tap(progress = 0) {
    if (!this.enabled) return;
    tone(220 + progress * 220, 0.06, { type: 'triangle', vol: 0.08, slide: 1.4 });
  },
  bulb(n) {
    if (!this.enabled) return;
    tone(PENTA[n % PENTA.length], 0.35, { vol: 0.1 });
    tone(PENTA[n % PENTA.length] * 2, 0.25, { vol: 0.03, delay: 0.02 });
  },
  locked() { if (this.enabled) tone(140, 0.12, { type: 'square', vol: 0.04 }); },
  win() {
    if (!this.enabled) return;
    [0, 2, 4, 5, 7].forEach((k, i) => tone(PENTA[k], 0.5, { vol: 0.1, delay: i * 0.09 }));
  },
  coin() {
    if (!this.enabled) return;
    tone(1318, 0.08, { type: 'square', vol: 0.04 });
    tone(1760, 0.18, { type: 'square', vol: 0.04, delay: 0.07 });
  },
  star(i) { if (this.enabled) tone(PENTA[3 + i * 2], 0.3, { vol: 0.09 }); },
};

export function unlockAudio() { audio(); }

// ---------- share (the Wordle-style viral loop) ----------
export async function share(text) {
  const S = Cap().Share;
  try {
    if (S) { await S.share({ text, dialogTitle: 'Lumio' }); return 'shared'; }
    if (navigator.share) { await navigator.share({ text }); return 'shared'; }
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'cancelled';
  }
}

// ---------- streak reminder (local notification) ----------
// Asks for permission only when `ask` is true (after the first daily win),
// never on the first launch: a cold permission prompt is usually refused.
export async function scheduleReminder({ doneToday, title, body, ask = false }) {
  const LN = Cap().LocalNotifications;
  if (!LN) return;
  try {
    let perm = await LN.checkPermissions();
    if (perm.display !== 'granted') {
      if (!ask) return;
      perm = await LN.requestPermissions();
      if (perm.display !== 'granted') return;
    }
    await LN.cancel({ notifications: [{ id: 1 }] });
    const at = new Date();
    at.setHours(19, 0, 0, 0);
    if (doneToday || at <= new Date()) at.setDate(at.getDate() + 1);
    await LN.schedule({ notifications: [{ id: 1, title, body, schedule: { at, allowWhileIdle: true } }] });
  } catch { /* reminders are best-effort */ }
}

// ---------- ads ----------
// Production: install @capacitor-community/admob and replace the test IDs
// below with your own ad unit IDs from the AdMob console.
export const AD_UNITS = {
  android: { rewarded: 'ca-app-pub-3940256099942544/5224354917', interstitial: 'ca-app-pub-3940256099942544/1033173712' },
  ios: { rewarded: 'ca-app-pub-3940256099942544/1712485313', interstitial: 'ca-app-pub-3940256099942544/4411468910' },
};

function platform() {
  return window.Capacitor?.getPlatform?.() || 'web';
}

let adsReady = false;
async function initAds() {
  const A = Cap().AdMob;
  if (!A || adsReady) return A;
  await A.initialize({ initializeForTesting: true });
  adsReady = true;
  return A;
}

/** Rewarded ad. Resolves true if the user earned the reward. */
export async function showRewarded() {
  const A = await initAds().catch(() => null);
  if (A) {
    try {
      const id = AD_UNITS[platform()]?.rewarded;
      await A.prepareRewardVideoAd({ adId: id });
      const reward = await A.showRewardVideoAd();
      return !!reward;
    } catch { return false; }
  }
  return fakeAd('rewarded');
}

/** Interstitial, shown sparingly between levels. */
export async function showInterstitial() {
  const A = await initAds().catch(() => null);
  if (A) {
    try {
      await A.prepareInterstitial({ adId: AD_UNITS[platform()]?.interstitial });
      await A.showInterstitial();
    } catch { /* never block gameplay on ad errors */ }
    return;
  }
  // Web/dev build: no interstitials (keeps testing fast).
}

function fakeAd(kind) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'fake-ad';
    el.innerHTML = `<div><b>AD</b><small>${kind} demo · 2s</small></div>`;
    document.body.appendChild(el);
    setTimeout(() => { el.remove(); resolve(true); }, 2000);
  });
}
