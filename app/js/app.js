// Main application bootstrap
import * as audio from './audio-engine.js';
import * as midi from './midi-manager.js';
import * as bassButtons from './bass-buttons.js';
import * as pianoKeyboard from './piano-keyboard.js';
import * as settingsDialog from './settings-dialog.js';
import * as groovePlayer from './groove-player.js';
import * as lessonPlayer from './lesson-player.js';
import * as uiControls from './ui-controls.js';
import * as keyboardInput from './keyboard-input.js';
import * as embedApi from './embed-api.js';
import * as pcKeyboard from './pc-keyboard.js';
import * as appMode from './app-mode.js';

// ===== SPLASH SCREEN =====
function showSplash() {
  return new Promise((resolve) => {
    const splash = document.getElementById('splash');
    const splashText = document.getElementById('splash-text');

    // Show loading status on splash
    audio.onLoading((msg) => {
      if (splashText && msg) {
        splashText.textContent = msg;
      }
    });

    // Wait at least 2s, then check every 500ms if audio is ready
    const minTime = 2000;
    const start = Date.now();

    function checkReady() {
      const elapsed = Date.now() - start;
      if (elapsed >= minTime && audio.isReady()) {
        if (splashText) splashText.textContent = 'ACORDEÃO DIGITAL';
        splash.classList.add('fade-out');
        setTimeout(() => {
          splash.style.display = 'none';
          resolve();
        }, 800);
      } else if (elapsed > 15000) {
        // Timeout after 15s, proceed anyway
        splash.classList.add('fade-out');
        setTimeout(() => {
          splash.style.display = 'none';
          resolve();
        }, 800);
      } else {
        setTimeout(checkReady, 500);
      }
    }

    checkReady();
  });
}

// ===== AUDIO INIT ON FIRST TOUCH =====
let audioInitStarted = false;

function setupAudioInit() {
  // Show loading indicator for SF2 downloads (label foi removido — só log no console)
  audio.onLoading((msg) => {
    const label = document.getElementById('timbre-label');
    if (label) {
      if (msg) { label.textContent = msg; label.style.opacity = '0.6'; }
      else {
        const timbre = audio.TIMBRES.find(t => t.id === audio.getTimbre());
        label.textContent = timbre ? timbre.name : 'Basson';
        label.style.opacity = '1';
      }
    }
  });

  const handler = async () => {
    if (audioInitStarted) return;
    audioInitStarted = true;
    document.removeEventListener('pointerdown', handler);
    document.removeEventListener('touchstart', handler);
    try {
      await audio.init();
      audio.resume();
    } catch (err) {
      console.error('Audio init failed:', err);
      audioInitStarted = false;
    }
  };
  document.addEventListener('pointerdown', handler);
  document.addEventListener('touchstart', handler);
}

// ===== PANEL TOGGLE SYSTEM =====
const panels = ['timbre-panel', 'groove-panel', 'lesson-panel'];
let activePanel = null;

function togglePanel(panelId, btnId) {
  const panel = document.getElementById(panelId);
  const btn = document.getElementById(btnId);

  if (activePanel === panelId) {
    closeAllPanels();
    return;
  }

  closeAllPanels();
  panel.classList.remove('hidden');
  btn.classList.add('active');
  activePanel = panelId;
}

function closeAllPanels() {
  panels.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
  ['btn-timbre', 'btn-groove', 'btn-lesson'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });
  activePanel = null;
}

// Close panels on outside click
document.addEventListener('pointerdown', (e) => {
  if (!activePanel) return;
  const panel = document.getElementById(activePanel);
  const isInPanel = panel.contains(e.target);
  const isToolBtn = e.target.closest('.tool-btn');
  if (!isInPanel && !isToolBtn) closeAllPanels();
});

// Close buttons
document.querySelectorAll('.panel-close').forEach(btn => {
  btn.addEventListener('click', closeAllPanels);
});

// ===== TIMBRE PANEL (substituído pelas register-tabs em ui-controls.js) =====
function initTimbrePanel() {
  if (!document.getElementById('btn-timbre')) return; // botão removido — tabs assumem o controle
}

// ===== GROOVE PANEL (botão removido — Ritmo agora vem de ui-controls.js) =====
function initGroovePanel() {
  if (!document.getElementById('btn-groove')) return;
}

// ===== LESSON PANEL (botão removido) =====
function initLessonPanel() {
  if (!document.getElementById('btn-lesson')) return;
}

// ===== RESIZE HANDLER =====
let resizeTimer = null;
function setupResizeHandler() {
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      pianoKeyboard.render(document.getElementById('piano-container'));
      keyboardInput.attachHints();
    }, 250);
  });
}

