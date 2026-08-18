// ============================================================
// canvas/registry.js — Índice central de builders de framework (PRISMA)
// Mapa id → builder. Adicionar um framework novo é criar um arquivo
// em canvas/builders/<id>.js exportando build(kit, ts) e registrar
// aqui — nenhum outro arquivo precisa mudar.
// ============================================================

const kit = require('./kit');

const builders = {
  // 'briefing' não aparece mais em refs/frameworks.json (não é um item
  // opcional do catálogo — é etapa obrigatória, absorvida pela tela
  // Briefing do plugin), mas o builder continua registrado aqui porque
  // a própria tela Briefing ainda usa este mecanismo de injeção para
  // desenhar o frame no canvas (ver injectBriefingIntoCanvas em core.js).
  'briefing': require('./builders/briefing'),
  'csd': require('./builders/csd'),
  'five-whys': require('./builders/five-whys'),
  'stakeholders': require('./builders/stakeholders'),
  'value-effort': require('./builders/value-effort'),
  'atomic-research': require('./builders/atomic-research'),
  'blueprint': require('./builders/blueprint'),
  'heuristics': require('./builders/heuristics'),
  'opportunities': require('./builders/opportunities'),
  'personas': require('./builders/personas'),
  'interview-script': require('./builders/interview-script'),
  'journey': require('./builders/journey'),
  'relational-map': require('./builders/relational-map'),
  '5w2h': require('./builders/5w2h'),
  'golden-circle': require('./builders/golden-circle'),
  'risk-matrix': require('./builders/risk-matrix'),
  'crazy-8s': require('./builders/crazy-8s'),
  'dot-voting': require('./builders/dot-voting'),
  'journey-versioning': require('./builders/journey-versioning'),
  'ds-audit-checklist': require('./builders/ds-audit-checklist'),
  'a11y-audit-checklist': require('./builders/a11y-audit-checklist'),
  'post-launch-tracker': require('./builders/post-launch-tracker'),
  'card-sorting': require('./builders/card-sorting'),
  'sus-seq': require('./builders/sus-seq'),
  'how-might-we': require('./builders/how-might-we'),
  'storyboard': require('./builders/storyboard'),
};

// buildFrame(frameworkId, ts) → mainFrame | null
function buildFrame(frameworkId, ts) {
  const builder = builders[frameworkId];
  if (!builder) return null;
  return builder.build(kit, ts);
}

module.exports = { buildFrame, builders };
