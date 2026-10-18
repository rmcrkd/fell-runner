// Shared proof that a fell can be finished with the real physics. Each fell
// has its own test file so that Node runs the three proofs in parallel.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIFFICULTIES, VESTS, byId } from '../src/config.js';
import { GhostPlayback } from '../src/ghost.js';
import { levelById } from '../src/levels/index.js';
import { Run } from '../src/run.js';
import { createWeather } from '../src/weather.js';
import { solve } from '../tools/solver.js';

const extreme = byId(DIFFICULTIES, 'extreme');

// The strongest wind Extreme weather can hold for more than a gust: the top
// of its base range at the top of its slow drift. Gusts come on top, but
// they're brief and warned; the seeded storms below include them.
export const WORST_STEADY_WIND = extreme.windBase[1] * 1.25;
// The greasiest the rock gets: grip in the heaviest rain or snow.
export const WORST_GRIP = 0.55;

// Searches the first `n` seeds for the nastiest storms on this fell: the one
// with the strongest average headwind, and the one that spends longest
// gusting against you.
export function worstSeeds(levelId, n = 500) {
  let head = null;
  let gusty = null;
  for (let seed = 0; seed < n; seed++) {
    const w = createWeather(seed, extreme, levelId);
    let sum = 0;
    for (let t = 0; t < 120; t += 0.25) sum += w.windAt(t);
    const against = w.gusts.filter((g) => g.start < 120 && Math.sign(g.strength) * w.dir < 0).reduce((a, g) => a + g.duration, 0);
    if (!head || sum < head.sum) head = { seed, sum };
    if (!gusty || against > gusty.against) gusty = { seed, against };
  }
  return [...new Set([head.seed, gusty.seed])];
}

const where = (result) => `stuck near column ${Math.floor(result.best.x / 8)}`;

export function proveFinishable(levelId) {
  const level = levelById(levelId);
  const { def } = level;
  const allowDash = !!def.needsDash;

  for (const vest of VESTS) {
    test(`${def.name}: finishable in calm weather with ${vest.name}${allowDash ? '' : ', without dashing'}`, () => {
      const result = solve(level, { vest, allowDash });
      assert.ok(result.solved, where(result));
    });
  }

  for (const vest of VESTS) {
    test(`${def.name}: finishable with ${vest.name} in the worst steady Extreme gale, head-on and from behind`, () => {
      for (const dir of [-1, 1]) {
        const result = solve(level, { vest, wind: dir * WORST_STEADY_WIND, grip: WORST_GRIP, allowDash: true });
        assert.ok(result.solved, `${dir < 0 ? 'headwind' : 'tailwind'}: ${where(result)}`);
      }
    });
  }

  const seeds = worstSeeds(level.id);
  for (const vest of VESTS) {
    test(`${def.name}: finishable with ${vest.name} in the worst seeded Extreme storms (seeds ${seeds.join(', ')})`, () => {
      for (const seed of seeds) {
        const w = createWeather(seed, extreme, level.id);
        const result = solve(level, { vest, wind: w.windAt, grip: w.grip, allowDash: true });
        assert.ok(result.solved, `seed ${seed}: ${where(result)}`);
      }
    });
  }

  test(`${def.name}: a solved storm route replays through a real run, cairn by cairn, to the summit`, () => {
    const vest = byId(VESTS, 'ridgeline');
    const seed = seeds[0];
    const weather = createWeather(seed, extreme, level.id);
    const { solved, inputs } = solve(level, { vest, wind: weather.windAt, grip: weather.grip, allowDash: true });
    assert.ok(solved);
    const run = new Run({ level, vest, difficulty: extreme, seed });
    for (const input of inputs) run.update(input);
    assert.ok(run.finished, 'run finished');
    assert.equal(run.deaths, 0);
    assert.equal(run.splits.filter((s) => s != null).length, level.cairns.length, 'passed every cairn');
    assert.equal(new GhostPlayback(run.recorder.encode()).frames, run.frames);
  });
}
