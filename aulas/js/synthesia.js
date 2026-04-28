// ===== Synthesia mode pro curso Corvino =====
// Modo de prática gamificado SEM stage separado: usa a própria partitura SVG
// como tela. Uma "bolinha" se move entre as notas indicando QUAL tocar e
// QUANDO. Feedback colorido nas próprias notas:
//   - cor padrão        = nota futura (ainda vai chegar)
//   - amarelo (preview) = a próxima a tocar
//   - verde             = aluno acertou
//   - vermelho          = aluno perdeu (passou sem tocar)
//
// Uso:
//   import { attachSynthesia } from './js/synthesia.js';
//   attachSynthesia({
//     triggerBtnId: 'btn-pvd-syn',
//     bpm: 60,
//     notes: [...],   // mesmo formato do score-player (com `el` apontando pras
//                     //   ellipses da partitura)
//   });

// --- postMessage pro app (mesma estratégia do score-player) ---
function findAppFrame() {
  return document.querySelector('iframe.app-frame');
}
function postToApp(msg) {
  const frame = findAppFrame();
  if (!frame || !frame.contentWindow) return;
  frame.contentWindow.postMessage(msg, '*');
}

// --- Mapeamento event.code → MIDI (oitava 4 — onde a Primeira Valsa está) ---
// Reescrito específico pro Synthesia: as teclas mapeiam Dó4 (60) em diante,
// pra alinhar com as peças que estão no register MIDI 60-72.
function keyCodeToMidi(code) {
  switch (code) {
    case 'KeyG':         return 60; // Dó
    case 'KeyH':         return 62; // Ré
    case 'KeyJ':         return 64; // Mi
    case 'KeyK':         return 65; // Fá
    case 'KeyL':         return 67; // Sol
    case 'Semicolon':    return 69; // Lá
    case 'Quote':        return 71; // Si
    case 'Backslash':
    case 'BracketRight': return 72; // Dó (8va)
    // pretas
    case 'KeyY':         return 61; // Dó#
    case 'KeyU':         return 63; // Ré#
    case 'KeyO':         return 66; // Fá#
    case 'KeyP':         return 68; // Sol#
    case 'BracketLeft':  return 70; // Lá#
    default: return null;
  }
}

// --- Pega coords (x, y) de um elemento dentro do SVG, levando em conta os
//     transforms de translate dos parents (suficiente pra partituras com
//     múltiplas staves usando <g transform="translate(0, Y)">) ---
function getViewBoxPos(el) {
  const cx = parseFloat(el.getAttribute('cx') || el.getAttribute('x') || 0);
  const cy = parseFloat(el.getAttribute('cy') || el.getAttribute('y') || 0);
  let x = cx, y = cy;
  let cur = el.parentElement;
  while (cur && cur.tagName.toLowerCase() !== 'svg') {
    const t = cur.getAttribute && cur.getAttribute('transform');
    if (t) {
      const m = t.match(/translate\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*\)/);
      if (m) { x += parseFloat(m[1]); y += parseFloat(m[2]); }
    }
    cur = cur.parentElement;
  }
  return { x, y };
}

