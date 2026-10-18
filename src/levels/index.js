import { TILE } from '../config.js';
import { Level } from '../level.js';
import blencathra from './blencathra.js';
import helvellyn from './helvellyn.js';
import scafell from './scafell.js';
import { hashString } from '../rng.js';
import { stitch } from './stitch.js';

// The three fells, in order of difficulty. Each map is a list of sections
// named after the real places along the route; see CONTRIBUTING.md.
// `reference` is the calm-weather reference time in seconds from
// `npm run par`, which the target times are derived from (src/targets.js).
// par.js says when it needs updating after a map change.
export const LEVEL_DEFS = [
  {
    id: 'blencathra',
    name: 'Blencathra',
    route: 'via Sharp Edge',
    heightM: 868,
    grade: 1,
    summit: 'ring',
    reference: 39.6,
    blurb: 'From Scales, contour round Scales Fell and climb beside Scales Beck to Scales Tarn. Then cross Sharp Edge, one of the most notorious ridges in the Lakes, and its polished Bad Step, before scrambling up Foule Crag to Atkinson Pike and Hallsfell Top.',
    sections: blencathra,
  },
  {
    id: 'helvellyn',
    name: 'Helvellyn',
    route: 'via Striding Edge',
    heightM: 950,
    grade: 2,
    summit: 'pillar',
    reference: 40.4,
    blurb: 'From Glenridding over Birkhouse Moor to the Hole-in-the-Wall, then out along High Spying How and the crest of Striding Edge, high above Red Tarn. Down-climb the chimney at the end, pass the Gough Memorial on the steep final pull, and cross the summit plateau to the shelter and trig point.',
    sections: helvellyn,
  },
  {
    id: 'scafell',
    name: 'Scafell Pike',
    route: 'from Wasdale Head',
    heightM: 978,
    grade: 3,
    summit: 'cairn-pillar',
    reference: 44.9,
    // The boulder fields have gaps you can only cross with a dash
    needsDash: true,
    blurb: "England's highest mountain. From Wasdale Head, ford Lingmell Gill, haul up the stone staircase of Brown Tongue into the boulder-strewn corrie of Hollow Stones, climb the loose scree to Mickledore, then pick across the summit boulder field to the trig point on its great cairn.",
    sections: scafell,
  },
];

function build(def) {
  const { map, places, signs } = stitch(def.sections);
  const level = new Level({ ...def, map, places });
  // Best times and ghosts are stored under this key, so editing a map
  // retires the records set on the old one instead of comparing unlike runs.
  level.key = `${def.id}.${hashString(map).toString(36)}`;
  // Cairns, and the places along the route, take their names from the
  // section they're in.
  level.places = places.map((p) => ({ ...p, x: p.col * TILE }));
  const placeAt = (x) => [...level.places].reverse().find((p) => p.x <= x);
  level.cairns.forEach((c, i) => (c.name = placeAt(c.x)?.name ?? `Cairn ${i + 1}`));
  for (const sign of level.signs) sign.text = signs.find((s) => s.col * TILE === sign.x).text;
  return level;
}

export const LEVELS = LEVEL_DEFS.map(build);

export const levelById = (id) => LEVELS.find((l) => l.id === id) ?? LEVELS[0];
