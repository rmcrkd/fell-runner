// Target times for each fell, derived from its reference route (the fastest
// line `npm run par` finds in calm weather). Gold is a skilled runner's pace,
// about a third slower than the reference; bronze is a steady first ascent.
// The same targets apply in every weather, so a storm makes them harder.

export const MEDALS = [
  { id: 'gold', name: 'Gold', mult: 1.35 },
  { id: 'silver', name: 'Silver', mult: 2 },
  { id: 'bronze', name: 'Bronze', mult: 3 },
];

// [{ id, name, frames }], fastest first, in whole seconds.
export function targetsFor(def) {
  return MEDALS.map((m) => ({ id: m.id, name: m.name, frames: Math.ceil(def.reference * m.mult) * 60 }));
}

// The best medal a time earns, or null.
export function medalFor(def, frames) {
  return targetsFor(def).find((t) => frames <= t.frames) ?? null;
}

// The next target to aim for after a time, or null once it has gold.
export function nextTarget(def, frames) {
  return targetsFor(def).findLast((t) => frames > t.frames) ?? null;
}

// Targets are whole seconds, so show them as m:ss.
export function formatTarget(frames) {
  const s = Math.round(frames / 60);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// And for screen readers, e.g. "1 minute 20 seconds".
export function speakTarget(frames) {
  const s = Math.round(frames / 60);
  const m = Math.floor(s / 60);
  const parts = [];
  if (m) parts.push(`${m} minute${m === 1 ? '' : 's'}`);
  if (s % 60 || !m) parts.push(`${s % 60} seconds`);
  return parts.join(' ');
}
