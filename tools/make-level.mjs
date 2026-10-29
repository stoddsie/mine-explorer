// Builds the starter level (levels/old-workings.json, a Tiled map) from a rough layout:
// carve tunnels out of solid rock, add planks/ladders/crates/elevators, then automatically
// "dress" it - rock styles and big blocks, crumbly edges, moss, grass, braces, bg detail.
//
//   npm run level
//
// The output is a normal Tiled map, so after generating you can open it in Tiled
// (https://www.mapeditor.org) and hand-edit. Re-running this script overwrites it.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = `${ROOT}levels/old-workings.json`;
const T = 8;
const W = 40;
const H = 120;
const SURFACE = 10; // first row of ground; everything above is sky

// ---- tile names -> gids ------------------------------------------------------
const tileset = JSON.parse(readFileSync(`${ROOT}assets/mine.tsj`, 'utf8'));
const GID = {};
for (const t of tileset.tiles) GID[t.properties.find((p) => p.name === 'name').value] = t.id + 1;
const FLIP_H = 0x80000000;
const gid = (name, flip = false) => {
  if (!GID[name]) throw new Error(`no tile named ${name}`);
  return (GID[name] | (flip ? FLIP_H : 0)) >>> 0;
};

// ---- seeded random -----------------------------------------------------------
let seed = 20261029;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const hash = (x, y) => {
  let h = Math.imul(x * 374761393 + y * 668265263, 1274126177);
  h ^= h >>> 13;
  return ((Math.imul(h, 1274126177) ^ (h >>> 16)) >>> 0) / 4294967296;
};

// ---- layout grid -------------------------------------------------------------
// ' ' open, '#' rock, '=' plank, 'H' ladder, 'X' crate
const grid = Array.from({ length: H }, (_, y) => Array(W).fill(y < SURFACE ? ' ' : '#'));
const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
const at = (x, y) => (inside(x, y) ? grid[y][x] : '#');
const set = (x, y, ch) => inside(x, y) && (grid[y][x] = ch);

const bg = Array.from({ length: H }, () => Array(W).fill(0));
const fg = Array.from({ length: H }, () => Array(W).fill(0));
const reserved = new Set(); // cells kept clear of auto decoration
const key = (x, y) => `${x},${y}`;

// Only rock is carved away, so ladders etc. already placed survive.
function carve(x0, y0, x1, y1) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (at(x, y) === '#') set(x, y, ' ');
}
function plank(x, y, len) {
  for (let i = 0; i < len; i++) set(x + i, y, '=');
}
function ladder(x, y0, y1) {
  for (let y = y0; y <= y1; y++) set(x, y, 'H'), set(x + 1, y, 'H');
}
const crates = [];
function crate(x, y) {
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) set(x + dx, y + dy, 'X');
  crates.push([x, y]);
}
const elevators = [];
// The car's top sits on row y; it travels `travel` tiles right (axis x) or down (axis y).
function elevator(x, y, w, axis, travel, speed, pause) {
  elevators.push({ x, y, w, axis, travel, speed, pause });
  const [x1, y1] = axis === 'x' ? [x + travel + w - 1, y] : [x + w - 1, y + travel];
  for (let yy = y; yy <= y1; yy++) for (let xx = x; xx <= x1; xx++) reserved.add(key(xx, yy));
}
const frames = [];
// Mine support: posts at x0 and x1 from row top to bottom, beam across the top (background).
function frame(x0, x1, top, bottom) {
  frames.push({ x0, x1, top, bottom });
}
const decor = [];
function place(name, x, y, w = 1) {
  decor.push({ name, x, y, w });
}

// ---- the mine ------------------------------------------------------------------
const start = { x: 6, y: SURFACE }; // feet on top of this row

// Surface + entrance ladder.
ladder(18, SURFACE, 20);
place('pickaxe', 11, SURFACE - 1);

// Level 1 tunnel.
carve(3, 15, 36, 20);
crate(10, 19);
plank(23, 18, 5);
frame(14, 17, 15, 20);
frame(28, 31, 15, 20);
place('lantern', 8, 15);
place('lantern', 25, 15);

