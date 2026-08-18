// ============================================================
// ai/maturity-checklist.js — Avaliação do checklist balizador
// de maturidade (PRISMA)
// ============================================================
//
// O QUE É: uma lista explícita e configurável de critérios por
// dimensão (ver refs/maturity-checklist.json), pensada para ser
// a definição de "o que é um projeto maduro" trazida pelos UX
// Leads da CAIXA — não uma opinião embutida no código.
//
// COMO EDITAR OS CRITÉRIOS: mude refs/maturity-checklist.json
// (labels, pesos, itens) e rode `npm run build`. Nenhuma mudança
// de código é necessária para recalibrar o que conta como maduro.
//
// Este arquivo só interpreta os `check.type` declarados no JSON.
// Enquanto o Foundry real não existe, essa nota de checklist é o
// que alimenta o mock (ver foundry-client.js) — quando o Foundry
// real chegar, ela deveria virar um dos inputs do prompt do
// agente, não ser substituída por ele (ver decisão já registrada
// na proposta de qualidade de evidência).

const checklist = require('../refs/maturity-checklist.json');

function _artefatos(payload, dimensao) {
  const etapa = payload?.evidencias?.[dimensao];
  return Array.isArray(etapa?.artefatos) ? etapa.artefatos : [];
}

function _campoPreenchido(artefato, campo) {
  const v = artefato?.metadados?.[campo];
  return v !== undefined && v !== null && String(v).trim() !== '';
}

// Cada check.type é avaliado por artefato quando fizer sentido
// (o item passa se QUALQUER artefato da etapa satisfizer), ou uma
// vez por dimensão para os checks de nível de etapa/status.
const CHECKS = {
  artefato_presente: (payload, dimensao) => _artefatos(payload, dimensao).length > 0,

  artefato_count_min: (payload, dimensao, check) => _artefatos(payload, dimensao).length >= check.min,

  artefato_campo_preenchido: (payload, dimensao, check) =>
    _artefatos(payload, dimensao).some(a => _campoPreenchido(a, check.campo)),

  artefato_campo_igual: (payload, dimensao, check) =>
    _artefatos(payload, dimensao).some(a => String(a?.metadados?.[check.campo] || '') === check.valor),

  artefato_campo_min: (payload, dimensao, check) =>
    _artefatos(payload, dimensao).some(a => Number(a?.metadados?.[check.campo]) >= check.min),

  artefato_tipo_em: (payload, dimensao, check) =>
    _artefatos(payload, dimensao).some(a => (check.valores || []).includes(a?.tipo)),

  status_nao_pendente: (payload, dimensao) => {
    const status = payload?.auditoria?.[dimensao]?.status;
    return !!status && status !== 'pendente';
  },

  status_conforme: (payload, dimensao) => payload?.auditoria?.[dimensao]?.status === 'conforme',

  auditoria_observacoes_preenchidas: (payload, dimensao) =>
    !!String(payload?.auditoria?.[dimensao]?.observacoes || '').trim()
};

// Avalia uma dimensão contra seu checklist configurado.
// Retorna { score: 0–1, items: [{ id, label, weight, passed }] }
function evaluateDimension(payload, dimensao) {
  const def = checklist.dimensions[dimensao];
  if (!def || !Array.isArray(def.items) || def.items.length === 0) {
    return { score: 0, items: [] };
  }

  const items = def.items.map(item => {
    const fn = CHECKS[item.check?.type];
    const passed = typeof fn === 'function' ? !!fn(payload, dimensao, item.check) : false;
    return { id: item.id, label: item.label, weight: item.weight, passed };
  });

  const totalWeight = items.reduce((sum, i) => sum + i.weight, 0) || 1;
  const score = items.reduce((sum, i) => sum + (i.passed ? i.weight : 0), 0) / totalWeight;

  return { score, items };
}

function evaluateAll(payload, dimensions) {
  const result = {};
  for (const dimensao of dimensions) {
    result[dimensao] = evaluateDimension(payload, dimensao);
  }
  return result;
}

function getChecklistDefinition() {
  return checklist;
}

module.exports = { evaluateDimension, evaluateAll, getChecklistDefinition };
