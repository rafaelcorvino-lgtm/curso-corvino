// UI controls: HUD (volume/transpose/metronome), zoom A+/A-/C, label toggle, register tabs
// Inspired by app corvino celular: home_screen.dart + ui_store.dart

import * as audio from './audio-engine.js';
import { TIMBRES } from './audio-engine.js';
import * as groovePlayer from './groove-player.js';
import { state } from './state.js';
import * as bassButtons from './bass-buttons.js';
import * as pianoKeyboard from './piano-keyboard.js';

// ============ ZOOM (UI scale) ============
const ZOOM = {
  default: 1.0,
  min: 0.7,
  max: 1.5,
  step: 0.1,
  current: 1.0,
};

const STORAGE_KEY = 'corvino:uiScale';

function loadZoom() {
  try {
    const v = parseFloat(localStorage.getItem(STORAGE_KEY));
    if (!isNaN(v)) ZOOM.current = clamp(v, ZOOM.min, ZOOM.max);
  } catch (e) { /* ignore */ }
}

function saveZoom() {
  try { localStorage.setItem(STORAGE_KEY, ZOOM.current.toFixed(2)); } catch (e) {}
}

function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }

function applyZoom() {
  // Aplica o zoom apenas nos controles HUD/zoom+kbd/registers, não no teclado nem nos baixos.
  // .bottom-right-controls agora envolve kbd-toggle + zoom-controls — escalam juntos.
  const els = document.querySelectorAll('.hud, .bottom-right-controls, #registers-bar');
  els.forEach(el => {
    el.style.transform = `scale(${ZOOM.current})`;
    el.style.transformOrigin = el.classList.contains('hud-tr') || el.classList.contains('hud-br') ? 'top right'
                              : el.classList.contains('hud-bl') ? 'bottom left'
                              : el.classList.contains('bottom-right-controls') ? 'bottom right'
                              : 'top left';
  });
  showFeedback(`${Math.round(ZOOM.current * 100)}%`);
  saveZoom();
}

let feedbackTimer = null;
function showFeedback(text) {
  const el = document.getElementById('scale-feedback');
  if (!el) return;
  el.textContent = text;
  el.classList.add('visible');
  if (feedbackTimer) clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(() => el.classList.remove('visible'), 1000);
}

function setupZoom() {
  loadZoom();
  if (ZOOM.current !== ZOOM.default) applyZoom();
  document.getElementById('zoom-up')?.addEventListener('click', () => {
    ZOOM.current = clamp(ZOOM.current + ZOOM.step, ZOOM.min, ZOOM.max);
    applyZoom();
  });
  document.getElementById('zoom-down')?.addEventListener('click', () => {
    ZOOM.current = clamp(ZOOM.current - ZOOM.step, ZOOM.min, ZOOM.max);
    applyZoom();
  });
  document.getElementById('zoom-reset')?.addEventListener('click', () => {
    ZOOM.current = ZOOM.default;
    applyZoom();
  });
}

// ============ VOLUME (HUD) ============
const volumeState = {
  keyboard: 100,  // 0-127
  bass: 100,
};

function setVolume(isBass, value) {
  const v = clamp(value, 0, 125);
  if (isBass) volumeState.bass = v;
  else volumeState.keyboard = v;
  audio.setVolume(isBass, v);
  const el = document.getElementById(isBass ? 'bs-vol-val' : 'kb-vol-val');
  if (el) el.textContent = v;
}

function setupVolume() {
  document.getElementById('kb-vol-down')?.addEventListener('click', () => setVolume(false, volumeState.keyboard - 5));
  document.getElementById('kb-vol-up')?.addEventListener('click', () => setVolume(false, volumeState.keyboard + 5));
  document.getElementById('bs-vol-down')?.addEventListener('click', () => setVolume(true, volumeState.bass - 5));
  document.getElementById('bs-vol-up')?.addEventListener('click', () => setVolume(true, volumeState.bass + 5));
  // initial values
  setVolume(false, 100);
  setVolume(true, 100);
}

