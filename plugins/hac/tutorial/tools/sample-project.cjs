// Projeto de exemplo para os prints do tutorial — dados FICTÍCIOS, no formato
// real de hacData (docs/architecture-state.md, seção 1).
module.exports = function sampleProject(origin) {
  const web = origin !== 'mobile';
  const areas = [
    { id: 'A1', number: 1, label: 'Login', conector: 'direita', targetNodeId: 'N1', targetNodeName: 'Login', pageId: 'P1' },
    { id: 'A2', number: 2, label: 'Extrato da conta', conector: 'direita', targetNodeId: 'N2', targetNodeName: 'Extrato da conta', pageId: 'P1' },
  ];
  const spec = (id, areaId, a11yType, name, letter, props, extra) => Object.assign({
    id, targetNodeId: 'T' + id, name, letter, color: '#005ca9', fillColor: null,
    category: a11yType, type: a11yType, note: '', properties: props, excecoes: [],
    guideSide: 'right', a11yType, a11ySubtype: null, a11yOrigin: web ? 'web' : 'mobile',
    a11ySourceLib: web ? { id: 'super-dsc-web', label: 'Super DSC | Web' } : { id: 'super-app', label: 'DSC | Super App' }, a11yDscComponentName: null,
    a11yAreaId: areaId, drawMode: 'contorno', needsReview: false, locked: true, visible: true,
    pendingConfirmation: false,
  }, (!web && a11yType === 'elemento') ? { a11ySubtype: { variant: 'componente' } } : {}, extra || {});
  const specs = [
    spec('S1', 'A1', 'titulo', 'Acesse sua conta', 'H',
      [{ key: 'descricao', label: 'Descrição', value: web ? 'Identificar como título de nível 1.' : 'Identificar como título.' }],
      { a11ySubtype: { nivel: 'H1' } }),
    spec('S2', 'A1', 'elemento', 'Campo CPF', '1',
      [{ key: 'componente', label: 'Componente', value: 'Input / Text Field - Form' },
       { key: 'leitor', label: 'Leitor de Tela', value: 'CPF, campo de edição, obrigatório' }],
      { a11yDscComponentName: '[dsc] Input / Text Field - Form' }),
    spec('S3', 'A1', 'elemento', 'Botão Entrar', '2',
      [{ key: 'componente', label: 'Componente', value: 'Button' },
       { key: 'leitor', label: 'Leitor de Tela', value: 'Entrar, botão' }],
      { a11yDscComponentName: '[dsc] Button' }),
    spec('S4', 'A1', 'decorativo', 'Ilustração do cabeçalho', 'Ø',
      [{ key: 'observacoes', label: 'Observações', value: 'Imagem decorativa, ignorada pelo leitor de tela.' }]),
  ];
  const tab = (n, name, areaId) => ({ id: 'G' + areaId + n, number: n, canvasNumber: n, label: '', conector: 'direita',
    targetNodeId: 'TN' + areaId + n, targetNodeName: name, a11yAreaId: areaId });
  const tabOrderItems = [
    tab(1, 'Campo CPF', 'A1'), tab(2, 'Campo Senha', 'A1'), tab(3, 'Esqueci minha senha', 'A1'), tab(4, 'Botão Entrar', 'A1'),
  ];
  return {
    _schemaVersion: 1,
    a11yAreas: areas,
    a11ySpecs: specs,
    tabOrderItems,
    a11ySwipePaths: [],
    projectOrigin: web ? 'web' : 'mobile',
    projectLib: web ? 'super-dsc-web' : 'super-app',
    activeSectionName: '[HAC] Handoff de Acessibilidade',
  };
};
