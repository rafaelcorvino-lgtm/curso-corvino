// Gravador MIDI — Corvino Acordeon
// Embutindo o app `../app/?embed=1` em iframe e consumindo:
//   ← `corvino:midiInput`  (eventos do que tá sendo tocado)
//   → `corvino:noteOn/Off/allOff` (playback)
//   → `corvino:ping` ↔ `corvino:pong/ready` (handshake)

import { bassMidiToRealNotes, bassRowOf } from './midifile.js';
import { buildMidiFile } from './midifile.js';

// ---------- DOM ----------
const $ = id => document.getElementById(id);
const iframe = $('corvinoApp');
const connEl = $('connStatus');
const info = $('infoText');
const timerEl = $('timer');
const canvas = $('rollCanvas');
const ctx = canvas.getContext('2d');

const btnRec   = $('btnRec');
const btnStop  = $('btnStop');
const btnPlay  = $('btnPlay');
const btnLoop  = $('btnLoop');
const btnClear = $('btnClear');
const btnSave  = $('btnSave');
const btnExportMidi = $('btnExportMidi');
const fileLoad = $('fileLoad');
const inpBpm = $('bpm');
const inpQuant = $('quantize');
const inpCountIn = $('countIn');
const inpMetro = $('metronome');

// ---------- Estado ----------
const State = {
  ready: false,            // app respondeu ping/ready
  mode: 'idle',            // 'idle' | 'countin' | 'recording' | 'playing'
  recStart: 0,             // performance.now() do início da gravação
  events: [],              // {t: seconds, type: 'on'|'off', midi, isBass, velocity}
  notes: [],               // {t, dur, midi, isBass, velocity, row}
  loop: false,
  playStart: 0,            // performance.now() do início do playback
  playTimers: [],          // setTimeout ids
  countinTimers: [],
  metroBeatIdx: 0,         // próximo beat do metrônomo a agendar
  metroStartTime: 0,       // ac.currentTime quando começou a gravar
  metroLoopTimer: null,    // setTimeout que re-agenda o próximo chunk
  audioCtx: null,          // pra metrônomo + count-in click
  metroGain: null,         // GainNode mestre do metrônomo (mute no Stop)
};

// ---------- Conexão com o app (handshake) ----------
function postToApp(msg) {
  iframe.contentWindow?.postMessage(msg, '*');
}

let pingTimer = null;
function startPinging() {
  pingTimer = setInterval(() => {
    if (State.ready) { clearInterval(pingTimer); return; }
    postToApp({ type: 'corvino:ping' });
  }, 800);
}

window.addEventListener('message', (ev) => {
  const d = ev.data;
  if (!d || typeof d !== 'object') return;

  if (d.type === 'corvino:ready' || d.type === 'corvino:pong') {
    if (!State.ready) {
      State.ready = true;
      connEl.classList.add('ready');
      connEl.querySelector('.label').textContent = 'App conectado';
      info.textContent = 'Pronto. Aperte ⏺ Gravar pra começar.';
      info.className = '';
      refreshButtons();
    }
    return;
  }

  if (d.type === 'corvino:midiInput') {
    if (State.mode !== 'recording') return;
    const t = (performance.now() - State.recStart) / 1000;
    State.events.push({
      t,
      type: d.evt === 'noteOn' ? 'on' : 'off',
      midi: d.midi,
      isBass: !!d.isBass,
      velocity: d.velocity || 100,
    });
    requestRender();
  }
});

