import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PHYS, STEP, VESTS, byId } from '../src/config.js';
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
