const $ = (id) => document.getElementById(id);

const PALETTE = [
  ['#CE89C3', '핑크'], ['#DFEF87', '라임'], ['#B1ACAA', '그레이'], ['#6E6E73', '차콜'], ['#5375A0', '블루'],
];
const BODY_PRESETS = [...PALETTE, [null, '눈만']];
const PUPIL_PRESETS = PALETTE;
let settings = null;
const refreshers = [];

function normalizeHex(v) {
  let h = String(v || '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.split('').map((c) => c + c).join('');
  return /^[0-9a-f]{6}$/i.test(h) ? `#${h.toUpperCase()}` : null;
}

// ---------- color math ----------

const hex2 = (n) => Math.round(n).toString(16).padStart(2, '0');
const rgbToHex = ([r, g, b]) => `#${hex2(r)}${hex2(g)}${hex2(b)}`.toUpperCase();
const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

function hsvToRgb(h, s, v) {
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5) * 255, f(3) * 255, f(1) * 255];
}

function rgbToHsv([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max];
}

// ---------- in-panel color picker ----------
// Replaces <input type=color>: the native picker has its own eyedropper
// (duplicating ours) and on macOS opens behind this always-on-top panel.

const openPickers = new Set();

function colorPicker(root, getHex, onPick) {
  const sv = root.querySelector('.cp-sv');
  const thumb = root.querySelector('.cp-thumb');
  const hue = root.querySelector('.cp-hue');
  const rgbInputs = [...root.querySelectorAll('.cp-rgb input')];
  let hsv = [0, 0, 0];
  let frame = null;

  function paint() {
    const [h, s, v] = hsv;
    sv.style.background = `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, hsl(${h}, 100%, 50%))`;
    thumb.style.left = `${s * 100}%`;
    thumb.style.top = `${(1 - v) * 100}%`;
    thumb.style.background = rgbToHex(hsvToRgb(h, s, v));
    hue.value = Math.round(h);
    const rgb = hsvToRgb(h, s, v).map(Math.round);
    rgbInputs.forEach((inp, i) => { if (document.activeElement !== inp) inp.value = rgb[i]; });
  }

  // throttle updates to ~60/s while dragging (a timer, so it also runs when
  // the window is in the background, unlike requestAnimationFrame)
  function emit() {
    if (frame) return;
    frame = setTimeout(() => {
      frame = null;
      onPick(rgbToHex(hsvToRgb(...hsv)));
    }, 16);
  }

  function fromPointer(e) {
    const r = sv.getBoundingClientRect();
    const s = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const v = 1 - Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    hsv = [hsv[0], s, v];
    paint();
    emit();
  }

  sv.addEventListener('pointerdown', (e) => {
    sv.setPointerCapture(e.pointerId);
    fromPointer(e);
  });
  sv.addEventListener('pointermove', (e) => {
    if ((e.buttons & 1) || sv.hasPointerCapture(e.pointerId)) fromPointer(e);
  });

  hue.addEventListener('input', () => {
    hsv = [Number(hue.value), hsv[1], hsv[2]];
    paint();
    emit();
  });

  rgbInputs.forEach((inp) => inp.addEventListener('input', () => {
    const rgb = rgbInputs.map((x) => Math.min(255, Math.max(0, Number(x.value) || 0)));
    hsv = rgbToHsv(rgb);
    paint();
    emit();
  }));

  return {
    sync() {
      const hex = getHex();
      if (!hex) return;
      const current = rgbToHex(hsvToRgb(...hsv));
      if (current !== hex) {
        const next = rgbToHsv(hexToRgb(hex));
        // keep the hue when the color is grey/black (hue is undefined there)
        if (next[1] === 0 || next[2] === 0) next[0] = hsv[0];
        hsv = next;
      }
      paint();
    },
  };
}

// ---------- color field: presets + picker + eyedropper + hex ----------