// ---------- Audio (metrônomo + count-in) ----------
function ensureAudio() {
  if (!State.audioCtx) {
    State.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (!State.metroGain) {
    // GainNode mestre do metrônomo — permite "matar" todos os clicks
    // pendentes de uma vez quando aperta Stop.
    State.metroGain = State.audioCtx.createGain();
    State.metroGain.gain.value = 1;
    State.metroGain.connect(State.audioCtx.destination);
  }
  if (State.audioCtx.state === 'suspended') State.audioCtx.resume();
  return State.audioCtx;
}

function click(when, accent = false) {
  const ac = ensureAudio();
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.frequency.value = accent ? 1600 : 1000;
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(0.6, when + 0.005);
  g.gain.exponentialRampToValueAtTime(0.001, when + 0.05);
  o.connect(g); g.connect(State.metroGain);
  o.start(when); o.stop(when + 0.06);
}

// Mata clicks de metrônomo já agendados no AudioContext (chamado no Stop).
// Faz fade-out rápido de 30ms e religa o gain pra próxima gravação.
function silenceMetronome() {
  if (!State.audioCtx || !State.metroGain) return;
  const now = State.audioCtx.currentTime;
  State.metroGain.gain.cancelScheduledValues(now);
  State.metroGain.gain.setValueAtTime(State.metroGain.gain.value, now);
  State.metroGain.gain.linearRampToValueAtTime(0, now + 0.03);
  State.metroGain.gain.setValueAtTime(1, now + 0.05);
}

// ---------- Helpers de tempo ----------
function bpm() { return parseInt(inpBpm.value, 10) || 120; }
function quantizeFraction() { return parseFloat(inpQuant.value) || 0; }

// Pareia eventos noteOn/noteOff → notas com duração.
// `endT` = instante em que a gravação terminou (em segundos relativos a recStart);
// usado pra fechar notas que o usuário ainda estava segurando ao apertar Parar.
function pairEventsIntoNotes(events, endT) {
  const notes = [];
  const open = new Map(); // key: midi+'-'+isBass → {t, velocity}
  for (const e of events) {
    const key = `${e.midi}-${e.isBass}`;
    if (e.type === 'on') {
      open.set(key, { t: e.t, velocity: e.velocity });
    } else {
      const o = open.get(key);
      if (o) {
        notes.push({
          t: o.t,
          dur: Math.max(0.05, e.t - o.t),
          midi: e.midi,
          isBass: e.isBass,
          velocity: o.velocity,
          row: e.isBass ? bassRowOf(e.midi) : -1,
        });
        open.delete(key);
      }
    }
  }
  // Notas que ficaram abertas (sem noteOff) — fecha no instante do Stop
  const fallbackEnd = (typeof endT === 'number') ? endT
    : (events.length ? events[events.length - 1].t : 0);
  for (const [key, o] of open) {
    const [midiStr, isBassStr] = key.split('-');
    notes.push({
      t: o.t,
      dur: Math.max(0.1, fallbackEnd - o.t),
      midi: parseInt(midiStr, 10),
      isBass: isBassStr === 'true',
      velocity: o.velocity,
      row: isBassStr === 'true' ? bassRowOf(parseInt(midiStr, 10)) : -1,
    });
  }
  notes.sort((a, b) => a.t - b.t);
  return notes;
}

// Quantiza tempos no grid `frac` de quarter notes (0 = off)
function quantizeNotes(notes, frac, bpmVal) {
  if (!frac) return notes;
  const beat = 60 / bpmVal;          // segundos por quarter
  const grid = beat * frac;          // tamanho do grid em segundos
  return notes.map(n => {
    const tq = Math.round(n.t / grid) * grid;
    const durQ = Math.max(grid, Math.round(n.dur / grid) * grid);
    return { ...n, t: tq, dur: durQ };
  });
}

// ---------- Piano roll ----------
const PX_PER_SEC = 80;
const ROW_H = 18;
// Ranges:
//  MD: MIDI 36..96 (61 notas) — laranja
//  ME: linhas separadas por tipo (fundamental, contra, M, m, 7) — 5 linhas
function rollHeightForMd() { return 60 * ROW_H * 0.4; } // ~24*ROW_H
const MD_TOP = 8;
const MD_BOTTOM = 200;
const ME_TOP = 210;
const ME_LANES = { 3: ME_TOP, 4: ME_TOP + 18, 2: ME_TOP + 36, 1: ME_TOP + 54, 0: ME_TOP + 72 };
const ME_LANE_NAMES = { 3: 'Baixo', 4: 'Contra', 2: 'Maior', 1: 'menor', 0: '7ª' };

let renderQueued = false;
function requestRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; drawRoll(); });
}

// Cache do "fim" da última nota — atualizado em pairEventsIntoNotes/load,
// pra drawRoll() não percorrer State.notes a cada frame.
let notesMaxEnd = 0;
function recomputeMaxEnd() {
  let m = 0;
  for (const n of State.notes) { const e = n.t + n.dur; if (e > m) m = e; }
  notesMaxEnd = m;
}

// Canvas cresce em saltos de CANVAS_GROW_SEC pra evitar realocar buffer
// da GPU a 60fps (causa de travadas durante gravação longa).
const CANVAS_GROW_SEC = 30;
function ensureCanvasWidthFor(seconds) {
  const needed = Math.ceil(seconds * PX_PER_SEC) + 80;
  if (canvas.width >= needed) return;
  const chunks = Math.ceil(seconds / CANVAS_GROW_SEC);
  const targetWidth = Math.ceil(chunks * CANVAS_GROW_SEC * PX_PER_SEC) + 80;
  canvas.width = targetWidth;
}

