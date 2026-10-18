import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LEVEL_DEFS } from '../src/levels/index.js';
import { formatTarget, medalFor, nextTarget, speakTarget, targetsFor } from '../src/targets.js';

test('every fell has a reference time, and targets get easier from gold to bronze', () => {
  for (const def of LEVEL_DEFS) {
    assert.ok(def.reference > 30 && def.reference < 60, `${def.name} reference ${def.reference}`);
    const [gold, silver, bronze] = targetsFor(def);
    assert.deepEqual([gold.id, silver.id, bronze.id], ['gold', 'silver', 'bronze']);
    assert.ok(gold.frames < silver.frames && silver.frames < bronze.frames);
    // Gold is a skilled human's pace, never the solver's
    assert.ok(gold.frames >= def.reference * 60 * 1.3, `${def.name} gold is reachable`);
    for (const t of [gold, silver, bronze]) assert.equal(t.frames % 60, 0, 'whole seconds');
  }
});

test('a time earns the best medal it beats, and points at the next one', () => {
  const def = { reference: 40 };
  // Gold 54 s, silver 80 s, bronze 120 s
  assert.equal(medalFor(def, 54 * 60).id, 'gold');
  assert.equal(medalFor(def, 54 * 60 + 1).id, 'silver');
  assert.equal(medalFor(def, 120 * 60).id, 'bronze');
  assert.equal(medalFor(def, 120 * 60 + 1), null);
  assert.equal(nextTarget(def, 200 * 60).id, 'bronze');
  assert.equal(nextTarget(def, 100 * 60).id, 'silver');
  assert.equal(nextTarget(def, 60 * 60).id, 'gold');
  assert.equal(nextTarget(def, 50 * 60), null);
});

test('targets read as minutes and seconds', () => {
  assert.equal(formatTarget(54 * 60), '0:54');
  assert.equal(formatTarget(120 * 60), '2:00');
  assert.equal(speakTarget(54 * 60), '54 seconds');
  assert.equal(speakTarget(80 * 60), '1 minute 20 seconds');
  assert.equal(speakTarget(120 * 60), '2 minutes');
});
