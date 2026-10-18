// Levels are written as a list of sections, each a small text map (see the
// tile key in src/level.js), optionally named after the real place it
// represents. stitch() joins them left to right into one map:
// each section is raised or lowered so that the ground at its left edge
// meets the ground at the right edge of the section before it. Below each
// section the bottom row carries on downwards, so rock stays rock and an open
// gap in the bottom row is a drop off the mountain.

const SOLID = new Set(['#', 'B', '=', '%']);
const SKY = 12;
const FLOOR = 3;

function parse(section, i) {
  const text = typeof section === 'string' ? section : section.map;
  const rows = text.replace(/^\n+|\s+$/g, '').split('\n');
  const width = Math.max(...rows.map((r) => r.length));
  const padded = rows.map((r) => r.padEnd(width, '.'));
  const floorAt = (col) => padded.findIndex((r) => SOLID.has(r[col]));
  const left = floorAt(0);
  const right = floorAt(width - 1);
  if (left < 0 || right < 0) throw new Error(`Section ${i + 1} must start and end on solid ground`);
  // Signposts (?) take their words from the section's `signs`, left to right
  const posts = [];
  for (let col = 0; col < width; col++) if (padded.some((r) => r[col] === '?')) posts.push(col);
  const words = section.signs ?? [];
  const label = `Section ${i + 1} (${section.name ?? 'unnamed'})`;
  if ((text.match(/\?/g) ?? []).length !== posts.length) throw new Error(`${label} has two signposts in one column`);
  if (posts.length !== words.length) throw new Error(`${label} has ${posts.length} signposts but ${words.length} signs`);
  return { rows: padded, width, left, right, name: section.name ?? null, posts: posts.map((col, k) => ({ col, text: words[k] })) };
}

// Returns the joined map, the named stretches of the route and the words on
// each signpost, as { map, places: [{ name, col, cols }], signs: [{ col, text }] }
// with columns in tiles.
export function stitch(sections) {
  const parts = sections.map(parse);
  let offset = 0;
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) offset += parts[i - 1].right - parts[i].left;
    parts[i].offset = offset;
  }
  const top = Math.min(...parts.map((p) => p.offset));
  const bottom = Math.max(...parts.map((p) => p.offset + p.rows.length));
  const height = bottom - top + SKY + FLOOR;
  const out = Array.from({ length: height }, () => []);
  for (const p of parts) {
    const start = p.offset - top + SKY;
    const last = p.rows[p.rows.length - 1].replace(/[^.]/g, (c) => ('hCP*F?'.includes(c) ? '.' : '#'));
    for (let y = 0; y < height; y++) {
      const r = y - start;
      out[y].push(r < 0 ? '.'.repeat(p.width) : r < p.rows.length ? p.rows[r] : last);
    }
  }
  const places = [];
  const signs = [];
  let col = 0;
  for (const p of parts) {
    if (p.name) places.push({ name: p.name, col, cols: p.width });
    for (const post of p.posts) signs.push({ col: col + post.col, text: post.text });
    col += p.width;
  }
  return { map: out.map((r) => r.join('')).join('\n'), places, signs };
}
