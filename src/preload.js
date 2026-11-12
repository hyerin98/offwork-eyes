const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // shared
  getSettings: () => ipcRenderer.invoke('get-settings'),
  onSettings: (cb) => ipcRenderer.on('settings', (_e, s) => cb(s)),
  update: (patch) => ipcRenderer.send('update-settings', patch),

  // widget
  onCursor: (cb) => ipcRenderer.on('cursor', (_e, x, y) => cb(x, y)),
  onRefresh: (cb) => ipcRenderer.on('refresh', () => cb()),
  onSleep: (cb) => ipcRenderer.on('sleep', () => cb()),
  onPoke: (cb) => ipcRenderer.on('poke', () => cb()),
  setHitRects: (rects) => ipcRenderer.send('hit-rects', rects),
  dragStart: () => ipcRenderer.send('drag-start'),
  dragEnd: () => ipcRenderer.send('drag-end'),
  openMenu: () => ipcRenderer.send('open-menu'),
  togglePanel: () => ipcRenderer.send('toggle-panel'),
  onGuide: (cb) => ipcRenderer.on('guide', (_e, isNew) => cb(isNew)),
  guideDone: () => ipcRenderer.send('guide-done'),

  // settings panel
  closePanel: () => ipcRenderer.send('close-panel'),
  installUpdate: () => ipcRenderer.send('install-update'),
  sendFeedback: (data) => ipcRenderer.invoke('send-feedback', data),
  platform: process.platform,
  startEyedropper: (key) => ipcRenderer.send('eyedropper-start', key),

  // eyedropper overlay
  onEyedropperImage: (cb) => ipcRenderer.on('eyedropper-image', (_e, url, bounds) => cb(url, bounds)),
  eyedropperPick: (hex) => ipcRenderer.send('eyedropper-pick', hex),
  eyedropperCancel: () => ipcRenderer.send('eyedropper-cancel'),
});
