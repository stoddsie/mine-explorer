import * as THREE from 'three';
import { TILE } from './config.js';
import { pixelTexture } from './gfx.js';

// Tiled stores flips in the top bits of each gid.
const FLIP_H = 0x80000000;
const FLIP_V = 0x40000000;
const FLIP_D = 0x20000000;
const GID_MASK = 0x0fffffff;

export const NONE = 0;
export const SOLID = 1;
export const PLATFORM = 2;
export const LADDER = 3;
const COLLISION = { solid: SOLID, platform: PLATFORM, ladder: LADDER };

const CHUNK = 16; // tiles per side of each pre-rendered map chunk

const props = (list = []) => Object.fromEntries(list.map((p) => [p.name, p.value]));

// A Tiled map (JSON) + its tileset. Collision comes from the foreground layer's tiles.
export class Level {
  constructor(map, tileset, image) {
    this.map = map;
    this.tileset = tileset;
    this.image = image;
    this.width = map.width;
    this.height = map.height;
    this.pxW = map.width * TILE;
    this.pxH = map.height * TILE;
    const mapProps = props(map.properties);
    this.name = mapProps.name ?? 'Unnamed mine';
    this.surfaceRow = mapProps.surfaceRow ?? 0;
    this.waterSpeed = mapProps.waterSpeed ?? 3;
    this.waterDelay = mapProps.waterDelay ?? 5;
    this.firstgid = map.tilesets[0].firstgid;

    this.tileNames = new Map(); // tile id -> name
    this.tileIds = new Map(); // name -> tile id
    const collisionById = new Map();
    const treasureById = new Map();
    for (const t of tileset.tiles ?? []) {
      const p = props(t.properties);
      if (p.name) {
        this.tileNames.set(t.id, p.name);
        this.tileIds.set(p.name, t.id);
      }
      if (p.collision) collisionById.set(t.id, COLLISION[p.collision] ?? NONE);
      if (p.treasure) treasureById.set(t.id, p.treasure);
    }

    // Copies, so pulling treasure out of the layer doesn't touch the imported map.
    this.layers = map.layers.filter((l) => l.type === 'tilelayer').map((l) => ({ ...l, data: [...l.data] }));
    const fg = this.layers.find((l) => l.name === 'foreground') ?? this.layers[this.layers.length - 1];
    this.collision = new Uint8Array(this.width * this.height);
    this.treasures = []; // { kind, c, r, gid } - drawn and collected by the game, not the map
    fg.data.forEach((gid, i) => {
      const id = (gid & GID_MASK) - this.firstgid;
      if (!gid) return;
      this.collision[i] = collisionById.get(id) ?? NONE;
      if (treasureById.has(id)) {
        this.treasures.push({ kind: treasureById.get(id), c: i % this.width, r: Math.floor(i / this.width), gid });
        fg.data[i] = 0;
      }
    });

    const objects = map.layers.filter((l) => l.type === 'objectgroup').flatMap((l) => l.objects);
    const kind = (o) => o.type ?? o.class ?? '';
    const start = objects.find((o) => o.name === 'start' || kind(o) === 'start');
    this.start = start ? { x: start.x, y: start.y } : { x: TILE * 2, y: TILE * 2 };
    // Exit areas: reach one to escape. Without any, everything above the surface row counts.
    this.exits = objects.filter((o) => kind(o) === 'exit').map((o) => ({ x: o.x, y: o.y, w: o.width, h: o.height }));
    if (!this.exits.length) this.exits.push({ x: 0, y: -TILE * 4, w: this.pxW, h: this.surfaceRow * TILE + TILE * 4 });
    this.elevatorDefs = objects.filter((o) => kind(o) === 'elevator').map((o) => {
      const p = props(o.properties);
      return {
        x: o.x, y: o.y, w: o.width,
        axis: p.axis === 'x' ? 'x' : 'y',
        travel: (p.travel ?? 4) * TILE,
        speed: p.speed ?? 30,
        pause: p.pause ?? 1,
      };
    });
  }