// Ladder down on the left, elevator shaft on the right.
ladder(3, 21, 39);
carve(32, 21, 35, 61);
elevator(32, 21, 4, 'y', 40, 28, 1.5);

// Level 2 tunnel opening into a tall chamber of zig-zag planks.
carve(3, 34, 27, 39);
carve(10, 40, 27, 60);
[43, 49, 55].forEach((y) => plank(10, y, 8));
[46, 52, 58].forEach((y) => plank(20, y, 8));
place('lantern', 6, 34);
place('skull', 7, 39);

// Level 3 passage back to the elevator, and a ladder down to the cavern.
carve(28, 55, 31, 60);
ladder(28, 61, 75);

// The cavern: ledges either side of a chasm, ferried by a horizontal elevator.
carve(3, 66, 37, 75);
carve(13, 76, 27, 95);
elevator(13, 76, 4, 'x', 11, 24, 1.2);
plank(32, 73, 6);
crate(34, 71);
plank(3, 73, 5);
frame(9, 12, 66, 75);
place('lantern', 20, 66);
place('lantern', 30, 66);

// Deep shaft down to the bottom chamber, and a ladder back up.
carve(5, 76, 8, 110);
elevator(5, 76, 4, 'y', 35, 32, 1.5);
ladder(34, 76, 110);

// Bottom chamber.
carve(3, 96, 37, 110);
plank(12, 107, 5);
plank(18, 104, 4);
crate(25, 109);
crate(26, 107);
for (let x = 13; x <= 23; x++) place('rail', x, 110);
place('minecart', 16, 110, 2);
place('pickaxe', 30, 110);
place('skull', 11, 110);
frame(29, 32, 103, 110);
place('lantern', 16, 96);

// ---- distance from open space (8-neighbour), used to thin out deep rock ------------
const isOpen = (x, y) => at(x, y) !== '#' && at(x, y) !== 'X';
const dist = Array.from({ length: H }, () => Array(W).fill(Infinity));
const queue = [];
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) if (isOpen(x, y)) dist[y][x] = 0, queue.push([x, y]);
}
for (let i = 0; i < queue.length; i++) {
  const [x, y] = queue[i];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (inside(nx, ny) && dist[ny][nx] > dist[y][x] + 1) dist[ny][nx] = dist[y][x] + 1, queue.push([nx, ny]);
    }
  }
}
const KEEP = 3; // rock this close to open space is solid; deeper rock is left as dark void
const isRock = (x, y) => (inside(x, y) ? grid[y][x] === '#' && dist[y][x] <= KEEP : true);

// ---- rock: big blocks / bricks / cobbles by region ------------------------------
const done = Array.from({ length: H }, () => Array(W).fill(false));
const free = (x, y) => inside(x, y) && isRock(x, y) && !done[y][x] && y !== SURFACE;
const styleAt = (x, y) => {
  const h = hash(x >> 2, y >> 2);
  return h < 0.55 ? 'blocks' : h < 0.8 ? 'bricks' : 'cobble';
};
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (!isRock(x, y) || done[y][x]) continue;
    if (y === SURFACE) {
      fg[y][x] = gid('turf');
      done[y][x] = true;
      continue;
    }
    const style = styleAt(x, y);
    const put = (cells) => cells.forEach(([dx, dy, name]) => {
      fg[y + dy][x + dx] = gid(name);
      done[y + dy][x + dx] = true;
    });
    if (style === 'blocks') {
      if (rand() < 0.6 && free(x + 1, y) && free(x, y + 1) && free(x + 1, y + 1)) {
        put([[0, 0, 'rock_big_tl'], [1, 0, 'rock_big_tr'], [0, 1, 'rock_big_bl'], [1, 1, 'rock_big_br']]);
      } else if (rand() < 0.5 && free(x + 1, y)) {
        put([[0, 0, 'rock_wide_l'], [1, 0, 'rock_wide_r']]);
      } else if (rand() < 0.4 && free(x, y + 1)) {
        put([[0, 0, 'rock_tall_t'], [0, 1, 'rock_tall_b']]);
      } else {
        put([[0, 0, pick(['rock_small', 'rock_small', 'rock_small_b'])]]);
      }
    } else if (style === 'bricks') {
      put([[0, 0, pick(['brick_a', 'brick_a', 'brick_a', 'brick_b', 'brick_c'])]]);
    } else {
      put([[0, 0, pick(['cobble_a', 'cobble_b'])]]);
    }
  }
}