// ============ TRANSPOSE (HUD) ============
function setTranspose(isBass, value) {
  const v = clamp(value, -12, 12);
  audio.setTranspose(isBass, v);
  const el = document.getElementById(isBass ? 'bs-tr-val' : 'kb-tr-val');
  if (el) el.textContent = (v > 0 ? '+' : '') + v;
  // Atualiza labels para refletir a nova tonalidade (igual app Flutter)
  if (isBass) bassButtons.refreshLabels();
  else pianoKeyboard.refreshLabels();
}

function setupTranspose() {
  document.getElementById('kb-tr-down')?.addEventListener('click', () => setTranspose(false, audio.getTranspose(false) - 1));
  document.getElementById('kb-tr-up')?.addEventListener('click', () => setTranspose(false, audio.getTranspose(false) + 1));
  document.getElementById('bs-tr-down')?.addEventListener('click', () => setTranspose(true, audio.getTranspose(true) - 1));
  document.getElementById('bs-tr-up')?.addEventListener('click', () => setTranspose(true, audio.getTranspose(true) + 1));
  setTranspose(false, 0);
  setTranspose(true, 0);
}

// ============ METRONOME (BPM) ============
const metro = {
  bpm: 120,
  playing: false,
  intervalId: null,
  ctx: null,
};

function metronomeTick() {
  // tick simples via WebAudio
  if (!metro.ctx) metro.ctx = audio.getContext() || new AudioContext();
  if (!metro.ctx) return;
  const t = metro.ctx.currentTime;
  const osc = metro.ctx.createOscillator();
  const gain = metro.ctx.createGain();
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.3, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  osc.connect(gain).connect(metro.ctx.destination);
  osc.start(t);
  osc.stop(t + 0.06);
}

function startMetronome() {
  if (metro.playing) return;
  metro.playing = true;
  audio.resume();
  metronomeTick();
  metro.intervalId = setInterval(metronomeTick, 60000 / metro.bpm);
  document.getElementById('metro-toggle').textContent = '■';
}

function stopMetronome() {
  if (!metro.playing) return;
  metro.playing = false;
  if (metro.intervalId) clearInterval(metro.intervalId);
  metro.intervalId = null;
  document.getElementById('metro-toggle').textContent = '▶';
}

function setBpm(bpm) {
  metro.bpm = clamp(bpm, 30, 240);
  document.getElementById('metro-bpm').textContent = metro.bpm;
  if (metro.playing) {
    clearInterval(metro.intervalId);
    metro.intervalId = setInterval(metronomeTick, 60000 / metro.bpm);
  }
}

function setupMetronome() {
  document.getElementById('metro-down')?.addEventListener('click', () => setBpm(metro.bpm - 5));
  document.getElementById('metro-up')?.addEventListener('click', () => setBpm(metro.bpm + 5));
  document.getElementById('metro-toggle')?.addEventListener('click', () => {
    metro.playing ? stopMetronome() : startMetronome();
  });
}

// ============ LABELS TOGGLE ============
function setupLabelToggle() {
  const btn = document.getElementById('label-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const html = document.documentElement;
    const has = html.classList.toggle('show-labels');
    btn.classList.toggle('on', has);
  });
}

// ============ UI TOGGLE (esconder/mostrar HUDs flutuantes) ============
// Mantém só os registros fixos da registers-bar (timbres + 3 toggles).
// Útil pra o aluno focar no instrumento sem distração dos comandos.
function setupUiToggle() {
  const btn = document.getElementById('ui-toggle');
  if (!btn) return;
  const app = document.getElementById('app');
  if (!app) return;
  btn.addEventListener('click', () => {
    const hidden = app.classList.toggle('hide-ui-controls');
    // botão fica "on" quando os HUDs estão VISÍVEIS (estado normal)
    // — fica "off" (apagado) quando estão escondidos
    btn.classList.toggle('on', !hidden);
  });
  // Estado inicial: HUDs visíveis = botão on
  btn.classList.add('on');
}

