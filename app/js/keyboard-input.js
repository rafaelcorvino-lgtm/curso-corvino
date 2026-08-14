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
import * as pcKeyboard from './pc-keyboard.js';

// Cada entry: { midi, isBass, row (só pro baixo — posiciona o hint visual) }
// row usa o MESMO índice do BASS_ROWS do midi-data.js:
//   0 = acordes 7ª, 1 = menores, 2 = maiores, 3 = fund, 4 = contrabaixo

// LAYOUT MESA — teclado deitado na mesa.
// MD igual ao Peito (FL Studio style). BASS difere do Peito: m e fund TROCAM
// de linha física no PC. Mesa põe home row (ASDF) no m e número row (1234)
// no fund. Sem 7ª, sem cbx (3 linhas). M = Q W E R (top row, igual Peito).
const KEY_MAP_MESA = {
  // --- Mão direita (piano, lado DIREITO do QWERTY) — Dó3-Dó4 ---
  // UNIFICADO Mesa/Peito.
  KeyG:         { midi: 48, isBass: false }, // Dó3
  KeyH:         { midi: 50, isBass: false }, // Ré3
  KeyJ:         { midi: 52, isBass: false }, // Mi3
  KeyK:         { midi: 53, isBass: false }, // Fá3
  KeyL:         { midi: 55, isBass: false }, // Sol3
  Semicolon:    { midi: 57, isBass: false }, // Lá3 (em ABNT2: Ç)
  Quote:        { midi: 59, isBass: false }, // Si3 (em ABNT2: ~)
  Backslash:    { midi: 60, isBass: false }, // Dó4 — ABNT2: tecla ]
  BracketRight: { midi: 60, isBass: false }, // Dó4 — US: tecla ]
  // Pretas (sustenidos)
  KeyY:        { midi: 49, isBass: false }, // Dó#3
  KeyU:        { midi: 51, isBass: false }, // Ré#3
  KeyO:        { midi: 54, isBass: false }, // Fá#3
  KeyP:        { midi: 56, isBass: false }, // Sol#3
  BracketLeft: { midi: 58, isBass: false }, // Lá#3

  // --- Mão esquerda (baixo) — ORDEM esq→dir: Ré · Sol · Dó · Fá ---
  // m — home row ASDF
  KeyA:    { midi: 38, isBass: true, row: 1 }, // Ré m
  KeyS:    { midi: 43, isBass: true, row: 1 }, // Sol m
  KeyD:    { midi: 36, isBass: true, row: 1 }, // Dó m
  KeyF:    { midi: 41, isBass: true, row: 1 }, // Fá m
  // M — top row QWER
  KeyQ:    { midi: 27, isBass: true, row: 2 }, // Ré M
  KeyW:    { midi: 32, isBass: true, row: 2 }, // Sol M
  KeyE:    { midi: 25, isBass: true, row: 2 }, // Dó M
  KeyR:    { midi: 30, isBass: true, row: 2 }, // Fá M
  // fund — number row 1-4
  Digit1:  { midi: 26, isBass: true, row: 3 }, // Ré fund
  Digit2:  { midi: 31, isBass: true, row: 3 }, // Sol fund
  Digit3:  { midi: 24, isBass: true, row: 3 }, // Dó fund
  Digit4:  { midi: 29, isBass: true, row: 3 }, // Fá fund
};

// LAYOUT PEITO — teclado apoiado no peito (estilo acordeon).
// Mão esquerda fica no lado ESQUERDO do QWERTY (baixo em 1234/QWER/ASDF).
// Mão direita fica no centro/direita do QWERTY (piano em V B N M , . / IntlRo
// com blacks G H _ K L ; — estilo FL Studio piano). Sem 7ª, sem cbx (3 linhas).
const KEY_MAP_PEITO = {
  // --- Mão direita (piano, lado DIREITO do QWERTY) — Dó3-Dó4 ---
  // UNIFICADO Mesa/Peito (idêntico ao KEY_MAP_MESA MD).
  KeyG:         { midi: 48, isBass: false }, // Dó3
  KeyH:         { midi: 50, isBass: false }, // Ré3
  KeyJ:         { midi: 52, isBass: false }, // Mi3
  KeyK:         { midi: 53, isBass: false }, // Fá3
  KeyL:         { midi: 55, isBass: false }, // Sol3
  Semicolon:    { midi: 57, isBass: false }, // Lá3 (em ABNT2: Ç)
  Quote:        { midi: 59, isBass: false }, // Si3 (em ABNT2: ~)
  Backslash:    { midi: 60, isBass: false }, // Dó4 — ABNT2: tecla ]
  BracketRight: { midi: 60, isBass: false }, // Dó4 — US: tecla ]
  // Pretas (sustenidos)
  KeyY:        { midi: 49, isBass: false }, // Dó#3
  KeyU:        { midi: 51, isBass: false }, // Ré#3
  KeyO:        { midi: 54, isBass: false }, // Fá#3
  KeyP:        { midi: 56, isBass: false }, // Sol#3
  BracketLeft: { midi: 58, isBass: false }, // Lá#3

  // --- Mão esquerda (baixo) — m e fund TROCAM linha física comparado ao Mesa ---
  // fund — home row ASDF (era number row no Mesa)
  KeyA:    { midi: 26, isBass: true, row: 3 }, // Ré fund
  KeyS:    { midi: 31, isBass: true, row: 3 }, // Sol fund
  KeyD:    { midi: 24, isBass: true, row: 3 }, // Dó fund
  KeyF:    { midi: 29, isBass: true, row: 3 }, // Fá fund
  // M — top row QWER (igual Mesa)
  KeyQ:    { midi: 27, isBass: true, row: 2 }, // Ré M
  KeyW:    { midi: 32, isBass: true, row: 2 }, // Sol M
  KeyE:    { midi: 25, isBass: true, row: 2 }, // Dó M
  KeyR:    { midi: 30, isBass: true, row: 2 }, // Fá M
  // m — number row 1-4 (era home row no Mesa)
  Digit1:  { midi: 38, isBass: true, row: 1 }, // Ré m
  Digit2:  { midi: 43, isBass: true, row: 1 }, // Sol m
  Digit3:  { midi: 36, isBass: true, row: 1 }, // Dó m
  Digit4:  { midi: 41, isBass: true, row: 1 }, // Fá m
};

