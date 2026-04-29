// accessibility.js — controles de acessibilidade + splitter de layout
// Painel COLAPSADO por padrão. Splitter vertical arrastável entre aula e app.
// Tudo persiste em localStorage.

(function () {
  // ===== ESTADO =====
  const STORAGE_FONT = 'corvino-font-zoom';
  const STORAGE_HIDE_APP = 'corvino-hide-app';
  const STORAGE_PANEL_OPEN = 'corvino-a11y-open';
  const STORAGE_APP_WIDTH = 'corvino-app-width'; // px

  let fontZoom = parseFloat(localStorage.getItem(STORAGE_FONT)) || 1.0;
  let hideApp = localStorage.getItem(STORAGE_HIDE_APP) === '1';
  let panelOpen = localStorage.getItem(STORAGE_PANEL_OPEN) === '1';
  let appWidth = parseInt(localStorage.getItem(STORAGE_APP_WIDTH)) || 650;

  const APP_MIN = 280;
  const APP_MAX = 900;

  // ===== APLICAR ESTADO =====
  function applyState() {
    document.documentElement.style.fontSize = (18 * fontZoom) + 'px';
    document.body.classList.toggle('app-hidden', hideApp);

    const zoomLabel = document.getElementById('zoom-label');
    if (zoomLabel) zoomLabel.textContent = Math.round(fontZoom * 100) + '%';

    const toggleBtn = document.getElementById('toggle-app-btn');
    if (toggleBtn) toggleBtn.textContent = hideApp ? '👁 Mostrar app' : '⊟ Ocultar app';

    const panel = document.getElementById('a11y-panel');
    if (panel) panel.classList.toggle('a11y-open', panelOpen);

    applyAppWidth();
  }

  function applyAppWidth() {
    const layout = document.querySelector('.lesson-layout');
    if (!layout) return;
    if (window.innerWidth < 1100 || hideApp) {
      // single-col em telas pequenas, ou app oculto — deixa o CSS cuidar
      layout.style.gridTemplateColumns = '';
      return;
    }
    const w = Math.max(APP_MIN, Math.min(APP_MAX, appWidth));
    // 3 colunas: conteúdo | splitter (14px) | app
    layout.style.gridTemplateColumns = `minmax(0, 1fr) 14px ${w}px`;
  }

  // ===== AÇÕES =====
  function changeZoom(delta) {
    fontZoom = Math.max(0.85, Math.min(1.5, fontZoom + delta));
    localStorage.setItem(STORAGE_FONT, fontZoom);
    applyState();
  }
  function resetZoom() {
    fontZoom = 1.0;
    localStorage.setItem(STORAGE_FONT, fontZoom);
    applyState();
  }
  function toggleApp() {
    hideApp = !hideApp;
    localStorage.setItem(STORAGE_HIDE_APP, hideApp ? '1' : '0');
    applyState();
  }
  function togglePanel() {
    panelOpen = !panelOpen;
    localStorage.setItem(STORAGE_PANEL_OPEN, panelOpen ? '1' : '0');
    applyState();
  }
  function resetAppWidth() {
    appWidth = 650;
    localStorage.setItem(STORAGE_APP_WIDTH, appWidth);
    applyState();
  }

  // ===== INJEÇÃO DOS CONTROLES =====
  function injectControls() {
    if (document.getElementById('a11y-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'a11y-panel';
    panel.innerHTML = `
      <button class="a11y-toggle-icon" data-act="toggle-panel" title="Ajustes de acessibilidade">⚙</button>
      <div class="a11y-content">
        <div class="a11y-section">
          <span class="a11y-section-label">Tamanho do texto</span>
          <button class="a11y-btn a11y-zoom" data-act="zoom-out" title="Diminuir texto">A−</button>
          <button class="a11y-btn a11y-zoom" data-act="zoom-reset" title="Tamanho padrão"><span id="zoom-label">100%</span></button>
          <button class="a11y-btn a11y-zoom a11y-zoom-plus" data-act="zoom-in" title="Aumentar texto">A+</button>
        </div>
        <div class="a11y-section">
          <span class="a11y-section-label">Layout do app</span>
          <button class="a11y-btn a11y-toggle-app" data-act="reset-app-width" title="Voltar largura padrão">↔ Centralizar</button>
        </div>
        <div class="a11y-section">
          <button id="toggle-app-btn" class="a11y-btn a11y-toggle-app" data-act="toggle-app">⊟ Ocultar app</button>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    panel.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'zoom-out')   changeZoom(-0.10);
      else if (act === 'zoom-in') changeZoom(+0.10);
      else if (act === 'zoom-reset') resetZoom();
      else if (act === 'toggle-app') toggleApp();
      else if (act === 'toggle-panel') togglePanel();
      else if (act === 'reset-app-width') resetAppWidth();
    });

    document.addEventListener('click', (e) => {
      if (!panelOpen) return;
      if (e.target.closest('#a11y-panel')) return;
      panelOpen = false;
      localStorage.setItem(STORAGE_PANEL_OPEN, '0');
      applyState();
    });
  }

  // ===== SPLITTER (divisor arrastável) =====
  function injectSplitter() {
    const layout = document.querySelector('.lesson-layout');
    const appPanel = layout && layout.querySelector('.app-panel');
    if (!layout || !appPanel) return; // só em páginas com app
    if (document.querySelector('.layout-splitter')) return;

    const splitter = document.createElement('div');
    splitter.className = 'layout-splitter';
    splitter.title = 'Arraste para redimensionar';
    splitter.innerHTML = '<div class="layout-splitter-handle"><span>⋮⋮</span></div>';

    // Insere o splitter como item do grid, ANTES do app-panel
    layout.insertBefore(splitter, appPanel);

    // Drag logic
    let dragging = false;
    let startX = 0;
    let startAppWidth = 0;

    function onMouseDown(e) {
      if (window.innerWidth < 1100) return;
      dragging = true;
      startX = e.clientX;
      startAppWidth = appWidth;
      document.body.classList.add('layout-dragging');
      e.preventDefault();
    }
    function onMouseMove(e) {
      if (!dragging) return;
      const delta = startX - e.clientX; // arrastar pra esquerda = app maior
      let newWidth = startAppWidth + delta;
      newWidth = Math.max(APP_MIN, Math.min(APP_MAX, newWidth));
      appWidth = newWidth;
      applyAppWidth();
    }
    function onMouseUp() {
      if (!dragging) return;
      dragging = false;
      document.body.classList.remove('layout-dragging');
      localStorage.setItem(STORAGE_APP_WIDTH, appWidth);
    }

    splitter.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    // Touch (mobile/tablet — embora layout seja single-col abaixo de 1100px)
    splitter.addEventListener('touchstart', (e) => {
      if (e.touches[0]) onMouseDown(e.touches[0]);
    }, { passive: false });
    document.addEventListener('touchmove', (e) => {
      if (e.touches[0]) onMouseMove(e.touches[0]);
    });
    document.addEventListener('touchend', onMouseUp);
  }

  // ===== APP LOADING PLACEHOLDER =====
  // Mostra "Carregando app Corvino…" enquanto o iframe não termina de baixar.
  // Sem isso o aluno olha pra um quadrado vazio e não sabe se quebrou.
  //
  // IMPORTANTE: o loader precisa de um pai com `position: relative` pra
  // ficar absolutamente posicionado em cima do iframe. Mas NÃO podemos
  // mexer no .app-panel (que tem `position: sticky` — sobrescrever isso
  // quebra o "app fixo na tela durante scroll"). Solução: envolver o
  // iframe num wrapper dedicado que recebe `position: relative` e fica
  // dentro do .app-panel sem afetar a estrutura visível.
  function injectAppLoader() {
    const iframe = document.querySelector('iframe.app-frame');
    if (!iframe) return;
    const appPanel = iframe.parentElement;
    if (!appPanel) return;

    // Se já tem wrapper, não duplica
    let wrapper = iframe.previousElementSibling?.classList?.contains('app-frame-wrap')
      ? iframe.previousElementSibling
      : iframe.parentElement.classList.contains('app-frame-wrap')
        ? iframe.parentElement
        : null;

    if (!wrapper) {
      // Cria wrapper e move o iframe pra dentro
      wrapper = document.createElement('div');
      wrapper.className = 'app-frame-wrap';
      wrapper.style.position = 'relative';
      wrapper.style.flex = '1 1 auto'; // herda flex do .app-panel
      wrapper.style.minHeight = '0';
      wrapper.style.display = 'flex';
      wrapper.style.flexDirection = 'column';
      iframe.parentNode.insertBefore(wrapper, iframe);
      wrapper.appendChild(iframe);
    }

    if (wrapper.querySelector('.app-loading')) return;

    const loader = document.createElement('div');
    loader.className = 'app-loading';
    loader.innerHTML = `
      <div class="app-loading-icon">🪗</div>
      <div class="app-loading-text">Carregando app Corvino…</div>
      <div class="app-loading-hint">~5 segundos na primeira vez</div>
    `;
    wrapper.appendChild(loader);

    // Some quando iframe avisar que carregou
    iframe.addEventListener('load', () => {
      loader.classList.add('app-loading--hidden');
      // Remove do DOM depois da transição (libera memória)
      setTimeout(() => loader.remove(), 600);
    }, { once: true });

    // Fallback de segurança: some após 30s mesmo se load não disparar
    setTimeout(() => {
      if (loader.isConnected) {
        loader.classList.add('app-loading--hidden');
        setTimeout(() => loader.remove(), 600);
      }
    }, 30000);
  }

  // ===== INIT =====
  function init() {
    injectControls();
    injectSplitter();
    injectAppLoader();
    applyState();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Reaplica width quando redimensiona janela (entre breakpoints)
  window.addEventListener('resize', applyAppWidth);
})();
