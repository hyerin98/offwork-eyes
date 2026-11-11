const { app, BrowserWindow, Tray, Menu, screen, ipcMain, nativeImage, powerMonitor, desktopCapturer } = require('electron');
const path = require('path');
const store = require('./store');
const updater = require('./updater');
const feedback = require('./feedback');

// A 240px widget doesn't need the GPU process; software compositing saves
// RAM and avoids waking the GPU.
app.disableHardwareAcceleration();

if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}

const isMac = process.platform === 'darwin';
const BASE = { w: 264, h: 210 }; // keep in sync with #root in style.css
const SIZES = { small: 0.75, medium: 1, large: 1.3 };
// Keep in sync with EXPRESSIONS in shapes.js
const SHAPES = ['circle', 'sleepy', 'angry', 'meh', 'side', 'surprised', 'crush', 'blank', 'sparkle', 'payday', 'meeting', 'overtime'];
const LEGACY_SHAPES = { star: 'sparkle', heart: 'payday' };
const HEX = /^#[0-9a-f]{6}$/i;
const PANEL = { w: 320, h: 820 };
const PRELOAD = path.join(__dirname, 'preload.js');

let settings;
let win = null;
let panel = null;
let tray = null;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---------- widget window ----------

function windowSize() {
  const s = SIZES[settings.size] || 1;
  return { width: Math.round(BASE.w * s), height: Math.round(BASE.h * s) };
}

function defaultPosition({ width, height }) {
  const wa = screen.getPrimaryDisplay().workArea;
  return { x: wa.x + wa.width - width - 24, y: wa.y + wa.height - height - 24 };
}

function validPosition(size) {
  const p = settings.position;
  if (p) {
    const cx = p.x + size.width / 2;
    const cy = p.y + size.height / 2;
    const onScreen = screen.getAllDisplays().some(({ workArea: a }) =>
      cx >= a.x && cx <= a.x + a.width && cy >= a.y && cy <= a.y + a.height);
    if (onScreen) return p;
  }
  return defaultPosition(size);
}

function createWindow() {
  const size = windowSize();
  win = new BrowserWindow({
    ...size,
    ...validPosition(size),
    transparent: true,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    backgroundColor: '#00000000',
    title: 'OffWork Eyes',
    webPreferences: { preload: PRELOAD, spellcheck: false, devTools: !app.isPackaged },
  });
  applyTopmost();
  setIgnore(true);
  win.loadFile(path.join(__dirname, 'index.html'));
  win.once('ready-to-show', () => {
    win.showInactive();
    startPolling();
    if (settings.firstRun) openPanel();
  });
  win.on('closed', () => { win = null; stopPolling(); });
}

function applyTopmost() {
  const on = settings.alwaysOnTop;
  for (const w of [win, panel]) {
    if (!w) continue;
    w.setAlwaysOnTop(on, 'screen-saver');
    if (isMac) w.setVisibleOnAllWorkspaces(on, { visibleOnFullScreen: true, skipTransformProcessType: true });
  }
  if (on && win) win.moveTop();
  keepOnTop();
}

// Windows sometimes pushes an always-on-top window behind other windows
// (after an app relaunch, other topmost windows of ours closing, unlock, ...).
// For users who turned "항상 위에 표시" on, re-assert it every 30s and on
// those events. This is a local window call; nothing goes over the network.
const KEEP_TOP_MS = 30 * 1000;
let topTimer = null;

function keepOnTop() {
  clearInterval(topTimer);
  topTimer = null;
  if (settings.alwaysOnTop) topTimer = setInterval(reassertTop, KEEP_TOP_MS);
}

function reassertTop() {
  // skip while the eyedropper overlays cover the screen
  if (!win || !settings.alwaysOnTop || !win.isVisible() || droppers.length) return;
  if (!win.isAlwaysOnTop()) win.setAlwaysOnTop(true, 'screen-saver');
  win.moveTop();
}

function applySize() {
  const b = win.getBounds();
  win.setBounds({ x: b.x, y: b.y, ...windowSize() });
}

// ---------- settings ----------

function rendererSettings() {
  return { ...settings, scale: SIZES[settings.size] || 1, appVersion: app.getVersion(), update: updater.getState() };
}

function pushSettings() {
  const s = rendererSettings();
  if (win) win.webContents.send('settings', s);
  if (panel) panel.webContents.send('settings', s);
  if (tray) tray.setContextMenu(buildMenu());
}

