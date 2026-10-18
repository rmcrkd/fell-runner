import { Audio, CAPTIONS } from './audio.js';
import { FixedClock } from './clock.js';
import { DIFFICULTIES, STEP, VESTS, byId } from './config.js';
import { ACTION_LABELS, ACTIONS, DEFAULT_BINDINGS, DEFAULT_PAD_BINDINGS, Input, PAD_ACTIONS, keyName, padName } from './input.js';
import { LEVELS, levelById } from './levels/index.js';
import { NO_INPUT, ST } from './player.js';
import { Renderer } from './render.js';
import { Replay } from './replay.js';
import { RouteMap } from './routemap.js';
import { codeToSeed, dailySeed, randomSeed, seedToCode } from './rng.js';
import { Run, formatTime, isAssisted, speakTime } from './run.js';
import { clearRecords, getGhost, getRecord, loadLastSetup, loadSettings, saveLastSetup, saveSettings, submitRun } from './storage.js';
import { createWeather, toMph, windWord } from './weather.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const settings = loadSettings();
const input = new Input(settings);
const audio = new Audio(settings);
const renderer = new Renderer($('#game'), settings);

// ---------------------------------------------------------------------------
// Setup state, from the URL (challenge links), then last time, then defaults

const setup = initialSetup();

function initialSetup() {
  const last = loadLastSetup() ?? {};
  const params = new URLSearchParams(location.search);
  const seedParam = params.get('seed');
  return {
    levelId: levelById(params.get('fell') ?? last.levelId).id,
    vestId: byId(VESTS, params.get('vest') ?? last.vestId ?? 'ridgeline').id,
    difficultyId: byId(DIFFICULTIES, params.get('weather') ?? last.difficultyId ?? 'normal').id,
    seed: (seedParam && codeToSeed(seedParam)) ?? randomSeed(),
    fromLink: !!seedParam,
  };
}

const currentLevel = () => levelById(setup.levelId);
const currentVest = () => byId(VESTS, setup.vestId);
const currentDifficulty = () => byId(DIFFICULTIES, setup.difficultyId);

function assistFromSettings() {
  return {
    speed: Number(settings.speed),
    infiniteStamina: settings.infiniteStamina,
    dashMode: settings.dashMode,
    invincible: settings.invincible,
  };
}

// ---------------------------------------------------------------------------
// Screens and focus

let mode = 'menu'; // menu | playing | paused | results | replay
let run = null;
const screenStack = [];

function showScreen(id, { push = true } = {}) {
  cancelCapture();
  const current = $$('.screen').find((s) => !s.hidden);
  if (push && current && current.id !== `screen-${id}`) screenStack.push(current.id.replace('screen-', ''));
  $$('.screen').forEach((s) => (s.hidden = s.id !== `screen-${id}`));
  $('#menus').classList.toggle('empty', !id);
  const screen = $(`#screen-${id}`);
  if (!screen) return;
  if (id === 'setup') renderSetup();
  if (id === 'settings') renderSettings();
  const heading = $('h1, h2', screen);
  heading?.focus({ preventScroll: true });
  screen.scrollTop = 0;
  $('#menus').scrollTop = 0;
}

// Leaving the controls table abandons any half-finished remap, so it can't
// grab a key or button later.
function cancelCapture() {
  input.capture = null;
  input.padCapture = null;
}

function hideScreens() {
  cancelCapture();
  $$('.screen').forEach((s) => (s.hidden = true));
  $('#menus').classList.add('empty');
  screenStack.length = 0;
}

function back() {
  if (mode === 'paused' && screenStack.length === 0) return resume();
  const prev = screenStack.pop() ?? (mode === 'paused' ? 'pause' : 'title');
  showScreen(prev, { push: false });
}

document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (go) {
    audio.unlock();
    audio.play('ui');
    if (go.dataset.go === 'title' && mode !== 'menu') quitToMenu();
    else showScreen(go.dataset.go);
  }
  if (e.target.closest('[data-back]')) back();
});

document.addEventListener('keydown', (e) => {
  audio.unlock();
  if (e.key === 'Escape' && mode !== 'playing' && mode !== 'replay' && !input.capture && !input.padCapture) {
    const visible = $$('.screen').find((s) => !s.hidden);
    if (visible && visible.id !== 'screen-title' && visible.id !== 'screen-results') {
      e.preventDefault();
      back();
    }
  }
});

const announcer = $('#announcer');
function announce(text, { force = false } = {}) {
  if (!settings.announce && !force) return;
  announcer.textContent = '';
  setTimeout(() => (announcer.textContent = text), 50);
}

// ---------------------------------------------------------------------------
// Run setup screen

function radioCard(name, value, checked, inner) {
  const label = document.createElement('label');
  label.className = 'card';
  const inputEl = document.createElement('input');
  inputEl.type = 'radio';
  inputEl.name = name;
  inputEl.value = value;
  inputEl.checked = checked;
  label.append(inputEl);
  label.insertAdjacentHTML('beforeend', inner);
  return label;
}

