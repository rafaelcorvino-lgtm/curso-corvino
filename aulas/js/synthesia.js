// ===== Synthesia mode pro curso Corvino =====
// Modo de prática estilo "Piano Tiles": notas caem do alto, aluno toca quando
// chegam na hit zone. Feedback visual instantâneo (verde/amarelo/vermelho) +
// score acumulado.
//
// MVP: trabalha SÓ com a mão direita (MD). A ME (baixos) toca como
// acompanhamento automático em background.
//
// Uso:
//   import { attachSynthesia } from './js/synthesia.js';
//   attachSynthesia({
//     triggerBtnId: 'btn-pvd-syn',
//     stageId:      'pvd-synth-stage',
//     bpm: 60,
//     notes: [...],   // mesmo formato do score-player
//     keys: [        // 7 brancas a mostrar — ajustar à oitava da peça
//       { midi: 60, name: 'Dó',  kbdCode: 'KeyG' },
//       ...
//     ],
//   });

// --- Comunicação com o app (mesma lógica do score-player) ---
function findAppFrame() {
  return document.querySelector('iframe.app-frame');
}
function postToApp(msg) {
  const frame = findAppFrame();
  if (!frame || !frame.contentWindow) return;
  frame.contentWindow.postMessage(msg, '*');
}

// --- Layout do stage (em coords do viewBox) ---
const STAGE_W = 580;
const STAGE_H = 320;
const FALL_TOP = 8;
const HIT_Y    = 220;
const KEYS_Y   = 230;
const KEYS_H   = 80;

const PIXELS_PER_BEAT = 60;
const HIT_WINDOW_PERFECT = 0.12; // ±12% do beat
const HIT_WINDOW_GOOD    = 0.30; // ±30% = ainda conta como acerto

// Cores
const COLOR_BAR_PENDING = 'rgba(218,165,32,0.7)';
const COLOR_BAR_PERFECT = '#5ab45a';
const COLOR_BAR_GOOD    = '#d4c33a';
const COLOR_BAR_MISSED  = '#d94a4a';
const COLOR_HIT_ZONE    = 'rgba(218,165,32,0.7)';

