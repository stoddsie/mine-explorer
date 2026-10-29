import * as THREE from 'three';
import { TILE, VIEW_W, VIEW_H, PLAYER_W, PLAYER_H, CAMERA_FOLLOW, TREASURE, AIR_TIME } from './config.js';
import { Elevator } from './elevator.js';
import { Player } from './player.js';
import { Water } from './water.js';
import { SOLID, PLATFORM, LADDER } from './level.js';
import { CanvasLayer, hudLayer, overlayLayer } from './hud.js';
import { drawText, drawCentered, pixelTexture } from './gfx.js';
import { input } from './input.js';
import { sfx } from './audio.js';
import { C, FLASH_CYCLE, css } from './palette.js';

const TITLE = 'MINE EXPLORER';
const MINIMAP = { x: 226, y: 10, w: 26, h: 52 }; // HUD area the minimap fits inside
const KINDS = Object.keys(TREASURE);
const END_SCREEN_DELAY = 1; // seconds before the end screens accept a key

const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));
const pad = (n, len) => String(n).padStart(len, '0');
const boxesOverlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export class Game {
  constructor(world, ui, camera, level, playerTexture) {
    this.world = world;
    this.camera = camera;
    this.level = level;
    world.add(level.buildMeshes());

    this.elevators = level.elevatorDefs.map((def) => new Elevator(def, level));
    this.elevators.forEach((e) => world.add(e.mesh));
    this.treasures = this.buildTreasures();
    this.totals = Object.fromEntries(KINDS.map((k) => [k, this.treasures.filter((t) => t.kind === k).length]));
    this.player = new Player(playerTexture);
    world.add(this.player.mesh);
    this.water = new Water(level.pxW, level.pxH);
    world.add(this.water.group);

    this.hud = hudLayer((ctx, d) => this.drawHud(ctx, d));
    this.overlay = overlayLayer((ctx, d) => this.drawOverlay(ctx, d));
    this.buildMinimap();
    ui.add(this.hud.mesh, this.overlay.mesh, this.minimap.mesh);

    this.time = 0;
    this.camX = 0;
    this.camY = 0;
    this.resetRun();
    this.state = 'title';
  }

  buildTreasures() {
    const textures = new Map();
    return this.level.treasures.map((t) => {
      if (!textures.has(t.gid)) textures.set(t.gid, pixelTexture(this.level.tileCanvas(t.gid)));
      const material = new THREE.MeshBasicMaterial({ map: textures.get(t.gid), transparent: true, depthTest: false, depthWrite: false });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(TILE, TILE), material);
      mesh.position.set(t.c * TILE + TILE / 2, -(t.r * TILE + TILE / 2), 0);
      mesh.renderOrder = 4;
      this.world.add(mesh);
      return { ...t, mesh, taken: false };
    });
  }

  // Everything that starts afresh with each attempt.
  resetRun() {
    this.elapsed = 0;
    this.score = 0;
    this.found = Object.fromEntries(KINDS.map((k) => [k, 0]));
    this.treasures.forEach((t) => {
      t.taken = false;
      t.mesh.visible = true;
    });
    this.waterY = this.level.pxH;
    this.waterWait = this.level.waterDelay;
    this.air = AIR_TIME;
    this.paused = false;
  }

  newGame() {
    this.resetRun();
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

  end(state) {
    this.state = state;
    this.endTimer = 0;
    state === 'escaped' ? sfx.win() : sfx.gameOver();
  }

  // ---- per-step update -----------------------------------------------------

  step(dt) {
    this.time += dt;
    if (input.consume('KeyM')) sfx.toggleMute();

    switch (this.state) {
      case 'title': {
        this.elevators.forEach((e) => e.update(dt));
        // Attract mode: drift slowly up and down the whole mine.
        const t = 0.5 - Math.cos(this.time * 0.12) / 2;
        this.camX = (this.level.pxW - VIEW_W) / 2;
        this.camY = t * Math.max(0, this.level.pxH - VIEW_H);
        if (input.consume('Space', 'Enter')) this.newGame();
        break;
      }
      case 'play':
        if (input.consume('Escape', 'KeyP')) this.paused = !this.paused;
        if (input.consume('KeyR')) this.newGame();
        if (!this.paused) this.updatePlay(dt);
        break;
      case 'escaped':
      case 'drowned':
        this.elevators.forEach((e) => e.update(dt));
        if (this.state === 'drowned') this.updateWater(dt);
        this.endTimer += dt;
        if (this.endTimer > END_SCREEN_DELAY && input.consume('Space', 'Enter')) this.state = 'title';
        break;
    }
  }

  updatePlay(dt) {
    this.elapsed += dt;
    this.elevators.forEach((e) => e.update(dt));
    const p = this.player;
    const events = p.update(dt, input, this.level, this.elevators);
    if (events.includes('jump')) sfx.jump();
    this.followCamera(1 - Math.exp(-CAMERA_FOLLOW * dt));
    this.updateWater(dt);

    const box = { x: p.x, y: p.y, w: PLAYER_W, h: PLAYER_H };
    for (const t of this.treasures) {
      if (t.taken || !boxesOverlap(box, { x: t.c * TILE + 1, y: t.r * TILE + 1, w: TILE - 2, h: TILE - 2 })) continue;
      t.taken = true;
      t.mesh.visible = false;
      this.found[t.kind]++;
      this.score += TREASURE[t.kind]?.value ?? 0;
      sfx.collect();
    }

    // Hold your breath while your head is under; it comes back quickly once you surface.
    if (p.y + 3 > this.waterY) {
      const before = Math.ceil(this.air);
      this.air -= dt;
      if (Math.ceil(this.air) < before) sfx.bubble();
      if (this.air <= 0) return this.end('drowned');
    } else {
      this.air = Math.min(AIR_TIME, this.air + dt * 2);
    }

    const cx = p.x + PLAYER_W / 2;
    const cy = p.y + PLAYER_H / 2;
    if (this.level.exits.some((e) => cx >= e.x && cx < e.x + e.w && cy >= e.y && cy < e.y + e.h)) this.end('escaped');
  }

  updateWater(dt) {
    if (this.waterWait > 0) this.waterWait -= dt;
    else this.waterY = Math.max(-TILE, this.waterY - this.level.waterSpeed * dt);
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
    const inRun = this.state !== 'title';
    const playing = this.state === 'play';
    this.player.sync(inRun);
    this.elevators.forEach((e) => e.sync());
    this.water.sync(this.waterY, this.time);
    const tick = Math.floor(this.time * 10);
    this.treasures.forEach((t, i) => {
      if (t.kind === 'jewel') t.mesh.material.color.setHex(FLASH_CYCLE[(tick + i) % FLASH_CYCLE.length]);
    });
    this.camera.position.set(Math.round(this.camX), -Math.round(this.camY), 5);

    const p = this.player;
    const feetRow = Math.floor(p.bottom / TILE);
    this.hud.update({
      name: this.level.name,
      playing,
      score: this.score,
      found: this.found,
      depth: Math.max(0, feetRow - this.level.surfaceRow),
      time: Math.floor(this.elapsed),
      flood: Math.floor((this.waterY - p.bottom) / TILE),
      air: p.y + 3 > this.waterY ? Math.ceil((this.air / AIR_TIME) * 10) : null,
      muted: sfx.muted,
    });
    const s = this.minimap.scale;
    this.minimap.update({
      view: [Math.round(this.camX * s / TILE), Math.round(this.camY * s / TILE)],
      player: inRun ? [Math.floor((p.x + 4) * s / TILE), Math.floor((p.y + 8) * s / TILE)] : null,
      water: Math.round(this.waterY * s / TILE),
      blink: Math.floor(this.time * 4) % 2,
    });
    this.overlay.update({
      state: this.state,
      paused: this.paused,
      flashOn: Math.floor(this.time * 2) % 2 === 0,
      score: this.score,
      found: KINDS.reduce((n, k) => n + this.found[k], 0),
      total: this.treasures.length,
      ready: this.endTimer > END_SCREEN_DELAY,
    });
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
      // Flood water: every other pixel blue, so the mine still shows through.
      mctx.fillStyle = css(C.brightBlue);
      for (let y = Math.max(0, d.water); y < h; y++) {
        for (let x = (y % 2); x < w; x += 2) mctx.fillRect(x + 1, y + 1, 1, 1);
      }
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

  // A treasure tile as a HUD icon (jewels get a fixed tint, as their tile is white).
  drawIcon(ctx, kind, x, y) {
    const t = this.treasures.find((tr) => tr.kind === kind);
    if (!t) return;
    let icon = t.mesh.material.map.image;
    if (kind === 'jewel') {
      const tinted = document.createElement('canvas');
      tinted.width = tinted.height = TILE;
      const tctx = tinted.getContext('2d');
      tctx.drawImage(icon, 0, 0);
      tctx.globalCompositeOperation = 'source-atop';
      tctx.fillStyle = css(C.brightMagenta);
      tctx.fillRect(0, 0, TILE, TILE);
      icon = tinted;
    }
    ctx.drawImage(icon, x, y);
  }

  drawHud(ctx, d) {
    ctx.fillStyle = css(C.black);
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = css(C.yellow);
    ctx.fillRect(0, 0, 256, 8);
    drawCentered(ctx, d.name.toUpperCase(), 0, C.black);

    drawText(ctx, `SCORE ${pad(d.score, 6)}`, 8, 12, C.brightWhite);
    if (d.muted) drawText(ctx, 'MUTED', 168, 12, C.brightRed);
    KINDS.forEach((kind, i) => {
      const x = 8 + i * 58;
      this.drawIcon(ctx, kind, x, 22);
      drawText(ctx, `${pad(d.found[kind], 2)}/${pad(this.totals[kind], 2)}`, x + 10, 22, C.brightYellow);
    });
    if (!d.playing) {
      drawText(ctx, 'ARROWS MOVE/CLIMB', 8, 40, C.cyan);
      drawText(ctx, 'SPACE JUMP  R RESTART', 8, 52, C.cyan);
      return;
    }
    drawText(ctx, d.depth === 0 ? 'ON THE SURFACE' : `DEPTH ${pad(d.depth, 3)}M`, 8, 34, C.brightWhite);
    drawText(ctx, `TIME ${formatTime(d.time)}`, 128, 34, C.brightWhite);
    if (d.air !== null) {
      drawText(ctx, 'AIR', 8, 44, C.brightRed);
      ctx.fillStyle = css(d.air > 3 ? C.brightCyan : C.brightRed);
      ctx.fillRect(40, 45, d.air * 8, 6);
    } else {
      drawText(ctx, `FLOOD ${pad(Math.max(0, d.flood), 3)}M BELOW`, 8, 44, d.flood < 4 ? C.brightRed : C.brightCyan);
    }
    drawText(ctx, 'ESCAPE TO THE SURFACE!', 8, 54, C.green);
  }

  drawOverlay(ctx, d) {
    const line = (text, y, ink, paper = C.black) => drawCentered(ctx, ` ${text} `, y, ink, paper);
    if (d.state === 'title') {
      line(TITLE, 24, C.brightYellow, C.red);
      line('GRAB THE TIN - GOLD - JEWELS', 48, C.brightWhite);
      line('AND ESCAPE BEFORE IT FLOODS', 58, C.brightWhite);
      if (d.flashOn) line('PRESS SPACE TO START', 88, C.brightGreen);
    } else if (d.state === 'escaped' || d.state === 'drowned') {
      if (d.state === 'escaped') line('YOU ESCAPED!', 32, C.brightYellow, C.blue);
      else line('DROWNED!', 32, C.brightWhite, C.red);
      line(`SCORE ${pad(d.score, 6)}`, 52, C.brightWhite);
      line(`TREASURE ${d.found} OF ${d.total}`, 62, C.brightCyan);
      if (d.state === 'escaped' && d.found === d.total) line('EVERY LAST NUGGET!', 72, C.brightGreen);
      if (d.ready && d.flashOn) line('PRESS SPACE', 96, C.brightGreen);
    } else if (d.paused) {
      line('PAUSED', 56, C.brightYellow);
    }
  }
}
