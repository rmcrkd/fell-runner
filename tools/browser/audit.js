// Visits every screen at desktop and phone sizes, in the normal and the
// high-contrast theme. For each it runs axe-core (WCAG 2.2 A/AA and best
// practice), checks for horizontal overflow (WCAG reflow) and console errors,
// and saves a screenshot. Exits non-zero if anything fails.
//
//   cd tools/browser && npm install && npm run audit

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { VIEWPORTS, finishScripted, launch, openGame, outDir, serve, wait } from './lib.js';

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const out = outDir('audit');
const MENUS = ['title', 'setup', 'settings', 'howto', 'safety', 'credits'];
const RULES = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

const server = await serve();
const browser = await launch();
const failures = [];
let checks = 0;

for (const theme of ['normal', 'contrast']) {
  for (const vp of VIEWPORTS) {
    const { page, errors } = await openGame(browser, server.url, vp);
    await page.addScriptTag({ content: axeSource });
    if (theme === 'contrast') {
      await page.evaluate(() => {
        fellRunner.settings.highContrast = true;
        document.body.classList.add('contrast');
        fellRunner.renderer.refreshPalette();
      });
    }
    const check = async (name) => {
      await wait(250);
      await page.screenshot({ path: join(out, `${theme}-${vp.name}-${name}.png`) });
      const violations = await page.evaluate(async (rules) => {
        const r = await axe.run(document, { runOnly: rules });
        return r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
      }, RULES);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.querySelector('#menus').scrollWidth > document.querySelector('#menus').clientWidth + 1);
      checks++;
      for (const v of violations) failures.push(`${theme} ${vp.name} ${name}: ${v}`);
      if (overflow) failures.push(`${theme} ${vp.name} ${name}: scrolls sideways`);
    };

    for (const screen of MENUS) {
      await page.evaluate((s) => fellRunner.showScreen(s), screen);
      await check(screen);
    }
    await page.evaluate(() => fellRunner.startRun());
    await check('playing');
    await page.keyboard.press('Escape');
    await check('pause');
    await finishScripted(page);
    await check('results');
    await page.click('#results-replay');
    await wait(1500);
    await check('replay');
    await page.click('#replay-stop');
    await page.evaluate(() => {
      dispatchEvent(new Event('touchstart'));
      fellRunner.startRun();
    });
    await check('touch');
    for (const e of errors) failures.push(`${theme} ${vp.name}: ${e}`);
    await page.close();
  }
}

await browser.close();
server.close();
console.log(`${checks} screens checked; screenshots in ${out}`);
if (failures.length) {
  console.log(`\n${failures.length} problems:\n${failures.join('\n')}`);
  process.exit(1);
}
console.log('No axe violations, overflow or console errors.');