  // ---- collision queries (column/row in tiles) ----------------------------------

  // The map's sides and bottom are solid walls; above the top is open sky.
  kind(c, r) {
    if (c < 0 || c >= this.width || r >= this.height) return SOLID;
    if (r < 0) return NONE;
    return this.collision[r * this.width + c];
  }

  isSolid(c, r) { return this.kind(c, r) === SOLID; }
  isLadder(c, r) { return this.kind(c, r) === LADDER; }

  // Can a falling player land on top of this cell? Solids, platforms, and the top rung of a ladder.
  canLand(c, r, ignorePlatformRow = null) {
    const k = this.kind(c, r);
    if (k === SOLID) return true;
    if (r === ignorePlatformRow) return false;
    return k === PLATFORM || (k === LADDER && !this.isLadder(c, r - 1));
  }

  // ---- drawing ------------------------------------------------------------------

  drawTile(ctx, gid, dx, dy) {
    const id = (gid & GID_MASK) - this.firstgid;
    const cols = this.tileset.columns;
    const sx = (id % cols) * TILE;
    const sy = Math.floor(id / cols) * TILE;
    if (!(gid & (FLIP_H | FLIP_V | FLIP_D))) {
      ctx.drawImage(this.image, sx, sy, TILE, TILE, dx, dy, TILE, TILE);
      return;
    }
    ctx.save();
    ctx.translate(dx + TILE / 2, dy + TILE / 2);
    ctx.scale(gid & FLIP_H ? -1 : 1, gid & FLIP_V ? -1 : 1);
    if (gid & FLIP_D) ctx.transform(0, 1, 1, 0, 0, 0);
    ctx.drawImage(this.image, sx, sy, TILE, TILE, -TILE / 2, -TILE / 2, TILE, TILE);
    ctx.restore();
  }

  // Pre-render each tile layer into 128x128px chunks; Three.js culls the off-screen ones.
  buildMeshes() {
    const group = new THREE.Group();
    const size = CHUNK * TILE;
    this.layers.forEach((layer, order) => {
      if (layer.visible === false) return;
      for (let cy = 0; cy < this.height; cy += CHUNK) {
        for (let cx = 0; cx < this.width; cx += CHUNK) {
          let canvas = null;
          for (let r = cy; r < Math.min(cy + CHUNK, this.height); r++) {
            for (let c = cx; c < Math.min(cx + CHUNK, this.width); c++) {
              const gid = layer.data[r * this.width + c];
              if (!gid) continue;
              if (!canvas) {
                canvas = document.createElement('canvas');
                canvas.width = canvas.height = size;
              }
              this.drawTile(canvas.getContext('2d'), gid, (c - cx) * TILE, (r - cy) * TILE);
            }
          }
          if (!canvas) continue;
          const material = new THREE.MeshBasicMaterial({ map: pixelTexture(canvas), transparent: true, depthTest: false, depthWrite: false });
          const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
          mesh.position.set(cx * TILE + size / 2, -(cy * TILE + size / 2), 0);
          mesh.renderOrder = order;
          group.add(mesh);
        }
      }
    });
    return group;
  }

  // A single tile on its own canvas.
  tileCanvas(gid) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = TILE;
    this.drawTile(canvas.getContext('2d'), gid, 0, 0);
    return canvas;
  }

  // A strip of named tiles drawn side by side, e.g. an elevator car.
  stripCanvas(names) {
    const canvas = document.createElement('canvas');
    canvas.width = names.length * TILE;
    canvas.height = TILE;
    const ctx = canvas.getContext('2d');
    names.forEach((name, i) => {
      const id = this.tileIds.get(name);
      if (id !== undefined) this.drawTile(ctx, id + this.firstgid, i * TILE, 0);
    });
    return canvas;
  }
}
