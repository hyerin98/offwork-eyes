const $ = (id) => document.getElementById(id);
const root = $('root');
const bubble = $('bubble');
const text = $('text');
const buddy = $('buddy');
const eyes = $('eyes');
const eyeGroup = $('lids');

const VIEW_W = 200;          // svg viewBox width
const EYE_X = [59, 141];
const EYE_Y = 60;
const REACH = 120;           // svg units: distance where pupils hit the edge

let settings = null;
let geo = null;
let cursor = null;
let dragging = false;
let happy = false;
let lastMsg = '';
let lastLook = '';
let rig = { looks: [], maxOff: [] }; // pupil groups + per-eye travel limits
let minuteTimer = null;

// ---------- layout ----------

function measure() {
  const r = eyes.getBoundingClientRect();
  const k = r.width / VIEW_W;
  geo = { k, centers: EYE_X.map((x) => ({ x: r.left + x * k, y: r.top + EYE_Y * k })) };
  if (cursor) look(cursor[0], cursor[1], true);
}

function rectOf(el, pad = 8) { // covers the bubble's pixel outline and drop shadow
  const r = el.getBoundingClientRect();
  return { x: r.left - pad, y: r.top - pad, w: r.width + pad * 2, h: r.height + pad * 2 };
}

function relayout() {
  requestAnimationFrame(() => {
    measure();
    api.setHitRects([rectOf(bubble), rectOf(buddy)]);
  });
}

// ---------- eyes ----------

const prev = [[0, 0], [0, 0]];

