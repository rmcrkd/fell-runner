import { TILE } from './config.js';
import { T } from './level.js';

// A small elevation profile of the whole route, drawn as SVG in the HUD:
// where you are, where your ghost is, the cairns and the summit. Markers
// differ in shape as well as colour.

const NS = 'http://www.w3.org/2000/svg';
const W = 200;
const H = 36;
const PAD = 3;

const el = (name, attrs) => {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};

// The height of the ground (the first non-air tile from the top) at each of
// `n` evenly spaced points along the level, in pixels from the top.
export function surfaceProfile(level, n = 120) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const tx = Math.min(level.cols - 1, Math.floor((i / (n - 1)) * (level.cols - 1)));
    let ty = 0;
    while (ty < level.rows && level.kind(tx, ty) === T.AIR) ty++;
    out.push(ty * TILE);
  }
  return out;
}

export class RouteMap {
  constructor(svg) {
    this.svg = svg;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  }

  setLevel(level) {
    this.level = level;
    const prof = surfaceProfile(level);
    // Ignore bottomless gaps when scaling: they'd flatten everything else
    const solid = prof.filter((y) => y < level.height);
    this.top = Math.min(...solid, level.finish.y - 24);
    this.bottom = Math.max(...solid);
    const pts = prof.map((y, i) => `${((i / (prof.length - 1)) * W).toFixed(1)},${this.sy(Math.min(y, this.bottom)).toFixed(1)}`);
    this.svg.replaceChildren(
      el('path', { class: 'rm-ground', d: `M0,${H} L${pts.join(' L')} L${W},${H} Z` }),
      ...level.cairns.map((c) => el('path', { class: 'rm-cairn', 'data-i': c.index, d: this.triangle(this.sx(c.x + 4), this.sy(c.y) - 1) })),
      el('path', { class: 'rm-summit', d: this.flag(this.sx(level.finish.x + 4), this.sy(level.finish.y)) }),
      (this.ghost = el('circle', { class: 'rm-ghost', r: 2.6 })),
      (this.you = el('circle', { class: 'rm-you', r: 3 })),
    );
    // Hidden through the style property: a style="" attribute would break the
    // Content-Security-Policy in index.html
    this.ghost.style.display = 'none';
    this.you.style.display = 'none';
  }

  sx(x) {
    return (x / this.level.width) * W;
  }

  sy(y) {
    const t = (y - this.top) / Math.max(1, this.bottom - this.top);
    return PAD + t * (H - PAD * 2);
  }

  triangle(x, y) {
    return `M${x - 3},${y} L${x + 3},${y} L${x},${y - 5} Z`;
  }

  flag(x, y) {
    return `M${x},${y} L${x},${y - 9} L${x + 6},${y - 7} L${x},${y - 5}`;
  }

  // `you` and `ghost` are { x, y } of the runner's feet, or null.
  update(you, ghost, reached) {
    const place = (c, p) => {
      c.style.display = p ? '' : 'none';
      if (!p) return;
      c.setAttribute('cx', this.sx(p.x + 4).toFixed(1));
      c.setAttribute('cy', Math.min(H - 2, this.sy(p.y) - 3).toFixed(1));
    };
    place(this.you, you);
    place(this.ghost, ghost);
    if (reached !== this.reached) {
      this.reached = reached;
      for (const c of this.svg.querySelectorAll('.rm-cairn')) c.classList.toggle('reached', Number(c.dataset.i) <= reached);
    }
  }
}
