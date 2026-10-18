import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PHYS, STEP, VESTS, byId } from '../src/config.js';
import { EXPOSURE_VALLEY, LOOSE_CRUMBLE, LOOSE_RESPAWN } from '../src/level.js';
import { Player, ST } from '../src/player.js';
import { inp, testLevel } from './helpers.js';

const level = testLevel();
const ridgeline = byId(VESTS, 'ridgeline');

function make(opts = {}) {
  return new Player(level, { vest: ridgeline, ...opts });
}

function jumpHeight(holdFrames) {
  const p = make();
  const y0 = p.y;
  let top = y0;
  for (let f = 0; f < 90; f++) {
    p.update(inp({ jump: f < holdFrames, jumpPressed: f === 0 }), STEP);
    top = Math.min(top, p.y);
  }
  return y0 - top;
}

test('a full jump clears three tiles, a tap is much lower', () => {
  const full = jumpHeight(60);
  const tap = jumpHeight(1);
  assert.ok(full >= 26 && full <= 32, `full jump ${full}px`);
  assert.ok(tap < full * 0.6, `tap ${tap}px vs full ${full}px`);
});

test('running reaches max speed quickly', () => {
  const p = make();
  for (let f = 0; f < 10; f++) p.update(inp({ moveX: 1 }), STEP);
  assert.equal(p.vx, PHYS.maxRun);
});

test('coyote time: you can still jump just after leaving a ledge', () => {
  const ledge = testLevel(`
..........
..........
..........
..........
P........F
###......#
###......#
`);
  const p = new Player(ledge, { vest: ridgeline });
  let f = 0;
  while (p.checkGround() && f++ < 100) p.update(inp({ moveX: 1 }), STEP);
  // Now just off the edge: one more frame of falling, then jump
  p.update(inp({ moveX: 1 }), STEP);
  p.update(inp({ moveX: 1, jump: true, jumpPressed: true }), STEP);
  assert.ok(p.vy < 0, 'jumped during coyote time');
});

test('jump buffering: a press just before landing still jumps', () => {
  const p = make();
  p.y -= 2;
  p.onGround = false;
  p.jumpGrace = 0;
  p.update(inp({ jump: true, jumpPressed: true }), STEP);
  let jumped = false;
  for (let f = 0; f < 5; f++) {
    p.update(inp(), STEP);
    if (p.vy < 0) jumped = true;
  }
  assert.ok(jumped);
});

test('wall jump pushes away from the crag', () => {
  const p = make();
  // Stand next to the wall at tile 27
  p.x = 27 * 8 - 8;
  p.y -= 20;
  p.vy = 30;
  p.update(inp({ moveX: 1, jump: true, jumpPressed: true }), STEP);
  assert.equal(p.vx, -PHYS.wallJumpHSpeed);
  assert.ok(p.vy < 0);
});

test('climbing drains stamina and eventually lets go', () => {
  const p = make();
  p.x = 27 * 8 - 8;
  p.facing = 1;
  p.update(inp({ grab: true }), STEP);
  assert.equal(p.state, ST.CLIMB);
  for (let f = 0; f < 600 && p.state === ST.CLIMB; f++) p.update(inp({ grab: true, moveY: 1 }), STEP);
  // Climbing down to the ground keeps stamina; now hang in place
  const q = make();
  q.x = 27 * 8 - 8;
  q.y -= 24;
  q.facing = 1;
  q.update(inp({ grab: true }), STEP);
  let frames = 0;
  while (q.state === ST.CLIMB && frames < 2000) {
    q.update(inp({ grab: true }), STEP);
    frames++;
  }
  assert.ok(q.state !== ST.CLIMB, 'let go when tired');
  assert.ok(frames > 60 * 8, `held on for ${(frames / 60).toFixed(1)}s`);
});

test('infinite stamina assist never tires', () => {
  const p = make({ assist: { infiniteStamina: true } });
  p.x = 27 * 8 - 8;
  p.y -= 24;
  p.facing = 1;
  for (let f = 0; f < 60 * 30; f++) p.update(inp({ grab: true }), STEP);
  assert.equal(p.state, ST.CLIMB);
});

