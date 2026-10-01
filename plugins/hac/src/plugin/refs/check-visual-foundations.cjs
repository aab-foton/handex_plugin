#!/usr/bin/env node
// ============================================================
// HAC — check-visual-foundations.cjs
//
// Verificador de desvio entre a interface do plugin e a lib
// "DSC | Fundamentos Visuais" (fileKey nbv8CUA2nbukjSkhK44kgQ, v2.6.0).
//
// NÃO faz fetch: lê refs/fundamentos-visuais.json (já gerado por
// fetch-design-refs.cjs — Regra 0, não duplicar o pipeline). Sem token,
// sem rede; seguro para rodar em qualquer ambiente.
//
// Confere:
//   (b) tokens `dsc-*` de espaçamento e raio do tailwind.config.cjs
//       batem com spacing/* e border/radius/* da lib;
//   (c) paletas de cor sobrescritas no config só usam hex que existem na lib;
//   (d) views/*.html, modules/*.js e styles/plugin.css: hex literal fora da
//       lib, classes de paleta padrão do Tailwind NÃO sobrescritas, e
//       tamanhos de texto fora da escala font/size/* da lib.
//
// Saída informativa, código 0. Com --strict: código 2 se houver desvio
// fora das exceções documentadas abaixo (uso previsto: CI, futuramente —
// este script NÃO está ligado a nenhum workflow, mudança de CI exige
// confirmação do usuário).
//
// Decisão do usuário (2026-09-30): onde a lib de Fundamentos e as libs do
// produto (Super DSC Web/Super App) divergem, vale o produto. Por isso
// este script NÃO verifica sombras (boxShadow), pesos de fonte,
// letterSpacing/lineHeight dos tokens dsc-label-*/dsc-body-*, nem
// larguras de borda.
// ============================================================

'use strict';

const fs = require('fs');
const path = require('path');

const STRICT = process.argv.includes('--strict');
const PLUGIN_DIR = path.join(__dirname, '..');
const LIB_JSON = path.join(__dirname, 'fundamentos-visuais.json');
const CONFIG = path.join(PLUGIN_DIR, 'styles', 'tailwind.config.cjs');

// ------------------------------------------------------------
// EXCEÇÕES DOCUMENTADAS (cada uma com motivo)
// ------------------------------------------------------------

// Hex fora da lib que continuam permitidos em qualquer arquivo escaneado.
const EXCECOES_HEX = {
  '#0f172a': 'tema escuro — token dark-bg (tailwind.config.cjs), não é do DSC',
  '#1e293b': 'tema escuro — token dark-surface (tailwind.config.cjs), não é do DSC',
  '#334155': 'tema escuro — token dark-line (tailwind.config.cjs), não é do DSC',
  '#f1f5f9': 'tema escuro — token dark-text (tailwind.config.cjs), não é do DSC',
  '#b4c6d8': 'tema escuro — token dark-muted (tailwind.config.cjs), não é do DSC',
  '#e0f5fa': 'fallback de fill de categoria a11y (mesmo sistema de cor de A11Y_CATEGORIES, também usado no canvas)',
  '#ebf4fb': 'fallback de fill de categoria a11y (mesmo sistema de cor de A11Y_CATEGORIES, também usado no canvas)',
};

// Chaves de tailwind.config.cjs > theme.extend.colors que NÃO são paleta DSC.
const EXCECOES_PALETAS_CONFIG = {
  light: 'tokens de tema claro próprios do hac (não-DSC); hoje sem uso nas telas',
  dark: 'tokens de tema escuro próprios do hac (não-DSC) — exceção documentada',
};

// Tokens do config sem correspondente na lib.
const EXCECOES_TOKENS_CONFIG = {
  'borderRadius.dsc-circ': 'círculo perfeito (9999px) — a lib só tem pill (1000px)',
};

// Arquivos com blocos de cor que NÃO se escaneiam como hex de UI.
// A11Y_CATEGORIES: cores semânticas da vertical de a11y, também usadas no
// canvas (Regra de ouro 2) — lidas do próprio arquivo, sem lista à mão.
const ARQ_CATEGORIAS = path.join(PLUGIN_DIR, 'modules', 'accessibility.js');

// Paletas padrão do Tailwind (nomes de classe).
const PALETAS_TAILWIND = [
  'slate', 'gray', 'zinc', 'neutral', 'stone', 'red', 'orange', 'amber',
  'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue',
  'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
];

// ------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------

const lib = JSON.parse(fs.readFileSync(LIB_JSON, 'utf8'));
const variaveis = (lib.designTokens && lib.designTokens.variables) || [];

const normHex = (h) => {
  h = h.toLowerCase();
  if (h.length === 4) h = '#' + [...h.slice(1)].map((c) => c + c).join('');
  return h.slice(0, 7);
};

