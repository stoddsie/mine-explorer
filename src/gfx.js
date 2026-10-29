import * as THREE from 'three';
import { css } from './palette.js';

// Wrap a canvas as a crisp, unfiltered texture.
export function pixelTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

// Build a white-on-transparent texture from rows of '#'/'.' — tinted later via material colour.
export function bitmapTexture(rows) {
  const canvas = document.createElement('canvas');
  canvas.width = rows[0].length;
  canvas.height = rows.length;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === '#') ctx.fillRect(x, y, 1, 1);
  });
  return pixelTexture(canvas);
}

// 8x8 character-cell text. The font is rendered then thresholded so every pixel is pure ink.
const FONT = '8px "Press Start 2P", monospace';
const scratch = document.createElement('canvas');
const sctx = scratch.getContext('2d', { willReadFrequently: true });

export function drawText(ctx, text, x, y, ink, paper = null) {
  if (!text) return;
  const w = text.length * 8;
  if (paper !== null) {
    ctx.fillStyle = css(paper);
    ctx.fillRect(x, y, w, 8);
  }
  scratch.width = w;
  scratch.height = 8;
  sctx.font = FONT;
  sctx.textBaseline = 'top';
  sctx.fillStyle = '#fff';
  sctx.fillText(text, 0, 1); // capitals sit in rows 1-7, like the Spectrum ROM font
  const data = sctx.getImageData(0, 0, w, 8).data;
  ctx.fillStyle = css(ink);
  for (let py = 0; py < 8; py++) {
    for (let px = 0; px < w; px++) {
      if (data[(py * w + px) * 4 + 3] >= 128) ctx.fillRect(x + px, y + py, 1, 1);
    }
  }
}

export function drawCentered(ctx, text, y, ink, paper = null, width = 256) {
  drawText(ctx, text, Math.floor((width - text.length * 8) / 2), y, ink, paper);
}
