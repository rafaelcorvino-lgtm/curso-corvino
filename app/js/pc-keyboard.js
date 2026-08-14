// PC keyboard view: 2 SVGs separados, espelhando a estrutura do app real:
// - SVG do BAIXO (cbx + fund + maj + min) → vai no #pc-bass-section
//   (dentro do #bass-section, onde antes ficava o bass-grid)
// - SVG do TECLADO (brancas + pretas MD) → vai no #pc-md-section
//   (dentro do #piano-section, onde antes ficava o piano-container)
//
// Cada tecla é um <g class="pc-key" data-code="..."> com data-kind do
// tipo (cbx/fund/maj/min/white/black/empty). Highlights (active) acionados
// pelo keyboard-input.js (físico) e embed-api.js (Synthesia da aula).

// ========================================================================
// LAYOUT MESA — teclado na mesa, mão esquerda no baixo.
// 3 linhas × 4 colunas (sem 7ª e sem cbx, mais compacto).
// Linhas (cima→baixo): m · M · fund.
// Colunas (esq→dir): Ré · Sol · Dó · Fá.
// Defaults: m=A/S/D/F (home row); M=Q/W/E/R (top row); fund=1/2/3/4 (números).
// Diferença pro Peito: m e fund TROCADOS de linha física no PC (Mesa põe a
// home row no m, número row no fund; Peito faz o oposto).
// ========================================================================
const SVG_BASS_HTML_MESA = `
<svg viewBox="0 0 240 162" class="pc-kbd-svg pc-kbd-bass" preserveAspectRatio="xMidYMid meet">
  <!-- ====== LINHA 1 (TOP): m menores (defaults A S D F) ====== -->
  <g class="pc-row pc-row-min">
    <g class="pc-key" data-code="KeyA" data-bass-target="midi:38,row:1" data-kind="min">
      <rect x="20" y="15" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="38" y="36">A</text>
      <text class="pc-label" x="38" y="49" data-note="Ré">Ré m</text>
    </g>
    <g class="pc-key" data-code="KeyS" data-bass-target="midi:43,row:1" data-kind="min">
      <rect x="60" y="15" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="78" y="36">S</text>
      <text class="pc-label" x="78" y="49" data-note="Sol">Sol m</text>
    </g>
    <g class="pc-key" data-code="KeyD" data-bass-target="midi:36,row:1" data-kind="min">
      <rect x="100" y="15" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="118" y="36">D</text>
      <text class="pc-label" x="118" y="49" data-note="Dó">Dó m</text>
    </g>
    <g class="pc-key" data-code="KeyF" data-bass-target="midi:41,row:1" data-kind="min">
      <rect x="140" y="15" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="158" y="36">F</text>
      <text class="pc-label" x="158" y="49" data-note="Fá">Fá m</text>
    </g>
  </g>

  <!-- ====== LINHA 2 (MIDDLE): M maiores (defaults Q W E R) ====== -->
  <g class="pc-row pc-row-maj">
    <g class="pc-key" data-code="KeyQ" data-bass-target="midi:27,row:2" data-kind="maj">
      <rect x="40" y="63" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="58" y="84">Q</text>
      <text class="pc-label" x="58" y="97" data-note="Ré">Ré M</text>
    </g>
    <g class="pc-key" data-code="KeyW" data-bass-target="midi:32,row:2" data-kind="maj">
      <rect x="80" y="63" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="98" y="84">W</text>
      <text class="pc-label" x="98" y="97" data-note="Sol">Sol M</text>
    </g>
    <g class="pc-key" data-code="KeyE" data-bass-target="midi:25,row:2" data-kind="maj">
      <rect x="120" y="63" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="138" y="84">E</text>
      <text class="pc-label" x="138" y="97" data-note="Dó">Dó M</text>
    </g>
    <g class="pc-key" data-code="KeyR" data-bass-target="midi:30,row:2" data-kind="maj">
      <rect x="160" y="63" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="178" y="84">R</text>
      <text class="pc-label" x="178" y="97" data-note="Fá">Fá M</text>
    </g>
  </g>

  <!-- ====== LINHA 3 (BOTTOM): fund baixos (defaults 1 2 3 4) ====== -->
  <g class="pc-row pc-row-fund">
    <g class="pc-key" data-code="Digit1" data-bass-target="midi:26,row:3" data-kind="fund">
      <rect x="60" y="111" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="78" y="132">1</text>
      <text class="pc-label" x="78" y="145" data-note="Ré">Ré fund</text>
    </g>
    <g class="pc-key" data-code="Digit2" data-bass-target="midi:31,row:3" data-kind="fund">
      <rect x="100" y="111" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="118" y="132">2</text>
      <text class="pc-label" x="118" y="145" data-note="Sol">Sol fund</text>
    </g>
    <g class="pc-key" data-code="Digit3" data-bass-target="midi:24,row:3" data-kind="fund">
      <rect x="140" y="111" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="158" y="132">3</text>
      <text class="pc-label" x="158" y="145" data-note="Dó">Dó fund</text>
    </g>
    <g class="pc-key" data-code="Digit4" data-bass-target="midi:29,row:3" data-kind="fund">
      <rect x="180" y="111" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="198" y="132">4</text>
      <text class="pc-label" x="198" y="145" data-note="Fá">Fá fund</text>
    </g>
  </g>
</svg>
`;

