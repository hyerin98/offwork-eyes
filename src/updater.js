// Update checks.
//
//   Windows (installed)  electron-updater downloads in the background and
//                        installs on quit or when the user clicks restart.
//   macOS                Squirrel.Mac needs an Apple-signed app, so instead we
//                        check the latest GitHub release and, on click, re-run
//                        install-mac.sh (curl downloads aren't quarantined).
//   Windows (portable)   check only; the button opens the download page.
//
// Set OWE_FAKE_UPDATE=1.9.9 to preview the UI in development.
const { app, net, shell } = require('electron');
const { spawn } = require('child_process');

const REPO = 'hyerin98/offwork-eyes';
const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;
const INSTALL_CMD = `curl -fsSL https://raw.githubusercontent.com/${REPO}/main/install-mac.sh | bash`;
const FIRST_CHECK_MS = 15 * 1000;
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

// status: idle | available | downloading | ready | installing
let state = { status: 'idle', version: null, mode: null };
let onChange = () => {};
let autoUpdater = null;

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

async function latestVersion() {
  const res = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { 'User-Agent': 'OffWorkEyes-updater', Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  return (await res.json()).tag_name;
}

async function check() {
  if (state.status !== 'idle') return;
  if (process.env.OWE_FAKE_UPDATE) {
    set({ status: state.mode === 'nsis' ? 'ready' : 'available', version: process.env.OWE_FAKE_UPDATE });
    return;
  }
  try {
    if (state.mode === 'nsis') {
      await autoUpdater.checkForUpdates();
    } else {
      const tag = await latestVersion();
      if (newer(tag, app.getVersion())) set({ status: 'available', version: tag.replace(/^v/, '') });
    }
  } catch (e) {
    console.warn('update check failed:', e.message); // offline etc.; try again later
  }
}

function install() {
  if (state.mode === 'nsis' && state.status === 'ready') {
    if (process.env.OWE_FAKE_UPDATE) return console.log('[fake] quitAndInstall');
    autoUpdater.quitAndInstall(true, true); // silent install, relaunch afterwards
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

  setTimeout(check, FIRST_CHECK_MS);
  setInterval(check, CHECK_EVERY_MS);
}

module.exports = { start, install, getState: () => state };
