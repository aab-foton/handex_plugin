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
];

const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, '..', 'src', 'plugin', 'code.js');
const src = fs.readFileSync(target, 'utf8');
const lines = src.split('\n');

let found = 0;
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

if (found > 0) {
  console.error(`\n${found} uso(s) de API sincrona do Figma bloqueada sob documentAccess: "dynamic-page" encontrados em code.js.`);
  console.error('Essas chamadas nao dao erro de compilacao, so quebram em runtime dentro do Figma -- ja causaram um incidente de producao real (21/07/2026).');
  process.exit(1);
} else {
  console.log('check-figma-api-usage: nenhuma API sincrona restrita encontrada em code.js.');
}
