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

// ---------- color field: presets + native picker + eyedropper + hex ----------

function colorField(container, key, presets) {
  container.append($('color-tpl').content.cloneNode(true));
  const swatches = container.querySelector('.swatches');
  const picker = container.querySelector('input[type=color]');
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

  picker.addEventListener('input', () => api.update({ [key]: picker.value.toUpperCase() }));

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
    if (v) picker.value = v.toLowerCase();
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

// ---------- wiring ----------

$('close').addEventListener('click', () => api.closePanel());
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.activeElement?.tagName !== 'INPUT') api.closePanel();
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