// ========================================================================
// LAYOUT PEITO — teclado apoiado no peito, estilo acordeon.
// 3 linhas × 4 colunas (sem 7ª e sem cbx, mais compacto).
// Linhas (cima→baixo): m · M · fund.
// Colunas (esq→dir): Ré · Sol · Dó · Fá.
// Defaults: m=1/2/3/4 (números); M=Q/W/E/R; fund=A/S/D/F.
// MD usa lado central do teclado (whites V B N M , . / IntlRo na bottom row,
// blacks G H _ K L ; na home row — estilo FL Studio piano).
// Lógica: mão esquerda fica no BAIXO (lado esquerdo do QWERTY: 1234/QWER/
// ASDF); mão direita no TECLADO (centro/direita do QWERTY).
// ========================================================================
const SVG_BASS_HTML_PEITO = `
<svg viewBox="0 0 240 162" class="pc-kbd-svg pc-kbd-bass" preserveAspectRatio="xMidYMid meet">
  <!-- ====== LINHA 1 (TOP): m menores (defaults 1 2 3 4) ====== -->
  <g class="pc-row pc-row-min">
    <g class="pc-key" data-code="Digit1" data-bass-target="midi:38,row:1" data-kind="min">
      <rect x="20" y="15" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="38" y="36">1</text>
      <text class="pc-label" x="38" y="49" data-note="Ré">Ré m</text>
    </g>
    <g class="pc-key" data-code="Digit2" data-bass-target="midi:43,row:1" data-kind="min">
      <rect x="60" y="15" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="78" y="36">2</text>
      <text class="pc-label" x="78" y="49" data-note="Sol">Sol m</text>
    </g>
    <g class="pc-key" data-code="Digit3" data-bass-target="midi:36,row:1" data-kind="min">
      <rect x="100" y="15" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="118" y="36">3</text>
      <text class="pc-label" x="118" y="49" data-note="Dó">Dó m</text>
    </g>
    <g class="pc-key" data-code="Digit4" data-bass-target="midi:41,row:1" data-kind="min">
      <rect x="140" y="15" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="158" y="36">4</text>
      <text class="pc-label" x="158" y="49" data-note="Fá">Fá m</text>
    </g>
  </g>

  <!-- ====== LINHA 2 (MIDDLE): M maiores (defaults Q W E R) ====== -->
  <g class="pc-row pc-row-maj">
    <g class="pc-key" data-code="KeyQ" data-bass-target="midi:27,row:2" data-kind="maj">
      <rect x="40" y="63" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="58" y="84">Q</text>
      <text class="pc-label" x="58" y="97" data-note="Ré">Ré M</text>
    </g>
    <g class="pc-key" data-code="KeyW" data-bass-target="midi:32,row:2" data-kind="maj">
      <rect x="80" y="63" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="98" y="84">W</text>
      <text class="pc-label" x="98" y="97" data-note="Sol">Sol M</text>
    </g>
    <g class="pc-key" data-code="KeyE" data-bass-target="midi:25,row:2" data-kind="maj">
      <rect x="120" y="63" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="138" y="84">E</text>
      <text class="pc-label" x="138" y="97" data-note="Dó">Dó M</text>
    </g>
    <g class="pc-key" data-code="KeyR" data-bass-target="midi:30,row:2" data-kind="maj">
      <rect x="160" y="63" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="178" y="84">R</text>
      <text class="pc-label" x="178" y="97" data-note="Fá">Fá M</text>
    </g>
  </g>

  <!-- ====== LINHA 3 (BOTTOM): fund baixos (defaults A S D F) ====== -->
  <g class="pc-row pc-row-fund">
    <g class="pc-key" data-code="KeyA" data-bass-target="midi:26,row:3" data-kind="fund">
      <rect x="60" y="111" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="78" y="132">A</text>
      <text class="pc-label" x="78" y="145" data-note="Ré">Ré fund</text>
    </g>
    <g class="pc-key" data-code="KeyS" data-bass-target="midi:31,row:3" data-kind="fund">
      <rect x="100" y="111" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="118" y="132">S</text>
      <text class="pc-label" x="118" y="145" data-note="Sol">Sol fund</text>
    </g>
    <g class="pc-key" data-code="KeyD" data-bass-target="midi:24,row:3" data-kind="fund">
      <rect x="140" y="111" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="158" y="132">D</text>
      <text class="pc-label" x="158" y="145" data-note="Dó">Dó fund</text>
    </g>
    <g class="pc-key" data-code="KeyF" data-bass-target="midi:29,row:3" data-kind="fund">
      <rect x="180" y="111" width="36" height="40" rx="4"/>
      <text class="pc-letter" x="198" y="132">F</text>
      <text class="pc-label" x="198" y="145" data-note="Fá">Fá fund</text>
    </g>
  </g>
</svg>
`;

