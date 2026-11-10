// Full-screen eyedropper: shows a frozen screenshot of this display and
// picks the pixel under the cursor. One window per display.
const $ = (id) => document.getElementById(id);
const shot = $('shot');
const ctx = shot.getContext('2d', { willReadFrequently: true });
const zoom = $('zoom');
const zctx = zoom.getContext('2d');
const loupe = $('loupe');
const GRID = 11; // pixels shown across the loupe
const CELL = zoom.width / GRID;

let ready = false;
let bounds = null; // this display's bounds in screen DIP
let sx = 1;
let sy = 1;
let current = null;
let pending = null;
let placed = '';
let earlyClick = null; // a click made before the capture finished

const hex2 = (n) => n.toString(16).padStart(2, '0');

// Pin the image to the display's real position. Windows can clamp this window
// (e.g. above the taskbar), so window size and display size may differ.
function place() {
  const key = `${window.screenX},${window.screenY}`;
  if (!bounds || key === placed) return;
  placed = key;
  shot.style.left = `${bounds.x - window.screenX}px`;
  shot.style.top = `${bounds.y - window.screenY}px`;
  shot.style.width = `${bounds.width}px`;
  shot.style.height = `${bounds.height}px`;
}

api.onEyedropperImage(async (url, b) => {
  bounds = b;
  const img = new Image();
  img.src = url;
  await img.decode();
  shot.width = img.naturalWidth;
  shot.height = img.naturalHeight;
  ctx.drawImage(img, 0, 0);
  sx = img.naturalWidth / bounds.width;
  sy = img.naturalHeight / bounds.height;
  place();
  ready = true;
  document.body.classList.add('ready');
  if (earlyClick) {
    api.eyedropperPick(sample(earlyClick.x, earlyClick.y).hex);
    return;
  }
  if (current) draw();
});

window.addEventListener('resize', place);

function sample(x, y) {
  place();
  const dx = x + window.screenX - bounds.x; // client → display coordinates
  const dy = y + window.screenY - bounds.y;
  const px = Math.min(shot.width - 1, Math.max(0, Math.floor(dx * sx)));
  const py = Math.min(shot.height - 1, Math.max(0, Math.floor(dy * sy)));
  const [r, g, b] = ctx.getImageData(px, py, 1, 1).data;
  return { px, py, hex: `#${hex2(r)}${hex2(g)}${hex2(b)}`.toUpperCase() };
}

function draw() {
  pending = null;
  if (!ready || !current) return;
  const { x, y } = current;
  const s = sample(x, y);
  current.hex = s.hex;

  zctx.imageSmoothingEnabled = false;
  zctx.fillStyle = '#000';
  zctx.fillRect(0, 0, zoom.width, zoom.height);
  const half = Math.floor(GRID / 2);
  zctx.drawImage(shot, s.px - half, s.py - half, GRID, GRID, 0, 0, zoom.width, zoom.height);
  zctx.lineWidth = 2;
  zctx.strokeStyle = '#fff';
  zctx.strokeRect(half * CELL, half * CELL, CELL, CELL);
  zctx.strokeStyle = '#000';
  zctx.lineWidth = 1;
  zctx.strokeRect(half * CELL - 1.5, half * CELL - 1.5, CELL + 3, CELL + 3);

  $('hex').textContent = s.hex;
  $('swatch').style.background = s.hex;

  // keep the loupe on screen, flipping to the other side near edges
  loupe.hidden = false;
  const w = loupe.offsetWidth;
  const h = loupe.offsetHeight;
  let lx = x + 22;
  let ly = y + 22;
  if (lx + w > window.innerWidth) lx = x - 22 - w;
  if (ly + h > window.innerHeight) ly = y - 22 - h;
  loupe.style.transform = `translate(${lx}px, ${ly}px)`;
}

window.addEventListener('mousemove', (e) => {
  current = { x: e.clientX, y: e.clientY };
  if (!pending) pending = requestAnimationFrame(draw);
});

window.addEventListener('mouseleave', () => { loupe.hidden = true; });

window.addEventListener('mousedown', (e) => {
  if (!ready) {
    if (e.button === 0) earlyClick = { x: e.clientX, y: e.clientY };
    else api.eyedropperCancel();
    return;
  }
  if (e.button === 0) {
    const s = sample(e.clientX, e.clientY);
    api.eyedropperPick(s.hex);
  } else {
    api.eyedropperCancel();
  }
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') api.eyedropperCancel();
});

window.addEventListener('contextmenu', (e) => e.preventDefault());
