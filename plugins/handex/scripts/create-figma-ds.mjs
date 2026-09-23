/**
 * create-figma-ds.mjs
 * Cria o Design System do Handex no arquivo Figma via REST API.
 * Suporta fallback inteligente se o arquivo Figma for de plano Starter/Draft
 * (que limita a apenas 1 modo de variável).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ───────────────────────────────────────────────────────────────────
function loadEnvToken() {
  try {
    const envPath = path.join(__dirname, '..', '.env');
    const content = fs.readFileSync(envPath, 'utf-8');
    const match = content.match(/FIGMA_WRITE_TOKEN=(.+)/) || content.match(/FIGMA_TOKEN=(.+)/);
    return match ? match[1].trim() : '';
  } catch {
    return '';
  }
}

const TOKEN = process.env.FIGMA_TOKEN || loadEnvToken();
const FILE_KEY = '6Ds31a69yTL8CA7XDv6tBi';
const BASE_URL = 'https://api.figma.com/v1';

if (!TOKEN) {
  console.error('FIGMA_TOKEN nao encontrado. Verifique o arquivo .env');
  process.exit(1);
}

// ── Helpers ──────────────────────────────────────────────────────────────────
async function figmaGet(endpoint) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: { 'X-Figma-Token': TOKEN },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GET ${endpoint} -> ${res.status}: ${body}`);
  }
  return res.json();
}

async function figmaPost(endpoint, body) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'X-Figma-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`POST ${endpoint} -> ${res.status}: ${txt}`);
  }
  return res.json();
}

function hexToRgb(h, a = 1) {
  const r = parseInt(h.slice(1, 3), 16) / 255;
  const g = parseInt(h.slice(3, 5), 16) / 255;
  const b = parseInt(h.slice(5, 7), 16) / 255;
  return { r, g, b, a };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Tokens ───────────────────────────────────────────────────────────────────
const BRAND_COLORS = {
  'blue/500':   { light: '#005ca9', dark: '#4d9fde' },
  'blue/600':   { light: '#004d8d', dark: '#6db3e8' },
  'blue/700':   { light: '#004075', dark: '#8ac6f0' },
  'orange/500': { light: '#f39200', dark: '#f5b84d' },
  'green/500':  { light: '#22c55e', dark: '#4ade80' },
};

const SURFACE_COLORS = {
  'bg':      { light: '#eef2f7', dark: '#0f172a' },
  'surface': { light: '#ffffff', dark: '#1e293b' },
  'line':    { light: '#dde3ec', dark: '#334155' },
  'muted':   { light: '#8394a8', dark: '#b4c6d8' },
  'text':    { light: '#1e293b', dark: '#f1f5f9' },
};

const SPEC_COLORS = {
  'info/bg':          { light: '#f1f5f9', dark: '#1e293b' },
  'info/fg':          { light: '#475569', dark: '#94a3b8' },
  'comportamento/bg': { light: '#fdf2f8', dark: '#4a1942' },
  'comportamento/fg': { light: '#be185d', dark: '#f0abcb' },
  'regra/bg':         { light: '#eff6ff', dark: '#1e3a5f' },
  'regra/fg':         { light: '#1d4ed8', dark: '#93c5fd' },
  'api/bg':           { light: '#f0fdf4', dark: '#14532d' },
  'api/fg':           { light: '#15803d', dark: '#86efac' },
};

const SPACES = { '150': 6, '200': 8, '250': 10, '300': 12, '350': 14, '400': 16, '600': 24 };
const RADII  = { 'xl': 16, 'full': 999 };
const TYPES  = { '3xs': 9, '2xs': 10, 'xs': 11, 'sm': 12, 'md': 14, 'lg': 16, 'xl': 18 };

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Design System Handex -> Figma ===');
  console.log('Arquivo: ' + FILE_KEY);

  // 1. Verificar/Obter o arquivo
  const file = await figmaGet(`/files/${FILE_KEY}?depth=1`);
  console.log('Arquivo carregado: ' + file.name);

  // 2. Limpar coleções existentes para evitar duplicados ou conflitos
  console.log('\n1. Limpando colecoes antigas...');
  let localVars = await figmaGet(`/files/${FILE_KEY}/variables/local`);
  const existingCols = Object.values(localVars.meta.variableCollections);
  if (existingCols.length > 0) {
    const deletes = existingCols.map(c => ({ action: 'DELETE', id: c.id }));
    await figmaPost(`/files/${FILE_KEY}/variables`, { variableCollections: deletes });
    console.log(`  Limpas ${existingCols.length} colecoes.`);
    await sleep(1000);
  }

  // 3. Criar as coleções de variáveis
  console.log('\n2. Criando colecoes...');
  const createCollectionsPayload = {
    variableCollections: [
      { action: 'CREATE', id: 'col-brand', name: 'color/brand' },
      { action: 'CREATE', id: 'col-surface', name: 'color/surface' },
      { action: 'CREATE', id: 'col-spec', name: 'color/category-spec' },
      { action: 'CREATE', id: 'col-space', name: 'space' },
      { action: 'CREATE', id: 'col-radius', name: 'radius' },
      { action: 'CREATE', id: 'col-type', name: 'type' }
    ]
  };
  await figmaPost(`/files/${FILE_KEY}/variables`, createCollectionsPayload);
  await sleep(1500);

  // 4. Obter as coleções e seus Mode IDs iniciais
  console.log('\n3. Buscando colecoes criadas...');
  localVars = await figmaGet(`/files/${FILE_KEY}/variables/local`);
  const collections = Object.values(localVars.meta.variableCollections);
  
  const brandCol = collections.find(c => c.name === 'color/brand');
  const surfaceCol = collections.find(c => c.name === 'color/surface');
  const specCol = collections.find(c => c.name === 'color/category-spec');
  const spaceCol = collections.find(c => c.name === 'space');
  const radiusCol = collections.find(c => c.name === 'radius');
  const typeCol = collections.find(c => c.name === 'type');

  // 5. Tentar configurar modos Light e Dark (com ID temporário)
  console.log('\n4. Tentando configurar modos...');
  const updateCollectionsPayload = {
    variableCollections: [
      {
        action: 'UPDATE',
        id: brandCol.id,
        modes: [
          { modeId: brandCol.modes[0].modeId, name: 'Light' },
          { modeId: 'temp-dark-brand', name: 'Dark' }
        ]
      },
      {
        action: 'UPDATE',
        id: surfaceCol.id,
        modes: [
          { modeId: surfaceCol.modes[0].modeId, name: 'Light' },
          { modeId: 'temp-dark-surface', name: 'Dark' }
        ]
      },
      {
        action: 'UPDATE',
        id: specCol.id,
        modes: [
          { modeId: specCol.modes[0].modeId, name: 'Light' },
          { modeId: 'temp-dark-spec', name: 'Dark' }
        ]
      },
      {
        action: 'UPDATE',
        id: spaceCol.id,
        modes: [{ modeId: spaceCol.modes[0].modeId, name: 'Default' }]
      },
      {
        action: 'UPDATE',
        id: radiusCol.id,
        modes: [{ modeId: radiusCol.modes[0].modeId, name: 'Default' }]
      },
      {
        action: 'UPDATE',
        id: typeCol.id,
        modes: [{ modeId: typeCol.modes[0].modeId, name: 'Default' }]
      }
    ]
  };
  
  try {
    await figmaPost(`/files/${FILE_KEY}/variables`, updateCollectionsPayload);
    console.log('  Modos configurados (Figma aceitou requisição).');
  } catch (e) {
    console.log('  ℹ️ Requisicao de modos rejeitada ou falhou. O arquivo pode ser Starter/Draft.');
    console.log('  → Proseguindo com modo unico de fallback (Light).');
  }
  await sleep(1500);

  // 6. Obter novamente os IDs dos modos para mapear o que realmente foi criado
  console.log('\n5. Mapeando modos realmente existentes...');
  localVars = await figmaGet(`/files/${FILE_KEY}/variables/local`);
  const collectionsUpdated = Object.values(localVars.meta.variableCollections);

  const colBrand = collectionsUpdated.find(c => c.name === 'color/brand');
  const colSurface = collectionsUpdated.find(c => c.name === 'color/surface');
  const colSpec = collectionsUpdated.find(c => c.name === 'color/category-spec');
  const colSpace = collectionsUpdated.find(c => c.name === 'space');
  const colRadius = collectionsUpdated.find(c => c.name === 'radius');
  const colType = collectionsUpdated.find(c => c.name === 'type');

  // Mapeamento dinâmico e tolerante dos modos
  function getCollectionModes(col) {
    const lightMode = col.modes.find(m => m.name === 'Light') || col.modes[0];
    const darkMode = col.modes.find(m => m.name === 'Dark');
    return {
      light: lightMode.modeId,
      dark: darkMode ? darkMode.modeId : null
    };
  }

  const brandModes = getCollectionModes(colBrand);
  const surfaceModes = getCollectionModes(colSurface);
  const specModes = getCollectionModes(colSpec);
  const spaceMode = colSpace.modes[0].modeId;
  const radiusMode = colRadius.modes[0].modeId;
  const typeMode = colType.modes[0].modeId;

  console.log(`  color/brand: Light=${brandModes.light}, Dark=${brandModes.dark || 'Nao suportado'}`);
  console.log(`  color/surface: Light=${surfaceModes.light}, Dark=${surfaceModes.dark || 'Nao suportado'}`);
  console.log(`  color/category-spec: Light=${specModes.light}, Dark=${specModes.dark || 'Nao suportado'}`);

  // 7. Criar e preencher as variáveis
  console.log('\n6. Criando e preenchendo as variaveis...');
  const variables = [];
  const variableModeValues = [];

  let varIdx = 0;

  // Helper para adicionar variáveis de cor
  function addColorVars(colorMap, collectionId, modes) {
    for (const [name, val] of Object.entries(colorMap)) {
      const varId = `v-${varIdx++}`;
      variables.push({
        action: 'CREATE',
        id: varId,
        name,
        variableCollectionId: collectionId,
        resolvedType: 'COLOR'
      });
      
      // Sempre preencher o modo Light
      variableModeValues.push({
        variableId: varId,
        modeId: modes.light,
        value: hexToRgb(val.light)
      });

      // Se o modo Dark foi criado de verdade no Figma, preencher ele também
      if (modes.dark) {
        variableModeValues.push({
          variableId: varId,
          modeId: modes.dark,
          value: hexToRgb(val.dark)
        });
      }
    }
  }

  // Helper para adicionar variáveis numéricas
  function addNumVars(numMap, collectionId, modeId) {
    for (const [name, val] of Object.entries(numMap)) {
      const varId = `v-${varIdx++}`;
      variables.push({
        action: 'CREATE',
        id: varId,
        name,
        variableCollectionId: collectionId,
        resolvedType: 'FLOAT'
      });
      variableModeValues.push({
        variableId: varId,
        modeId: modeId,
        value: val
      });
    }
  }

  addColorVars(BRAND_COLORS, colBrand.id, brandModes);
  addColorVars(SURFACE_COLORS, colSurface.id, surfaceModes);
  addColorVars(SPEC_COLORS, colSpec.id, specModes);
  addNumVars(SPACES, colSpace.id, spaceMode);
  addNumVars(RADII, colRadius.id, radiusMode);
  addNumVars(TYPES, colType.id, typeMode);

  const variablesPayload = { variables, variableModeValues };
  await figmaPost(`/files/${FILE_KEY}/variables`, variablesPayload);
  console.log(`  OK - ${variables.length} variaveis criadas e preenchidas!`);

  // 8. Configurar as páginas do arquivo
  console.log('\n7. Configurando paginas...');
  const pageNames = [
    '01 · Fundamentos',
    '02 · Componentes',
    '03 · Padrões',
    '04 · Backlog',
  ];

  // Renomear a primeira página para "Cover"
  const firstPage = file.document.children[0];
  try {
    await figmaPost(`/files/${FILE_KEY}/pages/${firstPage.id}`, { name: 'Cover' });
    console.log('  OK - Renomeada primeira pagina para "Cover"');
  } catch (e) {
    console.warn('  ⚠️ Nao foi possivel renomear a primeira pagina: ' + e.message);
  }

  // Criar as demais páginas
  for (const name of pageNames) {
    await sleep(400);
    try {
      await figmaPost(`/files/${FILE_KEY}/pages`, { name });
      console.log('  OK - Pagina criada: ' + name);
    } catch (e) {
      console.warn('  ⚠️ Nao foi possivel criar pagina "' + name + '": ' + e.message);
    }
  }

  console.log('\n=== CONCLUIDO COM SUCESSO ===');
  console.log('Acesse: https://www.figma.com/design/' + FILE_KEY);
}

main().catch((e) => {
  console.error('\n❌ ERRO:', e.message);
  process.exit(1);
});