import { TILE } from './config.js';

// Levels are plain text maps. Each character is one 8x8 tile:
//
//   #  rock            B  boulder (solid)      =  stone wall (solid)
//   -  ledge you can jump up through          ^  sharp rocks (deadly)
//   ~  tarn water (deadly, and very cold)      *  Kendal mint cake: refills dash and stamina
//   %  loose rock: gives way just after you stand on or grab it, then settles back
//   C  cairn checkpoint                        P  start
//   F  summit marker (finish)                  .  or space: air
//   h  a Herdwick sheep (scenery only)        ?  a signpost with a tip (scenery only)
export const T = { AIR: 0, SOLID: 1, LEDGE: 2, SPIKE: 3, WATER: 4, LOOSE: 5 };

// Loose rock timings, in seconds
export const LOOSE_CRUMBLE = 0.4;
export const LOOSE_RESPAWN = 2;

// Wind strength at the valley floor, as a fraction of the full force on the
// tops, and how much the lee of a crag or wall takes off it.
export const EXPOSURE_VALLEY = 0.65;
export const LEE_SHELTER = 0.7;
const LEE_REACH = 12;

const TILE_KIND = {
  '#': T.SOLID,
  B: T.SOLID,
  '=': T.SOLID,
  '-': T.LEDGE,
  '^': T.SPIKE,
  '~': T.WATER,
  '%': T.LOOSE,
};

export class Level {
  constructor(def) {
    this.def = def;
    this.id = def.id;
    const rows = def.map.replace(/^\n+|\s+$/g, '').split('\n');
    this.cols = Math.max(...rows.map((r) => r.length));
    this.rows = rows.length;
    this.width = this.cols * TILE;
    this.height = this.rows * TILE;
    this.kinds = new Uint8Array(this.cols * this.rows);
    this.chars = [];
    this.cairns = [];
    this.cakes = [];
    this.loose = [];
    this.looseIndex = new Map();
    this.sheep = [];
    this.signs = [];
    this.start = null;
    this.finish = null;

    for (let ty = 0; ty < this.rows; ty++) {
      const row = rows[ty].padEnd(this.cols, '.');
      this.chars.push(row);
      for (let tx = 0; tx < this.cols; tx++) {
        const ch = row[tx];
        const px = tx * TILE;
        const py = ty * TILE;
        this.kinds[ty * this.cols + tx] = TILE_KIND[ch] ?? T.AIR;
        if (ch === 'P') this.start = { x: px, y: py + TILE };
        // Cairns trigger for anyone passing over them, not just touching them.
        else if (ch === 'C') this.cairns.push({ x: px, y: py + TILE, rect: { x: px - 4, y: py - 88, w: 16, h: 96 } });
        else if (ch === '*') this.cakes.push({ x: px + 4, y: py + 4, rect: { x: px - 1, y: py - 1, w: 10, h: 10 } });
        else if (ch === '%') {
          this.looseIndex.set(ty * this.cols + tx, this.loose.length);
          this.loose.push({ tx, ty });
        } else if (ch === 'h') this.sheep.push({ x: px, y: py + TILE });
        else if (ch === '?') this.signs.push({ x: px, y: py + TILE, text: '' });
        else if (ch === 'F') this.finish = { x: px, y: py + TILE, rect: { x: px - 8, y: py - 24, w: 24, h: 32 } };
      }
    }
    if (!this.start) throw new Error(`Level ${def.id} has no start (P)`);
    if (!this.finish) throw new Error(`Level ${def.id} has no finish (F)`);
    this.climb = Math.max(TILE, this.start.y - this.finish.y);
    // Checkpoints are ordered left to right, which is also the route order.
    this.cairns.sort((a, b) => a.x - b.x);
    this.signs.sort((a, b) => a.x - b.x);
    this.cairns.forEach((c, i) => (c.index = i));
  }

  char(tx, ty) {
    if (ty < 0 || ty >= this.rows || tx < 0 || tx >= this.cols) return '.';
    return this.chars[ty][tx];
  }

