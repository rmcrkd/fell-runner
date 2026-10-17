import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIFFICULTIES, VESTS, byId } from '../src/config.js';
import { GhostPlayback } from '../src/ghost.js';
import { LEVELS, LEVEL_DEFS } from '../src/levels/index.js';
import { Run } from '../src/run.js';
import { createWeather } from '../src/weather.js';
import { solve } from '../tools/solver.js';

for (const level of LEVELS) {
  const { def } = level;

  test(`${def.name}: map is well formed`, () => {
    const rows = def.map.replace(/^\n+|\s+$/g, '').split('\n');
    for (const row of rows) assert.equal(row.length, level.cols, 'rows have equal width');
    assert.match(def.map, /^[\n.#B=\-^~*CPF]+$/, 'only known tile characters');
    assert.equal((def.map.match(/P/g) ?? []).length, 1, 'exactly one start');
    assert.equal((def.map.match(/F/g) ?? []).length, 1, 'exactly one finish');
    assert.equal(level.cairns.length, def.cairns.length, 'every cairn has a name');
  });

  for (const vest of VESTS) {
    test(`${def.name}: reachable in calm weather with ${vest.name}, without dashing`, () => {
      const result = solve(level, { vest });
      assert.ok(result.solved, `stuck near tile ${Math.floor(result.best.x / 8)}`);
    });
  }

  test(`${def.name}: reachable into the strongest steady extreme headwind`, () => {
    const extreme = byId(DIFFICULTIES, 'extreme');
    for (const vest of VESTS) {
      const result = solve(level, { vest, wind: -extreme.windBase[1], allowDash: true });
      assert.ok(result.solved, `${vest.name} stuck near tile ${Math.floor(result.best.x / 8)}`);
    }
  });

  test(`${def.name}: reachable in real seeded extreme weather`, () => {
    const extreme = byId(DIFFICULTIES, 'extreme');
    for (const seed of [1, 2, 3]) {
      const weather = createWeather(seed, extreme, level.id);
      const vest = VESTS[seed % VESTS.length];
      const result = solve(level, { vest, wind: weather.windAt, grip: weather.grip, allowDash: true });
      assert.ok(result.solved, `seed ${seed} with ${vest.name} stuck near tile ${Math.floor(result.best.x / 8)}`);
    }
  });

  test(`${def.name}: a solved route replays through a real run to the summit`, () => {
    const vest = byId(VESTS, 'ridgeline');
    const difficulty = byId(DIFFICULTIES, 'extreme');
    const seed = 2026;
    const weather = createWeather(seed, difficulty, level.id);
    const { solved, inputs } = solve(level, { vest, wind: weather.windAt, grip: weather.grip, allowDash: true });
    assert.ok(solved);
    const run = new Run({ level, vest, difficulty, seed });
    for (const input of inputs) run.update(input);
    assert.ok(run.finished, 'run finished');
    assert.equal(run.deaths, 0);
    assert.equal(run.splits.filter((s) => s != null).length, level.cairns.length, 'passed every cairn');
    const ghost = new GhostPlayback(run.recorder.encode());
    assert.equal(ghost.frames, run.frames);
  });
}

test('levels are listed in order of difficulty', () => {
  assert.deepEqual(
    LEVEL_DEFS.map((d) => d.grade),
    [1, 2, 3],
  );
});