test('dash moves fast and is used up until landing', () => {
  const p = make();
  const x0 = p.x;
  p.update(inp({ moveX: 1, dashPressed: true }), STEP);
  assert.equal(p.state, ST.DASH);
  for (let f = 0; f < 9; f++) p.update(inp({ moveX: 1 }), STEP);
  assert.ok(p.x - x0 > 30, `dashed ${p.x - x0}px`);
});

test('an up-dash spends the dash; landing refills it', () => {
  const p = make();
  p.update(inp({ moveY: -1, dashPressed: true }), STEP);
  for (let f = 0; f < 3; f++) p.update(inp(), STEP);
  assert.equal(p.dashes, 0);
  for (let f = 0; f < 120; f++) p.update(inp(), STEP);
  assert.equal(p.dashes, 1);
});

test('mountain marathon vest carries two dashes', () => {
  const p = new Player(level, { vest: byId(VESTS, 'mountain') });
  assert.equal(p.maxDashes, 2);
});

test('holding down crouches: half height, feet planted, sliding to a stop', () => {
  const p = make();
  const feet = p.y + p.h;
  for (let f = 0; f < 10; f++) p.update(inp({ moveX: 1 }), STEP);
  for (let f = 0; f < 30; f++) p.update(inp({ moveX: 1, moveY: 1 }), STEP);
  assert.ok(p.ducking);
  assert.equal(p.h, PHYS.duckHeight);
  assert.equal(p.y + p.h, feet);
  assert.equal(p.vx, 0, 'no running while crouched');
  p.update(inp(), STEP);
  assert.ok(!p.ducking, 'stands when you let go');
  assert.equal(p.y + p.h, feet);
});

test('a crouched runner stays down under a low roof, and cannot grab', () => {
  const lvl = testLevel(`
..........
..........
.....#####
P........F
##########
`);
  const p = new Player(lvl, { vest: ridgeline });
  p.x = 3 * 8;
  p.update(inp({ moveY: 1 }), STEP);
  p.x = 6 * 8;
  for (let f = 0; f < 10; f++) p.update(inp({ moveX: 1, grab: true }), STEP);
  assert.ok(p.ducking, 'no headroom to stand');
  assert.notEqual(p.state, ST.CLIMB);
  assert.ok(!lvl.solidAt(p.x, p.y, p.w, p.h), 'fits under the roof');
});

test('stuck crouching just under the edge of a roof, you edge out from under it', () => {
  const lvl = testLevel(`
..........
..........
.....#####
P........F
##########
`);
  const p = new Player(lvl, { vest: ridgeline });
  p.update(inp({ moveY: 1 }), STEP);
  // Overlapping the roof by 3px: within reach of headroom
  p.x = 5 * 8 - 5;
  for (let f = 0; f < 30 && p.ducking; f++) p.update(inp(), STEP);
  assert.ok(!p.ducking);
  assert.ok(p.x <= 5 * 8 - 8, `stood up at x ${p.x}`);
});

