// Piano keyboard - ported from home_screen.dart _buildKey()
import { generatePianoKeys } from './midi-data.js';
import { state } from './state.js';
import * as audio from './audio-engine.js';

const pianoElements = new Map(); // midi -> DOM element

const NOTE_NAMES_PIANO = ['Dó', 'Dó#', 'Ré', 'Ré#', 'Mi', 'Fá', 'Fá#', 'Sol', 'Sol#', 'Lá', 'Lá#', 'Si'];

// Nome da nota com transpose do teclado aplicado (igual a _keyboardNoteName do Flutter)
function keyLabel(midi) {
  const t = audio.getTranspose(false); // keyboard transpose
  const n = midi + t;
  return NOTE_NAMES_PIANO[((n % 12) + 12) % 12];
}

// Re-aplica os labels em todas as teclas (chamado quando transpose muda)
export function refreshLabels() {
  for (const [midi, el] of pianoElements) {
    el.textContent = keyLabel(midi);
  }
}

// Black key positions relative to white keys in an octave
// C=0, D=1, E=2, F=3, G=4, A=5, B=6
// Black keys sit between: C#(0-1), D#(1-2), F#(3-4), G#(4-5), A#(5-6)
const BLACK_KEY_OFFSETS = {
  1: 0,   // C#: between C and D
  3: 1,   // D#: between D and E
  6: 3,   // F#: between F and G
  8: 4,   // G#: between G and A
  10: 5,  // A#: between A and B
};

export function render(container) {
  container.innerHTML = '';

  const keys = generatePianoKeys(48, 72); // C4 to C6 (25 teclas)
  const whiteKeys = keys.filter(k => !k.accidental);
  const blackKeys = keys.filter(k => k.accidental);

  // Calculate key width dynamically to fill available space
  const containerParent = container.parentElement;
  const availableWidth = containerParent.clientWidth;
  const gap = 3;
  const whiteKeyWidth = Math.floor((availableWidth - (whiteKeys.length - 1) * gap) / whiteKeys.length);
  const blackKeyWidth = Math.floor(whiteKeyWidth * 0.65);

  const totalWidth = whiteKeys.length * whiteKeyWidth + (whiteKeys.length - 1) * gap;
  container.style.width = `${totalWidth}px`;
  container.style.position = 'relative';

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  // Render white keys
  whiteKeys.forEach((key, index) => {
    const el = document.createElement('div');
    el.className = 'key key-white';
    el.dataset.midi = key.midi;
    el.textContent = keyLabel(key.midi);
    el.style.width = `${whiteKeyWidth}px`;
    el.style.position = 'absolute';
    el.style.left = `${index * (whiteKeyWidth + gap)}px`;
    el.style.top = '0';
    el.style.bottom = '0';

    setupKeyEvents(el, key.midi, false);
    pianoElements.set(key.midi, el);
    container.appendChild(el);
  });

  // Render black keys
  blackKeys.forEach((key) => {
    const noteInOctave = key.midi % 12;
    const octave = Math.floor(key.midi / 12) - 4; // relative octave from C4

    // Find which white key index this black key sits after
    const whiteKeysBefore = whiteKeys.filter(w => w.midi < key.midi).length;
    const leftPos = whiteKeysBefore * (whiteKeyWidth + gap) - (blackKeyWidth / 2) - (gap / 2);

    const el = document.createElement('div');
    el.className = 'key key-black';
    el.dataset.midi = key.midi;
    el.textContent = keyLabel(key.midi);
    el.style.width = `${blackKeyWidth}px`;
    el.style.left = `${leftPos}px`;

    setupKeyEvents(el, key.midi, false);
    pianoElements.set(key.midi, el);
    container.appendChild(el);
  });

  // Listen for state changes
  state.on('piano', ({ midi, on }) => {
    const el = pianoElements.get(midi);
    if (el) {
      el.classList.toggle('active', on);
    }
  });
}

function setupKeyEvents(el, midi, isBass) {
  // HOT PATH: áudio primeiro, UI/state depois
  el.addEventListener('pointerdown', (e) => {
    audio.noteOn(midi, 100, false);   // 1º: som
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    state.pianoNoteOn(midi);          // 2º: visual
  }, { passive: false });

  el.addEventListener('pointerup', (e) => {
    audio.noteOff(midi, false);
    e.preventDefault();
    state.pianoNoteOff(midi);
  }, { passive: false });

  el.addEventListener('pointercancel', () => {
    audio.noteOff(midi, false);
    state.pianoNoteOff(midi);
  });

  el.addEventListener('pointerleave', () => {
    if (state.isPianoActive(midi)) {
      audio.noteOff(midi, false);
      state.pianoNoteOff(midi);
    }
  });
}