// Estado atual do layout do baixo. Persistido em localStorage.
const BASS_LAYOUT_KEY = 'corvino:bassLayout';
let currentBassLayout = 'mesa'; // 'mesa' | 'peito'
try {
  const saved = localStorage.getItem(BASS_LAYOUT_KEY);
  if (saved === 'mesa' || saved === 'peito') currentBassLayout = saved;
} catch (e) { /* localStorage indisponível */ }

function getBassSVG() {
  return currentBassLayout === 'peito' ? SVG_BASS_HTML_PEITO : SVG_BASS_HTML_MESA;
}

// (SVG_MD_HTML_MESA declarado abaixo, depois de SVG_MD_HTML_PEITO — MD é
// unificado entre os dois layouts, então MESA aponta pro mesmo SVG do PEITO.)

// ========================================================================
// MD piano UNIFICADO (Mesa = Peito) — usa lado direito do QWERTY.
// Whites: G H J K L Ç ~ ] (home row direita)
// Blacks: Y U _ O P [ (top row direita, com gaps Mi-Fá e Si-Dó)
// ========================================================================
const SVG_MD_HTML_PEITO = `
<svg viewBox="0 0 340 105" class="pc-kbd-svg pc-kbd-md" preserveAspectRatio="xMidYMid meet">
  <!-- ====== LINHA SUPERIOR (pretas): Y U _ O P [ ====== -->
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

// MD unificado: Mesa e Peito usam exatamente as mesmas teclas da mão direita.
const SVG_MD_HTML_MESA = SVG_MD_HTML_PEITO;

function getMdSVG() {
  return currentBassLayout === 'peito' ? SVG_MD_HTML_PEITO : SVG_MD_HTML_MESA;
}

// Cache de cada elemento .pc-key por code (lookup O(1)) — agnóstico de SVG
const keyByCode = new Map();
// Cache de cada elemento .pc-key bass por bass-target string ("midi:X,row:Y").
// Permite remap por (midi, row) sem depender de KEY_MAP do PC — necessário
// pras 4 colunas novas (Fá#, Si, Mi, Lá) que não têm default code.
const targetToEl = new Map();

// MIDI mapping para click/touch direto nas teclas MD do SVG.
// (Baixos usam data-bass-target em vez deste mapa.)
// MD unificado: Mesa e Peito usam o mesmo MD, então CODE_TO_NOTE_MESA
// aponta pro CODE_TO_NOTE_PEITO (declarado logo abaixo).
const CODE_TO_NOTE_PEITO = {
  // MD brancas (G H J K L Ç ~ ]) — Dó-Dó8va. UNIFICADO Mesa/Peito.
  KeyG:        { midi: 48, isBass: false }, // Dó
  KeyH:        { midi: 50, isBass: false }, // Ré
  KeyJ:        { midi: 52, isBass: false }, // Mi
  KeyK:        { midi: 53, isBass: false }, // Fá
  KeyL:        { midi: 55, isBass: false }, // Sol
  Semicolon:   { midi: 57, isBass: false }, // Lá (Ç na ABNT2)
  Quote:       { midi: 59, isBass: false }, // Si (~ na ABNT2)
  Backslash:   { midi: 60, isBass: false }, // Dó(8va) — ABNT2: tecla ]
  BracketRight:{ midi: 60, isBass: false }, // Dó(8va) — US: tecla ]
  // MD pretas (Y U _ O P [)
  KeyY:        { midi: 49, isBass: false }, // Dó#
  KeyU:        { midi: 51, isBass: false }, // Ré#
  KeyO:        { midi: 54, isBass: false }, // Fá#
  KeyP:        { midi: 56, isBass: false }, // Sol#
  BracketLeft: { midi: 58, isBass: false }, // Lá#
};
const CODE_TO_NOTE_MESA = CODE_TO_NOTE_PEITO; // MD idêntico entre layouts
function getCodeToNote() {
  return currentBassLayout === 'peito' ? CODE_TO_NOTE_PEITO : CODE_TO_NOTE_MESA;
}

let _audio = null;
let _state = null;

export function init({ audio, state } = {}) {
  _audio = audio;
  _state = state;

  // Aplica classe no <body> pro CSS conhecer o layout atual (aspect-ratio)
  applyLayoutBodyClass();

  // Renderiza ambas as seções (baixo e MD) conforme layout atual
  renderBassSection();
  renderMdSection();
}

// Põe class .bass-peito ou .bass-mesa no <body> pro CSS poder ajustar
// aspect-ratio do SVG (Peito tem 3 linhas, Mesa tem 4 — proporções diferentes).
function applyLayoutBodyClass() {
  document.body.classList.remove('bass-mesa', 'bass-peito');
  document.body.classList.add(`bass-${currentBassLayout}`);
}

// (Re)renderiza só o #pc-bass-section, usando o SVG do layout corrente.
// Limpa caches de baixo (keyByCode entries do baixo + targetToEl) antes,
// pra não vazar referências do layout antigo.
function renderBassSection() {
  const bassContainer = document.getElementById('pc-bass-section');
  if (!bassContainer) return;

  // Limpa entradas de baixo do keyByCode (mantém as MD intactas)
  for (const [code, el] of keyByCode) {
    if (el && el.closest && el.closest('#pc-bass-section')) keyByCode.delete(code);
  }
  targetToEl.clear();

  bassContainer.innerHTML = getBassSVG();

  bassContainer.querySelectorAll('.pc-key[data-code]').forEach(el => {
    el.dataset.originalCode = el.dataset.code;
    keyByCode.set(el.dataset.code, el);
  });
  bassContainer.querySelectorAll('.pc-key[data-bass-target]').forEach(el => {
    targetToEl.set(el.dataset.bassTarget, el);
  });
  if (_audio) attachPointerHandlers(bassContainer);
}

// (Re)renderiza só o #pc-md-section, usando o SVG MD do layout corrente.
// Limpa entradas de MD do keyByCode antes (mantém baixo intacto).
function renderMdSection() {
  const mdContainer = document.getElementById('pc-md-section');
  if (!mdContainer) return;

  for (const [code, el] of keyByCode) {
    if (el && el.closest && el.closest('#pc-md-section')) keyByCode.delete(code);
  }

  mdContainer.innerHTML = getMdSVG();
  mdContainer.querySelectorAll('.pc-key[data-code]').forEach(el => {
    el.dataset.originalCode = el.dataset.code;
    keyByCode.set(el.dataset.code, el);
  });
  if (_audio) attachPointerHandlers(mdContainer);
}

// Troca o layout (Mesa <-> Peito). Re-renderiza ambas as seções (bass + MD)
// porque o Peito tem layout diferente em ambas. Persiste em localStorage.
export function setBassLayout(layout) {
  if (layout !== 'mesa' && layout !== 'peito') return;
  if (layout === currentBassLayout) return;
  currentBassLayout = layout;
  try { localStorage.setItem(BASS_LAYOUT_KEY, layout); } catch (e) {}
  applyLayoutBodyClass();
  renderBassSection();
  renderMdSection();
}

export function getBassLayout() { return currentBassLayout; }

function attachPointerHandlers(container) {
  const activePointers = new Map();

  function press(el, pointerId) {
    if (!el) return;
    let note = null;
    // Prioridade 1: bass-target (cobre as 32 teclas de baixo, mesmo as
    // 4 colunas novas Fá#/Si/Mi/Lá que não têm default code)
    if (el.dataset.bassTarget) {
      const m = el.dataset.bassTarget.match(/^midi:(-?\d+),row:(\d+)$/);
      if (m) note = { midi: +m[1], isBass: true };
    } else {
      // Prioridade 2: data-code (teclas MD; layout-aware)
      const code = el.dataset.code;
      note = getCodeToNote()[code];
    }
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
    // Aceita .pc-key com data-code (default) OU data-bass-target (novas
    // colunas de baixo Fá#/Si/Mi/Lá sem default — clicáveis via bass-target).
    const el = e.target.closest('.pc-key[data-code], .pc-key[data-bass-target]');
    if (!el) return;
    if (el.classList.contains('pc-empty')) return;
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

// Mapeia midi → event.code da tecla virtual. Usado pelo Synthesia das aulas
// pra ACENDER (highlight) a tecla esperada. MD UNIFICADO Mesa/Peito —
// lado direito do QWERTY (G H J K L Ç ~ ] whites + Y U O P [ blacks).
const MIDI_TO_CODE_MD = {
  // Oitava 3 (Dó3-Si3) — visível no piano MD
  48: 'KeyG', 49: 'KeyY', 50: 'KeyH', 51: 'KeyU', 52: 'KeyJ',
  53: 'KeyK', 54: 'KeyO', 55: 'KeyL', 56: 'KeyP', 57: 'Semicolon',
  58: 'BracketLeft', 59: 'Quote',
  // Dó4 — Dó8va, último tile do piano (Backslash em ABNT2)
  60: 'Backslash',
  // Oitavas acima — fallback pra pitch class equivalente em oitava 3
  61: 'KeyY', 62: 'KeyH', 63: 'KeyU', 64: 'KeyJ', 65: 'KeyK',
  66: 'KeyO', 67: 'KeyL', 68: 'KeyP', 69: 'Semicolon', 70: 'BracketLeft', 71: 'Quote',
  72: 'KeyG', 73: 'KeyY', 74: 'KeyH', 75: 'KeyU', 76: 'KeyJ',
  77: 'KeyK', 78: 'KeyO', 79: 'KeyL', 80: 'KeyP', 81: 'Semicolon',
};
// BASS mapping difere entre Mesa e Peito (m e fund trocados; M igual).
const MIDI_TO_CODE_BASS_MESA = {
  // m row (Ré/Sol/Dó/Fá m)
  38: 'KeyA', 43: 'KeyS', 36: 'KeyD', 41: 'KeyF',
  // M row (Ré/Sol/Dó/Fá M)
  27: 'KeyQ', 32: 'KeyW', 25: 'KeyE', 30: 'KeyR',
  // fund row (Ré/Sol/Dó/Fá fund)
  26: 'Digit1', 31: 'Digit2', 24: 'Digit3', 29: 'Digit4',
};
const MIDI_TO_CODE_BASS_PEITO = {
  // m row (Ré/Sol/Dó/Fá m)
  38: 'Digit1', 43: 'Digit2', 36: 'Digit3', 41: 'Digit4',
  // M row (Ré/Sol/Dó/Fá M) — IGUAL ao Mesa
  27: 'KeyQ', 32: 'KeyW', 25: 'KeyE', 30: 'KeyR',
  // fund row (Ré/Sol/Dó/Fá fund)
  26: 'KeyA', 31: 'KeyS', 24: 'KeyD', 29: 'KeyF',
};
function getMidiToCodeBass() {
  return currentBassLayout === 'peito' ? MIDI_TO_CODE_BASS_PEITO : MIDI_TO_CODE_BASS_MESA;
}

export function setActiveByMidi(midi, isBass, on) {
  const code = isBass ? getMidiToCodeBass()[midi] : MIDI_TO_CODE_MD[midi];
  if (code) setActive(code, on);
}

// Recalcula labels do teclado virtual aplicando transpose.
const NOTE_NAMES = ['Dó', 'Dó♯', 'Ré', 'Ré♯', 'Mi', 'Fá', 'Fá♯', 'Sol', 'Sol♯', 'Lá', 'Lá♯', 'Si'];
const NAME_TO_IDX = {
  'Dó':0, 'Dó♯':1, 'Ré':2, 'Ré♯':3, 'Mi':4, 'Fá':5, 'Fá♯':6,
  'Sol':7, 'Sol♯':8, 'Lá':9, 'Lá♯':10, 'Si':11,
};
// MD keys: keyed por event.code (estáveis pq teclas MD não viram do nada)
const BASE_NOTE = {
  KeyG: 'Dó', KeyH: 'Ré', KeyJ: 'Mi', KeyK: 'Fá',
  KeyL: 'Sol', Semicolon: 'Lá', Quote: 'Si', Backslash: 'Dó',
  KeyY: 'Dó♯', KeyU: 'Ré♯', KeyO: 'Fá♯', KeyP: 'Sol♯', BracketLeft: 'Lá♯',
};
// Bass keys: keyed por bass-target ("midi:X,row:Y") — funciona pras 40
// teclas (8 colunas × 5 linhas) inclusive as novas Fá#/Si/Mi/Lá que não
// têm default code. Mantém o nome base estável independente de remap.
const BASE_NOTE_BY_TARGET = {
  // cbx (row 4) — labels igual app Acordeon: pitches REAIS, com correção +1 em midi 55
  'midi:20,row:4': 'Sol♯', 'midi:51,row:4': 'Ré♯', 'midi:55,row:4': 'Sol♯', 'midi:49,row:4': 'Dó♯',
  'midi:54,row:4': 'Fá♯',  'midi:35,row:4': 'Si',  'midi:28,row:4': 'Mi',   'midi:33,row:4': 'Lá',
  // fund (row 3)
  'midi:54,row:3': 'Fá♯', 'midi:35,row:3': 'Si',  'midi:28,row:3': 'Mi',  'midi:33,row:3': 'Lá',
  'midi:26,row:3': 'Ré',  'midi:31,row:3': 'Sol', 'midi:24,row:3': 'Dó',  'midi:29,row:3': 'Fá',
  // maj (row 2)
  'midi:23,row:2': 'Fá♯', 'midi:50,row:2': 'Si',  'midi:48,row:2': 'Mi',  'midi:34,row:2': 'Lá',
  'midi:27,row:2': 'Ré',  'midi:32,row:2': 'Sol', 'midi:25,row:2': 'Dó',  'midi:30,row:2': 'Fá',
  // min (row 1)
  'midi:22,row:1': 'Fá♯', 'midi:47,row:1': 'Si',  'midi:40,row:1': 'Mi',  'midi:45,row:1': 'Lá',
  'midi:38,row:1': 'Ré',  'midi:43,row:1': 'Sol', 'midi:36,row:1': 'Dó',  'midi:41,row:1': 'Fá',
  // 7ª acordes (row 0)
  'midi:21,row:0': 'Fá♯', 'midi:52,row:0': 'Si',  'midi:53,row:0': 'Mi',  'midi:46,row:0': 'Lá',
  'midi:39,row:0': 'Ré',  'midi:44,row:0': 'Sol', 'midi:37,row:0': 'Dó',  'midi:42,row:0': 'Fá',
};
const KIND_IS_BASS = { cbx: true, fund: true, maj: true, min: true };

function applyTranspose(el, baseName, transpose) {
  const kind = el.dataset.kind;
  const baseIdx = NAME_TO_IDX[baseName];
  if (baseIdx === undefined) return;
  const newIdx = (((baseIdx + transpose) % 12) + 12) % 12;
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
    case 'set':   label = printable + ' 7'; break;
    case 'white':
    case 'black': label = noteName; break;
    default: return;
  }
  labelEl.textContent = label;
  labelEl.setAttribute('data-note', noteName.replace(/♯/g, ''));
}

export function refreshLabels({ kbTranspose = 0, bassTranspose = 0 } = {}) {
  // Bass keys: itera TODAS as 32 teclas via bass-target (cobre defaults
  // E as 4 colunas novas Fá#/Si/Mi/Lá)
  document.querySelectorAll('.pc-key[data-bass-target]').forEach(el => {
    const baseName = BASE_NOTE_BY_TARGET[el.dataset.bassTarget];
    if (!baseName) return;
    applyTranspose(el, baseName, bassTranspose);
  });
  // MD keys: keyByCode (que excluem as bass)
  keyByCode.forEach((el, code) => {
    if (el.dataset.bassTarget) return; // já tratada acima
    const baseName = BASE_NOTE[code];
    if (!baseName) return;
    applyTranspose(el, baseName, kbTranspose);
  });
}

// ===== Suporte ao editor de teclas (kbd-editor.js) =====
// Mapeia letra exibida na tecla a partir do event.code. Cobre o teclado
// inteiro pra que reatribuições mostrem letras corretas (ex: code "KeyZ"
// vira letra "Z", code "Digit5" vira "5", etc).
function codeToDisplayLetter(code) {
  if (code.startsWith('Key')) return code.slice(3);     // KeyZ → Z
  if (code.startsWith('Digit')) return code.slice(5);   // Digit5 → 5
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
    case 'Backquote':    return '`';
    default: return code; // fallback: mostra o code completo
  }
}

