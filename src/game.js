import { TILE, VIEW_W, VIEW_H, PLAYER_W, PLAYER_H, CAMERA_FOLLOW } from './config.js';
import { Elevator } from './elevator.js';
import { Player } from './player.js';
import { SOLID, PLATFORM, LADDER } from './level.js';
import { CanvasLayer, hudLayer, overlayLayer } from './hud.js';
import { drawText, drawCentered } from './gfx.js';
import { input } from './input.js';
import { sfx } from './audio.js';
import { C, css } from './palette.js';

const TITLE = 'MINE EXPLORER';
const MINIMAP = { x: 226, y: 10, w: 26, h: 52 }; // HUD area the minimap fits inside

const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));

export class Game {
  constructor(world, ui, camera, level, playerTexture) {
    this.world = world;
    this.camera = camera;
    this.level = level;
    world.add(level.buildMeshes());

    this.elevators = level.elevatorDefs.map((def) => new Elevator(def, level));
    this.elevators.forEach((e) => world.add(e.mesh));
    this.player = new Player(playerTexture);
    world.add(this.player.mesh);

    this.hud = hudLayer((ctx, d) => this.drawHud(ctx, d));
    this.overlay = overlayLayer((ctx, d) => this.drawOverlay(ctx, d));
    this.buildMinimap();
    ui.add(this.hud.mesh, this.overlay.mesh, this.minimap.mesh);

    this.time = 0;
    this.elapsed = 0;
    this.camX = 0;
    this.camY = 0;
    this.state = 'title';
  }

  newGame() {
    this.elapsed = 0;
    this.paused = false;
    this.spawn();
    this.state = 'play';
    sfx.start();
  }

  // The map's start point marks the player's feet (bottom centre).
  spawn() {
    const { x, y } = this.level.start;
    this.player.reset(x - PLAYER_W / 2, y - PLAYER_H);
    this.followCamera(1);
  }

  // ---- per-step update -----------------------------------------------------

  step(dt) {
    this.time += dt;
    if (input.consume('KeyM')) sfx.toggleMute();

    if (this.state === 'title') {
      this.elevators.forEach((e) => e.update(dt));
      // Attract mode: drift slowly up and down the whole mine.
      const t = 0.5 - Math.cos(this.time * 0.12) / 2;
      this.camX = (this.level.pxW - VIEW_W) / 2;
      this.camY = t * Math.max(0, this.level.pxH - VIEW_H);
      if (input.consume('Space', 'Enter')) this.newGame();
      return;
    }

    if (input.consume('Escape', 'KeyP')) this.paused = !this.paused;
    if (this.paused) return;
    if (input.consume('KeyR')) this.spawn();

    this.elapsed += dt;
    this.elevators.forEach((e) => e.update(dt));
    const events = this.player.update(dt, input, this.level, this.elevators);
    if (events.includes('jump')) sfx.jump();
    this.followCamera(1 - Math.exp(-CAMERA_FOLLOW * dt));
  }

  // Ease the camera towards centring the player, without showing beyond the map.
  followCamera(amount) {
    const p = this.player;
    const tx = clamp(p.x + PLAYER_W / 2 - VIEW_W / 2, 0, this.level.pxW - VIEW_W);
    const ty = clamp(p.y + PLAYER_H / 2 - VIEW_H / 2, 0, this.level.pxH - VIEW_H);
    this.camX += (tx - this.camX) * amount;
    this.camY += (ty - this.camY) * amount;
  }

  // ---- drawing -------------------------------------------------------------

