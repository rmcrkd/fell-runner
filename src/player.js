import { PHYS as P } from './config.js';

// A Celeste-style platformer controller: integer positions with sub-pixel
// remainders, coyote time, jump buffering, variable jump height, wall
// slides, wall jumps, stamina-limited climbing, eight-way dashes, corner
// correction, and super/hyper jumps for players who go looking for them.

export const ST = { NORMAL: 0, CLIMB: 1, DASH: 2, DEAD: 3 };

const approach = (v, target, amount) => (v > target ? Math.max(v - amount, target) : Math.min(v + amount, target));
const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);

export const NO_INPUT = Object.freeze({ moveX: 0, moveY: 0, jump: false, jumpPressed: false, dashPressed: false, grab: false });

export class Player {
  constructor(level, { vest, assist = {} } = {}) {
    this.level = level;
    this.w = 8;
    this.h = 11;
    this.vest = vest ?? { runMult: 1, accelMult: 1, staminaMult: 1, windMult: 1, dashes: 1 };
    this.assist = assist;
    this.maxRun = P.maxRun * this.vest.runMult;
    this.runAccel = P.runAccel * this.vest.accelMult;
    this.maxStamina = P.climbMaxStamina * this.vest.staminaMult;
    this.maxDashes = assist.dashMode === 'two' ? Math.max(2, this.vest.dashes) : this.vest.dashes;
    this.events = [];
    this.spawn(level.start.x, level.start.y);
  }

  // (x, bottom) is where the runner's feet go.
  spawn(x, bottom) {
    this.x = Math.round(x);
    this.y = Math.round(bottom - this.h);
    this.rx = 0;
    this.ry = 0;
    this.vx = 0;
    this.vy = 0;
    this.facing = 1;
    this.state = ST.NORMAL;
    this.onGround = true;
    this.jumpGrace = 0;
    this.jumpBuffer = 0;
    this.dashBuffer = 0;
    this.varJumpTimer = 0;
    this.varJumpSpeed = 0;
    this.forceMoveX = 0;
    this.forceMoveXTimer = 0;
    this.wallSlideTimer = P.wallSlideTime;
    this.wallSlideDir = 0;
    this.wallBoostTimer = 0;
    this.wallBoostDir = 0;
    this.maxFall = P.maxFall;
    this.stamina = this.maxStamina;
    this.dashes = this.maxDashes;
    this.dashCooldown = 0;
    this.dashRefillCooldown = 0;
    this.dashTimer = 0;
    this.dashDir = { x: 0, y: 0 };
    this.dashOnGround = false;
    this.climbNoMoveTimer = 0;
    this.noWindTimer = 0;
    this.runDistance = 0;
    this.squash = 1;
  }

  // Plain copy of the movement state, used by tools to branch simulations.
  snapshot() {
    const { level, vest, assist, events, ...state } = this;
    return { ...state, dashDir: { ...this.dashDir } };
  }

  restore(state) {
    Object.assign(this, state);
    this.dashDir = { ...state.dashDir };
  }

  get tired() {
    return !this.assist.infiniteStamina && this.stamina < P.climbTiredThreshold;
  }

  get canDash() {
    return this.dashCooldown <= 0 && (this.dashes > 0 || this.assist.dashMode === 'infinite');
  }

  collide(dx, dy) {
    return this.level.solidAt(this.x + dx, this.y + dy, this.w, this.h);
  }

  checkGround() {
    return this.collide(0, 1) || this.level.ledgeAt(this.x, this.w, this.y + this.h);
  }