function drawRoll() {
  let totalSec = Math.max(12, notesMaxEnd + 1);
  if (State.mode === 'recording') {
    totalSec = Math.max(totalSec, (performance.now() - State.recStart) / 1000 + 1);
  }
  ensureCanvasWidthFor(totalSec);
  const W = canvas.width, H = canvas.height;

  ctx.clearRect(0, 0, W, H);

  // Background
  ctx.fillStyle = '#0e0a0c'; ctx.fillRect(0, 0, W, H);

  // Grid de batidas
  const beatPx = (60 / bpm()) * PX_PER_SEC;
  const beatsPerBar = 4;
  ctx.strokeStyle = '#1c1417'; ctx.lineWidth = 1;
  for (let x = 40; x < W; x += beatPx) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  ctx.strokeStyle = '#2a1d22';
  for (let i = 0, x = 40; x < W; i++, x += beatPx * beatsPerBar) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }

  // Divisor MD/ME
  ctx.strokeStyle = '#3a2f33'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, ME_TOP - 5); ctx.lineTo(W, ME_TOP - 5); ctx.stroke();

  // Labels das lanes ME
  ctx.fillStyle = '#9a8e85'; ctx.font = '10px system-ui, sans-serif'; ctx.textBaseline = 'middle';
  for (const [row, y] of Object.entries(ME_LANES)) {
    ctx.fillText(ME_LANE_NAMES[row], 4, y + 8);
  }
  ctx.fillText('MD', 4, MD_TOP + 8);

  // Linha do tempo (segundos)
  ctx.fillStyle = '#5a4d44';
  for (let s = 0; s * PX_PER_SEC < W - 40; s++) {
    const x = 40 + s * PX_PER_SEC;
    ctx.fillText(s + 's', x + 2, H - 8);
  }

  // Notas
  for (const n of State.notes) drawNote(n);

  // Cursor (gravando ou tocando)
  let cursorT = -1;
  if (State.mode === 'recording') cursorT = (performance.now() - State.recStart) / 1000;
  if (State.mode === 'playing')   cursorT = (performance.now() - State.playStart) / 1000;
  if (cursorT >= 0) {
    const x = 40 + cursorT * PX_PER_SEC;
    ctx.strokeStyle = State.mode === 'recording' ? '#e0524d' : '#5fc97a';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }

  // Auto-rerender enquanto grava/toca pra cursor andar
  if (State.mode === 'recording' || State.mode === 'playing') requestRender();
}

function colorOfNote(n) {
  if (!n.isBass) return '#ff8a3d';
  switch (n.row) {
    case 3: return '#d4a04a'; // baixo fundamental
    case 4: return '#f0c878'; // contra
    case 2: return '#e85a6a'; // M
    case 1: return '#b06ad8'; // m
    case 0: return '#5aa8e8'; // 7
    default: return '#888';
  }
}