// Volta TODAS as teclas pro mapeamento original. Inclui:
//   1. Teclas DEFAULT: data-code volta a ser data-original-code
//   2. Teclas SEM DEFAULT (cols 1-4 novas de baixo): data-code é removido
//      e o pc-letter (criado dinamicamente) é deletado
// Usado pelo editor quando aluno aperta "Restaurar padrão".
export function resetCodes() {
  keyByCode.clear();
  // 1. Defaults
  document.querySelectorAll('.pc-key[data-original-code]').forEach(el => {
    const original = el.dataset.originalCode;
    el.dataset.code = original;
    const letterEl = el.querySelector('.pc-letter');
    if (letterEl) letterEl.textContent = codeToDisplayLetter(original);
    keyByCode.set(original, el);
  });
  // 2. Não-defaults (Fá#, Si, Mi, Lá): tira data-code + remove letter dinâmico
  document.querySelectorAll('.pc-key[data-bass-target]:not([data-original-code])').forEach(el => {
    if (el.dataset.code) delete el.dataset.code;
    const letterEl = el.querySelector('.pc-letter');
    if (letterEl) letterEl.remove();
  });
}

// Re-mapeia uma tecla: a função (midi/baixo) que estava em `originalCode`
// passa a responder por `newCode`. Atualiza data-code da pc-key + texto
// da letra + Map keyByCode.
export function remapCode(originalCode, newCode) {
  // Acha o elemento cuja função original era `originalCode`
  const el = document.querySelector(`.pc-key[data-original-code="${originalCode}"]`);
  if (!el) return;
  // Tira do Map sob o code antigo
  const oldCode = el.dataset.code;
  if (oldCode && keyByCode.get(oldCode) === el) keyByCode.delete(oldCode);
  // Atualiza data-code + label visual
  el.dataset.code = newCode;
  const letterEl = el.querySelector('.pc-letter');
  if (letterEl) letterEl.textContent = codeToDisplayLetter(newCode);
  keyByCode.set(newCode, el);
}

