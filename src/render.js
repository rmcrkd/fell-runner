import { TILE, VIEW_H, VIEW_W } from './config.js';
import { LOOSE_CRUMBLE, T } from './level.js';
import { ST } from './player.js';
import { hashString, mulberry32 } from './rng.js';

// Everything is drawn procedurally at 320x180 and scaled up with crisp
// pixels. Terrain is pre-rendered once per level into an offscreen canvas.

const hash2 = (x, y) => {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const lerp = (a, b, t) => a + (b - a) * t;
function mix(c1, c2, t) {
  const a = parseInt(c1.slice(1), 16);
  const b = parseInt(c2.slice(1), 16);
  const r = Math.round(lerp(a >> 16, b >> 16, t));
  const g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, t));
  const bl = Math.round(lerp(a & 255, b & 255, t));
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}

const PALETTES = {
  normal: {
    skyClear: ['#5d9bd6', '#cfe6f5'],
    skyStorm: ['#3b4652', '#8f9aa4'],
    hills: ['#93a9bd', '#6d8798', '#4d6b55'],
    rock: '#5a646e',
    rockDark: '#3c444d',
    rockLight: '#7a858f',
    grass: '#5f9a3b',
    grassDark: '#3d7228',
    grassLight: '#90c656',
    bracken: '#b0692c',
    snow: '#eef3f8',
    snowShade: '#c3d0dc',
    boulder: '#6e757c',
    boulderLight: '#9aa1a8',
    wall: '#7d8288',
    ledge: '#8a6a45',
    ledgeLight: '#b38d5f',
    spike: '#d9dde1',
    spikeDark: '#1d2228',
    water: '#2c5c82',
    waterLight: '#79b0d6',
    lake: '#a9c6db',
    loose: '#8b7d6b',
    looseLight: '#b3a48f',
    looseDark: '#4a4036',
    fleece: '#5b524c',
    fleeceLight: '#7d736b',
    skin: '#f0c39c',
    shorts: '#23262b',
    shoes: '#e2553a',
    outline: null,
  },
  contrast: {
    skyClear: ['#0b0f14', '#1b2530'],
    skyStorm: ['#0b0f14', '#1b2530'],
    hills: ['#1a222b', '#1f2a35', '#243240'],
    rock: '#c8ccd0',
    rockDark: '#9aa0a6',
    rockLight: '#e8eaec',
    grass: '#4fd06a',
    grassDark: '#2c9a45',
    grassLight: '#9df0ac',
    bracken: '#c8ccd0',
    snow: '#ffffff',
    snowShade: '#d8dde2',
    boulder: '#b8bcc0',
    boulderLight: '#e0e3e6',
    wall: '#c8ccd0',
    ledge: '#ffb347',
    ledgeLight: '#ffd59e',
    spike: '#ffdd00',
    spikeDark: '#000000',
    water: '#00b7ff',
    waterLight: '#9fe6ff',
    lake: '#1f2a35',
    loose: '#ff8c42',
    looseLight: '#ffc59a',
    looseDark: '#000000',
    fleece: '#9aa0a6',
    fleeceLight: '#c8ccd0',
    skin: '#f6d2b0',
    shorts: '#101010',
    shoes: '#ff5a36',
    outline: '#000000',
  },
};

export const DASH_COLOURS = { 0: '#4aa3ff', 1: '#ff7a2f', 2: '#ff4fc8' };