function drawNote(n) {
  const x = 40 + n.t * PX_PER_SEC;
  const w = Math.max(3, n.dur * PX_PER_SEC - 2);
  let y, h;

  if (!n.isBass) {
    // MD: pitch vai de 36 a 96 mapeado em MD_TOP..MD_BOTTOM (mais agudo em cima)
    const pitch = Math.max(36, Math.min(96, n.midi));
    const pct = (96 - pitch) / 60;
    y = MD_TOP + pct * (MD_BOTTOM - MD_TOP);
    h = 8;
  } else {
    y = ME_LANES[n.row] ?? (ME_TOP + 90);
    h = 14;
  }

  ctx.fillStyle = colorOfNote(n);
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

// ---------- Transport: gravação ----------
async function startRecording() {
  if (!State.ready) { info.textContent = 'Aguardando o app conectar…'; info.className = 'warn'; return; }

  ensureAudio(); // garante que o AudioContext tá ativo

  // Reset COMPLETO entre gravações (evita acumulação que engasga a 2ª)
  State.events = [];
  State.notes = [];
  notesMaxEnd = 0;
  canvas.width = 2000; // volta canvas pra tamanho inicial
  // Limpa qualquer timer pendente da gravação anterior
  State.countinTimers.forEach(clearTimeout);
  State.countinTimers = [];
  if (State.metroLoopTimer) { clearTimeout(State.metroLoopTimer); State.metroLoopTimer = null; }
  silenceMetronome();
  setMode('countin');
  btnRec.classList.add('recording');
  timerEl.classList.add('recording');

  // Count-in
  const beat = 60 / bpm();
  let startDelay = 0;
  if (inpCountIn.checked) {
    const ac = ensureAudio();
    const t0 = ac.currentTime + 0.05;
    for (let i = 0; i < 4; i++) click(t0 + i * beat, i === 0);
    startDelay = beat * 4 * 1000;
    info.textContent = 'Conta-regressiva: 4 tempos…';
  }

  State.countinTimers.push(setTimeout(() => {
    State.recStart = performance.now();
    setMode('recording');
    info.textContent = '🔴 Gravando — toque à vontade. Aperte ⏹ Parar quando terminar.';
    info.className = '';

    if (inpMetro.checked) {
      State.metroBeatIdx = 0;
      State.metroStartTime = ensureAudio().currentTime;
      scheduleMetronomeChunk();
    }
    tickTimer();
    requestRender();
  }, startDelay));
}

// Agenda os próximos ~10s de metrônomo e re-agenda quando faltarem 2s.
// Evita criar 600+ oscillators de uma vez (causa de travadas).
function scheduleMetronomeChunk() {
  if (State.mode !== 'recording' || !inpMetro.checked) return;
  const ac = ensureAudio();
  const beat = 60 / bpm();
  const horizon = 10; // segundos pra frente
  const beatsAhead = Math.ceil(horizon / beat);
  for (let k = 0; k < beatsAhead; k++) {
    const i = State.metroBeatIdx + k;
    click(State.metroStartTime + i * beat, i % 4 === 0);
  }
  State.metroBeatIdx += beatsAhead;
  State.metroLoopTimer = setTimeout(scheduleMetronomeChunk, (horizon - 2) * 1000);
}

function stopRecording() {
  if (State.mode === 'countin') {
    // Cancela count-in
    State.countinTimers.forEach(clearTimeout);
    State.countinTimers = [];
  }

  // Marca o instante exato do Stop ANTES de mudar modo, pra fechar
  // qualquer nota que ainda esteja sendo segurada com a duração correta.
  const stopT = State.mode === 'recording'
    ? (performance.now() - State.recStart) / 1000
    : 0;

  // Cancela qualquer click do metrônomo agendado pra frente —
  // tanto o setTimeout do próximo chunk quanto os Oscillators já
  // agendados no AudioContext (via fade-out do GainNode mestre).
  if (State.metroLoopTimer) { clearTimeout(State.metroLoopTimer); State.metroLoopTimer = null; }
  silenceMetronome();

  setMode('idle');
  btnRec.classList.remove('recording');
  timerEl.classList.remove('recording');
  postToApp({ type: 'corvino:allOff' });

  // Pareia eventos em notas
  let notes = pairEventsIntoNotes(State.events, stopT);
  const q = quantizeFraction();
  if (q > 0) notes = quantizeNotes(notes, q, bpm());
  State.notes = notes;
  recomputeMaxEnd();

  if (notes.length === 0) {
    info.textContent = 'Nada foi gravado. Toque alguma nota e tente de novo.';
    info.className = 'warn';
  } else {
    info.textContent = `${notes.length} nota(s) gravada(s)${q > 0 ? ` (quantizado ${inpQuant.options[inpQuant.selectedIndex].text})` : ''}.`;
    info.className = '';
  }
  refreshButtons();
  requestRender();
}

// ---------- Playback ----------
function startPlayback() {
  if (State.notes.length === 0) return;
  setMode('playing');
  btnPlay.classList.add('playing');
  State.playStart = performance.now();
  State.playTimers = [];

  for (const n of State.notes) {
    State.playTimers.push(setTimeout(() => {
      postToApp({ type: 'corvino:noteOn', midi: n.midi, isBass: n.isBass, velocity: n.velocity });
    }, n.t * 1000));

    State.playTimers.push(setTimeout(() => {
      postToApp({ type: 'corvino:noteOff', midi: n.midi, isBass: n.isBass });
    }, (n.t + n.dur) * 1000));
  }

  const totalDur = Math.max(...State.notes.map(n => n.t + n.dur));
  State.playTimers.push(setTimeout(() => {
    if (State.loop) {
      stopPlayback(/*silent*/ true);
      startPlayback();
    } else {
      stopPlayback();
    }
  }, totalDur * 1000 + 100));

  info.textContent = '▶ Tocando…' + (State.loop ? ' (loop ligado)' : '');
  info.className = '';
  requestRender();
}

function stopPlayback(silent = false) {
  State.playTimers.forEach(clearTimeout);
  State.playTimers = [];
  postToApp({ type: 'corvino:allOff' });
  setMode('idle');
  btnPlay.classList.remove('playing');
  if (!silent) info.textContent = 'Parado.';
  requestRender();
}

// ---------- UI ----------
function setMode(m) { State.mode = m; refreshButtons(); }

function refreshButtons() {
  const idle = State.mode === 'idle';
  const rec = State.mode === 'recording' || State.mode === 'countin';
  const playing = State.mode === 'playing';
  const hasNotes = State.notes.length > 0;

  btnRec.disabled = !State.ready || rec || playing;
  btnStop.disabled = !rec && !playing;
  btnPlay.disabled = !idle || !hasNotes;
  btnClear.disabled = !idle || !hasNotes;
  btnSave.disabled = !idle || !hasNotes;
  btnExportMidi.disabled = !idle || !hasNotes;
}

function tickTimer() {
  if (State.mode !== 'recording') { timerEl.textContent = '0:00'; return; }
  const s = Math.floor((performance.now() - State.recStart) / 1000);
  const mm = Math.floor(s / 60), ss = s % 60;
  timerEl.textContent = `${mm}:${ss.toString().padStart(2, '0')}`;
  requestAnimationFrame(tickTimer);
}

// ---------- Save / Load / Export ----------
function saveJson() {
  const payload = {
    format: 'corvinorec/v1',
    bpm: bpm(),
    quantize: quantizeFraction(),
    notes: State.notes.map(n => ({
      t: +n.t.toFixed(4),
      dur: +n.dur.toFixed(4),
      midi: n.midi,
      isBass: n.isBass,
      velocity: n.velocity,
      row: n.row,
    })),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  download(blob, `corvino-${Date.now()}.corvinorec.json`);
}

function loadJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const obj = JSON.parse(reader.result);
      if (!obj.notes || !Array.isArray(obj.notes)) throw new Error('Formato inválido');
      State.notes = obj.notes.map(n => ({
        ...n,
        row: typeof n.row === 'number' ? n.row : (n.isBass ? bassRowOf(n.midi) : -1),
      }));
      if (typeof obj.bpm === 'number') inpBpm.value = obj.bpm;
      info.textContent = `Carregado ${State.notes.length} nota(s).`;
      info.className = '';
      recomputeMaxEnd();
      refreshButtons();
      requestRender();
    } catch (err) {
      info.textContent = 'Erro ao carregar: ' + err.message;
      info.className = 'error';
    }
  };
  reader.readAsText(file);
}

