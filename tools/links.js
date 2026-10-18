// Checks that every external link the game and README offer still works:
// above all the Penrith MRT donation page and the mountain forecasts, so the
// game never sends anyone to a dead or hijacked page. Run monthly in CI.
//
//   npm run links

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['index.html', 'README.md', 'CONTRIBUTING.md', 'SECURITY.md', '.github/FUNDING.yml'];
// Links that must never move to another site: if they redirect off their
// own domain, that's worth a human look.
const MUST_STAY = ['https://penrithmrt.org.uk/'];

const urls = new Set();
for (const file of FILES) {
  const text = readFileSync(join(ROOT, file), 'utf8');
  for (const [url] of text.matchAll(/https:\/\/[^\s"'<>)\]`]+/g)) {
    // The live game and badges are checked by being deployed and viewed
    if (/img\.shields\.io|rmcrkd\.github\.io|github\.com\/rmcrkd\/fell-runner\/(actions|blob)/.test(url)) continue;
    urls.add(url.replace(/[.,;]+$/, ''));
  }
}

async function check(url) {
  const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (fell-runner link check)' }, signal: AbortSignal.timeout(20000) });
  const moved = MUST_STAY.some((p) => url.startsWith(p)) && !res.url.startsWith(new URL(url).origin);
  return { ok: res.ok && !moved, status: moved ? `moved to ${res.url}` : res.status };
}

let failed = 0;
for (const url of [...urls].sort()) {
  let result;
  try {
    result = await check(url);
  } catch (e) {
    result = { ok: false, status: e.name === 'TimeoutError' ? 'timed out' : e.message };
  }
  if (!result.ok) failed++;
  console.log(`${result.ok ? '✔' : '✖'} ${result.status}  ${url}`);
}
console.log(failed ? `\n${failed} of ${urls.size} links need a look.` : `\nAll ${urls.size} links work.`);
process.exitCode = failed ? 1 : 0;