const hexDaLib = new Set(
  variaveis
    .filter((v) => v.resolvedType === 'COLOR' && typeof v.value === 'string' && /^#[0-9a-f]{6}/i.test(v.value))
    .map((v) => normHex(v.value))
);
hexDaLib.add('#ffffff'); // branco (color/bg/neutral/1)
hexDaLib.add('#000000');

const numDaLib = (prefixo) => {
  const out = {};
  for (const v of variaveis) {
    if (v.name.startsWith(prefixo) && typeof v.value === 'number') out[v.name.slice(prefixo.length)] = v.value;
  }
  return out;
};
const espacamentoLib = numDaLib('spacing/');
const raioLib = numDaLib('border/radius/');
const tamanhosFonteLib = new Set(Object.values(numDaLib('font/size/')));

const desvios = [];
const info = [];
const addDesvio = (secao, msg) => desvios.push({ secao, msg });

// ------------------------------------------------------------
// (b) espaçamento e raio
// ------------------------------------------------------------
const config = require(CONFIG);
const ext = (config.theme && config.theme.extend) || {};

function conferirEscala(nome, escalaLib, escalaConfig) {
  escalaConfig = escalaConfig || {};
  for (const [nomeLib, valor] of Object.entries(escalaLib)) {
    const chave = 'dsc-' + nomeLib;
    const esperado = valor + 'px';
    if (!(chave in escalaConfig)) {
      addDesvio('b', `${nome}: falta "${chave}" (lib: ${esperado})`);
    } else if (escalaConfig[chave] !== esperado) {
      addDesvio('b', `${nome}.${chave} = ${escalaConfig[chave]} no config, lib = ${esperado}`);
    }
  }
  for (const chave of Object.keys(escalaConfig)) {
    if (!chave.startsWith('dsc-')) continue;
    if (!(chave.slice(4) in escalaLib) && !EXCECOES_TOKENS_CONFIG[nome + '.' + chave]) {
      addDesvio('b', `${nome}.${chave} não existe na lib e não está nas exceções`);
    }
  }
}
conferirEscala('spacing', espacamentoLib, ext.spacing);
conferirEscala('borderRadius', raioLib, ext.borderRadius);

// ------------------------------------------------------------
// (c) paletas sobrescritas só usam hex da lib
// ------------------------------------------------------------
const paletasSobrescritas = Object.keys(ext.colors || {});
for (const [nome, escala] of Object.entries(ext.colors || {})) {
  if (EXCECOES_PALETAS_CONFIG[nome]) continue;
  const folhas = typeof escala === 'string' ? { DEFAULT: escala } : escala;
  for (const [passo, hex] of Object.entries(folhas)) {
    if (!/^#[0-9a-f]{3,8}$/i.test(hex)) continue;
    if (!hexDaLib.has(normHex(hex))) addDesvio('c', `paleta "${nome}" passo ${passo}: ${hex} não existe na lib`);
  }
}

// ------------------------------------------------------------
// (d) varredura das telas
// ------------------------------------------------------------
function listar(dir, ext_) {
  const d = path.join(PLUGIN_DIR, dir);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d)
    .filter((f) => f.endsWith(ext_) && !/\.generated\./.test(f))
    .map((f) => path.join(d, f));
}
const arquivos = [
  ...listar('views', '.html'),
  ...listar('modules', '.js'),
  path.join(PLUGIN_DIR, 'styles', 'plugin.css'),
];

// Hex das categorias a11y (lido do próprio bloco A11Y_CATEGORIES).
const hexCategorias = new Set();
try {
  const src = fs.readFileSync(ARQ_CATEGORIAS, 'utf8');
  // Os dois blocos de cor de categoria: as VIGENTES e as LEGADAS (só exibição,
  // ex.: "informacoes", removida em 2026-10-01 mas ainda presente em dados salvos).
  for (const marcador of ['const A11Y_CATEGORIES = {', 'const A11Y_LEGACY_CATEGORIES = {']) {
    const ini = src.indexOf(marcador);
    if (ini < 0) continue;
    const fim = src.indexOf('\n};', ini);
    for (const m of src.slice(ini, fim).matchAll(/#[0-9a-fA-F]{6}\b/g)) hexCategorias.add(normHex(m[0]));
  }
} catch (e) { /* sem accessibility.js: sem exceção de categorias */ }

function semComentarios(texto, arq) {
  let t = texto.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  if (arq.endsWith('.html') || arq.endsWith('.js')) {
    t = t.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
  }
  if (arq.endsWith('.js')) {
    t = t.replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
  }
  return t;
}

const hexFora = {};
const usoPaletaSobrescrita = {};
const paletaNaoSobrescrita = {};
const tamanhosFora = {};
const excecoesVistas = {};

const reHex = /#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;
const rePaleta = new RegExp(
  '\\b(?:[a-z-]+:)*(?:bg|text|border(?:-[trblxy])?|ring|divide|fill|stroke|from|to|via|placeholder|outline|accent|caret|shadow|decoration)-(' +
    PALETAS_TAILWIND.join('|') + ')-(\\d{2,3})(?:/\\d+)?', 'g');
const reTamanho = /text-\[(\d+(?:\.\d+)?)px\]/g;
const reFontSizeCss = /font-size:\s*(\d+(?:\.\d+)?)px/g;

for (const arq of arquivos) {
  const rel = path.relative(PLUGIN_DIR, arq).replace(/\\/g, '/');
  const texto = semComentarios(fs.readFileSync(arq, 'utf8'), arq);
  const linhas = texto.split('\n');
  linhas.forEach((linha, i) => {
    const loc = `${rel}:${i + 1}`;
    for (const m of linha.matchAll(reHex)) {
      const h = normHex(m[0]);
      if (hexDaLib.has(h)) continue;
      if (EXCECOES_HEX[h]) { excecoesVistas[h] = (excecoesVistas[h] || 0) + 1; continue; }
      if (hexCategorias.has(h)) { excecoesVistas[h + ' (categoria a11y)'] = (excecoesVistas[h + ' (categoria a11y)'] || 0) + 1; continue; }
      (hexFora[h] = hexFora[h] || []).push(loc);
    }
    for (const m of linha.matchAll(rePaleta)) {
      const pal = m[1];
      if (paletasSobrescritas.includes(pal)) {
        usoPaletaSobrescrita[pal] = (usoPaletaSobrescrita[pal] || 0) + 1;
      } else {
        (paletaNaoSobrescrita[pal] = paletaNaoSobrescrita[pal] || []).push(loc);
      }
    }
    for (const re of [reTamanho, reFontSizeCss]) {
      for (const m of linha.matchAll(re)) {
        const px = parseFloat(m[1]);
        if (!tamanhosFonteLib.has(px)) (tamanhosFora[px + 'px'] = tamanhosFora[px + 'px'] || []).push(loc);
      }
    }
  });
}

for (const [h, locs] of Object.entries(hexFora)) addDesvio('d', `hex fora da lib ${h} (${locs.length}x): ${locs.slice(0, 4).join(', ')}${locs.length > 4 ? ', …' : ''}`);
for (const [p, locs] of Object.entries(paletaNaoSobrescrita)) addDesvio('d', `paleta padrão do Tailwind "${p}" sem override no config (${locs.length}x): ${locs.slice(0, 4).join(', ')}${locs.length > 4 ? ', …' : ''}`);
for (const [t, locs] of Object.entries(tamanhosFora)) addDesvio('d', `tamanho de texto ${t} fora da escala da lib (${locs.length}x): ${locs.slice(0, 4).join(', ')}${locs.length > 4 ? ', …' : ''}`);

// ------------------------------------------------------------
// Saída
// ------------------------------------------------------------
const versao = (lib.meta && lib.meta.exportedAt) ? 'exportada em ' + lib.meta.exportedAt : '?';
console.log(`check:visual — Fundamentos Visuais (${versao}); ${hexDaLib.size} hex, ${Object.keys(espacamentoLib).length} espaçamentos, ${Object.keys(raioLib).length} raios, ${tamanhosFonteLib.size} tamanhos de fonte.`);
console.log(`Arquivos escaneados: ${arquivos.length}`);

const totalSobrescrito = Object.values(usoPaletaSobrescrita).reduce((a, b) => a + b, 0);
console.log(`\nClasses de paleta sobrescritas no config (renderizam valores da lib): ${totalSobrescrito}`);
for (const [p, n] of Object.entries(usoPaletaSobrescrita).sort((a, b) => b[1] - a[1])) console.log(`  ${p}: ${n}`);

if (Object.keys(excecoesVistas).length) {
  console.log('\nExceções documentadas encontradas (não contam como desvio):');
  for (const [h, n] of Object.entries(excecoesVistas)) {
    const base = h.split(' ')[0];
    console.log(`  ${h}: ${n}x — ${EXCECOES_HEX[base] || 'cor de categoria a11y (A11Y_CATEGORIES; Regra de ouro 2)'}`);
  }
}
console.log('\nExceções de config: ' + Object.entries({ ...EXCECOES_PALETAS_CONFIG, ...EXCECOES_TOKENS_CONFIG }).map(([k, v]) => `${k} (${v})`).join('; '));

if (!desvios.length) {
  console.log('\nSem desvios fora das exceções.');
} else {
  console.log(`\nDesvios fora das exceções: ${desvios.length}`);
  for (const d of desvios) console.log(`  [${d.secao}] ${d.msg}`);
}

if (STRICT && desvios.length) process.exit(2);
process.exit(0);
