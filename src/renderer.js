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
  rig = Eyes.render(eyeGroup, s.pupilShape, { pupilColor: s.pupilColor, pupilSize: s.pupilSize });
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
  if (playing) root.classList.remove(`m-${playing}`);
  playing = '';
}

function play(name) {
  if (!moving()) return;
  stopMotion();
  void root.offsetWidth; // restart the animation if the same one is playing
  playing = name;
  root.classList.add(`m-${name}`);
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

// ---------- sound ----------
// Short chiptune beeps made with WebAudio, so no sound files ship with the app.
// Each sound gets its own AudioContext that is closed right after, so no audio
// thread stays alive between chimes.

const CHIME = [[988, 0.12], [1319, 0.3]];                          // ding-dong
const FANFARE = [[523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.4]]; // off-work!

function beep(seq) {
  let ctx;
  try { ctx = new AudioContext(); } catch { return; }
  const out = ctx.createGain();
  out.gain.value = 0.05;
  out.connect(ctx.destination);
  let t = ctx.currentTime + 0.03;
  for (const [freq, dur] of seq) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    env.gain.setValueAtTime(1, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(env).connect(out);
    osc.start(t);
    osc.stop(t + dur);
    t += dur * 0.9;
  }
  setTimeout(() => ctx.close(), (t - ctx.currentTime) * 1000 + 300);
}

const chimeOn = () => settings && settings.hourlyChime && !asleep;

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
    if (chimeOn()) beep(FANFARE);
  } else if (tick && new Date().getMinutes() === 0) {
    if (chimeOn()) beep(CHIME);
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
  if (old && !old.hourlyChime && s.hourlyChime) beep(CHIME); // preview
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