// Unassisted and assisted bests side by side: assisted times are kept apart,
// not hidden.
function bestLine(levelKey) {
  const parts = DIFFICULTIES.map((d) => {
    const rec = getRecord(levelKey, d.id);
    return `${d.name}: ${rec?.best ? formatTime(rec.best.frames) : '–'}`;
  });
  const assisted = DIFFICULTIES.map((d) => [d, getRecord(levelKey, d.id, true)])
    .filter(([, rec]) => rec?.best)
    .map(([d, rec]) => `${d.name}: ${formatTime(rec.best.frames)}`);
  return `Best · ${parts.join(' · ')}${assisted.length ? `<br>Assisted · ${assisted.join(' · ')}` : ''}`;
}

function renderSetup() {
  const levels = $('#pick-level');
  levels.replaceChildren(
    ...LEVELS.map((l) =>
      radioCard(
        'level',
        l.id,
        l.id === setup.levelId,
        `<span class="card-title">${l.def.name}</span>
         <span class="card-sub">${l.def.route} · ${l.def.heightM} m · ${'▲'.repeat(l.def.grade)}<span class="sr-only"> difficulty ${l.def.grade} of 3</span></span>
         <span class="card-body">${l.def.blurb}</span>
         <span class="card-best">${bestLine(l.key)}</span>`,
      ),
    ),
  );

  const pct = (v) => Math.round(v * 100);
  const bar = (label, value, max, text) =>
    `<span aria-hidden="true">${label}</span><span class="bar" aria-hidden="true"><span style="width:${Math.min(100, (value / max) * 100)}%"></span></span><span class="sr-only">${label}: ${text}.</span>`;
  $('#pick-vest').replaceChildren(
    ...VESTS.map((v) =>
      radioCard(
        'vest',
        v.id,
        v.id === setup.vestId,
        `<span class="card-title"><span class="vest-swatch" style="background:${v.colour}" aria-hidden="true"></span>${v.name}</span>
         <span class="card-body">${v.blurb}</span>
         <span class="stats-bars">
           ${bar('Speed', v.runMult, 1.1, `${pct(v.runMult)}%`)}
           ${bar('Stamina', v.staminaMult, 1.5, `${pct(v.staminaMult)}%`)}
           ${bar('Wind grip', 1 / v.windMult, 1.7, v.windMult > 1 ? 'blown about more' : v.windMult < 1 ? 'steadier in wind' : 'normal')}
           ${bar('Dashes', v.dashes, 2, `${v.dashes}`)}
         </span>`,
      ),
    ),
  );

  $('#pick-difficulty').replaceChildren(
    ...DIFFICULTIES.map((d) =>
      radioCard('difficulty', d.id, d.id === setup.difficultyId, `<span class="card-title">${d.name}</span><span class="card-body">${d.blurb}</span>`),
    ),
  );

  $('#seed-input').value = seedToCode(setup.seed);
  $('#setup-ghost').checked = settings.showGhost;
  updateForecast();
}

function updateForecast() {
  const weather = createWeather(setup.seed, currentDifficulty(), setup.levelId);
  $('#forecast').textContent = weather.describe();
  const ghost = getGhost(currentLevel().key, setup.difficultyId);
  const ghostBtn = $('#seed-ghost');
  ghostBtn.hidden = !ghost || ghost.seed === setup.seed;
  if (ghost) ghostBtn.dataset.seed = ghost.seed;
  $('#setup-replay').hidden = !bestGhost();
  saveLastSetup({ levelId: setup.levelId, vestId: setup.vestId, difficultyId: setup.difficultyId });
  refreshAttract();
}

$('#setup-form').addEventListener('change', (e) => {
  const t = e.target;
  if (t.name === 'level') setup.levelId = t.value;
  if (t.name === 'vest') setup.vestId = t.value;
  if (t.name === 'difficulty') setup.difficultyId = t.value;
  if (t.id === 'setup-ghost') {
    settings.showGhost = t.checked;
    saveSettings(settings);
  }
  if (t.name !== 'seed') updateForecast();
});

$('#seed-input').addEventListener('input', (e) => {
  const seed = codeToSeed(e.target.value);
  if (seed != null) {
    setup.seed = seed;
    updateForecast();
  }
});

$('#seed-random').addEventListener('click', () => setSeed(randomSeed()));
$('#seed-daily').addEventListener('click', () => setSeed(dailySeed()));
$('#seed-ghost').addEventListener('click', (e) => setSeed(Number(e.currentTarget.dataset.seed)));

function setSeed(seed) {
  setup.seed = seed;
  $('#seed-input').value = seedToCode(seed);
  updateForecast();
  announce(`Seed ${seedToCode(seed).split('').join(' ')}. ${$('#forecast').textContent}`);
}

$('#setup-form').addEventListener('submit', (e) => {
  e.preventDefault();
  startRun();
});

// ---------------------------------------------------------------------------
// Settings screen