// Crumbly fringe where solid rock gives way to the dark void.
for (let y = SURFACE + 1; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (grid[y][x] !== '#' || dist[y][x] <= KEEP) continue;
    const p = dist[y][x] === KEEP + 1 ? 0.45 : dist[y][x] === KEEP + 2 ? 0.12 : 0;
    if (rand() < p) fg[y][x] = gid(pick(['crumbs_a', 'crumbs_b', 'crumbs_c']));
  }
}

// ---- planks, braces, ladders, crates --------------------------------------------
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (grid[y][x] !== '=') continue;
    if (at(x - 1, y) === '=') continue;
    let x1 = x;
    while (at(x1 + 1, y) === '=') x1++;
    for (let i = x; i <= x1; i++) fg[y][i] = gid(i === x && x1 > x ? 'plank_l' : i === x1 && x1 > x ? 'plank_r' : 'plank_m');
    // Diagonal braces from the wall up to the plank's underside.
    const brace = (wallSide) => {
      for (let n = Math.min(3, x1 - x); n >= 2; n--) {
        const cells = [];
        for (let i = 0; i < n; i++) cells.push(wallSide < 0 ? [x + i, y + n - i] : [x1 - i, y + n - i]);
        if (cells.every(([cx, cy]) => at(cx, cy) === ' ' && !fg[cy][cx] && !reserved.has(key(cx, cy)))) {
          cells.forEach(([cx, cy]) => (fg[cy][cx] = gid('strut', wallSide < 0)));
          return;
        }
      }
    };
    if (isRock(x - 1, y)) brace(-1);
    if (isRock(x1 + 1, y)) brace(1);
  }
}
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) if (grid[y][x] === 'H') fg[y][x] = gid(at(x - 1, y) === 'H' ? 'ladder_r' : 'ladder_l');
}
for (const [x, y] of crates) {
  fg[y][x] = gid('crate_tl');
  fg[y][x + 1] = gid('crate_tr');
  fg[y + 1][x] = gid('crate_bl');
  fg[y + 1][x + 1] = gid('crate_br');
}
for (const { name, x, y, w } of decor) {
  if (w === 2) {
    fg[y][x] = gid(`${name}_l`);
    fg[y][x + 1] = gid(`${name}_r`);
  } else fg[y][x] = gid(name);
}

// ---- background: sky, supports, elevator guides, cave texture ------------------
for (let y = 0; y < SURFACE; y++) {
  for (let x = 0; x < W; x++) {
    if (y <= 4) bg[y][x] = gid('sky');
    else if (y === 5) bg[y][x] = gid('sky_fade_a');
    else if (y === 6) bg[y][x] = gid('sky_fade_b');
  }
}
for (let x = 1; x < W - 2; x += 5 + Math.floor(rand() * 5)) {
  const y = 1 + Math.floor(rand() * 3);
  bg[y][x] = gid('cloud_l');
  bg[y][x + 1] = gid('cloud_r');
}
for (let x = 0; x < W - 2; x += 4 + Math.floor(rand() * 6)) {
  const y = 7 + Math.floor(rand() * 2);
  bg[y][x] = gid('cloud_dark_l');
  bg[y][x + 1] = gid('cloud_dark_r');
}

for (const { x0, x1, top, bottom } of frames) {
  for (let y = top; y <= bottom; y++) {
    bg[y][x0] = gid(y === top ? 'post_top' : 'post');
    bg[y][x1] = gid(y === top ? 'post_top' : 'post');
  }
  for (let x = x0 + 1; x < x1; x++) bg[top][x] = gid('beam');
}

