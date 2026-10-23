// Shared constants. Units are pixels and seconds; one tile is 8px and the
// internal resolution is 320x180, the same scale Celeste uses.

export const TILE = 8;
export const VIEW_W = 320;
export const VIEW_H = 180;
export const FPS = 60;
export const STEP = 1 / FPS;

// Movement. Each axis is its own one-dimensional Newtonian system: a
// velocity changed only by forces (per unit mass, so in px/s²) and by the
// instant kicks of a jump or dash. Many of the numbers follow Celeste's
// player controller.
export const PHYS = {
  // Running: on the ground, the runner's legs push towards their running
  // speed with up to `runAccel`, and brake with the same
  maxRun: 90,
  runAccel: 1000,
  // Above running speed (after a wall kick, say), feet brake more gently
  runReduce: 400,
  // In the air, the runner can push with only `airAccel`, and air
  // resistance balances that push at running speed (see AIR_DRAG)
  airAccel: 650,

  // Falling: gravity, up to a terminal speed of `maxFall`, or `fastMaxFall`
  // when tucked (holding down)
  gravity: 900,
  halfGravThreshold: 40,
  maxFall: 160,
  fastMaxFall: 240,
  fastMaxAccel: 300,

  // Jumping: an upward kick, held against gravity while jump is held
  jumpSpeed: -105,
  jumpHBoost: 40,
  varJumpTime: 0.2,
  jumpGraceTime: 0.1,
  jumpBufferTime: 0.08,
  upwardCornerCorrection: 4,

  // Wall kicks: from a crag face or within a few pixels of one
  wallJumpCheckDist: 3,
  wallJumpForceTime: 0.16,
  wallJumpHSpeed: 130,

  // Climbing: grip on a crag is always on. Climb slowly, slide down, or
  // hang on as long as you like; at the lip, hop over it
  climbUpSpeed: -45,
  climbDownSpeed: 80,
  climbSlipSpeed: 30,
  climbAccel: 900,
  climbGrabYMult: 0.2,
  climbHopX: 100,
  climbHopY: -120,
  climbHopForceTime: 0.2,
  climbNoMoveTime: 0.1,

  // Dashing: a kick to dash speed in any of eight directions, held for
  // `dashTime` against gravity and wind, then left to the forces as usual
  dashSpeed: 220,
  dashTime: 0.1,
  dashCooldown: 0.2,
  dashRefillCooldown: 0.1,
  dashBufferTime: 0.08,
  dashCornerCorrection: 4,

  // Crouching: a hitbox 6px tall instead of 11, sliding to a stop
  duckHeight: 6,
  duckFriction: 500,
  duckCorrectCheck: 4,
  duckCorrectSlide: 50,
};

// The strongest wind there is, in px/s. It's as fast as the runner can run,
// so in the air, pushing straight into it, they're held still.
export const WIND_CAP = PHYS.maxRun;

// Air resistance per second: the wind's force on the runner is
// AIR_DRAG × (wind speed − runner's speed), sideways. Set so that a
// runner pushing into the strongest wind in the air feels no net force:
// AIR_DRAG × WIND_CAP = airAccel. In still air, the same drag balances
// their push at running speed.
export const AIR_DRAG = PHYS.airAccel / WIND_CAP;

// Vests are for looks: every runner has the same physique.
export const VESTS = [
  {
    id: 'featherweight',
    name: 'Featherweight 5L',
    blurb: 'Bare-minimum kit for a fast day out, in race orange.',
    colour: '#f29b38',
    trim: '#7a3d00',
  },
  {
    id: 'ridgeline',
    name: 'Ridgeline 12L',
    blurb: 'The all-rounder, in sky blue.',
    colour: '#2f8fd8',
    trim: '#0c3a5c',
  },
  {
    id: 'mountain',
    name: 'Mountain Marathon 20L',
    blurb: 'Packed for anything, in heather pink.',
    colour: '#c2417a',
    trim: '#4f0d2c',
  },
];

// Wind values are wind speeds in px/s, before the shelter of the terrain.
export const DIFFICULTIES = [
  {
    id: 'none',
    name: 'None',
    blurb: 'A still, clear day. No wind, no rain: pure movement.',
    windBase: [0, 0],
    gust: [0, 0],
    gustEvery: [0, 0],
    precip: [0, 0],
    fog: [0, 0],
    swirl: 0,
  },
  {
    id: 'normal',
    name: 'Normal',
    blurb: 'A typical Lakeland day: breezy, gusty on the tops, passing showers and patchy clag.',
    windBase: [8, 24],
    gust: [14, 26],
    gustEvery: [4.5, 9],
    precip: [0, 0.6],
    fog: [0, 0.35],
    swirl: 0.08,
  },
  {
    id: 'extreme',
    name: 'Extreme',
    blurb: 'Named-storm weather. Gales, driving rain or snow and thick clag. Nobody should be up there for real.',
    windBase: [22, 40],
    gust: [30, 50],
    gustEvery: [2.6, 6],
    precip: [0.55, 1],
    fog: [0.3, 0.6],
    swirl: 0.2,
  },
];

export function byId(list, id) {
  return list.find((item) => item.id === id) ?? list[0];
}
