const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // shared
  getSettings: () => ipcRenderer.invoke('get-settings'),
  onSettings: (cb) => ipcRenderer.on('settings', (_e, s) => cb(s)),
  update: (patch) => ipcRenderer.send('update-settings', patch),

  // widget
  onCursor: (cb) => ipcRenderer.on('cursor', (_e, x, y) => cb(x, y)),
  onRefresh: (cb) => ipcRenderer.on('refresh', () => cb()),
  setHitRects: (rects) => ipcRenderer.send('hit-rects', rects),
  dragStart: () => ipcRenderer.send('drag-start'),
  dragEnd: () => ipcRenderer.send('drag-end'),
  openMenu: () => ipcRenderer.send('open-menu'),

  // settings panel
  closePanel: () => ipcRenderer.send('close-panel'),
  installUpdate: () => ipcRenderer.send('install-update'),
  platform: process.platform,
  startEyedropper: (key) => ipcRenderer.send('eyedropper-start', key),

  // eyedropper overlay
  onEyedropperImage: (cb) => ipcRenderer.on('eyedropper-image', (_e, url, bounds) => cb(url, bounds)),
  eyedropperPick: (hex) => ipcRenderer.send('eyedropper-pick', hex),
  eyedropperCancel: () => ipcRenderer.send('eyedropper-cancel'),
});
