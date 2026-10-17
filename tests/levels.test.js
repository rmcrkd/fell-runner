import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE } from '../src/config.js';
import { LEVELS, LEVEL_DEFS } from '../src/levels/index.js';
import { stitch } from '../src/levels/stitch.js';

for (const level of LEVELS) {
  const { def } = level;

  test(`${def.name}: map is well formed`, () => {
    const rows = def.map.split('\n');
    for (const row of rows) assert.equal(row.length, level.cols, 'rows have equal width');
    assert.match(def.map, /^[\n.#B=\-^~*%hCPF]+$/, 'only known tile characters');
    assert.equal((def.map.match(/P/g) ?? []).length, 1, 'exactly one start');
    assert.equal((def.map.match(/F/g) ?? []).length, 1, 'exactly one finish');
    assert.ok(level.finish.y < level.start.y, 'the summit is above the start');
  });

  test(`${def.name}: cairns and landmarks are named after real places on the route`, () => {
    assert.ok(level.cairns.length >= 2, 'at least two cairns');
    for (const c of level.cairns) assert.ok(c.name && !/^Cairn/.test(c.name), `cairn at column ${c.x / TILE} has a place name`);
    assert.ok(level.places.length >= 6, 'at least six named places');
    assert.equal(level.places[0].col, 0, 'the route starts at a named place');
  });
}

test('each fell has a storage key that changes when its map does', async () => {
  const { hashString } = await import('../src/rng.js');
  assert.equal(new Set(LEVELS.map((l) => l.key)).size, LEVELS.length);
  for (const l of LEVELS) assert.equal(l.key, `${l.id}.${hashString(l.def.map).toString(36)}`);
});

test('levels are listed in order of difficulty', () => {
  assert.deepEqual(
    LEVEL_DEFS.map((d) => d.grade),
    [1, 2, 3],
  );
});

test('stitch joins sections where the ground meets, and carries the bottom row down', () => {
  const { map, places } = stitch([
    { name: 'Low', map: '....\n##..\n####' },
    { name: 'High', map: '...#\n####\n####' },
  ]);
  const rows = map.split('\n');
  // The second section's left-hand ground lines up with the first's right-hand ground
  const ground = (col) => rows.findIndex((r) => r[col] === '#');
  assert.equal(ground(3), ground(4));
  assert.equal(ground(7), ground(4) - 1);
  assert.equal(rows.at(-1), '########');
  assert.deepEqual(places, [
    { name: 'Low', col: 0, cols: 4 },
    { name: 'High', col: 4, cols: 4 },
  ]);
});

test('an open gap in a section bottom row stays open all the way down', () => {
  const { map } = stitch(['#..#\n#..#']);
  for (const row of map.split('\n').slice(-3)) assert.equal(row, '#..#');
});

test('stitch rejects a section that does not start and end on the ground', () => {
  assert.throws(() => stitch(['....\n#...']), /solid ground/);
});
