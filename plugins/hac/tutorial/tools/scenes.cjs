// Cenas dos prints: cada `run` roda DENTRO da página do plugin (funções reais da UI).
// origin: 'web' (padrão) ou 'mobile' — muda o projeto de exemplo.
module.exports = [
  // Início
  { id: '01-home-origem', empty: true, marks: { mobile: 'Super DSC Mobile', web: 'Super DSC Web' } },
  { id: '02-home-sublib-web', empty: true, run: () => { _showA11yHomeWebSublibStep(); }, marks: { nova: 'Super DSC Web', legado: 'DSC Web Angular & React' } },
  { id: '03-lista-telas', run: () => { navigate('view-specifications'); }, marks: { selecionar: 'Selecionar Tela', tela1: 'Login', finalizar: 'Finalizar' } },
  { id: '04-selecionar-tela', run: () => { navigate('view-specifications'); openA11yAreaModal(); }, marks: { confirmar: 'Selecionar' } },
  // Onboarding
  { id: '10-onboarding-web', run: () => { navigate('view-specifications'); openOnboarding('web'); } },
  { id: '10b-onboarding-web-passo1', run: () => { navigate('view-specifications'); openOnboarding('web'); _onboardingStep(1); } },
  { id: '10c-onboarding-mobile', origin: 'mobile', run: () => { navigate('view-specifications'); openOnboarding('mobile'); } },
  // Tabulação
  { id: '06-aba-tabulacao-vazia', run: () => { openA11yAreaWorkspace('A2', { initialTab: 'tabulacao' }); }, marks: { criar: 'Criar ordem de tabulação' } },
  { id: '06b-instrucao-tabulacao', run: () => { openA11yAreaWorkspace('A2', { initialTab: 'tabulacao' }); setTimeout(() => openA11yInstructionManually('tabulacao'), 300); }, wait: 1000 },
  { id: '06c-revisao-tabulacao', run: () => { openA11yAreaWorkspace('A2', { initialTab: 'tabulacao' }); window._tabOrderPendingAreaId = 'A2'; window._tabOrderPendingList = [{ tempId: 't1', nodeId: 'x1', nodeName: 'Menu', canvasId: 'c1' }, { tempId: 't2', nodeId: 'x2', nodeName: 'Campo de busca', canvasId: 'c2' }, { tempId: 't3', nodeId: 'x3', nodeName: 'Filtro por período', canvasId: 'c3' }, { tempId: 't4', nodeId: 'x4', nodeName: 'Botão Exportar', canvasId: 'c4' }]; setTimeout(() => openTabOrderReviewModal(), 300); }, wait: 1000, marks: { confirmar: 'Criar ordem de tabulação' } },
  { id: '05-aba-tabulacao', run: () => { openA11yAreaWorkspace('A1', { initialTab: 'tabulacao' }); }, marks: { abaTab: 'Tabulação', abaLeitor: 'Leitor de Tela', abaResumo: 'Resumo', tamanho: 'Grande' } },
  // Leitor de Tela
  { id: '11-instrucao-leitor', run: () => { openA11yAreaWorkspace('A1', { initialTab: 'leitor' }); setTimeout(() => openA11yInstructionManually('leitorTela'), 300); }, wait: 1000 },
  { id: '07-aba-leitor', run: () => { openA11yAreaWorkspace('A1', { initialTab: 'leitor' }); }, marks: { novaSpec: 'Nova spec' } },
  { id: '12-nova-spec-categoria', run: () => { openA11yAreaWorkspace('A1', { initialTab: 'leitor' }); window._a11yPendingAreaId = 'A1'; setTimeout(() => _openA11yCategoryPickerModalNow(), 300); }, wait: 1000 },
  { id: '13-form-elemento', run: () => { openA11yAreaWorkspace('A1', { initialTab: 'leitor' }); window._a11yPendingAreaId = 'A1'; setTimeout(() => openA11yModal('elemento', { a11yOrigin: 'web', targetNodeName: 'Botão Entrar', dscComponentName: '[dsc] Button' }), 300); }, wait: 1200 },
  { id: '14-form-titulo', run: () => { openA11yAreaWorkspace('A1', { initialTab: 'leitor' }); window._a11yPendingAreaId = 'A1'; setTimeout(() => openA11yModal('titulo', { a11yOrigin: 'web', targetNodeName: 'Acesse sua conta' }), 300); }, wait: 1200 },
  { id: '15-form-decorativo', run: () => { openA11yAreaWorkspace('A1', { initialTab: 'leitor' }); window._a11yPendingAreaId = 'A1'; setTimeout(() => openA11yModal('decorativo', { a11yOrigin: 'web', targetNodeName: 'Ilustração do cabeçalho' }), 300); }, wait: 1200 },
  { id: '16-categorias-ajuda', run: () => { navigate('view-specifications'); openA11yCategoriesHelp(); } },
  // Resumo e handoff
  { id: '08-aba-resumo', run: () => { openA11yAreaWorkspace('A1', { initialTab: 'handoff' }); }, marks: { gerar: 'Gerar Handoff' } },
  { id: '09-modal-pos-handoff', run: () => { openA11yAreaWorkspace('A1', { initialTab: 'handoff' }); setTimeout(() => _fichaOpenAfterHandoffModal(), 300); }, wait: 1000, marks: { outra: 'Documentar outra tela', finalizar: 'Finalizar handoff' } },
  // Mobile
  { id: '20-mobile-lista', origin: 'mobile', run: () => { navigate('view-specifications'); }, marks: { finalizar: 'Finalizar' } },
  { id: '21-mobile-abas-swipe', origin: 'mobile', run: () => { openA11yAreaWorkspace('A1', { initialTab: 'swipe' }); }, marks: { criar: 'Criar ordem de leitura', aba: 'Swipe' } },
  { id: '22-mobile-form-elemento', origin: 'mobile', run: () => { openA11yAreaWorkspace('A1', { initialTab: 'leitor' }); window._a11yPendingAreaId = 'A1'; setTimeout(() => openA11yModal('elemento', { a11yOrigin: 'mobile', targetNodeName: 'Botão Entrar', dscComponentName: 'Button' }), 300); }, wait: 1200 },
  // Outros
  { id: '30-sobre', run: () => { navigate('view-specifications'); openAboutHacModal(); } },
];
