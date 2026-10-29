import '@fontsource/press-start-2p';
import * as THREE from 'three';
import { SCREEN_W, SCREEN_H, VIEW_W, VIEW_H, HUD_H, STEP } from './config.js';
import { Level } from './level.js';
import { Game } from './game.js';
import { input } from './input.js';

// Use palette hex values exactly as written - no colour-space conversion.
THREE.ColorManagement.enabled = false;

// Every Tiled map in levels/, the tilesets they use, and the PNGs those reference.
const MAPS = import.meta.glob('../levels/*.json', { eager: true, import: 'default' });
const TILESETS = import.meta.glob('../assets/*.tsj', { eager: true, query: '?raw', import: 'default' });
const IMAGES = import.meta.glob('../assets/*.png', { eager: true, query: '?url', import: 'default' });

const basename = (path) => path.split('/').pop();
const byName = (files, name) => Object.entries(files).find(([path]) => basename(path) === name)?.[1];

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Couldn't load ${url}`));
    img.src = url;
  });
}

// ?level=<file name without .json> picks a map; otherwise the first one alphabetically.
async function loadLevel() {
  const wanted = new URLSearchParams(location.search).get('level');
  const paths = Object.keys(MAPS).sort();
  const path = paths.find((p) => basename(p) === `${wanted}.json`) ?? paths[0];
  const map = MAPS[path];
  const tileset = JSON.parse(byName(TILESETS, basename(map.tilesets[0].source)));
  const image = await loadImage(byName(IMAGES, basename(tileset.image)));
  return new Level(map, tileset, image);
}

async function start() {
  // The HUD font must be ready before we rasterise any text.
  await document.fonts.load('8px "Press Start 2P"').catch(() => {});
  const level = await loadLevel();
  const playerTexture = await new THREE.TextureLoader().loadAsync(byName(IMAGES, 'player.png'));
  playerTexture.magFilter = playerTexture.minFilter = THREE.NearestFilter;
  playerTexture.generateMipmaps = false;

  // Render at the real Spectrum resolution, then scale the canvas up with crisp pixels.
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(1);
  renderer.setSize(SCREEN_W, SCREEN_H, false);
  renderer.setClearColor(0x000000);
  renderer.autoClear = false;
  document.getElementById('screen').appendChild(renderer.domElement);

  const fit = () => {
    const scale = Math.max(1, Math.floor(Math.min((innerWidth - 32) / SCREEN_W, (innerHeight - 32) / SCREEN_H)));
    renderer.domElement.style.width = `${SCREEN_W * scale}px`;
    renderer.domElement.style.height = `${SCREEN_H * scale}px`;
  };
  fit();
  addEventListener('resize', fit);

  // Two scenes, both in y-down pixel coordinates: the scrolling world (seen through the
  // 256x128 play window) and the fixed UI (HUD + text overlays) over the whole screen.
  const world = new THREE.Scene();
  const worldCamera = new THREE.OrthographicCamera(0, VIEW_W, 0, -VIEW_H, -10, 10);
  const ui = new THREE.Scene();
  const uiCamera = new THREE.OrthographicCamera(0, SCREEN_W, 0, -SCREEN_H, -10, 10);

  const game = new Game(world, ui, worldCamera, level, playerTexture);
  window.game = game; // handy for poking at from the console

  let last = performance.now();
  let acc = 0;
  renderer.setAnimationLoop((now) => {
    acc += Math.min((now - last) / 1000, 0.1);
    last = now;
    let stepped = false;
    while (acc >= STEP && !game.manualStep) { // manualStep: tests drive game.step() themselves
      game.step(STEP);
      acc -= STEP;
      stepped = true;
    }
    if (stepped) input.clearPressed();
    game.render();
    renderer.clear();
    renderer.setViewport(0, HUD_H, VIEW_W, VIEW_H);
    renderer.render(world, worldCamera);
    renderer.setViewport(0, 0, SCREEN_W, SCREEN_H);
    renderer.render(ui, uiCamera);
  });
}

start();
