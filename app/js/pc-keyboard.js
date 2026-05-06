// PC keyboard view: 2 SVGs separados, espelhando a estrutura do app real:
// - SVG do BAIXO (cbx + fund + maj + min) → vai no #pc-bass-section
//   (dentro do #bass-section, onde antes ficava o bass-grid)
// - SVG do TECLADO (brancas + pretas MD) → vai no #pc-md-section
//   (dentro do #piano-section, onde antes ficava o piano-container)
//
// Cada tecla é um <g class="pc-key" data-code="..."> com data-kind do
// tipo (cbx/fund/maj/min/white/black/empty). Highlights (active) acionados
// pelo keyboard-input.js (físico) e embed-api.js (Synthesia da aula).

const SVG_BASS_HTML = `
<svg viewBox="0 0 280 210" class="pc-kbd-svg pc-kbd-bass" preserveAspectRatio="xMidYMid meet">
  <!-- ====== LINHA 1: 1-4 = contrabaixos da ME ====== -->
  <g class="pc-row pc-row-cbx">
    <g class="pc-key" data-code="Digit1" data-kind="cbx">
      <rect x="20" y="15" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="38" y="36">1</text>
      <text class="pc-label" x="38" y="49" data-note="Fá">Fá c.b.</text>
    </g>
    <g class="pc-key" data-code="Digit2" data-kind="cbx">
      <rect x="60" y="15" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="78" y="36">2</text>
      <text class="pc-label" x="78" y="49" data-note="Dó">Dó c.b.</text>
    </g>
    <g class="pc-key" data-code="Digit3" data-kind="cbx">
      <rect x="100" y="15" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="118" y="36">3</text>
      <text class="pc-label" x="118" y="49" data-note="Sol">Sol c.b.</text>
    </g>
    <g class="pc-key" data-code="Digit4" data-kind="cbx">
      <rect x="140" y="15" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="158" y="36">4</text>
      <text class="pc-label" x="158" y="49" data-note="Ré">Ré c.b.</text>
    </g>
  </g>

  <!-- ====== LINHA 2: Q-R = fund ME ====== -->
  <g class="pc-row pc-row-fund">
    <g class="pc-key" data-code="KeyQ" data-kind="fund">
      <rect x="40" y="63" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="58" y="84">Q</text>
      <text class="pc-label" x="58" y="97" data-note="Fá">Fá fund</text>
    </g>
    <g class="pc-key" data-code="KeyW" data-kind="fund">
      <rect x="80" y="63" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="98" y="84">W</text>
      <text class="pc-label" x="98" y="97" data-note="Dó">Dó fund</text>
    </g>
    <g class="pc-key" data-code="KeyE" data-kind="fund">
      <rect x="120" y="63" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="138" y="84">E</text>
      <text class="pc-label" x="138" y="97" data-note="Sol">Sol fund</text>
    </g>
    <g class="pc-key" data-code="KeyR" data-kind="fund">
      <rect x="160" y="63" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="178" y="84">R</text>
      <text class="pc-label" x="178" y="97" data-note="Ré">Ré fund</text>
    </g>
  </g>

  <!-- ====== LINHA 3: A-F = M maiores ====== -->
  <g class="pc-row pc-row-maj">
    <g class="pc-key" data-code="KeyA" data-kind="maj">
      <rect x="60" y="111" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="78" y="132">A</text>
      <text class="pc-label" x="78" y="145" data-note="Fá">Fá M</text>
    </g>
    <g class="pc-key" data-code="KeyS" data-kind="maj">
      <rect x="100" y="111" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="118" y="132">S</text>
      <text class="pc-label" x="118" y="145" data-note="Dó">Dó M</text>
    </g>
    <g class="pc-key" data-code="KeyD" data-kind="maj">
      <rect x="140" y="111" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="158" y="132">D</text>
      <text class="pc-label" x="158" y="145" data-note="Sol">Sol M</text>
    </g>
    <g class="pc-key" data-code="KeyF" data-kind="maj">
      <rect x="180" y="111" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="198" y="132">F</text>
      <text class="pc-label" x="198" y="145" data-note="Ré">Ré M</text>
    </g>
  </g>

  <!-- ====== LINHA 4: Z-V = m menores ====== -->
  <g class="pc-row pc-row-min">
    <g class="pc-key" data-code="KeyZ" data-kind="min">
      <rect x="80" y="159" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="98" y="180">Z</text>
      <text class="pc-label" x="98" y="193" data-note="Fá">Fá m</text>
    </g>
    <g class="pc-key" data-code="KeyX" data-kind="min">
      <rect x="120" y="159" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="138" y="180">X</text>
      <text class="pc-label" x="138" y="193" data-note="Dó">Dó m</text>
    </g>
    <g class="pc-key" data-code="KeyC" data-kind="min">
      <rect x="160" y="159" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="178" y="180">C</text>
      <text class="pc-label" x="178" y="193" data-note="Sol">Sol m</text>
    </g>
    <g class="pc-key" data-code="KeyV" data-kind="min">
      <rect x="200" y="159" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="218" y="180">V</text>
      <text class="pc-label" x="218" y="193" data-note="Ré">Ré m</text>
    </g>
  </g>
</svg>
`;