function exportMidi() {
  const data = buildMidiFile(State.notes, { bpm: bpm() });
  const blob = new Blob([data], { type: 'audio/midi' });
  download(blob, `corvino-${Date.now()}.mid`);
  info.textContent = '🎼 .mid exportado. Abra no MuseScore.';
  info.className = '';
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- Wire-up ----------
btnRec.addEventListener('click', startRecording);
btnStop.addEventListener('click', () => {
  if (State.mode === 'recording' || State.mode === 'countin') stopRecording();
  else if (State.mode === 'playing') stopPlayback();
});
btnPlay.addEventListener('click', startPlayback);
btnLoop.addEventListener('click', () => {
  State.loop = !State.loop;
  btnLoop.classList.toggle('on', State.loop);
});
btnClear.addEventListener('click', () => {
  State.notes = []; State.events = [];
  notesMaxEnd = 0;
  info.textContent = 'Gravação apagada.';
  info.className = '';
  refreshButtons();
  requestRender();
});
btnSave.addEventListener('click', saveJson);
btnExportMidi.addEventListener('click', exportMidi);
fileLoad.addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (f) loadJson(f);
  e.target.value = '';
});

// Atalhos
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.key === 'r' || e.key === 'R') { e.preventDefault(); if (!btnRec.disabled) startRecording(); }
  else if (e.key === ' ') { e.preventDefault(); btnStop.click(); }
  else if (e.key === 'p' || e.key === 'P') { e.preventDefault(); if (!btnPlay.disabled) startPlayback(); }
  else if (e.key === 'l' || e.key === 'L') { e.preventDefault(); btnLoop.click(); }
});

// Init
iframe.addEventListener('load', () => {
  startPinging();
});
refreshButtons();
requestRender();
