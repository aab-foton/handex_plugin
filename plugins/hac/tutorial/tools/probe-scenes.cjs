// Sondagens pontuais (PROBE=1 node tools/shoot.cjs).
module.exports = [
  { id: '_probe-swipe-com-trilha', origin: 'mobile', run: () => {
      hacData.a11ySwipePaths = [{ id: 'P1', areaId: 'A1', points: [{ nodeId: 'p1', nodeName: 'Título' }, { nodeId: 'p2', nodeName: 'Saldo' }, { nodeId: 'p3', nodeName: 'Botão Pix' }] }];
      openA11yAreaWorkspace('A1', { initialTab: 'swipe' }); } },
  { id: '_probe-swipe-vazio', origin: 'mobile', run: () => { openA11yAreaWorkspace('A2', { initialTab: 'swipe' }); } },
];