const settingsForm = $('#settings-form');

function renderSettings() {
  for (const el of settingsForm.elements) {
    if (!el.name || !(el.name in settings)) continue;
    const v = settings[el.name];
    if (el.type === 'checkbox') el.checked = !!v;
    else if (el.type === 'radio') el.checked = String(v) === el.value;
    else el.value = String(v);
  }
  $('#set-fog-out').textContent = `${Math.round(settings.fogLimit * 100)}%`;
  renderBindings();
}

function renderBindings() {
  const bindings = input.bindings;
  const pads = settings.padBindings ?? DEFAULT_PAD_BINDINGS;
  $('#bindings-body').replaceChildren(
    ...ACTIONS.map((action) => {
      const tr = document.createElement('tr');
      const label = ACTION_LABELS[action];
      const keys = bindings[action].map(keyName).join(', ') || 'unbound';
      const remappable = PAD_ACTIONS.includes(action);
      const buttons = remappable ? (pads[action] ?? []).map(padName).join(', ') || 'unbound' : 'Stick or d-pad';
      tr.innerHTML = `<th scope="row">${label}</th>
        <td><kbd>${keys}</kbd> <button type="button" class="change-key" aria-label="Change key for ${label}, currently ${keys}">Change</button></td>
        <td><kbd>${buttons}</kbd>${remappable ? ` <button type="button" class="change-pad" aria-label="Change gamepad button for ${label}, currently ${buttons}">Change</button>` : ''}</td>`;
      $('.change-key', tr).addEventListener('click', (e) => listenForKey(action, e.currentTarget));
      $('.change-pad', tr)?.addEventListener('click', (e) => listenForPad(action, e.currentTarget));
      return tr;
    }),
  );
}

function listenForKey(action, button) {
  button.textContent = 'Press a key…';
  button.classList.add('listening');
  announce(`Press a key for ${ACTION_LABELS[action]}, or Escape to cancel.`);
  input.capture = (code) => {
    button.classList.remove('listening');
    if (code !== 'Escape' || action === 'pause') {
      const next = structuredClone(input.bindings);
      // A key can only do one thing: remove it from any other action first
      for (const a of ACTIONS) next[a] = next[a].filter((k) => k !== code);
      next[action] = [code, ...next[action]].slice(0, 3);
      settings.bindings = next;
      saveSettings(settings);
      announce(`${ACTION_LABELS[action]} set to ${keyName(code)}.`);
    }
    renderBindings();
    $$('#bindings-body .change-key')[ACTIONS.indexOf(action)]?.focus();
  };
}

function listenForPad(action, button) {
  button.textContent = 'Press a button…';
  button.classList.add('listening');
  announce(`Press a gamepad button for ${ACTION_LABELS[action]}, or Escape to cancel.`);
  input.padCapture = (index) => {
    if (index != null) {
      const next = structuredClone({ ...DEFAULT_PAD_BINDINGS, ...(settings.padBindings ?? {}) });
      for (const a of PAD_ACTIONS) next[a] = next[a].filter((b) => b !== index);
      next[action] = [index];
      settings.padBindings = next;
      saveSettings(settings);
      announce(`${ACTION_LABELS[action]} set to ${padName(index)}.`);
    }
    renderBindings();
    $$('#bindings-body .change-pad')[PAD_ACTIONS.indexOf(action)]?.focus();
  };
}

$('#bindings-reset').addEventListener('click', () => {
  settings.bindings = null;
  settings.padBindings = null;
  saveSettings(settings);
  renderBindings();
  announce('Keys and gamepad buttons reset to defaults.');
});

settingsForm.addEventListener('input', (e) => {
  const el = e.target;
  if (!el.name || !(el.name in settings)) return;
  let value;
  if (el.type === 'checkbox') value = el.checked;
  else if (el.type === 'range' || el.name === 'speed' || el.name === 'hudScale') value = Number(el.value);
  else value = el.value;
  settings[el.name] = value;
  if (el.name === 'fogLimit') $('#set-fog-out').textContent = `${Math.round(value * 100)}%`;
  saveSettings(settings);
  applySettings();
});

$('#clear-records').addEventListener('click', () => {
  if (confirm('Delete all best times and ghosts stored in this browser? This cannot be undone.')) {
    clearRecords();
    announce('All best times and ghosts deleted.');
  }
});

function applySettings() {
  document.documentElement.style.setProperty('--hud', settings.hudScale);
  document.body.classList.toggle('contrast', settings.highContrast);
  renderer.refreshPalette();
  audio.applyVolume();
  hud.route.hidden = !settings.showRouteMap;
}

// ---------------------------------------------------------------------------
// Playing

