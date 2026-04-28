// ===== Synthesia mode pro curso Corvino =====
// Modo de prática gamificado direto na partitura SVG. 2 elementos visuais:
//   - CURSOR (linha vertical): "AGORA" — avança continuamente em X com o tempo
//   - BOLINHA (circle pulsante): "TOQUE essa" — fica sobre a próxima nota
//
// MODO ESPERA: se o cursor chegar na nota e o aluno não tocar, o jogo PAUSA
// até ele acertar a nota. Não cobra ritmo perfeito de iniciante.
//
// Estados visuais nas notas:
//   cor padrão (dourado) = futura
//   amarelo (.synth-preview) = a vez de tocar
//   verde  (.synth-hit)      = aluno acertou
//   vermelho (.synth-miss)   = perdeu (depois do retomar — aluno demorou demais
//                              ou pulou; opcional, hoje não usamos)
//
// MD: aluno toca G H J K L Ç ~ pra disparar Dó-Ré-Mi-Fá-Sol-Lá-Si.
// ME: toca em background como acompanhamento — pausa junto se MD travar.

// Liga DEBUG via querystring (?synthDebug=1) ou flag global window.SYNTH_DEBUG
const DEBUG = (typeof window !== 'undefined' &&
  (window.SYNTH_DEBUG === true ||
   /[?&]synthDebug=1\b/.test(window.location.search)));
function dlog(...args) { if (DEBUG) console.log('[synthesia]', ...args); }

// --- postMessage pro app ---
function findAppFrame() {
  return document.querySelector('iframe.app-frame');
}
function postToApp(msg) {
  const frame = findAppFrame();
  if (!frame || !frame.contentWindow) {
    console.warn('[synthesia] iframe.app-frame não encontrado');
    return false;
  }
  frame.contentWindow.postMessage(msg, '*');
  return true;
}

// --- Mapeamento event.code → MIDI (oitava 4) ---
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

