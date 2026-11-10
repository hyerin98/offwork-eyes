const $ = (id) => document.getElementById(id);
const root = $('root');
const bubble = $('bubble');
const text = $('text');
const buddy = $('buddy');
const eyes = $('eyes');
const pupils = { l: $('pl'), r: $('pr') };

const VIEW_W = 200;          // svg viewBox width
const EYE_X = { l: 59, r: 141 };
const EYE_Y = 60;
const EYE_R = 50;
const BASE_PUPIL_R = 18.5;
const REACH = 120;           // svg units: distance where pupils hit the edge

let settings = null;
let geo = null;
let cursor = null;
let dragging = false;
let happy = false;
let lastMsg = '';
let lastLook = '';
let maxOffset = 27;
let minuteTimer = null;

// ---------- layout ----------

function measure() {
  const r = eyes.getBoundingClientRect();
  const k = r.width / VIEW_W;
  geo = {
    k,
    l: { x: r.left + EYE_X.l * k, y: r.top + EYE_Y * k },
    r: { x: r.left + EYE_X.r * k, y: r.top + EYE_Y * k },
  };
  if (cursor) look(cursor[0], cursor[1], true);
}

function rectOf(el, pad = 4) {
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

const prev = { l: [0, 0], r: [0, 0] };

function lookOne(key, x, y, force) {
  const c = geo[key];
  const dx = x - c.x;
  const dy = y - c.y;
  const d = Math.hypot(dx, dy) || 1;
  const t = Math.min(1, d / (REACH * geo.k));
  const m = maxOffset * (1 - (1 - t) * (1 - t)); // ease-out
  const tx = (dx / d) * m;
  const ty = (dy / d) * m;
  const p = prev[key];
  if (!force && Math.abs(tx - p[0]) < 0.4 && Math.abs(ty - p[1]) < 0.4) return; // skip sub-pixel repaints
  p[0] = tx;
  p[1] = ty;
  pupils[key].style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px)`;
}

function look(x, y, force = false) {
  if (!geo) return;
  lookOne('l', x, y, force);
  lookOne('r', x, y, force);
}

api.onCursor((x, y) => {
  cursor = [x, y];
  look(x, y);
});

function renderPupils(s) {
  const key = `${s.pupilShape}|${s.pupilColor}|${s.pupilSize}`;
  if (key === lastLook) return;
  lastLook = key;
  const r = BASE_PUPIL_R * s.pupilSize;
  const extent = PupilShapes.EXTENT[s.pupilShape] || 1;
  maxOffset = Math.max(3, EYE_R - r * extent - 3);
  for (const g of eyes.querySelectorAll('.shape')) {
    g.replaceChildren(...PupilShapes.build(s.pupilShape, r, s.pupilColor));
  }
  eyes.style.setProperty('--pupil', s.pupilColor);
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

function hop() {
  root.classList.remove('hop');
  void root.offsetWidth;
  root.classList.add('hop');
}
root.addEventListener('animationend', () => root.classList.remove('hop'));

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

function updateCountdown() {
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
      msg = '퇴근 시간이에요!';
      party = true;
    } else {
      msg = `퇴근 ${fmt(passed)} 지남`;
    }
  }

  text.textContent = msg;
  bubble.classList.toggle('near', near);
  bubble.classList.toggle('party', party);

  if (party !== happy) {
    happy = party;
    eyes.classList.toggle('is-happy', happy);
    if (happy) hop();
  } else if (near && msg !== lastMsg && lastMsg) {
    hop();
  }
  if (msg !== lastMsg) relayout();
  lastMsg = msg;

  // Wake exactly when the displayed minute changes, not every second.
  const toNext = ((diff % 60000) + 60000) % 60000 || 60000;
  minuteTimer = setTimeout(updateCountdown, toNext + 30);
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
  const offChanged = !settings || settings.offTime !== s.offTime;
  settings = s;
  root.style.setProperty('--s', s.scale);
  buddy.classList.toggle('no-body', !s.bodyColor);
  if (s.bodyColor) buddy.style.setProperty('--body', s.bodyColor);
  renderPupils(s);
  if (offChanged) lastMsg = '';
  updateCountdown();
  relayout();
}

api.onSettings(applySettings);
api.onRefresh(() => {
  lastMsg = '';
  updateCountdown();
});
window.addEventListener('resize', relayout);

api.getSettings().then((s) => {
  applySettings(s);
  scheduleBlink();
});
