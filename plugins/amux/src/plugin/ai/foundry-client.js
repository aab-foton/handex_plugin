// ============================================================
// ai/foundry-client.js — Cliente do orquestrador de IA (AMUX)
// ============================================================
//
// Esta é a camada de integração com o orquestrador de agentes de IA
// (Microsoft Foundry) que a Fóton está desenhando para o AMUX.
// O endpoint real, autenticação e contrato exato do Foundry ainda não
// estão definidos pelo projeto (briefing: "Tempo: A definir") — por
// isso, nesta entrega, `analyzeWithFoundry` é 100% mock.
//
// A assinatura da função e os formatos de payload/resposta abaixo
// já seguem o contrato que o endpoint real precisará respeitar,
// para que plugar o Foundry de verdade seja só trocar o corpo desta
// função — sem redesenhar o restante do plugin.
//
// DIREÇÃO DE PRODUTO (ainda não implementada): o Foundry real deve
// orquestrar agentes especializados chamados PONTUALMENTE por
// dimensão/etapa (um agente de Descoberta, um de Validação, etc.),
// não um único modelo que julga as 7 dimensões de uma vez como este
// mock faz hoje por simplicidade. O checklist já é estruturado por
// dimensão (ver ai/maturity-checklist.js) justamente para servir de
// input a essa futura chamada por agente — mas a divisão em N
// chamadas reais ao Foundry (uma por dimensão) é um redesenho de
// `analyzeWithFoundry` ainda pendente, não algo a assumir hoje.
//
// Payload de entrada esperado:
// {
//   projectId, briefing: {...},
//   evidencias: { descoberta, definicao, ideacao, validacao },
//   auditoria: { designSystem, acessibilidade }
// }
//
// Resposta esperada:
// {
//   status: 'done',
//   fonte: 'mock' | 'foundry',
//   agentResponses: {
//     descoberta:      { nota, comentario },
//     definicao:        { nota, comentario },
//     ideacao:          { nota, comentario },
//     validacao:        { nota, comentario },
//     designSystem:     { nota, comentario },
//     acessibilidade:   { nota, comentario }
//   },
//   scoreBreakdown: { <mesmas chaves>: nota (0–100) },
//   checklistResults: { <mesmas chaves>: [{ id, label, weight, passed }] },
//   score: { numeric: 0–100, stars: 1–5 }
// }

const { evaluateDimension } = require('./maturity-checklist');

const AMUX_AI_DIMENSIONS = [
  'descoberta', 'definicao', 'ideacao', 'validacao', 'posLancamento',
  'designSystem', 'acessibilidade'
];

function _mockAgentResponse(dimensao, qualidade) {
  const ruido = Math.round((Math.random() - 0.5) * 10); // pequena flutuação, não distorce o sinal de completude
  const nota = Math.max(5, Math.min(99, 15 + Math.round(qualidade * 80) + ruido));
  const temEvidencia = qualidade > 0;
  const comentarios = {
    descoberta:     temEvidencia ? 'Evidências de descoberta encontradas; recomenda-se detalhar os métodos usados.' : 'Nenhuma evidência de descoberta anexada até o momento.',
    definicao:      temEvidencia ? 'Briefing e hipóteses documentados de forma consistente.' : 'Definição do problema ainda não está evidenciada.',
    ideacao:        temEvidencia ? 'Processo de ideação registrado, com variação de alternativas.' : 'Sem registro de exploração de alternativas de solução.',
    validacao:      temEvidencia ? 'Há evidências de testes com usuários ou métricas de validação.' : 'Ainda não há evidências de validação com usuários.',
    posLancamento:  temEvidencia ? 'Acompanhamento pós-lançamento registrado, com métricas ou iteração documentada.' : 'Nenhuma evidência de acompanhamento pós-lançamento até o momento.',
    designSystem:   temEvidencia ? 'Uso do Design System CAIXA declarado, sujeito a checagem automatizada futura.' : 'Aderência ao Design System não avaliada.',
    acessibilidade: temEvidencia ? 'Diretrizes de acessibilidade observadas conforme declaração do time.' : 'Conformidade com WCAG não avaliada.'
  };
  return { nota, comentario: comentarios[dimensao] || '' };
}

function _starsFromScore(numeric) {
  if (numeric >= 90) return 5;
  if (numeric >= 70) return 4;
  if (numeric >= 50) return 3;
  if (numeric >= 30) return 2;
  return 1;
}

// analyzeWithFoundry(payload) → Promise<resultado>
// Mock: simula latência de rede/processamento e retorna notas plausíveis
// com base no checklist balizador de maturidade (ver
// refs/maturity-checklist.json e ai/maturity-checklist.js) — não mais
// presença/ausência simples, e sim critérios objetivos e configuráveis
// pelos UX Leads, sem exigir mudança de código.
async function analyzeWithFoundry(payload) {
  await new Promise((resolve) => setTimeout(resolve, 900));

  const agentResponses = {};
  const scoreBreakdown = {};
  const checklistResults = {};

  for (const dimensao of AMUX_AI_DIMENSIONS) {
    const avaliacao = evaluateDimension(payload, dimensao);
    checklistResults[dimensao] = avaliacao.items;
    const resposta = _mockAgentResponse(dimensao, avaliacao.score);
    agentResponses[dimensao] = resposta;
    scoreBreakdown[dimensao] = resposta.nota;
  }

  const numeric = Math.round(
    Object.values(scoreBreakdown).reduce((sum, n) => sum + n, 0) / AMUX_AI_DIMENSIONS.length
  );

  return {
    status: 'done',
    fonte: 'mock',
    agentResponses,
    scoreBreakdown,
    checklistResults,
    score: { numeric, stars: _starsFromScore(numeric) }
  };
}

module.exports = { analyzeWithFoundry, AMUX_AI_DIMENSIONS };