test('a crouched super is a hyper; a down-diagonal dash that lands is an ultra', () => {
  // Crouch, then dash sideways and jump: long and low
  const super_ = make();
  super_.update(inp({ moveX: 1, dashPressed: true }), STEP);
  super_.update(inp({ moveX: 1, jump: true, jumpPressed: true }), STEP);
  const hyper = make();
  hyper.update(inp({ moveY: 1 }), STEP);
  hyper.update(inp({ moveX: 1, dashPressed: true }), STEP);
  assert.ok(hyper.ducking, 'a sideways dash from a crouch stays low');
  hyper.update(inp({ moveX: 1, jump: true, jumpPressed: true }), STEP);
  assert.ok(!hyper.ducking);
  assert.ok(hyper.vx > super_.vx && hyper.vy > super_.vy, `hyper ${hyper.vx},${hyper.vy} vs super ${super_.vx},${super_.vy}`);

  // From the air, a down-diagonal dash crouches you and gains speed as it lands
  const ultra = make();
  ultra.x = 40;
  ultra.y -= 12;
  ultra.update(inp({ moveX: 1, moveY: 1, dashPressed: true }), STEP);
  const before = ultra.vx;
  for (let f = 0; f < 8 && !ultra.dashOnGround; f++) ultra.update(inp({ moveX: 1, moveY: 1 }), STEP);
  assert.ok(ultra.ducking);
  assert.ok(Math.abs(ultra.vx - before * PHYS.groundDashSpeedMult) < 1e-9, `${before} became ${ultra.vx}`);

  // Landing just after the dash has ended still counts, once
  const late = make();
  late.x = 40;
  late.y -= 40;
  late.update(inp({ moveX: 1, moveY: 1, dashPressed: true }), STEP);
  let landing = null;
  for (let f = 0; f < 30 && !late.ducking; f++) {
    landing = late.vx;
    late.update(inp({ moveX: 1, moveY: 1 }), STEP);
  }
  assert.equal(late.state, ST.NORMAL, 'the dash ended before landing');
  assert.ok(late.ducking && late.vx > landing, `${landing} became ${late.vx}`);
  const after = late.vx;
  late.update(inp({ moveX: 1, moveY: 1 }), STEP);
  assert.ok(late.vx < after, 'only once');
});

test('a crouch-jump stands up on the way down, in time to grab a crag', () => {
  const p = make();
  p.x = 27 * 8 - 8 - 24;
  p.update(inp({ moveY: 1 }), STEP);
  let grabbed = -1;
  for (let f = 0; f < 60 && grabbed < 0; f++) {
    p.update(inp({ moveX: 1, jump: true, jumpPressed: f === 0, grab: true }), STEP);
    if (f > 0 && p.vy > 0) assert.ok(!p.ducking || p.onGround, 'stands once falling');
    if (p.state === ST.CLIMB) grabbed = f;
  }
  assert.ok(grabbed > 0 && !p.onGround, `grabbed in the air (frame ${grabbed})`);
});

test('crouching behind a single rock gets you right into its lee', () => {
  const lvl = testLevel(`
...................F
...................#
...................#
...................#
P..........#.......#
####################
`);
  // A westerly, with the rock just to the west
  const feet = lvl.start.y;
  const standing = lvl.exposureAt(12 * 8, feet - 11, 8, 11, 1);
  const crouched = lvl.exposureAt(12 * 8, feet - PHYS.duckHeight, 8, PHYS.duckHeight, 1);
  assert.ok(crouched < standing * 0.6, `crouched ${crouched} vs standing ${standing}`);
});

test('loose rock never settles back over a crouching runner', () => {
  const lvl = testLevel(`
..........
..........
..........
P.........F
###%%%####
###...####
##########
`);
  const p = new Player(lvl, { vest: ridgeline });
  // Crouched in the pit the rock fell into
  p.loose.fill(-STEP);
  p.x = 3 * 8 + 4;
  p.y = 6 * 8 - p.h;
  p.update(inp({ moveY: 1 }), STEP);
  for (let f = 0; f < 60 * (LOOSE_RESPAWN + 1); f++) p.update(inp({ moveY: 1 }), STEP);
  assert.ok(p.ducking);
  p.update(inp(), STEP);
  assert.ok(!p.ducking, 'room to stand up');
});

test('wind pushes the runner, more in the air, less with a heavier vest', () => {
  const drift = (vest, air) => {
    const p = new Player(level, { vest: byId(VESTS, vest) });
    p.x = 40;
    if (air) p.y -= 60;
    const x0 = p.x;
    for (let f = 0; f < 20; f++) p.update(inp(), STEP, 40);
    return p.x - x0;
  };
  assert.ok(drift('ridgeline', false) > 0);
  assert.ok(drift('ridgeline', true) > drift('ridgeline', false));
  assert.ok(drift('featherweight', true) > drift('mountain', true));
});

