// Brute-force reachability checker for levels. It does not use a simplified
// movement model: it runs the game's real Player physics through a library of
// scripted inputs (runs, jumps of varied height, air control, wall kicks,
// climbs, optional dashes) from every resting spot it has found so far, and
// reports whether the finish can be reached.
//
// It only ever starts scripts from a standstill, so it is conservative: a
// skilled human with momentum can always do at least as well.

import { STEP } from '../src/config.js';
import { overlaps } from '../src/level.js';
import { Player, ST } from '../src/player.js';

const MAX_FRAMES = 170;
const NEUTRAL = Object.freeze({ moveX: 0, moveY: 0, jump: false, jumpPressed: false, dashPressed: false, grab: false });

function inputs(moveX = 0, moveY = 0, jump = false, jumpPressed = false, dashPressed = false, grab = false) {
  return { moveX, moveY, jump, jumpPressed, dashPressed, grab };
}

// Each script is (frame, player, memo) => input. Scripts end when the player
// comes to rest on the ground after having done something.
function buildScripts({ allowDash }) {
  const scripts = [];
  for (const d of [-1, 1]) {
    for (const n of [4, 10, 24]) {
      scripts.push({ name: `walk${d}x${n}`, fn: (f) => inputs(f < n ? d : 0) });
    }
  }
  for (const d of [-1, 0, 1]) {
    for (const runup of d === 0 ? [0] : [0, 8]) {
      for (const hold of [3, 9, 30]) {
        for (const air of ['hold', 'apexRelease', 'apexReverse', 'late']) {
          if (d === 0 && air !== 'hold') continue;
          scripts.push({
            name: `jump${d} r${runup} h${hold} ${air}`,
            fn: (f, p) => {
              if (f < runup) return inputs(d);
              const t = f - runup;
              let mx = d;
              if (air === 'apexRelease' && p.vy > 0) mx = 0;
              if (air === 'apexReverse' && p.vy > 0) mx = -d;
              if (air === 'late' && t > 14) mx = 0;
              return inputs(mx, 0, t < hold, t === 0);
            },
          });
        }
      }
    }
    if (d === 0) continue;
    // Wall kicks: hold toward a wall and kick off it whenever touching it.
    scripts.push({
      name: `wallkick${d}`,
      fn: (f, p, memo) => {
        if (f === 0) return inputs(d, 0, true, true);
        const touching = !p.onGround && p.wallJumpCheck(d) && p.vy > -60;
        const press = touching && f - (memo.last ?? -99) > 6;
        if (press) memo.last = f;
        return inputs(d, 0, true, press);
      },
    });
    // Chimney: kick back and forth between two facing walls.
    scripts.push({
      name: `chimney${d}`,
      fn: (f, p, memo) => {
        memo.dir ??= d;
        if (f === 0) return inputs(d, 0, true, true);
        const touching = !p.onGround && p.wallJumpCheck(memo.dir) && f - (memo.last ?? -99) > 4;
        if (touching) {
          memo.last = f;
          memo.dir = -memo.dir;
        }
        return inputs(memo.dir, 0, true, touching);
      },
    });
    // Climb: jump toward the face, grab, climb, hop over, climb-jump when tired.
    for (const jumpFirst of [false, true]) {
      scripts.push({
        name: `climb${d}${jumpFirst ? 'j' : ''}`,
        fn: (f, p) => {
          const pressJump = (jumpFirst && f === 0) || (p.state === ST.CLIMB && p.stamina < 32 && p.stamina > 20 && !p.slipCheck());
          return inputs(d, -1, pressJump || (jumpFirst && f < 12), pressJump, false, true);
        },
      });
    }
    if (!allowDash) continue;
    for (const dy of [-1, 0]) {
      for (const at of [2, 10, 18]) {
        scripts.push({
          name: `dash${d},${dy}@${at}`,
          fn: (f) => inputs(f === at ? d : d, f >= at && f < at + 9 ? dy : 0, f < 12, f === 0, f === at),
        });
      }
    }
    for (const at of [8, 16]) {
      scripts.push({ name: `updash${d}@${at}`, fn: (f) => inputs(f === at ? 0 : d, f === at ? -1 : 0, f < 12, f === 0, f === at) });
    }
  }
  return scripts;
}

// `wind` may be a constant or a function of time in seconds, such as
// weather.windAt, in which case each branch sees the wind at its true time.
export function solve(level, { vest, wind = 0, grip = 1, allowDash = false, maxNodes = 20000 } = {}) {
  const windAt = typeof wind === 'function' ? wind : () => wind;
  const scripts = buildScripts({ allowDash });
  const seen = new Set();
  const queue = [];
  const parent = new Map();
  let best = { x: level.start.x, y: level.start.y };
  const key = (x, bottom) => `${x >> 2},${bottom}`;

  const player = new Player(level, { vest });
  const box = { x: 0, y: 0, w: player.w, h: player.h };

  const startKey = key(level.start.x, level.start.y);
  seen.add(startKey);
  queue.push({ x: level.start.x, bottom: level.start.y, key: startKey, state: player.snapshot(), frame: 0 });

  while (queue.length && seen.size < maxNodes) {
    const node = queue.shift();
    for (const script of scripts) {
      player.restore(node.state);
      const memo = {};
      const log = [];
      let acted = false;
      let airborne = false;
      for (let f = 0; f < MAX_FRAMES; f++) {
        // Once a script has left the ground and landed again, stop and settle.
        if (!player.onGround || player.state !== ST.NORMAL) airborne = true;
        const settle = airborne && player.onGround && player.state === ST.NORMAL && f > 2;
        const inp = settle ? NEUTRAL : script.fn(f, player, memo);
        log.push(inp);
        player.update(inp, STEP, windAt((node.frame + f) * STEP), grip);
        if (player.state === ST.DEAD) break;
        box.x = player.x;
        box.y = player.y;
        for (const cake of level.cakes) if (overlaps(box, cake.rect)) player.refill();
        if (overlaps(box, level.finish.rect)) {
          parent.set('finish', { from: node.key, script: script.name, log });
          const trace = tracePath(parent, 'finish');
          return { solved: true, nodes: seen.size, path: trace.steps, inputs: trace.inputs, best };
        }
        if (!player.onGround || player.vx !== 0 || inp.moveX !== 0) acted = true;
        const resting = acted && player.onGround && player.state === ST.NORMAL && Math.abs(player.vx) < 1 && inp.moveX === 0 && !inp.jump;
        if (resting) {
          const bottom = player.y + player.h;
          const k = key(player.x, bottom);
          if (!seen.has(k)) {
            seen.add(k);
            parent.set(k, { from: node.key, script: script.name, log });
            queue.push({ x: player.x, bottom, key: k, state: player.snapshot(), frame: node.frame + f + 1 });
            if (player.x > best.x) best = { x: player.x, y: bottom };
          }
          break;
        }
      }
    }
  }
  return { solved: false, nodes: seen.size, best, seen };
}

// Returns the scripts used and the exact frame-by-frame inputs, which can be
// replayed through a Run to reproduce the route.
function tracePath(parent, k) {
  const chain = [];
  while (parent.has(k)) {
    const p = parent.get(k);
    chain.push({ ...p, to: k });
    k = p.from;
  }
  chain.reverse();
  return { steps: chain.map((c) => `${c.script} -> ${c.to}`), inputs: chain.flatMap((c) => c.log) };
}
