import { getPrefs } from './prefs';

// Tiny synthesized sound effects (no audio assets to ship or license).
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (!getPrefs().sound) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.2) {
  const a = audio();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, a.currentTime + start);
  const vol = gain * getPrefs().volume;
  g.gain.setValueAtTime(0.0001, a.currentTime + start);
  g.gain.exponentialRampToValueAtTime(vol, a.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + dur);
  o.connect(g).connect(a.destination);
  o.start(a.currentTime + start);
  o.stop(a.currentTime + start + dur + 0.05);
}

export const sfx = {
  click: () => tone(660, 0, 0.06, 'square', 0.06),
  lock: () => tone(520, 0, 0.12, 'triangle', 0.15),
  tick: () => tone(1200, 0, 0.04, 'square', 0.04),
  correct: () => {
    tone(660, 0, 0.12, 'triangle');
    tone(990, 0.1, 0.2, 'triangle');
  },
  wrong: () => {
    tone(220, 0, 0.18, 'sawtooth', 0.12);
    tone(160, 0.12, 0.25, 'sawtooth', 0.1);
  },
  start: () => [440, 554, 659, 880].forEach((f, i) => tone(f, i * 0.09, 0.18, 'triangle', 0.14)),
  victory: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.25, 'triangle', 0.16)),
  defeat: () => [392, 330, 262].forEach((f, i) => tone(f, i * 0.18, 0.3, 'sine', 0.14)),
};
