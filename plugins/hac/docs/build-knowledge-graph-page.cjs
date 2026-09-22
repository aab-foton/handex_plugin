// ============================================================
// docs/build-knowledge-graph-page.cjs
// Gera docs/knowledge-graph-view.html a partir de docs/knowledge-graph.json
// — mesmo padrão do projeto (script lê uma fonte de dado e produz um
// artefato "generated", nunca editado à mão; ver src/plugin/refs/*.cjs).
//
// Motivo de gerar em vez de fetch() em runtime: as páginas de docs/ são
// abertas via duplo clique (file://), onde fetch() de um arquivo local é
// bloqueado por CORS na maioria dos navegadores. Embutir o JSON dentro do
// HTML (inline, <script type="application/json">) evita essa dependência
// de servidor sem duplicar o dado manualmente — este script é quem
// mantém os dois sincronizados.
//
// Rodar sempre que docs/knowledge-graph.json mudar:
//   node docs/build-knowledge-graph-page.cjs
// ============================================================

const fs = require('fs');
const path = require('path');

const DOCS_DIR = __dirname;
const SOURCE = path.join(DOCS_DIR, 'knowledge-graph.json');
const OUTPUT = path.join(DOCS_DIR, 'knowledge-graph-view.html');

const raw = fs.readFileSync(SOURCE, 'utf8');
const graph = JSON.parse(raw); // valida antes de embutir — falha alto e claro se o JSON quebrar

// Mesmo sanity-check de U+2028/U+2029 que build.cjs já faz pro skeleton do
// plugin — esses caracteres quebram um literal JS embutido em <script>.
const u2028 = String.fromCharCode(0x2028);
const u2029 = String.fromCharCode(0x2029);
if (raw.indexOf(u2028) >= 0 || raw.indexOf(u2029) >= 0) {
  throw new Error('knowledge-graph.json contém U+2028/U+2029 — remover antes de gerar a página.');
}

const embeddedJSON = JSON.stringify(graph);