// ===== LANDSCAPE LOCK =====
async function lockLandscape() {
  try {
    if (screen.orientation && screen.orientation.lock) {
      await screen.orientation.lock('landscape');
    }
  } catch (e) { /* not supported */ }
}

// ===== MAIN =====
async function main() {
  lockLandscape();

  // Start loading SF2 files during splash (don't await - loads in background)
  const audioInitPromise = audio.init().catch(err => {
    console.warn('Audio pre-init during splash failed, will retry on touch:', err);
  });

  await showSplash();
  document.getElementById('app').classList.remove('hidden');

  // Setup resume-on-touch (AudioContext needs user gesture)
  setupAudioInit();

  // NÃO await audioInitPromise aqui — bloqueia toda a UI e o midi.init()
  // até o SF2 (~59MB) terminar de baixar. No PC/rede lenta ficava travado
  // 20-30s com tela vazia, e o aluno via "acordeon não reconhecido" porque
  // midi.init() só rodava depois. Deixamos audio carregar em background —
  // audio.noteOn ignora silenciosamente se synth ainda não pronto.
  audioInitPromise.then(() => console.log('[app] SF2 loading complete'));

  // Render UI IMEDIATAMENTE (não depende de audio)
  bassButtons.render(document.getElementById('bass-grid'));
  pianoKeyboard.render(document.getElementById('piano-container'));

  // Init feature panels
  initTimbrePanel();
  initGroovePanel();
  initLessonPanel();
  settingsDialog.init();

  // Init HUD controls (volume/transpose/zoom/metronome/labels/registers)
  uiControls.init();

  // Teclado do computador — opcional, pro aluno experimentar sem Corvino físico
  keyboardInput.init();
  keyboardInput.attachHints();

  // PC keyboard view (renderiza SVG do teclado QWERTY virtual) +
  // toggle Acordeon/PC. Modo persiste em localStorage.
  // audio + state injetados pra o click/touch nas teclas virtuais tocarem
  // som (mesma cadeia de keyboard-input.js, sem import circular).
  const { state } = await import('./state.js');
  pcKeyboard.init({ audio, state });
  appMode.init();

  // Limpa eventuais customizações antigas do kbd-editor (substituído
  // definitivamente pelo toggle Mesa/Peito).
  try { localStorage.removeItem('corvino:kbdMap'); } catch (e) {}

  // Toggle Mesa/Peito: troca BOTH bass+MD layout no teclado virtual E o
  // KEY_MAP do keyboard-input (físico). Visível em todos os modos.
  const mesaBtn  = document.getElementById('bass-layout-mesa');
  const peitoBtn = document.getElementById('bass-layout-peito');
  function applyLayoutBtnState() {
    const cur = pcKeyboard.getBassLayout();
    mesaBtn?.classList.toggle('on',  cur === 'mesa');
    peitoBtn?.classList.toggle('on', cur === 'peito');
  }
  function switchLayout(layout) {
    pcKeyboard.setBassLayout(layout);
    keyboardInput.setLayout(layout);
    applyLayoutBtnState();
    keyboardInput.attachHints();
  }
  mesaBtn?.addEventListener('click',  () => switchLayout('mesa'));
  peitoBtn?.addEventListener('click', () => switchLayout('peito'));
  applyLayoutBtnState();

  // Embed API — permite que as aulas controlem o som via postMessage
  embedApi.init();

  // MIDI
  const midiOk = await midi.init();
  if (!midiOk) {
    console.log('MIDI not available - touch-only mode');
  }

  // Botão Bluetooth: pareia teclado BLE-MIDI (M-VAVE SMK-25, Worlde, etc).
  // Só faz sentido em navegadores com Web Bluetooth (Chrome/Edge). Em Safari,
  // Firefox e iOS o botão fica escondido — nesses casos, o aluno pareia pelo
  // Bluetooth do SO e o teclado aparece como device MIDI normal via Web MIDI.
  const btBtn = document.getElementById('bt-toggle');
  if (btBtn) {
    if (midi.isBluetoothMIDISupported()) {
      btBtn.addEventListener('click', async () => {
        btBtn.classList.add('pairing');
        try {
          const dev = await midi.connectBluetoothMIDI();
          btBtn.classList.add('on');
          btBtn.title = 'Conectado: ' + dev.name;
        } catch (err) {
          console.log('[BLE-MIDI] pareamento cancelado ou falhou:', err.message);
        } finally {
          btBtn.classList.remove('pairing');
        }
      });
    } else {
      btBtn.style.display = 'none';
    }
  }

  setupResizeHandler();

  // Double-click fullscreen
  document.addEventListener('dblclick', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
  });
}

main().catch(console.error);
