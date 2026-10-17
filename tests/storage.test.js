import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { clearRecords, getGhost, getRecord, submitRun } from '../src/storage.js';

// Node has no localStorage, so storage falls back to memory, exactly as it
// does in a browser with storage blocked.
beforeEach(() => clearRecords());

const run = (frames, extra = {}) => ({ frames, deaths: 0, vest: 'ridgeline', seed: 7, splits: [100, 200], ghost: `ghost-${frames}`, ...extra });

test('the first finish is a best, and saves a ghost', () => {
  const r = submitRun('blencathra', 'normal', false, run(3000));
  assert.deepEqual([r.improved, r.previous], [true, null]);
  assert.equal(getRecord('blencathra', 'normal').best.frames, 3000);
  assert.equal(getGhost('blencathra', 'normal').data, 'ghost-3000');
});

test('only a faster run replaces the best and its ghost', () => {
  submitRun('blencathra', 'normal', false, run(3000));
  assert.equal(submitRun('blencathra', 'normal', false, run(3100)).improved, false);
  assert.equal(getGhost('blencathra', 'normal').data, 'ghost-3000');
  const r = submitRun('blencathra', 'normal', false, run(2900));
  assert.equal(r.improved, true);
  assert.equal(r.previous.frames, 3000);
  assert.equal(getGhost('blencathra', 'normal').data, 'ghost-2900');
  assert.deepEqual(getRecord('blencathra', 'normal').best.splits, [100, 200]);
});

test('records are kept per fell and per weather', () => {
  submitRun('blencathra', 'normal', false, run(3000));
  assert.equal(getRecord('blencathra', 'extreme'), null);
  assert.equal(getRecord('helvellyn', 'normal'), null);
});

test('assisted runs have their own board, and never displace unassisted bests', () => {
  submitRun('scafell', 'none', false, run(4000));
  submitRun('scafell', 'none', true, run(2000));
  assert.equal(getRecord('scafell', 'none').best.frames, 4000);
  assert.equal(getRecord('scafell', 'none', true).best.frames, 2000);
  assert.equal(getGhost('scafell', 'none').data, 'ghost-4000');
  assert.equal(getGhost('scafell', 'none', true).data, 'ghost-2000');
});
