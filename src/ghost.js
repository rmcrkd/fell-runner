import { PHYS } from './config.js';
import { ST, STAND_H } from './player.js';

// Ghosts store one sample per fixed physics step: x and y as 16-bit
// integers plus a byte of flags. A one-minute run is about 18 KB.

const BYTES = 5;
const F_LEFT = 1;
const F_DEAD = 2;
const F_AIR = 4;
const F_CLIMB = 8;
const F_DASH = 16;
const F_DUCK = 32;

export class GhostRecorder {
  constructor() {
    this.buf = new Uint8Array(BYTES * 60 * 120);
    this.frames = 0;
  }

  push(player) {
    if ((this.frames + 1) * BYTES > this.buf.length) {
      const next = new Uint8Array(this.buf.length * 2);
      next.set(this.buf);
      this.buf = next;
    }
    const o = this.frames * BYTES;
    const x = Math.max(-32768, Math.min(32767, player.x));
    const y = Math.max(-32768, Math.min(32767, player.y));
    this.buf[o] = x & 0xff;
    this.buf[o + 1] = (x >> 8) & 0xff;
    this.buf[o + 2] = y & 0xff;
    this.buf[o + 3] = (y >> 8) & 0xff;
    let f = 0;
    if (player.facing < 0) f |= F_LEFT;
    if (player.state === ST.DEAD) f |= F_DEAD;
    if (!player.onGround) f |= F_AIR;
    if (player.state === ST.CLIMB) f |= F_CLIMB;
    if (player.state === ST.DASH) f |= F_DASH;
    if (player.ducking) f |= F_DUCK;
    this.buf[o + 4] = f;
    this.frames++;
  }

  encode() {
    return bytesToBase64(this.buf.subarray(0, this.frames * BYTES));
  }
}

export class GhostPlayback {
  constructor(encoded) {
    this.buf = base64ToBytes(encoded);
    this.frames = Math.floor(this.buf.length / BYTES);
  }

  // Returns the ghost's pose at a frame, or null once the run has ended.
  at(frame) {
    if (frame < 0 || frame >= this.frames) return null;
    const o = frame * BYTES;
    const b = this.buf;
    const x = ((b[o] | (b[o + 1] << 8)) << 16) >> 16;
    const y = ((b[o + 2] | (b[o + 3] << 8)) << 16) >> 16;
    const f = b[o + 4];
    return {
      x,
      y,
      facing: f & F_LEFT ? -1 : 1,
      dead: !!(f & F_DEAD),
      air: !!(f & F_AIR),
      climb: !!(f & F_CLIMB),
      dash: !!(f & F_DASH),
      duck: !!(f & F_DUCK),
      h: f & F_DUCK ? PHYS.duckHeight : STAND_H,
      runDistance: frame * 2,
    };
  }
}

export function bytesToBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

export function base64ToBytes(text) {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