  update(inp, dt, wind = 0, grip = 1) {
    this.events.length = 0;
    if (this.state === ST.DEAD) return;

    this.jumpBuffer = inp.jumpPressed ? P.jumpBufferTime : this.jumpBuffer - dt;
    this.dashBuffer = inp.dashPressed ? P.dashBufferTime : this.dashBuffer - dt;
    this.dashCooldown -= dt;
    this.dashRefillCooldown -= dt;
    if (this.varJumpTimer > 0) this.varJumpTimer -= dt;
    if (this.forceMoveXTimer > 0) this.forceMoveXTimer -= dt;
    if (this.noWindTimer > 0) this.noWindTimer -= dt;
    this.squash = approach(this.squash, 1, dt * 4);

    this.onGround = this.state !== ST.DASH || this.dashDir.y >= 0 ? this.checkGround() : false;
    if (this.onGround) {
      this.jumpGrace = P.jumpGraceTime;
      this.wallSlideTimer = P.wallSlideTime;
      if (this.state !== ST.CLIMB || this.vy >= 0) this.stamina = this.maxStamina;
      if (this.dashRefillCooldown <= 0 && this.dashes < this.maxDashes) {
        this.dashes = this.maxDashes;
        this.events.push('refill');
      }
    } else {
      this.jumpGrace -= dt;
    }

    const moveX = this.forceMoveXTimer > 0 ? this.forceMoveX : inp.moveX;
    const moveY = inp.moveY;

    if (this.state === ST.NORMAL) this.normalUpdate(inp, dt, moveX, moveY, grip);
    else if (this.state === ST.CLIMB) this.climbUpdate(inp, dt, moveX, moveY);
    else if (this.state === ST.DASH) this.dashUpdate(inp, dt);

    const wasGround = this.onGround;
    const startX = this.x;
    this.moveH(this.vx * dt, true);
    this.moveV(this.vy * dt);

    if (wind !== 0 && this.state === ST.NORMAL && this.noWindTimer <= 0) {
      const drift = wind * this.vest.windMult * (this.checkGround() ? P.windGroundMult : 1);
      this.moveH(drift * dt, false);
    }

    const nowGround = this.checkGround();
    if (nowGround && !wasGround && this.state !== ST.CLIMB) {
      this.events.push('land');
      this.squash = 0.7;
    }
    if (nowGround) this.runDistance += Math.abs(this.x - startX);
    this.onGround = nowGround;

    this.checkHazards();
  }

  normalUpdate(inp, dt, moveX, moveY, grip) {
    // Grab a crag face
    if (inp.grab && !this.tired && this.vy >= 0 && sign(this.vx) !== -this.facing) {
      if (this.climbCheck(this.facing)) {
        this.enterClimb();
        return;
      }
    }

    if (this.dashBuffer > 0 && this.canDash) {
      this.startDash(inp);
      return;
    }

    if (moveX !== 0) this.facing = moveX;

    // Run
    const mult = this.onGround ? 1 : P.airMult;
    if (Math.abs(this.vx) > this.maxRun && sign(this.vx) === moveX) {
      this.vx = approach(this.vx, this.maxRun * moveX, P.runReduce * mult * dt);
    } else {
      let accel = this.runAccel * mult;
      if (this.onGround && (moveX === 0 || sign(this.vx) === -moveX)) accel *= grip;
      this.vx = approach(this.vx, this.maxRun * moveX, accel * dt);
    }

    // Wall boost: a neutral climb-jump refunds stamina if you then push away
    if (this.wallBoostTimer > 0) {
      this.wallBoostTimer -= dt;
      if (moveX === this.wallBoostDir) {
        this.vx = P.wallJumpHSpeed * moveX;
        this.stamina += P.climbJumpCost;
        this.wallBoostTimer = 0;
      }
    }

    // Fall
    if (moveY === 1 && this.vy >= P.maxFall) {
      this.maxFall = approach(this.maxFall, P.fastMaxFall, P.fastMaxAccel * dt);
    } else {
      this.maxFall = approach(this.maxFall, P.maxFall, P.fastMaxAccel * dt);
    }

    if (!this.onGround) {
      let max = this.maxFall;
      this.wallSlideDir = 0;
      if (moveX === this.facing && moveY !== 1 && this.vy >= 0 && this.wallSlideTimer > 0 && this.collide(this.facing, 0)) {
        this.wallSlideDir = this.facing;
        max = P.maxFall + (P.wallSlideStartMax - P.maxFall) * (this.wallSlideTimer / P.wallSlideTime);
        this.wallSlideTimer = Math.max(0, this.wallSlideTimer - dt);
      }
      const gravMult = Math.abs(this.vy) < P.halfGravThreshold && inp.jump ? 0.5 : 1;
      this.vy = approach(this.vy, max, P.gravity * gravMult * dt);
    }

    // Variable jump height
    if (this.varJumpTimer > 0) {
      if (inp.jump) this.vy = Math.min(this.vy, this.varJumpSpeed);
      else this.varJumpTimer = 0;
    }

    // Jump
    if (this.jumpBuffer > 0) {
      if (this.jumpGrace > 0) this.jump(moveX);
      else if (this.wallJumpCheck(1)) {
        if (this.facing === 1 && inp.grab && !this.tired) this.climbJump(moveX);
        else this.wallJump(-1, moveX);
      } else if (this.wallJumpCheck(-1)) {
        if (this.facing === -1 && inp.grab && !this.tired) this.climbJump(moveX);
        else this.wallJump(1, moveX);
      }
    }
  }

