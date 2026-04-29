// score-player.js — Player de partitura sincronizado com o iframe do app.
//
// Uso típico em uma aula:
//
//   import { attachScorePlayer } from './js/score-player.js';
//   attachScorePlayer({
//     playBtnId: 'btn-ex1',          // botão "▶ Ouvir"
//     bpm: 80,
//     beatsPerBar: 4,                // (opcional) 2, 3 ou 4 — marca tempo forte no 1
//     notes: [
//       { midi: 48, beats: 4, el: '#ex1-n1' },
//       { midi: 50, beats: 2, el: '#ex1-n2' },
//       ...
//     ]
//   });
//
// - midi         = nota MIDI a tocar (48 = Dó, etc)
// - beats        = tempo que a nota OCUPA no grid rítmico (1 = 1 tempo)
// - el           = seletor CSS do elemento SVG (ellipse da nota) pra destacar
// - isBass       = (opcional, default false) se é nota do baixo
// - articulation = (opcional, default 0.92) fração do slot em que a nota SOA:
//                  0.92 = legato (padrão), 0.5 = tenuto médio, 0.28 = staccato
// - startBeat    = (opcional) tempo ABSOLUTO em beats onde a nota começa.
//                  Se omitido, a nota entra em sequência (cursor sequencial).
//                  Usar pra tocar 2 mãos simultâneas — ambas as mãos
//                  começam em startBeat 0, 1, 2... sem depender da outra.
//
// O player:
//   - Aguarda o iframe do app sinalizar 'corvino:ready' antes de habilitar.
//   - Manda 'corvino:noteOn' via postMessage, agenda 'corvino:noteOff'.
//   - Adiciona classe .score-note-active no el enquanto soar.
//   - Toca um click de metrônomo a cada tempo (Web Audio, precisão ~1ms).
//     Primeira batida de cada compasso (se beatsPerBar definido) é mais aguda.

const READY_CLASS = 'score-player-ready';
let appReady = false;
const readyListeners = [];

// ---------------------------------------------------------------------------
// AUTO-SCROLL — rola a página pra acompanhar a nota que está soando.
// Útil em partituras longas que não cabem na tela toda.
// ---------------------------------------------------------------------------
let lastScrollAt = 0;
const SCROLL_THROTTLE_MS = 600;     // não scrolla 2x dentro desse intervalo
const SCROLL_TOP_MARGIN = 130;      // header sticky + folga
const SCROLL_BOTTOM_MARGIN = 140;   // folga inferior
let userScrolledAt = 0;             // timestamp da última rolagem manual
const USER_SCROLL_PAUSE_MS = 2500;  // pausa o auto-scroll após ação manual

// Detecta rolagem manual do usuário pra não brigar com ele.
// (Auto-scroll programado também dispara 'scroll', então usamos um sinal:
//  qualquer scroll que chega DEPOIS de SCROLL_THROTTLE_MS do nosso é manual.)
window.addEventListener('scroll', () => {
  const now = Date.now();
  if (now - lastScrollAt > SCROLL_THROTTLE_MS + 50) {
    userScrolledAt = now;
  }
}, { passive: true });

// Roteia a partitura: se a nota estiver fora do viewport, suaviza scroll
// pra centralizá-la. Se já estiver visível, não faz nada.
function scrollNoteIntoView(el) {
  if (!el) return;
  const now = Date.now();
  // Throttle: evita 2 scrolls seguidos (MD + baixo no mesmo beat)
  if (now - lastScrollAt < SCROLL_THROTTLE_MS) return;
  // Respeita o usuário: se ele rolou manualmente há pouco, deixa quieto
  if (now - userScrolledAt < USER_SCROLL_PAUSE_MS) return;

  const rect = el.getBoundingClientRect();
  const vh = window.innerHeight || document.documentElement.clientHeight;

  // Já está visível com folga? Não faz nada.
  const visible = rect.top >= SCROLL_TOP_MARGIN
               && rect.bottom <= (vh - SCROLL_BOTTOM_MARGIN);
  if (visible) return;

  lastScrollAt = now;
  // Respeita preferência de movimento reduzido (idosos com sensibilidade)
  const reduced = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  try {
    el.scrollIntoView({
      behavior: reduced ? 'auto' : 'smooth',
      block: 'center',
      inline: 'nearest',
    });
  } catch (_e) {
    // Fallback pra navegadores antigos
    el.scrollIntoView();
  }
}

