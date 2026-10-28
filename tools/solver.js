// Brute-force reachability checker for levels. It does not use a simplified
// movement model: it runs the game's real Player physics through a library of
// scripted inputs (runs, jumps of varied height, air control, wall kicks,
// climbs, waits, optional dashes) from every spot it has found so far, and
// reports whether the finish can be reached.
//
// Two search modes:
// - reachability (default): breadth-first, and every script starts from a
//   standstill. That is conservative: a skilled human with momentum can
//   always do at least as well.
// - fastest: Dijkstra on elapsed frames, where moves chain on landing without
//   stopping. The result is a reference route whose time approximates (and
//   slightly overstates) what a skilled player can do. `tools/par.js` uses it.

import { STEP } from '../src/config.js';
import { overlaps } from '../src/level.js';
import { Player, ST } from '../src/player.js';
import { CAKE_RESPAWN_FRAMES } from '../src/run.js';

const MAX_FRAMES = 170;
const NEUTRAL = Object.freeze({ moveX: 0, moveY: 0, jump: false, jumpPressed: false, dashPressed: false });

function inputs(moveX = 0, moveY = 0, jump = false, jumpPressed = false, dashPressed = false) {
  return { moveX, moveY, jump, jumpPressed, dashPressed };
}

// Each script is (frame, player, memo) => input. Scripts end when the player
// comes to rest (or, in fastest mode, lands) after having done something.
function buildScripts({ allowDash, fastest, tech }) {
  const scripts = [];
  for (const d of [-1, 1]) {
    for (const n of fastest ? [10, 24] : [4, 10, 24]) {
      scripts.push({ name: `walk${d}x${n}`, walk: n, fn: (f) => inputs(f < n ? d : 0) });
    }
  }
  // Waiting lets a gust blow through before the next move.
  if (!fastest) for (const n of [40, 90]) scripts.push({ name: `wait${n}`, wait: n, fn: () => NEUTRAL });
  for (const d of [-1, 0, 1]) {
    for (const runup of d === 0 ? [0] : [0, 8]) {
      for (const hold of [3, 9, 30]) {
        for (const air of ['hold', 'apexRelease', 'apexReverse', 'late']) {
          if (d === 0 && air !== 'hold') continue;
          if (fastest && (air === 'apexReverse' || d === -1)) continue;
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
    // Grip is always on, so the runner may be hanging on it by then.
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
    // Climb: (jump and) hold toward the face and up, and hop over the top.
    for (const jumpFirst of [false, true]) {
      scripts.push({
        name: `climb${d}${jumpFirst ? 'j' : ''}`,
        fn: (f) => inputs(d, -1, jumpFirst && f < 12, jumpFirst && f === 0),
      });
    }
    if (!allowDash) continue;
    for (const dy of [-1, 0]) {
      for (const at of [2, 10, 18]) {
        scripts.push({
          name: `dash${d},${dy}@${at}`,
          fn: (f) => inputs(d, f >= at && f < at + 9 ? dy : 0, f < 12, f === 0, f === at),
        });
      }
    }
    for (const at of [8, 16]) {
      scripts.push({ name: `updash${d}@${at}`, fn: (f) => inputs(f === at ? 0 : d, f === at ? -1 : 0, f < 12, f === 0, f === at) });
    }
    // Two dashes in a row, for assists that carry a spare, or a mint cake
    // picked up in between: diagonal up, then sideways.
    scripts.push({
      name: `dash2${d}`,
      fn: (f) => inputs(d, f >= 6 && f < 15 ? -1 : 0, f < 12, f === 0, f === 6 || f === 22),
    });
    if (tech) {
      // Ground dash, then jump while still at dash speed: a long jump.
      scripts.push({ name: `dashjump${d}`, fn: (f) => inputs(d, 0, f >= 3 && f < 14, f === 3, f === 0) });
    }
  }
  return scripts;
}

class Heap {
  constructor() {
    this.items = [];
  }
  get size() {
    return this.items.length;
  }
  push(item) {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].priority <= a[i].priority) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].priority < a[m].priority) m = l;
        if (r < a.length && a[r].priority < a[m].priority) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

// `wind` may be a constant or a function of time in seconds, such as
// weather.windAt, in which case each branch sees the wind at its true time.
// `assist` is passed to the Player (for example { dashMode: 'two' }).
export function solve(level, { wind = 0, allowDash = false, fastest = false, tech = false, assist = {}, maxNodes = fastest ? 60000 : 20000 } = {}) {
  const windAt = typeof wind === 'function' ? wind : () => wind;
  const scripts = buildScripts({ allowDash, fastest, tech });
  const seen = new Set();
  const queue = fastest ? new Heap() : [];
  const parent = new Map();
  let best = { x: level.start.x, y: level.start.y };
  // In fastest mode a landing at speed is a different state from a standstill.
  const key = (p) => (fastest ? `${p.x >> 3},${p.y + p.h},${Math.round(p.vx / 60)},${p.dashes}` : `${p.x >> 2},${p.y + p.h}`);

  const player = new Player(level, { assist });
  const box = { x: 0, y: 0, w: player.w, h: player.h };
  const cakeReady = new Int32Array(level.cakes.length);

  // Fastest mode is a weighted A*: nobody crosses ground faster than a dash,
  // so distance left over dash speed is an optimistic guess at time left.
  const goalX = level.finish.x;
  const remaining = (x) => (Math.max(0, goalX - x) / 240) * 60 * 1.3;
  const startKey = key(player);
  if (!fastest) seen.add(startKey);
  // The clock only starts on the first move, so a route can't open with a wait
  queue.push({ key: startKey, state: player.snapshot(), frame: 0, priority: 0, cakes: Array.from(cakeReady), waited: true });
  const windVaries = typeof wind === 'function';

  let expanded = 0;
  while ((fastest ? queue.size : queue.length) && seen.size < maxNodes) {
    const node = fastest ? queue.pop() : queue.shift();
    if (fastest) {
      if (seen.has(node.key)) continue;
      seen.add(node.key);
      if (node.via) parent.set(node.key, node.via);
      if (node.finish) {
        const trace = tracePath(parent, node.key);
        return { solved: true, nodes: seen.size, expanded, path: trace.steps, inputs: trace.inputs, frames: node.frame, best };
      }
    }
    expanded++;
    for (const script of scripts) {
      if (script.wait && (!windVaries || node.waited)) continue;
      player.restore(node.state);
      cakeReady.set(node.cakes);
      const memo = {};
      const log = [];
      let acted = false;
      let airborne = false;
      for (let f = 0; f < MAX_FRAMES; f++) {
        // Once a script has left the ground and landed again, stop and settle.
        if (!player.onGround || player.state !== ST.NORMAL) airborne = true;
        const landed = airborne && player.onGround && player.state === ST.NORMAL && f > 2;
        if (fastest && (landed || (script.walk && f === script.walk))) {
          addNode(f);
          break;
        }
        const inp = landed ? NEUTRAL : script.fn(f, player, memo);
        log.push(inp);
        const frame = node.frame + f;
        player.update(inp, STEP, windAt(frame * STEP));
        if (player.state === ST.DEAD) break;
        box.x = player.x;
        box.y = player.y;
        level.cakes.forEach((cake, i) => {
          if (cakeReady[i] <= frame && overlaps(box, cake.rect) && player.refill()) cakeReady[i] = frame + CAKE_RESPAWN_FRAMES;
        });
        if (overlaps(box, level.finish.rect)) {
          const via = { from: node.key, script: script.name, log };
          if (!fastest) {
            parent.set('finish', via);
            const trace = tracePath(parent, 'finish');
            return { solved: true, nodes: seen.size, expanded, path: trace.steps, inputs: trace.inputs, frames: trace.inputs.length, best };
          }
          queue.push({ key: 'finish', finish: true, frame: frame + 1, priority: frame + 1, via });
          break;
        }
        if (!player.onGround || player.vx !== 0 || inp.moveX !== 0) acted = true;
        const resting = (acted || (script.wait && f >= script.wait)) && player.onGround && player.state === ST.NORMAL && Math.abs(player.vx) < 1 && inp.moveX === 0 && !inp.jump;
        if (resting) {
          addNode(f + 1);
          break;
        }
      }

      function addNode(f) {
        const k = key(player);
        if (seen.has(k) && !script.wait) return;
        const next = { key: k, state: player.snapshot(), frame: node.frame + f, priority: node.frame + f + remaining(player.x), cakes: Array.from(cakeReady), waited: !!script.wait, via: { from: node.key, script: script.name, log } };
        if (fastest) {
          queue.push(next);
        } else {
          // A wait leads somewhere new only in time, so key it by time too
          const wk = script.wait ? `${k}@${next.frame}` : k;
          if (seen.has(wk)) return;
          seen.add(wk);
          next.key = wk;
          parent.set(wk, next.via);
          queue.push(next);
        }
        if (player.x > best.x) best = { x: player.x, y: player.y + player.h };
      }
    }
  }
  return { solved: false, nodes: seen.size, expanded, best, seen };
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