  jump(moveX) {
    this.jumpBuffer = 0;
    this.jumpGrace = 0;
    this.varJumpTimer = P.varJumpTime;
    this.wallSlideTimer = P.wallSlideTime;
    this.vx += P.jumpHBoost * moveX;
    this.vy = P.jumpSpeed;
    this.varJumpSpeed = this.vy;
    this.squash = 1.3;
    this.events.push('jump');
  }

  wallJump(dir, moveX) {
    this.jumpBuffer = 0;
    this.jumpGrace = 0;
    this.varJumpTimer = P.varJumpTime;
    this.wallSlideTimer = P.wallSlideTime;
    this.wallBoostTimer = 0;
    if (moveX !== 0) {
      this.forceMoveX = dir;
      this.forceMoveXTimer = P.wallJumpForceTime;
    }
    this.facing = dir;
    this.vx = P.wallJumpHSpeed * dir;
    this.vy = P.jumpSpeed;
    this.varJumpSpeed = this.vy;
    this.squash = 1.3;
    this.events.push('walljump');
  }

  climbJump(moveX) {
    if (!this.onGround && !this.assist.infiniteStamina) this.stamina -= P.climbJumpCost;
    this.jump(moveX);
    if (moveX === 0) {
      this.wallBoostDir = -this.facing;
      this.wallBoostTimer = P.wallBoostTime;
    }
  }

  superJump() {
    const hyper = this.dashDir.y > 0;
    this.jumpBuffer = 0;
    this.jumpGrace = 0;
    this.varJumpTimer = P.varJumpTime;
    this.vx = P.superJumpH * this.facing;
    this.vy = P.jumpSpeed;
    if (hyper) {
      this.vx *= P.hyperXMult;
      this.vy *= P.hyperYMult;
    }
    this.varJumpSpeed = this.vy;
    this.state = ST.NORMAL;
    this.squash = 1.3;
    this.events.push(hyper ? 'hyper' : 'super');
  }

  superWallJump(dir) {
    this.jumpBuffer = 0;
    this.varJumpTimer = P.superWallJumpVarTime;
    this.vx = P.superWallJumpH * dir;
    this.vy = P.superWallJumpSpeed;
    this.varJumpSpeed = this.vy;
    this.facing = dir;
    this.state = ST.NORMAL;
    this.events.push('walljump');
  }

  wallJumpCheck(dir) {
    return this.collide(dir * P.wallJumpCheckDist, 0);
  }

  climbCheck(dir) {
    return this.collide(dir, 0) || this.collide(dir * 2, 0);
  }

  // True when the point just in front of the top of the runner is clear,
  // meaning they have reached the lip of the crag.
  slipCheck() {
    const px = this.facing === 1 ? this.x + this.w : this.x - 1;
    return !this.level.solidAt(px, this.y + 4, 1, 1) && !this.level.solidAt(px, this.y, 1, 1);
  }

