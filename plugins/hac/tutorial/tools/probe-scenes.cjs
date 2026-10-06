// Sondagens pontuais (PROBE=1 node tools/shoot.cjs) — prints em prints/_probe-*.png.
module.exports = [
  { id: '_probe-pz-menu', origin: 'web', run: () => { navigate('view-specifications'); toggleHacPersonalizeMenu(); } },
  { id: '_probe-ts-lista', origin: 'web', run: () => { setHacTextSpacing(true); navigate('view-specifications'); } },
  { id: '_probe-ts-leitor', origin: 'mobile', run: () => { setHacTextSpacing(true); openA11yAreaWorkspace('A1', { initialTab: 'leitor' }); } },
  { id: '_probe-ts-form', origin: 'web', run: () => { setHacTextSpacing(true); openA11yAreaWorkspace('A1', { initialTab: 'leitor' }); window._a11yPendingAreaId = 'A1'; setTimeout(() => openA11yModal('elemento', { a11yOrigin: 'web', targetNodeName: 'Botão Entrar', dscComponentName: '[dsc] Button' }), 300); }, wait: 1200 },
];
