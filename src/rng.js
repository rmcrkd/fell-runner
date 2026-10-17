// Small deterministic random number helpers. Seeds are unsigned 32-bit
// integers, shown to players as short base-36 codes like "K3P9QX".

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function randomSeed() {
  return (Math.random() * 4294967296) >>> 0;
}

export function dailySeed(date = new Date()) {
  const day = date.toISOString().slice(0, 10);
  return hashString(`fell-runner/${day}`);
}

export function seedToCode(seed) {
  return (seed >>> 0).toString(36).toUpperCase().padStart(7, '0');
}

// Accepts a seed code, or any other text, which is hashed into a seed.
export function codeToSeed(text) {
  const clean = String(text).trim().toUpperCase();
  if (!clean) return null;
  if (/^[0-9A-Z]{1,7}$/.test(clean)) {
    const value = parseInt(clean, 36);
    if (value <= 0xffffffff) return value >>> 0;
  }
  return hashString(clean);
}

export const range = (rng, [lo, hi]) => lo + (hi - lo) * rng();