function colorField(container, key, presets) {
  container.append($('color-tpl').content.cloneNode(true));
  const swatches = container.querySelector('.swatches');
  const pickerBtn = container.querySelector('.picker');
  const cpRoot = container.querySelector('.cp');
  const dropper = container.querySelector('.dropper');
  const hexWrap = container.querySelector('.hex');
  const hexInput = hexWrap.querySelector('input');

  const buttons = presets.map(([value, label]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch' + (value ? '' : ' none');
    b.setAttribute('role', 'radio');
    b.title = label;
    b.setAttribute('aria-label', label);
    if (value) b.style.background = value;
    b.addEventListener('click', () => api.update({ [key]: value }));
    swatches.append(b);
    return [value, b];
  });

  const cp = colorPicker(cpRoot, () => settings[key] || '#FFFFFF', (hex) => api.update({ [key]: hex }));
  const setOpen = (open) => {
    cpRoot.hidden = !open;
    pickerBtn.setAttribute('aria-expanded', String(open));
    if (open) {
      for (const other of openPickers) other(false); // one picker at a time
      openPickers.add(setOpen);
      cp.sync();
      cpRoot.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else {
      openPickers.delete(setOpen);
    }
  };
  pickerBtn.addEventListener('click', () => setOpen(cpRoot.hidden));

  // macOS: Chromium's EyeDropper uses the system color sampler, which works
  // across the whole screen. Elsewhere it is limited to this window, so the
  // main process opens a full-screen picker instead.
  const nativeDropper = api.platform === 'darwin' && 'EyeDropper' in window;
  dropper.addEventListener('click', async () => {
    if (!nativeDropper) {
      api.startEyedropper(key);
      return;
    }
    try {
      const { sRGBHex } = await new window.EyeDropper().open();
      const hex = normalizeHex(sRGBHex);
      if (hex) api.update({ [key]: hex });
    } catch {
      // user pressed Esc
    }
  });

  hexInput.addEventListener('input', () => {
    const hex = normalizeHex(hexInput.value);
    hexWrap.classList.toggle('bad', !hex && hexInput.value.trim() !== '');
    if (hex) api.update({ [key]: hex });
  });
  hexInput.addEventListener('blur', () => refresh());
  hexInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') hexInput.blur();
  });

  function refresh() {
    const v = settings[key];
    for (const [value, b] of buttons) b.setAttribute('aria-checked', String(value === v));
    pickerBtn.style.background = v || '#FFFFFF';
    if (!cpRoot.hidden) cp.sync();
    if (document.activeElement !== hexInput) {
      hexInput.value = v ? v.slice(1) : '';
      hexInput.placeholder = v ? '' : '눈만 표시 중';
      hexWrap.classList.remove('bad');
    }
  }
  refreshers.push(refresh);
}

// ---------- expressions ----------
// Each tile is a mini widget: the body color with that expression's eyes.

function shapeButtons() {
  const wrap = $('pupilShape');
  const buttons = Eyes.LIST.map((shape) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'shape-btn';
    b.setAttribute('role', 'radio');
    b.dataset.shape = shape;
    const tile = document.createElement('span');
    tile.className = 'tile';
    const svg = Eyes.el('svg', { viewBox: '-14 -22 228 160', 'aria-hidden': 'true' });
    const g = Eyes.el('g');
    svg.append(g);
    tile.append(svg);
    const label = document.createElement('span');
    label.textContent = Eyes.label(shape);
    b.append(tile, label);
    b.addEventListener('click', () => api.update({ pupilShape: shape }));
    wrap.append(b);
    return { b, g, tile, shape };
  });
  let lastKey = '';
  refreshers.push(() => {
    const key = `${settings.pupilColor}|${settings.bodyColor}`;
    for (const { b, g, tile, shape } of buttons) {
      b.setAttribute('aria-checked', String(settings.pupilShape === shape));
      if (key !== lastKey) {
        tile.style.background = settings.bodyColor || '#D9D8D2';
        Eyes.render(g, shape, { pupilColor: settings.pupilColor });
      }
    }
    lastKey = key;
  });
}

// ---------- time ----------

