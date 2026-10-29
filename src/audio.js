// Tiny 1-bit-ish "beeper" using square waves.
let ctx = null;
let muted = false;

addEventListener('keydown', () => {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
});

function tone(f0, f1, dur, { type = 'square', vol = 0.05, delay = 0 } = {}) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.linearRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

const arpeggio = (notes, step) => notes.forEach((f, i) => tone(f, f, step, { delay: i * step }));

export const sfx = {
  jump: () => tone(220, 660, 0.18, { vol: 0.03 }),
  collect: () => { tone(880, 880, 0.05); tone(1320, 1320, 0.08, { delay: 0.05 }); },
  die: () => tone(700, 40, 0.8, { type: 'sawtooth', vol: 0.06 }),
  gate: () => arpeggio([523, 659, 784, 1047], 0.09),
  start: () => arpeggio([392, 523, 659, 784], 0.07),
  gameOver: () => arpeggio([392, 330, 262, 196], 0.18),
  win: () => arpeggio([523, 659, 784, 1047, 784, 1047, 1319], 0.12),
  toggleMute() { muted = !muted; return muted; },
  get muted() { return muted; },
};
