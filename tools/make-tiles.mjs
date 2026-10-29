// Generates the starter tilesheet (assets/mine-tiles.png) and its Tiled tileset (assets/mine.tsj).
//
//   npm run tiles            - rewrites mine.tsj; tiles are only drawn into empty (fully
//                              transparent) slots of an existing PNG, so hand edits are kept
//   npm run tiles -- --force - repaint every tile from the bitmaps here (loses hand edits!)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { encodePNG, decodePNG } from './png.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const T = 8;
const COLUMNS = 16;

// ZX Spectrum palette. '.' is transparent.
const INK = {
  K: 0x000000,
  b: 0x0000d7, B: 0x0000ff,
  r: 0xd70000, R: 0xff0000,
  m: 0xd700d7, M: 0xff00ff,
  g: 0x00d700, G: 0x00ff00,
  c: 0x00d7d7, C: 0x00ffff,
  y: 0xd7d700, Y: 0xffff00,
  w: 0xd7d7d7, W: 0xffffff,
};

// Each piece: [name, col, row, collision, bitmap, extra tile properties?]. Pieces bigger than 8x8 are split into
// tiles named name_tl/_tr/_bl/_br (2x2), name_l/_r (2x1) or name_t/_b (1x2).
// collision: 'solid' (blocks every side), 'platform' (stand on, jump up through),
// 'ladder' (climbable), or null (decoration). layer is just a hint for map painting.
const PIECES = [
  // ---- foreground rock (red) -------------------------------------------
  ['rock_big', 0, 0, 'solid', [
    '.RRRRRRRRRRRRR..',
    'RRRRRRRRRRRRRRR.',
    'RRRRRRRRRRRRRRR.',
    'RRR.RRRRRRRRRRR.',
    'RRRRRRRRRRRRRRR.',
    'RRRRRRRRRRRRRRR.',
    'RRRRRRRRRRRRRRR.',
    'RRRRRRRRRRRRRRR.',
    'RRRRRRRRRRRRRRR.',
    'RRRRRRRRRRRRRRR.',
    'RRRRRRRRRRRR.RR.',
    'RRRRRRRRRRR.R.R.',
    'RRRRRRRRRR.R.R..',
    'RRRRRRRRRRR.R.R.',
    '.RRRRRRRR.R.R...',
    '................',
  ]],
  ['rock_wide', 2, 0, 'solid', [
    '.RRRRRRRRRRRRR..',
    'RRRRRRRRRRRRRRR.',
    'RRRRRRRRRRRRRRR.',
    'RRRRRRRRRRRRRRR.',
    'RRRRRRRRRRR.R.R.',
    'RRRRRRRRRR.R.R..',
    '.RRRRRRRRRR.R.R.',
    '................',
  ]],
  ['rock_tall', 4, 0, 'solid', [
    '.RRRRR..',
    'RRRRRRR.',
    'RRRRRRR.',
    'RRRRRRR.',
    'RRRRRRR.',
    'RRRRRRR.',
    'RRRRRRR.',
    'RRRRRRR.',
    'RRRRRRR.',
    'RRRRRRR.',
    'RRRRRRR.',
    'RRRRR.R.',
    'RRRR.R..',
    'RRRRR.R.',
    '.RRR.R..',
    '........',
  ]],
  ['rock_small', 5, 0, 'solid', [
    '.RRRRR..',
    'RRRRRRR.',
    'RRRRRRR.',
    'RRRRRRR.',
    'RRRRR.R.',
    'RRRR.R..',
    '.RRRR.R.',
    '........',
  ]],
  ['brick_a', 6, 0, 'solid', [
    'RRR.RRR.',
    'RRR.RRR.',
    'RRR.RRR.',
    '........',
    'R.RRR.RR',
    'R.RRR.RR',
    'R.RRR.RR',
    '........',
  ]],
  ['brick_b', 7, 0, 'solid', [
    'RRR.RRR.',
    'RR.RRRR.',
    'RRR.R.R.',
    '........',
    'R.RRR.RR',
    'R.R.R.RR',
    'R.RRR.R.',
    '........',
  ]],
  ['cobble_a', 8, 0, 'solid', [
    '.RR..RR.',
    'RRRR.RRR',
    'RRR..RR.',
    '.R.RR..R',
    '..RRRR.R',
    'R.RRRR..',
    'RR.RR.RR',
    '.R....R.',
  ]],
  ['cobble_b', 9, 0, 'solid', [
    'RR.RRR..',
    'RR.RRR.R',
    '...RR..R',
    'RRR...RR',
    'RRR.R.R.',
    '.R.RRR..',
    '...RRR.R',
    'RR..R..R',
  ]],
  ['turf', 10, 0, 'solid', [
    'G.GG.G.G',
    'GGGGGGGG',
    '.GRGGRG.',
    'RRRRRRR.',
    'RRRRRRR.',
    'RRRR.RR.',
    'RR.R.R..',
    '........',
  ]],
  ['crumbs_a', 11, 0, null, [
    '........',
    '..R.....',
    '......R.',
    '.R......',
    '....R...',
    '.......R',
    '..R..R..',
    '........',
  ]],
  ['crumbs_b', 12, 0, null, [
    'R.......',
    '....R...',
    '.R......',
    '.....R..',
    '........',
    '..R...R.',
    'R.......',
    '....R...',
  ]],
  ['crumbs_c', 13, 0, null, [
    '........',
    '...RR...',
    '..R..R..',
    '.....R.R',
    '.RR.....',
    'RRR..R..',
    '.R...RR.',
    '........',
  ]],
  ['crate', 14, 0, 'solid', [
    'yyyyyyyyyyyyyyy.',
    'yy...........yy.',
    'y.y.........y.y.',
    'y..y.......y..y.',
    'y...y.....y...y.',
    'y....y...y....y.',
    'y.....y.y.....y.',
    'y......y......y.',
    'y.....y.y.....y.',
    'y....y...y....y.',
    'y...y.....y...y.',
    'y..y.......y..y.',
    'y.y.........y.y.',
    'yy...........yy.',
    'yyyyyyyyyyyyyyy.',
    '................',
  ]],
  ['rock_small_b', 2, 1, 'solid', [
    '.RRRRR..',
    'RRRR.RR.',
    'RRRRRRR.',
    'RR.RRRR.',
    'RRRRRRR.',
    'RRRRR.R.',
    '.RR.R.R.',
    '........',
  ]],
  ['brick_c', 3, 1, 'solid', [
    'RRR.R.R.',
    'R.R.RRR.',
    'RRR.RR..',
    '........',
    'R.R.R.RR',
    '..RRR.R.',
    'R.R.R.RR',
    '........',
  ]],

  // ---- wood: jump-through platforms, braces, ladders (yellow) ------------
  ['plank_l', 5, 1, 'platform', [
    '.yyyyyyy',
    'yy.y.y.y',
    'yyyyyyyy',
    '........',
    '........',
    '........',
    '........',
    '........',
  ]],
  ['plank_m', 6, 1, 'platform', [
    'yyyyyyyy',
    '.y.y.y.y',
    'yyyyyyyy',
    '........',
    '........',
    '........',
    '........',
    '........',
  ]],
  ['plank_r', 7, 1, 'platform', [
    'yyyyyyy.',
    '.y.y.yy.',
    'yyyyyyy.',
    '........',
    '........',
    '........',
    '........',
    '........',
  ]],
  // Diagonal brace under a plank; flip it horizontally in Tiled for the other direction.
  ['strut', 8, 1, null, [
    'yy......',
    '.yy.....',
    '..yy....',
    '...yy...',
    '....yy..',
    '.....yy.',
    '......yy',
    '.......y',
  ]],
  ['ladder_l', 9, 1, 'ladder', [
    '.y......',
    '.yyyyyyy',
    '.y......',
    '.y......',
    '.y......',
    '.yyyyyyy',
    '.y......',
    '.y......',
  ]],
  ['ladder_r', 10, 1, 'ladder', [
    '......y.',
    'yyyyyyy.',
    '......y.',
    '......y.',
    '......y.',
    'yyyyyyy.',
    '......y.',
    '......y.',
  ]],

  // ---- elevator car (cyan) - drawn by the game, not painted on the map ----
  ['elev_l', 11, 1, null, [
    '.CCCCCCC',
    'C...C...',
    'CC...C..',
    'C.C...C.',
    '.CCCCCCC',
    '........',
    '........',
    '........',
  ]],
  ['elev_m', 12, 1, null, [
    'CCCCCCCC',
    'C...C...',
    '.C...C..',
    '..C...C.',
    'CCCCCCCC',
    '........',
    '........',
    '........',
  ]],
  ['elev_r', 13, 1, null, [
    'CCCCCCC.',
    'C...C.C.',
    '.C...CC.',
    '..C...C.',
    'CCCCCCC.',
    '........',
    '........',
    '........',
  ]],

  // ---- foreground decoration --------------------------------------------
  ['moss_a', 0, 2, null, [
    'gg.ggg.g',
    'g..g.g.g',
    'g..g...g',
    'g.gg....',
    '...g....',
    '..g.....',
    '........',
    '........',
  ]],
  ['moss_b', 1, 2, null, [
    'g.gggg.g',
    'g..g...g',
    'g.ggg..g',
    '.g...g.g',
    '.g...g.g',
    '..ggg...',
    '........',
    '........',
  ]],
  ['grass_a', 2, 2, null, [
    '........',
    '........',
    '........',
    '........',
    '....G...',
    '.G..G.G.',
    '.G.G.GG.',
    'G.G.GG.G',
  ]],
  ['grass_b', 3, 2, null, [
    '........',
    '........',
    '........',
    '........',
    '......G.',
    'G.G..G..',
    '.GG.G.G.',
    '.G.GG..G',
  ]],
  ['skull', 4, 2, null, [
    '........',
    '........',
    '........',
    '........',
    '..WWW...',
    '.W.W.W..',
    '.WWWWW..',
    '..W.W...',
  ]],
  ['lantern', 5, 2, null, [
    '...w....',
    '...w....',
    '..yyy...',
    '.yYYYy..',
    '.yYWYy..',
    '.yYYYy..',
    '..yyy...',
    '........',
  ]],
  ['rail', 6, 2, null, [
    '........',
    '........',
    '........',
    '........',
    '........',
    'wwwwwwww',
    '.w...w..',
    '.w...w..',
  ]],
  ['minecart', 7, 2, null, [
    '...YY.Y.YYY.Y...',
    '..YYYYYYYYYYYY..',
    'wwwwwwwwwwwwwwww',
    '.w.w.w.w.w.w.w..',
    '.wwwwwwwwwwwwww.',
    '..wwwwwwwwwwww..',
    '..WW........WW..',
    '.W..W......W..W.',
  ]],
  ['mushroom', 9, 2, null, [
    '........',
    '........',
    '........',
    '...MM...',
    '..MMMM..',
    '.MM.MMM.',
    '...ww...',
    '...ww...',
  ]],
  ['pickaxe', 10, 2, null, [
    '........',
    '..WWW...',
    '.W..yW..',
    '....y.W.',
    '...y....',
    '..y.....',
    '.y......',
    'y.......',
  ]],

  // ---- treasure: picked up by the player; the game removes them from the map ----
  ['tin', 11, 2, null, [
    '........',
    '........',
    '..WWWW..',
    '.WwwwwW.',
    'WWWWWWWW',
    'WwwwwwwW',
    'WWWWWWWW',
    '........',
  ], { treasure: 'tin' }],
  ['gold', 12, 2, null, [
    '........',
    '...YY...',
    '..YYyY..',
    '.YyYYYY.',
    '.YYYYyY.',
    'YYyYYYYY',
    '.YYYYYy.',
    '........',
  ], { treasure: 'gold' }],
  // Drawn white: the game tints jewels through flashing colours.
  ['jewel', 13, 2, null, [
    '........',
    '..WWWW..',
    '.W.WW.W.',
    'WWWWWWWW',
    '.W.WW.W.',
    '..W..W..',
    '...WW...',
    '........',
  ], { treasure: 'jewel' }],

  // ---- background (blue) ------------------------------------------------
  ['bgrock_a', 0, 3, null, [
    '........',
    '..bbbb..',
    '.b.b.bb.',
    '.b....b.',
    '........',
    '........',
    '........',
    '........',
  ]],
  ['bgrock_b', 1, 3, null, [
    '........',
    '........',
    '........',
    '.....bb.',
    '...bb.b.',
    '..b....b',
    '..b.....',
    '........',
  ]],
  ['bgrock_c', 2, 3, null, [
    '........',
    '........',
    'bbbbb...',
    'b.b..b..',
    'b....b..',
    '........',
    '........',
    '........',
  ]],
  ['bgrock_d', 3, 3, null, [
    '........',
    '........',
    '........',
    '........',
    '..b.....',
    '.b.bbb..',
    '.b...b..',
    '........',
  ]],
  ['bg_brick', 4, 3, null, [
    'bbb.bbb.',
    'bbb.bbb.',
    'bbb.bbb.',
    '........',
    'b.bbb.bb',
    'b.bbb.bb',
    'b.bbb.bb',
    '........',
  ]],
  ['bg_dots', 5, 3, null, [
    '........',
    '.b......',
    '.....b..',
    '........',
    '..b.....',
    '......b.',
    '........',
    '...b....',
  ]],
  ['beam', 6, 3, null, [
    'bbbbbbbb',
    'b.bbb.bb',
    'bbbbbbbb',
    '........',
    '........',
    '........',
    '........',
    '........',
  ]],
  ['post', 7, 3, null, [
    '..bbbb..',
    '..b.bb..',
    '..bbbb..',
    '..bb.b..',
    '..bbbb..',
    '..bbbb..',
    '..b.bb..',
    '..bbbb..',
  ]],
  ['post_top', 8, 3, null, [
    'bbbbbbbb',
    'b.bbb.bb',
    'bbbbbbbb',
    '.bbbbbb.',
    '..bbbb..',
    '..b.bb..',
    '..bbbb..',
    '..bbbb..',
  ]],
  // Elevator guides, painted along an elevator's path.
  ['cable_l', 9, 3, null, [
    '.c......',
    '.c......',
    '.c......',
    '.c......',
    '.c......',
    '.c......',
    '.c......',
    '.c......',
  ]],
  ['cable_r', 10, 3, null, [
    '......c.',
    '......c.',
    '......c.',
    '......c.',
    '......c.',
    '......c.',
    '......c.',
    '......c.',
  ]],
  ['track_h', 11, 3, null, [
    '........',
    '........',
    '........',
    '........',
    '........',
    '........',
    'bbbbbbbb',
    '.b...b..',
  ]],

  // ---- surface sky ------------------------------------------------------
  ['sky', 0, 4, null, Array(8).fill('bbbbbbbb')],
  ['sky_fade_a', 1, 4, null, [
    'bbbbbbbb',
    'bbbbbbbb',
    'b.bbb.bb',
    'bbbbbbbb',
    '.b.b.b.b',
    'b.b.b.b.',
    '.b...b..',
    'b...b...',
  ]],
  ['sky_fade_b', 2, 4, null, [
    '.b...b..',
    '...b...b',
    'b.......',
    '....b...',
    '..b.....',
    '......b.',
    '........',
    '...b....',
  ]],
  ['cloud', 3, 4, null, [
    'bbbbbbWWWbbbbbbb',
    'bbbbWWbWWWbbbbbb',
    'bbbWWWWWbWWWWbbb',
    'bbWWbWWWWWbWWWbb',
    'bWWWWWbWWWWWbWWb',
    'bWbWWWWWbWWWWWbb',
    'bbbbbbbbbbbbbbbb',
    'bbbbbbbbbbbbbbbb',
  ]],
  ['cloud_dark', 5, 4, null, [
    '................',
    '......bbb.......',
    '....bb.bbb.bb...',
    '...bbbbb.bbbbb..',
    '..bb.bbbbb.bbbb.',
    '.bbbbb.bbbbb.bb.',
    '................',
    '................',
  ]],
];