// Web Audio click compartilhado com synthesia.js
import { ensureAudioCtx, scheduleClick } from './metronome.js';

function findAppFrame() {
  return document.querySelector('iframe.app-frame');
}

function postToApp(msg) {
  const frame = findAppFrame();
  if (!frame || !frame.contentWindow) return;
  frame.contentWindow.postMessage(msg, '*');
}

// Listener global — app avisa quando está pronto
window.addEventListener('message', (ev) => {
  const d = ev.data;
  if (!d || typeof d !== 'object') return;
  if (d.type === 'corvino:ready' || d.type === 'corvino:pong') {
    appReady = true;
    document.body.classList.add(READY_CLASS);
    readyListeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
    readyListeners.length = 0;
  }
});

// Ping reativo pra casos em que a página carrega depois do app
function pingApp() {
  postToApp({ type: 'corvino:ping' });
}
// Polling leve até conseguir resposta
let pingTimer = null;
function startPinging() {
  if (appReady) return;
  if (pingTimer) return;
  pingTimer = setInterval(() => {
    if (appReady) { clearInterval(pingTimer); pingTimer = null; return; }
    pingApp();
  }, 1500);
  setTimeout(pingApp, 500); // primeira tentativa rápida
}

function onReady(fn) {
  if (appReady) fn();
  else readyListeners.push(fn);
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// CONSTRUÇÃO DA TOOLBAR (play + BPM control) — injetada no TOPO da figure
// ---------------------------------------------------------------------------
// Pra cada attachScorePlayer, geramos uma "row" dentro de uma toolbar única
// na <figure class="score-figure"> ancestral do botão original. O botão
// original do HTML é escondido — interagimos com os controles novos.
function buildPlayerUI(playBtnId, defaultBpm, defaultLabel) {
  const oldBtn = document.getElementById(playBtnId);
  if (!oldBtn) {
    console.warn('[score-player] botão não encontrado:', playBtnId);
    return null;
  }

  // Pega o label custom do botão original ("Ouvir devagar (60 BPM)" → "Ouvir devagar")
  const origText = (oldBtn.textContent || '').trim();
  const labelClean = origText
    .replace(/\(\s*\d+\s*BPM\s*\)/i, '')
    .replace(/^[▶■\s]+/, '')
    .trim() || defaultLabel || 'Ouvir';

  const figure = oldBtn.closest('.score-figure');

  // Sem figure (caso raro) — mantém o botão antigo, sem toolbar nem BPM controls
  if (!figure) {
    return { playBtn: oldBtn, bpmDisplay: null, bpmDecBtn: null, bpmIncBtn: null,
             oldBtn, label: labelClean, hasUI: false };
  }

  // Esconde o botão original (e seu wrapper) — substituímos pela toolbar
  oldBtn.style.display = 'none';
  const oldWrap = oldBtn.closest('.score-play-wrap');
  if (oldWrap) oldWrap.style.display = 'none';

  // Toolbar única por figure (compartilhada entre múltiplos players)
  let toolbar = figure.querySelector('.score-toolbar');
  if (!toolbar) {
    toolbar = document.createElement('div');
    toolbar.className = 'score-toolbar';
    figure.insertBefore(toolbar, figure.firstChild);
  }

  // Row de OPÇÕES COMPARTILHADAS (última row da toolbar):
  //   - Toggles MD/ME (claves) — controlam som de TODOS os players da figure
  //   - Botão Synthesia (se existir) — absorvido aqui também
  // Estado compartilhado via figure._handState (lido por todos players).
  let optionsRow = toolbar.querySelector('.score-toolbar-options');
  if (!optionsRow) {
    optionsRow = document.createElement('div');
    optionsRow.className = 'score-toolbar-row score-toolbar-options';
    optionsRow.innerHTML = `
      <div class="score-hands" role="group" aria-label="Mãos automáticas (clique pra mutar)">
        <span class="score-hands-label">Tocar:</span>
        <button class="score-hand-btn active" data-hand="me" type="button"
                title="Mão esquerda (clave de Fá) — clique pra mutar; partitura continua acendendo">
          <span class="clef-glyph clef-bass" aria-hidden="true">𝄢</span>
          <span class="visually-hidden">Mão esquerda</span>
        </button>
        <button class="score-hand-btn active" data-hand="md" type="button"
                title="Mão direita (clave de Sol) — clique pra mutar; partitura continua acendendo">
          <span class="clef-glyph clef-treble" aria-hidden="true">𝄞</span>
          <span class="visually-hidden">Mão direita</span>
        </button>
      </div>
    `;
    toolbar.appendChild(optionsRow);

    // Estado das mãos compartilhado por figure (lido por todos players)
    const handState = { md: true, me: true };
    figure._handState = handState;

    function fireHandChange(hand) {
      figure.dispatchEvent(new CustomEvent('handStateChange', {
        detail: { hand, state: { ...handState } }
      }));
    }

    optionsRow.querySelector('[data-hand="md"]').addEventListener('click', e => {
      handState.md = !handState.md;
      e.currentTarget.classList.toggle('active', handState.md);
      fireHandChange('md');
    });
    optionsRow.querySelector('[data-hand="me"]').addEventListener('click', e => {
      handState.me = !handState.me;
      e.currentTarget.classList.toggle('active', handState.me);
      fireHandChange('me');
    });

    // Absorve botão Synthesia (se existir) na MESMA row das mãos.
    // synthesia.js mantém referência via getElementById — só movemos no DOM.
    const synthWrap = figure.querySelector('.synth-play-wrap');
    if (synthWrap) {
      const synthBtn = synthWrap.querySelector('.synth-trigger');
      if (synthBtn) {
        optionsRow.appendChild(synthBtn);
        synthWrap.style.display = 'none';
      }
    }
  }

  // Row deste player (Lento, Normal...) — só play + BPM, sem hands
  const row = document.createElement('div');
  row.className = 'score-toolbar-row';
  row.innerHTML = `
    <button class="score-play-btn score-play-main" type="button" disabled>▶ ${labelClean}</button>
    <div class="score-bpm" role="group" aria-label="Andamento (BPM)">
      <span class="score-bpm-label">BPM</span>
      <button class="score-bpm-btn" data-act="dec" type="button" aria-label="Diminuir BPM">−</button>
      <button class="score-bpm-display" type="button" title="Voltar ao BPM recomendado (${defaultBpm})">${defaultBpm}</button>
      <button class="score-bpm-btn" data-act="inc" type="button" aria-label="Aumentar BPM">+</button>
    </div>
  `;
  // Insere ANTES do options row (que sempre fica por último)
  toolbar.insertBefore(row, optionsRow);

  return {
    playBtn: row.querySelector('.score-play-main'),
    bpmDisplay: row.querySelector('.score-bpm-display'),
    bpmDecBtn: row.querySelector('[data-act="dec"]'),
    bpmIncBtn: row.querySelector('[data-act="inc"]'),
    figure,                  // pra ler figure._handState durante playback
    oldBtn,
    label: labelClean,
    hasUI: true
  };
}

// Cria o botão Synthesia automaticamente na figure se ainda não existir.
// Importa synthesia.js dinamicamente e attacha com as MESMAS notes do
// score-player. Reutiliza notes (midi/beats/startBeat/el/isBass) — não
// precisa duplicar configuração nas aulas.
function autoAttachSynthesia(figure, playBtnId, bpm, beatsPerBar, notes) {
  if (!figure) return;
  if (figure.querySelector('.synth-trigger')) return;  // já tem (manual)

  const wrap = document.createElement('div');
  wrap.className = 'synth-play-wrap';
  const btn = document.createElement('button');
  btn.id = playBtnId + '-syn';
  btn.className = 'score-play-btn synth-trigger';
  btn.type = 'button';
  btn.textContent = '🎮 Modo Synthesia';
  wrap.appendChild(btn);
  figure.appendChild(wrap);

  import('./synthesia.js').then(({ attachSynthesia }) => {
    attachSynthesia({
      triggerBtnId: btn.id,
      bpm,
      beatsPerBar: beatsPerBar || 0,
      notes,
    });
  }).catch(err => console.error('[score-player] falha ao carregar synthesia:', err));
}

export function attachScorePlayer({ playBtnId, bpm = 80, beatsPerBar = null, notes = [], countIn = true }) {
  startPinging();

  // Auto-injeção do botão Synthesia ANTES do buildPlayerUI, pra que
  // ele seja absorvido na options row da toolbar normalmente.
  const oldBtn0 = document.getElementById(playBtnId);
  const figure0 = oldBtn0 && oldBtn0.closest('.score-figure');
  autoAttachSynthesia(figure0, playBtnId, bpm, beatsPerBar, notes);

  const ui = buildPlayerUI(playBtnId, bpm, 'Ouvir');
  if (!ui) return;

  const btn = ui.playBtn;
  btn.classList.add('score-play-btn');
  btn.disabled = true;
  btn.title = 'Carregando áudio do acordeon...';

  onReady(() => {
    btn.disabled = false;
    btn.title = 'Ouvir esse exemplo';
  });

  // BPM ajustável — começa no recomendado, aluno acelera/desacelera
  const BPM_MIN = 40;
  const BPM_MAX = 200;
  const BPM_STEP = 5;
  let currentBpm = bpm;

  let playing = false;
  let timeouts = [];
  let scheduledOscs = [];
  let activeEls = [];

  // Estado das mãos compartilhado via figure._handState — controlado
  // pelos toggles na row de opções (única por figure). Lido em cada
  // setTimeout do noteOn pra respeitar mudanças durante o playback.
  const handState = (ui.figure && ui.figure._handState) || { md: true, me: true };

  function setBpm(newBpm) {
    newBpm = Math.max(BPM_MIN, Math.min(BPM_MAX, Math.round(newBpm)));
    currentBpm = newBpm;
    if (ui.bpmDisplay) {
      ui.bpmDisplay.textContent = newBpm;
      ui.bpmDisplay.classList.toggle('modified', newBpm !== bpm);
    }
  }

  if (ui.hasUI) {
    ui.bpmDecBtn.addEventListener('click', () => { if (!playing) setBpm(currentBpm - BPM_STEP); });
    ui.bpmIncBtn.addEventListener('click', () => { if (!playing) setBpm(currentBpm + BPM_STEP); });
    ui.bpmDisplay.addEventListener('click', () => { if (!playing) setBpm(bpm); });
  }

  function setBpmControlsDisabled(disabled) {
    if (!ui.hasUI) return;
    ui.bpmDecBtn.disabled = disabled;
    ui.bpmIncBtn.disabled = disabled;
    ui.bpmDisplay.disabled = disabled;
  }

  function stop() {
    timeouts.forEach(clearTimeout);
    timeouts = [];
    scheduledOscs.forEach(osc => { try { osc.stop(); } catch (e) {} });
    scheduledOscs = [];
    postToApp({ type: 'corvino:allOff' });
    activeEls.forEach(el => el.classList.remove('score-note-active'));
    activeEls = [];
    playing = false;
    btn.textContent = `▶ ${ui.label}`;
    btn.classList.remove('playing', 'count-in');
    setBpmControlsDisabled(false);
  }

  btn.addEventListener('click', () => {
    if (playing) { stop(); return; }
    if (!appReady) return;

    // Garante AudioContext ativo (gesto do usuário)
    ensureAudioCtx();

    playing = true;
    setBpmControlsDisabled(true);
    const beatMs = 60000 / currentBpm;
    const beatSec = 60 / currentBpm;

    // Count-in: 1 compasso de clicks pra preparar o aluno antes da música
    // (só faz sentido se beatsPerBar estiver definido)
    const countInBeats = (countIn && beatsPerBar) ? beatsPerBar : 0;

    if (countInBeats > 0) {
      btn.textContent = '■ Preparando…';
      btn.classList.add('playing', 'count-in');
      // troca pra "■ Parar" assim que a música real começa
      timeouts.push(setTimeout(() => {
        btn.textContent = '■ Parar';
        btn.classList.remove('count-in');
      }, countInBeats * beatMs));
    } else {
      btn.textContent = '■ Parar';
      btn.classList.add('playing');
    }

    // Pré-calcula o startBeat e endBeat de cada nota (pra descobrir a duração total do exercício)
    let seqCursor = 0; // cursor em BEATS pro modo sequencial
    const scheduled = notes.map(note => {
      const hasExplicitStart = typeof note.startBeat === 'number';
      const startBeats = hasExplicitStart ? note.startBeat : seqCursor;
      if (!hasExplicitStart) seqCursor += (note.beats || 0);
      return { note, startBeats, endBeats: startBeats + (note.beats || 0) };
    });

    // Duração total da música em beats
    const musicBeats = Math.ceil(
      scheduled.reduce((max, s) => Math.max(max, s.endBeats), 0)
    );
    const totalBeats = countInBeats + musicBeats;

    // Agenda clicks do metrônomo — count-in + música inteira
    for (let beat = 0; beat < totalBeats; beat++) {
      const isStrong = beatsPerBar && (beat % beatsPerBar) === 0;
      const osc = scheduleClick(beat * beatSec, isStrong);
      if (osc) scheduledOscs.push(osc);
    }

    // Resolve `note.el` em array de elementos:
    //   - string "#a"        → 1 elemento
    //   - string "#a,#b"     → vários (seletor combinado)
    //   - array [...]         → cada item resolvido (string ou DOM)
    //   - DOM Element        → passa direto
    // Útil pra ligaduras e tied notes onde uma nota soa uma vez e
    // visualmente atinge mais de uma cabeça simultânea.
    const resolveEls = (spec) => {
      if (!spec) return [];
      if (Array.isArray(spec)) return spec.flatMap(resolveEls);
      if (typeof spec === 'string') return Array.from(document.querySelectorAll(spec));
      return [spec];
    };

    // Agenda notas (atrasadas por countInBeats)
    for (const { note, startBeats } of scheduled) {
      // Nota "visual-only" = sem som mas com `el` pra animar.
      // Útil pra notas ligadas onde o som já está sendo tocado por uma
      // outra nota paralela e essa só serve pra acender visualmente
      // (segunda metade de uma ligadura, p.ex.).
      const isVisualOnly = note.rest || note.midi == null;
      // Pausa COMPLETA (rest sem el): só ocupa espaço, não toca nem anima.
      if (isVisualOnly && !note.el) continue;

      const startMs = (startBeats + countInBeats) * beatMs;
      const slotMs = (note.beats || 0) * beatMs;
      const artic = typeof note.articulation === 'number'
        ? Math.max(0.05, Math.min(1, note.articulation))
        : 0.92;
      const soundMs = Math.max(50, slotMs * artic);
      const isBass = !!note.isBass;
      // Visual ocupa o slot inteiro (não respeita articulation — não tem som).
      const visualMs = isVisualOnly ? slotMs : soundMs;

      // Captura se o noteOn foi emitido — pra noteOff só disparar
      // se a mão estava ativa naquele momento (evita "noteOff órfão"
      // e nota presa se aluno toggle a mão durante o playback).
      let onFired = false;

      // noteOn
      timeouts.push(setTimeout(() => {
        const handOn = isBass ? handState.me : handState.md;
        if (!isVisualOnly && handOn) {
          postToApp({ type: 'corvino:noteOn', midi: note.midi, isBass });
          onFired = true;
        }
        if (note.el) {
          const els = resolveEls(note.el);
          if (els.length) {
            els.forEach(el => {
              el.classList.add('score-note-active');
              activeEls.push(el);
            });
            // Rola a página pra trazer a nota à vista, se necessário.
            // Só roteia em notas da MD (não baixos) — evita pular pra outro
            // pentagrama em peças com 2 staves; baixo geralmente está perto.
            if (!isBass) scrollNoteIntoView(els[0]);
          }
        }
      }, startMs));

      // noteOff
      timeouts.push(setTimeout(() => {
        if (onFired) {
          postToApp({ type: 'corvino:noteOff', midi: note.midi, isBass });
          onFired = false;
        }
        if (note.el) {
          const els = resolveEls(note.el);
          els.forEach(el => {
            el.classList.remove('score-note-active');
            activeEls = activeEls.filter(x => x !== el);
          });
        }
      }, startMs + visualMs));
    }

    // auto-reset depois que acabar (totalBeats em ms + folga)
    timeouts.push(setTimeout(stop, totalBeats * beatMs + 200));
  });

  // clean-up se a aula for fechada
  window.addEventListener('beforeunload', stop);
}

// Pausa se o aluno trocar de aba (evita notas presas)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) postToApp({ type: 'corvino:allOff' });
});
