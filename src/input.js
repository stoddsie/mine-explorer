// Keyboard state: `held` for movement, `pressed` for one-shot actions.
const held = new Set();
const pressed = new Set();
const GAME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space']);

addEventListener('keydown', (e) => {
  if (!e.repeat) pressed.add(e.code);
  held.add(e.code);
  if (GAME_KEYS.has(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => held.delete(e.code));
addEventListener('blur', () => held.clear());

const isDown = (...codes) => codes.some((c) => held.has(c));

export const input = {
  get left() { return isDown('ArrowLeft', 'KeyA'); },
  get right() { return isDown('ArrowRight', 'KeyD'); },
  get up() { return isDown('ArrowUp', 'KeyW'); },
  get down() { return isDown('ArrowDown', 'KeyS'); },
  get jump() { return isDown('Space'); },
  // True once per key press.
  consume(...codes) {
    for (const c of codes) {
      if (pressed.has(c)) {
        pressed.delete(c);
        return true;
      }
    }
    return false;
  },
  clearPressed() { pressed.clear(); },
};
