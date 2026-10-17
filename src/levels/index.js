import { Level } from '../level.js';
import blencathra from './blencathra.js';
import helvellyn from './helvellyn.js';
import scafell from './scafell.js';

// The three fells, in order of difficulty. Maps live in their own files;
// see CONTRIBUTING.md for the tile key.
export const LEVEL_DEFS = [
  {
    id: 'blencathra',
    name: 'Blencathra',
    route: 'via Sharp Edge',
    heightM: 868,
    grade: 1,
    blurb: 'Skirt Scales Tarn and climb Scales Fell, then pick across the rock teeth of Sharp Edge, one of the most notorious ridges in the Lakes. Climb the Bad Step and Foule Crag to Hallsfell Top.',
    cairns: ['Scales Tarn', 'Scales Fell', 'Sharp Edge', 'The Bad Step', 'Below Foule Crag', 'Top of Foule Crag', 'Summit ridge'],
    map: blencathra,
  },
  {
    id: 'helvellyn',
    name: 'Helvellyn',
    route: 'via Striding Edge',
    heightM: 950,
    grade: 2,
    blurb: 'From the Hole-in-the-Wall over Birkhouse Moor and out along the pinnacles of Striding Edge, high above Red Tarn. Down the chimney, up the final headwall, across the summit plateau.',
    cairns: ['Birkhouse Moor', 'High Spying How', 'Striding Edge', 'The chimney', 'Top of the headwall', 'Wind shelter', 'Summit plateau'],
    map: helvellyn,
  },
  {
    id: 'scafell',
    name: 'Scafell Pike',
    route: 'from Wasdale Head',
    heightM: 978,
    grade: 3,
    blurb: "England's highest. Ford Lingmell Gill, haul up Brown Tongue, cross Hollow Stones and Mickledore, then dance over the endless summit boulder field.",
    cairns: ['Brown Tongue', 'Hollow Stones', 'Mickledore', 'Boulder field', 'Below the summit step', 'Summit approach'],
    map: scafell,
  },
];

export const LEVELS = LEVEL_DEFS.map((def) => new Level(def));

export const levelById = (id) => LEVELS.find((l) => l.id === id) ?? LEVELS[0];
