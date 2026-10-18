import { STEP } from './config.js';
import { GhostPlayback } from './ghost.js';
import { overlaps } from './level.js';
import { Player, ST, STAND_H } from './player.js';
import { createWeather } from './weather.js';

// Watches a saved ghost back in the weather it was run in. It offers the
// parts of Run's interface that drawing and the HUD use, with the recorded
// runner in place of a live one.
export class Replay {
  constructor({ level, ghost, difficulty, seed, vest }) {
    this.replay = true;
    this.level = level;
    this.difficulty = difficulty;
    this.seed = seed;
    this.vest = vest;
    this.assist = {};
    this.player = null;
    this.ghost = new GhostPlayback(ghost);
    this.weather = createWeather(seed, difficulty, level.id);
    this.frames = 0;
    this.started = true;
    this.finished = false;
    this.deaths = 0;
    this.wind = this.weather.windAt(0);
    this.checkpoint = { index: -1 };
    this.events = [];
    // Ghosts don't record the loose rock, so rebuild it from where the
    // recorded runner stood and climbed, with the Player's own rules.
    this.rock = { level, loose: new Float32Array(level.loose.length), touching: [], events: [], w: 8, h: STAND_H };
  }

  get loose() {
    return this.rock.loose;
  }

  get time() {
    return this.frames * STEP;
  }

  update() {
    this.events.length = 0;
    if (this.finished) return;
    const before = this.pose();
    this.wind = this.weather.windAt(this.time);
    this.frames++;
    const pose = this.pose();
    if (!pose || this.frames >= this.ghost.frames - 1) {
      this.finished = true;
      this.events.push({ type: 'finish' });
      return;
    }
    if (this.level.loose.length) {
      this.rock.events.length = 0;
      Object.assign(this.rock, { x: pose.x, y: pose.y, h: pose.h, facing: pose.facing, onGround: !pose.air, state: pose.climb ? ST.CLIMB : ST.NORMAL });
      Player.prototype.updateLoose.call(this.rock, STEP);
      if (pose.dead) this.rock.loose.fill(0);
    }
    if (pose.dead && !before?.dead) {
      this.deaths++;
      this.events.push({ type: 'died' });
    }
    const box = { x: pose.x, y: pose.y, w: 8, h: pose.h };
    for (const cairn of this.level.cairns) {
      if (cairn.index > this.checkpoint.index && overlaps(box, cairn.rect)) {
        this.checkpoint = { index: cairn.index };
        this.events.push({ type: 'checkpoint', index: cairn.index, frames: this.frames });
      }
    }
  }

  pose() {
    return this.ghost.at(Math.min(this.frames, this.ghost.frames - 1));
  }

  ghostPose() {
    return this.pose();
  }

  cakeVisible() {
    return true;
  }
}