// ============ REGISTER TABS (timbre selector) ============
async function setupRegisterTabs() {
  const container = document.getElementById('register-tabs');
  if (!container) return;
  container.innerHTML = '';
  const currentId = audio.getTimbre();
  TIMBRES.forEach(t => {
    const tab = document.createElement('div');
    tab.className = 'register-tab' + (t.id === currentId ? ' selected' : '');
    tab.dataset.timbre = t.id;
    // Nome curto (apenas as 6 primeiras letras pra caber)
    const nameSpan = document.createElement('div');
    nameSpan.textContent = t.name.toUpperCase().substring(0, 8);
    tab.appendChild(nameSpan);
    // 3 dots simulando "registers" (placeholder visual)
    const dots = document.createElement('div');
    dots.className = 'register-dots';
    for (let i = 0; i < 3; i++) {
      const d = document.createElement('span');
      d.className = 'register-dot' + (i === 1 ? ' on' : '');
      dots.appendChild(d);
    }
    tab.appendChild(dots);
    tab.addEventListener('click', async () => {
      // Já tá no timbre selecionado — não faz nada
      if (tab.classList.contains('selected')) return;
      // Já está trocando outro timbre — ignora pra evitar race condition
      if (audio.isChangingTimbre()) {
        console.warn('[Corvino] Aguarde o timbre anterior terminar de carregar.');
        return;
      }

      // Salva o tab que estava selecionado antes (pra reverter em caso de erro)
      const previousTab = container.querySelector('.register-tab.selected');

      // Atualiza UI: marca o novo como selected + loading; desabilita os outros
      container.querySelectorAll('.register-tab').forEach(el => {
        el.classList.remove('selected');
        el.classList.add('disabled');
      });
      tab.classList.remove('disabled');
      tab.classList.add('selected', 'loading');

      try {
        await audio.setTimbre(t.id);
        // Sucesso: atualiza label da toolbar antiga (se existir)
        const tl = document.getElementById('timbre-label');
        if (tl) tl.textContent = t.name;
      } catch (e) {
        console.error('[Corvino] Falha ao trocar timbre:', e);
        // Reverte UI: tira selected do novo, devolve pro anterior
        tab.classList.remove('selected');
        if (previousTab) previousTab.classList.add('selected');
      } finally {
        // Reabilita todos os tabs e tira loading
        container.querySelectorAll('.register-tab').forEach(el => {
          el.classList.remove('disabled', 'loading');
        });
      }
    });
    container.appendChild(tab);
  });
}

// ============ CONNECTION INDICATORS ============
export function setKeyboardConnected(on) {
  const el = document.getElementById('conn-keyboard');
  if (el) el.classList.toggle('connected', !!on);
}
export function setBassConnected(on) {
  const el = document.getElementById('conn-bass');
  if (el) el.classList.toggle('connected', !!on);
}

// Reage automaticamente quando o midi-manager detecta/perde Corvino
function setupConnectionWatch() {
  state.on('keyboardConnected', (v) => setKeyboardConnected(v));
  state.on('bassConnected', (v) => setBassConnected(v));
  setKeyboardConnected(state.isKeyboardConnected());
  setBassConnected(state.isBassConnected());
}

// ============ RITMO (GROOVE) SELECTOR ============
let rhythmDropdown = null;
let currentRhythmIndex = -1;

