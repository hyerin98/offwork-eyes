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
});
