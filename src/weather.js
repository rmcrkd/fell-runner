import { WIND_CAP } from './config.js';
import { hashString, mulberry32, range } from './rng.js';

// Weather is a pure function of (seed, difficulty, level, time since the
// clock started). Everyone racing the same seed, ghosts included, meets
// exactly the same gusts at exactly the same moments.

const SCHEDULE_SECONDS = 900;
export const GUST_WARNING = 1.0;

const smooth = (t) => t * t * (3 - 2 * t);

export function createWeather(seed, difficulty, levelId = '') {
  const rng = mulberry32((seed ^ hashString(`${difficulty.id}/${levelId}`)) >>> 0);
  const calm = difficulty.windBase[1] === 0;

  // Prevailing wind is usually south-westerly in the Lakes: mostly a tailwind
  // for a runner heading east (right), but not always.
  const dir = rng() < 0.65 ? 1 : -1;
  const base = range(rng, difficulty.windBase);
  const precip = range(rng, difficulty.precip);
  const fog = range(rng, difficulty.fog);
  const roll = rng();
  const precipType = precip < 0.08 ? 'none' : roll < 0.6 ? 'rain' : roll < 0.8 ? 'sleet' : 'snow';
  const snowy = precipType === 'snow' || (precipType === 'sleet' && rng() < 0.5);

  // Slow drift of the base wind: value noise with a node every 6 seconds.
  const driftNodes = Array.from({ length: Math.ceil(SCHEDULE_SECONDS / 6) + 2 }, () => 0.75 + 0.5 * rng());

  const gusts = [];
  if (!calm) {
    let t = range(rng, [2, 4]);
    while (t < SCHEDULE_SECONDS) {
      const duration = range(rng, [1.1, 2.4]);
      const strength = range(rng, difficulty.gust);
      const against = rng() < difficulty.swirl;
      gusts.push({ start: t, duration, strength: against ? -strength * 0.8 : strength });
      t += duration + range(rng, difficulty.gustEvery);
    }
  }

  function gustAt(t) {
    for (const g of gusts) {
      if (g.start > t) break;
      if (t < g.start + g.duration) {
        const p = (t - g.start) / g.duration;
        return g.strength * Math.sin(Math.PI * p) ** 2;
      }
    }
    return 0;
  }

  function windAt(t) {
    if (calm) return 0;
    const tt = ((t % SCHEDULE_SECONDS) + SCHEDULE_SECONDS) % SCHEDULE_SECONDS;
    const i = Math.floor(tt / 6);
    const f = smooth(tt / 6 - i);
    const drift = driftNodes[i] * (1 - f) + driftNodes[i + 1] * f;
    const w = dir * (base * drift + gustAt(tt));
    return Math.max(-WIND_CAP, Math.min(WIND_CAP, w));
  }

  // The next gust that starts within `lookahead` seconds, if any.
  function nextGust(t, lookahead = GUST_WARNING) {
    for (const g of gusts) {
      if (g.start > t + lookahead) return null;
      if (g.start >= t) return { in: g.start - t, dir: dir * Math.sign(g.strength), strength: Math.abs(g.strength) };
    }
    return null;
  }

  return {
    seed,
    difficulty,
    dir,
    base,
    precip,
    precipType,
    snowy,
    fog,
    gusts,
    windAt,
    nextGust,
    describe: () => describeWeather({ base, dir, precip, precipType, fog, calm }),
  };
}

const COMPASS = { 1: 'westerly', '-1': 'easterly' };

// Wind speeds are game units. For display they map to plausible fell-top
// wind speeds: an Extreme storm blows 30 to 50 mph with gusts towards 115,
// a Normal day 10 to 30 mph.
export const MPH_PER_UNIT = 1.3;
export const toMph = (speed) => Math.round(Math.abs(speed) * MPH_PER_UNIT);

// Words for wind strength, roughly following the Beaufort scale.
export function windWord(speed) {
  const mph = Math.abs(speed) * MPH_PER_UNIT;
  if (mph < 4) return 'Calm';
  if (mph < 13) return 'Light breeze';
  if (mph < 25) return 'Breezy';
  if (mph < 39) return 'Strong wind';
  if (mph < 55) return 'Gale';
  if (mph < 73) return 'Severe gale';
  return 'Storm force';
}

function describeWeather({ base, dir, precip, precipType, fog, calm }) {
  if (calm) return 'Still and clear';
  const word = windWord(base);
  const parts = [word === 'Calm' ? word : `${word}, ${COMPASS[dir]}`];
  if (precipType !== 'none') {
    const amount = precip < 0.35 ? 'light' : precip < 0.7 ? 'steady' : 'heavy';
    parts.push(`${amount} ${precipType}`);
  } else {
    parts.push('dry');
  }
  if (fog > 0.45) parts.push('thick clag');
  else if (fog > 0.15) parts.push('patchy hill fog');
  return parts.join(', ').replace(/^./, (c) => c.toUpperCase());
}