// --- API ---
export function attachSynthesia({ triggerBtnId, stageId, bpm = 60, notes = [], keys }) {
  const triggerBtn = document.getElementById(triggerBtnId);
  const stageEl = document.getElementById(stageId);
  if (!triggerBtn || !stageEl) {
    console.warn('[synthesia] elementos não encontrados:', triggerBtnId, stageId);
    return;
  }

  if (!keys || !keys.length) {
    console.warn('[synthesia] precisa passar `keys` (array de teclas a mostrar)');
    return;
  }

  // Mapas auxiliares
  const midiToCol = new Map();
  const codeToMidi = new Map();
  keys.forEach((k, i) => {
    midiToCol.set(k.midi, i);
    if (k.kbdCode) codeToMidi.set(k.kbdCode, k.midi);
    if (k.kbdCodeAlt) codeToMidi.set(k.kbdCodeAlt, k.midi);
  });

  // Filtra notas: só MD (não isBass), midi presente nas keys, ordena por startBeat
  const mdNotes = notes
    .filter(n => !n.isBass && typeof n.midi === 'number' && midiToCol.has(n.midi))
    .map(n => ({
      midi: n.midi,
      beats: n.beats || 1,
      startBeat: n.startBeat ?? 0,
      state: 'pending',
      hitDelta: null,
    }));

  const meNotes = notes.filter(n => n.isBass);

  if (mdNotes.length === 0) {
    console.warn('[synthesia] nenhuma nota MD compatível com as `keys` fornecidas');
  }

  // Beats totais (pra saber quando termina)
  const totalBeats = Math.max(0, ...mdNotes.map(n => n.startBeat + n.beats),
                                ...meNotes.map(n => (n.startBeat ?? 0) + (n.beats || 0))) + 1;

  // Score
  const score = { hits: 0, perfect: 0, good: 0, missed: 0, total: mdNotes.length };

  // Build SVG
  buildStage(stageEl, keys);

  const NUM_KEYS = keys.length;
  const KEY_GAP = 2;
  const KEY_W = Math.floor((STAGE_W - 16 - (NUM_KEYS - 1) * KEY_GAP) / NUM_KEYS);
  const KEYS_START_X = 8;

  // Cria 1 barra SVG por nota MD
  const fallingG = stageEl.querySelector('.synth-falling');
  const barEls = mdNotes.map((note, i) => {
    const col = midiToCol.get(note.midi);
    const x = KEYS_START_X + col * (KEY_W + KEY_GAP);
    const h = note.beats * PIXELS_PER_BEAT;
    const rect = svgEl('rect', {
      class: 'synth-bar',
      'data-note-idx': i,
      x: x + 3,
      y: -1000, // off-screen até começar
      width: KEY_W - 6,
      height: Math.max(8, h - 4),
      rx: 4,
      fill: COLOR_BAR_PENDING,
      stroke: 'rgba(0,0,0,0.5)',
      'stroke-width': 1,
    });
    fallingG.appendChild(rect);
    return rect;
  });

  // Estado de partida
  let running = false;
  let startMs = 0;
  let beatMs = 60000 / bpm;
  let rafId = null;
  let meTimeouts = [];

  triggerBtn.addEventListener('click', () => {
    if (running) stopGame();
    else startGame();
  });

  window.addEventListener('keydown', onKey);
  // Cliques nas teclas virtuais do stage também contam como input
  stageEl.querySelectorAll('.synth-key').forEach(keyEl => {
    keyEl.addEventListener('pointerdown', (e) => {
      if (!running) return;
      e.preventDefault();
      const midi = parseInt(keyEl.dataset.midi, 10);
      handleHit(midi);
    });
  });

  function startGame() {
    if (mdNotes.length === 0) return;
    running = true;
    triggerBtn.textContent = '■ Parar Synthesia';
    triggerBtn.classList.add('playing');
    score.hits = score.perfect = score.good = score.missed = 0;
    mdNotes.forEach(n => { n.state = 'pending'; n.hitDelta = null; });
    barEls.forEach(el => el.setAttribute('fill', COLOR_BAR_PENDING));
    updateScoreDisplay();
    const finalEl = stageEl.querySelector('.synth-final');
    if (finalEl) finalEl.style.opacity = '0';
    beatMs = 60000 / bpm;
    // 2 beats de "lookahead" antes da 1ª nota (pra ver chegando)
    startMs = performance.now() + 2 * beatMs;
    scheduleME();
    rafId = requestAnimationFrame(tick);
  }

  function stopGame(showScore = false) {
    running = false;
    triggerBtn.textContent = '🎮 Modo Synthesia';
    triggerBtn.classList.remove('playing');
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    meTimeouts.forEach(t => clearTimeout(t));
    meTimeouts = [];
    postToApp({ type: 'corvino:allOff' });
    if (showScore) showFinalScore();
  }

  function scheduleME() {
    // ME (baixos) toca em background — autoplay
    for (const note of meNotes) {
      const startBeats = note.startBeat ?? 0;
      const startTimeMs = (startBeats + 2) * beatMs; // +2 = lookahead
      const slotMs = (note.beats || 1) * beatMs;
      const artic = typeof note.articulation === 'number' ? note.articulation : 0.85;
      const soundMs = Math.max(50, slotMs * artic);
      meTimeouts.push(setTimeout(() => {
        if (!running) return;
        postToApp({ type: 'corvino:noteOn', midi: note.midi, isBass: true });
      }, startTimeMs));
      meTimeouts.push(setTimeout(() => {
        postToApp({ type: 'corvino:noteOff', midi: note.midi, isBass: true });
      }, startTimeMs + soundMs));
    }
    // Auto-stop após o final
    meTimeouts.push(setTimeout(() => {
      if (running) stopGame(true);
    }, (totalBeats + 2) * beatMs + 500));
  }

  function tick(now) {
    if (!running) return;
    const elapsedBeats = (now - startMs) / beatMs;

    mdNotes.forEach((note, i) => {
      const el = barEls[i];
      if (!el) return;
      const beatsUntilHit = note.startBeat - elapsedBeats;
      const baseY = HIT_Y - beatsUntilHit * PIXELS_PER_BEAT;
      const h = note.beats * PIXELS_PER_BEAT;
      const topY = baseY - h + 4;
      el.setAttribute('y', topY);

      // Marca como missed se passou da janela e não foi tocada
      if (note.state === 'pending' && beatsUntilHit < -HIT_WINDOW_GOOD) {
        note.state = 'missed';
        score.missed++;
        el.setAttribute('fill', COLOR_BAR_MISSED);
        updateScoreDisplay();
      }
    });

    if (elapsedBeats < totalBeats + 2) {
      rafId = requestAnimationFrame(tick);
    } else {
      stopGame(true);
    }
  }

  function onKey(e) {
    if (!running) return;
    const midi = codeToMidi.get(e.code);
    if (midi == null) return;
    if (e.repeat) { e.preventDefault(); return; }
    e.preventDefault();
    handleHit(midi);
  }

  function handleHit(midi) {
    const elapsedBeats = (performance.now() - startMs) / beatMs;

    // Acha a nota pendente mais próxima do tempo atual com esse midi
    let bestNote = null;
    let bestIdx = -1;
    let bestDelta = Infinity;
    mdNotes.forEach((n, i) => {
      if (n.state !== 'pending') return;
      if (n.midi !== midi) return;
      const delta = Math.abs(elapsedBeats - n.startBeat);
      if (delta < bestDelta) { bestDelta = delta; bestNote = n; bestIdx = i; }
    });

    // Toca som pro feedback auditivo (independente de acerto)
    postToApp({ type: 'corvino:noteOn', midi, isBass: false });
    setTimeout(() => postToApp({ type: 'corvino:noteOff', midi, isBass: false }), 250);

    flashKey(midi);

    if (!bestNote || bestDelta > HIT_WINDOW_GOOD) {
      // Tocou fora do tempo certo (ou nota errada)
      score.missed++;
      updateScoreDisplay();
      return;
    }

    bestNote.hitDelta = elapsedBeats - bestNote.startBeat;
    if (bestDelta <= HIT_WINDOW_PERFECT) {
      bestNote.state = 'perfect';
      score.perfect++;
      score.hits++;
      barEls[bestIdx].setAttribute('fill', COLOR_BAR_PERFECT);
    } else {
      bestNote.state = 'good';
      score.good++;
      score.hits++;
      barEls[bestIdx].setAttribute('fill', COLOR_BAR_GOOD);
    }
    updateScoreDisplay();
  }

  function flashKey(midi) {
    const keyEl = stageEl.querySelector(`.synth-key[data-midi="${midi}"]`);
    if (!keyEl) return;
    keyEl.classList.add('synth-key-active');
    setTimeout(() => keyEl.classList.remove('synth-key-active'), 200);
  }

  function updateScoreDisplay() {
    const scoreEl = stageEl.querySelector('.synth-score');
    if (!scoreEl) return;
    const answered = score.hits + score.missed;
    const pct = answered > 0 ? Math.round((score.hits / answered) * 100) : 0;
    scoreEl.textContent = `${score.hits}/${score.total} · ${pct}%`;
  }

  function showFinalScore() {
    const pct = Math.round((score.hits / Math.max(1, score.total)) * 100);
    let msg = '';
    if (pct === 100) msg = '🎉 Perfeito! Mandou tudo certinho.';
    else if (pct >= 80) msg = '👏 Muito bom!';
    else if (pct >= 60) msg = '👍 Boa, treine mais um pouco.';
    else msg = 'Toque devagar primeiro pra fixar o tempo.';
    const finalEl = stageEl.querySelector('.synth-final');
    if (finalEl) {
      finalEl.textContent = `${score.hits}/${score.total} (${pct}%) — ${msg}`;
      finalEl.style.opacity = '1';
    }
  }
}

