import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIFFICULTIES, VESTS, byId } from '../src/config.js';
import { Level } from '../src/level.js';
import { Run, formatTime, speakTime } from '../src/run.js';
import { inp } from './helpers.js';

const level = new Level({
  id: 'run-test',
  map: `
....................
....................
.P.........C.....F..
######..############
######..############
`,
});
const base = { level, vest: byId(VESTS, 'ridgeline'), difficulty: byId(DIFFICULTIES, 'none'), seed: 7 };

test('the clock starts on the first input', () => {
  const run = new Run(base);
  for (let i = 0; i < 30; i++) run.update(inp());
  assert.equal(run.frames, 0);
  run.update(inp({ moveX: 1 }));
  assert.equal(run.frames, 1);
});

test('falling sends you back to the start, then a cairn becomes the checkpoint', () => {
  const run = new Run(base);
  // Into the gap, sliding down the far side rather than clinging to it
  for (let i = 0; i < 200 && run.deaths === 0; i++) run.update(inp({ moveX: 1, moveY: run.player.onGround ? 0 : 1 }));
  assert.equal(run.deaths, 1);
  for (let i = 0; i < 40; i++) run.update(inp());
  assert.equal(run.player.x, level.start.x);

  // Jump the gap to the cairn
  for (let i = 0; i < 200 && run.checkpoint.index < 0; i++) run.update(inp({ moveX: 1, jump: true, jumpPressed: i % 20 === 0 }));
  assert.equal(run.checkpoint.index, 0);
  assert.ok(run.splits[0] > 0);
});

test('reaching the trig point finishes the run', () => {
  const run = new Run(base);
  for (let i = 0; i < 600 && !run.finished; i++) run.update(inp({ moveX: 1, jump: true, jumpPressed: i % 15 === 0 }));
  assert.ok(run.finished);
  const frames = run.frames;
  run.update(inp({ moveX: 1 }));
  assert.equal(run.frames, frames, 'clock stops at the summit');
});

test('assist options mark the run as assisted', () => {
  assert.equal(new Run(base).assisted, false);
  assert.equal(new Run({ ...base, assist: { speed: 0.7 } }).assisted, true);
  assert.equal(new Run({ ...base, assist: { invincible: true } }).assisted, true);
  assert.equal(new Run({ ...base, assist: { dashMode: 'default', speed: 1 } }).assisted, false);
});

test('times are formatted for display and for screen readers', () => {
  assert.equal(formatTime(0), '0:00.00');
  assert.equal(formatTime(60 * 63 + 30), '1:03.50');
  assert.equal(formatTime(-90, { sign: true }), '−0:01.50');
  assert.equal(speakTime(60 * 63 + 30), '1 minute 3.50 seconds');
  assert.equal(speakTime(90), '1.50 seconds');
});

test('a mint cake comes back exactly 150 steps after it is eaten', () => {
  const lvl = new Level({
    id: 'cake-test',
    map: `
....................
.....*..............
P..................F
####################
`,
  });
  const run = new Run({ ...base, level: lvl });
  run.update(inp({ moveX: 1 }));
  run.player.dashes = 0;
  run.player.x = 5 * 8;
  run.player.y = 1 * 8;
  run.update(inp({ moveX: 0, moveY: 0, jump: false }));
  assert.ok(!run.cakeVisible(0), 'eaten');
  for (let i = 1; i < 149; i++) run.update(inp());
  assert.ok(!run.cakeVisible(0), 'not back after 149 steps');
  run.update(inp());
  assert.ok(run.cakeVisible(0), 'back after 150 steps');
});