  render() {
    const playing = this.state === 'play';
    this.player.sync(playing);
    this.elevators.forEach((e) => e.sync());
    this.camera.position.set(Math.round(this.camX), -Math.round(this.camY), 5);

    const depth = Math.max(0, Math.floor(this.player.bottom / TILE) - this.level.surfaceRow);
    this.hud.update({ name: this.level.name, depth: playing ? depth : null, time: Math.floor(this.elapsed), muted: sfx.muted });
    const s = this.minimap.scale;
    this.minimap.update({
      view: [Math.round(this.camX * s / TILE), Math.round(this.camY * s / TILE)],
      player: playing ? [Math.floor((this.player.x + 4) * s / TILE), Math.floor((this.player.y + 8) * s / TILE)] : null,
      blink: Math.floor(this.time * 4) % 2,
    });
    this.overlay.update({ state: this.state, paused: this.paused, flashOn: Math.floor(this.time * 2) % 2 === 0 });
  }

  // A tiny overview of the whole map, scaled to fit beside the HUD text.
  buildMinimap() {
    const { level } = this;
    const scale = Math.min(MINIMAP.w / level.width, MINIMAP.h / level.height, 1);
    const w = Math.max(1, Math.round(level.width * scale));
    const h = Math.max(1, Math.round(level.height * scale));
    const base = document.createElement('canvas');
    base.width = w;
    base.height = h;
    const ctx = base.getContext('2d');
    const colour = { [SOLID]: C.red, [PLATFORM]: C.yellow, [LADDER]: C.yellow };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = Math.floor(x / scale);
        const r = Math.floor(y / scale);
        const ink = colour[level.kind(c, r)] ?? (r < level.surfaceRow ? C.blue : null);
        if (ink === null) continue;
        ctx.fillStyle = css(ink);
        ctx.fillRect(x, y, 1, 1);
      }
    }
    const viewW = Math.round((VIEW_W / TILE) * scale);
    const viewH = Math.round((VIEW_H / TILE) * scale);
    const left = MINIMAP.x + Math.floor((MINIMAP.w - w) / 2);
    this.minimap = new CanvasLayer(w + 2, h + 2, VIEW_H + MINIMAP.y - 1, 3, (mctx, d) => {
      mctx.drawImage(base, 1, 1);
      mctx.strokeStyle = css(C.brightCyan);
      mctx.strokeRect(d.view[0] + 0.5, d.view[1] + 0.5, viewW + 1, viewH + 1);
      if (d.player && d.blink) {
        mctx.fillStyle = css(C.brightWhite);
        mctx.fillRect(d.player[0], d.player[1], 2, 2);
      }
    });
    this.minimap.mesh.position.x = left - 1 + (w + 2) / 2;
    this.minimap.scale = scale;
  }

  drawHud(ctx, d) {
    ctx.fillStyle = css(C.black);
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = css(C.yellow);
    ctx.fillRect(0, 0, 256, 8);
    drawCentered(ctx, d.name.toUpperCase(), 0, C.black);

    if (d.depth !== null) {
      drawText(ctx, d.depth === 0 ? 'ON THE SURFACE' : `DEPTH ${String(d.depth).padStart(3, '0')}M`, 8, 16, C.brightWhite);
      drawText(ctx, `TIME ${formatTime(d.time)}`, 8, 28, C.brightWhite);
    }
    if (d.muted) drawText(ctx, 'MUTED', 160, 28, C.brightRed);
    drawText(ctx, 'ARROWS MOVE/CLIMB', 8, 44, C.cyan);
    drawText(ctx, 'SPACE JUMP  R RESTART', 8, 54, C.cyan);
  }

  drawOverlay(ctx, d) {
    const line = (text, y, ink, paper = C.black) => drawCentered(ctx, ` ${text} `, y, ink, paper);
    if (d.state === 'title') {
      line(TITLE, 32, C.brightYellow, C.red);
      line('JUMP - CLIMB - RIDE THE', 56, C.brightWhite);
      line('LIFTS DOWN INTO THE MINE', 66, C.brightWhite);
      if (d.flashOn) line('PRESS SPACE TO START', 92, C.brightGreen);
    } else if (d.paused) {
      line('PAUSED', 56, C.brightYellow);
    }
  }
}
