// App mode toggle: alterna entre visualização "Acordeon Corvino" e "Teclado PC".
// Aluno que ainda não tem o Corvino físico pode usar o modo PC pra ver
// quais teclas tocar no próprio teclado do computador.
//
// Estado salvo em localStorage. O modo aplica uma classe no <body> que
// controla via CSS qual seção é visível (bass+piano vs pc-keyboard).

import * as keyboardInput from './keyboard-input.js';

const STORAGE_KEY = 'corvino:appMode';
const VALID_MODES = ['acordeon', 'pc'];

let currentMode = 'acordeon';

// Detecta default contextual: alunos do curso light (ainda sem Corvino físico)
// começam em modo PC; do curso completo (que já tem o instrumento) em modo
// acordeon. Sinalização explícita via query param `?mode=pc` na URL do app —
// passada pelo iframe das aulas do curso light. Fallback: detecção pelo path
// do parent (DEV: ambos cursos servidos em "/", PROD: paths diferenciados).
function detectDefault() {
  try {
    const qp = new URLSearchParams(location.search);
    const m = qp.get('mode');
    if (VALID_MODES.includes(m)) return m;
  } catch (e) {}
  try {
    if (window.parent && window.parent !== window) {
      const path = window.parent.location.pathname || '';
      if (/_light/i.test(path)) return 'pc';
    }
  } catch (e) { /* cross-origin */ }
  try {
    const ref = document.referrer || '';
    if (/_light/i.test(ref)) return 'pc';
  } catch (e) {}
  return 'acordeon';
}

function loadMode() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (VALID_MODES.includes(saved)) {
      currentMode = saved;
      return;
    }
  } catch (e) { /* localStorage indisponível */ }
  currentMode = detectDefault();
}

function saveMode() {
  try { localStorage.setItem(STORAGE_KEY, currentMode); } catch (e) {}
}

function applyMode() {
  const body = document.body;
  body.classList.remove('app-mode-acordeon', 'app-mode-pc');
  body.classList.add(`app-mode-${currentMode}`);

  // Atualiza ícone do botão pro modo atual
  const btn = document.getElementById('app-mode-toggle');
  if (btn) {
    btn.textContent = currentMode === 'pc' ? '🎹' : '⌨️';
    btn.title = currentMode === 'pc'
      ? 'Voltar pra visualização do Acordeon Corvino'
      : 'Trocar pra visualização do Teclado PC';
  }

  // No modo PC, separa visualmente os comandos do BAIXO dos do TECLADO:
  // o HUD do teclado (volume kb + transpose kb) sai da bass-section e
  // ancora na piano-section (onde fica o PC keyboard MD). Espelha a
  // separação semântica do app real.
  const hudTr = document.querySelector('.hud-tr');
  if (hudTr) {
    const target = currentMode === 'pc'
      ? document.getElementById('piano-section')
      : document.getElementById('bass-section');
    if (target && hudTr.parentElement !== target) {
      target.appendChild(hudTr);
    }
  }

  // No modo PC, ativa automaticamente o teclado do PC pra tocar (senão
  // não faz sentido — você está vendo o teclado mas ele não toca).
  if (currentMode === 'pc') {
    keyboardInput.setEnabled(true);
  }
}

export function getMode() { return currentMode; }

export function setMode(mode) {
  if (!VALID_MODES.includes(mode)) return;
  currentMode = mode;
  saveMode();
  applyMode();
}

export function toggle() {
  setMode(currentMode === 'acordeon' ? 'pc' : 'acordeon');
}

export function init() {
  loadMode();
  applyMode();

  const btn = document.getElementById('app-mode-toggle');
  if (btn) btn.addEventListener('click', toggle);
}
