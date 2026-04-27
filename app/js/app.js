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

  // Wait for SF2 loading to complete if not done yet
  await audioInitPromise;

  // Render UI
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

  // Embed API — permite que as aulas controlem o som via postMessage
  embedApi.init();

  // MIDI
  const midiOk = await midi.init();
  if (!midiOk) {
    console.log('MIDI not available - touch-only mode');
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
