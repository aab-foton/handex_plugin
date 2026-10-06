// Cenas dos prints: cada `run` roda DENTRO da página do plugin (funções reais da UI).
// Cada cena sai em duas versões: web (id como está) e mobile (prefixo "m-"),
// trocando só a origem do projeto de exemplo. `soWeb`/`soMobile` limitam a uma.
const base = [
  // Início
  { id: '01-home-origem', empty: true, marks: { mobile: 'Super DSC Mobile', web: 'Super DSC Web' }, soWeb: true },
  { id: '03-lista-telas', run: () => { navigate('view-specifications'); }, marks: { selecionar: 'Selecionar Tela', tela1: 'Login', finalizar: 'Finalizar' } },
  { id: '04-selecionar-tela', run: () => { navigate('view-specifications'); openA11yAreaModal(); }, marks: { confirmar: 'Selecionar' } },
  // Onboarding
  { id: '10-onboarding', run: () => { navigate('view-specifications'); openOnboarding(getA11yProjectOrigin()); } },
  // Tabulação
  { id: '06-aba-tabulacao-vazia', run: () => { openA11yAreaWorkspace('A2', { initialTab: 'tabulacao' }); }, marks: { criar: 'Criar ordem de tabulação' } },
  { id: '06b-instrucao-tabulacao', run: () => { openA11yAreaWorkspace('A2', { initialTab: 'tabulacao' }); setTimeout(() => openA11yInstructionManually('tabulacao'), 300); }, wait: 1000 },
  { id: '06c-revisao-tabulacao', run: () => { openA11yAreaWorkspace('A2', { initialTab: 'tabulacao' }); window._tabOrderPendingAreaId = 'A2'; window._tabOrderPendingList = [{ tempId: 't1', nodeId: 'x1', nodeName: 'Menu', canvasId: 'c1' }, { tempId: 't2', nodeId: 'x2', nodeName: 'Campo de busca', canvasId: 'c2' }, { tempId: 't3', nodeId: 'x3', nodeName: 'Filtro por período', canvasId: 'c3' }, { tempId: 't4', nodeId: 'x4', nodeName: 'Botão Exportar', canvasId: 'c4' }]; setTimeout(() => openTabOrderReviewModal(), 300); }, wait: 1000, marks: { confirmar: 'Criar ordem de tabulação' } },
  { id: '05-aba-tabulacao', run: () => { openA11yAreaWorkspace('A1', { initialTab: 'tabulacao' }); }, marks: { abaTab: 'Tabulação', abaSwipe: 'Swipe', abaLeitor: 'Leitor de Tela', abaResumo: 'Resumo', tamanho: 'Grande', simular: 'Simular leitura', preencher: 'Preencher Tabulação' } },
  // Ordem de Leitura (só mobile)
  { id: '21-aba-swipe', run: () => { openA11yAreaWorkspace('A1', { initialTab: 'swipe' }); }, marks: { criar: 'Criar ordem de leitura', aba: 'Swipe' }, soMobile: true },
  // Leitor de Tela
  { id: '11-instrucao-leitor', run: () => { openA11yAreaWorkspace('A1', { initialTab: 'leitor' }); setTimeout(() => openA11yInstructionManually('leitorTela'), 300); }, wait: 1000 },
  { id: '07-aba-leitor', run: () => { openA11yAreaWorkspace('A1', { initialTab: 'leitor' }); }, marks: { novaSpec: 'Nova spec' } },
  { id: '12-nova-spec-categoria', run: () => { openA11yAreaWorkspace('A1', { initialTab: 'leitor' }); window._a11yPendingAreaId = 'A1'; setTimeout(() => _openA11yCategoryPickerModalNow(), 300); }, wait: 1000 },
  { id: '13-form-elemento', run: () => { openA11yAreaWorkspace('A1', { initialTab: 'leitor' }); window._a11yPendingAreaId = 'A1'; setTimeout(() => openA11yModal('elemento', { a11yOrigin: getA11yProjectOrigin(), targetNodeName: 'Botão Entrar', dscComponentName: '[dsc] Button' }), 300); }, wait: 1200, marks: { componente: 'Componente do DSC' } },
  { id: '14-form-titulo', run: () => { openA11yAreaWorkspace('A1', { initialTab: 'leitor' }); window._a11yPendingAreaId = 'A1'; setTimeout(() => openA11yModal('titulo', { a11yOrigin: getA11yProjectOrigin(), targetNodeName: 'Acesse sua conta' }), 300); }, wait: 1200 },
  { id: '17-form-estrutura', run: () => { openA11yAreaWorkspace('A1', { initialTab: 'leitor' }); window._a11yPendingAreaId = 'A1'; setTimeout(() => openA11yModal('estrutura', { a11yOrigin: getA11yProjectOrigin(), targetNodeName: 'Cabeçalho' }), 300); }, wait: 1200, soWeb: true },
  { id: '15-form-decorativo', run: () => { openA11yAreaWorkspace('A1', { initialTab: 'leitor' }); window._a11yPendingAreaId = 'A1'; setTimeout(() => openA11yModal('decorativo', { a11yOrigin: getA11yProjectOrigin(), targetNodeName: 'Ilustração do cabeçalho' }), 300); }, wait: 1200 },
  { id: '16-categorias-ajuda', run: () => { navigate('view-specifications'); openA11yCategoriesHelp(); } },
  // Resumo e handoff
  { id: '08-aba-resumo', run: () => { openA11yAreaWorkspace('A1', { initialTab: 'handoff' }); }, marks: { gerar: 'Gerar Handoff' } },
  { id: '09-modal-pos-handoff', run: () => { openA11yAreaWorkspace('A1', { initialTab: 'handoff' }); setTimeout(() => _fichaOpenAfterHandoffModal(), 300); }, wait: 1000, marks: { outra: 'Documentar outra tela', finalizar: 'Finalizar handoff' } },
  { id: '18-modal-finalizar', run: () => { navigate('view-specifications'); const c = document.getElementById('a11y-finalize-handoff-count'); if (c) c.textContent = '2 telas documentadas, checklist fechado em todas.'; openModal('a11y-finalize-handoff-modal'); }, marks: { confirmar: 'Finalizar' } },
  // Outros
  { id: '30-sobre', run: () => { navigate('view-specifications'); openAboutHacModal(); }, soWeb: true },
];

const out = [];
for (const s of base) {
  if (!s.soMobile) out.push({ ...s, origin: 'web' });
  if (!s.soWeb) out.push({ ...s, id: 'm-' + s.id, origin: 'mobile' });
}
module.exports = out;
