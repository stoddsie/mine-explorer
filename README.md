# Mine Explorer (working title)

A ZX Spectrum-style scrolling platformer prototype built with Three.js. The screen is the
Spectrum's 256x192; the play window (32x16 tiles) follows the player around a much larger
map, which can be many screens tall.

## Run

```
npm install
npm run dev      # then open the URL Vite prints
```

`?level=<name>` picks a map from `levels/` (e.g. `?level=old-workings`); otherwise the first one is used.

## Controls

| Key | Action |
| --- | --- |
| Left / Right (or A / D) | Walk; step off a ladder |
| Up / Down (or W / S) | Climb ladders. Up jumps when there's no ladder; Down drops through wooden planks |
| Space | Jump (hold a direction while on a ladder to leap off it) |
| R | Back to the start point |
| Esc / P | Pause |
| M | Sound on/off |

## How it plays

- Rock, bricks and crates are solid from every side. Wooden planks can be jumped up through and dropped down through.
- Ladders are two tiles wide. The top rung works as a floor, so you can walk across the top of a ladder shaft.
- Elevators (cyan) shuttle up/down or left/right, pausing at each end. Stand on one to ride it.
- No enemies, collectables or fall damage yet.

## Graphics: `assets/mine-tiles.png`

An ordinary PNG of 8x8 tiles, 16 per row - open it in any paint program, edit, save, and the
game reloads with your changes. Keep tiles in the same grid position (the maps refer to tiles
by position). Transparent pixels show whatever is behind: the background layer, then black.

Bigger features are made from several tiles placed together (e.g. the big rock block is 2x2,
the crate 2x2, the wide block 2x1).

| Rows | Contents |
| --- | --- |
| 0-1 | Foreground rock (red): big/wide/tall/small blocks, bricks, cobbles, turf, crumbly edges, crate; wooden planks, brace, ladder (yellow); elevator car (cyan) |
| 2 | Foreground decoration: moss, grass, skull, lantern, rail, minecart, mushroom, pickaxe |
| 3 | Background (blue): cave-wall texture, back bricks, timber beams/posts, elevator cables/track |
| 4 | Sky, sky fade, clouds |

Each tile's name and collision type live in `assets/mine.tsj` (a Tiled tileset). Collision is
one of `solid`, `platform`, `ladder`, or none. To add a tile, draw it into a free slot and give it
properties in Tiled's tileset editor (or add it to `tools/make-tiles.mjs`).

The player is in `assets/player.png`: six 8x16 frames, facing right - stand, walk A, walk B, jump, climb A, climb B.

## Maps: `levels/*.json`

Maps are [Tiled](https://www.mapeditor.org) maps - open `levels/old-workings.json` in Tiled to edit. Each map has:

- **background** tile layer - decoration only, drawn behind everything (the blue stuff).
- **foreground** tile layer - what you stand on and collide with, plus foreground decoration (the red stuff).
- **objects** layer:
  - a point named `start` (the player's feet),
  - rectangles of type `elevator` (the car's start position and width) with properties
    `axis` (`x` or `y`), `travel` (tiles, right/down), `speed` (px/s) and `pause` (seconds).
- Map properties `name` (shown in the HUD) and `surfaceRow` (depth 0, for the depth readout).

Maps can be any size. To add a new one, copy a map (or create one in Tiled using `assets/mine.tsj`) into `levels/`.

## Generator scripts

The starting tiles and level were produced by scripts; you don't need them to edit things by hand.

- `npm run tiles` - rewrites `assets/mine.tsj` from `tools/make-tiles.mjs`. It won't overwrite the PNGs unless you pass `-- --force`.
- `npm run level` - **overwrites** `levels/old-workings.json` from the layout in `tools/make-level.mjs`
  (carve tunnels out of rock, then auto-dress it with block styles, crumbly edges, braces, moss, etc.).

## Project layout

| File | What it does |
| --- | --- |
| `src/config.js` | Tuning: speeds, jump height, gravity, air control, camera follow |
| `src/level.js` | Loads a Tiled map + tileset; collision queries; pre-renders the layers in chunks |
| `src/player.js` | Movement, tile/elevator collision, ladders, animation |
| `src/elevator.js` | Moving platforms |
| `src/game.js` | Title/play states, camera, HUD with minimap |
| `src/main.js` | Asset loading, renderer (scrolling world view + fixed HUD), fixed-timestep loop |
