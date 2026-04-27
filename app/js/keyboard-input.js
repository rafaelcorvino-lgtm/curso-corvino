// Teclado do computador → Corvino (mão direita 5 notas + baixo 4 colunas x 4 tipos)
// Permite o aluno experimentar o curso sem ter o Corvino físico.
//
// Mapeamento por POSIÇÃO FÍSICA da tecla (event.code), funciona em qualquer
// layout (ABNT, US, Dvorak). A exibição visual atualiza com event.key real.
//
// Mão direita (linha do meio):
//   H  J  K  L  Ç
//   Dó Ré Mi Fá Sol
//
// Mão esquerda (matriz 4 linhas × 4 colunas, baseada na coluna vertical
// do acordeon: contrabaixo, fundamental, maior, menor):
//
//          Fá    Dó    Sol   Ré
//   cbx:    1     2     3     4
//   fund:   Q     W     E     R
//   maior:  A     S     D     F
//   menor:  Z     X     C     V

import * as audio from './audio-engine.js';
import { state } from './state.js';

// Cada entry: { midi, isBass, row (só pro baixo — posiciona o hint visual) }
// row usa o MESMO índice do BASS_ROWS do midi-data.js:
//   0 = acordes 7ª, 1 = menores, 2 = maiores, 3 = fund, 4 = contrabaixo
const KEY_MAP = {
  // --- Mão direita (piano) ---
  KeyH:      { midi: 48, isBass: false },
  KeyJ:      { midi: 50, isBass: false },
  KeyK:      { midi: 52, isBass: false },
  KeyL:      { midi: 53, isBass: false },
  Semicolon: { midi: 55, isBass: false },

  // --- Mão esquerda (baixo) ---
  // Coluna Dó (pos 6)
  Digit2: { midi: 28, isBass: true, row: 4 }, // contrabaixo
  KeyW:   { midi: 24, isBass: true, row: 3 }, // fundamental
  KeyS:   { midi: 25, isBass: true, row: 2 }, // maior
  KeyX:   { midi: 36, isBass: true, row: 1 }, // menor
  // Coluna Fá (pos 7)
  Digit1: { midi: 33, isBass: true, row: 4 },
  KeyQ:   { midi: 29, isBass: true, row: 3 },
  KeyA:   { midi: 30, isBass: true, row: 2 },
  KeyZ:   { midi: 41, isBass: true, row: 1 },
  // Coluna Sol (pos 5)
  Digit3: { midi: 35, isBass: true, row: 4 },
  KeyE:   { midi: 31, isBass: true, row: 3 },
  KeyD:   { midi: 32, isBass: true, row: 2 },
  KeyC:   { midi: 43, isBass: true, row: 1 },
  // Coluna Ré (pos 4)
  Digit4: { midi: 54, isBass: true, row: 4 },
  KeyR:   { midi: 26, isBass: true, row: 3 },
  KeyF:   { midi: 27, isBass: true, row: 2 },
  KeyV:   { midi: 38, isBass: true, row: 1 },
};

// Labels padrão (ABNT) — ajustados via event.key no primeiro keypress
const DEFAULT_LABELS = {
  KeyH: 'H',       KeyJ: 'J', KeyK: 'K', KeyL: 'L', Semicolon: 'Ç',
  Digit1: '1',     Digit2: '2', Digit3: '3', Digit4: '4',
  KeyQ: 'Q',       KeyW: 'W', KeyE: 'E', KeyR: 'R',
  KeyA: 'A',       KeyS: 'S', KeyD: 'D', KeyF: 'F',
  KeyZ: 'Z',       KeyX: 'X', KeyC: 'C', KeyV: 'V',
};

let enabled = false;
const activeCodes = new Set();
const labels = { ...DEFAULT_LABELS };

function onKeyDown(e) {
  if (!enabled) return;
  const entry = KEY_MAP[e.code];
  if (!entry) return;
  if (e.repeat) { e.preventDefault(); return; }
  if (activeCodes.has(e.code)) return;

  // Adapta o label ao layout real do usuário, se diferente
  if (e.key && e.key.length === 1) {
    const key = e.key.toUpperCase();
    if (labels[e.code] !== key) {
      labels[e.code] = key;
      refreshHintLabels();
    }
  }

  activeCodes.add(e.code);
  audio.noteOn(entry.midi, 100, entry.isBass);
  if (entry.isBass) state.bassNoteOn(entry.midi);
  else state.pianoNoteOn(entry.midi);
  e.preventDefault();
}

function onKeyUp(e) {
  if (!enabled) return;
  const entry = KEY_MAP[e.code];
  if (!entry) return;
  if (!activeCodes.has(e.code)) return;
  activeCodes.delete(e.code);
  audio.noteOff(entry.midi, entry.isBass);
  if (entry.isBass) state.bassNoteOff(entry.midi);
  else state.pianoNoteOff(entry.midi);
  e.preventDefault();
}

function releaseAll() {
  for (const code of activeCodes) {
    const entry = KEY_MAP[code];
    if (!entry) continue;
    audio.noteOff(entry.midi, entry.isBass);
    if (entry.isBass) state.bassNoteOff(entry.midi);
    else state.pianoNoteOff(entry.midi);
  }
  activeCodes.clear();
}

// Encontra o botão/tecla DOM correspondente a uma entrada KEY_MAP
function findTargetEl(entry) {
  if (!entry.isBass) {
    return document.querySelector(`.key[data-midi="${entry.midi}"]`);
  }
  // Pro baixo tem múltiplos botões com mesmo MIDI em linhas diferentes —
  // usa também data-row pra desambiguar.
  return document.querySelector(
    `.bass-btn[data-midi="${entry.midi}"][data-row="${entry.row}"]`
  );
}

export function attachHints() {
  for (const [code, entry] of Object.entries(KEY_MAP)) {
    const el = findTargetEl(entry);
    if (!el) continue;
    let hint = el.querySelector('.kbd-hint');
    if (!hint) {
      hint = document.createElement('span');
      hint.className = 'kbd-hint';
      if (entry.isBass) hint.classList.add('kbd-hint-bass');
      el.appendChild(hint);
    }
    hint.textContent = labels[code];
    hint.style.display = enabled ? 'block' : 'none';
  }
}

function refreshHintLabels() {
  for (const [code, entry] of Object.entries(KEY_MAP)) {
    const el = findTargetEl(entry);
    const hint = el?.querySelector('.kbd-hint');
    if (hint) hint.textContent = labels[code];
  }
}

function refreshHintVisibility() {
  document.querySelectorAll('.kbd-hint').forEach(h => {
    h.style.display = enabled ? 'block' : 'none';
  });
}

export function setEnabled(on) {
  if (enabled === on) return;
  enabled = !!on;
  if (!enabled) releaseAll();
  refreshHintVisibility();

  const btn = document.getElementById('kbd-toggle');
  if (btn) btn.classList.toggle('on', enabled);
}

export function toggle() {
  setEnabled(!enabled);
}

export function isEnabled() {
  return enabled;
}

export function init() {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', releaseAll);

  const btn = document.getElementById('kbd-toggle');
  if (btn) btn.addEventListener('click', toggle);
}