// --- Coords absolutas no SVG (lê translates dos parents) ---
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
    console.warn('[synthesia] nenhuma nota MD compatível');
    return;
  }

  const meNotes = notes.filter(n => n.isBass);

  const firstEl = document.querySelector(mdNotes[0].el);
  if (!firstEl) {
    console.warn('[synthesia] el da primeira nota não achado:', mdNotes[0].el);
    return;
  }
  const scoreSvg = firstEl.closest('svg');
  if (!scoreSvg) return;

  mdNotes.forEach(n => { n._domEl = document.querySelector(n.el); });
  mdNotes.forEach(n => { n._pos = getViewBoxPos(n._domEl); });

  const cursor = createCursor(scoreSvg);
  const ball = createBall(scoreSvg);

  const totalBeats = Math.max(...mdNotes.map(n => n.startBeat + n.beats),
                              ...meNotes.map(n => (n.startBeat ?? 0) + (n.beats || 1))) + 1;

  const HIT_WINDOW_BEATS = 0.45;
  const LOOKAHEAD_BEATS = 1.5;

  let running = false;
  let waiting = false;        // true = pausado esperando aluno tocar
  let waitBeat = 0;           // beat onde o cursor parou
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

  // Listener no document em fase de CAPTURE pra rodar antes de qualquer
  // outro listener da página. Não interfere no iframe (frame separado).
  document.addEventListener('keydown', onKey, true);

  function start() {
    running = true;
    waiting = false;
    waitBeat = 0;
    score.hits = 0;
    score.missed = 0;
    mdNotes.forEach(n => {
      n._state = 'pending';
      resetNoteColor(n._domEl);
    });
    triggerBtn.classList.add('playing');
    cursor.style.display = '';
    ball.style.display = '';
    updateBtn();
    beatMs = 60000 / bpm;
    startMs = performance.now() + LOOKAHEAD_BEATS * beatMs;
    scheduleMEFromBeat(0);
    rafId = requestAnimationFrame(tick);
  }

  function stop(showFinal = false) {
    running = false;
    waiting = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    clearAllMeTimeouts();
    postToApp({ type: 'corvino:allOff' });
    triggerBtn.classList.remove('playing');
    cursor.style.display = 'none';
    ball.style.display = 'none';
    if (showFinal) showFinalScore();
    updateBtn();
  }

  function clearAllMeTimeouts() {
    meTimeouts.forEach(t => clearTimeout(t));
    meTimeouts = [];
  }

  // Agenda ME a partir de um beat específico (usado no start e no resume)
  function scheduleMEFromBeat(fromBeat) {
    clearAllMeTimeouts();
    const startOffsetMs = (fromBeat === 0 ? LOOKAHEAD_BEATS : 0) * beatMs;
    for (const note of meNotes) {
      const noteStart = note.startBeat ?? 0;
      // Pula notas que já passaram completamente
      if (noteStart + (note.beats || 1) <= fromBeat) continue;

      const startTimeMs = startOffsetMs + Math.max(0, noteStart - fromBeat) * beatMs;
      const slotMs = (note.beats || 1) * beatMs;
      const artic = typeof note.articulation === 'number' ? note.articulation : 0.85;
      const soundMs = Math.max(50, slotMs * artic);

      meTimeouts.push(setTimeout(() => {
        if (!running || waiting) return;
        postToApp({ type: 'corvino:noteOn', midi: note.midi, isBass: true });
      }, startTimeMs));
      meTimeouts.push(setTimeout(() => {
        postToApp({ type: 'corvino:noteOff', midi: note.midi, isBass: true });
      }, startTimeMs + soundMs));
    }
    // Auto-stop quando termina (só agenda no start, não em resumes)
    if (fromBeat === 0) {
      meTimeouts.push(setTimeout(() => {
        if (running && !waiting) stop(true);
      }, (totalBeats + LOOKAHEAD_BEATS) * beatMs + 500));
    }
  }

  // ----- Pausa o jogo (cursor para de avançar) -----
  function pause(atBeat) {
    waiting = true;
    waitBeat = atBeat;
    clearAllMeTimeouts();
    postToApp({ type: 'corvino:allOff' });
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    dlog('PAUSE em beat=', atBeat);
    // O cursor permanece visível na posição da nota target (ball pulsa)
  }

  // ----- Retoma após o aluno tocar a nota correta -----
  function resume() {
    if (!waiting) return;
    waiting = false;
    // Ajusta startMs pra que elapsedBeats continue de waitBeat
    startMs = performance.now() - waitBeat * beatMs;
    scheduleMEFromBeat(waitBeat);
    dlog('RESUME a partir de beat=', waitBeat);
    rafId = requestAnimationFrame(tick);
  }

  // ----- Loop principal -----
  function tick(now) {
    if (!running || waiting) return;
    const elapsedBeats = (now - startMs) / beatMs;

    // Acha próxima nota pendente
    let nextPending = null;
    for (const n of mdNotes) {
      if (n._state === 'hit' || n._state === 'miss') continue;
      if (!nextPending) {
        nextPending = n;
        if (n._state !== 'preview') {
          n._state = 'preview';
          markNote(n._domEl, 'preview');
        }
      }
    }

    // Se cursor passou da hit zone da próxima sem ela ser tocada: PAUSA
    if (nextPending && elapsedBeats > nextPending.startBeat + HIT_WINDOW_BEATS) {
      pause(nextPending.startBeat);
      // Posiciona ball/cursor sobre a nota travada
      const p = nextPending._pos;
      ball.setAttribute('cx', p.x);
      ball.setAttribute('cy', p.y);
      cursor.setAttribute('x1', p.x);
      cursor.setAttribute('x2', p.x);
      cursor.setAttribute('y1', p.y - 75);
      cursor.setAttribute('y2', p.y + 90);
      scrollNoteIntoView(nextPending._domEl);
      return;
    }

    // Posiciona cursor (linha vertical) baseado no tempo
    const cursorPos = computeCursorPosition(elapsedBeats);
    if (cursorPos) {
      cursor.setAttribute('x1', cursorPos.x);
      cursor.setAttribute('x2', cursorPos.x);
      cursor.setAttribute('y1', cursorPos.y - 75);
      cursor.setAttribute('y2', cursorPos.y + 90);
    }

    // Posiciona bolinha (sempre sobre a próxima pendente)
    if (nextPending) {
      const p = nextPending._pos;
      ball.setAttribute('cx', p.x);
      ball.setAttribute('cy', p.y);
      scrollNoteIntoView(nextPending._domEl);
    } else {
      ball.style.display = 'none';
    }

    if (elapsedBeats < totalBeats + LOOKAHEAD_BEATS) {
      rafId = requestAnimationFrame(tick);
    } else {
      stop(true);
    }
  }

  // Interpolação linear entre prev e next, considerando pulos de stave
  function computeCursorPosition(elapsedBeats) {
    let prev = null, next = null;
    for (let i = 0; i < mdNotes.length; i++) {
      if (mdNotes[i].startBeat <= elapsedBeats) prev = mdNotes[i];
      else { next = mdNotes[i]; break; }
    }
    if (!prev) {
      next = mdNotes[0];
      const p = next._pos;
      const beatsBefore = next.startBeat - elapsedBeats;
      const offsetX = Math.max(0, Math.min(80, beatsBefore * 30));
      return { x: p.x - offsetX, y: p.y };
    }
    if (!next) return { ...prev._pos };

    const segDur = next.startBeat - prev.startBeat;
    const t = segDur > 0 ? (elapsedBeats - prev.startBeat) / segDur : 0;
    const prevPos = prev._pos;
    const nextPos = next._pos;

    if (Math.abs(prevPos.y - nextPos.y) < 30) {
      return {
        x: prevPos.x + (nextPos.x - prevPos.x) * t,
        y: prevPos.y,
      };
    }
    if (t < 0.5) {
      return { x: prevPos.x + (560 - prevPos.x) * t * 2, y: prevPos.y };
    } else {
      return { x: 20 + (nextPos.x - 20) * (t - 0.5) * 2, y: nextPos.y };
    }
  }

  // ----- Input -----
  // Captura keydown na fase de CAPTURE pra rodar antes de qualquer
  // outro listener (e.g. iframe) e dar feedback visual mesmo quando
  // a tecla não bate com nota nenhuma.
  function onKey(e) {
    if (!running) return;
    const midi = keyCodeToMidi(e.code);
    dlog('keydown code=', e.code, 'midi=', midi, 'waiting=', waiting);
    if (midi == null) return;
    if (e.repeat) { e.preventDefault(); return; }
    e.preventDefault();
    flashBtn();
    handleHit(midi);
  }

  // Pisca o botão pra confirmar visualmente que a tecla foi capturada
  function flashBtn() {
    triggerBtn.classList.add('synth-key-flash');
    setTimeout(() => triggerBtn.classList.remove('synth-key-flash'), 120);
  }

  function handleHit(midi) {
    postToApp({ type: 'corvino:noteOn', midi, isBass: false });
    setTimeout(() => postToApp({ type: 'corvino:noteOff', midi, isBass: false }), 250);

    const target = mdNotes.find(n => n._state === 'pending' || n._state === 'preview');
    dlog('handleHit midi=', midi, 'target=', target && target.midi, 'state=', target && target._state);
    if (!target) return;

    // Modo ESPERA: aceita o hit independente do tempo (cursor pausado)
    if (waiting) {
      if (target.midi === midi) {
        target._state = 'hit';
        score.hits++;
        markNote(target._domEl, 'hit');
        updateBtn();
        resume();
      }
      // Nota errada em wait: ignora (continua esperando)
      return;
    }

    // Modo NORMAL: verifica janela de tempo
    const elapsedBeats = (performance.now() - startMs) / beatMs;
    const dt = Math.abs(elapsedBeats - target.startBeat);
    dlog('  elapsed=', elapsedBeats.toFixed(2), 'targetBeat=', target.startBeat, 'dt=', dt.toFixed(2));
    if (target.midi === midi && dt <= HIT_WINDOW_BEATS) {
      target._state = 'hit';
      score.hits++;
      markNote(target._domEl, 'hit');
      updateBtn();
    }
    // Nota errada / fora da janela: ignora; target continua pending
    // (vai virar wait quando cursor passar)
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

// --- Auto-scroll ---
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

// --- Cursor de tempo (linha vertical) ---
function createCursor(svg) {
  const NS = 'http://www.w3.org/2000/svg';
  const line = document.createElementNS(NS, 'line');
  line.setAttribute('class', 'synth-cursor');
  line.setAttribute('stroke', '#ffd060');
  line.setAttribute('stroke-width', '2.5');
  line.setAttribute('opacity', '0.85');
  line.style.display = 'none';
  line.style.filter = 'drop-shadow(0 0 6px rgba(255, 208, 96, 0.9))';
  line.style.pointerEvents = 'none';
  svg.appendChild(line);
  return line;
}

// --- Bolinha pulsante (sobre a próxima nota) ---
function createBall(svg) {
  const NS = 'http://www.w3.org/2000/svg';
  const circle = document.createElementNS(NS, 'circle');
  circle.setAttribute('class', 'synth-ball');
  circle.setAttribute('r', '11');
  circle.setAttribute('fill', 'none');
  circle.setAttribute('stroke', '#ffd060');
  circle.setAttribute('stroke-width', '2.5');
  circle.style.display = 'none';
  circle.style.filter = 'drop-shadow(0 0 8px rgba(255, 208, 96, 0.95))';
  circle.style.pointerEvents = 'none';
  svg.appendChild(circle);
  return circle;
}
