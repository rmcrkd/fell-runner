import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GhostPlayback, GhostRecorder } from '../src/ghost.js';
import { ST } from '../src/player.js';

test('ghost recordings round-trip through base64', () => {
  const rec = new GhostRecorder();
  const frames = 9000;
  for (let i = 0; i < frames; i++) {
    rec.push({ x: i % 2400, y: -50 + (i % 700), facing: i % 3 ? 1 : -1, state: i % 5 === 0 ? ST.DEAD : ST.NORMAL, onGround: i % 2 === 0 });
  }
  const play = new GhostPlayback(rec.encode());
  assert.equal(play.frames, frames);
  for (const i of [0, 1, 2, 4999, frames - 1]) {
    const g = play.at(i);
    assert.equal(g.x, i % 2400);
    assert.equal(g.y, -50 + (i % 700));
    assert.equal(g.facing, i % 3 ? 1 : -1);
    assert.equal(g.dead, i % 5 === 0);
    assert.equal(g.air, i % 2 !== 0);
  }
  assert.equal(play.at(frames), null);
});

test('the same inputs in the same seeded weather always record the same ghost', async () => {
  const { DIFFICULTIES, VESTS, byId } = await import('../src/config.js');
  const { levelById } = await import('../src/levels/index.js');
  const { Run } = await import('../src/run.js');
  const level = levelById('helvellyn');
  const vest = byId(VESTS, 'featherweight');
  const extreme = byId(DIFFICULTIES, 'extreme');
  // Run right and jump every so often, for twenty seconds
  const inputs = Array.from({ length: 1200 }, (_, i) => ({ moveX: 1, moveY: 0, jump: i % 40 < 12, jumpPressed: i % 40 === 0, dashPressed: i % 90 === 45, grab: false }));
  const record = (seed) => {
    const run = new Run({ level, vest, difficulty: extreme, seed });
    for (const input of inputs) run.update(input);
    return run.recorder.encode();
  };
  assert.equal(record(1234), record(1234));
  assert.notEqual(record(1234), record(4321), 'different weather blows the runner differently');
});
