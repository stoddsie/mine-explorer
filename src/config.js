// Screen (ZX Spectrum: 256x192). The play window is the top 32x16 character cells;
// the map behind it can be any size and scrolls to follow the player.
export const TILE = 8;
export const SCREEN_W = 256;
export const SCREEN_H = 192;
export const VIEW_W = 256;
export const VIEW_H = 128;
export const HUD_H = SCREEN_H - VIEW_H; // 64

// Fixed simulation step.
export const STEP = 1 / 60;

// Player.
export const PLAYER_W = 8;
export const PLAYER_H = 16;
export const WALK_SPEED = 60; // px/s
export const CLIMB_SPEED = 40; // px/s
export const GRAVITY = 600; // px/s^2
export const JUMP_HEIGHT = 28; // px - enough to reach a platform 3 rows up
export const JUMP_SPEED = Math.sqrt(2 * GRAVITY * JUMP_HEIGHT);
export const MAX_FALL_SPEED = 200;
// Retro feel: horizontal motion is locked once you leave the ground.
export const AIR_CONTROL = false;

// Camera: how quickly it catches up with the player (higher = snappier).
export const CAMERA_FOLLOW = 10;

// Treasure: points for each kind (tiles carry a `treasure` property naming the kind).
export const TREASURE = {
  tin: { value: 10, label: 'TIN' },
  gold: { value: 50, label: 'GOLD' },
  jewel: { value: 100, label: 'JEWELS' },
};

// The flood. Speed and start delay come from each map (waterSpeed, waterDelay properties).
export const AIR_TIME = 4; // seconds you can hold your breath once your head is under
