// Keyboard-only walkthrough: plays through every screen and action with key
// presses alone, logging where focus lands, and fails if focus is ever
// invisible or off screen, a screen can't be reached, or Escape misbehaves.
//
//   cd tools/browser && npm install && npm run keyboard [-- phone]

import { join } from 'node:path';
import { finishScripted, launch, openGame, outDir, serve, wait } from './lib.js';

const vp = process.argv[2] === 'phone' ? { width: 390, height: 844, mobile: true, scale: 2 } : { width: 1280, height: 720 };
const out = outDir('keyboard');
const server = await serve();
const browser = await launch();
const { page, errors } = await openGame(browser, server.url, vp);
const log = [];
const problems = [];
const focus = () =>
  page.evaluate(() => {
    const a = document.activeElement;
    if (!a || a === document.body) return { text: '(body)' };
    const label = a.getAttribute('aria-label') || a.textContent.trim().replace(/\s+/g, ' ').slice(0, 60) || a.value;
    const where = a.closest('.screen')?.id ?? (a.closest('#stage') ? 'stage' : '?');
    const cs = getComputedStyle(a);
    const ring = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2;
    const card = a.closest('.card');
    const cardRing = card && getComputedStyle(card).outlineStyle !== 'none';
    const heading = a.matches('h1, h2');
    const r = (card ?? a).getBoundingClientRect();
    const onScreen = r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    return { text: `${where} ${a.tagName.toLowerCase()}${a.type ? '[' + a.type + ']' : ''} "${label}"`, visible: ring || cardRing || heading, onScreen };
  });
const note = async (k, n) => {
  const f = await focus();
  log.push(`${k.padEnd(11)} -> ${f.text}${n ? '   # ' + n : ''}`);
  if (f.text !== '(body)' && !f.visible) problems.push(`no visible focus: ${f.text}`);
  if (f.text !== '(body)' && !f.onScreen) problems.push(`focus off screen: ${f.text}`);
  return f;
};
const key = async (k, n = '') => {
  const mods = k.split('+');
  const main = mods.pop();
  for (const m of mods) await page.keyboard.down(m);
  await page.keyboard.press(main);
  for (const m of mods.reverse()) await page.keyboard.up(m);
  await wait(120);
  return note(k, n);
};
const tabTo = async (text, max = 60) => {
  for (let i = 0; i < max; i++) {
    const f = await key('Tab');
    if (f.text.includes(text)) return f;
  }
  problems.push(`could not reach "${text}" by Tab`);
};
const screen = () => page.evaluate(() => [...document.querySelectorAll('.screen')].find((s) => !s.hidden)?.id ?? (fellRunner.run ? 'in run' : 'none'));
const shot = (name) => page.screenshot({ path: join(out, `${process.argv[2] ?? 'desktop'}-${name}.png`) });
const expect = async (want, what) => {
  const got = await screen();
  log.push(`   screen: ${got}`);
  if (got !== want) problems.push(`${what}: expected ${want}, got ${got}`);
};

await note('(load)');
await expect('screen-title', 'load');
for (let i = 0; i < 7; i++) await key('Tab');
await shot('title-focus');
await key('Shift+Tab', 'back from the end');

// Every secondary screen opens, and Escape returns to the title
for (const name of ['How to play', 'Settings & accessibility', 'Real fells', 'Credits']) {
  await tabTo(name);
  await key('Enter', `open ${name}`);
  await key('Escape', 'back');
  await expect('screen-title', `Escape from ${name}`);
}

// Play: choose fell, vest and weather with arrow keys, edit the seed, start
await tabTo('Play');
await key('Enter', 'Play');
await expect('screen-setup', 'Play');
await key('Tab', 'first fell');
await key('ArrowRight', 'next fell');
log.push('   fell now ' + (await page.evaluate(() => fellRunner.setup.levelId)));
await key('Tab', 'vests');
await key('ArrowRight', 'next vest');
await key('Tab', 'weather');
await key('ArrowLeft', 'previous weather');
await key('Tab', 'seed box');
await page.keyboard.type('LAKES');
log.push('   seed now ' + (await page.evaluate(() => fellRunner.setup.seed)));
await shot('setup-focus');
await tabTo('Start run');
await key('Enter', 'Start run');
await expect('in run', 'Start run');

await page.keyboard.down('ArrowRight');
await wait(500);
await page.keyboard.press('KeyC');
await wait(500);
await page.keyboard.up('ArrowRight');
log.push('   player x ' + (await page.evaluate(() => fellRunner.run.player.x)) + ', clock ' + (await page.evaluate(() => fellRunner.run.frames)));
await key('KeyI', 'status read-out');
await wait(200);
const said = await page.evaluate(() => document.querySelector('#announcer').textContent);
log.push('   announcer: ' + said);
if (!said) problems.push('status read-out said nothing');

await key('Escape', 'pause');
await expect('screen-pause', 'pause');
await shot('pause-focus');
await tabTo('Settings');
await key('Enter', 'settings from pause');
await expect('screen-settings', 'settings from pause');
await tabTo('Change key for Jump');
await key('Enter', 'listen for key');
await key('KeyV', 'press V');
log.push('   jump keys ' + (await page.evaluate(() => fellRunner.settings.bindings?.jump?.join(','))));
await key('Tab', 'gamepad change');
await key('Enter', 'listen for button');
await key('Escape', 'cancel');
await expect('screen-settings', 'Escape cancels a gamepad remap');
await tabTo('Reset keys');
await key('Enter', 'reset keys');
await shot('settings-focus');
await key('Escape', 'back to pause');
await expect('screen-pause', 'Escape from settings while paused');
await key('Escape', 'resume');
await expect('in run', 'Escape resumes');

// Finish with a scripted route, then use results and replay by keyboard
log.push('   scripted finish ' + JSON.stringify(await finishScripted(page)));
await wait(300);
await note('(results)');
await expect('screen-results', 'finish');
const first = await key('Tab', 'first stop after the heading');
if (!first.text.includes('Run it again')) problems.push(`results: first Tab reached ${first.text}, not Run it again`);
await tabTo('Watch this run');
await key('Enter', 'watch this run');
await expect('in run', 'replay');
await note('(replay)', 'focus should be on Stop replay');
await wait(1500);
await shot('replay');
log.push('   replay frame ' + (await page.evaluate(() => fellRunner.run.frames)));
await key('Enter', 'stop replay');
await expect('screen-results', 'stop replay returns to results');
await key('KeyR', 'restart key runs it again');
await expect('in run', 'R from results');
if (await page.evaluate(() => fellRunner.run.frames)) problems.push('R from results: the new run has already started its clock');
log.push('   scripted finish ' + JSON.stringify(await finishScripted(page)));
await wait(300);
await expect('screen-results', 'finish again');
// With restart remapped to Enter, Enter on a results button still presses it
await page.evaluate(() => (fellRunner.settings.bindings = { restart: ['Enter'] }));
await tabTo('Change fell or vest');
await key('Enter', 'back to setup');
await expect('screen-setup', 'change fell');
await tabTo('Watch best run');
await key('Enter', 'watch best run');
await expect('in run', 'best replay');
await key('Escape', 'stop with Escape');
await expect('screen-setup', 'Escape stops replay and returns to setup');
await key('Escape', 'back to title');
await expect('screen-title', 'Escape from setup');

for (const e of errors) problems.push(e);
console.log(log.join('\n'));
await browser.close();
server.close();
console.log(`\nScreenshots in ${out}`);
if (problems.length) {
  console.log(`\n${problems.length} problems:\n${problems.join('\n')}`);
  process.exit(1);
}
console.log('Keyboard walkthrough passed.');
