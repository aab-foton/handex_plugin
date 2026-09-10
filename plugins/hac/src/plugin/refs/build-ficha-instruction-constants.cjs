// ============================================================
// HAC — build-ficha-instruction-constants.cjs
//
// Codegen que expõe pro FRONTEND (ui.html) o mesmo conteúdo rico já
// consumido pelo BACKEND (code.js, via `import FICHA_INSTRUCTION_CONTENT
// from './refs/ficha-instruction-content.json'`).
//
// O import estático de JSON funciona só em code.js (empacotado via esbuild
// — ver scripts/bundle-code.cjs). O bundle de UI (ui.html) não passa por
// esbuild: build.cjs só concatena arquivos-texto crus dentro de um único
// <script> não-module (ver comentário equivalente em
// build-a11y-constants.cjs, MOBILE_WRAPPER_OUT). Por isso este script
// gera um `.generated.js` com o conteúdo já embutido como literal JS —
// mesmo padrão de refs/_a11y-constants.generated.js.
//
// Consumido por src/plugin/modules/onboarding.js como
// `FICHA_INSTRUCTION_CONTENT_UI.tabulacao` / `.swipe` / `.leitorTela`, pra
// enriquecer os passos do onboarding com o conteúdo real do template
// oficial de Handoff (título, texto explicativo, passos numerados, seção
// de Assets), em vez de duplicar esse texto à mão em dois lugares.
//
// Uso:
//   node src/plugin/refs/build-ficha-instruction-constants.cjs
// Ou via:
//   npm run refs:ficha-instruction
// ============================================================

const fs = require('fs');
const path = require('path');

const REFS_DIR = __dirname;
const SRC = path.join(REFS_DIR, 'ficha-instruction-content.json');
const OUT = path.join(REFS_DIR, '_ficha-instruction-content.generated.js');

if (!fs.existsSync(SRC)) {
  console.warn(`⚠  missing ficha-instruction-content.json: ${SRC} — _ficha-instruction-content.generated.js ficará com conteúdo vazio`);
}

const content = fs.existsSync(SRC)
  ? JSON.parse(fs.readFileSync(SRC, 'utf8'))
  : { tabulacao: {}, swipe: {}, leitorTela: {} };

// _meta não interessa ao frontend (instruções pro agente que preencheu o
// JSON, sourceFigmaFile etc.) — expõe só os 3 blocos de conteúdo.
const uiContent = {
  tabulacao: content.tabulacao || {},
  swipe: content.swipe || {},
  leitorTela: content.leitorTela || {},
};

const header = `// ============================================================
// GERADO AUTOMATICAMENTE por build-ficha-instruction-constants.cjs — não editar à mão.
// Fonte: refs/ficha-instruction-content.json
// Regenerar via: node src/plugin/refs/build-ficha-instruction-constants.cjs
//            ou: npm run refs:ficha-instruction
//
// Gerado em: ${new Date().toISOString()}
//
// Consumido por src/plugin/modules/onboarding.js como
// FICHA_INSTRUCTION_CONTENT_UI.tabulacao/.swipe/.leitorTela — mesmo
// conteúdo rico usado pelo backend (code.js) na coluna de legenda da Ficha
// (ver _buildFichaLegendColumn). Concatenado por build.cjs no bundle final
// (ui.html) ANTES de accessibility.js/onboarding.js.
// ============================================================

`;

const body = `const FICHA_INSTRUCTION_CONTENT_UI = ${JSON.stringify(uiContent, null, 2)};\n`;

fs.writeFileSync(OUT, header + body, 'utf8');

console.log('✅ _ficha-instruction-content.generated.js');
console.log(`   tabulacao: ${uiContent.tabulacao.title ? 'preenchido' : 'vazio'}`);
console.log(`   swipe: ${uiContent.swipe.title ? 'preenchido' : 'vazio'}`);
console.log(`   leitorTela: ${uiContent.leitorTela.title ? 'preenchido' : 'vazio'}`);
