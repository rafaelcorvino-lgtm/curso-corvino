// ===== Synthesia mode pro curso Corvino =====
// Modo de prática gamificado direto na partitura SVG: uma LINHA VERTICAL
// (cursor de tempo) avança continuamente da esquerda pra direita conforme o
// tempo passa, indicando QUANDO tocar. As próprias notas mudam de cor:
//   - cor padrão (dourado)  = futura
//   - amarelo                = a próxima a tocar (nota que o cursor está chegando)
//   - verde                  = aluno acertou
//   - vermelho               = passou sem tocar
//
// MD (mão direita): aluno toca G H J K L Ç ~ pra disparar Dó-Ré-Mi-Fá-Sol-Lá-Si.
// ME (baixos): toca em background como acompanhamento — não precisa tocar.
//
// Uso:
//   import { attachSynthesia } from './js/synthesia.js';
//   attachSynthesia({
//     triggerBtnId: 'btn-pvd-syn',
//     bpm: 60,
//     notes: [...],
//   });

const DEBUG = false;  // mudar pra true se precisar de logs detalhados no console
function dlog(...args) { if (DEBUG) console.log('[synthesia]', ...args); }

// --- postMessage pro app (mesma estratégia do score-player) ---
function findAppFrame() {
  return document.querySelector('iframe.app-frame');
}
function postToApp(msg) {
  const frame = findAppFrame();
  if (!frame || !frame.contentWindow) {
    console.warn('[synthesia] iframe.app-frame não encontrado — som não vai sair');
    return false;
  }
  frame.contentWindow.postMessage(msg, '*');
  return true;
}

// --- Mapeamento event.code → MIDI (oitava 4 — onde a Primeira Valsa está) ---
function keyCodeToMidi(code) {
  switch (code) {
    case 'KeyG':         return 60;
    case 'KeyH':         return 62;
    case 'KeyJ':         return 64;
    case 'KeyK':         return 65;
    case 'KeyL':         return 67;
    case 'Semicolon':    return 69;
    case 'Quote':        return 71;
    case 'Backslash':
    case 'BracketRight': return 72;
    case 'KeyY':         return 61;
    case 'KeyU':         return 63;
    case 'KeyO':         return 66;
    case 'KeyP':         return 68;
    case 'BracketLeft':  return 70;
    default: return null;
  }
}

