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
//   agentResponses: {
//     descoberta:      { nota, comentario },
//     definicao:        { nota, comentario },
//     ideacao:          { nota, comentario },
//     validacao:        { nota, comentario },
//     designSystem:     { nota, comentario },
//     acessibilidade:   { nota, comentario }
//   },
//   scoreBreakdown: { <mesmas chaves>: nota (0–100) },
//   score: { numeric: 0–100, stars: 1–5 }
// }

const AMUX_AI_DIMENSIONS = [
  'descoberta', 'definicao', 'ideacao', 'validacao',
  'designSystem', 'acessibilidade'
];

function _mockAgentResponse(dimensao, temEvidencia) {
  const nota = temEvidencia ? 60 + Math.round(Math.random() * 35) : 15 + Math.round(Math.random() * 20);
  const comentarios = {
    descoberta:     temEvidencia ? 'Evidências de descoberta encontradas; recomenda-se detalhar os métodos usados.' : 'Nenhuma evidência de descoberta anexada até o momento.',
    definicao:      temEvidencia ? 'Briefing e hipóteses documentados de forma consistente.' : 'Definição do problema ainda não está evidenciada.',
    ideacao:        temEvidencia ? 'Processo de ideação registrado, com variação de alternativas.' : 'Sem registro de exploração de alternativas de solução.',
    validacao:      temEvidencia ? 'Há evidências de testes com usuários ou métricas de validação.' : 'Ainda não há evidências de validação com usuários.',
    designSystem:   temEvidencia ? 'Uso do Design System CAIXA declarado, sujeito a checagem automatizada futura.' : 'Aderência ao Design System não avaliada.',
    acessibilidade: temEvidencia ? 'Diretrizes de acessibilidade observadas conforme declaração do time.' : 'Conformidade com WCAG não avaliada.'
  };
  return { nota, comentario: comentarios[dimensao] || '' };
}

function _hasEvidence(payload, dimensao) {
  if (dimensao === 'designSystem') return !!(payload?.auditoria?.designSystem?.status && payload.auditoria.designSystem.status !== 'pendente');
  if (dimensao === 'acessibilidade') return !!(payload?.auditoria?.acessibilidade?.status && payload.auditoria.acessibilidade.status !== 'pendente');
  const etapa = payload?.evidencias?.[dimensao];
  return !!(etapa && Array.isArray(etapa.artefatos) && etapa.artefatos.length > 0);
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
// com base na presença (ou ausência) de evidências no payload recebido.
async function analyzeWithFoundry(payload) {
  await new Promise((resolve) => setTimeout(resolve, 900));

  const agentResponses = {};
  const scoreBreakdown = {};

  for (const dimensao of AMUX_AI_DIMENSIONS) {
    const resposta = _mockAgentResponse(dimensao, _hasEvidence(payload, dimensao));
    agentResponses[dimensao] = resposta;
    scoreBreakdown[dimensao] = resposta.nota;
  }

  const numeric = Math.round(
    Object.values(scoreBreakdown).reduce((sum, n) => sum + n, 0) / AMUX_AI_DIMENSIONS.length
  );

  return {
    status: 'done',
    agentResponses,
    scoreBreakdown,
    score: { numeric, stars: _starsFromScore(numeric) }
  };
}

module.exports = { analyzeWithFoundry, AMUX_AI_DIMENSIONS };
