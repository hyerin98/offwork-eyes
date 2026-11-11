// Update checks.
//
//   Windows (installed)  electron-updater downloads in the background and
//                        installs on quit or when the user clicks restart.
//   macOS                Squirrel.Mac needs an Apple-signed app, so instead we
//                        download the release zip for this CPU in the background
//                        and unpack it. On click a small script waits for this
//                        app to quit, swaps the bundle and reopens it, so the
//                        update takes seconds. If the bundle can't be replaced
//                        in place, install-mac.sh is used instead.
//   Windows (portable)   check only; the button opens the download page.
//
// Schedule: 15s after launch, then hourly. Checks pause while the screen is
// locked or the PC sleeps, and run again right after unlock/resume (unless one
// ran in the last few minutes), so nothing is sent while nobody is using it.
//
// Set OWE_FAKE_UPDATE=1.9.9 to preview the UI in development.
const { app, net, shell } = require('electron');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const REPO = 'hyerin98/offwork-eyes';
const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;
const INSTALL_CMD = `curl -fsSL https://raw.githubusercontent.com/${REPO}/main/install-mac.sh | bash`;
const FIRST_CHECK_MS = 15 * 1000;
const CHECK_EVERY_MS = 60 * 60 * 1000;
const RESUME_DELAY_MS = 10 * 1000;   // give the network a moment after unlock/wake
const MIN_GAP_MS = 10 * 60 * 1000;   // skip the resume check if one ran this recently

// status: idle | available | downloading | ready | installing
let state = { status: 'idle', version: null, mode: null };
let onChange = () => {};
let autoUpdater = null;
let timer = null;
let lastCheck = 0;

function set(patch) {
  state = { ...state, ...patch };
  onChange(state);
}

function detectMode() {
  if (process.env.OWE_FAKE_UPDATE) return process.platform === 'darwin' ? 'script' : 'nsis';
  if (!app.isPackaged) return null;
  if (process.platform === 'darwin') return 'script';
  if (process.platform === 'win32') return process.env.PORTABLE_EXECUTABLE_FILE ? 'page' : 'nsis';
  return 'page';
}