function fmt(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m}분`;
  return m ? `${h}시간 ${m}분` : `${h}시간`;
}

function updateRemain() {
  const [h, m] = settings.offTime.split(':').map(Number);
  const off = new Date();
  off.setHours(h, m, 0, 0);
  const diff = off - Date.now();
  $('remain').textContent = diff > 0
    ? `지금부터 ${fmt(Math.ceil(diff / 60000))} 남았어요`
    : '오늘 퇴근 시간이 지났어요';
}

$('offTime').addEventListener('change', (e) => {
  if (/^\d{2}:\d{2}$/.test(e.target.value)) api.update({ offTime: e.target.value });
});
refreshers.push(() => {
  if (document.activeElement !== $('offTime')) $('offTime').value = settings.offTime;
  updateRemain();
});
setInterval(() => settings && updateRemain(), 30000);

// ---------- pupil size, widget size, switches ----------

$('pupilSize').addEventListener('input', (e) => api.update({ pupilSize: Number(e.target.value) }));
refreshers.push(() => { $('pupilSize').value = settings.pupilSize; });

for (const b of $('size').querySelectorAll('button')) {
  b.setAttribute('role', 'radio');
  b.addEventListener('click', () => api.update({ size: b.dataset.v }));
}
refreshers.push(() => {
  for (const b of $('size').querySelectorAll('button')) {
    b.setAttribute('aria-checked', String(b.dataset.v === settings.size));
  }
});

const BUBBLE_HINTS = {
  classic: '남은 시간을 말풍선으로 보여줘요.',
  battery: '퇴근 10시간 전부터 1시간마다 배터리가 한 칸씩 차요. 다 차면 퇴근!',
};
for (const b of $('bubbleStyle').querySelectorAll('button')) {
  b.setAttribute('role', 'radio');
  b.addEventListener('click', () => api.update({ bubbleStyle: b.dataset.v }));
}
refreshers.push(() => {
  const style = settings.bubbleStyle || 'classic';
  for (const b of $('bubbleStyle').querySelectorAll('button')) {
    b.setAttribute('aria-checked', String(b.dataset.v === style));
  }
  $('bubbleHint').textContent = BUBBLE_HINTS[style];
});

// segmented radio groups that map 1:1 to a setting
function radioGroup(key, fallback) {
  const btns = $(key).querySelectorAll('button');
  for (const b of btns) {
    b.setAttribute('role', 'radio');
    b.addEventListener('click', () => api.update({ [key]: b.dataset.v }));
  }
  refreshers.push(() => {
    const v = settings[key] || fallback;
    for (const b of btns) b.setAttribute('aria-checked', String(b.dataset.v === v));
  });
}

radioGroup('bubbleFont', 'pixel');

for (const key of ['alwaysOnTop', 'openAtLogin']) {
  $(key).addEventListener('change', (e) => api.update({ [key]: e.target.checked }));
  refreshers.push(() => { $(key).checked = settings[key]; });
}

// ---------- update banner & version ----------

const UPDATE_COPY = {
  available: {
    script: (v) => [`새 버전 v${v}이 나왔어요`, '업데이트'],
    page: (v) => [`새 버전 v${v}이 나왔어요`, '받으러 가기'],
  },
  downloading: (v) => [`새 버전 v${v}을 내려받고 있어요`, null],
  ready: (v) => [`새 버전 v${v}이 준비됐어요`, '재시작'],
  installing: () => ['업데이트하는 중이에요. 잠시 후 다시 열려요.', null],
};

$('update-btn').addEventListener('click', () => api.installUpdate());
refreshers.push(() => {
  const u = settings.update || {};
  let copy = UPDATE_COPY[u.status];
  if (copy && typeof copy === 'object') copy = copy[u.mode];
  $('update').hidden = !copy;
  if (copy) {
    const [text, button] = copy(u.version);
    $('update-text').textContent = text;
    $('update-btn').hidden = !button;
    $('update-btn').textContent = button || '';
  }
  $('version').textContent = `현재 버전 v${settings.appVersion}`;
});

// ---------- feedback ("개발자에게 한마디") ----------
// form → sending → done | fail. The draft is kept in localStorage so closing
// the panel or a failed send never loses what the user wrote.

const DRAFT_KEY = 'feedbackDraft';
const fb = {
  type: '버그',
  step: 'form',
  fields: { title: $('fb-title'), body: $('fb-text'), name: $('fb-name') },
};

function remainText() {
  const [h, m] = settings.offTime.split(':').map(Number);
  const off = new Date();
  off.setHours(h, m, 0, 0);
  const diff = off - Date.now();
  return diff > 0
    ? `퇴근까지 ${fmt(Math.ceil(diff / 60000))} 남았어요.`
    : '벌써 퇴근 시간이 지났어요. 얼른 퇴근하세요!';
}

function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}');
    for (const k of Object.keys(fb.fields)) fb.fields[k].value = d[k] || '';
    if (d.type) fb.type = d.type;
  } catch { /* storage unavailable: start empty */ }
}

function saveDraft() {
  const d = { type: fb.type };
  for (const k of Object.keys(fb.fields)) d[k] = fb.fields[k].value;
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* ignore */ }
}

function clearDraft() {
  for (const f of Object.values(fb.fields)) f.value = '';
  fb.type = '버그';
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}

// the little character mirrors the user's own widget: body color + expression
function drawBuddy(mood) {
  const svg = $('fb-eyes');
  const shape = mood === 'fail' ? 'surprised' : settings.pupilShape;
  Eyes.render(svg.firstElementChild, shape, { pupilColor: settings.pupilColor, pupilSize: settings.pupilSize });
  svg.classList.toggle('is-happy', mood === 'done');
  $('fb-body').style.background = settings.bodyColor || 'transparent';
  $('fb-body').classList.toggle('no-body', !settings.bodyColor);
}

const SAY = {
  form: ['저 혹시 고장났나요…?', ''],
  sending: ['두근두근… 보내는 중', ''],
  done: ['고마워요! 🎉', 'party'],
  fail: ['어… 안 보내졌어요', 'err'],
};

function setStep(step) {
  fb.step = step;
  $('fb-form').hidden = step !== 'form' && step !== 'sending';
  $('fb-done').hidden = step !== 'done';
  $('fb-fail').hidden = step !== 'fail';
  const [say, cls] = SAY[step];
  $('fb-say').textContent = say;
  $('fb-say').className = `pbubble ${cls}`.trim();
  drawBuddy(step);
  if (step === 'done') $('fb-remain').textContent = remainText();
  const sending = step === 'sending';
  $('fb-send').textContent = sending ? '보내는 중…' : '보내기';
  for (const f of Object.values(fb.fields)) f.disabled = sending;
  refreshFeedbackForm();
}

function refreshFeedbackForm() {
  for (const b of $('fb-type').querySelectorAll('button')) {
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(b.dataset.v === fb.type));
  }
  const ready = fb.fields.title.value.trim() && fb.fields.body.value.trim();
  $('fb-send').disabled = !ready || fb.step === 'sending';
}

function showView(which) {
  const feedback = which === 'feedback';
  $('settings-view').hidden = feedback;
  $('fb-view').hidden = !feedback;
  $('back').hidden = !feedback;
  $('title').textContent = feedback ? '의견 보내기' : '설정';
  if (feedback) {
    setStep('form');
    (fb.fields.title.value ? fb.fields.body : fb.fields.title).focus();
  } else {
    $('fb-open').focus();
  }
}

async function sendFeedback() {
  if (fb.step === 'sending') return;
  setStep('sending');
  const res = await api.sendFeedback({
    type: fb.type,
    title: fb.fields.title.value,
    body: fb.fields.body.value,
    name: fb.fields.name.value,
  });
  if (res && res.ok) {
    clearDraft();
    setStep('done');
  } else if (res && res.reason === 'busy') {
    setStep('form'); // a double click; the first send is still going or just went
  } else {
    setStep('fail');
  }
}

for (const b of $('fb-type').querySelectorAll('button')) {
  b.addEventListener('click', () => {
    fb.type = b.dataset.v;
    saveDraft();
    refreshFeedbackForm();
  });
}
for (const f of Object.values(fb.fields)) {
  f.addEventListener('input', () => {
    saveDraft();
    refreshFeedbackForm();
  });
}
$('fb-open').addEventListener('click', () => showView('feedback'));
$('back').addEventListener('click', () => showView('settings'));
$('fb-home').addEventListener('click', () => showView('settings'));
$('fb-send').addEventListener('click', sendFeedback);
$('fb-retry').addEventListener('click', sendFeedback);
$('fb-edit').addEventListener('click', () => setStep('form'));
loadDraft();
refreshers.push(() => {
  if (!$('fb-view').hidden) drawBuddy(fb.step);
});

// ---------- wiring ----------

$('close').addEventListener('click', () => api.closePanel());
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (openPickers.size) {
    for (const close of [...openPickers]) close(false); // Esc closes the color picker first
    return;
  }
  if (!$('fb-view').hidden) {
    if (fb.step !== 'sending') showView('settings'); // Esc goes back; the draft stays
    return;
  }
  if (document.activeElement?.tagName !== 'INPUT') api.closePanel();
});

colorField($('bodyColor'), 'bodyColor', BODY_PRESETS);
shapeButtons();
colorField($('pupilColor'), 'pupilColor', PUPIL_PRESETS);

function apply(s) {
  settings = s;
  for (const r of refreshers) r();
}

api.onSettings(apply);
api.getSettings().then((s) => {
  apply(s);
  if (s.firstRun) $('offTime').focus();
});