const SUFFIXES = {
  '2x2': ['tl', 'tr', 'bl', 'br'],
  '2x1': ['l', 'r'],
  '1x2': ['t', 'b'],
};

const ROWS = Math.max(...PIECES.map(([, , row, , bmp]) => row + bmp.length / T));
const pngPath = `${ROOT}assets/mine-tiles.png`;
const force = process.argv.includes('--force');
const existing = existsSync(pngPath) && !force ? decodePNG(readFileSync(pngPath)) : null;
const width = Math.max(COLUMNS * T, existing?.width ?? 0);
const height = Math.max(ROWS * T, existing?.height ?? 0);
const pixels = new Uint8Array(width * height * 4);
if (existing) {
  for (let y = 0; y < existing.height; y++) {
    pixels.set(existing.pixels.subarray(y * existing.width * 4, (y + 1) * existing.width * 4), y * width * 4);
  }
}
// Is this pixel rectangle completely transparent (nothing drawn there yet)?
const emptyRect = (x0, y0, w, h) => {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (pixels[(y * width + x) * 4 + 3]) return false;
  return true;
};
const used = new Set();
const tiles = [];
const added = [];

for (const [name, col, row, collision, bmp, extra = {}] of PIECES) {
  const tw = bmp[0].length / T;
  const th = bmp.length / T;
  if (!Number.isInteger(tw) || !Number.isInteger(th) || bmp.some((l) => l.length !== bmp[0].length)) {
    throw new Error(`${name}: bitmap must be a whole number of 8x8 tiles with equal row lengths`);
  }
  const paint = !existing || emptyRect(col * T, row * T, bmp[0].length, bmp.length);
  if (paint && existing) added.push(name);
  if (paint) bmp.forEach((line, y) => {
    for (let x = 0; x < line.length; x++) {
      const ch = line[x];
      if (ch === '.') continue;
      if (!(ch in INK)) throw new Error(`${name}: unknown colour '${ch}'`);
      const i = ((row * T + y) * width + col * T + x) * 4;
      pixels[i] = INK[ch] >> 16;
      pixels[i + 1] = (INK[ch] >> 8) & 0xff;
      pixels[i + 2] = INK[ch] & 0xff;
      pixels[i + 3] = 255;
    }
  });
  const names = tw * th === 1 ? [name] : SUFFIXES[`${tw}x${th}`].map((s) => `${name}_${s}`);
  for (let ty = 0; ty < th; ty++) {
    for (let tx = 0; tx < tw; tx++) {
      const id = (row + ty) * COLUMNS + col + tx;
      if (used.has(id)) throw new Error(`${name}: overlaps tile ${id}`);
      used.add(id);
      const properties = [{ name: 'name', type: 'string', value: names[ty * tw + tx] }];
      if (collision) properties.push({ name: 'collision', type: 'string', value: collision });
      for (const [k, v] of Object.entries(extra)) properties.push({ name: k, type: 'string', value: v });
      tiles.push({ id, properties });
    }
  }
}
tiles.sort((a, b) => a.id - b.id);