function sanitize(p) {
  const out = {};
  if (!p || typeof p !== 'object') return out;
  if (typeof p.offTime === 'string' && /^\d{2}:\d{2}$/.test(p.offTime)) out.offTime = p.offTime;
  if (p.bodyColor === null) out.bodyColor = null;
  else if (typeof p.bodyColor === 'string' && HEX.test(p.bodyColor)) out.bodyColor = p.bodyColor.toUpperCase();
  if (typeof p.pupilColor === 'string' && HEX.test(p.pupilColor)) out.pupilColor = p.pupilColor.toUpperCase();
  if (SHAPES.includes(p.pupilShape)) out.pupilShape = p.pupilShape;
  if (typeof p.pupilSize === 'number' && Number.isFinite(p.pupilSize)) out.pupilSize = clamp(p.pupilSize, 0.6, 1.5);
  if (p.size in SIZES) out.size = p.size;
  if (p.bubbleStyle === 'classic' || p.bubbleStyle === 'battery') out.bubbleStyle = p.bubbleStyle;
  if (p.bubbleFont === 'pixel' || p.bubbleFont === 'system') out.bubbleFont = p.bubbleFont;
  for (const k of ['alwaysOnTop', 'openAtLogin', 'motion', 'sfx', 'hourlyChime']) if (typeof p[k] === 'boolean') out[k] = p[k];
  return out;
}

function update(patch) {
  if (!Object.keys(patch).length) return;
  Object.assign(settings, patch);
  store.save();
  if ('alwaysOnTop' in patch) applyTopmost();
  if ('size' in patch) applySize();
  if ('openAtLogin' in patch) {
    // The portable .exe runs from a temp copy; register the real file instead.
    // In development, electron.exe needs the app folder as an argument or it
    // would open Electron's default window at login.
    const exe = process.env.PORTABLE_EXECUTABLE_FILE;
    const opts = { openAtLogin: patch.openAtLogin };
    if (exe) opts.path = exe;
    else if (!app.isPackaged) opts.args = [app.getAppPath()];
    app.setLoginItemSettings(opts);
  }
  pushSettings();
}

// ---------- settings panel ----------
// Created on demand and destroyed on close, so it costs nothing while hidden.

function openPanel() {
  if (panel) {
    panel.show();
    panel.focus();
    return;
  }
  const wb = win ? win.getBounds() : { x: 0, y: 0, width: 0, height: 0 };
  const wa = screen.getDisplayMatching(wb).workArea;
  let x = wb.x - PANEL.w - 8;
  if (x < wa.x) x = wb.x + wb.width + 8;
  x = clamp(x, wa.x, wa.x + wa.width - PANEL.w);
  const h = Math.min(PANEL.h, wa.height);
  const y = clamp(wb.y + wb.height - h, wa.y, wa.y + wa.height - h);

  panel = new BrowserWindow({
    width: PANEL.w,
    height: h,
    x,
    y,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#FAFAF7',
    title: 'OffWork Eyes 설정',
    webPreferences: { preload: PRELOAD, spellcheck: false, devTools: !app.isPackaged },
  });
  applyTopmost();
  panel.loadFile(path.join(__dirname, 'panel.html'));
  panel.once('ready-to-show', () => {
    panel.show();
    panel.focus();
    setTimeout(() => panel && prepareEyedropper(), 300); // so the eyedropper opens instantly
  });
  panel.on('closed', () => {
    panel = null;
    discardPrepared();
    reassertTop();
    if (settings.firstRun) {
      settings.firstRun = false;
      store.save();
    }
  });
}

function togglePanel() {
  if (panel) panel.close();
  else openPanel();
}

// ---------- eyedropper ----------
// Chromium's EyeDropper only samples inside the app's own window under
// Electron on Windows, so we freeze a screenshot of every display and show it
// in a full-screen overlay where the user can pick any pixel.
//
// To make it feel instant:
//  - while the settings panel is open, the overlays are pre-created hidden,
//    so clicking the button only has to show them;
//  - they open transparent (the live screen shows through, the cursor turns
//    into a crosshair) and the capture (~0.5s) runs after they're visible;
//  - a click made before the capture is ready is remembered and applied.

let prepared = null; // [{ w, d, loaded }] hidden overlays waiting to be used
let droppers = [];   // overlays currently in use
let dropperKey = null;

function captureDisplay(d) {
  // Capture at the display's own physical resolution so pixels map 1:1.
  const size = { width: Math.round(d.size.width * d.scaleFactor), height: Math.round(d.size.height * d.scaleFactor) };
  return desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size }).then((sources) =>
    sources.find((s) => s.display_id === String(d.id)) || (screen.getAllDisplays().length === 1 ? sources[0] : null));
}