export class Renderer {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    canvas.width = VIEW_W;
    canvas.height = VIEW_H;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.ctx.imageSmoothingEnabled = false;
    this.fx = [];
    this.trails = [];
    this.weatherParticles = [];
    this.streaks = [];
    this.shake = 0;
    this.camera = { x: 0, y: 0 };
  }

  get pal() {
    return this.settings.highContrast ? PALETTES.contrast : PALETTES.normal;
  }

  setLevel(level, weather) {
    this.level = level;
    this.weather = weather;
    this.gloom = Math.min(1, Math.max(weather.precip * 0.85, weather.fog * 1.2));
    this.hills = this.makeHills(level.id);
    this.terrain = this.renderTerrain(level, weather.snowy);
    this.terrainContrast = this.settings.highContrast;
    this.fx = [];
    this.trails = [];
    this.weatherParticles = [];
    this.streaks = [];
    this.flock = new Map();
  }

  refreshPalette() {
    if (this.level && this.terrainContrast !== this.settings.highContrast) {
      this.terrain = this.renderTerrain(this.level, this.weather.snowy);
      this.terrainContrast = this.settings.highContrast;
    }
  }

  makeHills(id) {
    const rng = mulberry32(hashString(id));
    return [0.08, 0.2, 0.38].map((factor, layer) => {
      const pts = [];
      const span = 2400;
      const peaks = Array.from({ length: 7 }, () => ({ x: rng() * span, h: 30 + rng() * 55 - layer * 12, w: 120 + rng() * 220 }));
      for (let x = 0; x <= span; x += 6) {
        let h = 10 + layer * 6;
        for (const p of peaks) {
          const d = Math.abs(x - p.x) / p.w;
          if (d < 1) h = Math.max(h, p.h * (1 - d) ** 1.4 + 8 + layer * 4);
        }
        h += Math.sin(x * 0.05 + layer) * 1.5 + hash2(x, layer) * 2;
        pts.push(h);
      }
      return { factor, pts, span };
    });
  }

  renderTerrain(level, snowy) {
    const pal = this.pal;
    const c = document.createElement('canvas');
    c.width = level.width;
    c.height = level.height;
    const g = c.getContext('2d');
    const air = (tx, ty) => level.kind(tx, ty) !== T.SOLID;

    for (let ty = 0; ty < level.rows; ty++) {
      for (let tx = 0; tx < level.cols; tx++) {
        const ch = level.char(tx, ty);
        const k = level.kind(tx, ty);
        const x = tx * TILE;
        const y = ty * TILE;
        const r = hash2(tx, ty);
        if (k === T.SOLID) {
          if (ch === 'B') this.drawBoulderTile(g, level, tx, ty, pal, snowy);
          else if (ch === '=') this.drawWallTile(g, x, y, tx, ty, pal, air(tx, ty - 1));
          else this.drawRockTile(g, level, tx, ty, pal, snowy, r);
        } else if (k === T.LEDGE) {
          g.fillStyle = pal.ledge;
          g.fillRect(x, y, TILE, 3);
          g.fillStyle = pal.ledgeLight;
          g.fillRect(x, y, TILE, 1);
          g.fillStyle = pal.rockDark;
          g.fillRect(x + 1, y + 3, 1, 1);
          g.fillRect(x + 6, y + 3, 1, 1);
        } else if (k === T.SPIKE) {
          this.drawSpikeTile(g, x, y, pal, tx);

        } else if (k === T.WATER) {
          const surface = level.kind(tx, ty - 1) !== T.WATER;
          g.fillStyle = pal.water;
          g.fillRect(x, y + (surface ? 3 : 0), TILE, surface ? TILE - 3 : TILE);
          if (surface) {
            g.fillStyle = pal.waterLight;
            g.fillRect(x, y + 3, TILE, 1);
          }
        }
      }
    }
    return c;
  }

  drawRockTile(g, level, tx, ty, pal, snowy, r) {
    const x = tx * TILE;
    const y = ty * TILE;
    const isAir = (dx, dy) => level.kind(tx + dx, ty + dy) !== T.SOLID;
    g.fillStyle = pal.rock;
    g.fillRect(x, y, TILE, TILE);
    // Strata and speckles
    g.fillStyle = pal.rockDark;
    if (r < 0.5) g.fillRect(x + Math.floor(r * 10), y + 3 + Math.floor(r * 6) % 4, 3, 1);
    g.fillRect(x + Math.floor(hash2(ty, tx) * 7), y + Math.floor(r * 7), 1, 1);
    g.fillStyle = pal.rockLight;
    if (r > 0.6) g.fillRect(x + Math.floor(r * 13) % 7, y + Math.floor(r * 31) % 6, 2, 1);
    if (isAir(-1, 0)) {
      g.fillStyle = pal.rockLight;
      g.fillRect(x, y, 1, TILE);
    }
    if (isAir(1, 0)) {
      g.fillStyle = pal.rockDark;
      g.fillRect(x + TILE - 1, y, 1, TILE);
    }
    if (isAir(0, 1)) {
      g.fillStyle = pal.rockDark;
      g.fillRect(x, y + TILE - 1, TILE, 1);
    }
    if (isAir(0, -1) && level.kind(tx, ty - 1) !== T.SPIKE) {
      if (snowy) {
        g.fillStyle = pal.snow;
        g.fillRect(x, y, TILE, 3);
        g.fillStyle = pal.snowShade;
        g.fillRect(x, y + 3, TILE, 1);
        if (r > 0.5) g.fillRect(x + 2, y + 4, 3, 1);
      } else {
        g.fillStyle = pal.grass;
        g.fillRect(x, y, TILE, 3);
        g.fillStyle = pal.grassDark;
        g.fillRect(x, y + 3, TILE, 1);
        if (r > 0.4) g.fillRect(x + Math.floor(r * 6), y + 4, 2, 1);
        // Tufts poking up above the surface, with the odd patch of autumn bracken
        g.fillStyle = r > 0.82 ? pal.bracken : pal.grassLight;
        g.fillRect(x + Math.floor(r * 7), y - 1, 1, 1);
        if (r > 0.3) g.fillRect(x + ((Math.floor(r * 50) + 3) % 8), y - 1, 1, 1);
      }
    }
  }

  drawBoulderTile(g, level, tx, ty, pal, snowy) {
    const x = tx * TILE;
    const y = ty * TILE;
    const same = (dx, dy) => level.char(tx + dx, ty + dy) === 'B';
    g.fillStyle = pal.boulder;
    g.fillRect(x, y, TILE, TILE);
    g.fillStyle = pal.rockDark;
    if (!same(1, 0)) g.fillRect(x + TILE - 1, y, 1, TILE);
    if (!same(0, 1) && level.kind(tx, ty + 1) !== T.SOLID) g.fillRect(x, y + TILE - 1, TILE, 1);
    if (hash2(tx, ty) > 0.55) g.fillRect(x + 2, y + 5, 3, 1);
    // Tall stacks read as separate blocks piled on each other
    const seam = same(0, -1) && Math.floor(hash2(Math.floor(tx / 2), 7) * 3 + ty) % 3 === 0;
    if (seam) g.fillRect(x, y, TILE, 1);
    g.fillStyle = pal.boulderLight;
    if (seam) g.fillRect(x + 1, y + 1, TILE - 2, 1);
    if (!same(-1, 0)) g.fillRect(x, y, 1, TILE);
    if (!same(0, -1)) {
      g.fillRect(x, y, TILE, 1);
      if (snowy) {
        g.fillStyle = pal.snow;
        g.fillRect(x, y, TILE, 2);
      }
    }
    // Rounded corners
    g.fillStyle = 'rgba(0,0,0,0)';
    if (!same(-1, 0) && !same(0, -1)) g.clearRect(x, y, 1, 1);
    if (!same(1, 0) && !same(0, -1)) g.clearRect(x + TILE - 1, y, 1, 1);
  }

  drawWallTile(g, x, y, tx, ty, pal, top) {
    // Dry-stone wall: irregular stones with dark mortar gaps
    g.fillStyle = pal.rockDark;
    g.fillRect(x, y, TILE, TILE);
    g.fillStyle = pal.wall;
    const off = (ty % 2) * 3;
    for (const [sx, sy, w, h] of [
      [0, 0, 4, 3],
      [5, 0, 3, 3],
      [0, 4, 3, 4],
      [4, 4, 4, 4],
    ]) {
      g.fillRect(x + ((sx + off) % 8), y + sy, Math.min(w, 8 - ((sx + off) % 8)), h - 1);
    }
    if (top) {
      g.fillStyle = pal.rockLight;
      g.fillRect(x, y, TILE, 1);
    }
  }

  drawSpikeTile(g, x, y, pal) {
    // Shattered, sharp rocks
    g.fillStyle = pal.spikeDark;
    g.fillRect(x, y + 6, TILE, 2);
    for (const [ox, h] of [
      [0, 5],
      [3, 7],
      [6, 4],
    ]) {
      g.fillStyle = pal.spikeDark;
      for (let i = 0; i < h; i++) {
        const w = Math.max(1, Math.round((i / h) * 3));
        g.fillRect(x + ox + 1 - Math.floor(w / 2), y + 8 - h + i, w + 1, 1);
      }
      g.fillStyle = pal.spike;
      for (let i = 1; i < h; i++) {
        const w = Math.max(1, Math.round((i / h) * 2));
        g.fillRect(x + ox + 1 - Math.floor(w / 2), y + 8 - h + i, w, 1);
      }
    }
  }

  // Camera follows with a little lookahead; clamped to the level.
  updateCamera(target, dt, snap = false) {
    const lvl = this.level;
    const tx = Math.max(0, Math.min(lvl.width - VIEW_W, target.x - VIEW_W / 2));
    const ty = Math.max(0, Math.min(lvl.height - VIEW_H, target.y - VIEW_H / 2));
    const k = snap ? 1 : 1 - Math.exp(-dt * 7);
    this.camera.x += (tx - this.camera.x) * k;
    this.camera.y += (ty - this.camera.y) * k;
  }

  addShake(amount) {
    if (this.settings.screenShake && !this.settings.reduceMotion) this.shake = Math.max(this.shake, amount);
  }

  // React to run events with particles and shake.
  handleEvents(events, player) {
    const cx = player.x + 4;
    const cy = player.y + player.h;
    // Grit scraped off the crag while wall sliding
    if (player.state === ST.NORMAL && player.wallSlideDir && player.vy > 30 && Math.random() < 0.3) {
      this.dust(player.wallSlideDir > 0 ? player.x + player.w : player.x, player.y + player.h - 7 + Math.random() * 6, 1);
    }
    for (const e of events) {
      if (e.type === 'land' || e.type === 'jump' || e.type === 'walljump') this.dust(cx, cy, e.type === 'land' ? 5 : 3);
      if (e.type === 'dash') this.addShake(1.5);
      if (e.type === 'died') {
        this.addShake(3);
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          this.fx.push({ kind: 'orb', x: cx, y: player.y + player.h - 6, vx: Math.cos(a) * 70, vy: Math.sin(a) * 70, life: 0.5, max: 0.5, colour: DASH_COLOURS[1] });
        }
      }
      if (e.type === 'checkpoint') {
        const c = this.level.cairns[e.index];
        for (let i = 0; i < 8; i++) this.fx.push({ kind: 'spark', x: c.x + 4, y: c.y - 8, vx: (Math.random() - 0.5) * 50, vy: -20 - Math.random() * 40, life: 0.7, max: 0.7, colour: '#ffe27a' });
      }
      if (e.type === 'cake') {
        const c = this.level.cakes[e.index];
        for (let i = 0; i < 8; i++) this.fx.push({ kind: 'spark', x: c.x, y: c.y, vx: (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 60, life: 0.5, max: 0.5, colour: '#ffffff' });
      }
    }
  }

  dust(x, y, n) {
    if (this.settings.weatherFx === 'off') return;
    for (let i = 0; i < n; i++) {
      this.fx.push({ kind: 'dust', x: x + (Math.random() - 0.5) * 6, y: y - 1, vx: (Math.random() - 0.5) * 30, vy: -Math.random() * 15, life: 0.35, max: 0.35, colour: '#d8d2c4' });
    }
  }

  // Main draw call.
  draw(view) {
    const { ctx } = this;
    const { run, time, dt } = view;
    const pal = this.pal;
    const s = this.settings;
    const weather = this.weather;
    const wind = run ? run.wind : weather.windAt(time);

    let shx = 0;
    let shy = 0;
    if (this.shake > 0) {
      shx = Math.round((Math.random() - 0.5) * this.shake * 2);
      shy = Math.round((Math.random() - 0.5) * this.shake * 2);
      this.shake = Math.max(0, this.shake - dt * 12);
    }
    const camX = Math.round(this.camera.x) + shx;
    const camY = Math.round(this.camera.y) + shy;

    // Sky
    const gloom = this.gloom;
    const sky = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    sky.addColorStop(0, mix(pal.skyClear[0], pal.skyStorm[0], gloom));
    sky.addColorStop(1, mix(pal.skyClear[1], pal.skyStorm[1], gloom));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    if (!s.highContrast) this.drawSun(ctx, gloom);
    this.drawHills(ctx, camX, camY, gloom);
    if (!s.highContrast) this.drawClouds(ctx, time, wind, gloom);

    // Terrain
    ctx.drawImage(this.terrain, camX, camY, VIEW_W, VIEW_H, 0, 0, VIEW_W, VIEW_H);
    this.drawWaterShimmer(ctx, camX, camY, time);
    this.drawLoose(ctx, run, camX, camY, time);
    this.drawSheep(ctx, run, camX, camY, time);
    this.drawEntities(ctx, run, camX, camY, time);

    // Ghost
    // In a replay the recorded run is the star, drawn in full colour
    const ghost = run?.ghostPose();
    if (ghost && (s.showGhost || run.replay) && !ghost.dead) {
      ctx.globalAlpha = run.replay ? 1 : 0.45;
      this.drawRunner(ctx, ghost.x - camX, ghost.y - camY, {
        facing: ghost.facing,
        state: ghost.duck ? 'duck' : ghost.climb ? 'climb' : ghost.dash ? 'dash' : ghost.air ? 'air' : 'run',
        phase: ghost.runDistance,
        moving: true,
        ghost: !run.replay,
        time,
      });
      ctx.globalAlpha = 1;
    }

    this.drawFog(ctx, time, wind, camY);

    // Player
    if (run?.player) {
      const p = run.player;
      if (p.state === ST.DASH && !s.reduceMotion) this.trails.push({ x: p.x, y: p.y, facing: p.facing, duck: p.ducking, life: 0.25 });
      for (const t of this.trails) {
        ctx.globalAlpha = Math.max(0, t.life / 0.25) * 0.5;
        this.drawRunner(ctx, t.x - camX, t.y - camY, { facing: t.facing, state: t.duck ? 'duck' : 'dash', silhouette: DASH_COLOURS[0] });
        t.life -= dt;
      }
      ctx.globalAlpha = 1;
      this.trails = this.trails.filter((t) => t.life > 0);
      if (p.state !== ST.DEAD) {
        this.drawRunner(ctx, p.x - camX, p.y - camY, {
          facing: p.facing,
          state: p.ducking ? 'duck' : p.state === ST.CLIMB ? 'climb' : p.state === ST.DASH ? 'dash' : !p.onGround ? 'air' : 'run',
          phase: p.runDistance,
          moving: Math.abs(p.vx) > 5,
          squash: p.squash,
          hair: DASH_COLOURS[Math.min(2, run.assist.dashMode === 'infinite' ? 1 : p.dashes)],
          tired: p.tired && p.state === ST.CLIMB,
          vx: p.vx + wind * 0.6,
          time,
        });
      }
    }

    this.drawFx(ctx, camX, camY, dt);
    this.drawWeather(ctx, time, wind, dt);
  }

  drawSun(ctx, gloom) {
    if (gloom > 0.6) return;
    ctx.globalAlpha = 1 - gloom / 0.6;
    ctx.fillStyle = '#fff6d8';
    ctx.beginPath();
    ctx.arc(262, 34, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.25 * (1 - gloom / 0.6);
    ctx.beginPath();
    ctx.arc(262, 34, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  drawHills(ctx, camX, camY, gloom) {
    const pal = this.pal;
    const s = this.settings;
    const skyLow = mix(pal.skyClear[1], pal.skyStorm[1], gloom);
    this.hills.forEach((layer, i) => {
      const f = s.reduceMotion ? 0 : layer.factor;
      const offX = camX * f;
      const levelTravel = Math.max(1, this.level.height - VIEW_H);
      const offY = s.reduceMotion ? 0 : ((camY - levelTravel) / levelTravel) * (10 + i * 14);
      const base = VIEW_H - 20 + i * 12 - offY;
      ctx.fillStyle = mix(pal.hills[i], skyLow, s.highContrast ? 0 : 0.25 * (2 - i) + gloom * 0.45);
      ctx.beginPath();
      ctx.moveTo(0, VIEW_H);
      for (let x = 0; x <= VIEW_W; x += 3) {
        const wx = (x + offX) % layer.span;
        const idx = Math.floor(wx / 6);
        const t = (wx % 6) / 6;
        const h = lerp(layer.pts[idx], layer.pts[(idx + 1) % layer.pts.length], t) * (1 + i * 0.35);
        ctx.lineTo(x, Math.round(base - h));
      }
      ctx.lineTo(VIEW_W, VIEW_H);
      ctx.closePath();
      ctx.fill();
      if (i === 0 && !s.highContrast) {
        // A distant lake glinting in the valley
        ctx.fillStyle = mix(pal.lake, skyLow, gloom * 0.6);
        ctx.fillRect(0, Math.round(base - 6), VIEW_W, 2);
      }
    });
  }

  drawClouds(ctx, time, wind, gloom) {
    const count = 3 + Math.round(gloom * 5);
    const drift = this.settings.reduceMotion ? 0 : time * (4 + Math.abs(wind) * 0.5) * (Math.sign(wind) || 1);
    ctx.fillStyle = mix('#ffffff', '#7d8791', gloom);
    for (let i = 0; i < count; i++) {
      const r = hash2(i, 7);
      const w = 40 + r * 50;
      const span = VIEW_W + w * 2;
      const x = ((((r * 997 + drift * (0.4 + r * 0.6)) % span) + span) % span) - w;
      const y = 14 + hash2(i, 3) * 46;
      ctx.globalAlpha = 0.55 + gloom * 0.3;
      this.blob(ctx, x, y, w, 9 + r * 5, i);
    }
    ctx.globalAlpha = 1;
  }

  // A soft, lumpy cloud shape: a flat base with a few rounded puffs on top.
  blob(ctx, x, y, w, h, seed) {
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y, w / 2, h / 2.4, 0, 0, Math.PI * 2);
    const puffs = 3;
    for (let j = 0; j < puffs; j++) {
      const px = x + w * (0.25 + 0.25 * j) + (hash2(seed, j) - 0.5) * w * 0.15;
      const pr = h * (0.45 + hash2(j, seed) * 0.35);
      ctx.moveTo(px + pr, y - h * 0.15);
      ctx.arc(px, y - h * 0.15, pr, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  // Loose rock: a blocky slab of slate with cracks that widen as it goes.
  // It shudders while crumbling (unless motion is reduced) and leaves a
  // faint outline while it's gone, so you can see where it will settle back.
  drawLoose(ctx, run, camX, camY, time) {
    const lvl = this.level;
    if (!lvl.loose.length) return;
    const pal = this.pal;
    const state = run?.player?.loose ?? run?.loose;
    lvl.loose.forEach((b, i) => {
      const x = b.tx * TILE - camX;
      const y = b.ty * TILE - camY;
      if (x < -8 || x > VIEW_W || y < -8 || y > VIEW_H) return;
      const v = state ? state[i] : 0;
      if (v < 0) {
        ctx.fillStyle = pal.looseLight;
        ctx.globalAlpha = 0.45;
        for (let k = 0; k < 8; k += 2) {
          ctx.fillRect(x + k, y, 1, 1);
          ctx.fillRect(x + k + 1, y + 7, 1, 1);
          ctx.fillRect(x, y + k + 1, 1, 1);
          ctx.fillRect(x + 7, y + k, 1, 1);
        }
        ctx.globalAlpha = 1;
        return;
      }
      const progress = v > 0 ? 1 - v / LOOSE_CRUMBLE : 0;
      const jx = v > 0 && !this.settings.reduceMotion ? Math.round(Math.sin(time * 70 + i) * progress) : 0;
      const jy = v > 0 && !this.settings.reduceMotion ? Math.round(progress * 2) : 0;
      const px = x + jx;
      const py = y + jy;
      ctx.fillStyle = pal.looseDark;
      ctx.fillRect(px, py, 8, 8);
      ctx.fillStyle = pal.loose;
      ctx.fillRect(px + 1, py + 1, 6, 6);
      ctx.fillStyle = pal.looseLight;
      ctx.fillRect(px + 1, py + 1, 6, 1);
      ctx.fillRect(px + 1, py + 4, 3, 1);
      ctx.fillStyle = pal.looseDark;
      ctx.fillRect(px + 4, py + 4, 1, 3);
      if (progress > 0) {
        // Cracks: shape, not just colour, shows the rock is going
        ctx.fillRect(px + 2, py + 1, 1, 3);
        ctx.fillRect(px + 3, py + 3, 1, 1);
        if (progress > 0.45) {
          ctx.fillRect(px + 5, py + 1, 1, 2);
          ctx.fillRect(px + 6, py + 3, 1, 2);
          ctx.fillRect(px + 1, py + 5, 2, 1);
        }
      }
    });
  }

  // Herdwick sheep graze in the valleys. They're scenery, but they do look
  // up, and skitter off if you come charging past.
  drawSheep(ctx, run, camX, camY, time) {
    const lvl = this.level;
    if (!lvl.sheep.length) return;
    const pal = this.pal;
    const p = run?.player;
    this.flock ??= new Map();
    lvl.sheep.forEach((s, i) => {
      let st = this.flock.get(i);
      if (!st) this.flock.set(i, (st = { dx: 0, hop: 0, facing: hash2(i, 41) > 0.5 ? 1 : -1 }));
      const near = p && Math.abs(p.x + 4 - (s.x + 4 + st.dx)) < 28 && Math.abs(p.y + p.h - s.y) < 24;
      if (near && st.hop <= 0 && Math.abs(st.dx) < 20) {
        st.facing = p.x < s.x + st.dx ? 1 : -1;
        st.hop = 0.35;
      }
      if (st.hop > 0) {
        st.hop -= 1 / 60;
        if (!this.settings.reduceMotion) st.dx += st.facing * 1.2;
      }
      const x = Math.round(s.x + st.dx - camX);
      if (x < -12 || x > VIEW_W + 12) return;
      const lift = st.hop > 0 && !this.settings.reduceMotion ? Math.round(Math.sin((st.hop / 0.35) * Math.PI) * 3) : 0;
      const y = s.y - camY - lift;
      const graze = this.settings.reduceMotion ? 0 : Math.floor(time * 0.7 + i * 1.3) % 3 === 0 ? 1 : 0;
      const f = st.facing;
      const px = (cx, cy, w, h, c) => {
        ctx.fillStyle = c;
        ctx.fillRect(f === 1 ? x + cx : x + 10 - cx - w, y + cy, w, h);
      };
      px(1, -7, 7, 4, pal.fleece);
      px(2, -8, 5, 1, pal.fleeceLight);
      px(2, -3, 1, 3, '#1d1d1d');
      px(6, -3, 1, 3, '#1d1d1d');
      // White face, the Herdwick trademark
      px(8, -7 + graze * 2, 2, 3, '#f2f0ea');
      px(9, -6 + graze * 2, 1, 1, '#1d1d1d');
    });
  }

  drawWaterShimmer(ctx, camX, camY, time) {
    if (this.settings.reduceMotion) return;
    const lvl = this.level;
    const pal = this.pal;
    const tx0 = Math.floor(camX / TILE);
    const ty0 = Math.floor(camY / TILE);
    ctx.fillStyle = pal.waterLight;
    for (let ty = ty0; ty <= ty0 + 23; ty++) {
      for (let tx = tx0; tx <= tx0 + 41; tx++) {
        if (lvl.kind(tx, ty) !== T.WATER || lvl.kind(tx, ty - 1) === T.WATER) continue;
        const ph = Math.floor(time * 3 + tx * 1.7) % 4;
        ctx.fillRect(tx * TILE - camX + ph * 2, ty * TILE - camY + 5 + (ph % 2), 2, 1);
      }
    }
  }

  drawEntities(ctx, run, camX, camY, time) {
    const lvl = this.level;
    const pal = this.pal;
    const bob = this.settings.reduceMotion ? 0 : Math.round(Math.sin(time * 3) * 1);

    for (const c of lvl.cairns) {
      const x = c.x - camX;
      const y = c.y - camY;
      if (x < -16 || x > VIEW_W + 16) continue;
      const reached = run && run.checkpoint.index >= c.index;
      // A pile of stones, widest at the base
      ctx.fillStyle = pal.outline ?? '#2c3137';
      ctx.fillRect(x - 1, y - 4, 10, 4);
      ctx.fillRect(x, y - 7, 8, 3);
      ctx.fillRect(x + 1, y - 10, 6, 3);
      ctx.fillRect(x + 2, y - 12, 4, 2);
      ctx.fillStyle = pal.boulderLight;
      ctx.fillRect(x, y - 3, 3, 2);
      ctx.fillRect(x + 4, y - 3, 4, 2);
      ctx.fillRect(x + 1, y - 6, 3, 2);
      ctx.fillRect(x + 5, y - 6, 2, 2);
      ctx.fillRect(x + 2, y - 9, 4, 2);
      ctx.fillRect(x + 3, y - 11, 2, 1);
      if (reached) {
        // A ribbon flag: shape as well as colour marks a reached cairn
        ctx.fillStyle = pal.outline ?? '#3a2a1a';
        ctx.fillRect(x + 4, y - 20, 1, 9);
        ctx.fillStyle = '#ff9f1c';
        ctx.fillRect(x + 5, y - 20, 5, 3);
        ctx.fillRect(x + 5, y - 17, 3, 1);
      }
    }

    // Wooden fingerposts, pointing up the route
    for (const sign of lvl.signs) {
      const x = sign.x - camX;
      const y = sign.y - camY;
      if (x < -12 || x > VIEW_W + 12) continue;
      ctx.fillStyle = pal.outline ?? '#3a2a1a';
      ctx.fillRect(x + 3, y - 10, 2, 10);
      ctx.fillRect(x - 1, y - 15, 9, 6);
      ctx.fillRect(x + 8, y - 14, 1, 4);
      ctx.fillRect(x + 9, y - 13, 1, 2);
      ctx.fillStyle = pal.ledge;
      ctx.fillRect(x, y - 14, 8, 4);
      ctx.fillRect(x + 8, y - 13, 1, 2);
      ctx.fillStyle = pal.ledgeLight;
      ctx.fillRect(x, y - 14, 8, 1);
      // Lettering
      ctx.fillStyle = pal.outline ?? '#3a2a1a';
      ctx.fillRect(x + 1, y - 12, 2, 1);
      ctx.fillRect(x + 4, y - 12, 3, 1);
    }

    lvl.cakes.forEach((cake, i) => {
      const x = cake.x - camX - 4;
      const y = cake.y - camY - 3 + bob;
      if (x < -10 || x > VIEW_W + 10) return;
      if (run && !run.cakeVisible(i)) {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 1.5, y + 0.5, 6, 4);
        return;
      }
      ctx.fillStyle = pal.outline ?? '#1b3550';
      ctx.fillRect(x, y - 1, 9, 7);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 1, y, 7, 5);
      ctx.fillStyle = '#5fb7ff';
      ctx.fillRect(x + 1, y, 2, 5);
      ctx.fillRect(x + 6, y, 2, 5);
      ctx.fillStyle = '#dff1ff';
      ctx.fillRect(x + 3, y + 1, 3, 1);
    });

    const f = lvl.finish;
    const fx = f.x - camX;
    let fy = f.y - camY;
    const summit = lvl.def.summit ?? 'pillar';
    if (summit === 'ring') {
      // Hallsfell Top: a low concrete survey ring set in the rock
      ctx.fillStyle = pal.outline ?? '#3b4147';
      ctx.fillRect(fx - 4, fy - 4, 16, 4);
      ctx.fillStyle = '#e6e6df';
      ctx.fillRect(fx - 3, fy - 3, 14, 2);
      ctx.fillStyle = '#9da29d';
      ctx.fillRect(fx + 1, fy - 3, 6, 1);
      fy += 13;
    } else {
      if (summit === 'cairn-pillar') {
        // Scafell Pike: the trig pillar stands on a great stone platform
        ctx.fillStyle = pal.outline ?? '#2c3137';
        ctx.fillRect(fx - 9, fy - 7, 26, 7);
        ctx.fillStyle = pal.boulderLight;
        for (let i = 0; i < 6; i++) ctx.fillRect(fx - 8 + i * 4, fy - 6 + (i % 2), 3, 2);
        for (let i = 0; i < 6; i++) ctx.fillRect(fx - 7 + i * 4, fy - 3 - (i % 2), 3, 2);
        fy -= 7;
      }
      // Ordnance Survey trig pillar
      ctx.fillStyle = pal.outline ?? '#3b4147';
      ctx.fillRect(fx - 1, fy - 15, 10, 15);
      ctx.fillStyle = '#f4f4f0';
      ctx.fillRect(fx, fy - 14, 8, 14);
      ctx.fillStyle = '#d4d6d2';
      ctx.fillRect(fx + 6, fy - 14, 2, 14);
      ctx.fillStyle = '#3b4147';
      ctx.fillRect(fx + 1, fy - 16, 6, 2);
      ctx.fillRect(fx + 3, fy - 9, 2, 3);
    }
    // Summit flag, streaming downwind
    const wind = run ? run.wind : 0;
    const dir = wind < -4 ? -1 : 1;
    ctx.fillStyle = pal.outline ?? '#2a2f35';
    ctx.fillRect(fx + 3, fy - 30, 1, 14);
    ctx.fillStyle = '#ffd23f';
    const flap = this.settings.reduceMotion ? 0 : Math.round(Math.sin(time * (6 + Math.abs(wind) * 0.2)));
    if (dir > 0) ctx.fillRect(fx + 4, fy - 30 + flap * 0, 7, 4);
    else ctx.fillRect(fx - 4, fy - 30, 7, 4);
    ctx.fillStyle = '#e94f37';
    if (dir > 0) ctx.fillRect(fx + 4, fy - 28 + flap, 7, 1);
    else ctx.fillRect(fx - 4, fy - 28 + flap, 7, 1);
  }

  drawRunner(ctx, sx, sy, o) {
    const pal = this.pal;
    const x = Math.round(sx);
    let y = Math.round(sy);
    const f = o.facing;
    // Helper: draw a 1-row run of pixels in sprite space, mirrored by facing
    const px = (cx, cy, w, h, colour) => {
      ctx.fillStyle = colour;
      const rx = f === 1 ? x + cx : x + 8 - cx - w;
      ctx.fillRect(rx, y + cy, w, h);
    };

    const duck = o.state === 'duck';
    if (o.silhouette) {
      px(1, 0, 6, duck ? 6 : 11, o.silhouette);
      return;
    }
    const ghost = o.ghost;
    const vest = ghost ? '#dfe8f0' : this.vestColour;
    const trim = ghost ? '#9fb0c0' : this.vestTrim;
    const skin = ghost ? '#eef3f7' : pal.skin;
    const dark = ghost ? '#9fb0c0' : pal.shorts;
    const shoes = ghost ? '#c6d3df' : pal.shoes;
    const hair = ghost ? '#ffffff' : o.hair ?? DASH_COLOURS[1];

    let stretch = 0;
    if (!duck && o.squash > 1.12) stretch = 1;
    else if (!duck && o.squash < 0.88) stretch = -1;
    y -= stretch;

    if (pal.outline && !ghost) {
      ctx.fillStyle = pal.outline;
      const rx = x - 1;
      ctx.fillRect(rx + 1, y - 1, 8, (duck ? 8 : 13) + stretch);
    }

    // Buff tails stream behind, blown by speed and wind
    const blow = o.vx ? Math.max(-1, Math.min(1, -o.vx / 80)) : -f * 0.5;
    const tailLen = 2 + Math.round(Math.abs(blow) * 2);
    const tailDir = blow * f >= 0 ? 1 : -1;
    const wave = this.settings.reduceMotion || !o.time ? 0 : Math.round(Math.sin(o.time * 18)) ;
    ctx.fillStyle = hair;
    for (let i = 0; i < tailLen; i++) {
      const tx = f === 1 ? (tailDir < 0 ? x + 1 - i - 1 : x + 7 + i) : tailDir < 0 ? x + 7 + i : x - i;
      ctx.fillRect(tx, y + (duck ? 0 : 1) + (i > 1 ? wave : 0), 1, 1);
    }

    const state = o.state;
    if (duck) {
      // Crouched low, head down, hands on knees
      px(3, 0, 5, 1, hair);
      px(3, 1, 5, 2, skin);
      px(7, 1, 1, 1, '#1d1d1d');
      px(1, 2, 5, 2, vest);
      px(1, 2, 1, 1, trim);
      px(6, 3, 1, 1, skin);
      px(1, 4, 6, 1, dark);
      px(1, 5, 2, 1, shoes);
      px(5, 5, 2, 1, shoes);
    } else if (state === 'climb') {
      px(2, 0, 5, 2, hair);
      px(2, 2, 5, 3, skin);
      px(6, 3, 1, 1, '#1d1d1d');
      px(2, 5, 5, 3, vest);
      px(2, 6, 1, 1, trim);
      px(7, 0, 1, 2, skin); // arm reaching up
      px(7, 6, 1, 1, skin);
      px(2, 8, 5, 1, dark);
      const step = Math.floor((o.time ?? 0) * 6) % 2;
      px(3, 9, 1, 1 + step, skin);
      px(5, 9, 1, 2 - step, skin);
      px(3, 10 + step, 2, 1, shoes);
      px(5, 11 - step - 1, 2, 1, shoes);
    } else if (state === 'dash') {
      px(1, 1, 6, 2, hair);
      px(3, 3, 5, 2, skin);
      px(7, 3, 1, 1, '#1d1d1d');
      px(1, 5, 6, 3, vest);
      px(1, 6, 1, 1, trim);
      px(0, 8, 6, 1, dark);
      px(0, 9, 3, 1, skin);
      px(4, 9, 3, 1, skin);
      px(0, 10, 2, 1, shoes);
      px(5, 10, 2, 1, shoes);
    } else {
      px(2, 0, 5, 2, hair);
      px(2, 2, 5, 3, skin);
      px(6, 3, 1, 1, '#1d1d1d');
      px(2, 5, 5, 3 + stretch, vest);
      px(2, 5, 1, 1, trim);
      px(6, 5, 1, 3, trim);
      px(2, 8 + stretch, 5, 1, dark);
      const ly = 9 + stretch;
      if (state === 'air') {
        px(1, 6, 1, 2, skin);
        px(7, 5, 1, 2, skin);
        px(3, ly, 1, 1, skin);
        px(5, ly, 2, 1, skin);
        px(2, ly + 1, 2, 1, shoes);
        px(6, ly, 2, 1, shoes);
      } else if (o.moving) {
        const frame = Math.floor((o.phase ?? 0) / 5) % 4;
        const legs = [
          [[2, 0], [5, 1]],
          [[3, 0], [4, 0]],
          [[5, 1], [2, 0]],
          [[4, 0], [3, 0]],
        ][frame];
        px(frame % 2 ? 7 : 1, 6, 1, 2, skin);
        for (const [lx, lift] of legs) {
          px(lx, ly, 1, 1 - lift, skin);
          px(lx, ly + 1 - lift, 2, 1, shoes);
        }
      } else {
        px(1, 6, 1, 2, skin);
        px(7, 6, 1, 2, skin);
        px(3, ly, 1, 1, skin);
        px(5, ly, 1, 1, skin);
        px(2, ly + 1, 2, 1, shoes);
        px(5, ly + 1, 2, 1, shoes);
      }
    }
    if (o.tired) {
      // A sweat drop rather than flashing, so it's safe for photosensitive players
      px(8, -2, 1, 2, '#9fd8ff');
    }
  }

  drawFog(ctx, time, wind, camY) {
    const s = this.settings;
    const fog = this.weather.fog * s.fogLimit;
    if (fog <= 0.01) return;
    const col = s.highContrast ? '#2a3440' : mix('#d9e1e7', '#8f9aa4', this.gloom);
    ctx.fillStyle = col;
    ctx.globalAlpha = fog * 0.42;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // Drifting banks of clag
    const drift = s.reduceMotion ? 0 : time * (6 + Math.abs(wind) * 0.4) * (Math.sign(wind) || 1);
    for (let i = 0; i < 6; i++) {
      const w = 160 + hash2(i, 11) * 140;
      const span = VIEW_W + w;
      const x = ((((hash2(i, 5) * 900 + drift * (0.6 + i * 0.15)) % span) + span) % span) - w;
      const y = 20 + hash2(i, 9) * (VIEW_H - 20) - (s.reduceMotion ? 0 : (camY * 0.3) % 40);
      ctx.globalAlpha = fog * 0.28;
      this.blob(ctx, x, y, w, 26 + hash2(i, 2) * 20, i + 20);
    }
    ctx.globalAlpha = 1;
  }

  drawFx(ctx, camX, camY, dt) {
    for (const p of this.fx) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'dust') p.vy += 30 * dt;
      const a = Math.max(0, p.life / p.max);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.colour;
      const size = p.kind === 'orb' ? 3 : p.kind === 'spark' ? 1 : 2;
      ctx.fillRect(Math.round(p.x - camX), Math.round(p.y - camY), size, size);
    }
    ctx.globalAlpha = 1;
    this.fx = this.fx.filter((p) => p.life > 0);
  }

  drawWeather(ctx, time, wind, dt) {
    const s = this.settings;
    const w = this.weather;
    const scale = s.weatherFx === 'off' ? 0 : s.weatherFx === 'reduced' ? 0.35 : 1;

    // Wind streaks: the clearest way to see wind strength and direction.
    const streakCount = Math.abs(wind) < 6 ? 0 : Math.round(Math.min(14, Math.abs(wind) / 5) * (s.weatherFx === 'off' ? 0.4 : 1));
    while (this.streaks.length < streakCount) this.streaks.push({ x: Math.random() * VIEW_W, y: Math.random() * VIEW_H, len: 10 + Math.random() * 18 });
    this.streaks.length = Math.min(this.streaks.length, streakCount);
    ctx.fillStyle = s.highContrast ? '#9fe6ff' : '#ffffff';
    for (const st of this.streaks) {
      st.x += wind * 4 * dt;
      if (st.x > VIEW_W + 30 || st.x < -30) {
        st.x = ((((st.x + 30) % (VIEW_W + 60)) + VIEW_W + 60) % (VIEW_W + 60)) - 30;
        st.y = Math.random() * VIEW_H;
      }
      ctx.globalAlpha = s.highContrast ? 0.6 : 0.35;
      ctx.fillRect(Math.round(st.x), Math.round(st.y), Math.round(st.len), 1);
    }
    ctx.globalAlpha = 1;

    if (w.precipType === 'none' || scale === 0) return;
    const target = Math.round(260 * w.precip * scale);
    const ps = this.weatherParticles;
    while (ps.length < target) ps.push({ x: Math.random() * VIEW_W, y: Math.random() * VIEW_H, r: Math.random() });
    ps.length = Math.min(ps.length, target);
    const snow = w.precipType === 'snow';
    const sleet = w.precipType === 'sleet';
    for (const p of ps) {
      const isFlake = snow || (sleet && p.r < 0.4);
      const fall = isFlake ? 35 + p.r * 25 : 260 + p.r * 120;
      const vx = wind * (isFlake ? 1.6 : 2.4) + (isFlake && !s.reduceMotion ? Math.sin(time * 2 + p.r * 9) * 8 : 0);
      p.x = (((p.x + vx * dt) % VIEW_W) + VIEW_W) % VIEW_W;
      p.y += fall * dt;
      if (p.y > VIEW_H) {
        p.y = (p.y % (VIEW_H + 4)) - 4;
        p.x = Math.random() * VIEW_W;
      }
      if (isFlake) {
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.8;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.r > 0.7 ? 2 : 1, p.r > 0.7 ? 2 : 1);
      } else {
        ctx.fillStyle = s.highContrast ? '#9fe6ff' : '#c9d8e6';
        ctx.globalAlpha = 0.55;
        const len = 5;
        const k = vx / fall;
        for (let i = 0; i < len; i++) ctx.fillRect(Math.round(p.x - k * i), Math.round(p.y - i), 1, 1);
      }
    }
    ctx.globalAlpha = 1;
  }
}
