// Persistence for settings, best times and ghosts. Storage can be missing
// or full (private windows, blocked cookies), so every access is guarded
// and the game keeps working in memory.

const PREFIX = 'fell-runner.v1.';
const memory = new Map();

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw != null) return JSON.parse(raw);
  } catch {
    if (memory.has(key)) return memory.get(key);
  }
  return memory.has(key) ? memory.get(key) : fallback;
}

function write(key, value) {
  memory.set(key, value);
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

const prefersReducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const prefersContrast = () => typeof matchMedia === 'function' && matchMedia('(prefers-contrast: more)').matches;

export function defaultSettings() {
  return {
    // Controls
    bindings: null,
    grabMode: 'hold',
    // Assist
    speed: 1,
    infiniteStamina: false,
    dashMode: 'default',
    invincible: false,
    // Visuals
    reduceMotion: prefersReducedMotion(),
    screenShake: !prefersReducedMotion(),
    highContrast: prefersContrast(),
    weatherFx: 'full',
    fogLimit: 1,
    hudScale: 1,
    showGhost: true,
    showSplits: true,
    gustWarnings: true,
    // Audio
    volume: 0.7,
    sfxVolume: 0.8,
    ambienceVolume: 0.6,
    captions: false,
    announce: true,
  };
}

export function loadSettings() {
  return { ...defaultSettings(), ...read('settings', {}) };
}

export function saveSettings(settings) {
  write('settings', settings);
}

export function loadLastSetup() {
  return read('setup', null);
}

export function saveLastSetup(setup) {
  write('setup', setup);
}

// Records are kept per fell and per weather difficulty. Assisted runs are
// kept in their own table so they never displace unassisted bests, but
// still count: they are real runs.
const bucket = (difficultyId, assisted) => (assisted ? `${difficultyId}+assist` : difficultyId);

function loadRecords() {
  return read('records', {});
}

export function getRecord(levelId, difficultyId, assisted = false) {
  return loadRecords()[levelId]?.[bucket(difficultyId, assisted)] ?? null;
}

export function getGhost(levelId, difficultyId, assisted = false) {
  return read(`ghost.${levelId}.${bucket(difficultyId, assisted)}`, null);
}

// Saves a finished run. Returns { improved, previous }.
export function submitRun(levelId, difficultyId, assisted, run) {
  const records = loadRecords();
  const key = bucket(difficultyId, assisted);
  const level = (records[levelId] ??= {});
  const rec = (level[key] ??= { best: null, history: [] });
  const entry = { frames: run.frames, deaths: run.deaths, vest: run.vest, seed: run.seed, date: new Date().toISOString(), splits: run.splits };
  const previous = rec.best;
  const improved = !previous || run.frames < previous.frames;
  if (improved) rec.best = entry;
  rec.history = [...rec.history, entry].sort((a, b) => a.frames - b.frames).slice(0, 10);
  write('records', records);
  if (improved && run.ghost) write(`ghost.${levelId}.${key}`, { seed: run.seed, vest: run.vest, data: run.ghost });
  return { improved, previous };
}

export function clearRecords() {
  const keys = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX + 'records') || k?.startsWith(PREFIX + 'ghost.')) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    // nothing stored
  }
  for (const k of [...memory.keys()]) if (k === 'records' || k.startsWith('ghost.')) memory.delete(k);
}
