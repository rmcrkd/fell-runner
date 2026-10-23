import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AIR_DRAG, PHYS, STEP, WIND_CAP } from '../src/config.js';
import { EXPOSURE_VALLEY, LOOSE_CRUMBLE, LOOSE_RESPAWN } from '../src/level.js';
import { Player, ST } from '../src/player.js';
import { inp, testLevel } from './helpers.js';

const level = testLevel();

function make(opts = {}) {
  return new Player(level, opts);
}

// A runner high in open air, taking the full force of the wind, with a
// long way to fall
function aloft(opts) {
  const p = make(opts);
  p.x = 40;
  p.y = -400;
  p.onGround = false;
  return p;
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
  assert.ok(Math.abs(p.vx - PHYS.maxRun) < 1e-9, `${p.vx}`);
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
  const p = new Player(ledge);
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

test('grip is always on: a runner falling against a crag hangs on as long as they like', () => {
  const p = make();
  p.x = 27 * 8 - 8;
  p.y -= 40;
  p.onGround = false;
  for (let f = 0; f < 60 * 30; f++) p.update(inp(), STEP);
  assert.equal(p.state, ST.CLIMB);
  assert.equal(p.facing, 1);
});

test('on a crag, the runner climbs slowly, slides down, lets go by pushing away, and always jumps away', () => {
  const hang = () => {
    const p = make();
    p.x = 27 * 8 - 8;
    p.y -= 24;
    p.update(inp({ moveX: 1, moveY: -1 }), STEP);
    assert.equal(p.state, ST.CLIMB, 'pressing up beside a crag takes hold');
    return p;
  };
  const up = hang();
  const y0 = up.y;
  for (let f = 0; f < 30; f++) up.update(inp({ moveY: -1 }), STEP);
  assert.equal(up.state, ST.CLIMB);
  assert.ok(y0 - up.y > 15 && y0 - up.y <= -PHYS.climbUpSpeed / 2, `climbed ${y0 - up.y}px in half a second`);

  const down = hang();
  down.update(inp({ moveY: 1 }), STEP);
  for (let f = 0; f < 10; f++) down.update(inp({ moveY: 1 }), STEP);
  assert.ok(down.vy > 0, 'slides down');

  const off = hang();
  off.update(inp({ moveX: -1 }), STEP);
  assert.equal(off.state, ST.NORMAL);
  for (let f = 0; f < 10; f++) off.update(inp({ moveX: -1 }), STEP);
  assert.ok(off.x < 27 * 8 - 8, 'moved away from the crag');

  for (const moveX of [1, 0, -1]) {
    const kick = hang();
    kick.update(inp({ moveX, jump: true, jumpPressed: true }), STEP);
    assert.equal(kick.vx, -PHYS.wallJumpHSpeed, `kicked away, holding ${moveX}`);
    assert.ok(kick.vy < 0);
  }
});

test('climbing up a crag carries the runner over the top, even into a headwind', () => {
  for (const wind of [0, -30, -WIND_CAP]) {
    const p = make();
    p.x = 27 * 8 - 8;
    p.y -= 24;
    p.onGround = false;
    let f = 0;
    while (!(p.onGround && p.y + p.h <= 7 * 8) && f++ < 120) p.update(inp({ moveY: -1 }), STEP, wind);
    assert.ok(f < 120, `stuck below the top in a wind of ${wind}`);
  }
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

test('one dash, or two with the assist', () => {
  assert.equal(make().maxDashes, 1);
  assert.equal(make({ assist: { dashMode: 'two' } }).maxDashes, 2);
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

test('a crouched runner stays down under a low roof, and does not cling', () => {
  const lvl = testLevel(`
..........
..........
.....#####
P........F
##########
`);
  const p = new Player(lvl);
  p.x = 3 * 8;
  p.update(inp({ moveY: 1 }), STEP);
  p.x = 6 * 8;
  for (let f = 0; f < 10; f++) p.update(inp({ moveX: 1, moveY: -1 }), STEP);
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
  const p = new Player(lvl);
  p.update(inp({ moveY: 1 }), STEP);
  // Overlapping the roof by 3px: within reach of headroom
  p.x = 5 * 8 - 5;
  for (let f = 0; f < 30 && p.ducking; f++) p.update(inp(), STEP);
  assert.ok(!p.ducking);
  assert.ok(p.x <= 5 * 8 - 8, `stood up at x ${p.x}`);
});

test('no tech turns speed on one axis into speed on the other', () => {
  // A jump out of a ground dash keeps the dash's sideways speed, and the
  // jump is an ordinary one, crouched or not
  for (const crouch of [false, true]) {
    const p = make();
    if (crouch) p.update(inp({ moveY: 1 }), STEP);
    p.update(inp({ moveX: 1, dashPressed: true }), STEP);
    p.update(inp({ moveX: 1, jump: true, jumpPressed: true }), STEP);
    assert.ok(p.vx <= PHYS.dashSpeed + PHYS.jumpHBoost, `vx ${p.vx}`);
    assert.equal(p.vy, PHYS.jumpSpeed);
  }
  // A down-diagonal dash that lands just stops falling
  const q = make();
  q.x = 40;
  q.y -= 12;
  q.update(inp({ moveX: 1, moveY: 1, dashPressed: true }), STEP);
  let most = 0;
  for (let f = 0; f < 20; f++) {
    q.update(inp({ moveX: 1, moveY: 1 }), STEP);
    most = Math.max(most, q.vx);
  }
  assert.ok(q.onGround);
  assert.ok(most <= PHYS.dashSpeed * Math.SQRT1_2 + 1e-9, `vx reached ${most}`);
  // An up-dash beside a crag, then a jump, is an ordinary wall kick
  const r = make();
  r.x = 27 * 8 - 8 - 2;
  r.y -= 30;
  r.jumpGrace = 0;
  r.update(inp({ moveY: -1, dashPressed: true }), STEP);
  r.update(inp({ jump: true, jumpPressed: true }), STEP);
  assert.equal(r.vx, -PHYS.wallJumpHSpeed);
  assert.equal(r.vy, PHYS.jumpSpeed);
});

test('a crouch-jump stands up on the way down, in time to cling to a crag', () => {
  const p = make();
  p.x = 27 * 8 - 8 - 24;
  p.update(inp({ moveY: 1 }), STEP);
  let grabbed = -1;
  for (let f = 0; f < 60 && grabbed < 0; f++) {
    p.update(inp({ moveX: 1, jump: true, jumpPressed: f === 0 }), STEP);
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
  const p = new Player(lvl);
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

test('in still air, drag balances the runner\'s push at running speed', () => {
  const p = aloft();
  for (let f = 0; f < 60; f++) p.update(inp({ moveX: 1 }), STEP);
  assert.ok(Math.abs(p.vx - PHYS.maxRun) < 0.5, `vx ${p.vx}`);
  assert.equal(AIR_DRAG * PHYS.maxRun, PHYS.airAccel);
});

test('the strongest wind holds still a runner pushing into it in the air', () => {
  // Pushing east into the strongest westward wind, from a standstill: still
  const p = aloft();
  const x0 = p.x;
  for (let f = 0; f < 30; f++) {
    p.update(inp({ moveX: 1 }), STEP, -WIND_CAP);
    assert.equal(p.vx, 0);
  }
  assert.equal(p.x, x0);
  // Taking off at running speed into it, the wind soon stops them
  const q = aloft();
  q.vx = PHYS.maxRun;
  for (let f = 0; f < 40; f++) q.update(inp({ moveX: 1 }), STEP, -WIND_CAP);
  assert.ok(Math.abs(q.vx) < 1, `vx ${q.vx}`);
  // A lesser wind lets them make headway; letting go, they're blown along
  const r = aloft();
  for (let f = 0; f < 30; f++) r.update(inp({ moveX: 1 }), STEP, -WIND_CAP / 2);
  assert.ok(r.vx > 0);
  const s = aloft();
  for (let f = 0; f < 30; f++) s.update(inp(), STEP, -WIND_CAP / 2);
  assert.ok(s.vx < 0);
});

test('wind is a force: it builds speed over time, sideways only', () => {
  const calm = aloft();
  const windy = aloft();
  windy.update(inp(), STEP, WIND_CAP);
  assert.ok(windy.vx > 0 && windy.vx < WIND_CAP / 2, `one step of wind: ${windy.vx}`);
  calm.update(inp(), STEP);
  for (let f = 0; f < 30; f++) {
    calm.update(inp(), STEP);
    windy.update(inp(), STEP, WIND_CAP);
    assert.equal(windy.vy, calm.vy, 'falls exactly as in still air');
  }
});

test('on the ground, feet make headway even into the strongest wind', () => {
  const p = make();
  p.x = 40;
  for (let f = 0; f < 60; f++) p.update(inp({ moveX: 1 }), STEP, -WIND_CAP);
  assert.ok(p.vx > PHYS.maxRun / 3, `vx ${p.vx}`);
  // And a runner standing still stays put
  const q = make();
  q.x = 40;
  for (let f = 0; f < 60; f++) q.update(inp(), STEP, -WIND_CAP);
  assert.equal(q.x, 40);
});

test('wind does not act on a runner clinging to a crag', () => {
  const p = make();
  p.x = 27 * 8 - 8;
  p.y -= 40;
  p.onGround = false;
  p.update(inp(), STEP);
  for (let f = 0; f < 60; f++) p.update(inp(), STEP, -WIND_CAP);
  assert.equal(p.state, ST.CLIMB);
  assert.equal(p.vx, 0);
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
  const p = new Player(deadly);
  for (let f = 0; f < 120 && p.state !== ST.DEAD; f++) p.update(inp({ moveX: 1 }), STEP);
  assert.equal(p.state, ST.DEAD);
  assert.equal(p.deathCause, 'spike');

  const q = new Player(deadly, { assist: { invincible: true } });
  for (let f = 0; f < 120; f++) q.update(inp({ moveX: 1 }), STEP);
  assert.notEqual(q.state, ST.DEAD);
});

test('falling off the bottom of the map is fatal', () => {
  const p = make();
  p.x = 40 * 8;
  p.y = 10 * 8;
  // Grip is always on, so it takes sliding down the crag beside the drop
  for (let f = 0; f < 200 && p.state !== ST.DEAD; f++) p.update(inp({ moveY: 1 }), STEP);
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
  const p = new Player(lvl);
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
  const p = new Player(lvl);
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
