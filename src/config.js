// Shared constants. Units are pixels and seconds; one tile is 8px and the
// internal resolution is 320x180, the same scale Celeste uses.

export const TILE = 8;
export const VIEW_W = 320;
export const VIEW_H = 180;
export const FPS = 60;
export const STEP = 1 / FPS;

// Movement constants, closely following Celeste's player controller.
export const PHYS = {
  maxRun: 90,
  runAccel: 1000,
  runReduce: 400,
  airMult: 0.65,

  gravity: 900,
  halfGravThreshold: 40,
  maxFall: 160,
  fastMaxFall: 240,
  fastMaxAccel: 300,

  jumpSpeed: -105,
  jumpHBoost: 40,
  varJumpTime: 0.2,
  jumpGraceTime: 0.1,
  jumpBufferTime: 0.08,
  upwardCornerCorrection: 4,

  wallJumpCheckDist: 3,
  wallJumpForceTime: 0.16,
  wallJumpHSpeed: 130,
  wallSlideStartMax: 20,
  wallSlideTime: 1.2,
  wallBoostTime: 0.2,

  superJumpH: 260,
  hyperXMult: 1.25,
  hyperYMult: 0.5,
  superWallJumpSpeed: -160,
  superWallJumpH: 170,
  superWallJumpVarTime: 0.25,

  climbMaxStamina: 110,
  climbUpCost: 100 / 2.2,
  climbStillCost: 100 / 10,
  climbJumpCost: 110 / 4,
  climbUpSpeed: -45,
  climbDownSpeed: 80,
  climbSlipSpeed: 30,
  climbAccel: 900,
  climbGrabYMult: 0.2,
  climbTiredThreshold: 20,
  climbHopX: 100,
  climbHopY: -120,
  climbHopForceTime: 0.2,
  climbHopNoWindTime: 0.3,
  climbNoMoveTime: 0.1,

  dashSpeed: 240,
  endDashSpeed: 160,
  endDashUpMult: 0.75,
  dashTime: 0.15,
  dashCooldown: 0.2,
  dashRefillCooldown: 0.1,
  dashBufferTime: 0.08,
  dashCornerCorrection: 4,
  groundDashSpeedMult: 1.2,

  // Wind moves the runner directly, like Celeste's wind. Feet on the ground
  // give some purchase; hanging on a crag shelters you completely.
  windGroundMult: 0.5,
};

export const VESTS = [
  {
    id: 'featherweight',
    name: 'Featherweight 5L',
    blurb: 'Bare-minimum kit for a fast day out. Quickest on the flat, but the wind throws you about and your arms tire sooner.',
    colour: '#f29b38',
    trim: '#7a3d00',
    runMult: 1.08,
    accelMult: 1.1,
    staminaMult: 0.8,
    windMult: 1.25,
    dashes: 1,
  },
  {
    id: 'ridgeline',
    name: 'Ridgeline 12L',
    blurb: 'The all-rounder. Balanced speed, grip and stamina for any weather.',
    colour: '#2f8fd8',
    trim: '#0c3a5c',
    runMult: 1,
    accelMult: 1,
    staminaMult: 1,
    windMult: 1,
    dashes: 1,
  },
  {
    id: 'mountain',
    name: 'Mountain Marathon 20L',
    blurb: 'Packed for anything. Slower, but steady in a gale, strong on the crags, and carries a spare mint cake: two dashes.',
    colour: '#c2417a',
    trim: '#4f0d2c',
    runMult: 0.92,
    accelMult: 0.9,
    staminaMult: 1.45,
    windMult: 0.6,
    dashes: 2,
  },
];

// Wind values are drift speeds in px/s before the vest's wind multiplier.
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
    gust: [24, 36],
    gustEvery: [2.6, 6],
    precip: [0.55, 1],
    fog: [0.3, 0.6],
    swirl: 0.2,
  },
];

export const WIND_CAP = 72;

export function byId(list, id) {
  return list.find((item) => item.id === id) ?? list[0];
}