function setupRhythm() {
  const sel = document.getElementById('rhythm-selector');
  const nameEl = document.getElementById('rhythm-name');
  if (!sel || !nameEl) return;

  const grooves = groovePlayer.getGrooves();
  // Define um padrão inicial visual ("Guarânia")
  const guarania = grooves.findIndex(g => /guarania|guar.nia/i.test(g.name));
  if (guarania >= 0) {
    currentRhythmIndex = guarania;
    nameEl.textContent = grooves[guarania].name;
  } else if (grooves.length) {
    currentRhythmIndex = 0;
    nameEl.textContent = grooves[0].name;
  }

  // Toggle dropdown ao clicar
  sel.addEventListener('click', (e) => {
    e.stopPropagation();
    if (rhythmDropdown) {
      closeRhythmDropdown();
    } else {
      openRhythmDropdown(sel);
    }
  });

  // Reage ao estado do groove player (Tocando/parado)
  groovePlayer.onStateChange(() => {
    const st = groovePlayer.getState();
    const playing = st.isPlaying;
    sel.classList.toggle('playing', playing);
    if (playing && st.currentGroove) {
      nameEl.textContent = st.currentGroove.name;
    }
    // Atualiza botão play/stop
    const playBtn = document.getElementById('rhythm-play');
    if (playBtn) {
      playBtn.classList.toggle('playing', playing);
      playBtn.textContent = playing ? '■' : '▶';
      playBtn.title = playing ? 'Parar ritmo' : 'Tocar ritmo';
    }
  });

  // Volume do ritmo
  function updateRhythmVolUI() {
    const el = document.getElementById('rhythm-vol-val');
    if (el) el.textContent = groovePlayer.getVolume();
  }
  document.getElementById('rhythm-vol-down')?.addEventListener('click', (e) => {
    e.stopPropagation();
    groovePlayer.setVolume(groovePlayer.getVolume() - 5);
    updateRhythmVolUI();
  });
  document.getElementById('rhythm-vol-up')?.addEventListener('click', (e) => {
    e.stopPropagation();
    groovePlayer.setVolume(groovePlayer.getVolume() + 5);
    updateRhythmVolUI();
  });
  updateRhythmVolUI();

  // Velocidade do ritmo
  function updateRhythmSpeedUI() {
    const el = document.getElementById('rhythm-speed-val');
    if (el) el.textContent = groovePlayer.getSpeed().toFixed(2).replace(/\.?0+$/, '') + '×';
  }
  document.getElementById('rhythm-speed-down')?.addEventListener('click', (e) => {
    e.stopPropagation();
    groovePlayer.setSpeed(groovePlayer.getSpeed() - 0.05);
    updateRhythmSpeedUI();
  });
  document.getElementById('rhythm-speed-up')?.addEventListener('click', (e) => {
    e.stopPropagation();
    groovePlayer.setSpeed(groovePlayer.getSpeed() + 0.05);
    updateRhythmSpeedUI();
  });
  updateRhythmSpeedUI();

  // Botão play/stop direto (sem abrir dropdown)
  const playBtn = document.getElementById('rhythm-play');
  if (playBtn) {
    playBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const st = groovePlayer.getState();
      if (st.isPlaying) {
        groovePlayer.stop();
      } else {
        const grooves = groovePlayer.getGrooves();
        const g = grooves[currentRhythmIndex] || grooves[0];
        if (g) {
          try {
            audio.resume();
            await groovePlayer.play(g.id);
          } catch (err) { console.error('Erro tocando ritmo:', err); }
        }
      }
    });
  }

  document.addEventListener('click', (e) => {
    if (rhythmDropdown && !rhythmDropdown.contains(e.target)) closeRhythmDropdown();
  });
}

function openRhythmDropdown(anchor) {
  closeRhythmDropdown();
  const grooves = groovePlayer.getGrooves();
  const dd = document.createElement('div');
  dd.className = 'rhythm-dropdown';
  const rect = anchor.getBoundingClientRect();
  dd.style.position = 'fixed';
  dd.style.top = `${rect.bottom + 4}px`;
  dd.style.left = `${rect.left}px`;
  dd.style.minWidth = `${rect.width}px`;

  grooves.forEach((g, i) => {
    const it = document.createElement('div');
    it.className = 'rhythm-item' + (i === currentRhythmIndex ? ' selected' : '');
    it.textContent = g.name;
    it.addEventListener('click', async () => {
      currentRhythmIndex = i;
      document.getElementById('rhythm-name').textContent = g.name;
      try {
        audio.resume();
        await groovePlayer.play(g.id);
      } catch (e) { console.error('Erro tocando ritmo:', e); }
      closeRhythmDropdown();
    });
    dd.appendChild(it);
  });

  document.body.appendChild(dd);
  rhythmDropdown = dd;
}

function closeRhythmDropdown() {
  if (rhythmDropdown) {
    rhythmDropdown.remove();
    rhythmDropdown = null;
  }
}

// ============ INIT ============
export function init() {
  setupZoom();
  setupVolume();
  setupTranspose();
  setupMetronome();
  setupLabelToggle();
  setupUiToggle();
  setupRegisterTabs();
  setupRhythm();
  setupConnectionWatch();
}
