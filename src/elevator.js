import * as THREE from 'three';
import { TILE } from './config.js';
import { pixelTexture } from './gfx.js';

// A moving platform that shuttles back and forth along one axis, pausing at each end.
// The player can stand on it and jump up through it, like a wooden platform.
export class Elevator {
  constructor(def, level) {
    this.def = def;
    this.w = def.w;
    this.pos = 0;
    this.dir = 1;
    this.wait = def.pause;
    this.place();
    this.dx = 0;
    this.dy = 0;

    const tiles = this.w / TILE;
    const names = Array.from({ length: tiles }, (_, i) => (i === 0 ? 'elev_l' : i === tiles - 1 ? 'elev_r' : 'elev_m'));
    const material = new THREE.MeshBasicMaterial({
      map: pixelTexture(level.stripCanvas(names)), transparent: true, depthTest: false, depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(this.w, TILE), material);
    this.mesh.renderOrder = 5;
    this.sync();
  }

  place() {
    this.x = this.def.x + (this.def.axis === 'x' ? this.pos : 0);
    this.y = this.def.y + (this.def.axis === 'y' ? this.pos : 0);
  }

  update(dt) {
    const { x, y } = this;
    if (this.wait > 0) {
      this.wait -= dt;
    } else {
      this.pos += this.dir * this.def.speed * dt;
      if (this.pos >= this.def.travel || this.pos <= 0) {
        this.pos = Math.min(Math.max(this.pos, 0), this.def.travel);
        this.dir = -this.dir;
        this.wait = this.def.pause;
      }
    }
    this.place();
    this.dx = this.x - x;
    this.dy = this.y - y;
  }

  sync() {
    this.mesh.position.set(Math.round(this.x) + this.w / 2, -(Math.round(this.y) + TILE / 2), 0);
  }
}
