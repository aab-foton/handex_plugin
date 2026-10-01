// ============================================================
// HAC — check-lib-sources.cjs
//
// AUDITORIA DE KEYS DE COMPONENTE: toda component key (hash de 40 hex)
// escrita no código-fonte do plugin — marcadores Agrupamento/Conectores,
// selos Identificação da tela/Ordenação, keys dos wrappers "Box specs leitor
// de tela" (web e mobile) — precisa resolver, via REST API, para o arquivo
// próprio "[HAC] Handoff Super DSC Mobile e Web" (fileKey
// HhriLSpKnCB2dHhyiU16iB). Uma key que resolve para OUTRO arquivo (ex.: a lib
// "Design Acessível" ANTIGA, Wy0IhXRVZMSOOr8E609UqI) ou que não resolve
// (componente despublicado/renomeado) é exatamente o defeito que já aconteceu
// 3 vezes (keys migradas só em parte; o plugin puxando componente da lib
// errada sem ninguém notar) — este script pega isso antes de virar print de
// usuário.
//
// POR QUE UM SCRIPT SEPARADO de check-visual-foundations.cjs: aquele é
// OFFLINE, sem token, e compara tokens visuais com um JSON já versionado; este
// precisa de FIGMA_TOKEN e de rede (GET /v1/components/{key}, uma chamada por
// key). Misturar os dois faria o check visual — que roda em qualquer máquina —
// passar a depender de token. Os dois são passos INFORMATIVOS do CI
// (continue-on-error).
//
// O QUE ELE VARRE (literais de 40 hex em):
//   - src/plugin/code.js, src/plugin/backend/*.js, src/plugin/modules/*.js,
//     src/plugin/views/*.html e os scripts src/plugin/refs/*.cjs;
//   - os JSONs GERADOS de wrapper (refs/design-acessivel-*-wrapper.generated.json),
//     onde ficam as keys dos Box specs, e refs/design-acessivel-content.json.
// NÃO varre: bundles (code.bundle.js, ui.html), hac-plugin/, node_modules, nem
// os JSONs de libs (super-dsc-web.json, _skeleton.json...) — esses guardam as
// keys de OUTRAS libs por definição e não são "keys escritas no código".
//
// USO:
//   FIGMA_TOKEN=xxx node src/plugin/refs/check-lib-sources.cjs            (informativo, sai 0)
//   FIGMA_TOKEN=xxx node src/plugin/refs/check-lib-sources.cjs --strict   (sai 1 se houver desvio)
//   ... --json docs/lib-sources-report.json                               (grava o relatório)
// Sem FIGMA_TOKEN: avisa e sai 0 (o token é só de manutenção/CI; nenhuma
// feature do plugin depende dele — ver CLAUDE.md).
// ============================================================

const fs = require('fs');
const path = require('path');

const TOKEN = process.env.FIGMA_TOKEN;
const ROOT = path.resolve(__dirname, '..', '..', '..');
const PLUGIN = path.join(ROOT, 'src', 'plugin');
const EXPECTED_FILE_KEY = 'HhriLSpKnCB2dHhyiU16iB';
const STRICT = process.argv.includes('--strict');
const JSON_OUT = (() => { const i = process.argv.indexOf('--json'); return i >= 0 ? process.argv[i + 1] : null; })();
const DELAY_MS = 220;

// Exceções JUSTIFICADAS: key -> motivo. Hoje vazia — nenhuma key do código
// pode apontar para fora do arquivo próprio. Se um dia precisar (ex.: componente
// de outra lib usado de propósito), registre aqui COM o motivo; entrada sem
// motivo não é aceita.
const EXCEPTIONS = {
  // '<key de 40 hex>': 'motivo',
};

function walk(dir, exts, out) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, name.name);
    if (name.isDirectory()) {
      if (['node_modules', 'instruction-frames', '.checkpoints'].includes(name.name)) continue;
      walk(abs, exts, out);
    } else if (exts.includes(path.extname(name.name))) {
      out.push(abs);
    }
  }
  return out;
}