if (existing && !added.length) {
  console.log('assets/mine-tiles.png already has every tile - left untouched');
} else {
  writeFileSync(pngPath, encodePNG(width, height, pixels));
  console.log(existing ? `added to assets/mine-tiles.png: ${added.join(', ')}` : `wrote assets/mine-tiles.png (${width}x${height})`);
}

// ---- player sprite strip: 8x16 frames, facing right ---------------------------
const HEAD = ['..YYYY..', '.YYYYYYW', 'YYYYYYY.', '..wwww..', '..ww.w..', '..wwww..', '...ww...'];
const TORSO = ['.cccccc.', 'c.cccc.c', 'c.cccc.c', 'w.cccc.w'];
const PLAYER_FRAMES = {
  stand: [...HEAD, ...TORSO, '..BBBB..', '..BB.BB.', '..B...B.', '..B...B.', '.WW..WW.'],
  walk_a: [...HEAD, ...TORSO, '..BBBB..', '.BB..BB.', 'BB....B.', 'B.....BB', 'WW.....W'],
  walk_b: [...HEAD, ...TORSO, '..BBBB..', '...BB...', '...BB...', '...BB...', '...WWW..'],
  jump: [...HEAD, 'w.cccc.w', 'c.cccc.c', '..cccc..', '..cccc..', '..BBBB..', '.BB..BB.', '.B....B.', '.WW..WW.', '........'],
  climb_a: [
    '..YYYY..', '.YYYYYY.', 'YYYYYYYY', '..wwww..', 'w.wwww..', 'c..ww...', 'cccccc..', '.cccccc.',
    '..ccccw.', '..cccc..', '..BBBB..', '..BB.BB.', '..B..BB.', '..B...B.', '..B...W.', '.WW.....',
  ],
};
PLAYER_FRAMES.climb_b = PLAYER_FRAMES.climb_a.map((l) => [...l].reverse().join(''));
const frames = Object.values(PLAYER_FRAMES);
const pw = frames.length * T;
const playerPixels = new Uint8Array(pw * 16 * 4);
frames.forEach((bmp, f) => {
  if (bmp.length !== 16 || bmp.some((l) => l.length !== T)) throw new Error(`player frame ${f} must be 8x16`);
  bmp.forEach((line, y) => {
    for (let x = 0; x < T; x++) {
      const ch = line[x];
      if (ch === '.') continue;
      const i = (y * pw + f * T + x) * 4;
      playerPixels.set([INK[ch] >> 16, (INK[ch] >> 8) & 0xff, INK[ch] & 0xff, 255], i);
    }
  });
});
const playerPath = `${ROOT}assets/player.png`;
if (existsSync(playerPath) && !process.argv.includes('--force')) {
  console.log('assets/player.png exists - left untouched (use --force to regenerate)');
} else {
  writeFileSync(playerPath, encodePNG(pw, 16, playerPixels));
  console.log(`wrote assets/player.png (${frames.length} frames: ${Object.keys(PLAYER_FRAMES).join(', ')})`);
}

const tileset = {
  type: 'tileset',
  version: '1.10',
  tiledversion: '1.11.0',
  name: 'mine',
  tilewidth: T,
  tileheight: T,
  spacing: 0,
  margin: 0,
  columns: COLUMNS,
  tilecount: COLUMNS * (height / T),
  image: 'mine-tiles.png',
  imagewidth: width,
  imageheight: height,
  tiles,
};
writeFileSync(`${ROOT}assets/mine.tsj`, JSON.stringify(tileset, null, 1) + '\n');
console.log(`wrote assets/mine.tsj (${tiles.length} named tiles)`);