for (const e of elevators) {
  if (e.axis === 'y') {
    let top = e.y;
    while (top > 0 && at(e.x, top - 1) !== '#') top--; // hang the cables from the ceiling
    for (let y = top; y <= e.y + e.travel; y++) {
      bg[y][e.x] = gid('cable_l');
      bg[y][e.x + e.w - 1] = gid('cable_r');
    }
  } else {
    for (let x = e.x; x < e.x + e.w + e.travel; x++) bg[e.y][x] = gid('track_h');
  }
}

for (let y = SURFACE; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (bg[y][x] || at(x, y) === '#') continue;
    const r = rand();
    if (r < 0.07) bg[y][x] = gid(pick(['bgrock_a', 'bgrock_b', 'bgrock_c', 'bgrock_d']));
    else if (r < 0.09) bg[y][x] = gid('bg_dots');
  }
}

// ---- foreground decoration: moss under ceilings, grass/skulls on floors -----------
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (at(x, y) !== ' ' || fg[y][x] || reserved.has(key(x, y))) continue;
    const ceiling = y > SURFACE && isRock(x, y - 1);
    const floor = isRock(x, y + 1) && at(x, y + 1) === '#';
    const r = rand();
    if (ceiling && !floor && r < 0.18) fg[y][x] = gid(pick(['moss_a', 'moss_b']));
    else if (floor && y === SURFACE - 1 && r < 0.4) fg[y][x] = gid(pick(['grass_a', 'grass_b']));
    else if (floor && y > SURFACE && r < 0.14) fg[y][x] = gid(pick(['grass_a', 'grass_b']));
    else if (floor && y > SURFACE && r < 0.17) fg[y][x] = gid('mushroom');
  }
}

// ---- write the Tiled map ---------------------------------------------------------
const layer = (id, name, rows) => ({
  id, name, type: 'tilelayer', x: 0, y: 0, width: W, height: H, opacity: 1, visible: true, data: rows.flat(),
});
let objectId = 1;
const prop = (name, type, value) => ({ name, type, value });
const objects = [
  {
    id: objectId++, name: 'start', type: 'start', point: true,
    x: start.x * T + T / 2, y: start.y * T, width: 0, height: 0, rotation: 0, visible: true,
  },
  ...elevators.map((e) => ({
    id: objectId++, name: '', type: 'elevator',
    x: e.x * T, y: e.y * T, width: e.w * T, height: T, rotation: 0, visible: true,
    properties: [
      prop('axis', 'string', e.axis),
      prop('pause', 'float', e.pause),
      prop('speed', 'float', e.speed),
      prop('travel', 'int', e.travel),
    ],
  })),
];

const map = {
  type: 'map',
  version: '1.10',
  tiledversion: '1.11.0',
  orientation: 'orthogonal',
  renderorder: 'right-down',
  infinite: false,
  width: W,
  height: H,
  tilewidth: T,
  tileheight: T,
  nextlayerid: 4,
  nextobjectid: objectId,
  properties: [prop('name', 'string', 'The Old Workings'), prop('surfaceRow', 'int', SURFACE)],
  tilesets: [{ firstgid: 1, source: '../assets/mine.tsj' }],
  layers: [
    layer(1, 'background', bg),
    layer(2, 'foreground', fg),
    { id: 3, name: 'objects', type: 'objectgroup', x: 0, y: 0, opacity: 1, visible: true, draworder: 'topdown', objects },
  ],
};
writeFileSync(OUT, JSON.stringify(map));
console.log(`wrote levels/old-workings.json (${W}x${H} tiles, ${elevators.length} elevators)`);

// Quick ASCII view of collision for sanity checks.
if (process.argv.includes('--ascii')) {
  for (let y = 0; y < H; y++) {
    console.log(String(y).padStart(3) + ' ' + grid[y].map((ch, x) => (ch === '#' ? (isRock(x, y) ? '#' : ' ') : ch)).join(''));
  }
}
