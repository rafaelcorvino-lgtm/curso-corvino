// Teclado do computador → Corvino (mão direita 1 oitava completa + baixo 4 colunas x 4 tipos)
// Permite o aluno experimentar o curso sem ter o Corvino físico.
//
// Mapeamento por POSIÇÃO FÍSICA da tecla (event.code), funciona em qualquer
// layout (ABNT, US, Dvorak). A exibição visual atualiza com event.key real.
//
// Mão direita: brancas na linha do meio + pretas (sustenidos) na linha de cima
//
//   Linha cima:    Q  W  E  R  T   Y    U    I     O    P    [    ]
//   Pretas (#):                    Dó#  Ré#  (—)   Fá#  Sol# Lá#  (—)
//
//   Linha meio:    A  S  D  F  G   H    J    K     L    Ç    ~    ]
//   Brancas:                   Dó  Ré   Mi   Fá    Sol  Lá   Si   Dó(8va)
//
// Posição das pretas segue o piano: entre cada par de brancas adjacentes,
// EXCETO entre Mi-Fá (= I) e Si-Dó (= ]) — nesses pares já é semitom natural,
// não há preta no piano. Logo I e ] (linha cima) ficam sem nota.
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
  // --- Mão direita (piano) — escala de Dó completa (Dó4 a Dó5) ---
  // Convenção MIDI padrão: Dó4 = MIDI 60 (mesmo que o score-player e o
  // Synthesia usam). Antes mapeava G→48 (Dó3) — desalinhava com a
  // partitura que mostrava Dó4 acendendo no meio do teclado.
  KeyG:         { midi: 60, isBass: false }, // Dó4 (Dó central)
  KeyH:         { midi: 62, isBass: false }, // Ré4
  KeyJ:         { midi: 64, isBass: false }, // Mi4
  KeyK:         { midi: 65, isBass: false }, // Fá4
  KeyL:         { midi: 67, isBass: false }, // Sol4
  Semicolon:    { midi: 69, isBass: false }, // Lá4 (em ABNT2: Ç)
  Quote:        { midi: 71, isBass: false }, // Si4 (em ABNT2: ~ ou ')
  // Dó oitava acima: ] no ABNT2 brasileiro corresponde ao Backslash (event.code
  // é POSICIONAL — em US a mesma posição é '\'). Mapeamos ambos pra cobrir
  // layouts US e ABNT2/ABNT.
  Backslash:    { midi: 72, isBass: false }, // Dó5 — ABNT2: tecla ] (à direita do ~)
  BracketRight: { midi: 72, isBass: false }, // Dó5 — US: tecla ]

  // Pretas (sustenidos) — linha de cima, entre as brancas correspondentes
  KeyY:        { midi: 61, isBass: false }, // Dó#4 (entre G=Dó e H=Ré)
  KeyU:        { midi: 63, isBass: false }, // Ré#4 (entre H=Ré e J=Mi)
  KeyO:        { midi: 66, isBass: false }, // Fá#4 (entre K=Fá e L=Sol)
  KeyP:        { midi: 68, isBass: false }, // Sol#4 (entre L=Sol e Ç=Lá)
  // Lá# (entre Ç=Lá e ~=Si): em ABNT2 a tecla [ pode ter event.code diferente
  // do US — mapeamos múltiplos códigos pra cobrir layouts.
  BracketLeft: { midi: 70, isBass: false }, // Lá#4 — US e ABNT-US: tecla [

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

// Labels padrão (ABNT2) — ajustados via event.key no primeiro keypress
const DEFAULT_LABELS = {
  // Mão direita brancas: G H J K L Ç ~ ]
  KeyG: 'G',       KeyH: 'H', KeyJ: 'J', KeyK: 'K', KeyL: 'L',
  Semicolon: 'Ç', Quote: '~',
  Backslash: ']', BracketRight: ']',  // mesma nota (Dó 8va), 2 códigos diferentes (ABNT2 / US)
  // Mão direita pretas (sustenidos): Y U O P [
  KeyY: 'Y',       KeyU: 'U', KeyO: 'O', KeyP: 'P',
  BracketLeft: '[',
  // Mão esquerda
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

// ===== Relay pro parent (curso) =====
// O iframe normalmente "trava" os eventos de teclado: quem tem foco
// é a iframe, não o curso. O Synthesia (rodando no curso) precisa ver
// as teclas — então repassamos via postMessage. Capture phase, antes
// do nosso próprio onKeyDown.
function relayKeyToParent(e, evtName) {
  if (!window.parent || window.parent === window) return;
  try {
    window.parent.postMessage({
      type: 'corvino:keyForward',
      evt: evtName,           // 'keydown' | 'keyup'
      code: e.code,
      key: e.key,
      repeat: !!e.repeat,
    }, '*');
  } catch (_) {}
}

// Quando o curso pede pra desativar o teclado direto da iframe (Synthesia
// tomando conta), salvamos o estado e desligamos. No restore, voltamos.
let _savedEnabled = null;
function onCourseMessage(e) {
  const d = e && e.data;
  if (!d || typeof d !== 'object') return;
  if (d.type !== 'corvino:setKbdEnabled') return;
  if (d.save) _savedEnabled = enabled;
  if (typeof d.value === 'boolean') {
    setEnabled(d.value);
  } else if (d.restore && _savedEnabled !== null) {
    setEnabled(_savedEnabled);
    _savedEnabled = null;
  }
}

export function init() {
  // Relay PRIMEIRO (capture), pra parent ver mesmo se enabled=false
  window.addEventListener('keydown', e => relayKeyToParent(e, 'keydown'), true);
  window.addEventListener('keyup',   e => relayKeyToParent(e, 'keyup'),   true);

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', releaseAll);
  window.addEventListener('message', onCourseMessage);

  const btn = document.getElementById('kbd-toggle');
  if (btn) btn.addEventListener('click', toggle);
}