  kind(tx, ty) {
    // The map edges act as walls at the sides and are open above and below.
    if (tx < 0 || tx >= this.cols) return T.SOLID;
    if (ty < 0 || ty >= this.rows) return T.AIR;
    return this.kinds[ty * this.cols + tx];
  }

  // `loose` is a runner's view of the loose rock (see Player): a negative
  // entry means that block has fallen away for now.
  solidAt(x, y, w, h, loose = null) {
    const x0 = Math.floor(x / TILE);
    const x1 = Math.floor((x + w - 1) / TILE);
    const y0 = Math.floor(y / TILE);
    const y1 = Math.floor((y + h - 1) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const k = this.kind(tx, ty);
        if (k === T.SOLID) return true;
        if (k === T.LOOSE && !(loose && loose[this.looseIndex.get(ty * this.cols + tx)] < 0)) return true;
      }
    }
    return false;
  }

  // Indices of loose blocks overlapping a rect.
  looseIn(x, y, w, h, out) {
    out.length = 0;
    if (!this.loose.length) return out;
    const x0 = Math.floor(x / TILE);
    const x1 = Math.floor((x + w - 1) / TILE);
    const y0 = Math.floor(y / TILE);
    const y1 = Math.floor((y + h - 1) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const i = this.looseIndex.get(ty * this.cols + tx);
        if (i !== undefined) out.push(i);
      }
    }
    return out;
  }

  // True when a rect whose bottom edge sits at `bottom` would rest on a ledge.
  ledgeAt(x, w, bottom) {
    if (bottom % TILE !== 0) return false;
    const ty = bottom / TILE;
    const x0 = Math.floor(x / TILE);
    const x1 = Math.floor((x + w - 1) / TILE);
    for (let tx = x0; tx <= x1; tx++) {
      if (this.kind(tx, ty) === T.LEDGE) return true;
    }
    return false;
  }

  // How much of the wind reaches a runner whose body spans (x, y, w, h), for
  // wind blowing towards `dir` (+1 east, -1 west). The valley is sheltered
  // and the tops take the full force, and rock or a wall just upwind puts
  // you in its lee.
  exposureAt(x, y, w, h, dir) {
    const t = Math.min(1, Math.max(0, (this.start.y - (y + h)) / this.climb));
    let e = EXPOSURE_VALLEY + (1 - EXPOSURE_VALLEY) * t;
    if (dir !== 0) {
      const edge = dir > 0 ? x - 1 : x + w;
      const tx0 = Math.floor((dir > 0 ? edge - LEE_REACH + 1 : edge) / TILE);
      const tx1 = Math.floor((dir > 0 ? edge : edge + LEE_REACH - 1) / TILE);
      const ty0 = Math.floor(y / TILE);
      const ty1 = Math.floor((y + h - 1) / TILE);
      let covered = 0;
      for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          if (this.kind(tx, ty) === T.SOLID && tx >= 0 && tx < this.cols) {
            covered++;
            break;
          }
        }
      }
      // Fully behind cover: only eddies get through
      e *= 1 - LEE_SHELTER * (covered / (ty1 - ty0 + 1));
    }
    return e;
  }

  // Returns 'spike', 'water' or null for the hazards a rect overlaps.
  hazardAt(x, y, w, h, vy) {
    const x0 = Math.floor(x / TILE);
    const x1 = Math.floor((x + w - 1) / TILE);
    const y0 = Math.floor(y / TILE);
    const y1 = Math.floor((y + h - 1) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const k = this.kind(tx, ty);
        if (k === T.SPIKE && vy >= 0) {
          // Only the lower part of the tile is sharp, so grazing the tips is safe.
          const sy = ty * TILE + 4;
          if (y + h > sy && x + w > tx * TILE + 1 && x < tx * TILE + TILE - 1) return 'spike';
        } else if (k === T.WATER) {
          if (y + h > ty * TILE + 3) return 'water';
        }
      }
    }
    return null;
  }
}

export const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