const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Grafo de Conhecimento — hac</title>
<style>
:root {
  --hac-cyan: #0891B2;
  --hac-blue: #005ca9;
  --hac-blue-dark: #004782;
  --hac-orange: #f39200;
  --bg: #eef2f7;
  --surface: #ffffff;
  --line: #dde3ec;
  --muted: #64748b;
  --text: #1e293b;
}
:root[data-theme="dark"] {
  --bg: #0f172a;
  --surface: #1e293b;
  --line: #334155;
  --muted: #b4c6d8;
  --text: #f1f5f9;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: -apple-system, "Segoe UI", Arial, sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.6;
}
header.site-header {
  background: var(--hac-blue);
  color: #fff;
  padding: 14px 24px;
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}
:root[data-theme="dark"] header.site-header { background: #00335c; }
header.site-header .brand-group {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-right: auto;
}
header.site-header .brand-icon {
  width: 32px;
  height: 32px;
  border-radius: 999px;
  background: rgba(255,255,255,0.16);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
header.site-header .brand-icon svg { width: 20px; height: 20px; color: #fff; }
header.site-header .brand { font-weight: 700; font-size: 15px; letter-spacing: 0.01em; }
header.site-header nav { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
header.site-header nav a { color: #e0effe; text-decoration: none; font-size: 13px; padding: 6px 10px; border-radius: 6px; }
header.site-header nav a:hover { background: rgba(255,255,255,0.12); color: #fff; }
header.site-header nav a.active { background: rgba(255,255,255,0.18); color: #fff; font-weight: 700; }
#theme-toggle {
  width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;
  border-radius: 999px; border: none; background: rgba(255,255,255,0.12); color: #fff;
  cursor: pointer; flex-shrink: 0;
}
#theme-toggle:hover { background: rgba(255,255,255,0.22); }
#theme-toggle svg { width: 18px; height: 18px; }
main { max-width: 1080px; margin: 0 auto; padding: 28px 24px 64px; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 28px 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.03); }
h1 { font-size: 24px; margin-top: 0; color: var(--hac-blue); letter-spacing: -0.01em; }
h2 { font-size: 18px; margin-top: 36px; padding-top: 12px; border-top: 1px solid var(--line); color: var(--hac-blue); letter-spacing: -0.01em; }
h2:first-of-type { border-top: none; padding-top: 0; }
h3 { font-size: 15px; margin-top: 24px; margin-bottom: 8px; color: var(--text); }
p { margin: 12px 0; }
a { color: var(--hac-cyan); }
a:hover { text-decoration: none; }
code {
  font-family: "Consolas", "SFMono-Regular", monospace;
  background: #f1f5f9; padding: 1px 5px; border-radius: 4px; font-size: 0.9em; color: #0f172a;
  word-break: break-word;
}
:root[data-theme="dark"] code { background: #334155; color: #f1f5f9; }
ul, ol { padding-left: 22px; }
li { margin: 4px 0; }
hr { border: none; border-top: 1px solid var(--line); margin: 32px 0; }
blockquote {
  border-left: 3px solid var(--hac-cyan); margin: 16px 0; padding: 4px 16px;
  background: #f0f9fb; color: #334155; font-size: 14px;
}
:root[data-theme="dark"] blockquote { background: rgba(8,145,178,0.12); color: #d7e6ee; }
blockquote p { margin: 8px 0; }
.footer-note { margin-top: 48px; font-size: 12px; color: var(--muted); text-align: center; }

/* ── Componentes específicos desta página ────────────────────────── */
.meta-strip {
  display: flex; flex-wrap: wrap; gap: 10px; margin: 4px 0 20px;
  font-size: 12.5px; color: var(--muted);
}
.meta-strip span { background: #f8fafc; border: 1px solid var(--line); border-radius: 999px; padding: 3px 12px; }
:root[data-theme="dark"] .meta-strip span { background: #263449; }

.tabs { display: flex; gap: 4px; flex-wrap: wrap; margin: 20px 0 4px; border-bottom: 1px solid var(--line); padding-bottom: 0; }
.tab-btn {
  background: none; border: none; cursor: pointer; font-size: 13px; font-weight: 600;
  color: var(--muted); padding: 8px 14px; border-radius: 6px 6px 0 0; position: relative; top: 1px;
}
.tab-btn:hover { color: var(--text); background: #f8fafc; }
:root[data-theme="dark"] .tab-btn:hover { background: #263449; }
.tab-btn.active { color: var(--hac-blue); border-bottom: 2px solid var(--hac-blue); background: none; }
:root[data-theme="dark"] .tab-btn.active { color: #7dd3fc; border-bottom-color: #7dd3fc; }
.tab-panel { display: none; padding-top: 20px; }
.tab-panel.active { display: block; }

.search-box {
  width: 100%; padding: 9px 14px; border: 1px solid var(--line); border-radius: 8px;
  font-size: 13.5px; background: var(--surface); color: var(--text); margin-bottom: 14px;
}
.search-box:focus { outline: 2px solid var(--hac-cyan); outline-offset: 1px; }

.pill {
  display: inline-block; font-size: 10.5px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.03em; padding: 2px 8px; border-radius: 999px; margin-right: 6px;
}
.pill-f2b { background: #e0f2fe; color: #075985; }
.pill-b2f { background: #fef3c7; color: #92400e; }
:root[data-theme="dark"] .pill-f2b { background: rgba(56,189,248,0.18); color: #7dd3fc; }
:root[data-theme="dark"] .pill-b2f { background: rgba(251,191,36,0.18); color: #fcd34d; }
.pill-warn { background: #fee2e2; color: #991b1b; }
:root[data-theme="dark"] .pill-warn { background: rgba(248,113,113,0.18); color: #fca5a5; }

.msg-card {
  border: 1px solid var(--line); border-radius: 10px; padding: 14px 18px; margin-bottom: 12px;
  background: var(--surface);
}
.msg-card summary {
  cursor: pointer; font-weight: 700; font-size: 13.5px; list-style: none;
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
}
.msg-card summary::-webkit-details-marker { display: none; }
.msg-card summary::before { content: '▸'; color: var(--muted); font-size: 11px; transition: transform 0.15s; }
.msg-card[open] summary::before { transform: rotate(90deg); }
.msg-card .msg-id { font-family: "Consolas", "SFMono-Regular", monospace; color: var(--hac-blue); }
:root[data-theme="dark"] .msg-card .msg-id { color: #7dd3fc; }
.msg-body { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--line); font-size: 13px; }
.msg-body dl { display: grid; grid-template-columns: 110px 1fr; gap: 6px 12px; margin: 0; }
.msg-body dt { font-weight: 700; color: var(--muted); font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.03em; padding-top: 2px; }
.msg-body dd { margin: 0; }
.msg-body dd ul { margin: 0; padding-left: 18px; }
.msg-note {
  margin-top: 10px; padding: 8px 12px; border-radius: 6px; font-size: 12.5px;
  background: #fff7ed; border-left: 3px solid var(--hac-orange); color: #7c2d12;
}
:root[data-theme="dark"] .msg-note { background: rgba(243,146,0,0.1); color: #fdba74; }
.empty-state { text-align: center; color: var(--muted); font-size: 13px; padding: 24px; }

.node-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; margin: 16px 0; }
.node-tile { border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; font-size: 12.5px; }
.node-tile .node-name { font-family: "Consolas", "SFMono-Regular", monospace; font-weight: 700; color: var(--hac-blue); display: block; margin-bottom: 4px; }
:root[data-theme="dark"] .node-tile .node-name { color: #7dd3fc; }

.edge-row { display: flex; align-items: baseline; gap: 8px; font-size: 12.5px; padding: 6px 0; border-bottom: 1px dashed var(--line); flex-wrap: wrap; }
.edge-row:last-child { border-bottom: none; }
.edge-type { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.03em; color: var(--hac-cyan); font-weight: 700; flex-shrink: 0; }

.field-block { border: 1px solid var(--line); border-radius: 10px; padding: 16px 20px; margin-bottom: 16px; }
.field-block h3 { margin-top: 0; font-family: "Consolas", "SFMono-Regular", monospace; }
.field-block .edges-list { margin: 10px 0 0; padding-left: 20px; font-size: 12.5px; }
.field-block .gaps { margin-top: 10px; padding: 10px 14px; border-radius: 6px; background: #fef2f2; border-left: 3px solid #dc2626; font-size: 12.5px; }
:root[data-theme="dark"] .field-block .gaps { background: rgba(220,38,38,0.1); color: #fca5a5; }

.count-badge { font-size: 11px; font-weight: 700; background: var(--hac-cyan); color: #fff; border-radius: 999px; padding: 1px 8px; margin-left: 6px; }
</style>
</head>
<body>
<header class="site-header">
  <div class="brand-group">
    <span class="brand-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1" /><path d="m9 20 3-6 3 6" /><path d="m6 8 6 2 6-2" /><path d="M12 10v4" /></svg></span>
    <span class="brand">hac — Handoff de Acessibilidade CAIXA</span>
  </div>
  <nav>
    <a href="index.html">Início</a>
    <a href="tecnico.html">Documentação Técnica</a>
    <a href="dados.html">Semântica dos Dados</a>
    <a href="institucional.html">Regras de Negócio</a>
    <a href="design-system.html">Design System</a>
    <a href="changelog.html">Changelog</a>
    <a href="auditoria-2026-09.html">Auditoria Geral</a>
    <a href="knowledge-graph-view.html" class="active">Grafo de Conhecimento</a>
  </nav>
  <button type="button" id="theme-toggle" aria-label="Alternar tema claro/escuro" title="Alternar tema claro/escuro"></button>
</header>
<main>
  <div class="card">

    <h1>Grafo de Conhecimento — contrato de mensagens</h1>

    <p>Página gerada a partir de <code>docs/knowledge-graph.json</code> — foco
    no contrato <code>postMessage</code> entre backend (sandbox principal do
    Figma) e frontend (iframe). Ver <a href="knowledge-graph-guide.md">guia de
    consulta</a> (Markdown) para receitas de uso. <strong>Não editar esta
    página à mão</strong> — rodar <code>node docs/build-knowledge-graph-page.cjs</code>
    depois de qualquer mudança em <code>knowledge-graph.json</code>.</p>

    <div class="meta-strip" id="meta-strip"></div>

    <blockquote>
      <p>Não há motor de query — o grafo em si é um JSON estático. Esta
      página só facilita a NAVEGAÇÃO visual dele (busca, agrupamento,
      destaque de assimetrias/pontas soltas); para consultas que a página
      não cobrir, grep direto em <code>knowledge-graph.json</code> continua
      valendo.</p>
    </blockquote>

    <div class="tabs" role="tablist">
      <button type="button" class="tab-btn active" data-tab="messages" role="tab">Mensagens <span class="count-badge" id="count-messages"></span></button>
      <button type="button" class="tab-btn" data-tab="propagates" role="tab">Campos propagados <span class="count-badge" id="count-propagates"></span></button>
      <button type="button" class="tab-btn" data-tab="patterns" role="tab">Padrões estruturais <span class="count-badge" id="count-patterns"></span></button>
      <button type="button" class="tab-btn" data-tab="files" role="tab">Arquivos &amp; dependências <span class="count-badge" id="count-files"></span></button>
    </div>

    <!-- ── Mensagens ─────────────────────────────────────────────── -->
    <div class="tab-panel active" id="panel-messages">
      <input type="text" class="search-box" id="msg-search" placeholder="Buscar por id, campo de payload, arquivo, função…">
      <div style="margin-bottom: 12px; display: flex; gap: 6px; flex-wrap: wrap;">
        <button type="button" class="tab-btn" data-filter="all" style="border:1px solid var(--line);">Todas</button>
        <button type="button" class="tab-btn" data-filter="frontend-to-backend" style="border:1px solid var(--line);">Frontend → Backend</button>
        <button type="button" class="tab-btn" data-filter="backend-to-frontend" style="border:1px solid var(--line);">Backend → Frontend</button>
        <button type="button" class="tab-btn" data-filter="flagged" style="border:1px solid var(--line);">Só com nota/alerta</button>
      </div>
      <div id="messages-list"></div>
      <p class="empty-state" id="messages-empty" style="display:none;">Nenhuma mensagem encontrada para esse filtro.</p>
    </div>

    <!-- ── Campos propagados ─────────────────────────────────────── -->
    <div class="tab-panel" id="panel-propagates">
      <p>Campos de payload que aparecem em mais de um ponto do código — a
      aresta mais importante do grafo: liga TODOS os lugares que precisam
      mudar juntos se o campo mudar.</p>
      <div id="propagates-list"></div>
    </div>

    <!-- ── Padrões estruturais ───────────────────────────────────── -->
    <div class="tab-panel" id="panel-patterns">
      <div id="patterns-list"></div>
    </div>

    <!-- ── Arquivos & dependências ───────────────────────────────── -->
    <div class="tab-panel" id="panel-files">
      <h3>Arquivos-fonte</h3>
      <div class="node-grid" id="nodes-grid"></div>
      <h3>Dependências estruturais (imports / ordem de carregamento)</h3>
      <div id="edges-list"></div>
    </div>

    <p class="footer-note">hac — Grafo de Conhecimento · gerado de knowledge-graph.json · repositório privado, uso interno</p>
  </div>
</main>

<script type="application/json" id="graph-data">${embeddedJSON}</script>
<script>
(function () {
  var GRAPH = JSON.parse(document.getElementById('graph-data').textContent);

  // ── Tema (mesmo padrão das outras páginas de docs/) ────────────────
  var ICON_SUN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" /></svg>';
  var ICON_MOON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" /></svg>';
  var STORAGE_KEY = 'hac-docs-theme';
  var root = document.documentElement;
  var toggle = document.getElementById('theme-toggle');
  function applyTheme(theme) {
    if (theme === 'dark') { root.setAttribute('data-theme', 'dark'); if (toggle) toggle.innerHTML = ICON_SUN; }
    else { root.removeAttribute('data-theme'); if (toggle) toggle.innerHTML = ICON_MOON; }
  }
  var saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) {}
  applyTheme(saved === 'dark' ? 'dark' : 'light');
  if (toggle) {
    toggle.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      try { localStorage.setItem(STORAGE_KEY, next); } catch (e) {}
    });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function list(items) {
    if (!items || !items.length) return '<em>—</em>';
    return '<ul>' + items.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul>';
  }

  // ── Meta strip ──────────────────────────────────────────────────
  var schema = GRAPH._schema || {};
  var metaStrip = document.getElementById('meta-strip');
  var metaBits = [];
  if (schema.generatedAt) metaBits.push('Gerado em ' + schema.generatedAt);
  if (schema.generatedFrom && schema.generatedFrom.branch) metaBits.push('branch ' + schema.generatedFrom.branch);
  metaBits.push((GRAPH.messages || []).length + ' mensagens mapeadas');
  metaBits.push((GRAPH.propagatesField || []).length + ' campos propagados documentados');
  metaStrip.innerHTML = metaBits.map(function (b) { return '<span>' + esc(b) + '</span>'; }).join('');

  // ── Tabs ────────────────────────────────────────────────────────
  var tabBtns = document.querySelectorAll('.tabs > .tab-btn');
  tabBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      tabBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.remove('active'); });
      document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
    });
  });

  // ── Mensagens ───────────────────────────────────────────────────
  var messages = (GRAPH.messages || []).slice().sort(function (a, b) { return a.id.localeCompare(b.id); });
  document.getElementById('count-messages').textContent = messages.length;

  function messageMatchesQuery(m, q) {
    if (!q) return true;
    q = q.toLowerCase();
    var haystack = [
      m.id, m.direction, m.handlerLocation, m.note,
      (m.payloadFields || []).join(' '),
      (m.senders || []).join(' '),
      (m.consumers || []).join(' '),
      (m.respondsWith || []).join(' ')
    ].join(' ').toLowerCase();
    return haystack.indexOf(q) !== -1;
  }

  function renderMessageCard(m) {
    var pillClass = m.direction === 'frontend-to-backend' ? 'pill-f2b' : 'pill-b2f';
    var pillLabel = m.direction === 'frontend-to-backend' ? 'Frontend → Backend' : 'Backend → Frontend';
    var deadHandler = /NENHUM/i.test(m.handlerLocation || '');
    var html = '<details class="msg-card">';
    html += '<summary><span class="pill ' + pillClass + '">' + pillLabel + '</span>';
    html += '<span class="msg-id">' + esc(m.id.replace(/^message:/, '')) + '</span>';
    if (deadHandler) html += '<span class="pill pill-warn">Sem handler</span>';
    if (m.note) html += '<span class="pill pill-warn">Nota</span>';
    html += '</summary>';
    html += '<div class="msg-body"><dl>';
    html += '<dt>Handler</dt><dd><code>' + esc(m.handlerLocation) + '</code></dd>';
    html += '<dt>Payload</dt><dd>' + (m.payloadFields && m.payloadFields.length ? list(m.payloadFields) : '<em>sem campos</em>') + '</dd>';
    html += '<dt>Disparado por</dt><dd>' + list(m.senders) + '</dd>';
    html += '<dt>Consumido por</dt><dd>' + list(m.consumers) + '</dd>';
    if (m.respondsWith && m.respondsWith.length) html += '<dt>Responde com</dt><dd>' + list(m.respondsWith) + '</dd>';
    html += '</dl>';
    if (m.note) html += '<div class="msg-note">' + esc(m.note) + '</div>';
    html += '</div></details>';
    return html;
  }

  var currentFilter = 'all';
  function renderMessages() {
    var q = document.getElementById('msg-search').value.trim();
    var filtered = messages.filter(function (m) {
      if (currentFilter === 'frontend-to-backend' && m.direction !== 'frontend-to-backend') return false;
      if (currentFilter === 'backend-to-frontend' && m.direction !== 'backend-to-frontend') return false;
      if (currentFilter === 'flagged' && !m.note) return false;
      return messageMatchesQuery(m, q);
    });
    var container = document.getElementById('messages-list');
    var empty = document.getElementById('messages-empty');
    if (!filtered.length) {
      container.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';
    container.innerHTML = filtered.map(renderMessageCard).join('');
  }
  document.getElementById('msg-search').addEventListener('input', renderMessages);
  document.querySelectorAll('[data-filter]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('[data-filter]').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderMessages();
    });
  });
  renderMessages();

  // ── Campos propagados ───────────────────────────────────────────
  var propagates = GRAPH.propagatesField || [];
  document.getElementById('count-propagates').textContent = propagates.length;
  document.getElementById('propagates-list').innerHTML = propagates.map(function (p) {
    var html = '<div class="field-block">';
    html += '<h3>' + esc(p.field) + '</h3>';
    html += '<p>' + esc(p.description) + '</p>';
    html += '<div class="edges-list">' + list(p.edges) + '</div>';
    if (p.gapsIdentified && p.gapsIdentified.length) {
      html += '<div class="gaps"><strong>Lacunas identificadas:</strong>' + list(p.gapsIdentified) + '</div>';
    }
    html += '</div>';
    return html;
  }).join('');

  // ── Padrões estruturais ─────────────────────────────────────────
  var patterns = GRAPH.patterns || [];
  document.getElementById('count-patterns').textContent = patterns.length;
  document.getElementById('patterns-list').innerHTML = patterns.map(function (pt) {
    var html = '<div class="field-block">';
    html += '<h3>' + esc(pt.name) + '</h3>';
    html += '<p>' + esc(pt.description) + '</p>';
    if (pt.functions && pt.functions.length) { html += '<h3 style="font-family:inherit;">Funções envolvidas</h3>' + list(pt.functions); }
    if (pt.triggerMessages && pt.triggerMessages.length) { html += '<h3 style="font-family:inherit;">Mensagens de disparo</h3>' + list(pt.triggerMessages); }
    if (pt.responseMessages && pt.responseMessages.length) { html += '<h3 style="font-family:inherit;">Mensagens de resposta</h3>' + list(pt.responseMessages); }
    if (pt.knownAsymmetries && pt.knownAsymmetries.length) {
      html += '<h3 style="font-family:inherit;">Assimetrias conhecidas</h3>';
      html += pt.knownAsymmetries.map(function (a) {
        return '<div class="gaps"><strong>' + esc(a.field) + '</strong><p style="margin:6px 0;">' + esc(a.description) + '</p><em>' + esc(a.status) + '</em></div>';
      }).join('');
    }
    html += '</div>';
    return html;
  }).join('');

  // ── Arquivos & dependências ─────────────────────────────────────
  var nodes = (GRAPH.nodes || []).filter(function (n) { return n.type === 'file'; });
  document.getElementById('count-files').textContent = nodes.length;
  document.getElementById('nodes-grid').innerHTML = nodes.map(function (n) {
    return '<div class="node-tile"><span class="node-name">' + esc(n.name) + '</span>' + esc(n.summary) + '</div>';
  }).join('');
  document.getElementById('edges-list').innerHTML = (GRAPH.structuralEdges || []).map(function (e) {
    return '<div class="edge-row"><span class="edge-type">' + esc(e.type) + '</span>' +
      '<code>' + esc(e.source.replace(/^file:/, '')) + '</code> → <code>' + esc(e.target.replace(/^file:/, '')) + '</code>' +
      '<span style="color:var(--muted);">' + esc(e.note) + '</span></div>';
  }).join('');
})();
</script>
</body>
</html>
`;

fs.writeFileSync(OUTPUT, html, 'utf8');
console.log(`✅ ${path.relative(process.cwd(), OUTPUT)} gerado (${(html.length / 1024).toFixed(1)} KB) a partir de ${path.relative(process.cwd(), SOURCE)}`);