const hud = {
  root: $('#hud'),
  time: $('#hud-time'),
  split: $('#hud-split'),
  deaths: $('#hud-deaths'),
  assist: $('#hud-assist'),
  windArrow: $('#hud-wind-arrow'),
  windWord: $('#hud-wind-word'),
  windDetail: $('#hud-wind-detail'),
  gust: $('#hud-gust'),
  gustText: $('#hud-gust-text'),
  gustFill: $('#hud-gust-fill'),
  dashes: $('#hud-dashes'),
  stamina: $('#hud-stamina'),
  staminaFill: $('#hud-stamina-fill'),
  banner: $('#hud-banner'),
  caption: $('#hud-caption'),
  place: $('#hud-place'),
  shelter: $('#hud-wind-shelter'),
  route: $('#hud-route'),
  replay: $('#hud-replay'),
};

const routeMap = new RouteMap(hud.route);

let ghostRecord = null;
let bannerTimer = 0;
let splitTimer = 0;
let captionTimer = 0;
let placeTimer = 0;
let placeIndex = 0;
let warnedGust = -1;
const clock = new FixedClock();

function startRun() {
  audio.unlock();
  scripted = null;
  const level = currentLevel();
  const difficulty = currentDifficulty();
  const assist = assistFromSettings();
  const assistedBucket = isAssisted(assist);
  const ghost = settings.showGhost ? getGhost(level.key, difficulty.id, assistedBucket) : null;
  ghostRecord = getRecord(level.key, difficulty.id, assistedBucket);
  run = new Run({ level, vest: currentVest(), difficulty, seed: setup.seed, assist, ghost: ghost?.data ?? null });
  beginView(level, run.weather, currentVest());
  renderer.updateCamera(cameraTarget(), 0, true);
  mode = 'playing';
  input.gameActive = true;
  input.resetGameState();
  clock.reset();
  warnedGust = -1;
  hideScreens();
  hud.assist.hidden = !run.assisted;
  $('#game').setAttribute('aria-label', `${level.def.name}, ${level.def.route}. ${run.weather.describe()}.`);
  showBanner(`${level.def.name} <small>${level.def.route} · ${run.weather.describe()} · seed ${seedToCode(setup.seed)}</small>`, 3.5);
  announce(`${level.def.name} ${level.def.route}. ${run.weather.describe()}. The clock starts when you move.`);
  updateTouchVisibility();
}

// Shared by live runs and replays: fresh renderer, HUD and route map.
function beginView(level, weather, vest) {
  renderer.setLevel(level, weather);
  setVestColours(vest);
  routeMap.setLevel(level);
  hud.route.hidden = !settings.showRouteMap;
  hud.root.hidden = false;
  hud.split.hidden = true;
  hud.place.hidden = true;
  hud.caption.hidden = true;
  captionTimer = 0;
  hud.replay.hidden = true;
  hud.dashes.hidden = false;
  $('#replay-stop').hidden = true;
  placeIndex = 0;
}

// ---------------------------------------------------------------------------
// Replays: watch a saved ghost, or the run you just finished, in its weather

let replayFrom = null;

function watchReplay({ level, ghost, difficulty, seed, vest, label }) {
  audio.unlock();
  replayFrom = { screen: $('#screen-results').hidden ? 'setup' : 'results', run };
  run = new Replay({ level, ghost, difficulty, seed, vest });
  beginView(level, run.weather, vest);
  hud.dashes.hidden = true;
  hud.stamina.hidden = true;
  hud.assist.hidden = true;
  hud.gust.hidden = true;
  hud.replay.hidden = false;
  renderer.updateCamera(cameraTarget(), 0, true);
  mode = 'replay';
  input.gameActive = true;
  input.resetGameState();
  clock.reset();
  hideScreens();
  const stop = $('#replay-stop');
  stop.hidden = false;
  stop.focus();
  showBanner(`Replay: ${label} <small>${level.def.name} · ${vest.name} · weather: ${difficulty.name} · seed ${seedToCode(seed)}</small>`, 4);
  announce(`Replay of ${label} on ${level.def.name}. Press Stop replay, or pause, to stop.`);
  updateTouchVisibility();
}

function replayStep() {
  run.update();
  const g = run.pose();
  if (g) checkPlace(g.x);
  for (const e of run.events) {
    audio.play(e.type);
    if (e.type === 'finish') return stopReplay();
  }
}

function stopReplay() {
  if (mode !== 'replay') return;
  $('#replay-stop').hidden = true;
  input.gameActive = false;
  hud.root.hidden = true;
  const from = replayFrom;
  replayFrom = null;
  if (from.screen === 'results') {
    run = from.run;
    mode = 'results';
    updateTouchVisibility();
    showScreen('results', { push: false });
  } else {
    run = null;
    mode = 'menu';
    updateTouchVisibility();
    refreshAttract();
    screenStack.length = 0;
    screenStack.push('title');
    showScreen('setup', { push: false });
  }
}

$('#replay-stop').addEventListener('click', stopReplay);

function bestGhost() {
  return getGhost(currentLevel().key, setup.difficultyId) ?? getGhost(currentLevel().key, setup.difficultyId, true);
}

