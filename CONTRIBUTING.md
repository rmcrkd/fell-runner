# Contributing to Fell Runner

Thanks for helping. Fell Runner has no build step and no dependencies, so you can start straight away:

```sh
npm start   # http://localhost:8080
npm test
```

## Making or changing a level

Each fell lives in `src/levels/<id>.js` as a plain-text map. Every character is one 8×8 tile:

| Tile | Meaning |
|---|---|
| `.` | Air |
| `#` | Rock |
| `B` | Boulder (solid) |
| `=` | Dry-stone wall (solid) |
| `-` | Ledge you can jump up through |
| `^` | Sharp rocks (deadly) |
| `~` | Tarn water (deadly) |
| `*` | Kendal mint cake: refills dash and stamina |
| `C` | Cairn checkpoint (also a split) |
| `P` | Start (exactly one) |
| `F` | Summit trig point: the finish (exactly one) |

Guidelines that keep levels fair and readable:

- **Size and spacing.** All rows must be the same width. Leave a few rows of sky above the highest ground.
- **Jump limits.** A full jump climbs about 3½ tiles and clears a gap of about 6 tiles. Climbing stamina lasts for about 13 tiles of crag on the default vest.
- **Chimneys.** For anything taller, use a chimney (two facing walls a few tiles apart to wall-jump between) or ledges.
- **Optional dashing.** Make the main route possible without dashing. Dashes and mint cakes should be for speed and style, and that keeps the game approachable.
- **Cairns.** Place a cairn every 15 to 25 seconds of running. Add each cairn's name to the `cairns` list in `src/levels/index.js`, in left-to-right order.
- **Sources.** Base routes on real paths and features where you can, and keep descriptions accurate.

A new fell also needs an entry in `LEVEL_DEFS` in `src/levels/index.js`.

## Proving it can be finished

`npm test` runs `tools/solver.js` against every level. It drives the real player physics through thousands of scripted moves and fails, with the tile column where it got stuck, if any vest can't reach the summit:

- in calm weather without dashing,
- into the strongest steady extreme headwind,
- in real seeded storms.

If the solver gets stuck somewhere a human clearly could pass, it may need a new script. Add one in `buildScripts` rather than weakening the level checks.

## Code style

- Plain ES modules, two-space indentation, single quotes.
- Keep game logic (`player.js`, `run.js`, `weather.js`) free of DOM access so it stays testable in Node.
- UI belongs in accessible HTML, not on the canvas. New controls need labels, keyboard access and visible focus.
- Don't add flashing effects. Anything that moves should respect the reduce-motion setting.

## Pull requests

Describe what you changed and how you tested it. For level changes, a screenshot or a best time is always welcome.