  enterClimb() {
    this.state = ST.CLIMB;
    this.vx = 0;
    this.vy *= P.climbGrabYMult;
    this.wallSlideTimer = P.wallSlideTime;
    this.climbNoMoveTimer = P.climbNoMoveTime;
    this.wallBoostTimer = 0;
    for (let i = 0; i < 2 && !this.collide(this.facing, 0); i++) this.x += this.facing;
    this.events.push('grab');
  }

  climbUpdate(inp, dt, moveX, moveY) {
    this.climbNoMoveTimer -= dt;

    if (this.jumpBuffer > 0) {
      this.state = ST.NORMAL;
      if (moveX === -this.facing) this.wallJump(-this.facing, moveX);
      else this.climbJump(moveX);
      return;
    }
    if (this.dashBuffer > 0 && this.canDash) {
      this.startDash(inp);
      return;
    }
    if (!inp.grab) {
      this.state = ST.NORMAL;
      return;
    }
    if (!this.collide(this.facing, 0)) {
      if (this.vy < 0) this.climbHop();
      this.state = ST.NORMAL;
      return;
    }

    let target = 0;
    let trySlip = false;
    if (this.climbNoMoveTimer <= 0) {
      if (moveY === -1) {
        target = P.climbUpSpeed;
        if (this.collide(0, -1)) {
          if (this.vy < 0) this.vy = 0;
          target = 0;
          trySlip = true;
        } else if (this.slipCheck()) {
          this.climbHop();
          return;
        }
      } else if (moveY === 1) {
        target = P.climbDownSpeed;
      } else {
        trySlip = true;
      }
    } else {
      trySlip = true;
    }
    if (trySlip && this.slipCheck()) target = P.climbSlipSpeed;
    this.vy = approach(this.vy, target, P.climbAccel * dt);

    if (!this.assist.infiniteStamina) {
      if (moveY === -1 && target < 0) this.stamina -= P.climbUpCost * dt;
      else if (moveY !== 1) this.stamina -= P.climbStillCost * dt;
    }
    if (this.stamina <= 0) {
      this.state = ST.NORMAL;
      this.events.push('tired');
    }
  }

  climbHop() {
    this.state = ST.NORMAL;
    this.vx = this.facing * P.climbHopX;
    this.vy = Math.min(this.vy, P.climbHopY);
    this.forceMoveX = 0;
    this.forceMoveXTimer = P.climbHopForceTime;
    // As in Celeste, the wind can't blow you back off the lip mid-hop.
    this.noWindTimer = P.climbHopNoWindTime;
    this.events.push('hop');
  }

  startDash(inp) {
    this.dashBuffer = 0;
    if (this.assist.dashMode !== 'infinite') this.dashes--;
    this.dashCooldown = P.dashCooldown;
    this.dashRefillCooldown = P.dashRefillCooldown;
    this.varJumpTimer = 0;
    this.wallBoostTimer = 0;

    let dx = inp.moveX;
    let dy = inp.moveY;
    if (dx === 0 && dy === 0) dx = this.facing;
    if (dx !== 0) this.facing = dx;
    const len = Math.hypot(dx, dy);
    this.dashDir = { x: dx / len, y: dy / len };

    const before = this.vx;
    this.vx = this.dashDir.x * P.dashSpeed;
    this.vy = this.dashDir.y * P.dashSpeed;
    this.dashOnGround = false;
    if (this.onGround && this.dashDir.x !== 0 && this.dashDir.y > 0) {
      // Down-diagonal dash along the ground becomes a fast slide
      this.vy = 0;
      this.vx = sign(this.dashDir.x) * P.dashSpeed * Math.SQRT1_2 * P.groundDashSpeedMult;
      this.dashOnGround = true;
    }
    if (sign(before) === sign(this.vx) && Math.abs(before) > Math.abs(this.vx)) this.vx = before;
    this.dashTimer = P.dashTime;
    this.state = ST.DASH;
    this.events.push('dash');
  }

