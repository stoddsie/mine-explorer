import * as THREE from 'three';
import { SCREEN_W, VIEW_H, HUD_H } from './config.js';
import { pixelTexture } from './gfx.js';

// A canvas drawn with 2D calls, shown as a textured plane at a fixed screen rectangle
// (in the UI scene, which doesn't scroll). `draw(ctx, data)` only re-runs when the data changes.
export class CanvasLayer {
  constructor(width, height, top, renderOrder, draw) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d');
    this.texture = pixelTexture(this.canvas);
    this.draw = draw;
    this.key = null;
    const material = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthTest: false, depthWrite: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    this.mesh.position.set(width / 2, -(top + height / 2), 0);
    this.mesh.renderOrder = renderOrder;
  }

  update(data) {
    const key = JSON.stringify(data);
    if (key === this.key) return;
    this.key = key;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.draw(this.ctx, data);
    this.texture.needsUpdate = true;
  }
}

export const hudLayer = (draw) => new CanvasLayer(SCREEN_W, HUD_H, VIEW_H, 1, draw);
export const overlayLayer = (draw) => new CanvasLayer(SCREEN_W, VIEW_H, 0, 2, draw);
