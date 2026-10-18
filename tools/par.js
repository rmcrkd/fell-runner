// Reference timings for each fell: the fastest route the solver can find in
// calm weather (runs, jumps, wall kicks, climbs and dashes, but no super-jump
// chains), and when it reaches each named place and cairn. Use it to check a
// level's length and cairn spacing. A skilled human is usually about a third
// slower than the reference.
//
//   npm run par              all fells
//   npm run par -- scafell   one fell
//
// It takes a minute or so per fell.

import { DIFFICULTIES, VESTS, byId } from '../src/config.js';
import { LEVELS } from '../src/levels/index.js';
import { Run } from '../src/run.js';
import { solve } from './solver.js';

const only = process.argv[2];
const vest = byId(VESTS, 'ridgeline');
const s = (frames) => `${(frames / 60).toFixed(1)}s`.padStart(6);

for (const level of LEVELS.filter((l) => !only || l.id === only)) {
  const result = solve(level, { vest, allowDash: true, fastest: true });
  if (!result.solved) {
    console.log(`${level.def.name}: no route found (stuck near column ${Math.floor(result.best.x / 8)})`);
    continue;
  }
  console.log(`${level.def.name}: reference ${s(result.frames).trim()} (${level.cols} x ${level.rows} tiles)`);
  const run = new Run({ level, vest, difficulty: DIFFICULTIES[0], seed: 0 });
  const reached = new Set();
  let lastCairn = 0;
  for (const input of result.inputs) {
    run.update(input);
    for (const p of level.places) {
      if (!reached.has(p) && run.player.x >= p.x) {
        reached.add(p);
        console.log(`  ${s(run.frames)}  ${p.name}`);
      }
    }
    for (const e of run.events) {
      if (e.type === 'checkpoint') {
        console.log(`  ${s(e.frames)}  cairn (${s(e.frames - lastCairn).trim()} since the last)`);
        lastCairn = e.frames;
      }
    }
  }
  console.log(`  ${s(run.frames)}  summit (${s(run.frames - lastCairn).trim()} since the last cairn)\n`);
}