$('#setup-replay').addEventListener('click', () => {
  const ghost = bestGhost();
  if (!ghost) return;
  watchReplay({ level: currentLevel(), ghost: ghost.data, difficulty: currentDifficulty(), seed: ghost.seed, vest: byId(VESTS, ghost.vest), label: 'your best run' });
});

$('#results-replay').addEventListener('click', () => {
  watchReplay({ level: run.level, ghost: run.recorder.encode(), difficulty: run.difficulty, seed: run.seed, vest: run.vest, label: 'this run' });
});

function setVestColours(vest) {
  renderer.vestColour = vest.colour;
  renderer.vestTrim = vest.trim;
}

function cameraTarget() {
  if (run.replay) {
    const g = run.pose();
    return { x: g.x + 4 + g.facing * 20, y: g.y - 5 };
  }
  const p = run.player;
  return { x: p.x + 4 + p.facing * 20 + p.vx * 0.12, y: p.y + 5 - 10 };
}

function pause() {
  if (mode !== 'playing') return;
  mode = 'paused';
  input.gameActive = false;
  const level = run.level;
  $('#pause-info').textContent = `${level.def.name} · ${formatTime(run.frames)} · seed ${seedToCode(run.seed)}`;
  showScreen('pause', { push: false });
  screenStack.length = 0;
  updateTouchVisibility();
}

function resume() {
  if (mode !== 'paused') return;
  // Settings may have changed while paused
  const assist = assistFromSettings();
  run.assist = assist;
  run.player.assist = assist;
  if (isAssisted(assist)) run.assisted = true;
  hud.assist.hidden = !run.assisted;
  mode = 'playing';
  input.gameActive = true;
  input.resetGameState();
  hideScreens();
  updateTouchVisibility();
}

function restart() {
  if (!run) return;
  startRun();
}

function quitToMenu() {
  mode = 'menu';
  run = null;
  input.gameActive = false;
  hud.root.hidden = true;
  updateTouchVisibility();
  refreshAttract();
  screenStack.length = 0;
  showScreen('title', { push: false });
}

input.onAction = (action) => {
  if (action === 'pause') {
    if (mode === 'playing') pause();
    else if (mode === 'paused') resume();
    else if (mode === 'replay') stopReplay();
  }
  if (action === 'restart' && mode === 'playing') restart();
  if (action === 'status' && (mode === 'playing' || mode === 'replay')) announce(statusText(), { force: true });
};

$('#pause-resume').addEventListener('click', resume);
$('#pause-restart').addEventListener('click', restart);
$('#pause-quit').addEventListener('click', quitToMenu);

addEventListener('blur', () => pause());
document.addEventListener('visibilitychange', () => document.hidden && pause());

// Scripted input replaces the controls for automated captures and tests.
let scripted = null;
let manual = false;

function step() {
  if (run.replay) return replayStep();
  const inp = scripted ? (scripted.shift() ?? NO_INPUT) : input.sample();
  run.update(inp);
  checkPlace(run.player.x);
  renderer.handleEvents(run.events, run.player);
  for (const e of run.events) {
    audio.play(e.type);
    if (settings.captions && CAPTIONS[e.type]) showCaption(CAPTIONS[e.type]);
    if (e.type === 'checkpoint') onCheckpoint(e);
    if (e.type === 'finish') return finishRun();
  }
}

// The real place names along the route, shown as you reach each one.
function checkPlace(x) {
  const places = run.level.places;
  let i = placeIndex;
  while (i + 1 < places.length && x >= places[i + 1].x) i++;
  if (i === placeIndex) return;
  const changed = places[i].name !== places[placeIndex].name;
  placeIndex = i;
  if (!changed) return;
  hud.place.textContent = places[i].name;
  hud.place.hidden = false;
  placeTimer = 2.5;
  announce(places[i].name);
}

// A spoken summary on demand, for players who can't see the HUD.
function statusText() {
  const parts = [`${speakTime(run.frames)}`];
  const place = run.level.places[placeIndex]?.name;
  if (place) parts.push(place);
  const next = run.level.cairns[run.checkpoint.index + 1];
  parts.push(next ? `Next cairn: ${next.name}` : 'Next: the summit');
  const wind = feltWind();
  parts.push(Math.abs(wind) < 4 ? 'Calm' : `${windWord(wind)}, ${toMph(wind)} miles an hour from the ${wind > 0 ? 'west' : 'east'}${exposure() < 0.6 ? ', sheltered' : ''}`);
  const gust = run.started && !run.replay ? run.weather.nextGust(run.time, 3) : null;
  if (gust) parts.push(`Gust from the ${gust.dir > 0 ? 'west' : 'east'} in ${Math.max(0, gust.in).toFixed(1)} seconds`);
  const p = run.player;
  if (p) {
    parts.push(run.assist.dashMode === 'infinite' ? 'Infinite dashes' : `${p.dashes} of ${p.maxDashes} dashes`);
    if (!run.assist.infiniteStamina) parts.push(`Stamina ${Math.round((Math.max(0, p.stamina) / p.maxStamina) * 100)} percent`);
  }
  if (run.deaths) parts.push(`${run.deaths} fall${run.deaths === 1 ? '' : 's'}`);
  return parts.join('. ') + '.';
}