// --- SVG helper ---
function svgEl(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

// --- Build do stage SVG ---
function buildStage(container, keys) {
  container.innerHTML = '';
  container.classList.add('synth-stage-wrap');

  const NUM_KEYS = keys.length;
  const KEY_GAP = 2;
  const KEY_W = Math.floor((STAGE_W - 16 - (NUM_KEYS - 1) * KEY_GAP) / NUM_KEYS);
  const KEYS_START_X = 8;

  const svg = svgEl('svg', {
    class: 'synth-stage-svg',
    viewBox: `0 0 ${STAGE_W} ${STAGE_H}`,
  });

  // Background com gradient (sensação de "túnel")
  const defs = svgEl('defs', {});
  const grad = svgEl('linearGradient', { id: 'synthBg', x1: 0, y1: 0, x2: 0, y2: 1 });
  grad.appendChild(svgEl('stop', { offset: 0, 'stop-color': '#0a0808' }));
  grad.appendChild(svgEl('stop', { offset: 1, 'stop-color': '#1a1618' }));
  defs.appendChild(grad);
  svg.appendChild(defs);

  svg.appendChild(svgEl('rect', { x: 0, y: 0, width: STAGE_W, height: HIT_Y, fill: 'url(#synthBg)' }));

  // Trilhos verticais (1 por tecla)
  const trackG = svgEl('g', { stroke: 'rgba(218,165,32,0.08)', 'stroke-width': 1 });
  keys.forEach((k, i) => {
    const x = KEYS_START_X + i * (KEY_W + KEY_GAP) + KEY_W / 2;
    trackG.appendChild(svgEl('line', { x1: x, y1: FALL_TOP, x2: x, y2: HIT_Y }));
  });
  svg.appendChild(trackG);

  // Group das barras caindo (será preenchido depois)
  svg.appendChild(svgEl('g', { class: 'synth-falling' }));

  // Hit zone (linha brilhante)
  svg.appendChild(svgEl('line', {
    x1: 0, y1: HIT_Y, x2: STAGE_W, y2: HIT_Y,
    stroke: COLOR_HIT_ZONE, 'stroke-width': 3,
    filter: 'drop-shadow(0 0 6px rgba(218,165,32,0.9))',
  }));

  // Mini-piano (teclas)
  const keysG = svgEl('g', { class: 'synth-keys' });
  keys.forEach((k, i) => {
    const x = KEYS_START_X + i * (KEY_W + KEY_GAP);
    keysG.appendChild(svgEl('rect', {
      class: 'synth-key',
      'data-midi': k.midi,
      x, y: KEYS_Y,
      width: KEY_W,
      height: KEYS_H,
      rx: 4,
      fill: '#f4f0e6',
      stroke: '#1a1618',
      'stroke-width': 1.5,
      style: 'cursor:pointer;',
    }));
    // Nome da nota
    const label = svgEl('text', {
      x: x + KEY_W / 2,
      y: KEYS_Y + KEYS_H - 14,
      'font-size': 13,
      'font-weight': 700,
      'text-anchor': 'middle',
      fill: '#5a4a30',
      'font-family': 'serif',
      style: 'pointer-events:none;',
    });
    label.textContent = k.name;
    keysG.appendChild(label);
    // Letra do teclado do PC
    if (k.kbdLabel) {
      const kbdLabel = svgEl('text', {
        x: x + KEY_W / 2,
        y: KEYS_Y + KEYS_H - 30,
        'font-size': 9,
        'text-anchor': 'middle',
        fill: '#a07000',
        'font-family': 'monospace',
        style: 'pointer-events:none;',
      });
      kbdLabel.textContent = k.kbdLabel;
      keysG.appendChild(kbdLabel);
    }
  });
  svg.appendChild(keysG);

  // Score box (canto superior direito)
  const scoreFg = svgEl('foreignObject', {
    x: STAGE_W - 170, y: 8, width: 162, height: 36,
  });
  scoreFg.innerHTML = `<div class="synth-score-box" xmlns="http://www.w3.org/1999/xhtml"><span class="synth-score-label">Acertos</span><span class="synth-score">0/0</span></div>`;
  svg.appendChild(scoreFg);

  // Final message overlay (centro)
  const finalFg = svgEl('foreignObject', {
    x: 20, y: 90, width: STAGE_W - 40, height: 50,
  });
  finalFg.innerHTML = `<div class="synth-final" xmlns="http://www.w3.org/1999/xhtml" style="opacity:0;">--</div>`;
  svg.appendChild(finalFg);

  container.appendChild(svg);
}
