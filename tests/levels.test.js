import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STEP, TILE } from '../src/config.js';
import { LEVELS, LEVEL_DEFS } from '../src/levels/index.js';
import { stitch } from '../src/levels/stitch.js';
import { T } from '../src/level.js';
import { Player } from '../src/player.js';
import { inp } from './helpers.js';

for (const level of LEVELS) {
  const { def } = level;

  test(`${def.name}: map is well formed`, () => {
    const rows = def.map.split('\n');
    for (const row of rows) assert.equal(row.length, level.cols, 'rows have equal width');
    assert.match(def.map, /^[\n.#B=\-^~*%hCPF?]+$/, 'only known tile characters');
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

test('Blencathra teaches every move with signposts before its first hazard', () => {
  const level = LEVELS[0];
  const words = level.signs.map((s) => s.text);
  for (const s of level.signs) assert.ok(s.text, `signpost at column ${s.x / TILE} has words`);
  const before = (pattern) => level.signs.findIndex((s) => pattern.test(s.text));
  for (const move of [/\{jump\}/, /kick/, /\{up\} to climb/, /[Ll]oose/, /\{dash\}/, /wind/, /\{down\} to crouch/]) assert.ok(before(move) >= 0, `a sign mentions ${move}`);
  // The first stretch is safe: no sharp rocks, water or open drops
  const firstHazard = Math.min(
    ...[...level.def.map.split('\n').entries()].flatMap(([, row]) => [row.indexOf('^'), row.indexOf('~')].filter((i) => i >= 0)),
  );
  assert.ok(level.signs.filter((s) => s.x / TILE < firstHazard).length >= 6, `six signs before column ${firstHazard}`);
  assert.ok(words.every((w) => w.length <= 110), 'signs stay short');
});

test('sign words name actions the game can show controls for', () => {
  for (const level of LEVELS) {
    for (const s of level.signs) {
      for (const [, action] of s.text.matchAll(/\{(\w+)\}/g)) assert.ok(['jump', 'dash', 'up', 'down'].includes(action), `{${action}} on ${level.def.name}`);
    }
  }
});

test('Helvellyn: a crouching runner can get through the Hole-in-the-Wall, not just over it', () => {
  const level = LEVELS.find((l) => l.id === 'helvellyn');
  const hole = level.places.find((p) => p.name === 'Hole-in-the-Wall');
  // The gap is one tile high, between the wall and a stub of wall below it
  const stub = hole.col + 19;
  const topOf = (col) => [...Array(level.rows).keys()].find((ty) => level.kind(col, ty) === T.SOLID) * TILE;
  const floor = topOf(hole.col);
  const wallTop = topOf(stub);
  // Run in, crouch, crouch-jump, then dash sideways through the gap
  const through = (run, dashAt) => {
    const p = new Player(level);
    p.spawn(hole.x, floor);
    for (let f = 0; f < run; f++) p.update(inp({ moveX: 1 }), STEP);
    p.update(inp({ moveX: 1, moveY: 1 }), STEP);
    for (let f = 0; f < 120; f++) {
      p.update(inp({ moveX: 1, moveY: f < dashAt ? 1 : 0, jump: f < 4, jumpPressed: f === 0, dashPressed: f === dashAt }), STEP);
      if (p.y < wallTop) return false;
      if (p.x > hole.x + 24 * TILE) return true;
    }
    return false;
  };
  let ok = false;
  for (let run = 30; run < 80 && !ok; run++) for (let at = 4; at < 16 && !ok; at++) ok = through(run, at);
  assert.ok(ok);
});

test('stitch pairs each signpost with its words, and rejects a miscount', () => {
  const { signs } = stitch([{ name: 'A', signs: ['one', 'two'], map: '.?..?.\n######' }, { name: 'B', signs: ['three'], map: '..?\n###' }]);
  assert.deepEqual(signs, [
    { col: 1, text: 'one' },
    { col: 4, text: 'two' },
    { col: 8, text: 'three' },
  ]);
  assert.throws(() => stitch([{ signs: ['one'], map: '.?.?\n####' }]), /2 signposts but 1 signs/);
  assert.throws(() => stitch([{ signs: ['one', 'two'], map: '.?.\n.?.\n###' }]), /two signposts in one column/);
});

test('each fell has a storage key that changes when its map or the physics does', async () => {
  const { hashString } = await import('../src/rng.js');
  const { PHYS } = await import('../src/config.js');
  assert.equal(new Set(LEVELS.map((l) => l.key)).size, LEVELS.length);
  for (const l of LEVELS) assert.equal(l.key, `${l.id}.${hashString(l.def.map + JSON.stringify(PHYS)).toString(36)}`);
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