  dashUpdate(inp, dt) {
    this.dashTimer -= dt;
    if (this.jumpBuffer > 0) {
      if (this.dashDir.y >= 0 && this.dashDir.x !== 0 && (this.onGround || this.jumpGrace > 0)) {
        this.superJump();
        return;
      }
      if (this.dashDir.x === 0 && this.dashDir.y < 0) {
        if (this.wallJumpCheck(1)) return this.superWallJump(-1);
        if (this.wallJumpCheck(-1)) return this.superWallJump(1);
      }
    }
    if (this.dashTimer <= 0) {
      this.state = ST.NORMAL;
      if (this.dashDir.y <= 0) {
        const endX = this.dashDir.x * P.endDashSpeed;
        if (Math.abs(this.vx) > Math.abs(endX) && sign(this.vx) === sign(endX)) this.vx = sign(this.vx) * Math.max(Math.abs(endX), Math.abs(this.vx) * 0.7);
        else this.vx = endX;
        this.vy = this.dashDir.y * P.endDashSpeed;
        if (this.vy < 0) this.vy *= P.endDashUpMult;
      }
    }
  }

  moveH(amount, isOwnSpeed) {
    this.rx += amount;
    let move = Math.round(this.rx);
    if (move === 0) return;
    this.rx -= move;
    const s = sign(move);
    while (move !== 0) {
      if (!this.collide(s, 0)) {
        this.x += s;
        move -= s;
        continue;
      }
      if (isOwnSpeed && this.state === ST.DASH && this.dashDir.y === 0) {
        // Dash corner correction: slip past a corner a few pixels away
        let corrected = false;
        for (let i = 1; i <= P.dashCornerCorrection && !corrected; i++) {
          for (const j of [-1, 1]) {
            if (!this.collide(s, i * j)) {
              this.y += i * j;
              this.x += s;
              move -= s;
              corrected = true;
              break;
            }
          }
        }
        if (corrected) continue;
      }
      this.rx = 0;
      if (isOwnSpeed) this.vx = 0;
      return;
    }
  }

  moveV(amount) {
    this.ry += amount;
    let move = Math.round(this.ry);
    if (move === 0) return;
    this.ry -= move;
    const s = sign(move);
    while (move !== 0) {
      const blocked = this.collide(0, s) || (s > 0 && this.level.ledgeAt(this.x, this.w, this.y + this.h));
      if (!blocked) {
        this.y += s;
        move -= s;
        continue;
      }
      if (s < 0 && this.state !== ST.CLIMB) {
        // Upward corner correction: nudge round a ceiling corner
        let corrected = false;
        const dirs = this.vx < 0 ? [-1] : this.vx > 0 ? [1] : [-1, 1];
        for (const d of dirs) {
          for (let i = 1; i <= P.upwardCornerCorrection; i++) {
            if (!this.collide(i * d, -1)) {
              this.x += i * d;
              this.y -= 1;
              move += 1;
              corrected = true;
              break;
            }
          }
          if (corrected) break;
        }
        if (corrected) continue;
        this.varJumpTimer = 0;
      }
      this.ry = 0;
      if (s > 0 && this.state === ST.DASH && this.dashDir.y > 0) this.dashOnGround = true;
      this.vy = 0;
      return;
    }
  }

  checkHazards() {
    const { level } = this;
    if (this.y > level.height + 8) {
      if (this.assist.invincible) {
        this.vy = -330;
        this.dashes = this.maxDashes;
        this.events.push('bounce');
        return;
      }
      return this.die('fall');
    }
    const hazard = level.hazardAt(this.x + 1, this.y + 1, this.w - 2, this.h - 1, this.vy);
    if (!hazard) return;
    if (this.assist.invincible) {
      if (hazard === 'water' && this.vy > -200) {
        this.vy = -260;
        this.events.push('bounce');
      }
      return;
    }
    this.die(hazard);
  }

  die(cause) {
    this.state = ST.DEAD;
    this.deathCause = cause;
    this.events.push('death');
  }

  refill() {
    const needed = this.dashes < this.maxDashes || this.stamina < this.maxStamina;
    if (!needed) return false;
    this.dashes = this.maxDashes;
    this.stamina = this.maxStamina;
    return true;
  }
}
