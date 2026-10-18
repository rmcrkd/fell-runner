# Contributing to Fell Runner

Thanks for helping. Fell Runner has no build step and no runtime dependencies, so you can start straight away with Node 22 or later:

```sh
npm start            # http://localhost:8080
npm run test:quick   # unit tests, under a second
npm test             # everything, including the route proofs (about 2 minutes)
```

## Making or changing a level

Each fell lives in `src/levels/<id>.js` as a list of **sections**, left to right along the route. Each section is a small plain-text map, usually named after the real place it represents:

```js
export default [
  {
    name: 'Scales Tarn',
    map: `
........................
..........B.............
####~~~~~~B~~~~~~#######
########################
`,
  },
  // ...
];
```

`src/levels/stitch.js` joins the sections into one map. Each section is raised or lowered so that the ground at its left edge meets the ground at the right edge of the section before it. So every section must **start and end on solid ground**, and you never have to line up rows across sections. Below each section its bottom row carries on downwards: rock stays rock, and a gap (`.`) in the bottom row is a drop off the mountain.

Every character is one 8×8 tile:

| Tile | Meaning |
|---|---|
| `.` | Air |
| `#` | Rock |
| `B` | Boulder (solid) |
| `=` | Dry-stone wall (solid) |
| `%` | Loose rock: gives way 0.4 s after you stand on or grab it, and settles back 2 s later |
| `-` | Ledge you can jump up through |
| `^` | Sharp rocks (deadly) |
| `~` | Tarn or beck water (deadly) |
| `*` | Kendal mint cake: refills dash and stamina |
| `C` | Cairn checkpoint (also a split) |
| `h` | A Herdwick sheep (scenery only) |
| `P` | Start (exactly one) |
| `F` | Summit: the finish (exactly one) |

Section names appear on screen (and are announced) as the runner reaches them, and each cairn takes the name of the section it stands in. A section with `name: null` continues the place before it.

A new fell also needs an entry in `LEVEL_DEFS` in `src/levels/index.js`, with its route description, height, grade, summit marker (`ring`, `pillar` or `cairn-pillar`) and `needsDash: true` if a gap can only be crossed by dashing.

### Fair, readable levels

- **Jumps.** A full jump climbs 3 tiles; 4 needs a wall jump or a climb. A running jump clears 5 tiles on level ground with every vest.
- **Climbs.** Stamina lasts about 13 tiles of crag on the Ridgeline vest but only about 10 on the Featherweight. Keep single faces to 9 tiles, or add a ledge to rest on.
- **Chimneys.** For anything taller, use a chimney: two facing walls 3 tiles apart to kick between. If a hanging slab forms one side, leave exactly 3 tiles of headroom under it. With 4, the first kick flies out underneath.
- **Dashing.** Make the route possible without dashing unless the fell sets `needsDash`. Mint cakes in mid-air let a one-dash vest dash twice across a wide gap.
- **Wind.** The wind is at 65% strength on the valley floor and full force at the summit, so long jumps high up need to work into a gale. The worst steady Extreme gale is 50 units. With the Featherweight vest, a gap of 8 tiles high on a fell is about the limit, even with a dash and a mint cake.
- **Length and cairns.** Aim for a reference route (see below) of 35 to 45 seconds, which is a minute or so for a skilled player, and a cairn every 13 to 17 seconds of it.
- **Sources.** Base routes on real paths and features, keep descriptions accurate, and name sections after real places, in the order you meet them.

If you edit a map, stored best times for that fell retire automatically: records are keyed by a hash of the map, so players never compare runs on different routes.

## Proving it can be finished

`npm test` runs `tools/solver.js` against every fell, with one test file per fell (`tests/route-*.test.js`) so they run in parallel. The solver drives the real player physics through thousands of scripted moves. It fails, naming the tile column where it got stuck, unless every vest can reach the summit:

- in calm weather (without dashing, unless the fell `needsDash`),
- in the worst steady Extreme gale, head-on and from behind, on the greasiest rock,
- in the two worst seeded Extreme storms out of the first 500 seeds.

If the solver gets stuck somewhere a human clearly could pass, it may need a new script. Add one in `buildScripts` rather than weakening the checks.

`npm run par` (or `node tools/par.js <fell>`) finds a near-optimal calm-weather route with A* search and prints when it reaches each place and cairn. Use it to check length and cairn spacing.

## Checking the interface

The browser tools in `tools/browser` are dev-only, with their own dependencies (puppeteer-core, axe-core, gifenc, pngjs). They use your installed Chrome; set `CHROME_PATH` if it isn't found.

```sh
cd tools/browser && npm install
npm run audit       # axe-core (WCAG 2.2 AA + best practice) on every screen, 4 sizes, 2 themes
npm run keyboard    # keyboard-only walkthrough; add `-- phone` for phone size
npm run capture     # regenerate the README's images and GIF in docs/
```

Screenshots go to `.scratch/` (gitignored) unless you set `OUT`.

## Project metadata

`package.json` is the single source of truth for the project's description, website, keywords (which are also the GitHub topics), version and licence. `CITATION.cff` must match it, and so must the repository's About box on GitHub:

```sh
npm run metadata        # checks CITATION.cff (also run by npm test) and, if gh can reach it, GitHub
npm run metadata:sync   # updates GitHub's description, website and topics from package.json
```

Change the values in `package.json`, update `CITATION.cff` to match (bump its `version` and `date-released` with each release), and sync GitHub once the change is merged. For Claude Code users, a Stop hook in `.claude/settings.json` flags any drift. The social preview image can't be set through the API: upload `docs/social-preview.png` under Settings → General → Social preview.

## Code style

- Plain ES modules, two-space indentation, single quotes.
- Keep game logic (`player.js`, `run.js`, `weather.js`, `level.js`, `clock.js`) free of DOM access so it stays testable in Node, and keep the simulation on the fixed 60 Hz step so runs, ghosts and weather replay exactly.
- UI belongs in accessible HTML, not on the canvas. New controls need labels, keyboard access, visible focus, and a way to work without colour.
- Don't add flashing effects. Anything that moves should respect the reduce-motion setting.

## Pull requests

Describe what you changed and how you tested it. For level changes, include the `npm run par` output and a screenshot. For interface changes, include the audit result.
