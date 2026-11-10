// Pupil shapes shared by the widget and the settings panel.
// Each shape is drawn centered at (0, 0) with base radius r.
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const HEART = 'M0 .86C-.3 .62-1 .2-1-.3-1-.74-.56-1-.25-.95-.1-.92 0-.8 0-.64 0-.8.1-.92.25-.95.56-1 1-.74 1-.3 1 .2.3.62 0 .86Z';

  function el(tag, attrs) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function starPath(outer, inner) {
    let d = '';
    for (let i = 0; i < 10; i++) {
      const a = (-90 + i * 36) * (Math.PI / 180);
      const r = i % 2 ? inner : outer;
      d += `${i ? 'L' : 'M'}${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`;
    }
    return d + 'Z';
  }

  // How far each shape reaches beyond r, used to keep pupils inside the eye.
  const EXTENT = { circle: 1, sparkle: 1, heart: 1.15, star: 1.3 };

  function build(shape, r, color) {
    switch (shape) {
      case 'sparkle':
        return [
          el('circle', { r, fill: color }),
          el('circle', { cx: -r * 0.33, cy: -r * 0.35, r: r * 0.3, fill: '#fff' }),
          el('circle', { cx: r * 0.38, cy: r * 0.32, r: r * 0.13, fill: '#fff' }),
        ];
      case 'heart':
        return [el('path', { d: HEART, fill: color, transform: `translate(0 ${r * 0.08}) scale(${r * 1.15})` })];
      case 'star':
        return [el('path', {
          d: starPath(r * 1.22, r * 0.58),
          fill: color,
          stroke: color,
          'stroke-width': r * 0.22,
          'stroke-linejoin': 'round',
        })];
      default:
        return [el('circle', { r, fill: color })];
    }
  }

  window.PupilShapes = { build, el, EXTENT, LIST: ['circle', 'sparkle', 'heart', 'star'] };
})();
