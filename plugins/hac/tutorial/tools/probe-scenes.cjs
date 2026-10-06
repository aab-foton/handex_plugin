// Sondagens pontuais (PROBE=1 node tools/shoot.cjs).
module.exports = [
  { id: '_probe-decorativos', origin: 'web', run: () => {
      const d = (id, name) => ({ id, targetNodeId: 't' + id, name, letter: 'Ø', a11yType: 'decorativo', a11yOrigin: 'web', a11yAreaId: 'A1', locked: true, properties: [] });
      a11ySpecs = [d('D1', 'Ícone'), d('D2', 'Ícone'), d('D3', 'Ícone'), d('D4', 'Ilustração')];
      openA11yAreaWorkspace('A1', { initialTab: 'leitor' }); },
    probe: () => JSON.stringify(Array.from(document.querySelectorAll('[data-a11y-spec-item]')).map(e => e.querySelector('p').textContent.replace(/\s+/g, ' ').trim())) },
];
