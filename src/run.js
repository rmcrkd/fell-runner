import { STEP } from './config.js';
import { GhostPlayback, GhostRecorder } from './ghost.js';
import { overlaps } from './level.js';
import { Player, ST } from './player.js';
import { createWeather } from './weather.js';

const RESPAWN_DELAY = 0.5;
const CAKE_RESPAWN = 2.5;

// One attempt at one fell. Owns the player, weather, clock, checkpoints,
// splits and ghost recording, and knows nothing about drawing or input
// devices, so tests and tools can drive it directly.
export class Run {
  constructor({ level, vest, difficulty, seed, assist = {}, ghost = null }) {
    this.level = level;
    this.vest = vest;
    this.difficulty = difficulty;
    this.seed = seed;
    this.assist = assist;
    this.assisted = isAssisted(assist);
    this.weather = createWeather(seed, difficulty, level.id);
    this.player = new Player(level, { vest, assist });
    this.ghost = ghost ? new GhostPlayback(ghost) : null;
    this.recorder = new GhostRecorder();
    this.frames = 0;
    this.started = false;
    this.finished = false;
    this.deaths = 0;
    this.deathTimer = 0;
    this.checkpoint = { x: level.start.x, y: level.start.y, index: -1 };
    this.splits = [];
    this.cakeTimers = level.cakes.map(() => 0);
    this.events = [];
    this.wind = 0;
  }

  get time() {
    return this.frames * STEP;
  }

  update(input) {
    this.events.length = 0;
    if (this.finished) return;
    if (!this.started) {
      if (!(input.moveX || input.moveY || input.jumpPressed || input.dashPressed)) return;
      this.started = true;
      this.events.push({ type: 'start' });
    }

    const p = this.player;
    this.wind = this.weather.windAt(this.time);

    if (p.state === ST.DEAD) {
      this.deathTimer -= STEP;
      if (this.deathTimer <= 0) this.respawn();
    } else {
      p.update(input, STEP, this.wind, this.weather.grip);
      for (const e of p.events) this.events.push({ type: e });
      if (p.state === ST.DEAD) {
        this.deaths++;
        this.deathTimer = RESPAWN_DELAY;
        this.events.push({ type: 'died', cause: p.deathCause });
      } else {
        this.touchEntities();
      }
    }

    for (let i = 0; i < this.cakeTimers.length; i++) {
      if (this.cakeTimers[i] > 0) this.cakeTimers[i] -= STEP;
    }

    this.recorder.push(p);
    this.frames++;
  }

  touchEntities() {
    const p = this.player;
    const box = { x: p.x, y: p.y, w: p.w, h: p.h };
    const { level } = this;

    level.cakes.forEach((cake, i) => {
      if (this.cakeTimers[i] <= 0 && overlaps(box, cake.rect) && p.refill()) {
        this.cakeTimers[i] = CAKE_RESPAWN;
        this.events.push({ type: 'cake', index: i });
      }
    });

    for (const cairn of level.cairns) {
      if (cairn.index > this.checkpoint.index && overlaps(box, cairn.rect)) {
        this.checkpoint = { x: cairn.x, y: cairn.y, index: cairn.index };
        this.splits[cairn.index] = this.frames;
        this.events.push({ type: 'checkpoint', index: cairn.index, frames: this.frames });
      }
    }

    if (overlaps(box, level.finish.rect)) {
      this.finished = true;
      this.events.push({ type: 'finish', frames: this.frames + 1 });
    }
  }

  respawn() {
    this.player.spawn(this.checkpoint.x, this.checkpoint.y);
    this.cakeTimers.fill(0);
    this.events.push({ type: 'respawn' });
  }

  cakeVisible(i) {
    return this.cakeTimers[i] <= 0;
  }

  ghostPose() {
    return this.ghost ? this.ghost.at(Math.max(0, this.frames - 1)) : null;
  }
}

// Assisted runs get their own leaderboard.
export function isAssisted(assist) {
  return !!(assist.infiniteStamina || assist.invincible || (assist.dashMode && assist.dashMode !== 'default') || (assist.speed && assist.speed < 1));
}

export function formatTime(frames, { sign = false } = {}) {
  const neg = frames < 0;
  const ms = Math.round((Math.abs(frames) * 1000) / 60);
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  const body = `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  if (sign) return `${neg ? '−' : '+'}${body}`;
  return body;
}

// Spoken form for screen readers, e.g. "1 minute 3.42 seconds".
export function speakTime(frames) {
  const total = Math.abs(frames) / 60;
  const m = Math.floor(total / 60);
  const s = (total - m * 60).toFixed(2);
  return m > 0 ? `${m} minute${m === 1 ? '' : 's'} ${s} seconds` : `${s} seconds`;
}