function collectFiles() {
  const files = [];
  ['code.js'].forEach(f => files.push(path.join(PLUGIN, f)));
  walk(path.join(PLUGIN, 'backend'), ['.js'], files);
  walk(path.join(PLUGIN, 'modules'), ['.js'], files);
  walk(path.join(PLUGIN, 'views'), ['.html'], files);
  // Scripts de refs/ (.cjs) — não os .json de libs nem os arquivos gerados em .js.
  fs.readdirSync(path.join(PLUGIN, 'refs')).forEach(f => {
    if (f.endsWith('.cjs')) files.push(path.join(PLUGIN, 'refs', f));
    // JSONs de a11y que carregam keys: wrappers gerados e o conteúdo curado.
    if (/^design-acessivel-.*-wrapper\.generated\.json$/.test(f) || f === 'design-acessivel-content.json') files.push(path.join(PLUGIN, 'refs', f));
  });
  return files.filter(f => fs.existsSync(f));
}

function collectKeys() {
  const byKey = new Map(); // key -> Set(file:line)
  for (const file of collectFiles()) {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, idx) => {
      const found = line.match(/\b[0-9a-f]{40}\b/g);
      if (!found) return;
      for (const key of found) {
        if (!byKey.has(key)) byKey.set(key, new Set());
        byKey.get(key).add(`${path.relative(ROOT, file).replace(/\\/g, '/')}:${idx + 1}`);
      }
    });
  }
  return byKey;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function resolveKey(key) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`https://api.figma.com/v1/components/${key}`, { headers: { 'X-Figma-Token': TOKEN } });
    if (res.ok) {
      const body = await res.json();
      const m = body && body.meta ? body.meta : {};
      return { ok: true, fileKey: m.file_key || null, name: m.name || null, nodeId: m.node_id || null, set: (m.containing_frame && m.containing_frame.containingStateGroup && m.containing_frame.containingStateGroup.name) || null };
    }
    if (res.status === 429 || res.status >= 500) { await sleep(1500 * (attempt + 1)); continue; }
    return { ok: false, status: res.status };
  }
  return { ok: false, status: 'retry-esgotado' };
}

async function main() {
  const byKey = collectKeys();
  console.log(`Literais de 40 hex encontrados no código: ${byKey.size} keys únicas`);

  if (!TOKEN) {
    console.warn('⚠  FIGMA_TOKEN ausente — auditoria de keys NÃO executada (o token é só de manutenção/CI).');
    process.exit(0);
  }

  const rows = [];
  for (const [key, locs] of byKey) {
    const r = await resolveKey(key);
    rows.push({ key, locations: [...locs], ...r });
    await sleep(DELAY_MS);
  }

  const byFile = {};
  rows.forEach(r => {
    const k = r.ok ? r.fileKey : `NAO_RESOLVEU(${r.status})`;
    byFile[k] = (byFile[k] || 0) + 1;
  });
  console.log('Contagem por file_key:');
  Object.entries(byFile).forEach(([k, n]) => console.log(`  ${k}${k === EXPECTED_FILE_KEY ? '  (arquivo próprio — esperado)' : ''}: ${n}`));

  const bad = rows.filter(r => (!r.ok || r.fileKey !== EXPECTED_FILE_KEY) && !EXCEPTIONS[r.key]);
  const excepted = rows.filter(r => (!r.ok || r.fileKey !== EXPECTED_FILE_KEY) && EXCEPTIONS[r.key]);
  excepted.forEach(r => console.log(`  exceção justificada: ${r.key.slice(0, 10)}… — ${EXCEPTIONS[r.key]}`));

  if (bad.length) {
    console.error(`\n✗ ${bad.length} key(s) FORA do arquivo próprio ${EXPECTED_FILE_KEY}:`);
    bad.forEach(r => console.error(`  ${r.key}  ${r.ok ? `file_key=${r.fileKey} (${r.name})` : `não resolveu (${r.status})`}\n    em: ${r.locations.join(', ')}`));
  } else {
    console.log(`\n✓ Todas as ${rows.length} keys resolvem para ${EXPECTED_FILE_KEY}.`);
  }

  if (JSON_OUT) {
    fs.writeFileSync(path.resolve(ROOT, JSON_OUT), JSON.stringify({ generatedAt: new Date().toISOString(), expectedFileKey: EXPECTED_FILE_KEY, total: rows.length, byFileKey: byFile, desvios: bad, excecoes: excepted, keys: rows }, null, 2), 'utf8');
    console.log(`Relatório: ${JSON_OUT}`);
  }

  if (STRICT && bad.length) process.exit(1);
}

main().catch(e => { console.error('Falha na auditoria:', e.message); process.exit(STRICT ? 1 : 0); });