const SVG_MD_HTML = `
<svg viewBox="0 0 340 105" class="pc-kbd-svg pc-kbd-md" preserveAspectRatio="xMidYMid meet">
  <!-- ====== LINHA SUPERIOR (pretas): Y U O P [ ====== -->
  <g class="pc-row pc-row-black">
    <g class="pc-key pc-empty" data-kind="empty"><rect x="20" y="10" width="36" height="40" rx="4"/><text class="pc-letter-empty" x="38" y="35">T</text></g>
    <g class="pc-key" data-code="KeyY" data-kind="black">
      <rect x="60" y="10" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="78" y="31">Y</text>
      <text class="pc-label" x="78" y="44" data-note="Dó">Dó♯</text>
    </g>
    <g class="pc-key" data-code="KeyU" data-kind="black">
      <rect x="100" y="10" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="118" y="31">U</text>
      <text class="pc-label" x="118" y="44" data-note="Ré">Ré♯</text>
    </g>
    <g class="pc-key pc-empty" data-kind="empty"><rect x="140" y="10" width="36" height="40" rx="4"/><text class="pc-letter-empty" x="158" y="35">I</text></g>
    <g class="pc-key" data-code="KeyO" data-kind="black">
      <rect x="180" y="10" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="198" y="31">O</text>
      <text class="pc-label" x="198" y="44" data-note="Fá">Fá♯</text>
    </g>
    <g class="pc-key" data-code="KeyP" data-kind="black">
      <rect x="220" y="10" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="238" y="31">P</text>
      <text class="pc-label" x="238" y="44" data-note="Sol">Sol♯</text>
    </g>
    <g class="pc-key" data-code="BracketLeft" data-kind="black">
      <rect x="260" y="10" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="278" y="31">[</text>
      <text class="pc-label" x="278" y="44" data-note="Lá">Lá♯</text>
    </g>
  </g>

  <!-- ====== LINHA INFERIOR (brancas): G H J K L Ç ~ ] ====== -->
  <g class="pc-row pc-row-white">
    <g class="pc-key" data-code="KeyG" data-kind="white">
      <rect x="20" y="58" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="38" y="79">G</text>
      <text class="pc-label" x="38" y="92" data-note="Dó">Dó</text>
    </g>
    <g class="pc-key" data-code="KeyH" data-kind="white">
      <rect x="60" y="58" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="78" y="79">H</text>
      <text class="pc-label" x="78" y="92" data-note="Ré">Ré</text>
    </g>
    <g class="pc-key" data-code="KeyJ" data-kind="white">
      <rect x="100" y="58" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="118" y="79">J</text>
      <text class="pc-label" x="118" y="92" data-note="Mi">Mi</text>
    </g>
    <g class="pc-key" data-code="KeyK" data-kind="white">
      <rect x="140" y="58" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="158" y="79">K</text>
      <text class="pc-label" x="158" y="92" data-note="Fá">Fá</text>
    </g>
    <g class="pc-key" data-code="KeyL" data-kind="white">
      <rect x="180" y="58" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="198" y="79">L</text>
      <text class="pc-label" x="198" y="92" data-note="Sol">Sol</text>
    </g>
    <g class="pc-key" data-code="Semicolon" data-kind="white">
      <rect x="220" y="58" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="238" y="79">Ç</text>
      <text class="pc-label" x="238" y="92" data-note="Lá">Lá</text>
    </g>
    <g class="pc-key" data-code="Quote" data-kind="white">
      <rect x="260" y="58" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="278" y="79">~</text>
      <text class="pc-label" x="278" y="92" data-note="Si">Si</text>
    </g>
    <g class="pc-key" data-code="Backslash" data-kind="white">
      <rect x="300" y="58" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="318" y="79">]</text>
      <text class="pc-label" x="318" y="92" data-note="Dó">Dó(8va)</text>
    </g>
  </g>
</svg>
`;

