// Sondagens pontuais (PROBE=1 node tools/shoot.cjs).
module.exports = [
  {
    id: '_probe-lote', origin: 'web', wait: 2500,
    run: () => {
      openA11yAreaWorkspace('A1', { initialTab: 'leitor' });
      window._a11yPendingAreaId = 'A1';
      window.__antes = a11ySpecs.length;
      window.__fakeSelection = [{ id: '9:1', name: 'Ícone A' }, { id: '9:2', name: 'Ícone B' }, { id: '9:3', name: 'Ícone C' }];
      setTimeout(() => { openA11yModal('elemento', { a11yOrigin: 'web', targetNodeName: 'Ícone A' }); setTimeout(() => confirmA11ySpec(), 300); }, 300);
    },
    probe: () => JSON.stringify({ antes: window.__antes, depois: a11ySpecs.length,
      novas: a11ySpecs.filter(s => String(s.id).startsWith('NEW')).map(s => s.targetNodeId + ':' + s.letter) }),
  },
];