// --- Coords (x, y) absolutas no SVG (lê translate dos parents) ---
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

  // Filtra MD com `el` na partitura, ordena por tempo
  const mdNotes = notes
    .filter(n => !n.isBass && n.el && typeof n.midi === 'number')
    .map(n => ({
      midi: n.midi,
      beats: n.beats || 1,
      startBeat: n.startBeat ?? 0,
      el: n.el,
      _state: 'pending',
    }))
    .sort((a, b) => a.startBeat - b.startBeat);

  if (mdNotes.length === 0) {
    console.warn('[synthesia] nenhuma nota MD com `el` encontrada');
    return;
  }

  const meNotes = notes.filter(n => n.isBass);

  // Acha o SVG da partitura
  const firstEl = document.querySelector(mdNotes[0].el);
  if (!firstEl) {
    console.warn('[synthesia] el da primeira nota não achada:', mdNotes[0].el);
    return;
  }
  const scoreSvg = firstEl.closest('svg');
  if (!scoreSvg) {
    console.warn('[synthesia] elemento não está dentro de um <svg>');
    return;
  }

  // Resolve elementos uma vez
  mdNotes.forEach(n => { n._domEl = document.querySelector(n.el); });
  // Pré-calcula coords absolutas das notas
  mdNotes.forEach(n => { n._pos = getViewBoxPos(n._domEl); });

  const cursor = createCursor(scoreSvg);

  const totalBeats = Math.max(...mdNotes.map(n => n.startBeat + n.beats),
                              ...meNotes.map(n => (n.startBeat ?? 0) + (n.beats || 1))) + 1;

  const HIT_WINDOW_BEATS = 0.45;
  const LOOKAHEAD_BEATS = 1.5;

  // Estado
  let running = false;
  let startMs = 0;
  let beatMs = 60000 / bpm;
  let rafId = null;
  let meTimeouts = [];
  const score = { hits: 0, missed: 0, total: mdNotes.length };

  const originalBtnText = triggerBtn.textContent;
  function updateBtn() {
    triggerBtn.textContent = running
      ? `■ Parar (${score.hits}/${score.total})`
      : originalBtnText;
  }

  triggerBtn.addEventListener('click', () => {
    running ? stop(true) : start();
  });

  window.addEventListener('keydown', onKey);

  function start() {
    running = true;
    score.hits = 0;
    score.missed = 0;
    mdNotes.forEach(n => {
      n._state = 'pending';
      resetNoteColor(n._domEl);
    });
    triggerBtn.classList.add('playing');
    cursor.style.display = '';
    updateBtn();
    beatMs = 60000 / bpm;
    startMs = performance.now() + LOOKAHEAD_BEATS * beatMs;
    scheduleME();
    dlog('start. bpm=', bpm, 'beatMs=', beatMs, 'totalBeats=', totalBeats, 'mdNotes=', mdNotes.length);
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
    cursor.style.display = 'none';
    if (showFinal) showFinalScore();
    updateBtn();
  }

  function scheduleME() {
    for (const note of meNotes) {
      const startBeats = (note.startBeat ?? 0) + LOOKAHEAD_BEATS;
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
    meTimeouts.push(setTimeout(() => {
      if (running) stop(true);
    }, (totalBeats + LOOKAHEAD_BEATS) * beatMs + 500));
  }

  // ----- Loop principal -----
  function tick(now) {
    if (!running) return;
    const elapsedBeats = (now - startMs) / beatMs;

    // Atualiza estados das notas
    let nextPending = null;
    for (const n of mdNotes) {
      if (n._state === 'hit' || n._state === 'miss') continue;
      const dt = elapsedBeats - n.startBeat;
      if (dt > HIT_WINDOW_BEATS) {
        n._state = 'miss';
        score.missed++;
        markNote(n._domEl, 'miss');
        updateBtn();
      } else if (!nextPending) {
        nextPending = n;
        if (n._state !== 'preview') {
          n._state = 'preview';
          markNote(n._domEl, 'preview');
        }
      }
    }

    // Posiciona o cursor (linha vertical) baseado no tempo
    const pos = computeCursorPosition(elapsedBeats);
    if (pos) {
      cursor.setAttribute('x1', pos.x);
      cursor.setAttribute('x2', pos.x);
      cursor.setAttribute('y1', pos.y - 75);
      cursor.setAttribute('y2', pos.y + 90);
    }

    // Auto-scroll pra acompanhar
    if (nextPending) scrollNoteIntoView(nextPending._domEl);

    if (elapsedBeats < totalBeats + LOOKAHEAD_BEATS) {
      rafId = requestAnimationFrame(tick);
    } else {
      stop(true);
    }
  }

  // Calcula posição do cursor de tempo:
  // - Antes da 1ª nota: cursor aproxima-se da 1ª nota
  // - Entre 2 notas: interpola linearmente em x e y
  // - Se mudou de stave entre prev e next (y diferente): salta no meio
  function computeCursorPosition(elapsedBeats) {
    let prev = null, next = null;
    for (let i = 0; i < mdNotes.length; i++) {
      if (mdNotes[i].startBeat <= elapsedBeats) prev = mdNotes[i];
      else { next = mdNotes[i]; break; }
    }

    if (!prev) {
      // Cursor "vindo de fora" pra primeira nota
      next = mdNotes[0];
      const p = next._pos;
      const beatsBefore = next.startBeat - elapsedBeats;
      const offsetX = Math.max(0, Math.min(80, beatsBefore * 30));
      return { x: p.x - offsetX, y: p.y };
    }
    if (!next) {
      return { ...prev._pos };
    }

    const segDur = next.startBeat - prev.startBeat;
    const t = segDur > 0 ? (elapsedBeats - prev.startBeat) / segDur : 0;
    const prevPos = prev._pos;
    const nextPos = next._pos;

    // Mesma stave? Interpolação direta.
    if (Math.abs(prevPos.y - nextPos.y) < 30) {
      return {
        x: prevPos.x + (nextPos.x - prevPos.x) * t,
        y: prevPos.y,
      };
    }

    // Mudou de stave: 1ª metade do segmento → vai até a borda direita;
    // 2ª metade → começa na borda esquerda da próxima stave.
    if (t < 0.5) {
      const tt = t * 2;
      return { x: prevPos.x + (560 - prevPos.x) * tt, y: prevPos.y };
    } else {
      const tt = (t - 0.5) * 2;
      return { x: 20 + (nextPos.x - 20) * tt, y: nextPos.y };
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
    // Toca o som imediatamente (feedback auditivo)
    const sent = postToApp({ type: 'corvino:noteOn', midi, isBass: false });
    if (DEBUG) dlog('handleHit midi=', midi, 'postSent=', sent);
    setTimeout(() => postToApp({ type: 'corvino:noteOff', midi, isBass: false }), 250);

    const target = mdNotes.find(n => n._state === 'pending' || n._state === 'preview');
    if (!target) return;

    const elapsedBeats = (performance.now() - startMs) / beatMs;
    const dt = Math.abs(elapsedBeats - target.startBeat);

    if (target.midi === midi && dt <= HIT_WINDOW_BEATS) {
      target._state = 'hit';
      score.hits++;
      markNote(target._domEl, 'hit');
      updateBtn();
    }
    // Caso tocou nota errada ou fora do tempo: ignora (target vira miss
    // depois quando passar do tempo). Som ainda toca pra feedback.
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

// --- Auto-scroll (acompanhar a stave atual) ---
let _lastScrolledEl = null;
let _lastScrollTs = 0;
function scrollNoteIntoView(el) {
  if (!el || el === _lastScrolledEl) return;
  const now = performance.now();
  if (now - _lastScrollTs < 400) return;
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

// --- Helpers de estado visual nas notas ---
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

// --- Cria o cursor de tempo (linha vertical, estilo Yousician) ---
function createCursor(svg) {
  const NS = 'http://www.w3.org/2000/svg';
  const line = document.createElementNS(NS, 'line');
  line.setAttribute('class', 'synth-cursor');
  line.setAttribute('x1', '0');
  line.setAttribute('x2', '0');
  line.setAttribute('y1', '0');
  line.setAttribute('y2', '0');
  line.setAttribute('stroke', '#ffd060');
  line.setAttribute('stroke-width', '2.5');
  line.setAttribute('opacity', '0.85');
  line.style.display = 'none';
  line.style.filter = 'drop-shadow(0 0 6px rgba(255, 208, 96, 0.95))';
  line.style.pointerEvents = 'none';
  svg.appendChild(line);
  return line;
}
