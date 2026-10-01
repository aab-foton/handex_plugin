// ============================================================
// HAC — web-recognition.cjs
//
// Regra única de RECONHECIMENTO web (componente DSC escaneado -> opção da
// base "Componente" do arquivo próprio), compartilhada pelos scripts de refs
// (build-a11y-constants.cjs, report-web-recognition.cjs). Cópias idênticas da
// função de normalização vivem em backend/platform-profiles.js (ESM, backend)
// e modules/accessibility.js (frontend, script concatenado) — não há como um
// único arquivo servir aos 3 sistemas de módulo; qualquer mudança aqui PRECISA
// ser replicada nos outros dois (os comentários apontam uns para os outros).
//
// Regra de produto (2026-10-01): "O plugin não inventa nada, só consulta e
// resgata". Portanto o reconhecimento web é:
//   1. casamento EXATO sobre o nome normalizado (minúsculas, sem acento,
//      apenas [a-z0-9], sem o prefixo "[dsc...]"); ou
//   2. alias explícito em refs/web-component-aliases.json (curado por humano).
// NUNCA aproximação por substring/tokens — isso é palpite. (O mobile mantém a
// sugestão aproximada que já tinha; a regra acima vale só para a web.)
// ============================================================

const fs = require('fs');
const path = require('path');

const WEB_ALIASES_PATH = path.join(__dirname, 'web-component-aliases.json');

function normalizeRecognitionName(name) {
  return String(name || '')
    .replace(/^\[dsc[^\]]*\]\s*/i, '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

// aliases brutos { nomeEscaneado: opcaoDaBase } -> { normalizado: opcaoDaBase },
// mantendo só os que apontam para uma opção REAL da base (os demais são
// devolvidos em `rejected` para o chamador avisar).
function loadWebAliases(options) {
  let raw = null;
  try { raw = JSON.parse(fs.readFileSync(WEB_ALIASES_PATH, 'utf8')); } catch (e) { raw = null; }
  const aliases = (raw && raw.aliases) || {};
  const accepted = {};
  const rejected = [];
  for (const [scanned, target] of Object.entries(aliases)) {
    if (!options.includes(target)) { rejected.push({ scanned, target }); continue; }
    accepted[normalizeRecognitionName(scanned)] = target;
  }
  return { accepted, rejected };
}

// Resolve UM nome escaneado: { option, via: 'exact' | 'alias' } ou null.
function resolveWebRecognition(scannedName, options, aliasesNormalized) {
  const n = normalizeRecognitionName(scannedName);
  if (!n) return null;
  const exact = options.find(o => normalizeRecognitionName(o) === n);
  if (exact) return { option: exact, via: 'exact' };
  if (aliasesNormalized && aliasesNormalized[n]) return { option: aliasesNormalized[n], via: 'alias' };
  return null;
}

module.exports = { normalizeRecognitionName, loadWebAliases, resolveWebRecognition };