// Wind where the runner is: the valley is gentler, rock gives shelter.
function exposure() {
  const p = run.player;
  if (p) return p.exposure;
  const g = run.pose();
  return g ? run.level.exposureAt(g.x, g.y, 8, 11, Math.sign(run.wind)) : 1;
}

function feltWind() {
  const wind = run.started ? run.wind : run.weather.windAt(0);
  return wind * exposure();
}

function onCheckpoint(e) {
  const name = run.level.cairns[e.index].name;
  const best = ghostRecord?.best?.splits?.[e.index];
  let text = `${name}: ${formatTime(e.frames)}`;
  hud.split.className = 'hud-split';
  if (best != null && settings.showSplits) {
    const delta = e.frames - best;
    hud.split.textContent = `${formatTime(delta, { sign: true })} ${delta <= 0 ? '▲' : '▼'}`;
    hud.split.classList.add(delta <= 0 ? 'ahead' : 'behind');
    hud.split.hidden = false;
    splitTimer = 3;
    text += `, ${speakTime(delta)} ${delta <= 0 ? 'ahead of' : 'behind'} your best`;
  } else if (settings.showSplits) {
    hud.split.textContent = name;
    hud.split.hidden = false;
    splitTimer = 2;
  }
  announce(text);
}

function finishRun() {
  mode = 'results';
  input.gameActive = false;
  const level = run.level;
  const difficulty = run.difficulty;
  const frames = run.frames;
  const result = submitRun(level.key, difficulty.id, run.assisted, {
    frames,
    deaths: run.deaths,
    vest: run.vest.id,
    seed: run.seed,
    splits: run.splits,
    ghost: run.recorder.encode(),
  });
  if (result.improved && result.previous) audio.play('pb');
  renderResults(result);
  hud.root.hidden = true;
  updateTouchVisibility();
  showScreen('results', { push: false });
  screenStack.length = 0;
}

function renderResults({ improved, previous }) {
  const level = run.level;
  const frames = run.frames;
  $('#results-h').textContent = `${level.def.name} summit!`;
  const pb = $('#results-pb');
  pb.hidden = !improved;
  pb.textContent = previous ? 'New personal best!' : 'First ascent! Ghost saved.';
  const rows = [
    ['Time', formatTime(frames)],
    ['Best', improved ? formatTime(frames) : formatTime(previous.frames)],
    [improved && previous ? 'Improvement' : 'Gap to best', previous ? formatTime(frames - previous.frames, { sign: true }) : '–'],
    ['Falls', String(run.deaths)],
    ['Vest', run.vest.name],
    ['Seed', seedToCode(run.seed)],
    ['Weather', `${run.difficulty.name}: ${run.weather.describe()}`],
  ];
  if (run.assisted) rows.push(['Board', 'Assisted']);
  $('#results-stats').innerHTML = rows.map(([k, v]) => `<div${k === 'Weather' ? ' class="span"' : ''}><dt>${k}</dt><dd>${v}</dd></div>`).join('');

  const table = $('#results-splits');
  const bestSplits = previous?.splits ?? [];
  const names = level.cairns.map((c) => c.name);
  const splitRows = run.splits
    .map((f, i) => {
      if (f == null) return '';
      const b = bestSplits[i];
      const delta = b != null ? f - b : null;
      const cls = delta == null ? '' : delta <= 0 ? 'ahead' : 'behind';
      return `<tr><th scope="row">${names[i] ?? `Cairn ${i + 1}`}</th><td>${formatTime(f)}</td><td class="${cls}">${delta == null ? '–' : formatTime(delta, { sign: true })}</td></tr>`;
    })
    .join('');
  $('tbody', table).innerHTML = splitRows;
  table.hidden = !splitRows;
  $('#results-copied').textContent = '';

  let msg = `Summit! ${level.def.name} in ${speakTime(frames)} with ${run.deaths} fall${run.deaths === 1 ? '' : 's'}.`;
  if (improved && previous) msg += ` New personal best by ${speakTime(previous.frames - frames)}.`;
  else if (!improved) msg += ` ${speakTime(frames - previous.frames)} behind your best.`;
  announce(msg);
}

function challengeLink() {
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('fell', setup.levelId);
  url.searchParams.set('weather', setup.difficultyId);
  url.searchParams.set('seed', seedToCode(setup.seed));
  url.searchParams.set('vest', setup.vestId);
  return url.toString();
}

$('#results-copy').addEventListener('click', async () => {
  const link = challengeLink();
  try {
    await navigator.clipboard.writeText(link);
    $('#results-copied').textContent = 'Link copied.';
  } catch {
    $('#results-copied').textContent = link;
  }
});
$('#results-retry').addEventListener('click', startRun);
$('#results-new').addEventListener('click', () => {
  setup.seed = randomSeed();
  startRun();
});

