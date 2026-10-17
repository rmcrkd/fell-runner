// Keyboard, gamepad and touch input, merged into one snapshot per physics
// step. "Pressed" flags latch between steps so a quick tap is never lost,
// even if the display runs slower than the simulation.

export const ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'dash', 'grab', 'pause', 'restart'];

export const ACTION_LABELS = {
  left: 'Move left',
  right: 'Move right',
  up: 'Up / climb',
  down: 'Down',
  jump: 'Jump',
  dash: 'Dash',
  grab: 'Grab / climb',
  pause: 'Pause',
  restart: 'Restart run',
};

export const DEFAULT_BINDINGS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  jump: ['KeyC', 'Space', 'KeyJ'],
  dash: ['KeyX', 'KeyK'],
  grab: ['KeyZ', 'KeyL', 'ShiftLeft'],
  pause: ['Escape', 'KeyP'],
  restart: ['KeyR'],
};

// Standard gamepad layout: A jump, X or B dash, any bumper or trigger grabs.
const PAD = { jump: [0], dash: [2, 1], grab: [4, 5, 6, 7], pause: [9], restart: [8] };

export function keyName(code) {
  if (!code) return 'unbound';
  return code
    .replace(/^Key/, '')
    .replace(/^Digit/, '')
    .replace(/^Arrow(.*)/, '$1 arrow')
    .replace(/(Left|Right)$/, ' ($1)')
    .replace(/^Space$/, 'Space');
}

export class Input {
  constructor(settings) {
    this.settings = settings;
    this.down = new Set();
    this.latched = new Set();
    this.touch = { left: false, right: false, up: false, down: false, jump: false, dash: false, grab: false };
    this.prevPad = {};
    this.padHeld = {};
    this.padAxes = { x: 0, y: 0 };
    this.gameActive = false;
    this.grabToggled = false;
    this.lastDevice = 'keyboard';
    this.onAction = null;
    this.capture = null;

    addEventListener('keydown', (e) => this.keydown(e));
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());
  }

  get bindings() {
    return this.settings.bindings ?? DEFAULT_BINDINGS;
  }

  actionsFor(code) {
    return ACTIONS.filter((a) => this.bindings[a]?.includes(code));
  }

  keydown(e) {
    if (this.capture) {
      e.preventDefault();
      const cb = this.capture;
      this.capture = null;
      cb(e.code);
      return;
    }
    this.lastDevice = 'keyboard';
    // A menu already handled this key (e.g. Escape to resume)
    if (e.defaultPrevented) return;
    const actions = this.actionsFor(e.code);
    this.down.add(e.code);
    if (!this.gameActive || e.repeat) return;
    if (actions.length) e.preventDefault();
    for (const a of actions) this.press(a);
  }

  press(action) {
    this.latched.add(action);
    if (action === 'grab' && this.settings.grabMode === 'toggle') this.grabToggled = !this.grabToggled;
    if ((action === 'pause' || action === 'restart') && this.onAction) this.onAction(action);
  }

  held(action) {
    return this.bindings[action]?.some((code) => this.down.has(code)) || this.touch[action] || this.padHeld[action];
  }

  // Reads gamepads; called once per animation frame.
  pollPads() {
    this.padHeld = {};
    this.padAxes = { x: 0, y: 0 };
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad) continue;
      const b = (i) => pad.buttons[i]?.pressed;
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      const held = {
        left: b(14) || ax < -0.4,
        right: b(15) || ax > 0.4,
        up: b(12) || ay < -0.5,
        down: b(13) || ay > 0.5,
      };
      for (const [action, buttons] of Object.entries(PAD)) held[action] = buttons.some(b);
      for (const [action, value] of Object.entries(held)) {
        if (!value) continue;
        this.padHeld[action] = true;
        if (!this.prevPad[action]) {
          this.lastDevice = 'gamepad';
          if (this.gameActive) this.press(action);
          else this.onMenuPad?.(action);
        }
      }
      this.prevPad = held;
      return;
    }
    this.prevPad = {};
  }

  resetGameState() {
    this.latched.clear();
    this.grabToggled = false;
  }

  // One physics step's worth of input.
  sample() {
    const left = this.held('left');
    const right = this.held('right');
    const up = this.held('up');
    const down = this.held('down');
    const grabHeld = this.settings.grabMode === 'toggle' ? this.grabToggled : this.held('grab');
    const snap = {
      moveX: (right ? 1 : 0) - (left ? 1 : 0),
      moveY: (down ? 1 : 0) - (up ? 1 : 0),
      jump: this.held('jump'),
      jumpPressed: this.latched.has('jump'),
      dashPressed: this.latched.has('dash'),
      grab: !!grabHeld,
    };
    this.latched.clear();
    return snap;
  }
}