function lookOne(i, x, y, force) {
  const el = rig.looks[i];
  if (!el) return;
  const c = geo.centers[i];
  const lim = rig.maxOff[i];
  const dx = x - c.x;
  const dy = y - c.y;
  const d = Math.hypot(dx, dy) || 1;
  const t = Math.min(1, d / (REACH * geo.k));
  const e = 1 - (1 - t) * (1 - t); // ease-out
  const tx = (dx / d) * e * lim.x;
  const ty = (dy / d) * e * (dy < 0 ? lim.up : lim.y);
  const p = prev[i];
  if (!force && Math.abs(tx - p[0]) < 0.4 && Math.abs(ty - p[1]) < 0.4) return; // skip sub-pixel repaints
  p[0] = tx;
  p[1] = ty;
  el.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px)`;
}

function look(x, y, force = false) {
  if (!geo) return;
  lookOne(0, x, y, force);
  lookOne(1, x, y, force);
}

api.onCursor((x, y) => {
  cursor = [x, y];
  look(x, y);
});

function renderPupils(s) {
  const key = `${s.pupilShape}|${s.pupilColor}|${s.pupilSize}`;
  if (key === lastLook) return;
  lastLook = key;
  rig = Eyes.render(eyeGroup, s.pupilShape, { pupilColor: s.pupilColor, pupilSize: s.pupilSize, motionFaces: true });
  prev[0] = [0, 0];
  prev[1] = [0, 0];
  if (cursor) look(cursor[0], cursor[1], true);
}

function scheduleBlink() {
  setTimeout(() => {
    if (!happy && !dragging) {
      eyes.classList.add('blink');
      setTimeout(() => eyes.classList.remove('blink'), 130);
      if (Math.random() < 0.2) {
        setTimeout(() => eyes.classList.add('blink'), 260);
        setTimeout(() => eyes.classList.remove('blink'), 390);
      }
    }
    scheduleBlink();
  }, 2500 + Math.random() * 5500);
}

// ---------- motions ----------
// One-shot CSS animations on the body, played now and then. Nothing runs
// between them, so an idle widget still costs nothing.

const IDLE = ['bounce', 'whine', 'stretch', 'spin', 'jelly', 'dance', 'walk', 'wink', 'roll', 'bow'];
const GAP = [30000, 60000]; // ms between idle motions, picked at random
let playing = '';
let motionTimer = null;
let asleep = false; // screen locked or suspended
let lastIdle = '';

const moving = () => settings && settings.motion !== false;

let motionEnd = null;

function stopMotion() {
  clearTimeout(motionEnd);
  if (playing) root.classList.remove(`m-${playing}`, 'faces');
  playing = '';
}

function play(name) {
  if (!moving()) return;
  stopMotion();
  void root.offsetWidth; // restart the animation if the same one is playing
  playing = name;
  // motion faces (eye layers from shapes.js) only over the chosen expression,
  // not over the ^ ^ eyes at off time
  root.classList.add(`m-${name}`);
  root.classList.toggle('faces', !happy);
  if (SFX[name] && sfxOn()) SFX[name]();
  // animationend can be missed while the window isn't painted (e.g. covered),
  // and a stuck `playing` would stop idle motions for good
  motionEnd = setTimeout(stopMotion, 2600);
}

buddy.addEventListener('animationend', (e) => {
  if (e.target === buddy) stopMotion();
});

function hop() { play('hop'); }

// never the same one twice in a row; no wink at off time (the eyes are already ^ ^)
function randomIdle() {
  const pool = IDLE.filter((m) => m !== lastIdle && !(happy && m === 'wink'));
  lastIdle = pool[Math.floor(Math.random() * pool.length)];
  play(lastIdle);
}

function scheduleMotion() {
  clearTimeout(motionTimer);
  if (!moving() || asleep) return;
  motionTimer = setTimeout(() => {
    if (!dragging && !playing) randomIdle();
    scheduleMotion();
  }, GAP[0] + Math.random() * (GAP[1] - GAP[0]));
}

// a click (not a drag) squishes the body; the main process tells us which it was
api.onPoke(() => play('squish'));

const chimeOn = () => settings && settings.hourlyChime && !asleep;

// ---------- sound ("slime pop") ----------
// Bubbly pops and wobbly slides for the motions, the hourly chime and the
// off-work fanfare, all synthesized with WebAudio (no sound files ship with the
// app). They share one AudioContext that is closed a few seconds after the
// last sound ends, so no audio thread stays alive in between.

const SFX_GAIN = 0.28; // same as the sketch's max volume, which sounded right
let sfxCtx = null;
let sfxUntil = 0;
let sfxClose = null;

const sfxOn = () => settings && settings.sfx !== false && !asleep;

function sfxAudio(seconds) {
  if (!sfxCtx) {
    try { sfxCtx = new AudioContext(); } catch { return null; }
    sfxUntil = 0;
  }
  sfxUntil = Math.max(sfxUntil, sfxCtx.currentTime + seconds);
  clearTimeout(sfxClose);
  sfxClose = setTimeout(() => {
    sfxCtx.close();
    sfxCtx = null;
  }, (sfxUntil - sfxCtx.currentTime) * 1000 + 1500);
  return sfxCtx;
}

// one voice: pitch glides f0 -> f1, optional vibrato (vib Hz deep at `rate` Hz)
function tone(t, f0, f1, d, { v = 1, vib = 0, rate = 20, glide = 1, att = 0.008 } = {}) {
  const ctx = sfxAudio(t + d + 0.1);
  if (!ctx) return;
  const s = ctx.currentTime + 0.03 + t;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(f0, s);
  osc.frequency.exponentialRampToValueAtTime(f1, s + d * glide);
  if (vib) {
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = rate;
    depth.gain.setValueAtTime(vib, s);
    depth.gain.exponentialRampToValueAtTime(0.5, s + d);
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(s);
    lfo.stop(s + d + 0.02);
  }
  env.gain.setValueAtTime(0.0001, s);
  env.gain.exponentialRampToValueAtTime(SFX_GAIN * v, s + att);
  env.gain.exponentialRampToValueAtTime(0.0001, s + d);
  osc.connect(env).connect(ctx.destination);
  osc.start(s);
  osc.stop(s + d + 0.02);
}

// building blocks
const pop = (t, f0, f1, v = 1) => tone(t, f0, f1, 0.06, { glide: 0.5, att: 0.003, v });
const slide = (t, f0, f1, d, wob = 0.12) => tone(t, f0, f1, d, { vib: f0 * wob, rate: 21, v: 0.8 });
const press = (t) => pop(t, 180, 620);
const land = (t) => { tone(t, 140, 520, 0.07, { glide: 0.4, att: 0.003 }); tone(t + 0.06, 500, 180, 0.1, { v: 0.6 }); };
const note = (t, f, d) => tone(t, f * 0.5, f, Math.max(d, 0.1), { glide: 0.25, att: 0.003, v: 0.8 });

// hourly: three notes going down ("ding-dong-dang")
const chime = () => { note(0, 784, 0.12); note(0.16, 659, 0.12); note(0.32, 523, 0.3); };
// off time: do-mi-sol, then a long wobbly high do
const fanfare = () => {
  note(0, 523, 0.11);
  note(0.12, 659, 0.11);
  note(0.24, 784, 0.11);
  tone(0.38, 523, 1047, 0.6, { glide: 0.12, att: 0.003, vib: 42, rate: 9, v: 0.8 });
};

// timings line up with the keyframes in style.css
const SFX = {
  squish: () => { press(0); slide(0.13, 200, 760, 0.13); },
  bounce: () => { press(0.2); slide(0.3, 320, 980, 0.24); land(0.82); },
  whine: () => [0.1, 0.24, 0.36, 0.5, 0.62].forEach((t, i) => note(t, i % 2 ? 470 : 560, 0.11)),
  stretch: () => { slide(0.2, 260, 640, 0.62); slide(1.12, 520, 190, 0.16, 0.1); },
  spin: () => { press(0.2); slide(0.28, 380, 1300, 0.55); land(0.98); },
  jelly: () => [0, 0.12, 0.24, 0.36, 0.48].forEach((t, i) => pop(t, 200 - i * 10, 700 - i * 60, 0.8 - i * 0.1)),
  dance: () => [[0.15, 523], [0.35, 659], [0.55, 784], [0.75, 659], [0.95, 784], [1.15, 880], [1.6, 1047]]
    .forEach(([t, f], i) => note(t, f, i === 6 ? 0.3 : 0.12)),
  walk: () => [0.16, 0.35, 0.52, 0.7, 1.12, 1.3, 1.48, 1.66].forEach((t, i) => {
    const f = i % 2 ? 260 : 300;
    pop(t, f * 0.6, f * 2, 0.8);
  }),
  wink: () => { pop(0.38, 700, 2200, 0.6); pop(0.46, 900, 2800, 0.5); },
  roll: () => { slide(0.1, 480, 820, 0.45); slide(0.55, 820, 480, 0.45, 0.1); slide(1.3, 420, 200, 0.35, 0.1); },
  bow: () => { slide(0.3, 520, 340, 0.14, 0.1); slide(1.0, 360, 640, 0.1); },
};

// ---------- countdown ----------

function offDate() {
  const [h, m] = settings.offTime.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function fmt(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m}분`;
  return m ? `${h}시간 ${m}분` : `${h}시간`;
}

