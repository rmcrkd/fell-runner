// Captures the README's screenshots, banner and gameplay GIF from the real
// game: solved routes are played through the page frame by frame, so every
// image is genuine gameplay.
//
//   cd tools/browser && npm install && npm run capture
//
// Writes to docs/ (set OUT to write elsewhere).

import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import gifenc from 'gifenc';
import pngjs from 'pngjs';
import { DIFFICULTIES, VESTS, byId } from '../../src/config.js';
import { levelById } from '../../src/levels/index.js';
import { Run } from '../../src/run.js';
import { createWeather } from '../../src/weather.js';
import { solve } from '../solver.js';
import { ROOT, launch, openGame, serve, wait } from './lib.js';

const { GIFEncoder, applyPalette, quantize } = gifenc;
const { PNG } = pngjs;
const out = process.env.OUT ? resolve(process.env.OUT) : join(ROOT, 'docs');
const server = await serve();
const browser = await launch();

// First seed whose weather on this fell matches `want`
function findSeed(levelId, difficultyId, want) {
  const difficulty = byId(DIFFICULTIES, difficultyId);
  for (let seed = 1; seed < 5000; seed++) if (want(createWeather(seed, difficulty, levelId))) return seed;
  throw new Error('no matching seed');
}

// A reference route through the fell in that weather, and the frame at which
// the runner first reaches `place` (plus `after` frames).
function route({ levelId, difficultyId, seed, vestId }, place, after = 0) {
  const level = levelById(levelId);
  const vest = byId(VESTS, vestId);
  const difficulty = byId(DIFFICULTIES, difficultyId);
  const weather = createWeather(seed, difficulty, level.id);
  const { solved, inputs } = solve(level, { wind: weather.windAt, allowDash: true, fastest: true });
  if (!solved) throw new Error(`no route on ${levelId}`);
  const target = level.places.find((p) => p.name === place);
  const run = new Run({ level, vest, difficulty, seed });
  let frame = 0;
  for (const input of inputs) {
    run.update(input);
    if (run.player.x >= target.x) break;
  }
  frame = run.frames + after;
  return { inputs, frame };
}

async function playTo(page, setup, inputs, frame) {
  await page.evaluate(
    (setup, inputs) => {
      Object.assign(fellRunner.setup, setup);
      fellRunner.settings.showGhost = false;
      fellRunner.playScripted(inputs, { manualStepping: true });
    },
    setup,
    inputs,
  );
  // Step in chunks so the camera and HUD settle as they would in play
  for (let f = 0; f < frame; f += 30) await page.evaluate((n) => fellRunner.advance(n), Math.min(30, frame - f));
}

async function screenshot(name, { setup, place, after = 0, viewport = { width: 1280, height: 720 }, touch = false }) {
  const { page } = await openGame(browser, server.url, viewport);
  const { inputs, frame } = route(setup, place, after);
  if (touch) await page.evaluate(() => dispatchEvent(new Event('touchstart')));
  await playTo(page, setup, inputs, frame);
  await wait(100);
  await page.screenshot({ path: join(out, name) });
  await page.close();
  console.log('wrote', name);
}

// --- Gameplay screenshots, one per fell -----------------------------------

// The signposted opening at Scales, on a calm day, with a tip showing
const scales = { levelId: 'blencathra', difficultyId: 'none', vestId: 'ridgeline', seed: 1 };
await screenshot('scales.png', { setup: scales, place: 'Scales', after: 100 });

const blencathra = { levelId: 'blencathra', difficultyId: 'normal', vestId: 'ridgeline', seed: findSeed('blencathra', 'normal', (w) => w.precipType === 'rain' && w.precip > 0.3 && w.fog < 0.2 && w.dir > 0) };
await screenshot('blencathra.png', { setup: blencathra, place: 'Sharp Edge', after: 50 });

const helvellyn = { levelId: 'helvellyn', difficultyId: 'extreme', vestId: 'featherweight', seed: findSeed('helvellyn', 'extreme', (w) => w.precipType === 'rain' && w.precip > 0.8 && w.fog < 0.4 && w.base > 32) };
await screenshot('helvellyn.png', { setup: helvellyn, place: 'Striding Edge', after: 140 });

const scafell = { levelId: 'scafell', difficultyId: 'extreme', vestId: 'mountain', seed: findSeed('scafell', 'extreme', (w) => w.precipType === 'snow' && w.fog < 0.45 && w.base > 30) };
await screenshot('scafell.png', { setup: scafell, place: 'Summit boulder field', after: 90 });

await screenshot('phone.png', { setup: scafell, place: 'Hollow Stones', after: 200, viewport: { width: 844, height: 390, mobile: true, scale: 2 }, touch: true });

// --- Menus -------------------------------------------------------------------

{
  const { page } = await openGame(browser, server.url);
  await page.evaluate(() => fellRunner.showScreen('setup'));
  await wait(300);
  await page.screenshot({ path: join(out, 'setup.png') });
  await page.evaluate(() => fellRunner.showScreen('settings'));
  await wait(300);
  await page.screenshot({ path: join(out, 'settings.png') });
  await page.close();
  console.log('wrote setup.png, settings.png');
}

// --- Banner: a frame of Sharp Edge behind the title ------------------------

{
  const { page } = await openGame(browser, server.url, { width: 1280, height: 640 });
  const { inputs, frame } = route(blencathra, 'Sharp Edge', 110);
  await playTo(page, blencathra, inputs, frame);
  await page.evaluate(() => {
    document.body.classList.remove('playing');
    document.querySelector('#hud').hidden = true;
    const title = document.querySelector('#screen-title');
    title.hidden = false;
    title.querySelector('nav').hidden = true;
    title.querySelector('.donate-box').hidden = true;
    document.querySelector('#menus').classList.remove('empty');
    // Put the runner to the left of the title
    const r = fellRunner.renderer;
    r.camera.x += 120;
    r.draw({ run: fellRunner.run, time: fellRunner.run.time, dt: 0 });
  });
  await wait(200);
  await page.screenshot({ path: join(out, 'social-preview.png') });
  await page.close();
  console.log('wrote social-preview.png');
}

// --- Gameplay GIF: Striding Edge in a storm -----------------------------------

{
  const W = 640;
  const H = 360;
  const { page } = await openGame(browser, server.url, { width: W, height: H });
  const { inputs, frame } = route(helvellyn, 'Striding Edge', 0);
  await playTo(page, helvellyn, inputs, frame);
  const gif = GIFEncoder();
  const STEPS = 3; // 20 frames a second
  for (let i = 0; i < 160; i++) {
    await page.evaluate((n) => fellRunner.advance(n), STEPS);
    const png = PNG.sync.read(Buffer.from(await page.screenshot()));
    const palette = quantize(png.data, 128);
    gif.writeFrame(applyPalette(png.data, palette), W, H, { palette, delay: 50 });
  }
  gif.finish();
  writeFileSync(join(out, 'gameplay.gif'), gif.bytes());
  await page.close();
  console.log('wrote gameplay.gif');
}

await browser.close();
server.close();
