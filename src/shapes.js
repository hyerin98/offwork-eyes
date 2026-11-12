// Eye expressions shared by the widget and the settings panel.
//
// Each expression describes one eye (mirrored for the other with s = -1 / +1):
//   white   eye-white ellipse {rx, ry, rot}
//   pr      pupil radius multiplier
//   rest    pupil rest offset {x, y}
//   pupil   (r, color) => nodes drawn at the origin
//   lid     eyelid edge {from, to, ctrl?}; everything above it is masked away
//   lidLine draw an ink line along the lid edge
//   deco    (s, ink) => nodes drawn outside the eye (lashes, dark circles)
// Eyes are drawn in a 200x120 box with centers at (59, 60) and (141, 60).
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const WHITE = '#F4F4F4';
  const EYE_X = [59, 141];
  const EYE_Y = 60;
  const R = 50;
  const BASE_PR = 18.5;
  const HEART = 'M0 .86C-.3 .62-1 .2-1-.3-1-.74-.56-1-.25-.95-.1-.92 0-.8 0-.64 0-.8.1-.92.25-.95.56-1 1-.74 1-.3 1 .2.3.62 0 .86Z';

  function el(tag, attrs = {}, kids = []) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    for (const c of kids) e.append(c);
    return e;
  }

  const f = (n) => +n.toFixed(2);

  // ---------- pupil drawings ----------

  const dot = (r, c) => [el('circle', { r, fill: c })];

  const shiny = (r, c) => [
    el('circle', { r, fill: c }),
    el('circle', { cx: f(-r * 0.33), cy: f(-r * 0.35), r: f(r * 0.3), fill: '#fff' }),
    el('circle', { cx: f(r * 0.38), cy: f(r * 0.32), r: f(r * 0.13), fill: '#fff' }),
  ];

  function star4(r, c) {
    const k = r * 0.22;
    const d = `M0 ${f(-r)}Q${f(k)} ${f(-k)} ${f(r)} 0Q${f(k)} ${f(k)} 0 ${f(r)}Q${f(-k)} ${f(k)} ${f(-r)} 0Q${f(-k)} ${f(-k)} 0 ${f(-r)}Z`;
    return [el('path', { d, fill: c })];
  }

  function heart(r, c) {
    return [el('path', { d: HEART, fill: c, transform: `translate(0 ${f(r * 0.08)}) scale(${f(r * 1.15)})` })];
  }

  function spiral(r, c) {
    let d = '';
    const steps = 48;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = t * Math.PI * 2 * 2.3;
      const rr = r * (0.12 + 0.88 * t);
      d += `${i ? 'L' : 'M'}${f(Math.cos(a) * rr)} ${f(Math.sin(a) * rr)}`;
    }
    return [el('path', { d, fill: 'none', stroke: c, 'stroke-width': f(r * 0.24), 'stroke-linecap': 'round' })];
  }

  // ---------- decorations ----------

  function lashes(_s, ink) {
    return [-62, -90, -118].map((deg) => {
      const a = (deg * Math.PI) / 180;
      return el('line', {
        x1: f(Math.cos(a) * (R + 5)), y1: f(Math.sin(a) * (R + 5)),
        x2: f(Math.cos(a) * (R + 17)), y2: f(Math.sin(a) * (R + 17)),
        stroke: ink, 'stroke-width': 6, 'stroke-linecap': 'round',
      });
    });
  }

  function darkCircles() {
    return [el('path', {
      d: 'M-30 52Q0 66 30 52',
      fill: 'none', stroke: 'rgba(0,0,0,.28)', 'stroke-width': 6, 'stroke-linecap': 'round',
    })];
  }

  function sweat(s) {
    if (s < 0) return [];
    return [el('path', { d: 'M46 -46Q38 -34 44 -28Q52 -24 54 -32Q54 -38 46 -46Z', fill: '#7CC6FF', stroke: 'rgba(0,0,0,.25)', 'stroke-width': 1.5 })];
  }

  // ---------- expressions ----------

  const EXPRESSIONS = {
    circle: { label: '기본' },
    sleepy: {
      label: '졸림', pr: 0.85, rest: { x: 0, y: 14 }, up: 0, lidLine: true,
      lid: () => ({ from: [-60, -6], ctrl: [0, 26], to: [60, -6] }),
    },
    angry: {
      label: '화남', pr: 0.9, rest: { x: 0, y: 10 }, up: 0.15, lidLine: true,
      lid: (s) => ({ from: [s * 60, -40], to: [-s * 60, -2] }),
    },
    meh: {
      label: '시큰둥', pr: 0.9, rest: { x: 0, y: 10 }, up: 0.1, lidLine: true,
      lid: () => ({ from: [-60, -14], to: [60, -14] }),
    },
    side: {
      label: '곁눈질', pr: 0.72,
      white: (s) => ({ rx: 48, ry: 30, rot: -s * 12 }),
    },
    surprised: {
      label: '놀람', pr: 0.55,
      white: () => ({ rx: 36, ry: 50, rot: 0 }),
      pupil: shiny,
    },
    crush: { label: '설렘', pr: 1.05, pupil: shiny, deco: lashes },
    blank: { label: '멍', pr: 0.26 },
    sparkle: { label: '의욕', pr: 1.15, pupil: star4, ext: 1 },
    payday: { label: '월급날', pr: 1.05, pupil: heart, ext: 1.15 },
    meeting: { label: '회의중', pr: 1.15, pupil: spiral, ext: 1.05 },
    overtime: {
      label: '야근', pr: 0.7, rest: { x: 0, y: 8 }, up: 0.2, lidLine: true,
      lid: (s) => ({ from: [s * 60, -14], to: [-s * 60, -28] }),
      deco: (s, ink) => [...darkCircles(), ...sweat(s, ink)],
    },
  };

  // ---------- motion faces ----------
  // Layers the widget's motions switch on for a moment (style.css). Pupil faces
  // swap only the pupils, so the chosen expression's eye whites, lids and
  // decorations stay; closed faces hide the eyes but keep the decorations.
  // Sizes are fixed (times the pupil size setting) so they read the same on
  // every expression. When the expression already has that pupil, `alt` is used.

  const PUPIL_FACES = {
    tiny: { r: 7, draw: dot },
    wide: { r: 23, draw: shiny },
    star: { r: 22, draw: star4, same: star4, alt: { r: 28, draw: shiny } },
    dizzy: { r: 22, draw: spiral, same: spiral, alt: { r: 28, draw: spiral } },
  };

  const ink9 = (d, ink) => el('path', { d, fill: 'none', stroke: ink, 'stroke-width': 9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  const TEAR = '#7CC6FF';

  const CLOSED_FACES = {
    squeeze: (s, ink) => [ink9(s < 0 ? 'M-17 -20L17 0L-17 20' : 'M17 -20L-17 0L17 20', ink)], // > <
    smile: (_s, ink) => [ink9('M-22 10Q0 -22 22 10', ink)], // ^ ^
    cry: (_s, ink) => [ // ㅠㅠ
      ink9('M-24 -8Q0 6 24 -8', ink),
      el('path', { d: 'M-14 6Q-20 30 -14 44M14 6Q20 30 14 44', fill: 'none', stroke: TEAR, 'stroke-width': 8, 'stroke-linecap': 'round' }),
    ],
  };

  const LEGACY = { star: 'sparkle', heart: 'payday' };
  const LIST = Object.keys(EXPRESSIONS);

  function resolve(key) {
    key = LEGACY[key] || key;
    return EXPRESSIONS[key] ? key : 'circle';
  }

  function lidPaths(lid) {
    const [x1, y1] = lid.from;
    const [x2, y2] = lid.to;
    const edge = lid.ctrl ? `M${x1} ${y1}Q${lid.ctrl[0]} ${lid.ctrl[1]} ${x2} ${y2}` : `M${x1} ${y1}L${x2} ${y2}`;
    return { edge, fill: `${edge}L${x2} -120L${x1} -120Z` };
  }

  let uid = 0;

  /**
   * Draws a pair of eyes into `container` (a <g> in a 200x120 coordinate box).
   * Returns the pupil groups to move for tracking and how far each may move.
   */
  function render(container, key, { pupilColor = '#1E1E1C', pupilSize = 1, motionFaces = false } = {}) {
    const ex = EXPRESSIONS[resolve(key)];
    const id = `eyemask-${++uid}`;
    const mask = el('mask', { id, maskUnits: 'userSpaceOnUse', x: -40, y: -60, width: 280, height: 240 });
    const defs = el('defs', {}, [mask]);
    const masked = el('g', { class: 'masked', mask: `url(#${id})` });
    const whites = el('g');
    const pupils = el('g');
    const lines = el('g', { class: 'lid-line' });
    const deco = el('g', { class: 'deco' });
    const happy = el('g', { class: 'happy', display: 'none' }); // widget CSS reveals it at off time
    const looks = [];
    const maxOff = [];
    const ink = pupilColor;

    EYE_X.forEach((cx, i) => {
      const s = i === 0 ? -1 : 1;
      const at = `translate(${cx} ${EYE_Y})`;
      const w = ex.white ? ex.white(s) : { rx: R, ry: R, rot: 0 };
      const shape = (fill) => el('ellipse', { rx: w.rx, ry: w.ry, fill, transform: `${at} rotate(${w.rot})` });

      mask.append(shape('#fff'));
      whites.append(shape(WHITE));

      const pr = BASE_PR * (ex.pr || 1) * pupilSize;
      const ext = ex.ext || 1;
      const rest = ex.rest || { x: 0, y: 0 };
      const draw = ex.pupil || dot;
      let pupilNodes = draw(pr, pupilColor);
      if (motionFaces) {
        const fit = Math.min(w.rx, w.ry) - 6; // stay inside narrow eye whites
        pupilNodes = [el('g', { class: 'pf pf-base' }, pupilNodes)];
        for (const name in PUPIL_FACES) {
          const pf = PUPIL_FACES[name].same === draw ? PUPIL_FACES[name].alt : PUPIL_FACES[name];
          const r = Math.min(fit, pf.r * pupilSize);
          pupilNodes.push(el('g', { class: `pf pf-${name}` }, pf.draw(r, pupilColor)));
        }
      }
      const inner = el('g', { transform: `translate(${rest.x} ${rest.y})` }, pupilNodes);
      const look = el('g', { class: 'look' }, [inner]);
      pupils.append(el('g', { transform: at }, [look]));
      looks.push(look);
      const my = Math.max(2, w.ry - pr * ext - 3 - Math.abs(rest.y));
      maxOff.push({
        x: Math.max(2, w.rx - pr * ext - 3 - Math.abs(rest.x)),
        y: my,
        up: my * (ex.up ?? 1), // eyelids: don't let pupils roll up behind the lid
      });

      if (ex.lid) {
        const { edge, fill } = lidPaths(ex.lid(s));
        mask.append(el('path', { d: fill, fill: '#000', transform: at }));
        if (ex.lidLine) {
          // clip to this eye's own white so the line doesn't run into the other eye
          const clipId = `${id}-c${i}`;
          defs.append(el('clipPath', { id: clipId }, [el('ellipse', { rx: w.rx, ry: w.ry, transform: `rotate(${w.rot})` })]));
          lines.append(el('path', {
            d: edge, fill: 'none', stroke: ink, 'stroke-width': 9, 'stroke-linecap': 'round',
            transform: at, 'clip-path': `url(#${clipId})`,
          }));
        }
      }
      if (ex.deco) deco.append(el('g', { transform: at }, ex.deco(s, ink)));

      happy.append(el('path', {
        d: `M${cx - 22} 70Q${cx} 38 ${cx + 22} 70`,
        fill: 'none', stroke: ink, 'stroke-width': 9, 'stroke-linecap': 'round',
      }));
    });

    masked.append(whites, pupils, lines);
    const closed = [];
    if (motionFaces) {
      for (const name in CLOSED_FACES) {
        closed.push(el('g', { class: `cf cf-${name}` }, EYE_X.map((cx, i) =>
          el('g', { transform: `translate(${cx} ${EYE_Y})` }, CLOSED_FACES[name](i === 0 ? -1 : 1, ink)))));
      }
    }
    container.replaceChildren(defs, masked, deco, happy, ...closed);
    return { looks, maxOff };
  }

  window.Eyes = { render, resolve, LIST, label: (k) => EXPRESSIONS[k].label, el };
})();
