import { STEP } from './config.js';

// Turns real elapsed time into a whole number of fixed 60 Hz physics steps,
// so a run plays out identically at any display refresh rate. Leftover time
// carries over to the next frame. `speed` slows the game for assist mode.
// After a long stall (a slow device, a backgrounded tab) it drops the backlog
// rather than fast-forwarding through it.
export class FixedClock {
  constructor({ step = STEP, maxSteps = 6 } = {}) {
    this.step = step;
    this.maxSteps = maxSteps;
    this.acc = 0;
  }

  reset() {
    this.acc = 0;
  }

  // Returns how many physics steps to run for `dt` seconds of real time.
  advance(dt, speed = 1) {
    this.acc += Math.max(0, dt) * speed;
    // Snap away floating-point dust, so 1/60 s really is one step
    let steps = Math.floor(this.acc / this.step + 1e-6);
    if (steps > this.maxSteps) {
      steps = this.maxSteps;
      this.acc = 0;
      return steps;
    }
    this.acc = Math.max(0, this.acc - steps * this.step);
    return steps;
  }
}
