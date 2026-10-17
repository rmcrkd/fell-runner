import { TILE } from './config.js';

// Levels are plain text maps. Each character is one 8x8 tile:
//
//   #  rock            B  boulder (solid)      =  stone wall (solid)
//   -  ledge you can jump up through          ^  sharp rocks (deadly)
//   ~  tarn water (deadly, and very cold)      *  Kendal mint cake: refills dash and stamina
//   C  cairn checkpoint                        P  start
//   F  summit trig point (finish)             .  or space: air
export const T = { AIR: 0, SOLID: 1, LEDGE: 2, SPIKE: 3, WATER: 4 };

const TILE_KIND = {
  '#': T.SOLID,
  B: T.SOLID,
  '=': T.SOLID,
  '-': T.LEDGE,
  '^': T.SPIKE,
  '~': T.WATER,
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
        else if (ch === 'F') this.finish = { x: px, y: py + TILE, rect: { x: px - 8, y: py - 24, w: 24, h: 32 } };
      }
    }
    if (!this.start) throw new Error(`Level ${def.id} has no start (P)`);
    if (!this.finish) throw new Error(`Level ${def.id} has no finish (F)`);
    // Checkpoints are ordered left to right, which is also the route order.
    this.cairns.sort((a, b) => a.x - b.x);
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

  solidAt(x, y, w, h) {
    const x0 = Math.floor(x / TILE);
    const x1 = Math.floor((x + w - 1) / TILE);
    const y0 = Math.floor(y / TILE);
    const y1 = Math.floor((y + h - 1) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (this.kind(tx, ty) === T.SOLID) return true;
      }
    }
    return false;
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
