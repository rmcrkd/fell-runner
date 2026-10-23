// Reference timings for each fell: the fastest route the solver can find in
// calm weather (runs, jumps, wall kicks, climbs and dashes, but no dash-jump
// chains), and when it reaches each named place and cairn. Use it to check a
// level's length and cairn spacing. A skilled human is usually about a third
// slower than the reference.
//
//   npm run par              all fells
//   npm run par -- scafell   one fell
//
// It takes half a minute or so per fell. It also prints the target times,
// and fails if a fell's `reference` in src/levels/index.js is out of date.

import { DIFFICULTIES } from '../src/config.js';
import { LEVELS } from '../src/levels/index.js';
import { Run } from '../src/run.js';
import { formatTarget, targetsFor } from '../src/targets.js';
import { solve } from './solver.js';

const only = process.argv[2];
const s = (frames) => `${(frames / 60).toFixed(1)}s`.padStart(6);

for (const level of LEVELS.filter((l) => !only || l.id === only)) {
  const result = solve(level, { allowDash: true, fastest: true });
  if (!result.solved) {
    console.log(`${level.def.name}: no route found (stuck near column ${Math.floor(result.best.x / 8)})`);
    process.exitCode = 1;
    continue;
  }
  console.log(`${level.def.name}: reference ${s(result.frames).trim()} (${level.cols} x ${level.rows} tiles)`);
  const run = new Run({ level, difficulty: DIFFICULTIES[0], seed: 0 });
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
  console.log(`  ${s(run.frames)}  summit (${s(run.frames - lastCairn).trim()} since the last cairn)`);
  const measured = Number((result.frames / 60).toFixed(1));
  console.log(`  targets: ${targetsFor({ reference: measured }).map((t) => `${t.name} ${formatTarget(t.frames)}`).join(' · ')}`);
  if (measured !== level.def.reference) {
    console.log(`  ✖ set reference: ${measured} for ${level.id} in src/levels/index.js (it says ${level.def.reference})`);
    process.exitCode = 1;
  }
  console.log('');
}