function showBanner(html, seconds) {
  hud.banner.innerHTML = html;
  hud.banner.hidden = false;
  bannerTimer = seconds;
}

function showCaption(text) {
  hud.caption.textContent = `[${text}]`;
  hud.caption.hidden = false;
  captionTimer = 1.6;
}

function updateHud(dt) {
  const p = run.player;
  hud.time.textContent = formatTime(run.frames);
  hud.deaths.textContent = `✕ ${run.deaths}`;
  hud.deaths.title = `${run.deaths} falls`;

  const wind = feltWind();
  const word = windWord(wind);
  hud.windWord.textContent = word;
  hud.windDetail.textContent = Math.abs(wind) < 4 ? '' : `${toMph(wind)} mph · ${wind > 0 ? 'from the west' : 'from the east'}`;
  const raw = run.started ? run.wind : run.weather.windAt(0);
  hud.shelter.hidden = !(Math.abs(raw) >= 6 && exposure() < 0.6);
  const scale = 0.6 + Math.min(1, Math.abs(wind) / 60) * 0.7;
  hud.windArrow.style.transform = `scaleX(${wind < 0 ? -1 : 1}) scale(${scale})`;
  hud.windArrow.style.opacity = Math.abs(wind) < 4 ? 0.3 : 1;

  const gust = settings.gustWarnings && run.started && !run.replay ? run.weather.nextGust(run.time) : null;
  if (gust) {
    hud.gust.hidden = false;
    hud.gustText.textContent = `Gust ${gust.dir > 0 ? '→' : '←'}`;
    hud.gustFill.style.width = `${Math.max(0, 1 - gust.in) * 100}%`;
    const key = Math.round((run.time + gust.in) * 100);
    if (key !== warnedGust) {
      warnedGust = key;
      audio.play('gust');
      if (settings.captions) showCaption(`gust building ${gust.dir > 0 ? 'from the west' : 'from the east'}`);
    }
  } else {
    hud.gust.hidden = true;
  }

  if (!hud.route.hidden) {
    const g = run.ghostPose();
    const you = p ? { x: p.x, y: p.y + p.h } : null;
    routeMap.update(you ?? (g && { x: g.x, y: g.y + 11 }), g && !run.replay && settings.showGhost ? { x: g.x, y: g.y + 11 } : null, run.checkpoint.index);
  }
  if (placeTimer > 0 && (placeTimer -= dt) <= 0) hud.place.hidden = true;
  if (!p) {
    if (bannerTimer > 0 && (bannerTimer -= dt) <= 0) hud.banner.hidden = true;
    if (splitTimer > 0 && (splitTimer -= dt) <= 0) hud.split.hidden = true;
    return;
  }

  const max = p.maxDashes;
  if (run.assist.dashMode === 'infinite') {
    if (hud.dashes.dataset.state !== 'inf') {
      hud.dashes.innerHTML = '<i></i><span class="inf">∞</span>';
      hud.dashes.dataset.state = 'inf';
    }
  } else {
    const state = `${p.dashes}/${max}`;
    if (hud.dashes.dataset.state !== state) {
      hud.dashes.innerHTML = Array.from({ length: max }, (_, i) => `<i class="${i < p.dashes ? '' : 'spent'}"></i>`).join('');
      hud.dashes.dataset.state = state;
    }
  }
  const showStamina = !run.assist.infiniteStamina && (p.state === ST.CLIMB || p.stamina < p.maxStamina);
  hud.stamina.hidden = !showStamina;
  if (showStamina) {
    hud.staminaFill.style.width = `${Math.max(0, p.stamina / p.maxStamina) * 100}%`;
    hud.stamina.classList.toggle('low', p.tired);
  }

  if (bannerTimer > 0 && (bannerTimer -= dt) <= 0) hud.banner.hidden = true;
  if (splitTimer > 0 && (splitTimer -= dt) <= 0) hud.split.hidden = true;
  if (captionTimer > 0 && (captionTimer -= dt) <= 0) hud.caption.hidden = true;
}

// ---------------------------------------------------------------------------
// Menu backdrop: a slow pan across the selected fell in its forecast weather

let attract = null;

function refreshAttract() {
  if (mode !== 'menu') return;
  const level = currentLevel();
  const weather = createWeather(setup.seed, currentDifficulty(), level.id);
  attract = { level, weather, t: 0 };
  renderer.setLevel(level, weather);
  setVestColours(currentVest());
}

function drawAttract(dt) {
  if (!attract) refreshAttract();
  attract.t += dt;
  const { level } = attract;
  const span = level.width - 320;
  const phase = settings.reduceMotion ? 0.15 : (Math.sin(attract.t * 0.04 - Math.PI / 2) + 1) / 2;
  const x = 160 + span * phase;
  // Follow the terrain surface so the view stays on the route
  let ground = level.rows - 1;
  const tx = Math.floor(x / 8);
  for (let ty = 0; ty < level.rows; ty++) {
    if (level.kind(tx, ty) !== 0) {
      ground = ty;
      break;
    }
  }
  renderer.updateCamera({ x, y: ground * 8 - 20 }, dt, attract.t < 0.05);
  renderer.draw({ run: null, time: attract.t, dt });
}

