// debug-report.js — botão flutuante "Reportar bug"
// Captura console.log/warn/error/erros de runtime e mostra num painel
// com botão de copiar, pra o aluno enviar pro suporte sem precisar
// abrir DevTools (F12). Carregado em todas as aulas via tag <script>.

(function () {
  const MAX_LOGS = 300;
  const logs = [];

  // ===== Captura console + erros =====
  const native = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  function fmtArg(a) {
    if (a == null) return String(a);
    if (typeof a === 'string') return a;
    if (a instanceof Error) return a.stack || a.message;
    try { return JSON.stringify(a); } catch (_) { return String(a); }
  }
  function pushLog(level, args) {
    const ts = new Date().toLocaleTimeString('pt-BR');
    const line = `[${ts}] [${level}] ${Array.from(args).map(fmtArg).join(' ')}`;
    logs.push(line);
    if (logs.length > MAX_LOGS) logs.shift();
  }
  ['log', 'info', 'warn', 'error'].forEach(level => {
    console[level] = function () {
      pushLog(level, arguments);
      native[level].apply(console, arguments);
    };
  });

  window.addEventListener('error', e => {
    pushLog('error', [
      `${e.message} @ ${e.filename}:${e.lineno}:${e.colno}`,
      e.error && e.error.stack ? '\n' + e.error.stack : '',
    ]);
  });
  window.addEventListener('unhandledrejection', e => {
    const r = e.reason;
    pushLog('error', [
      'unhandledrejection:',
      r && r.stack ? r.stack : (r && r.message) ? r.message : String(r),
    ]);
  });

  // Recebe logs do iframe app (postMessage type 'corvino:log')
  window.addEventListener('message', e => {
    const d = e && e.data;
    if (!d || typeof d !== 'object') return;
    if (d.type === 'corvino:log' && typeof d.text === 'string') {
      pushLog((d.level || 'log') + '/iframe', [d.text]);
    }
  });

  // ===== Coleta info do sistema =====
  function systemInfo() {
    const nav = navigator || {};
    return [
      `URL:        ${location.href}`,
      `Data/hora:  ${new Date().toLocaleString('pt-BR')}`,
      `Navegador:  ${nav.userAgent || '?'}`,
      `Idioma:     ${nav.language || '?'}`,
      `Tela:       ${screen.width}x${screen.height} (${window.innerWidth}x${window.innerHeight} viewport, dpr ${window.devicePixelRatio || 1})`,
      `Plataforma: ${nav.platform || '?'}`,
    ].join('\n');
  }

  function buildReport(userMsg) {
    const hr = '─'.repeat(40);
    return [
      '🐛 RELATÓRIO DE BUG — Curso Corvino',
      hr,
      userMsg ? `Descrição:\n${userMsg}\n${hr}` : '',
      'Sistema:',
      systemInfo(),
      hr,
      `Console (últimas ${logs.length} linhas):`,
      logs.length ? logs.join('\n') : '(vazio)',
      hr,
    ].filter(Boolean).join('\n');
  }

  // ===== UI =====
  function el(tag, props = {}, ...kids) {
    const e = document.createElement(tag);
    for (const k in props) {
      if (k === 'style') Object.assign(e.style, props[k]);
      else if (k === 'class') e.className = props[k];
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), props[k]);
      else e.setAttribute(k, props[k]);
    }
    kids.forEach(k => e.appendChild(typeof k === 'string' ? document.createTextNode(k) : k));
    return e;
  }

  function openModal() {
    if (document.getElementById('dbg-modal')) return;

    const textarea = el('textarea', {
      id: 'dbg-textarea',
      readonly: 'readonly',
      class: 'dbg-textarea',
    });
    textarea.value = buildReport('');

    const userInput = el('textarea', {
      id: 'dbg-user-msg',
      class: 'dbg-user-msg',
      placeholder: 'O que aconteceu? (opcional, mas ajuda muito)\nExemplo: "apertei G mas a nota não acendeu"',
      rows: '3',
    });
    userInput.addEventListener('input', () => {
      textarea.value = buildReport(userInput.value.trim());
    });

    const copyBtn = el('button', {
      class: 'dbg-btn dbg-btn-primary',
      onclick: async () => {
        try {
          await navigator.clipboard.writeText(textarea.value);
          copyBtn.textContent = '✓ Copiado!';
          setTimeout(() => { copyBtn.textContent = '📋 Copiar tudo'; }, 1800);
        } catch (_) {
          textarea.select();
          document.execCommand('copy');
          copyBtn.textContent = '✓ Copiado!';
          setTimeout(() => { copyBtn.textContent = '📋 Copiar tudo'; }, 1800);
        }
      },
    }, '📋 Copiar tudo');

    const wppBtn = el('a', {
      class: 'dbg-btn dbg-btn-wpp',
      href: '#',
      onclick: (e) => {
        e.preventDefault();
        // Limita pra não estourar URL no mobile
        const txt = textarea.value.length > 1500
          ? textarea.value.slice(0, 1500) + '\n...(truncado, copie tudo e cole)'
          : textarea.value;
        const url = `https://wa.me/?text=${encodeURIComponent(txt)}`;
        window.open(url, '_blank', 'noopener');
      },
    }, '💬 Enviar via WhatsApp');

    const closeBtn = el('button', {
      class: 'dbg-btn',
      onclick: closeModal,
    }, 'Fechar');

    const modal = el('div', { id: 'dbg-modal', class: 'dbg-modal' },
      el('div', { class: 'dbg-modal-bg', onclick: closeModal }),
      el('div', { class: 'dbg-modal-card' },
        el('h3', { class: 'dbg-title' }, '🐛 Reportar bug / problema'),
        el('p', { class: 'dbg-help' },
          'Descreve o que aconteceu (opcional) e clica em ',
          el('b', {}, 'Copiar tudo'),
          ' ou ',
          el('b', {}, 'Enviar via WhatsApp'),
          '. As infos técnicas vão automaticamente.',
        ),
        userInput,
        el('div', { class: 'dbg-label' }, 'Relatório completo (auto-gerado):'),
        textarea,
        el('div', { class: 'dbg-actions' }, copyBtn, wppBtn, closeBtn),
      ),
    );
    document.body.appendChild(modal);
    setTimeout(() => userInput.focus(), 50);
  }

  function closeModal() {
    const m = document.getElementById('dbg-modal');
    if (m) m.remove();
  }

  // ===== Botão flutuante =====
  function injectButton() {
    if (document.getElementById('dbg-fab')) return;
    const btn = el('button', {
      id: 'dbg-fab',
      class: 'dbg-fab',
      title: 'Reportar bug ou problema',
      'aria-label': 'Reportar bug',
      onclick: openModal,
    }, '🐛');
    document.body.appendChild(btn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectButton);
  } else {
    injectButton();
  }

  // Atalho: Ctrl+Shift+B abre o modal
  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.shiftKey && (e.code === 'KeyB' || e.key === 'B' || e.key === 'b')) {
      e.preventDefault();
      openModal();
    }
  });

  // Expor pro console (útil pra debug do próprio botão)
  window.CorvinoDebug = {
    open: openModal,
    close: closeModal,
    logs: () => logs.slice(),
    report: () => buildReport(''),
  };
})();