// --- API ---
export function attachSynthesia({ triggerBtnId, bpm = 60, notes = [] }) {
  const triggerBtn = document.getElementById(triggerBtnId);
  if (!triggerBtn) {
    console.warn('[synthesia] botão não encontrado:', triggerBtnId);
    return;
  }

  // Filtra MD que tenha `el` (referência visual na partitura) e ordena por tempo
  const mdNotes = notes
    .filter(n => !n.isBass && n.el && typeof n.midi === 'number')
    .map(n => ({
      midi: n.midi,
      beats: n.beats || 1,
      startBeat: n.startBeat ?? 0,
      el: n.el,
      _state: 'pending',  // 'pending' | 'preview' | 'hit' | 'miss'
    }))
    .sort((a, b) => a.startBeat - b.startBeat);

  if (mdNotes.length === 0) {
    console.warn('[synthesia] nenhuma nota MD com `el` na partitura');
    return;
  }

  const meNotes = notes.filter(n => n.isBass);

  // Acha o SVG da partitura (a partir da primeira nota)
  const firstEl = document.querySelector(mdNotes[0].el);
  if (!firstEl) {
    console.warn('[synthesia] el da primeira nota não encontrado:', mdNotes[0].el);
    return;
  }
  const scoreSvg = firstEl.closest('svg');
  if (!scoreSvg) {
    console.warn('[synthesia] elemento não está dentro de um <svg>');
    return;
  }

  // Resolve elementos uma vez só (cache)
  mdNotes.forEach(n => {
    n._domEl = document.querySelector(n.el);
  });

  // Cria a bolinha (cursor visual)
  const ball = createBall(scoreSvg);

  // Total de beats (pra saber quando acaba)
  const totalBeats = Math.max(...mdNotes.map(n => n.startBeat + n.beats),
                              ...meNotes.map(n => (n.startBeat ?? 0) + (n.beats || 1))) + 1;

  const HIT_WINDOW_BEATS = 0.45;  // ±45% do beat = janela tolerante (iniciante)

  // Estado
  let running = false;
  let startMs = 0;
  let beatMs = 60000 / bpm;
  let rafId = null;
  let meTimeouts = [];
  const score = { hits: 0, missed: 0, total: mdNotes.length };

  // ----- UI / estado do botão -----
  const originalBtnText = triggerBtn.textContent;
  function updateBtn() {
    if (running) {
      triggerBtn.textContent = `■ Parar (${score.hits}/${score.total})`;
    } else {
      triggerBtn.textContent = originalBtnText;
    }
  }

  triggerBtn.addEventListener('click', () => {
    running ? stop(true) : start();
  });

  window.addEventListener('keydown', onKey);

  // ----- Start / Stop -----
  function start() {
    running = true;
    score.hits = 0;
    score.missed = 0;
    mdNotes.forEach(n => {
      n._state = 'pending';
      resetNoteColor(n._domEl);
    });
    triggerBtn.classList.add('playing');
    ball.style.display = '';
    updateBtn();
    beatMs = 60000 / bpm;
    // Lookahead de 1.5 beats pra ver o cursor antes da primeira nota
    startMs = performance.now() + 1.5 * beatMs;
    scheduleME();
    rafId = requestAnimationFrame(tick);
  }

  function stop(showFinal = false) {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    meTimeouts.forEach(t => clearTimeout(t));
    meTimeouts = [];
    postToApp({ type: 'corvino:allOff' });
    triggerBtn.classList.remove('playing');
    ball.style.display = 'none';
    if (showFinal) showFinalScore();
    updateBtn();
  }

  function scheduleME() {
    for (const note of meNotes) {
      const startBeats = (note.startBeat ?? 0) + 1.5; // +lookahead
      const startTimeMs = startBeats * beatMs;
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
    // Auto-stop quando termina
    meTimeouts.push(setTimeout(() => {
      if (running) stop(true);
    }, (totalBeats + 1.5) * beatMs + 500));
  }

  // ----- Loop principal -----
  function tick(now) {
    if (!running) return;
    const elapsedBeats = (now - startMs) / beatMs;

    // Atualiza estados
    let nextPending = null;
    for (const n of mdNotes) {
      if (n._state === 'hit' || n._state === 'miss') continue;
      const dt = elapsedBeats - n.startBeat;
      if (dt > HIT_WINDOW_BEATS) {
        // Passou da janela sem ser tocada
        n._state = 'miss';
        score.missed++;
        markNote(n._domEl, 'miss');
        updateBtn();
      } else if (!nextPending) {
        nextPending = n;
        // Marca como "preview" (amarelo) — está na vez
        if (n._state !== 'preview') {
          n._state = 'preview';
          markNote(n._domEl, 'preview');
        }
      }
    }

    // Posiciona a bolinha sobre a nota pending atual
    if (nextPending) {
      const pos = getViewBoxPos(nextPending._domEl);
      ball.setAttribute('cx', pos.x);
      ball.setAttribute('cy', pos.y - 18);  // um pouco acima da nota
      scrollNoteIntoView(nextPending._domEl);
    }

    if (elapsedBeats < totalBeats + 1) {
      rafId = requestAnimationFrame(tick);
    } else {
      stop(true);
    }
  }

  // ----- Input -----
  function onKey(e) {
    if (!running) return;
    const midi = keyCodeToMidi(e.code);
    if (midi == null) return;
    if (e.repeat) { e.preventDefault(); return; }
    e.preventDefault();
    handleHit(midi);
  }

  function handleHit(midi) {
    // Toca o som independente do acerto (feedback auditivo imediato)
    postToApp({ type: 'corvino:noteOn', midi, isBass: false });
    setTimeout(() => postToApp({ type: 'corvino:noteOff', midi, isBass: false }), 250);

    // Pega a próxima nota pending
    const target = mdNotes.find(n => n._state === 'pending' || n._state === 'preview');
    if (!target) return;

    const elapsedBeats = (performance.now() - startMs) / beatMs;
    const dt = Math.abs(elapsedBeats - target.startBeat);

    // Tocou nota CERTA dentro da janela?
    if (target.midi === midi && dt <= HIT_WINDOW_BEATS) {
      target._state = 'hit';
      score.hits++;
      markNote(target._domEl, 'hit');
      updateBtn();
    }
    // Caso contrário (nota errada OU tempo errado): ignora — a nota target
    // continua pending e vai virar miss se o tempo passar. Não penalizamos
    // duas vezes (nem marcamos a nota como erro só porque o aluno tocou
    // outra coisa fora do tempo).
  }

  function showFinalScore() {
    const pct = Math.round((score.hits / Math.max(1, score.total)) * 100);
    let msg = '';
    if (pct === 100) msg = '🎉 Perfeito!';
    else if (pct >= 80) msg = '👏 Muito bom!';
    else if (pct >= 60) msg = '👍 Boa, treine mais.';
    else msg = 'Toque devagar primeiro.';
    triggerBtn.textContent = `${score.hits}/${score.total} (${pct}%) — ${msg}`;
    setTimeout(() => updateBtn(), 5000);
  }
}

// --- Helpers de estado visual nas notas da partitura ---
function markNote(el, state) {
  if (!el) return;
  el.classList.remove('synth-preview', 'synth-hit', 'synth-miss');
  if (state === 'preview') el.classList.add('synth-preview');
  else if (state === 'hit') el.classList.add('synth-hit');
  else if (state === 'miss') el.classList.add('synth-miss');
}
function resetNoteColor(el) {
  if (!el) return;
  el.classList.remove('synth-preview', 'synth-hit', 'synth-miss');
}

// --- Auto-scroll: traz a nota atual à vista (com throttle pra não spammar) ---
let _lastScrolledEl = null;
let _lastScrollTs = 0;
function scrollNoteIntoView(el) {
  if (!el || el === _lastScrolledEl) return;
  const now = performance.now();
  if (now - _lastScrollTs < 400) return;  // throttle
  _lastScrolledEl = el;
  _lastScrollTs = now;
  const reduced = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  try {
    el.scrollIntoView({
      behavior: reduced ? 'auto' : 'smooth',
      block: 'center',
      inline: 'nearest',
    });
  } catch (_) {}
}

// --- Cria a bolinha-cursor ---
function createBall(svg) {
  const NS = 'http://www.w3.org/2000/svg';
  const ball = document.createElementNS(NS, 'circle');
  ball.setAttribute('class', 'synth-ball');
  ball.setAttribute('r', '9');
  ball.setAttribute('fill', '#ffd060');
  ball.setAttribute('stroke', '#fff');
  ball.setAttribute('stroke-width', '2');
  ball.setAttribute('opacity', '0.95');
  ball.style.display = 'none';
  ball.style.filter = 'drop-shadow(0 0 6px rgba(255, 208, 96, 0.9))';
  ball.style.pointerEvents = 'none';
  ball.style.transition = 'cx 0.15s ease, cy 0.15s ease';
  svg.appendChild(ball);
  return ball;
}