test('wet rock (low grip) makes you slide further when stopping', () => {
  const slide = (grip) => {
    const p = make();
    for (let f = 0; f < 20; f++) p.update(inp({ moveX: 1 }), STEP, 0, grip);
    const x0 = p.x;
    for (let f = 0; f < 30; f++) p.update(inp(), STEP, 0, grip);
    return p.x - x0;
  };
  assert.ok(slide(0.55) > slide(1));
});

test('sharp rocks and tarns are deadly; invincibility bounces instead', () => {
  const map = `
..........
..........
P........F
###^^~~###
##########
`;
  const deadly = testLevel(map);
  const p = new Player(deadly, { vest: ridgeline });
  for (let f = 0; f < 120 && p.state !== ST.DEAD; f++) p.update(inp({ moveX: 1 }), STEP);
  assert.equal(p.state, ST.DEAD);
  assert.equal(p.deathCause, 'spike');

  const q = new Player(deadly, { vest: ridgeline, assist: { invincible: true } });
  for (let f = 0; f < 120; f++) q.update(inp({ moveX: 1 }), STEP);
  assert.notEqual(q.state, ST.DEAD);
});

test('falling off the bottom of the map is fatal', () => {
  const p = make();
  p.x = 40 * 8;
  p.y = 10 * 8;
  for (let f = 0; f < 200 && p.state !== ST.DEAD; f++) p.update(inp(), STEP);
  assert.equal(p.deathCause, 'fall');
});

test('loose rock holds you for a moment, gives way, then settles back', () => {
  const map = `
..........
..........
..........
P.........F
###%%%####
###...####
`;
  const lvl = testLevel(map);
  const p = new Player(lvl, { vest: ridgeline });
  p.x = 3 * 8 + 4;
  p.y = 4 * 8 - p.h;
  const frames = (s) => Math.round(s * 60);
  p.update(inp(), STEP);
  assert.ok(p.events.includes('crack'), 'you hear it crack as soon as you stand on it');
  for (let f = 1; f < frames(LOOSE_CRUMBLE) - 2; f++) {
    p.update(inp(), STEP);
    assert.ok(!p.events.includes('crack'), 'it cracks once, not every step');
  }
  assert.ok(p.onGround, 'still standing just before it goes');
  for (let f = 0; f < 6; f++) p.update(inp(), STEP);
  assert.ok(!p.onGround, 'fell through once it crumbled');
  // Out of the way, the rock settles back after a couple of seconds
  p.x = 8;
  p.y = 4 * 8 - p.h;
  for (let f = 0; f < frames(LOOSE_RESPAWN) + 2; f++) p.update(inp(), STEP);
  assert.ok(lvl.solidAt(3 * 8, 4 * 8, 8, 8, p.loose), 'solid again');
});

test('player snapshots copy loose rock state, so branches never share it', () => {
  const lvl = testLevel(`
....
P..F
#%%#
`);
  const p = new Player(lvl, { vest: ridgeline });
  const snap = p.snapshot();
  p.loose[0] = -1;
  p.restore(snap);
  assert.equal(p.loose[0], 0);
});

test('wind is gentler in the valley than on the tops, and rock upwind gives shelter', () => {
  const lvl = testLevel(`
...................F
...................#
...................#
...................#
P..................#
####################
`);
  // Feet on the valley floor (the start) and level with the summit
  const valley = lvl.exposureAt(4 * 8, lvl.start.y - 11, 8, 11, 1);
  const top = lvl.exposureAt(19 * 8, lvl.finish.y - 11, 8, 11, 1);
  assert.equal(valley, EXPOSURE_VALLEY);
  assert.equal(top, 1);
  // Just downwind of the crag (wind blowing west, crag to the east)
  const lee = lvl.exposureAt(18 * 8, lvl.start.y - 11, 8, 11, -1);
  assert.ok(lee < valley * 0.5, `lee ${lee}`);
});