// ---------- off-work battery ----------
// 10 cells, one per hour counted back from the off time: empty 10h before,
// full at the off time. During the last hour the 10th cell blinks.

const CELLS = 10;
const HOUR = 3600000;
const batteryStyle = () => settings && settings.bubbleStyle === 'battery';
const cellsEl = document.querySelector('#battery .cells');
let lastBattery = '';

function cellColor(filled) {
  // saturated so filled cells stand out against the white box and empty cells
  if (filled >= 8) return '#3DB24B'; // green
  if (filled >= 4) return '#F5A524'; // amber
  return '#E5484D';                  // red
}

function renderBattery(diff) {
  const filled = diff > 0 ? Math.max(0, Math.min(CELLS, CELLS - Math.ceil(diff / HOUR))) : CELLS;
  const charging = diff > 0 && diff <= HOUR;
  bubble.classList.toggle('charging', charging);
  bubble.classList.toggle('charged', diff <= 0);
  const key = `${filled}|${charging}`;
  if (key === lastBattery) return;
  lastBattery = key;
  bubble.style.setProperty('--cell', cellColor(filled));
  const cells = [];
  for (let i = 0; i < CELLS; i++) {
    const c = document.createElement('i');
    if (i < filled) c.className = 'on';
    else if (charging && i === filled) c.className = 'chg';
    cells.push(c);
  }
  cellsEl.replaceChildren(...cells);
}