// Layout corrente, sincronizado com pc-keyboard.js via mesma chave localStorage
const LAYOUT_KEY = 'corvino:bassLayout';
let currentLayout = 'mesa';
try {
  const saved = localStorage.getItem(LAYOUT_KEY);
  if (saved === 'mesa' || saved === 'peito') currentLayout = saved;
} catch (e) { /* localStorage indisponível */ }

function getActiveKeyMap() {
  return currentLayout === 'peito' ? KEY_MAP_PEITO : KEY_MAP_MESA;
}

// Labels padrão por layout (ABNT2) — ajustados via event.key no primeiro keypress
// MD igual nos dois layouts (G H J K L Ç ~ ] whites + Y U O P [ blacks).
const DEFAULT_LABELS_MESA = {
  // MD lado direito do QWERTY
  KeyG: 'G', KeyH: 'H', KeyJ: 'J', KeyK: 'K', KeyL: 'L',
  Semicolon: 'Ç', Quote: '~',
  Backslash: ']', BracketRight: ']',
  KeyY: 'Y', KeyU: 'U', KeyO: 'O', KeyP: 'P', BracketLeft: '[',
  // Baixo lado esquerdo
  KeyA: 'A', KeyS: 'S', KeyD: 'D', KeyF: 'F',
  KeyQ: 'Q', KeyW: 'W', KeyE: 'E', KeyR: 'R',
  Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4',
};
const DEFAULT_LABELS_PEITO = {
  // MD lado direito do QWERTY (mesmo do Mesa)
  KeyG: 'G', KeyH: 'H', KeyJ: 'J', KeyK: 'K', KeyL: 'L',
  Semicolon: 'Ç', Quote: '~',
  Backslash: ']', BracketRight: ']',
  KeyY: 'Y', KeyU: 'U', KeyO: 'O', KeyP: 'P', BracketLeft: '[',
  // Baixo lado esquerdo (m e fund trocados em relação ao Mesa)
  Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4',
  KeyQ: 'Q', KeyW: 'W', KeyE: 'E', KeyR: 'R',
  KeyA: 'A', KeyS: 'S', KeyD: 'D', KeyF: 'F',
};
function getDefaultLabels() {
  return currentLayout === 'peito' ? DEFAULT_LABELS_PEITO : DEFAULT_LABELS_MESA;
}

let enabled = false;
const activeCodes = new Set();
let labels = { ...getDefaultLabels() };

// EFFECTIVE_MAP é o mapa ATIVO. Pega do KEY_MAP do layout atual.
let EFFECTIVE_MAP = { ...getActiveKeyMap() };

// Troca o layout (Mesa <-> Peito). Re-sincroniza EFFECTIVE_MAP, labels, hints.
export function setLayout(layout) {
  if (layout !== 'mesa' && layout !== 'peito') return;
  if (layout === currentLayout) return;
  currentLayout = layout;
  EFFECTIVE_MAP = { ...getActiveKeyMap() };
  labels = { ...getDefaultLabels() };
  attachHints();
}
export function getLayout() { return currentLayout; }

function onKeyDown(e) {
  if (!enabled) return;
  const entry = EFFECTIVE_MAP[e.code];
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
  pcKeyboard.setActive(e.code, true);
  e.preventDefault();
}

function onKeyUp(e) {
  if (!enabled) return;
  const entry = EFFECTIVE_MAP[e.code];
  if (!entry) return;
  if (!activeCodes.has(e.code)) return;
  activeCodes.delete(e.code);
  audio.noteOff(entry.midi, entry.isBass);
  if (entry.isBass) state.bassNoteOff(entry.midi);
  else state.pianoNoteOff(entry.midi);
  pcKeyboard.setActive(e.code, false);
  e.preventDefault();
}

