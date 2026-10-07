// ============================================================
// docs/refresh-knowledge-graph.cjs (2026-10-07)
// Atualiza docs/knowledge-graph.json a partir do código real: localização de
// handlers/senders/consumers, mensagens novas (addedAt) e mensagens que sumiram
// (notFoundInCode). Preserva textos escritos à mão (consumers descritivos,
// respondsWith, note). Mensagens novas entram com payloadFields extraídos da
// linha do postMessage — completar consumers/descrição à mão.
//
// Rodar:  node docs/refresh-knowledge-graph.cjs && node docs/build-knowledge-graph-page.cjs
// ============================================================
const fs = require('fs');
const path = require('path');
const ROOT = process.argv[2] || path.resolve(__dirname, '..');
const GRAPH = path.join(ROOT, 'docs', 'knowledge-graph.json');
const g = JSON.parse(fs.readFileSync(GRAPH, 'utf8'));

const rel = p => path.relative(ROOT, p).split(path.sep).join('/');
const list = (dir, re) => fs.readdirSync(dir).filter(f => re.test(f)).map(f => path.join(dir, f));
const backendFiles = [path.join(ROOT, 'src/plugin/code.js'), ...list(path.join(ROOT, 'src/plugin/backend'), /\.js$/)];
const frontendFiles = [...list(path.join(ROOT, 'src/plugin/modules'), /\.js$/), ...list(path.join(ROOT, 'src/plugin/views'), /\.html$/)];

const found = {}; // type -> { handlers:[], bSenders:[], fSenders:[], fConsumers:[], fields:Set }
const get = t => (found[t] = found[t] || { handlers: [], bSenders: [], fSenders: [], fConsumers: [], fields: new Set() });

function fieldsFrom(line, t) {
  const i = line.indexOf(t);
  const tail = line.slice(i + t.length);
  const close = tail.indexOf('}');
  const seg = close >= 0 ? tail.slice(0, close) : tail;
  const out = [];
  for (const m of seg.matchAll(/[,{]\s*([A-Za-z_$][\w$]*)\s*(?=[:,}]|$)/g)) if (m[1] !== 'type') out.push(m[1]);
  return out;
}

function scan(file, side) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((ln, i) => {
    const loc = `${rel(file)}:${i + 1}`;
    for (const m of ln.matchAll(/msg\.type\s*===\s*["']([a-z0-9-]+)["']/g)) {
      if (side === 'backend') get(m[1]).handlers.push(loc); else get(m[1]).fConsumers.push(loc);
    }
    for (const m of ln.matchAll(/type:\s*["']([a-z0-9-]+)["']/g)) {
      const t = m[1];
      const isPost = /postMessage/.test(ln) || /pluginMessage/.test(ln) || (i > 0 && /postMessage\(\{?\s*$/.test(lines[i - 1])) || (i > 0 && /pluginMessage:\s*\{?\s*$/.test(lines[i - 1]));
      if (!isPost) continue;
      if (side === 'backend') get(t).bSenders.push(loc); else get(t).fSenders.push(loc);
      fieldsFrom(ln, m[0]).forEach(f => get(t).fields.add(f));
    }
  });
}
backendFiles.forEach(f => scan(f, 'backend'));
frontendFiles.forEach(f => scan(f, 'frontend'));

const byId = new Map(g.messages.map(m => [m.id, m]));
const added = [], updated = [], gone = [];
for (const [t, f] of Object.entries(found)) {
  const id = 'message:' + t;
  const f2b = f.handlers.length > 0 || f.fSenders.length > 0;
  const b2f = f.fConsumers.length > 0 || f.bSenders.length > 0;
  if (!f2b && !b2f) continue;
  let m = byId.get(id);
  if (!m) {
    m = { id, direction: f.handlers.length || f.fSenders.length ? 'frontend-to-backend' : 'backend-to-frontend', handlerLocation: null, payloadFields: [...f.fields], senders: [], consumers: [], respondsWith: [], addedAt: new Date().toISOString().slice(0, 10) };
    g.messages.push(m); byId.set(id, m); added.push(t);
  } else updated.push(t);
  if (m.direction === 'frontend-to-backend') {
    m.handlerLocation = f.handlers[0] || m.handlerLocation || null;
    m.senders = f.fSenders.length ? f.fSenders : m.senders;
  } else {
    m.handlerLocation = f.fConsumers[0] || m.handlerLocation || null;
    m.senders = f.bSenders.length ? f.bSenders : m.senders;
  }
  const known = new Set(m.payloadFields || []);
  [...f.fields].forEach(x => known.add(x));
  m.payloadFields = [...known];
  delete m.notFoundInCode;
}
for (const m of g.messages) {
  const t = m.id.replace(/^message:/, '');
  if (!found[t] || (!found[t].handlers.length && !found[t].fSenders.length && !found[t].fConsumers.length && !found[t].bSenders.length)) {
    if (!m.notFoundInCode) gone.push(t);
    m.notFoundInCode = new Date().toISOString().slice(0, 10);
  }
}
g._schema.generatedAt = g._schema.generatedAt || '2026-09-22';
g._schema.refreshedAt = new Date().toISOString().slice(0, 10);
g._schema.refreshNote = 'Localizações (handlerLocation/senders) e mensagens novas atualizadas a partir do código em 2026-10-07 (v0.1.0-beta.110), por varredura de msg.type === / postMessage({ type }). Descrições escritas à mão preservadas. notFoundInCode marca mensagens que não aparecem mais no código.';
fs.writeFileSync(GRAPH, JSON.stringify(g, null, 2) + '\n');
console.log(JSON.stringify({ total: g.messages.length, added, gone, updatedCount: updated.length }, null, 1));