function flash() {
  bubble.classList.remove('flash');
  void bubble.offsetWidth;
  bubble.classList.add('flash');
}
document.getElementById('battery').addEventListener('animationend', (e) => {
  if (e.animationName === 'flash') bubble.classList.remove('flash');
});

function updateCountdown(tick = false) {
  if (!settings) return;
  clearTimeout(minuteTimer);
  const diff = offDate() - Date.now();
  let msg;
  let near = false;
  let party = false;

  if (diff > 0) {
    const mins = Math.ceil(diff / 60000);
    msg = `퇴근 ${fmt(mins)} 전`;
    near = mins <= 10;
  } else {
    const passed = Math.floor(-diff / 60000);
    if (passed < 30) {
      msg = batteryStyle() ? '충전 완료! 퇴근!' : '퇴근 시간이에요!';
      party = true;
    } else {
      msg = `퇴근 ${fmt(passed)} 지남`;
    }
  }

  text.textContent = msg;
  renderBattery(diff);
  bubble.classList.toggle('near', near);
  bubble.classList.toggle('party', party);

  let offNow = false;
  if (party !== happy) {
    happy = party;
    eyes.classList.toggle('is-happy', happy);
    if (happy) {
      offNow = tick;
      hop();
      if (batteryStyle()) flash();
    }
  } else if (near && msg !== lastMsg && lastMsg) {
    hop();
  }

  // on the hour (only when the minute timer fires, not on start or settings changes)
  if (offNow) {
    if (chimeOn()) fanfare();
  } else if (tick && new Date().getMinutes() === 0) {
    if (chimeOn()) chime();
    if (!asleep) hop();
  }
  if (msg !== lastMsg) relayout();
  lastMsg = msg;

  // Wake exactly when the displayed minute changes, not every second.
  const toNext = ((diff % 60000) + 60000) % 60000 || 60000;
  minuteTimer = setTimeout(() => updateCountdown(true), toNext + 30);
}

// ---------- drag / click / menu ----------
// The main process decides whether a press was a drag or a click
// (a click opens the settings panel).

function onDown(e) {
  if (e.button !== 0) return;
  dragging = true;
  api.dragStart();
}

bubble.addEventListener('mousedown', onDown);
buddy.addEventListener('mousedown', onDown);

window.addEventListener('mouseup', () => {
  if (!dragging) return;
  dragging = false;
  api.dragEnd();
});

window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  api.openMenu();
});

// ---------- settings ----------

function applySettings(s) {
  const old = settings;
  const offChanged = !old || old.offTime !== s.offTime || old.bubbleStyle !== s.bubbleStyle;
  settings = s;
  root.classList.toggle('style-battery', s.bubbleStyle === 'battery');
  root.classList.toggle('font-system', s.bubbleFont === 'system');
  if (!old || old.motion !== s.motion) {
    scheduleMotion();
    if (old && s.motion) randomIdle(); // preview when turned on
  }
  if (old && !old.hourlyChime && s.hourlyChime) chime(); // preview
  if (old && old.sfx === false && s.sfx !== false && s.motion !== false) SFX.squish(); // preview
  root.style.setProperty('--s', s.scale);
  buddy.classList.toggle('no-body', !s.bodyColor);
  if (s.bodyColor) buddy.style.setProperty('--body', s.bodyColor);
  renderPupils(s);
  const u = s.update || {};
  bubble.classList.toggle('has-update', u.status === 'available' || u.status === 'ready');
  if (offChanged) lastMsg = '';
  updateCountdown();
  relayout();
}

api.onSettings(applySettings);
api.onRefresh(() => {
  asleep = false;
  lastMsg = '';
  updateCountdown();
  scheduleMotion();
});
api.onSleep(() => {
  asleep = true;
  clearTimeout(motionTimer);
});
window.addEventListener('resize', relayout);

api.getSettings().then((s) => {
  applySettings(s);
  scheduleBlink();
});
