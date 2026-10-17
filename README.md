<div align="center">

<img src="docs/social-preview.png" alt="Fell Runner: speedrun the Lake District's most notorious fells" width="100%">

**A Celeste-style speedrunning platformer over three notorious Lake District fells,<br>where the weather is seeded, the wind is physics, and the mountain rescue team is real.**

[![Tests](https://github.com/rmcrkd/fell-runner/actions/workflows/ci.yml/badge.svg)](https://github.com/rmcrkd/fell-runner/actions/workflows/ci.yml)
![Zero dependencies](https://img.shields.io/badge/dependencies-0-2f8fd8)
![axe-core: 0 violations](https://img.shields.io/badge/axe--core-0%20violations-5f9a3b)
[![MIT licence](https://img.shields.io/badge/licence-MIT-ff9f1c)](LICENSE)
[![Donate to Penrith Mountain Rescue Team](https://img.shields.io/badge/%E2%99%A5%20donate-Penrith%20MRT-c8102e)](https://penrithmrt.org.uk/donate)

### [▶ Play in your browser](https://rmcrkd.github.io/fell-runner/)

<img src="docs/gameplay.gif" alt="A runner crosses Striding Edge on Helvellyn in heavy rain and a severe westerly gale, with a gust warning showing" width="720">

</div>

## The game

Race from the valley floor to the summit trig point. Every fell takes about a minute if you're good, and longer if the weather has other ideas.

- **Tight, Celeste-style movement.** Coyote time, jump buffering, variable jump height, wall jumps, stamina-limited climbing, eight-way dashes and corner correction. Super jumps, hypers and wall bounces are there for players who go looking.
- **Seeded weather.** Wind, gusts, rain, sleet, snow and hill fog all come from a seed. The same seed gives the same gust at the same moment, so races are fair.
- **Wind is physics.** It shoves you mid-air, gives you some purchase on the ground, and can't touch you while you're clinging to a crag. You get about a second's warning before each gust.
- **Wet rock.** Rain and snow make the ground greasy, so stopping and turning take longer.
- **Three vests.** You trade speed against stamina, wind resistance and dashes.
- **Ghosts, splits and personal bests.** These are recorded for every fell and weather setting.
- **Challenge links.** Share a URL that loads the exact same fell, vest and storm.
- **No build step and no dependencies.** It's plain JavaScript modules and a canvas.

## The fells

| | Fell | Route | Height |
|---|---|---|---|
| ▲ | **Blencathra** | Scales Tarn, Scales Fell, the rock teeth of **Sharp Edge**, the Bad Step, then the Foule Crag chimney | 868 m |
| ▲▲ | **Helvellyn** | The Hole-in-the-Wall, Birkhouse Moor, the pinnacles of **Striding Edge** above Red Tarn, the chimney, the headwall, then the summit shelter | 950 m |
| ▲▲▲ | **Scafell Pike** | Lingmell Gill, Brown Tongue, Hollow Stones, the **Mickledore** chimney, then the endless summit boulder field | 978 m |

<table>
  <tr>
    <td><img src="docs/blencathra.png" alt="Blencathra: jumping between the rock teeth of Sharp Edge in steady rain, with a reached cairn flag behind"></td>
    <td><img src="docs/scafell.png" alt="Scafell Pike: climbing the snowy Mickledore chimney in a gale, a mint cake floating above"></td>
  </tr>
</table>

Cairns are checkpoints, and they also mark your splits. Kendal mint cake refills your dash and stamina in mid-air. Sharp rocks, tarns and big drops send you back to the last cairn.

## Vests

| Vest | Speed | Stamina | In the wind | Dashes |
|---|---|---|---|---|
| **Featherweight 5L** | 108% | 80% | Blown about more | 1 |
| **Ridgeline 12L** | 100% | 100% | Normal | 1 |
| **Mountain Marathon 20L** | 92% | 145% | Much steadier | 2 |

## Weather

| Difficulty | What to expect |
|---|---|
| **None** | Still and clear: pure movement. |
| **Normal** | A typical Lakeland day: breezy, gusty on the tops, passing showers and patchy clag. |
| **Extreme** | Named-storm weather: gales, driving rain or snow, and thick hill fog. |

The forecast for a seed is shown before you start. Use **Daily seed** to give everyone the same weather for the day.

## Controls

| Action | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Move | Arrows / WASD | Stick / d-pad | On-screen pad |
| Jump | C / Space / J | A | Jump |
| Dash | X / K | X or B | Dash |
| Grab and climb | Z / L / Left Shift | Bumpers or triggers | Grab |
| Restart | R | Back | |
| Pause | Esc / P | Start | ❚❚ |

Every key can be remapped, and grab can be set to hold or toggle.

## Accessibility

Fell Runner should be hard, but everyone should be able to reach the summit.

<img src="docs/settings.png" alt="Settings screen showing remappable controls and assist mode options" width="100%">

- **Assist mode**, inspired by Celeste's: game speed from 50% to 100%, infinite stamina, two or infinite dashes, and invincibility. Assisted times go on their own leaderboard, so they never displace unassisted ones.
- **Every control can be remapped.** Grab can be hold or toggle, and keyboard, gamepad and touch all work.
- **Menus and the HUD are real HTML.** That means screen-reader friendly, keyboard and gamepad navigable, and zoomable. Screen readers announce checkpoints, splits and results.
- **High-contrast mode, with nothing told by colour alone.** Hazards get a high-visibility palette. Reached cairns gain a flag, spent dashes switch to dashed outlines, and splits carry ▲/▼ as well as colour.
- **Reduce motion.** This removes parallax, bobbing, dash trails and screen shake. It's on by default if your system asks for reduced motion, and high contrast likewise follows your system setting.
- **No flashing effects.** A tired climber shows a sweat drop instead of a flashing sprite.
- **Weather visibility controls.** Rain and snow can be turned down or off, and you can set a maximum fog thickness.
- **Wind you can see and hear.** There's a gauge with direction and speed, wind streaks, a gust warning with a countdown, and stereo-panned wind audio. Optional sound captions cover the rest.
- **Adjustable HUD size**, up to 200%.
- **Automatic pause** when the window loses focus.

Every menu screen passes an automated [axe-core](https://github.com/dequelabs/axe-core) audit (WCAG 2.2 AA plus best practice) with zero violations.

## Speedrunning

- The clock starts on your first move and stops at the trig point. Time is counted in fixed 60 Hz physics steps, so it doesn't depend on your frame rate.
- Your best run on each fell and weather setting saves a **ghost** to race and **splits** for every cairn.
- **Ghost's weather** loads the seed your best ghost ran in, for a true like-for-like attempt.
- After a run, **Copy challenge link** shares the fell, vest and seed, for example `?fell=scafell&weather=extreme&seed=0K3P9QX&vest=mountain`.
- Tech: **super jump** (jump during a sideways ground dash), **hyper** (down-diagonal dash into the ground, then jump), **wall bounce** (up-dash beside a crag, then jump).

Times and ghosts are stored only in your browser.

## Play locally

```sh
git clone https://github.com/rmcrkd/fell-runner.git
cd fell-runner
npm start            # serves the game at http://localhost:8080
npm test             # physics, weather, ghosts, and proof every level can be finished
```

You only need Node 20 or later, and only for the dev server and tests. The game itself is static files.

## How it's built

```
index.html, styles.css   menus, HUD and settings: accessible HTML over the canvas
src/
  player.js     Celeste-style controller (integer positions, sub-pixel remainders)
  run.js        one attempt: clock, cairns, splits, mint cakes, respawns, ghost recording
  weather.js    seeded wind, gusts, rain/sleet/snow, fog and grip
  render.js     procedural pixel art at 320×180: parallax fells, weather, the runner
  levels/       each fell is a plain-text map, one character per tile
  ghost.js      compact ghost recordings (5 bytes per physics step)
  input.js      keyboard, gamepad and touch, remappable
  audio.js      synthesised effects and wind, no audio files
tools/solver.js finds a route to the summit using the real physics
```

**Every level is proven beatable.** The test suite runs `tools/solver.js`, which drives the real `Player` physics through scripted runs, jumps, wall kicks, chimneys, climbs and dashes from every spot it can reach. It checks that each fell can be finished:

- with every vest in calm weather without dashing,
- into the strongest steady extreme headwind,
- in real seeded extreme storms.

A solved route is then replayed frame by frame through a real `Run` to the summit.

## Contributing

New fells, routes and fixes are welcome. Levels are just text, so [CONTRIBUTING.md](CONTRIBUTING.md) explains the tile key and how to check that your level is beatable.

## The real fells

Sharp Edge, Striding Edge and the Scafell massif are real places, and people are hurt on them every year, often in exactly the weather this game throws at you. On the real fells there are no respawns. Check a mountain forecast such as the [Lake District Weatherline](https://www.lakedistrictweatherline.co.uk/) or [MWIS](https://www.mwis.org.uk/), and carry the kit and skills to navigate.

> **In an emergency in the UK mountains, dial 999, ask for the Police, then Mountain Rescue.**

Lakeland's mountain rescue teams are unpaid volunteers, on call around the clock and funded mostly by donations. Fell Runner is free. If you enjoy it, please **[donate to Penrith Mountain Rescue Team](https://penrithmrt.org.uk/donate)**. The game offers the same link on its title screen, after every summit, and on its mountain-safety page.

<sub>Fell Runner is an unofficial fan project. It is not affiliated with or endorsed by Penrith Mountain Rescue Team, or by the makers of Celeste.</sub>

## Credits

- **Created by** Ryan McCrickerd, built with [Claude Code](https://claude.com/claude-code).
- **Movement** is modelled on [Celeste](https://www.celestegame.com/) by Maddy Thorson and Noel Berry. Its constants and techniques (coyote time, buffering, wall jumps, climbing stamina, dashes, supers and hypers) follow the [player controller they published](https://github.com/NoelFB/Celeste), and the assist mode follows Celeste's lead too.
- **Inspiration and real-world heroism:** [Penrith Mountain Rescue Team](https://penrithmrt.org.uk/) and every Lakeland mountain rescue team.
- **Forecast services** recommended in-game: the Lake District National Park's [Weatherline](https://www.lakedistrictweatherline.co.uk/) and [MWIS](https://www.mwis.org.uk/).
- **Algorithms:** Mulberry32 random numbers by Tommy Ettinger, and FNV-1a hashing by Glenn Fowler, Landon Curt Noll and Kiem-Phong Vo.
- **Tooling for this README:** accessibility audited with [axe-core](https://github.com/dequelabs/axe-core) by Deque, screenshots captured with [Puppeteer](https://pptr.dev/), and the GIF encoded with [gifenc](https://github.com/mattdesl/gifenc) by Matt DesLauriers. None of these ship with the game.

## Licence

[MIT](LICENSE) © Ryan McCrickerd