// ---------------------------------------------------------------------------
// Touch controls

let touchUsed = false;
addEventListener('touchstart', () => {
  touchUsed = true;
  updateTouchVisibility();
}, { passive: true });

function updateTouchVisibility() {
  $('#touch').hidden = !(touchUsed && mode === 'playing');
  document.body.classList.toggle('touching', !$('#touch').hidden);
  document.body.classList.toggle('playing', mode === 'playing' || mode === 'paused' || mode === 'replay');
}

for (const btn of $$('#touch [data-touch]')) {
  const action = btn.dataset.touch;
  const on = (e) => {
    e.preventDefault();
    btn.setPointerCapture?.(e.pointerId);
    btn.classList.add('on');
    if (action === 'pause') return input.onAction('pause');
    input.touch[action] = true;
    input.press(action);
  };
  const off = () => {
    btn.classList.remove('on');
    input.touch[action] = false;
  };
  btn.addEventListener('pointerdown', on);
  btn.addEventListener('pointerup', off);
  btn.addEventListener('pointercancel', off);
  btn.addEventListener('lostpointercapture', off);
}

// ---------------------------------------------------------------------------
// Gamepad menu navigation

input.onMenuPad = (action) => {
  const screen = $$('.screen').find((s) => !s.hidden);
  if (!screen) return;
  const focusables = $$('button:not([hidden]), input:not([type=hidden]), select, a[href]', screen).filter((el) => el.offsetParent !== null && !el.closest('[hidden]'));
  const i = focusables.indexOf(document.activeElement);
  const active = document.activeElement;
  if (action === 'up' || action === 'left' || action === 'down' || action === 'right') {
    const dir = action === 'up' || action === 'left' ? -1 : 1;
    if (active?.type === 'range' && (action === 'left' || action === 'right')) {
      if (dir < 0) active.stepDown();
      else active.stepUp();
      active.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    const next = focusables[(i + dir + focusables.length) % focusables.length] ?? focusables[0];
    next?.focus();
    next?.scrollIntoView({ block: 'nearest' });
  } else if (action === 'jump') {
    audio.unlock();
    if (active && focusables.includes(active)) active.click();
    else focusables[0]?.focus();
  } else if (action === 'dash') {
    back();
  } else if (action === 'pause' && mode === 'paused') {
    resume();
  }
};

// ---------------------------------------------------------------------------
// Main loop

let last = performance.now();

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (manual) return requestAnimationFrame(frame);
  input.pollPads();

  const live = mode === 'playing' || mode === 'replay';
  if (live) {
    const steps = clock.advance(dt, mode === 'replay' ? 1 : Number(settings.speed));
    const before = mode;
    for (let i = 0; i < steps && mode === before; i++) step();
  }

  if (run && mode !== 'menu') {
    const moving = mode === 'playing' || mode === 'replay';
    if (moving) renderer.updateCamera(cameraTarget(), dt);
    const animTime = run.started ? run.time : now / 1000;
    renderer.draw({ run, time: animTime, dt: moving ? dt : 0 });
    if (moving) updateHud(dt);
    audio.setWeather(run.wind || run.weather.windAt(0), run.weather.precip, true);
  } else {
    drawAttract(dt);
    if (attract) audio.setWeather(attract.weather.windAt(attract.t), attract.weather.precip, false);
  }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// Boot

applySettings();
refreshAttract();
if (setup.fromLink) {
  showScreen('setup', { push: false });
  screenStack.push('title');
  announce('Challenge loaded. Check the fell, vest and seed, then start your run.');
} else {
  showScreen('title', { push: false });
}
requestAnimationFrame(frame);

// Handy for debugging and for automated screenshots
globalThis.fellRunner = {
  setup,
  settings,
  startRun,
  renderer,
  showScreen,
  get run() {
    return run;
  },
  // Start a run driven by a list of per-step inputs.
  playScripted(inputs, { manualStepping = false } = {}) {
    manual = manualStepping;
    startRun();
    scripted = inputs.slice();
  },
  // Back to real-time play with the real controls.
  resumeLoop() {
    manual = false;
    scripted = null;
    last = performance.now();
  },
  // With manual stepping: advance n physics steps, then draw one frame.
  advance(n = 1) {
    for (let i = 0; i < n && mode === 'playing'; i++) step();
    if (!run) return;
    const dt = n * STEP;
    if (mode === 'playing') renderer.updateCamera(cameraTarget(), dt);
    renderer.draw({ run, time: run.started ? run.time : 0, dt });
    if (mode === 'playing' || mode === 'replay') updateHud(dt);
    return { frames: run.frames, finished: run.finished, x: run.player?.x ?? run.pose?.()?.x };
  },
};
