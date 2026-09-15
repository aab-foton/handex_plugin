// Varre src/plugin/code.js por chamadas sincronas de API do Figma que sao
// bloqueadas sob documentAccess: "dynamic-page" (exigido pelo manifest para
// publicacao). O tsc --noEmit nao pega isso -- e restricao de runtime do
// Figma, a API sincrona continua existindo nos typings. Ver docs/architecture-state.md
// secao 8 para o incidente que motivou este check (21/07/2026).
//
// Lista de APIs conhecidas como restritas sob dynamic-page. Atualizar aqui
// sempre que o Figma documentar uma nova.
const FORBIDDEN = [
  { pattern: /figma\.getNodeById\(/g, fix: 'figma.getNodeByIdAsync(...)' },
  { pattern: /figma\.getStyleById\(/g, fix: 'figma.getStyleByIdAsync(...)' },
  { pattern: /figma\.variables\.getVariableById\(/g, fix: 'figma.variables.getVariableByIdAsync(...)' },
  { pattern: /figma\.variables\.getVariableCollectionById\(/g, fix: 'figma.variables.getVariableCollectionByIdAsync(...)' },
  { pattern: /\.mainComponent\b(?!Async)/g, fix: 'await node.getMainComponentAsync()' },
  // Sob dynamic-page, figma.currentPage e READ-ONLY (ver typings
  // plugin-api.d.ts: "If the manifest contains documentAccess: dynamic-page,
  // this property is read-only"). O (?!=) e obrigatorio: sem ele o regex
  // casaria com `=== figma.currentPage` / `== figma.currentPage`, que sao
  // comparacoes legitimas e existem hoje (ex: code.js, _nodeOnCurrentPage).
  { pattern: /figma\.currentPage\s*=(?!=)/g, fix: 'await figma.setCurrentPageAsync(page)' },
];

const fs = require('fs');
const path = require('path');

// Todo arquivo que roda no SANDBOX do Figma (main thread) precisa ser varrido.
// Ate 2026-09-15 so code.js era verificado -- mas backend/onmessage.js (o
// dispatcher inteiro) e backend/dsc-matching.js foram EXTRAIDOS de code.js
// (commits 510dc6a e 80073b1) e sairam silenciosamente da cobertura. Uma
// chamada sincrona nova nesses dois passaria batido, que e exatamente a
// classe de erro que este script existe pra pegar. Modulos de src/plugin/
// modules/ NAO entram aqui: rodam no iframe (UI), onde a API figma.* nem
// existe.
const targets = [
  path.join(__dirname, '..', 'src', 'plugin', 'code.js'),
  path.join(__dirname, '..', 'src', 'plugin', 'backend', 'onmessage.js'),
  path.join(__dirname, '..', 'src', 'plugin', 'backend', 'dsc-matching.js'),
];

let found = 0;
for (const target of targets) {
  if (!fs.existsSync(target)) {
    console.error(`  aviso: ${path.relative(process.cwd(), target)} nao encontrado -- alvo do linter desatualizado?\n`);
    continue;
  }
  const lines = fs.readFileSync(target, 'utf8').split('\n');
  for (const { pattern, fix } of FORBIDDEN) {
    lines.forEach((line, i) => {
      if (pattern.test(line)) {
        found++;
        console.error(`  ${path.relative(process.cwd(), target)}:${i + 1}  ${line.trim()}`);
        console.error(`    -> use ${fix} em vez disso\n`);
      }
      pattern.lastIndex = 0;
    });
  }
}

if (found > 0) {
  console.error(`\n${found} uso(s) de API sincrona do Figma bloqueada sob documentAccess: "dynamic-page" encontrados.`);
  console.error('Essas chamadas nao dao erro de compilacao, so quebram em runtime dentro do Figma -- ja causaram um incidente de producao real (21/07/2026).');
  process.exit(1);
} else {
  console.log(`check-figma-api-usage: nenhuma API sincrona restrita encontrada (${targets.length} arquivos do sandbox verificados).`);
}
