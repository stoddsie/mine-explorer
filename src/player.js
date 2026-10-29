import * as THREE from 'three';
import {
  TILE, PLAYER_W, PLAYER_H, WALK_SPEED, CLIMB_SPEED, GRAVITY, JUMP_SPEED, MAX_FALL_SPEED, AIR_CONTROL,
} from './config.js';

const cell = (px) => Math.floor(px / TILE);

// Frame order in assets/player.png.
const FRAMES = ['stand', 'walk_a', 'walk_b', 'jump', 'climb_a', 'climb_b'];
const WALK_CYCLE = ['walk_a', 'stand', 'walk_b', 'stand'];

export class Player {
  constructor(texture) {
    this.texture = texture;
    texture.repeat.set(1 / FRAMES.length, 1);
    this.material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(PLAYER_W, PLAYER_H), this.material);
    this.mesh.renderOrder = 6;
    this.reset(0, 0);
  }

  // (x, y) is the top-left of the player's box in map pixels.
  reset(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.onGround = false;
    this.climbing = false;
    this.riding = null; // elevator we're standing on
    this.dropRow = null; // platform row we're dropping through
    this.upLatch = false; // Up was used to climb; don't let it jump until released
    this.facing = 1;
    this.walkDist = 0;
  }

  get centerCol() { return cell(this.x + PLAYER_W / 2); }
  get bottom() { return this.y + PLAYER_H; }

  // Advances one step. Returns a list of event names ('jump').
  update(dt, input, level, elevators) {
    const events = [];
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (dir) this.facing = dir;
    if (!input.up) this.upLatch = false;

    if (this.riding) this.rideAlong(level);

    if (this.climbing) {
      this.updateClimb(dt, input, level, dir, events);
      return events;
    }

    // Grab a ladder: Up when one is behind us, Down when one starts beneath our feet.
    const ladderRow = this.ladderRowAtBody(level);
    if (input.up && ladderRow !== null) return this.startClimb(level, ladderRow), events;
    if (input.down && this.onGround && level.isLadder(this.centerCol, cell(this.bottom))) {
      this.startClimb(level, cell(this.bottom));
      return events;
    }

    if (this.onGround) {
      this.vx = dir * WALK_SPEED;
      if (input.jump || (input.up && !this.upLatch)) {
        this.vy = -JUMP_SPEED;
        this.onGround = false;
        this.riding = null;
        events.push('jump');
      } else if (input.down && !this.riding && this.onlyPlatformsBelow(level)) {
        // Drop down through a wooden platform.
        this.dropRow = cell(this.bottom);
        this.onGround = false;
      }
    } else if (AIR_CONTROL) {
      this.vx = dir * WALK_SPEED;
    }

    const x0 = this.x;
    this.moveX(this.vx * dt, level);
    this.moveY(dt, level, elevators);
    this.walkDist = this.onGround && this.x !== x0 ? this.walkDist + Math.abs(this.x - x0) : this.onGround ? 0 : this.walkDist;
    return events;
  }

  // Carried by the elevator under our feet.
  rideAlong(level) {
    const e = this.riding;
    this.moveX(e.dx, level);
    const ny = e.y - PLAYER_H;
    if (ny < this.y && this.headBlocked(level, ny)) {
      this.riding = null; // would be squashed against the ceiling - slip off
      return;
    }
    this.y = ny;
  }

  headBlocked(level, y) {
    const r = cell(y);
    for (let c = cell(this.x); c <= cell(this.x + PLAYER_W - 1); c++) if (level.isSolid(c, r)) return true;
    return false;
  }

  onlyPlatformsBelow(level) {
    const r = cell(this.bottom);
    let any = false;
    for (let c = cell(this.x); c <= cell(this.x + PLAYER_W - 1); c++) {
      if (level.isSolid(c, r) || level.isLadder(c, r)) return false;
      if (level.canLand(c, r)) any = true;
    }
    return any;
  }

  moveX(dx, level) {
    if (dx === 0) return;
    let nx = this.x + dx;
    const r0 = cell(this.y);
    const r1 = cell(this.y + PLAYER_H - 1);
    const c = dx > 0 ? cell(nx + PLAYER_W - 1) : cell(nx);
    for (let r = r0; r <= r1; r++) {
      if (level.isSolid(c, r)) {
        nx = dx > 0 ? c * TILE - PLAYER_W : (c + 1) * TILE;
        break;
      }
    }
    this.x = nx;
  }

  moveY(dt, level, elevators) {
    this.vy = Math.min(this.vy + GRAVITY * dt, MAX_FALL_SPEED);
    let ny = this.y + this.vy * dt;
    const c0 = cell(this.x);
    const c1 = cell(this.x + PLAYER_W - 1);
    this.onGround = false;
    this.riding = null;

    if (this.vy < 0) {
      // Rising: only solid tiles bump our head; platforms and elevators are passed through.
      if (this.headBlocked(level, ny)) {
        ny = (cell(ny) + 1) * TILE;
        this.vy = 0;
      }
    } else {
      // Falling: land on the first surface our feet crossed this step.
      const oldBottom = this.bottom;
      const newBottom = ny + PLAYER_H;
      if (this.dropRow !== null && oldBottom > (this.dropRow + 1) * TILE) this.dropRow = null;
      let landY = Infinity;
      let landOn = null;
      for (let r = Math.ceil((oldBottom - 0.01) / TILE); r * TILE <= newBottom && landY === Infinity; r++) {
        for (let c = c0; c <= c1; c++) {
          if (level.canLand(c, r, this.dropRow)) landY = r * TILE;
        }
      }
      for (const e of elevators) {
        const overlaps = this.x < e.x + e.w && e.x < this.x + PLAYER_W;
        const slack = 1 + Math.max(0, -e.dy); // an elevator rising into our feet still catches us
        if (overlaps && oldBottom <= e.y + slack && newBottom >= e.y && e.y < landY) {
          landY = e.y;
          landOn = e;
        }
      }
      if (landY !== Infinity) {
        ny = landY - PLAYER_H;
        this.vy = 0;
        this.onGround = true;
        this.riding = landOn;
        this.dropRow = null;
      }
    }
    this.y = ny;
  }

  // ---- ladders --------------------------------------------------------------------

  // First row of ladder overlapping our body at our centre column, or null.
  ladderRowAtBody(level) {
    for (let r = cell(this.y); r <= cell(this.bottom - 1); r++) if (level.isLadder(this.centerCol, r)) return r;
    return null;
  }

  startClimb(level, row) {
    // Centre ourselves on the ladder (ladders are usually two tiles wide).
    let l = this.centerCol;
    let r = l;
    while (level.isLadder(l - 1, row)) l--;
    while (level.isLadder(r + 1, row)) r++;
    this.x = ((l + r + 1) * TILE) / 2 - PLAYER_W / 2;
    this.climbing = true;
    this.onGround = false;
    this.riding = null;
    this.vx = 0;
    this.vy = 0;
  }

  updateClimb(dt, input, level, dir, events) {
    const vert = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    if (dir !== 0 && input.jump) {
      // Leap off sideways.
      this.climbing = false;
      this.vx = dir * WALK_SPEED;
      this.vy = -JUMP_SPEED;
      events.push('jump');
      return;
    }
    if (dir !== 0 && vert === 0) {
      // Step off sideways, if there's room.
      const x0 = this.x;
      this.moveX(dir * WALK_SPEED * dt, level);
      if (this.x !== x0) {
        this.climbing = false;
        this.vx = dir * WALK_SPEED;
      }
      return;
    }
    if (vert === 0) return;

    let ny = this.y + vert * CLIMB_SPEED * dt;
    const col = this.centerCol;
    if (vert < 0) {
      if (this.headBlocked(level, ny)) ny = (cell(ny) + 1) * TILE;
      // Reached the top rung: step out and stand on it.
      const feetRow = cell(ny + PLAYER_H - 1);
      if (!level.isLadder(col, feetRow)) {
        this.y = (feetRow + 1) * TILE - PLAYER_H;
        this.climbing = false;
        this.onGround = true;
        this.upLatch = true;
        return;
      }
    } else {
      // Reached the floor at the bottom.
      const newBottom = ny + PLAYER_H;
      const r = cell(newBottom);
      if (newBottom > r * TILE && !level.isLadder(col, r)) {
        for (let c = cell(this.x); c <= cell(this.x + PLAYER_W - 1); c++) {
          if (level.canLand(c, r)) {
            this.y = r * TILE - PLAYER_H;
            this.climbing = false;
            this.onGround = true;
            return;
          }
        }
      }
    }
    this.y = ny;
    this.walkDist += Math.abs(vert * CLIMB_SPEED * dt);
    // Climbed off the bottom into thin air? (The rung just under our feet still counts.)
    if (this.ladderRowAtBody(level) === null && !level.isLadder(col, cell(this.bottom))) this.climbing = false;
  }

  // ---- drawing --------------------------------------------------------------------

  frame() {
    if (this.climbing) return Math.floor(this.walkDist / 6) % 2 ? 'climb_b' : 'climb_a';
    if (!this.onGround) return 'jump';
    if (this.vx === 0) return 'stand';
    return WALK_CYCLE[Math.floor(this.walkDist / 4) % WALK_CYCLE.length];
  }

  sync(visible) {
    this.mesh.visible = visible;
    this.mesh.position.set(Math.round(this.x) + PLAYER_W / 2, -(Math.round(this.y) + PLAYER_H / 2), 0);
    this.texture.offset.x = FRAMES.indexOf(this.frame()) / FRAMES.length;
    this.mesh.scale.x = this.climbing ? 1 : this.facing;
  }
}
