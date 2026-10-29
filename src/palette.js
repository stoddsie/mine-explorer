// ZX Spectrum 48K palette (normal + BRIGHT).
export const C = {
  black: 0x000000,
  blue: 0x0000d7,
  red: 0xd70000,
  magenta: 0xd700d7,
  green: 0x00d700,
  cyan: 0x00d7d7,
  yellow: 0xd7d700,
  white: 0xd7d7d7,
  brightBlue: 0x0000ff,
  brightRed: 0xff0000,
  brightMagenta: 0xff00ff,
  brightGreen: 0x00ff00,
  brightCyan: 0x00ffff,
  brightYellow: 0xffff00,
  brightWhite: 0xffffff,
};

// Colours collectables cycle through.
export const FLASH_CYCLE = [C.brightCyan, C.brightMagenta, C.brightYellow, C.brightGreen, C.brightWhite, C.brightRed];

export const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
