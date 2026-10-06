// Sondagens pontuais (PROBE=1 node tools/shoot.cjs) — prints em prints/_probe-*.png.
module.exports = [
  {
    id: '_probe-linha-arraste', origin: 'web',
    run: () => { openA11yAreaWorkspace('A1', { initialTab: 'tabulacao' }); },
    probe: () => {
      const lis = Array.from(document.querySelectorAll('[id^="tab-order-list-"] > *'));
      if (lis.length < 3) return 'lista com ' + lis.length + ' itens';
      window._a11yDragSrcEl = lis[0]; _a11yShowDropLine(lis[2]);
      const desce = lis[2].style.boxShadow;
      window._a11yDragSrcEl = lis[3]; _a11yShowDropLine(lis[1]);
      const sobe = lis[1].style.boxShadow, limpou = lis[2].style.boxShadow;
      return JSON.stringify({ desce_linhaAbaixo: desce, sobe_linhaAcima: sobe, alvoAnteriorLimpo: limpou === '' });
    },
  },
];
