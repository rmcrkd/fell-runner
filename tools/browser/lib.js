// Shared helpers for the dev-only browser tools: serve the game locally and
// drive it in headless Chrome with puppeteer-core.
//
// Chrome: set CHROME_PATH, or the usual install locations are tried.
// Output: set OUT, or files go to .scratch/<tool>/ (gitignored).

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SCRATCH = join(ROOT, '.scratch');

export function outDir(tool) {
  const dir = process.env.OUT ? resolve(process.env.OUT) : join(SCRATCH, tool);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export async function serve(port = 8200 + Math.floor(Math.random() * 500)) {
  const proc = spawn(process.execPath, [join(ROOT, 'tools/serve.js')], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((res) => proc.stdout.once('data', res));
  // Never leave the server running if a script crashes
  process.on('exit', () => proc.kill());
  process.on('uncaughtException', (e) => {
    console.error(e);
    proc.kill();
    process.exit(1);
  });
  return { url: `http://localhost:${port}/`, close: () => proc.kill() };
}

const CHROMES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];

export async function launch() {
  const executablePath = process.env.CHROME_PATH ?? CHROMES.find((p) => existsSync(p));
  if (!executablePath) throw new Error('Chrome not found: set CHROME_PATH');
  // Keep Chrome's profile, cache and crash dumps inside .scratch/
  const profile = join(SCRATCH, 'chrome-profile');
  mkdirSync(profile, { recursive: true });
  return puppeteer.launch({
    executablePath,
    headless: true,
    userDataDir: profile,
    args: [`--disk-cache-dir=${join(SCRATCH, 'chrome-cache')}`, '--disable-breakpad', '--no-first-run', '--no-default-browser-check', '--mute-audio', '--use-mock-keychain', '--password-store=basic'],
  });
}

// Opens the game with empty storage and returns the page plus a live list of
// console errors, warnings, page errors and failed requests. Content-Security-
// Policy violations show up as console errors, so every tool checks the policy
// too, except the audit, which has to inject axe-core (`bypassCSP`).
export async function openGame(browser, url, { width = 1280, height = 720, mobile = false, scale = 1, query = '', bypassCSP = false } = {}) {
  const page = await browser.newPage();
  if (bypassCSP) await page.setBypassCSP(true);
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()}`));
  await page.setViewport({ width, height, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: scale });
  await page.goto(url + query, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(url + query, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => globalThis.fellRunner);
  return { page, errors };
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 720 },
  { name: 'phone-portrait', width: 390, height: 844, mobile: true, scale: 2 },
  { name: 'phone-landscape', width: 844, height: 390, mobile: true, scale: 2 },
  { name: 'reflow-320', width: 320, height: 640, mobile: true, scale: 2 },
];

// Finishes calm Blencathra instantly with a solved route, leaving the game on
// its results screen and running in real time again.
export function finishScripted(page) {
  return page.evaluate(async () => {
    const { levelById } = await import('./src/levels/index.js');
    const { solve } = await import('./tools/solver.js');
    Object.assign(fellRunner.setup, { levelId: 'blencathra', difficultyId: 'none', vestId: 'ridgeline' });
    const r = solve(levelById('blencathra'), { allowDash: true });
    fellRunner.playScripted(r.inputs, { manualStepping: true });
    const result = fellRunner.advance(r.inputs.length + 5);
    fellRunner.resumeLoop();
    return result;
  });
}
