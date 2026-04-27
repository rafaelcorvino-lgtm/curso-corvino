// Embed API — permite que uma página "hospedeira" (aula do curso) controle
// o áudio do Corvino via postMessage, sem precisar duplicar synth/SF2.
//
// Mensagens aceitas (window.postMessage):
//   { type: 'corvino:noteOn',  midi: 48, isBass: false, velocity: 100 }
//   { type: 'corvino:noteOff', midi: 48, isBass: false }
//   { type: 'corvino:allOff' }            // solta todas as notas ativas
//   { type: 'corvino:ping' }              // handshake; responde { type: 'corvino:pong' }
//
// A aula hospedeira responde a 'corvino:pong' pra saber que o engine está
// pronto (splash terminou, SF2 carregado). Até receber o pong, os
// exemplos sonoros ficam desabilitados.

import * as audio from './audio-engine.js';
import { state } from './state.js';

const active = new Set(); // "midi:isBass" — pra all-off

function onMessage(ev) {
  const d = ev.data;
  if (!d || typeof d !== 'object' || typeof d.type !== 'string') return;
  if (!d.type.startsWith('corvino:')) return;

  try {
    switch (d.type) {
      case 'corvino:ping':
        ev.source?.postMessage({ type: 'corvino:pong' }, '*');
        break;
      case 'corvino:noteOn': {
        const vel = typeof d.velocity === 'number' ? d.velocity : 100;
        audio.noteOn(d.midi, vel, !!d.isBass);
        // Feedback visual nas próprias teclas do app também
        if (d.isBass) state.bassNoteOn(d.midi);
        else state.pianoNoteOn(d.midi);
        active.add(`${d.midi}:${!!d.isBass}`);
        break;
      }
      case 'corvino:noteOff':
        audio.noteOff(d.midi, !!d.isBass);
        if (d.isBass) state.bassNoteOff(d.midi);
        else state.pianoNoteOff(d.midi);
        active.delete(`${d.midi}:${!!d.isBass}`);
        break;
      case 'corvino:allOff':
        for (const key of active) {
          const [midiStr, isBassStr] = key.split(':');
          const midi = parseInt(midiStr, 10);
          const isBass = isBassStr === 'true';
          audio.noteOff(midi, isBass);
          if (isBass) state.bassNoteOff(midi);
          else state.pianoNoteOff(midi);
        }
        active.clear();
        break;
    }
  } catch (err) {
    console.error('[corvino embed-api]', err);
  }
}

export function init() {
  window.addEventListener('message', onMessage);
  // Anuncia que a API está online (caso a aula esteja aguardando)
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: 'corvino:ready' }, '*');
  }
}
