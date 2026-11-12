const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULTS = {
  offTime: '18:00',
  bodyColor: '#F96420', // null = eyes only
  pupilColor: '#1E1E1C',
  pupilShape: 'circle',
  pupilSize: 1,
  bubbleStyle: 'classic', // 'classic' | 'battery'
  bubbleFont: 'pixel', // 'pixel' | 'system'
  motion: true, // idle motions every 30-60s
  sfx: true, // sound effects with the motions
  hourlyChime: false,
  size: 'medium',
  alwaysOnTop: true,
  openAtLogin: false,
  position: null,
  firstRun: true,
  guideSeen: 0, // last update guide shown in the widget (GUIDE in main.js)
  bubbleLearned: false, // opened the settings from the bubble (stops the click hint)
};

// v1.0.0 stored a named color
const LEGACY_COLORS = { orange: '#F96420', navy: '#00388C', green: '#07463C', pink: '#FFC6D9', none: null };

let file;
let data;
let timer = null;

function load() {
  file = path.join(app.getPath('userData'), 'settings.json');
  let saved = {};
  try {
    saved = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  } catch {}
  data = { ...DEFAULTS, ...saved };
  if (typeof data.motion === 'string') data.motion = data.motion !== 'off'; // 1.0.9 dev builds
  if ('color' in data) {
    if (!('bodyColor' in saved) && data.color in LEGACY_COLORS) data.bodyColor = LEGACY_COLORS[data.color];
    delete data.color;
  }
  return data;
}

// Debounced so dragging or slider changes don't hammer the disk.
function save() {
  clearTimeout(timer);
  timer = setTimeout(flush, 400);
}

function flush() {
  clearTimeout(timer);
  timer = null;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('settings save failed', e);
  }
}

module.exports = { load, save, flush };
