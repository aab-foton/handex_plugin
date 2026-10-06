// Sondagens pontuais (PROBE=1 node tools/shoot.cjs) — prints em prints/_probe-*.png.
module.exports = [
  { id: '_probe-drop-modal', origin: 'mobile', wait: 1300, run: () => {
      openA11yAreaWorkspace('A2', { initialTab: 'tabulacao' });
      window._tabOrderPendingAreaId = 'A2';
      window._tabOrderPendingList = [{ tempId: 't1', nodeId: 'x1', nodeName: 'Page Header', canvasId: 'c1' }, { tempId: 't2', nodeId: 'x2', nodeName: 'Actions', canvasId: 'c2' }, { tempId: 't3', nodeId: 'x3', nodeName: 'Slot Hero', canvasId: 'c3' }];
      setTimeout(() => {
        openTabOrderReviewModal();
        setTimeout(() => {
          const lis = Array.from(document.querySelectorAll('#a11y-tab-order-review-modal [draggable="true"]'));
          window._a11yDragSrcEl = lis[2]; lis[2].style.opacity = '0.4'; _a11yShowDropLine(lis[0]);
        }, 300);
      }, 300); } },
  { id: '_probe-drop-aba', origin: 'web', wait: 900, run: () => {
      openA11yAreaWorkspace('A1', { initialTab: 'tabulacao' });
      setTimeout(() => {
        const lis = Array.from(document.querySelectorAll('[id^="tab-order-list-"] [draggable="true"]'));
        window._a11yDragSrcEl = lis[0]; lis[0].style.opacity = '0.4'; _a11yShowDropLine(lis[2]);
      }, 400); } },
];