function prepareEyedropper() {
  if (prepared || isMac) return; // macOS uses the native system color sampler
  prepared = screen.getAllDisplays().map((d) => {
    const w = new BrowserWindow({
      ...d.bounds,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: false,
      enableLargerThanScreen: true,
      show: false,
      backgroundColor: '#00000000',
      webPreferences: { preload: PRELOAD, spellcheck: false, devTools: !app.isPackaged },
    });
    w.setAlwaysOnTop(true, 'screen-saver');
    w.loadFile(path.join(__dirname, 'eyedropper.html'));
    const loaded = new Promise((resolve) => w.webContents.once('did-finish-load', resolve));
    w.on('closed', () => {
      droppers = droppers.filter((x) => x !== w);
      if (prepared && prepared.some((p) => p.w === w)) prepared = null;
    });
    return { w, d, loaded };
  });
}

function discardPrepared() {
  if (!prepared) return;
  for (const { w } of prepared) if (!w.isDestroyed()) w.destroy();
  prepared = null;
}

function startEyedropper(key) {
  if (droppers.length || !['bodyColor', 'pupilColor'].includes(key)) return;
  dropperKey = key;
  prepareEyedropper(); // no-op when already prepared
  const overlays = prepared;
  prepared = null;

  for (const { w, d, loaded } of overlays) {
    droppers.push(w);
    loaded
      .then(() => {
        if (w.isDestroyed()) return null;
        w.show();
        w.setBounds(d.bounds); // Windows may clamp a new window to the work area; cover the taskbar too
        w.focus();
        // Capturing blocks the main thread for a while, so let the overlay paint first.
        return new Promise((r) => setTimeout(r, 30)).then(() => captureDisplay(d));
      })
      .then((src) => {
        if (w.isDestroyed()) return;
        if (!src) throw new Error(`no capture for display ${d.id}`);
        // bounds let the renderer align the image even if the window got clamped
        w.webContents.send('eyedropper-image', src.thumbnail.toDataURL(), d.bounds);
      })
      .catch((e) => {
        console.warn('screen capture failed', e);
        endEyedropper(null);
      });
  }
}

function endEyedropper(hex) {
  const key = dropperKey;
  dropperKey = null;
  for (const w of droppers) if (!w.isDestroyed()) w.destroy();
  droppers = [];
  if (hex && key) update(sanitize({ [key]: hex }));
  reassertTop(); // closing our own topmost overlays can push the widget back
  if (panel) {
    panel.focus();
    setTimeout(() => panel && prepareEyedropper(), 300); // ready for the next pick
  }
}

// ---------- cursor tracking & click-through ----------
// Polls the global cursor with an adaptive interval: 30fps while the mouse
// moves, backing off to 4fps when it's still. Only changed positions are
// sent to the renderer, so an idle desktop costs almost nothing.

let pollTimer = null;
let last = { x: NaN, y: NaN };
let stillTicks = 0;
let hitRects = [];
let ignoring = null;
let drag = null;

function setIgnore(on) {
  if (ignoring === on || !win) return;
  ignoring = on;
  win.setIgnoreMouseEvents(on);
}

function updateHit(lx, ly) {
  if (drag) return setIgnore(false);
  const inside = hitRects.some((r) => lx >= r.x && lx <= r.x + r.w && ly >= r.y && ly <= r.y + r.h);
  setIgnore(!inside);
}

function tick() {
  pollTimer = null;
  if (!win || !win.isVisible()) return;
  const p = screen.getCursorScreenPoint();
  if (p.x !== last.x || p.y !== last.y) {
    last = p;
    stillTicks = 0;
    if (drag) {
      if (!drag.moved && Math.hypot(p.x - drag.sx, p.y - drag.sy) > 4) drag.moved = true;
      if (drag.moved) win.setBounds({ x: p.x - drag.dx, y: p.y - drag.dy, width: drag.w, height: drag.h });
    } else {
      const b = win.getBounds();
      const lx = p.x - b.x;
      const ly = p.y - b.y;
      win.webContents.send('cursor', lx, ly);
      updateHit(lx, ly);
    }
  } else {
    stillTicks++;
  }
  const delay = drag ? 16 : stillTicks < 30 ? 33 : stillTicks < 120 ? 100 : 250;
  pollTimer = setTimeout(tick, delay);
}

function startPolling() {
  stopPolling();
  stillTicks = 0;
  last = { x: NaN, y: NaN };
  tick();
}

function stopPolling() {
  clearTimeout(pollTimer);
  pollTimer = null;
}

// ---------- tray ----------

function trayIcon() {
  const file = isMac ? 'trayTemplate.png' : 'tray.png';
  const img = nativeImage.createFromPath(path.join(__dirname, 'assets', file));
  if (isMac) img.setTemplateImage(true);
  return img;
}

function showWidget() {
  if (!win) return;
  win.showInactive();
  win.moveTop();
  startPolling();
  pushSettings();
}