// Cache de cada elemento .pc-key por code (lookup O(1)) — agnóstico de SVG
const keyByCode = new Map();

// MIDI mapping para click/touch direto nas teclas SVG. Espelha exatamente
// o KEY_MAP do keyboard-input.js — assim clicar na tecla virtual produz
// o mesmo som que apertar a tecla física correspondente no PC.
const CODE_TO_NOTE = {
  // MD brancas
  KeyG: { midi: 48, isBass: false },
  KeyH: { midi: 50, isBass: false },
  KeyJ: { midi: 52, isBass: false },
  KeyK: { midi: 53, isBass: false },
  KeyL: { midi: 55, isBass: false },
  Semicolon: { midi: 57, isBass: false },
  Quote: { midi: 59, isBass: false },
  Backslash: { midi: 60, isBass: false },
  // MD pretas
  KeyY: { midi: 49, isBass: false },
  KeyU: { midi: 51, isBass: false },
  KeyO: { midi: 54, isBass: false },
  KeyP: { midi: 56, isBass: false },
  BracketLeft: { midi: 58, isBass: false },
  // ME contrabaixos
  Digit1: { midi: 33, isBass: true },
  Digit2: { midi: 28, isBass: true },
  Digit3: { midi: 35, isBass: true },
  Digit4: { midi: 54, isBass: true },
  // ME fundamentais
  KeyQ: { midi: 29, isBass: true },
  KeyW: { midi: 24, isBass: true },
  KeyE: { midi: 31, isBass: true },
  KeyR: { midi: 26, isBass: true },
  // ME maiores
  KeyA: { midi: 30, isBass: true },
  KeyS: { midi: 25, isBass: true },
  KeyD: { midi: 32, isBass: true },
  KeyF: { midi: 27, isBass: true },
  // ME menores
  KeyZ: { midi: 41, isBass: true },
  KeyX: { midi: 36, isBass: true },
  KeyC: { midi: 43, isBass: true },
  KeyV: { midi: 38, isBass: true },
};

let _audio = null;
let _state = null;

export function init({ audio, state } = {}) {
  _audio = audio;
  _state = state;

  // Insere SVG do baixo dentro do #pc-bass-section (filho do #bass-section)
  const bassContainer = document.getElementById('pc-bass-section');
  if (bassContainer) {
    bassContainer.innerHTML = SVG_BASS_HTML;
    bassContainer.querySelectorAll('.pc-key[data-code]').forEach(el => {
      keyByCode.set(el.dataset.code, el);
    });
    if (_audio) attachPointerHandlers(bassContainer);
  }

  // Insere SVG do teclado dentro do #pc-md-section (filho do #piano-section)
  const mdContainer = document.getElementById('pc-md-section');
  if (mdContainer) {
    mdContainer.innerHTML = SVG_MD_HTML;
    mdContainer.querySelectorAll('.pc-key[data-code]').forEach(el => {
      keyByCode.set(el.dataset.code, el);
    });
    if (_audio) attachPointerHandlers(mdContainer);
  }
}

function attachPointerHandlers(container) {
  const activePointers = new Map();

  function press(el, pointerId) {
    if (!el) return;
    const code = el.dataset.code;
    const note = CODE_TO_NOTE[code];
    if (!note) return;
    el.classList.add('active');
    activePointers.set(pointerId, { el, note });
    if (_audio) _audio.noteOn(note.midi, 100, note.isBass);
    if (_state) {
      if (note.isBass) _state.bassNoteOn(note.midi);
      else _state.pianoNoteOn(note.midi);
    }
  }

  function release(pointerId) {
    const entry = activePointers.get(pointerId);
    if (!entry) return;
    entry.el.classList.remove('active');
    if (_audio) _audio.noteOff(entry.note.midi, entry.note.isBass);
    if (_state) {
      if (entry.note.isBass) _state.bassNoteOff(entry.note.midi);
      else _state.pianoNoteOff(entry.note.midi);
    }
    activePointers.delete(pointerId);
  }

  container.addEventListener('pointerdown', e => {
    const el = e.target.closest('.pc-key[data-code]');
    if (!el) return;
    e.preventDefault();
    el.setPointerCapture?.(e.pointerId);
    press(el, e.pointerId);
  });
  container.addEventListener('pointerup', e => release(e.pointerId));
  container.addEventListener('pointercancel', e => release(e.pointerId));
  window.addEventListener('blur', () => {
    activePointers.forEach((_, id) => release(id));
  });
}

// Liga/desliga visual da tecla. Chamado pelo keyboard-input.js no keyDown/keyUp.
export function setActive(code, on) {
  const el = keyByCode.get(code);
  if (!el) return;
  el.classList.toggle('active', !!on);
}