// Re-mapeia uma tecla de BAIXO identificada por (midi, row), independente
// de ter default no KEY_MAP do PC. Funciona pras 32 teclas de baixo do SVG.
// Cria pc-letter dinamicamente quando necessário (cols Fá#/Si/Mi/Lá).
export function remapByTarget(target, newCode) {
  const tk = `midi:${target.midi},row:${target.row || 0}`;
  const el = targetToEl.get(tk);
  if (!el) return;
  // Tira do keyByCode sob o code antigo
  const oldCode = el.dataset.code;
  if (oldCode && keyByCode.get(oldCode) === el) keyByCode.delete(oldCode);
  // Atualiza data-code
  if (newCode) {
    el.dataset.code = newCode;
    keyByCode.set(newCode, el);
  } else {
    delete el.dataset.code;
  }
  // Cria/atualiza/remove pc-letter
  let letterEl = el.querySelector('.pc-letter');
  if (newCode) {
    if (!letterEl) {
      // Cria <text class="pc-letter"> centralizado em cima do label
      const SVG_NS = 'http://www.w3.org/2000/svg';
      const rect = el.querySelector('rect');
      const labelEl = el.querySelector('.pc-label');
      const x = parseFloat(rect.getAttribute('x')) + parseFloat(rect.getAttribute('width')) / 2;
      const yLetter = parseFloat(rect.getAttribute('y')) + 21; // mesmo offset que defaults
      letterEl = document.createElementNS(SVG_NS, 'text');
      letterEl.setAttribute('class', 'pc-letter');
      letterEl.setAttribute('x', x);
      letterEl.setAttribute('y', yLetter);
      // Insere ANTES do label pra ordem visual ficar igual aos defaults
      el.insertBefore(letterEl, labelEl);
    }
    letterEl.textContent = codeToDisplayLetter(newCode);
  } else if (letterEl && !el.dataset.originalCode) {
    // Só remove o letter se NÃO for tecla default (defaults sempre mantêm letra)
    letterEl.remove();
  }
}