function hideWidget() {
  if (!win) return;
  win.hide();
  stopPolling();
  pushSettings();
}

function resetPosition() {
  settings.position = null;
  const size = windowSize();
  win.setBounds({ ...defaultPosition(size), ...size });
  store.save();
}

function updateMenuItems() {
  const u = updater.getState();
  if (u.status === 'ready') return [{ label: `재시작해서 v${u.version}로 업데이트`, click: updater.install }, { type: 'separator' }];
  if (u.status === 'available') {
    const label = u.mode === 'page' ? `v${u.version} 다운로드 페이지 열기` : `v${u.version}로 업데이트`;
    return [{ label, click: updater.install }, { type: 'separator' }];
  }
  return [];
}

function buildMenu() {
  const visible = win && win.isVisible();
  return Menu.buildFromTemplate([
    ...updateMenuItems(),
    { label: `퇴근 시간: ${settings.offTime}`, enabled: false },
    { label: '설정 열기…', click: openPanel },
    { type: 'separator' },
    {
      label: '항상 위에 표시',
      type: 'checkbox',
      checked: settings.alwaysOnTop,
      click: (item) => update({ alwaysOnTop: item.checked }),
    },
    { label: visible ? '숨기기' : '보이기', click: () => (visible ? hideWidget() : showWidget()) },
    { label: '위치 초기화', click: resetPosition },
    { type: 'separator' },
    { label: '종료', click: () => app.quit() },
  ]);
}

function createTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip('OffWork Eyes');
  tray.setContextMenu(buildMenu());
  if (!isMac) tray.on('click', () => tray.popUpContextMenu());
}

// ---------- IPC ----------

ipcMain.handle('get-settings', () => rendererSettings());
ipcMain.on('update-settings', (_e, patch) => update(sanitize(patch)));
ipcMain.on('close-panel', () => panel && panel.close());
ipcMain.on('install-update', () => updater.install());
ipcMain.handle('send-feedback', (_e, data) => feedback.send(data));

ipcMain.on('eyedropper-start', (_e, key) => startEyedropper(key));
ipcMain.on('eyedropper-pick', (_e, hex) => endEyedropper(hex));
ipcMain.on('eyedropper-cancel', () => endEyedropper(null));

ipcMain.on('hit-rects', (_e, rects) => {
  hitRects = Array.isArray(rects) ? rects : [];
  stillTicks = 0;
});

ipcMain.on('drag-start', () => {
  if (!win) return;
  const p = screen.getCursorScreenPoint();
  const b = win.getBounds();
  drag = { sx: p.x, sy: p.y, dx: p.x - b.x, dy: p.y - b.y, w: b.width, h: b.height, moved: false };
  startPolling();
});

ipcMain.on('drag-end', () => {
  if (!drag) return;
  const { moved } = drag;
  drag = null;
  if (moved) {
    const [x, y] = win.getPosition();
    settings.position = { x, y };
    store.save();
  } else {
    win.webContents.send('poke'); // squish reaction
    togglePanel(); // a click without movement opens the settings panel
  }
});

ipcMain.on('open-menu', () => {
  buildMenu().popup({ window: win });
});

// ---------- lifecycle ----------

app.whenReady().then(() => {
  settings = store.load();
  const shape = LEGACY_SHAPES[settings.pupilShape] || settings.pupilShape;
  settings.pupilShape = SHAPES.includes(shape) ? shape : 'circle';
  if (isMac && app.dock) app.dock.hide();
  createWindow();
  createTray();
  updater.start(() => pushSettings());

  const pause = () => {
    if (win) win.webContents.send('sleep'); // stop idle motions and chimes
    stopPolling();
    updater.pause();
    clearInterval(topTimer);
  };
  const resume = () => {
    if (win && win.isVisible()) startPolling();
    if (win) win.webContents.send('refresh');
    updater.resume();
    keepOnTop();
    setTimeout(reassertTop, 1000);
  };
  powerMonitor.on('suspend', pause);
  powerMonitor.on('lock-screen', pause);
  powerMonitor.on('resume', resume);
  powerMonitor.on('unlock-screen', resume);

  // pre-created eyedropper overlays are sized per display; rebuild on changes
  for (const ev of ['display-added', 'display-removed', 'display-metrics-changed']) {
    screen.on(ev, () => {
      discardPrepared();
      setTimeout(reassertTop, 1000);
    });
  }

  screen.on('display-removed', () => {
    if (!win) return;
    const size = windowSize();
    const [x, y] = win.getPosition();
    settings.position = { x, y };
    win.setBounds({ ...validPosition(size), ...size });
  });
});

app.on('second-instance', showWidget);
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => store.flush());