export function releaseAll() {
  keyByCode.forEach(el => el.classList.remove('active'));
}

// Mapeia midi → event.code da tecla virtual. Cobre oitavas 3 (app
// keyboard-input.js) e 4 (Synthesia das aulas) + algumas notas agudas.
const MIDI_TO_CODE_MD = {
  48: 'KeyG', 50: 'KeyH', 52: 'KeyJ', 53: 'KeyK',
  55: 'KeyL', 57: 'Semicolon', 59: 'Quote',
  60: 'KeyG', 62: 'KeyH', 64: 'KeyJ', 65: 'KeyK',
  67: 'KeyL', 69: 'Semicolon', 71: 'Quote',
  72: 'Backslash', 74: 'KeyH', 76: 'KeyJ', 77: 'KeyK', 79: 'KeyL',
  49: 'KeyY', 51: 'KeyU', 54: 'KeyO', 56: 'KeyP', 58: 'BracketLeft',
  61: 'KeyY', 63: 'KeyU', 66: 'KeyO', 68: 'KeyP', 70: 'BracketLeft',
};
const MIDI_TO_CODE_BASS = {
  24: 'KeyW', 25: 'KeyS', 28: 'Digit2', 36: 'KeyX',
  29: 'KeyQ', 30: 'KeyA', 33: 'Digit1', 41: 'KeyZ',
  31: 'KeyE', 32: 'KeyD', 35: 'Digit3', 43: 'KeyC',
  26: 'KeyR', 27: 'KeyF', 54: 'Digit4', 38: 'KeyV',
};

export function setActiveByMidi(midi, isBass, on) {
  const code = isBass ? MIDI_TO_CODE_BASS[midi] : MIDI_TO_CODE_MD[midi];
  if (code) setActive(code, on);
}

// Recalcula labels do teclado virtual aplicando transpose.
const NOTE_NAMES = ['Dó', 'Dó♯', 'Ré', 'Ré♯', 'Mi', 'Fá', 'Fá♯', 'Sol', 'Sol♯', 'Lá', 'Lá♯', 'Si'];
const NAME_TO_IDX = {
  'Dó':0, 'Dó♯':1, 'Ré':2, 'Ré♯':3, 'Mi':4, 'Fá':5, 'Fá♯':6,
  'Sol':7, 'Sol♯':8, 'Lá':9, 'Lá♯':10, 'Si':11,
};
const BASE_NOTE = {
  Digit1: 'Fá', KeyQ: 'Fá', KeyA: 'Fá', KeyZ: 'Fá',
  Digit2: 'Dó', KeyW: 'Dó', KeyS: 'Dó', KeyX: 'Dó',
  Digit3: 'Sol', KeyE: 'Sol', KeyD: 'Sol', KeyC: 'Sol',
  Digit4: 'Ré', KeyR: 'Ré', KeyF: 'Ré', KeyV: 'Ré',
  KeyG: 'Dó', KeyH: 'Ré', KeyJ: 'Mi', KeyK: 'Fá',
  KeyL: 'Sol', Semicolon: 'Lá', Quote: 'Si', Backslash: 'Dó',
  KeyY: 'Dó♯', KeyU: 'Ré♯', KeyO: 'Fá♯', KeyP: 'Sol♯', BracketLeft: 'Lá♯',
};
const KIND_IS_BASS = { cbx: true, fund: true, maj: true, min: true };

export function refreshLabels({ kbTranspose = 0, bassTranspose = 0 } = {}) {
  keyByCode.forEach((el, code) => {
    const baseName = BASE_NOTE[code];
    if (!baseName) return;
    const kind = el.dataset.kind;
    const tr = KIND_IS_BASS[kind] ? bassTranspose : kbTranspose;
    const baseIdx = NAME_TO_IDX[baseName];
    const newIdx = (((baseIdx + tr) % 12) + 12) % 12;
    const noteName = NOTE_NAMES[newIdx];
    const labelEl = el.querySelector('.pc-label');
    if (!labelEl) return;
    const printable = noteName.replace('♯', '#');
    let label;
    switch (kind) {
      case 'cbx':   label = printable + ' c.b.'; break;
      case 'fund':  label = printable + ' fund'; break;
      case 'maj':   label = printable + ' M'; break;
      case 'min':   label = printable + ' m'; break;
      case 'white':
      case 'black': label = noteName; break;
      default: return;
    }
    labelEl.textContent = label;
    labelEl.setAttribute('data-note', noteName.replace(/♯/g, ''));
  });
}
