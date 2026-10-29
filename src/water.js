import * as THREE from 'three';
import { TILE } from './config.js';
import { pixelTexture } from './gfx.js';
import { C, css } from './palette.js';

// Paint a small repeating pattern: rows of '.', 'b' (blue), 'C' (cyan), 'W' (white).
function pattern(rows) {
  const canvas = document.createElement('canvas');
  canvas.width = rows[0].length;
  canvas.height = rows.length;
  const ctx = canvas.getContext('2d');
  const ink = { b: C.blue, C: C.brightCyan, W: C.brightWhite };
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    ctx.fillStyle = css(ink[ch]);
    ctx.fillRect(x, y, 1, 1);
  }));
  const tex = pixelTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Flood water: a dithered blue body (so you can still make out what's under it) topped
// by a rolling surface. `level` is the y of the surface in map pixels.
export class Water {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    const material = (map) => new THREE.MeshBasicMaterial({ map, transparent: true, depthTest: false, depthWrite: false });

    const body = pattern(['b.b.b.b.', '.b.b.b.b']);
    body.repeat.set(width / 8, height / 2);
    this.body = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material(body));

    this.surfaceTex = pattern([
      '.WW.............',
      'C..CC.......CC..',
      '.....C.CC.CC..C.',
      'bbbbbbbbbbbbbbbb',
      'b.bbb.bbb.bbb.bb',
      'bbbbbbbbbbbbbbbb',
      '.b.b.b.b.b.b.b.b',
      'b.b.b.b.b.b.b.b.',
    ]);
    this.surfaceTex.repeat.set(width / 16, 1);
    this.surface = new THREE.Mesh(new THREE.PlaneGeometry(width, TILE), material(this.surfaceTex));
    this.body.renderOrder = this.surface.renderOrder = 8;

    this.group = new THREE.Group();
    this.group.add(this.body, this.surface);
  }

  sync(level, time) {
    const y = Math.round(level);
    this.surface.position.set(this.width / 2, -(y + TILE / 2), 0);
    this.body.position.set(this.width / 2, -(y + TILE + this.height / 2), 0);
    this.surfaceTex.offset.x = (Math.floor(time * 12) / 16) % 1;
    this.group.visible = y < this.height;
  }
}