function releaseAll() {
  for (const code of activeCodes) {
    const entry = EFFECTIVE_MAP[code];
    if (!entry) continue;
    audio.noteOff(entry.midi, entry.isBass);
    if (entry.isBass) state.bassNoteOff(entry.midi);
    else state.pianoNoteOff(entry.midi);
  }
  activeCodes.clear();
  pcKeyboard.releaseAll();
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

// Computa a letra a exibir como hint pra um event.code. Usa o map default
// se conhecido, senão deriva do code (KeyZ → Z, Digit5 → 5, etc).
function getCodeLabel(code) {
  if (labels[code]) return labels[code];
  if (code.startsWith('Key'))   return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  switch (code) {
    case 'Semicolon':    return 'Ç';
    case 'Quote':        return '~';
    case 'Backslash':
    case 'BracketRight': return ']';
    case 'BracketLeft':  return '[';
    case 'Comma':        return ',';
    case 'Period':       return '.';
    case 'Slash':        return '/';
    case 'Minus':        return '-';
    case 'Equal':        return '=';
    default: return code;
  }
}

export function attachHints() {
  // Limpa hints antigos primeiro (caso aluno tenha re-mapeado teclas)
  document.querySelectorAll('.kbd-hint').forEach(h => h.remove());
  // Itera sobre o EFFECTIVE_MAP (não o KEY_MAP) pra refletir customizações
  for (const [code, entry] of Object.entries(EFFECTIVE_MAP)) {
    const el = findTargetEl(entry);
    if (!el) continue;
    let hint = el.querySelector('.kbd-hint');
    if (!hint) {
      hint = document.createElement('span');
      hint.className = 'kbd-hint';
      if (entry.isBass) hint.classList.add('kbd-hint-bass');
      el.appendChild(hint);
    }
    hint.textContent = getCodeLabel(code);
    hint.style.display = enabled ? 'block' : 'none';
  }
}

function refreshHintLabels() {
  for (const [code, entry] of Object.entries(EFFECTIVE_MAP)) {
    const el = findTargetEl(entry);
    const hint = el?.querySelector('.kbd-hint');
    if (hint) hint.textContent = getCodeLabel(code);
  }
}

// ===== Suporte ao editor de teclas (kbd-editor.js) =====
// Reset: volta o EFFECTIVE_MAP ao KEY_MAP default do layout atual.
export function resetEffectiveMap() {
  EFFECTIVE_MAP = { ...getActiveKeyMap() };
  attachHints();
}

// Acha o event.code ORIGINAL (default) do layout atual que mapeia pra essa
// nota/baixo. Ex: { midi: 64, isBass: false } → 'KeyJ' (Mi).
export function findOriginalCode({ midi, isBass = false, row = 0 }) {
  for (const [code, entry] of Object.entries(getActiveKeyMap())) {
    if (entry.midi !== midi || !!entry.isBass !== !!isBass) continue;
    if (isBass && (entry.row || 0) !== (row || 0)) continue;
    return code;
  }
  return null;
}

// Atribui um target (midi+isBass+row) a um event.code arbitrário.
// Se o target já estava em outro code, ele é removido. Se o code já
// estava ocupado por outra função, essa função fica vaga (sem mapping).
// Permite mapear QUALQUER tecla do acordeon (mesmo as sem default).
export function assignToCode(target, newCode) {
  // Acha quem está atualmente mapeado pra esse target e remove
  for (const code of Object.keys(EFFECTIVE_MAP)) {
    const e = EFFECTIVE_MAP[code];
    if (e && e.midi === target.midi && !!e.isBass === !!target.isBass &&
        (e.row || 0) === (target.row || 0)) {
      delete EFFECTIVE_MAP[code];
    }
  }
  // Remove a entry anterior do newCode (se houver — sua função antiga fica vaga)
  delete EFFECTIVE_MAP[newCode];
  // Atribui
  const entry = { midi: target.midi, isBass: !!target.isBass };
  if (target.isBass) entry.row = target.row || 0;
  EFFECTIVE_MAP[newCode] = entry;
  attachHints();
}

// Remapeia: a função (midi/baixo) que estava em `originalCode` agora
// responde por `newCode`. Se `newCode` é null, originalCode fica vago
// (sem mapping). Chamado pelo kbd-editor.js após aluno re-atribuir.
export function remapCode(originalCode, newCode) {
  const entry = getActiveKeyMap()[originalCode];
  if (!entry) return;
  // Tira do EFFECTIVE_MAP qualquer mapeamento atual de originalCode
  // (pode estar como originalCode se nada mudou, ou em algum newCode antigo)
  for (const code of Object.keys(EFFECTIVE_MAP)) {
    const e = EFFECTIVE_MAP[code];
    if (e && e.midi === entry.midi && e.isBass === entry.isBass && (e.row || 0) === (entry.row || 0)) {
      delete EFFECTIVE_MAP[code];
    }
  }
  if (newCode) {
    EFFECTIVE_MAP[newCode] = entry;
  }
  attachHints();
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
