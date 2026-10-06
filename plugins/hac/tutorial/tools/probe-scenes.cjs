module.exports = [
  {
    id: '_probe', run: () => { openA11yAreaWorkspace('A1', { initialTab: 'leitor' }); },
    probe: () => {
      const n = [...document.querySelectorAll('span,div')].filter(e => {
        if (!e.offsetParent || e.children.length || e.textContent.trim()) return false;
        const r = e.getBoundingClientRect();
        return r.width > 8 && r.width < 40 && r.height < 20 && r.top > 250;
      });
      return n.slice(0, 2).map(e => e.outerHTML.slice(0, 300) + '\n PAI: ' + e.parentElement.outerHTML.slice(0, 500)).join('\n---\n');
    },
  },
];
