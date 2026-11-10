// Generates app + tray icons as PNGs with no dependencies (zlib + a tiny PNG encoder).
// Run: npm run icons
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// scene(u, v) -> [r, g, b, a(0..1)] in unit coords; supersampled for anti-aliasing
function render(size, scene, ss = 5) {
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const c = scene((x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size);
          if (!c) continue;
          r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3];
        }
      }
      const i = (y * size + x) * 4;
      if (a > 0) {
        out[i] = Math.round(r / a);
        out[i + 1] = Math.round(g / a);
        out[i + 2] = Math.round(b / a);
      }
      out[i + 3] = Math.round((a / (ss * ss)) * 255);
    }
  }
  return encodePng(size, size, out);
}

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 1];
const ORANGE = hex('#F96420');
const WHITE = hex('#F4F4F4');
const INK = hex('#1E1E1C');
const BLACK = [0, 0, 0, 1];

const inCircle = (u, v, cx, cy, r) => (u - cx) ** 2 + (v - cy) ** 2 <= r * r;
function inRoundRect(u, v, x0, y0, x1, y1, rad) {
  const dx = Math.max(x0 + rad - u, 0, u - (x1 - rad));
  const dy = Math.max(y0 + rad - v, 0, v - (y1 - rad));
  return u >= x0 && u <= x1 && v >= y0 && v <= y1 && dx * dx + dy * dy <= rad * rad;
}

// Eye pair: radius r, centers separated by 1.64r (same ratio as the widget)
function eyes(u, v, { cx, cy, r, look = [0.3, 0.25], ring = 0, white = WHITE, ink = INK }) {
  const lx = cx - 0.82 * r;
  const rx = cx + 0.82 * r;
  const pr = 0.37 * r;
  const off = (r - pr - r * 0.06);
  for (const ex of [lx, rx]) {
    if (inCircle(u, v, ex + look[0] * off, cy + look[1] * off, pr)) return ink;
  }
  const outer = inCircle(u, v, lx, cy, r) || inCircle(u, v, rx, cy, r);
  if (!outer) return null;
  if (ring > 0) {
    const inner = inCircle(u, v, lx, cy, r - ring) || inCircle(u, v, rx, cy, r - ring);
    if (!inner) return ink;
  }
  return white;
}

const appIcon = (u, v) =>
  eyes(u, v, { cx: 0.5, cy: 0.5, r: 0.2, look: [0.55, 0.45] }) ||
  (inRoundRect(u, v, 0.08, 0.08, 0.92, 0.92, 0.2) ? ORANGE : null);

const trayColor = (u, v) => eyes(u, v, { cx: 0.5, cy: 0.5, r: 0.27, ring: 0.075, look: [0.5, 0.4] });
const trayTemplate = (u, v) => {
  const c = eyes(u, v, { cx: 0.5, cy: 0.5, r: 0.27, ring: 0.085, look: [0.5, 0.4], white: null, ink: BLACK });
  return c || null;
};

const root = path.join(__dirname, '..');
const write = (rel, buf) => {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
  console.log('wrote', rel);
};

write('build/icon.png', render(1024, appIcon, 3));
write('src/assets/tray.png', render(16, trayColor, 8));
write('src/assets/tray@2x.png', render(32, trayColor, 8));
write('src/assets/trayTemplate.png', render(18, trayTemplate, 8));
write('src/assets/trayTemplate@2x.png', render(36, trayTemplate, 8));
