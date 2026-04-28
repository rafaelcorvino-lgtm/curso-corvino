// metronome.js — Web Audio click compartilhado por score-player e synthesia.
// Triangle wave curto, com fundamental forte na 1ª batida do compasso.

let audioCtx = null;

export function ensureAudioCtx() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

// Agenda um click `offsetSeconds` no futuro. `strong=true` na 1ª batida
// do compasso (mais aguda + alta). Retorna o oscillator pra poder parar.
export function scheduleClick(offsetSeconds, strong) {
  const ctx = ensureAudioCtx();
  if (!ctx) return null;
  const t0 = ctx.currentTime + offsetSeconds;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  // triangle em vez de sine: mais harmônicos → percebido como mais alto
  osc.type = 'triangle';
  osc.frequency.value = strong ? 1800 : 1000;
  // envelope curto e ALTO
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(strong ? 2.5 : 2.0, t0 + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + 0.07);
  return osc;
}