function newer(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map(Number);
  const pb = String(b).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

async function latestRelease() {
  const res = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { 'User-Agent': 'OffWorkEyes-updater', Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  return res.json();
}

// ---------- macOS: download ahead, swap on click ----------

const stageDir = () => path.join(app.getPath('userData'), 'update');
const STAGED_APP = 'OffWork Eyes.app';
let staged = null; // { version, app } once the new bundle is unpacked

// .../OffWork Eyes.app/Contents/MacOS/OffWork Eyes -> .../OffWork Eyes.app
function bundlePath() {
  return path.resolve(app.getPath('exe'), '..', '..', '..');
}

function canSwapInPlace() {
  const b = bundlePath();
  if (!b.endsWith('.app') || b.startsWith('/Volumes/') || b.includes('/AppTranslocation/')) return false;
  try {
    fs.accessSync(path.dirname(b), fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

// a zip for this CPU (smaller), else the universal one from older releases
function macZip(release) {
  const zips = (release.assets || []).filter((a) => a.name.endsWith('.zip'));
  return zips.find((a) => a.name.endsWith(`-mac-${process.arch}.zip`))
    || zips.find((a) => a.name.endsWith('-mac-universal.zip') || a.name.endsWith('-mac.zip'));
}

const run = (cmd, args) => new Promise((resolve, reject) => {
  execFile(cmd, args, (err) => (err ? reject(err) : resolve()));
});

async function stage(release, version) {
  const asset = macZip(release);
  if (!asset) throw new Error('no mac zip in the release');
  const dir = stageDir();
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const zip = path.join(dir, 'app.zip');
  const res = await net.fetch(asset.browser_download_url, { headers: { 'User-Agent': 'OffWorkEyes-updater' } });
  if (!res.ok || !res.body) throw new Error(`download ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(zip));
  await run('/usr/bin/ditto', ['-x', '-k', zip, path.join(dir, 'new')]);
  fs.rmSync(zip, { force: true });
  const bundle = path.join(dir, 'new', STAGED_APP);
  if (!fs.existsSync(path.join(bundle, 'Contents', 'MacOS'))) throw new Error('app missing in zip');
  staged = { version, app: bundle };
}

// Runs after this app quits: wait for the process to exit, replace the bundle,
// reopen it. Paths are passed as arguments, never pasted into the script.
const SWAP_SH = `
pid="$1"; new="$2"; dest="$3"; stage="$4"
for i in $(seq 1 100); do kill -0 "$pid" 2>/dev/null || break; sleep 0.1; done
kill -9 "$pid" 2>/dev/null || true
rm -rf "$dest" && ditto "$new" "$dest" || exit 1
xattr -cr "$dest" 2>/dev/null || true
rm -rf "$stage"
open "$dest"
`;

function swapAndRelaunch() {
  spawn('/bin/bash', ['-c', SWAP_SH, 'swap', String(process.pid), staged.app, bundlePath(), stageDir()], {
    detached: true,
    stdio: 'ignore',
  }).unref();
  app.quit();
}

async function check() {
  if (state.status !== 'idle') return;
  lastCheck = Date.now();
  if (process.env.OWE_FAKE_UPDATE) {
    set({ status: state.mode === 'nsis' ? 'ready' : 'available', version: process.env.OWE_FAKE_UPDATE });
    return;
  }
  try {
    if (state.mode === 'nsis') {
      await autoUpdater.checkForUpdates();
    } else {
      const release = await latestRelease();
      const tag = release.tag_name;
      if (!newer(tag, app.getVersion())) return;
      const version = tag.replace(/^v/, '');
      if (state.mode === 'script' && canSwapInPlace()) {
        if (staged && staged.version === version && fs.existsSync(staged.app)) return set({ status: 'ready', version });
        set({ status: 'downloading', version });
        await stage(release, version);
        set({ status: 'ready', version });
      } else {
        set({ status: 'available', version });
      }
    }
  } catch (e) {
    console.warn('update check failed:', e.message); // offline etc.; try again later
    if (state.status === 'downloading') set({ status: 'idle' });
  }
}

function install() {
  if (state.mode === 'nsis' && state.status === 'ready') {
    if (process.env.OWE_FAKE_UPDATE) return console.log('[fake] quitAndInstall');
    autoUpdater.quitAndInstall(true, true); // silent install, relaunch afterwards
  } else if (state.mode === 'script' && state.status === 'ready' && staged) {
    set({ status: 'installing' });
    if (process.env.OWE_FAKE_UPDATE) return console.log('[fake] swap bundle and relaunch');
    swapAndRelaunch();
  } else if (state.mode === 'script' && state.status === 'available') {
    set({ status: 'installing' });
    if (process.env.OWE_FAKE_UPDATE) return console.log('[fake] run install-mac.sh');
    // Detached so it survives when the script quits this app to replace it.
    spawn('/bin/bash', ['-c', INSTALL_CMD], { detached: true, stdio: 'ignore' }).unref();
  } else if (state.mode === 'page') {
    shell.openExternal(RELEASES_URL);
  }
}

function start(cb) {
  onChange = cb;
  const mode = detectMode();
  if (!mode) return;
  state.mode = mode;

  if (mode === 'nsis' && !process.env.OWE_FAKE_UPDATE) {
    ({ autoUpdater } = require('electron-updater')); // loaded only where it's used
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('update-available', (info) => set({ status: 'downloading', version: info.version }));
    autoUpdater.on('update-downloaded', (info) => set({ status: 'ready', version: info.version }));
    autoUpdater.on('error', (e) => {
      console.warn('auto update error:', e && e.message);
      if (state.status === 'downloading') set({ status: 'idle' });
    });
  }

  schedule(FIRST_CHECK_MS);
}

function schedule(delay) {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    await check();
    schedule(CHECK_EVERY_MS);
  }, delay);
}

// screen locked / PC going to sleep
function pause() {
  if (!state.mode) return;
  clearTimeout(timer);
  timer = null;
}

// screen unlocked / PC woke up
function resume() {
  if (!state.mode) return;
  const sinceLast = Date.now() - lastCheck;
  schedule(sinceLast < MIN_GAP_MS ? CHECK_EVERY_MS - sinceLast : RESUME_DELAY_MS);
}

module.exports = { start, install, pause, resume, getState: () => state };
