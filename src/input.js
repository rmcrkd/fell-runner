// Keyboard, gamepad and touch input, merged into one snapshot per physics
// step. "Pressed" flags latch between steps so a quick tap is never lost,
// even if the display runs slower than the simulation.

export const ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'dash', 'pause', 'restart', 'status'];

export const ACTION_LABELS = {
  left: 'Move left',
  right: 'Move right',
  up: 'Up / climb',
  down: 'Down / crouch',
  jump: 'Jump',
  dash: 'Dash',
  pause: 'Pause',
  restart: 'Restart run',
  status: 'Read out status',
};

export const DEFAULT_BINDINGS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  jump: ['KeyC', 'Space', 'KeyJ'],
  dash: ['KeyX', 'KeyK'],
  pause: ['Escape', 'KeyP'],
  restart: ['KeyR'],
  status: ['KeyI'],
};

// Gamepad buttons, in the browser's standard layout. Movement stays on the
// left stick and d-pad; everything else can be remapped.
export const PAD_ACTIONS = ['jump', 'dash', 'pause', 'restart', 'status'];
export const DEFAULT_PAD_BINDINGS = { jump: [0], dash: [2, 1], pause: [9], restart: [8], status: [3] };
const PAD_MOVE = [12, 13, 14, 15];
const PAD_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'Left stick', 'Right stick', 'D-pad up', 'D-pad down', 'D-pad left', 'D-pad right', 'Home'];

export const padName = (i) => PAD_NAMES[i] ?? `Button ${i + 1}`;

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
    this.touch = { left: false, right: false, up: false, down: false, jump: false, dash: false };
    this.prevPad = {};
    this.padHeld = {};
    this.padAxes = { x: 0, y: 0 };
    this.gameActive = false;
    this.lastDevice = 'keyboard';
    this.onAction = null;
    this.capture = null;
    this.padCapture = null;
    this.prevButtons = [];

    addEventListener('keydown', (e) => this.keydown(e));
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());
  }

  // Saved maps from before an action existed lack it: fill those in with
  // default keys that aren't already doing something else.
  get bindings() {
    const saved = this.settings.bindings;
    if (!saved) return DEFAULT_BINDINGS;
    if (ACTIONS.every((a) => saved[a])) return saved;
    const used = new Set(Object.values(saved).flat());
    const full = { ...saved };
    for (const a of ACTIONS) full[a] ??= DEFAULT_BINDINGS[a].filter((k) => !used.has(k));
    return full;
  }

  get padBindings() {
    return this.settings.padBindings ?? DEFAULT_PAD_BINDINGS;
  }

  actionsFor(code) {
    return ACTIONS.filter((a) => this.bindings[a]?.includes(code));
  }

  keydown(e) {
    if (this.padCapture && e.code === 'Escape') {
      e.preventDefault();
      const cb = this.padCapture;
      this.padCapture = null;
      cb(null);
      return;
    }
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
    if ((action === 'pause' || action === 'restart' || action === 'status') && this.onAction) this.onAction(action);
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
      if (this.padCapture) {
        // Remapping: the first button to go down (not movement) is the answer
        const i = pad.buttons.findIndex((btn, k) => btn.pressed && !this.prevButtons[k] && !PAD_MOVE.includes(k));
        this.prevButtons = pad.buttons.map((btn) => btn.pressed);
        if (i >= 0) {
          const cb = this.padCapture;
          this.padCapture = null;
          // Swallow this press so it doesn't also act in the menu
          this.prevPad = { ...this.prevPad, jump: true, dash: true, pause: true };
          cb(i);
        }
        return;
      }
      this.prevButtons = pad.buttons.map((btn) => btn.pressed);
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      const held = {
        left: b(14) || ax < -0.4,
        right: b(15) || ax > 0.4,
        up: b(12) || ay < -0.5,
        down: b(13) || ay > 0.5,
      };
      for (const action of PAD_ACTIONS) held[action] = (this.padBindings[action] ?? []).some(b);
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
  }

  // One physics step's worth of input.
  sample() {
    const left = this.held('left');
    const right = this.held('right');
    const up = this.held('up');
    const down = this.held('down');
    const snap = {
      moveX: (right ? 1 : 0) - (left ? 1 : 0),
      moveY: (down ? 1 : 0) - (up ? 1 : 0),
      // A tap that came and went since the last step still counts as held
      // for one step, so it isn't cut to the smallest hop
      jump: this.held('jump') || this.latched.has('jump'),
      jumpPressed: this.latched.has('jump'),
      dashPressed: this.latched.has('dash'),
    };
    this.latched.clear();
    return snap;
  }
}
