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

import { ensureAudioCtx, scheduleClick } from './metronome.js';

// DEBUG ligado por padrão durante fase de bug-hunt do Synthesia.
// Pode desligar via window.SYNTH_DEBUG = false antes do import.
const DEBUG = (typeof window === 'undefined') ? false :
  (window.SYNTH_DEBUG === false ? false : true);
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
// Inverso, só pra log: nome da tecla esperada pra um midi
function midiToKey(midi) {
  switch (midi) {
    case 60: return 'G (Dó)';
    case 62: return 'H (Ré)';
    case 64: return 'J (Mi)';
    case 65: return 'K (Fá)';
    case 67: return 'L (Sol)';
    case 69: return 'Ç (Lá)';
    case 71: return '~ (Si)';
    case 72: return '] (Dó8a)';
    case 61: return 'Y (Dó#)';
    case 63: return 'U (Ré#)';
    case 66: return 'O (Fá#)';
    case 68: return 'P (Sol#)';
    case 70: return '[ (Lá#)';
    default: return '?';
  }
}
// --- Mapeamento BAIXOS (event.code → MIDI). Mesma layout do
// keyboard-input.js da app. Dá pro aluno tocar ME no teclado quando
// quer estudar a esquerda em modo wait.
function keyCodeToBassMidi(code) {
  switch (code) {
    // Coluna Dó
    case 'Digit2': return 28; // contrabaixo
    case 'KeyW':   return 24; // fundamental
    case 'KeyS':   return 25; // maior
    case 'KeyX':   return 36; // menor
    // Coluna Fá
    case 'Digit1': return 33;
    case 'KeyQ':   return 29;
    case 'KeyA':   return 30;
    case 'KeyZ':   return 41;
    // Coluna Sol
    case 'Digit3': return 35;
    case 'KeyE':   return 31;
    case 'KeyD':   return 32;
    case 'KeyC':   return 43;
    // Coluna Ré
    case 'Digit4': return 54;
    case 'KeyR':   return 26;
    case 'KeyF':   return 27;
    case 'KeyV':   return 38;
    default: return null;
  }
}
// Nome do baixo (pra mostrar dentro da bolinha)
function midiToBassName(midi) {
  switch (midi) {
    case 24: case 28: return 'Dó';
    case 25:          return 'DóM';
    case 36:          return 'Dóm';
    case 29: case 33: return 'Fá';
    case 30:          return 'FáM';
    case 41:          return 'Fám';
    case 31: case 35: return 'Sol';
    case 32:          return 'SolM';
    case 44:          return 'Sol7';
    case 43:          return 'Solm';
    case 26: case 54: return 'Ré';
    case 27:          return 'RéM';
    case 38:          return 'Rém';
    default: return '?';
  }
}
// Tecla do baixo (pra mostrar acima da bolinha)
function midiToBassKey(midi) {
  switch (midi) {
    case 24: return 'W';  case 25: return 'S';
    case 28: return '2';  case 36: return 'X';
    case 29: return 'Q';  case 30: return 'A';
    case 33: return '1';  case 41: return 'Z';
    case 31: return 'E';  case 32: return 'D';
    case 35: return '3';  case 43: return 'C';
    case 26: return 'R';  case 27: return 'F';
    case 54: return '4';  case 38: return 'V';
    case 44: return 'C';  // Sol7 → coluna Sol acordes
    default: return '?';
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
// beatsPerBar: se setado (ex: 3 pra valsa), toca COUNT-IN — N clicks
// metronome com a 1ª batida mais aguda — antes do jogo começar. O aluno
// percebe o tempo antes de precisar tocar a 1ª nota. Default 0 (sem).
export function attachSynthesia({ triggerBtnId, bpm = 60, beatsPerBar = 0, notes = [] }) {
  console.log('[synthesia] attach: btn=', triggerBtnId, 'bpm=', bpm, 'notes=', notes.length);
  const triggerBtn = document.getElementById(triggerBtnId);
  if (!triggerBtn) {
    console.warn('[synthesia] botão não encontrado:', triggerBtnId);
    return;
  }
  // Pega a figure ancestral pra ler o handState compartilhado (toggles
  // 𝄞 𝄢 da toolbar). Se não estiver dentro de uma figure (caso raro),
  // assume ambas mãos ativas (comportamento default).
  const figure = triggerBtn.closest('.score-figure');
  function getHandState() {
    return (figure && figure._handState) || { md: true, me: true };
  }

  // Lista UNIFICADA de notas (MD + ME), ordenada por startBeat. Cada nota
  // ganha _state que migra: pending → preview (esperando aluno tocar) ou
  // pending → hit (auto-tocada). Toggle 𝄞/𝄢 da toolbar decide auto vs wait
  // POR NOTA, no momento que o cursor chega nela.
  const allNotes = notes
    .filter(n => typeof n.midi === 'number')
    .map(n => ({
      midi: n.midi,
      beats: n.beats || 1,
      startBeat: n.startBeat ?? 0,
      el: n.el,
      isBass: !!n.isBass,
      articulation: typeof n.articulation === 'number'
        ? n.articulation
        : (n.isBass ? 0.85 : 0.92),
      _state: 'pending',
    }))
    .sort((a, b) => a.startBeat - b.startBeat);

  // Resolve DOM elements + posições no SVG (se el estiver presente)
  allNotes.forEach(n => {
    if (n.el) {
      n._domEl = document.querySelector(n.el);
      if (n._domEl) n._pos = getViewBoxPos(n._domEl);
    }
  });

  // Sub-listas pra acesso rápido. mdNotes é usada pra posicionar o cursor
  // (que segue só a melodia da MD através dos staves).
  const mdNotes = allNotes.filter(n => !n.isBass && n._domEl);
  const meNotes = allNotes.filter(n => n.isBass);

  if (mdNotes.length === 0) {
    console.warn('[synthesia] nenhuma nota MD compatível');
    return;
  }

  console.log('[synthesia] MD=', mdNotes.length, 'ME=', meNotes.length,
    'primeira MD: midi=', mdNotes[0].midi, 'el=', mdNotes[0].el);

  const scoreSvg = mdNotes[0]._domEl.closest('svg');
  if (!scoreSvg) return;

  const cursor = createCursor(scoreSvg);
  const ball = createBall(scoreSvg);
  const keyLabel = createKeyLabel(scoreSvg);
  const keyHint = createKeyHint(scoreSvg);

  const totalBeats = Math.max(...allNotes.map(n => n.startBeat + n.beats)) + 1;

  const HIT_WINDOW_BEATS = 0.45;
  // LOOKAHEAD = lead-in antes da 1ª nota. Se beatsPerBar setado, vira
  // count-in (N clicks). Senão, fica em 1.5 beats de margem silenciosa.
  const LOOKAHEAD_BEATS = beatsPerBar > 0 ? beatsPerBar : 1.5;

  let running = false;
  let waiting = false;        // true = pausado esperando aluno tocar
  let waitBeat = 0;           // beat onde o cursor parou
  let startMs = 0;
  let beatMs = 60000 / bpm;
  let rafId = null;
  let meTimeouts = [];
  let scheduledClicks = [];   // oscillators do count-in pra cancelar no stop
  // Score dinâmico — total cresce conforme notas viram "preview"
  // (esperam o aluno). hits contabiliza preview→hit. Em modo full-auto
  // (ambas mãos ON) o total fica 0 e não mostramos placar.
  const score = { hits: 0, total: 0 };

  const originalBtnText = triggerBtn.textContent;
  function updateBtn() {
    if (!running) { triggerBtn.textContent = originalBtnText; return; }
    triggerBtn.textContent = score.total > 0
      ? `■ Parar (${score.hits}/${score.total})`
      : '■ Parar';
  }

  triggerBtn.addEventListener('click', () => {
    running ? stop(true) : start();
  });

  // Listener no document em fase de CAPTURE pra rodar antes de qualquer
  // outro listener da página. Não interfere no iframe (frame separado).
  document.addEventListener('keydown', onKey, true);

  // O iframe da app repassa keydowns via postMessage('corvino:keyForward')
  // — necessário pq o iframe normalmente "consome" os eventos quando ele
  // tem foco, e o aluno frequentemente clica nele. Tratamos como keydown.
  // Também escuta 'corvino:midiInput' (Corvino acordeon real → MIDI direto).
  window.addEventListener('message', onIframeMessage);
  function onIframeMessage(e) {
    const d = e && e.data;
    if (!d || typeof d !== 'object') return;

    // Teclado do computador relayado da iframe
    if (d.type === 'corvino:keyForward' && d.evt === 'keydown') {
      dlog('keyForward (iframe→parent) code=', d.code);
      onKey({
        code: d.code,
        key: d.key,
        repeat: !!d.repeat,
        preventDefault: () => {},
      });
      return;
    }

    // Corvino MIDI físico (acordeon real). Só noteOn — chegam direto
    // na iframe pelo Web MIDI API e não disparam keydown. Passamos
    // playSound=false porque o app já tocou via audio engine (evita
    // som duplicado).
    if (d.type === 'corvino:midiInput' && d.evt === 'noteOn') {
      if (!running) return;
      dlog('midiInput (Corvino→parent) midi=', d.midi, 'isBass=', d.isBass);
      flashBtn();
      handleHit(d.midi, !!d.isBass, false);
    }
  }

  function start() {
    console.log('[synthesia] START — bpm=', bpm, 'mdNotes[0].midi=', mdNotes[0].midi,
      '(esperado tecla:', midiToKey(mdNotes[0].midi), ')');
    running = true;
    waiting = false;
    waitBeat = 0;
    score.hits = 0;
    score.total = 0;
    allNotes.forEach(n => {
      n._state = 'pending';
      n._counted = false;
      if (n._domEl) resetNoteColor(n._domEl);
    });
    triggerBtn.classList.add('playing');
    cursor.style.display = '';
    ball.style.display = '';
    keyLabel.style.display = '';
    keyHint.style.display = '';
    updateBtn();
    // Foca o botão pra garantir que keydowns vão pro parent (não pra iframe)
    try { triggerBtn.focus({ preventScroll: true }); } catch (_) {}
    // Desativa kbd direto do iframe enquanto Synthesia toca, pra evitar
    // som duplicado (iframe tocaria + Synthesia também via postToApp).
    // O iframe salva o estado atual e restaura no stop.
    postToApp({ type: 'corvino:setKbdEnabled', value: false, save: true });
    beatMs = 60000 / bpm;
    startMs = performance.now() + LOOKAHEAD_BEATS * beatMs;

    // COUNT-IN: agenda N clicks de metrônomo durante o lead-in.
    // 1º click = forte (1ª batida do compasso), demais = fracos.
    // Dá ao aluno o "1, 2, 3" antes da 1ª nota tocar.
    if (beatsPerBar > 0) {
      ensureAudioCtx();
      const beatSec = 60 / bpm;
      for (let b = 0; b < beatsPerBar; b++) {
        const osc = scheduleClick(b * beatSec, b === 0);
        if (osc) scheduledClicks.push(osc);
      }
      // UX: mostra "Preparando…" no botão durante o count-in
      const prepText = '⏳ Preparando…';
      triggerBtn.textContent = prepText;
      triggerBtn.classList.add('count-in');
      setTimeout(() => {
        if (running && triggerBtn.textContent === prepText) {
          triggerBtn.classList.remove('count-in');
          updateBtn();
        }
      }, beatsPerBar * beatMs);
    }

    scheduleAutoStop();
    rafId = requestAnimationFrame(tick);
  }

  function stop(showFinal = false) {
    running = false;
    waiting = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    clearAllMeTimeouts();
    // Cancela clicks de count-in que ainda não tocaram
    scheduledClicks.forEach(osc => { try { osc.stop(); } catch (_) {} });
    scheduledClicks = [];
    postToApp({ type: 'corvino:allOff' });
    // Restaura kbd direto da iframe ao estado anterior (que ficou salvo no start)
    postToApp({ type: 'corvino:setKbdEnabled', restore: true });
    triggerBtn.classList.remove('playing', 'count-in');
    cursor.style.display = 'none';
    ball.style.display = 'none';
    keyLabel.style.display = 'none';
    keyHint.style.display = 'none';
    if (showFinal) showFinalScore();
    updateBtn();
  }

  function clearAllMeTimeouts() {
    meTimeouts.forEach(t => clearTimeout(t));
    meTimeouts = [];
  }

  // Auto-play: toca a nota imediatamente e agenda noteOff.
  // Usado quando o toggle correspondente (𝄞/𝄢) está LIGADO — a mão
  // toca sozinha, sem esperar input do aluno.
  function autoPlayNote(note) {
    postToApp({ type: 'corvino:noteOn', midi: note.midi, isBass: note.isBass });
    const slotMs = note.beats * beatMs;
    const soundMs = Math.max(50, slotMs * note.articulation);
    meTimeouts.push(setTimeout(() => {
      postToApp({ type: 'corvino:noteOff', midi: note.midi, isBass: note.isBass });
    }, soundMs));
  }

  // Agenda o auto-stop final (chamado no start)
  function scheduleAutoStop() {
    meTimeouts.push(setTimeout(() => {
      if (running && !waiting) stop(true);
    }, (totalBeats + LOOKAHEAD_BEATS) * beatMs + 500));
  }

  // ----- Pausa o jogo (cursor para de avançar) -----
  function pause(atBeat, target) {
    waiting = true;
    waitBeat = atBeat;
    clearAllMeTimeouts();
    postToApp({ type: 'corvino:allOff' });
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    if (target) {
      console.log('[synthesia] PAUSE beat=', atBeat,
        '— esperando midi=', target.midi, '(tecla:', midiToKey(target.midi), ')');
    } else {
      dlog('PAUSE em beat=', atBeat);
    }
    // O cursor permanece visível na posição da nota target (ball pulsa)
  }

  // ----- Retoma após o aluno tocar todas as notas pendentes -----
  function resume() {
    if (!waiting) return;
    waiting = false;
    // Ajusta startMs pra que elapsedBeats continue de waitBeat
    startMs = performance.now() - waitBeat * beatMs;
    console.log('[synthesia] RESUME a partir de beat=', waitBeat);
    rafId = requestAnimationFrame(tick);
  }

  // ----- Loop principal -----
  // Para cada nota cuja startBeat foi alcançada:
  //   - Toggle da mão LIGADO  → auto-play (postNoteOn + agenda noteOff)
  //   - Toggle da mão DESLIGADO → marca preview (espera aluno tocar)
  // Se ALGUMA nota preview ficou para trás (cursor passou da hit window
  // sem o aluno tocar) → PAUSA.
  function tick(now) {
    if (!running || waiting) return;
    const elapsedBeats = (now - startMs) / beatMs;
    const handState = getHandState();

    // 1) Processa notas cujo startBeat já foi alcançado
    for (const note of allNotes) {
      if (note._state !== 'pending') continue;
      if (note.startBeat > elapsedBeats) break; // ordenadas: futuras
      const auto = note.isBass ? handState.me : handState.md;
      if (auto) {
        autoPlayNote(note);
        note._state = 'hit';
        if (note._domEl && !note.isBass) markNote(note._domEl, 'hit');
      } else {
        note._state = 'preview';
        if (!note._counted) { score.total++; note._counted = true; }
        if (note._domEl) markNote(note._domEl, 'preview');
      }
    }

    // 2) Pausa se ALGUMA nota em preview já passou da hit window
    const stuck = allNotes.find(n =>
      n._state === 'preview' && elapsedBeats > n.startBeat + HIT_WINDOW_BEATS
    );
    if (stuck) {
      pause(stuck.startBeat, stuck);
      // Posiciona ball/cursor na nota travada (preferindo MD se houver)
      const stuckMd = mdNotes.find(n =>
        n._state === 'preview' && elapsedBeats > n.startBeat + HIT_WINDOW_BEATS
      );
      const focus = stuckMd || stuck;
      if (focus._pos) {
        placeBall(focus._pos, focus.midi, focus.isBass);
        cursor.setAttribute('x1', focus._pos.x);
        cursor.setAttribute('x2', focus._pos.x);
        cursor.setAttribute('y1', focus._pos.y - 75);
        cursor.setAttribute('y2', focus._pos.y + 90);
        scrollNoteIntoView(focus._domEl);
      }
      return;
    }

    // 3) Cursor avança com o tempo (segue posição da MD no SVG)
    const cursorPos = computeCursorPosition(elapsedBeats);
    if (cursorPos) {
      cursor.setAttribute('x1', cursorPos.x);
      cursor.setAttribute('x2', cursorPos.x);
      cursor.setAttribute('y1', cursorPos.y - 75);
      cursor.setAttribute('y2', cursorPos.y + 90);
    }

    // 4) Bolinha + rótulo: aponta a próxima nota a tocar (preview).
    //    Prefere MD; se só tem ME preview, usa ME.
    const nextPreviewMd = mdNotes.find(n => n._state === 'preview');
    const nextPreview = nextPreviewMd ||
      allNotes.find(n => n._state === 'preview');
    if (nextPreview && nextPreview._pos) {
      placeBall(nextPreview._pos, nextPreview.midi, nextPreview.isBass);
      scrollNoteIntoView(nextPreview._domEl);
    } else {
      ball.style.display = 'none';
      keyLabel.style.display = 'none';
      keyHint.style.display = 'none';
    }

    if (elapsedBeats < totalBeats + LOOKAHEAD_BEATS) {
      rafId = requestAnimationFrame(tick);
    } else {
      stop(true);
    }
  }

  // Helper: move ball + rótulo pra mesma posição da nota target.
  // Dentro da bolinha: nome da nota (Dó, Ré, Mi...) — bate com a partitura.
  // Acima: tecla a apertar (G, H, J... ou Q W E pra baixos).
  function placeBall(p, midi, isBass = false) {
    ball.setAttribute('cx', p.x);
    ball.setAttribute('cy', p.y);
    keyLabel.setAttribute('x', p.x);
    keyLabel.setAttribute('y', p.y);
    keyLabel.textContent = isBass
      ? midiToBassName(midi)
      : midiToNoteName(midi);
    keyHint.setAttribute('x', p.x);
    keyHint.setAttribute('y', p.y - 22);
    keyHint.textContent = isBass
      ? '⌨ ' + midiToBassKey(midi)
      : '⌨ ' + midiToKeyLetter(midi);
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
  // Captura keydown em CAPTURE pra rodar antes de qualquer outro listener.
  // Mapeia teclas MD (G H J K L Ç ~ ]) e BAIXO (Q W E R + Digits + S D F).
  function onKey(e) {
    const mdMidi = keyCodeToMidi(e.code);
    const bassMidi = keyCodeToBassMidi(e.code);
    const midi = mdMidi != null ? mdMidi : bassMidi;
    const isBass = mdMidi == null && bassMidi != null;
    dlog('keydown code=', e.code, 'midi=', midi, 'isBass=', isBass,
      'running=', running, 'waiting=', waiting);
    if (!running) return;
    if (midi == null) return;
    if (e.repeat) { e.preventDefault(); return; }
    e.preventDefault();
    flashBtn();
    handleHit(midi, isBass, true);
  }

  // Pisca o botão pra confirmar visualmente que a tecla foi capturada
  function flashBtn() {
    triggerBtn.classList.add('synth-key-flash');
    setTimeout(() => triggerBtn.classList.remove('synth-key-flash'), 120);
  }

  // Trata um hit do aluno (teclado do PC ou Corvino MIDI físico).
  // Procura uma nota em PREVIEW que case com midi+isBass; se acertar:
  //   - marca hit e som verde
  //   - se não tem mais notas preview "stuck" (cursor passou), RESUME
  // Se não tem target preview, só toca o som (feedback livre).
  // playSound=false quando o som já foi tocado pelo iframe (Corvino real).
  function handleHit(midi, isBass = false, playSound = true) {
    // Procura nota preview que case (pode ter várias se ambas mãos OFF
    // no mesmo beat — pega a primeira que bate; nas próximas chamadas
    // o aluno toca a outra).
    const target = allNotes.find(n =>
      n._state === 'preview' && n.midi === midi && n.isBass === isBass
    );
    dlog('handleHit midi=', midi, 'isBass=', isBass,
      'target?', !!target, 'state=', target && target._state);

    if (playSound) {
      postToApp({ type: 'corvino:noteOn', midi, isBass });
      setTimeout(() => postToApp({ type: 'corvino:noteOff', midi, isBass }), 250);
    }

    if (!target) return;
    target._state = 'hit';
    score.hits++;  // conta hits de qualquer mão (MD ou ME) que estavam waiting
    if (target._domEl) markNote(target._domEl, 'hit');
    updateBtn();

    // Se ainda há QUALQUER nota em preview, continua pausado (aluno
    // precisa tocar todas antes de o cursor voltar). Senão, retoma.
    if (waiting) {
      const stillWaiting = allNotes.some(n => n._state === 'preview');
      if (!stillWaiting) resume();
    }
  }

  function showFinalScore() {
    if (score.total === 0) {
      // Modo full-auto (ambas mãos ON) — não há pontuação a mostrar
      triggerBtn.textContent = '✓ Tocou!';
      setTimeout(() => updateBtn(), 3000);
      return;
    }
    const pct = Math.round((score.hits / score.total) * 100);
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

// --- Rótulo dentro da bolinha — nome da nota (Dó, Ré, Mi...) ---
// Bate com o nome da nota que aparece na partitura. Confirma pro aluno
// "esta é a próxima nota a tocar".
function createKeyLabel(svg) {
  const NS = 'http://www.w3.org/2000/svg';
  const text = document.createElementNS(NS, 'text');
  text.setAttribute('class', 'synth-key-label');
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('dominant-baseline', 'middle');
  text.setAttribute('font-size', '9');
  text.setAttribute('font-weight', '700');
  text.setAttribute('fill', '#1a1618');
  text.style.display = 'none';
  text.style.pointerEvents = 'none';
  svg.appendChild(text);
  return text;
}

// --- Hint da tecla (acima da bolinha) — diz QUAL tecla apertar ---
// Posição: ~22px acima do centro da bolinha. Texto pequeno, claro
// fundo escuro semi-transparente pra contrastar com qualquer fundo.
function createKeyHint(svg) {
  const NS = 'http://www.w3.org/2000/svg';
  const text = document.createElementNS(NS, 'text');
  text.setAttribute('class', 'synth-key-hint');
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('dominant-baseline', 'middle');
  text.setAttribute('font-size', '11');
  text.setAttribute('font-weight', '700');
  text.setAttribute('fill', '#ffd060');
  text.style.display = 'none';
  text.style.pointerEvents = 'none';
  svg.appendChild(text);
  return text;
}
// Pega o nome da nota a partir do midi (p/ exibir dentro da bolinha)
// Mostra Dó, Ré, Mi... — combina com o nome que o aluno vê na partitura.
function midiToNoteName(midi) {
  // Notação fixa Dó central (MIDI 60). Pretas usam o sustenido.
  switch (midi) {
    case 60: return 'Dó';
    case 61: return 'Dó#';
    case 62: return 'Ré';
    case 63: return 'Ré#';
    case 64: return 'Mi';
    case 65: return 'Fá';
    case 66: return 'Fá#';
    case 67: return 'Sol';
    case 68: return 'Sol#';
    case 69: return 'Lá';
    case 70: return 'Lá#';
    case 71: return 'Si';
    case 72: return 'Dó';
    default: return '?';
  }
}
// Letra da tecla (p/ exibir como hint pequeno acima da bolinha)
function midiToKeyLetter(midi) {
  switch (midi) {
    case 60: return 'G';
    case 62: return 'H';
    case 64: return 'J';
    case 65: return 'K';
    case 67: return 'L';
    case 69: return 'Ç';
    case 71: return '~';
    case 72: return ']';
    case 61: return 'Y';
    case 63: return 'U';
    case 66: return 'O';
    case 68: return 'P';
    case 70: return '[';
    default: return '?';
  }
}
