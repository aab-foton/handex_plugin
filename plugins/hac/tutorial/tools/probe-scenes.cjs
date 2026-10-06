// Sondagens pontuais (PROBE=1 node tools/shoot.cjs) — não geram prints usados no vídeo.
module.exports = [
  {
    id: '_probe-web-direto', empty: true,
    run: () => { document.getElementById('a11y-home-origin-btn-web').click(); },
    probe: () => JSON.stringify({
      lib: getA11yProjectLib(), origin: getA11yProjectOrigin(),
      etapa1b: !!document.getElementById('a11y-home-step-web-sublib'),
      header: (document.getElementById('a11y-header-title') || {}).textContent,
      viewSpecsVisivel: !document.getElementById('view-specifications').classList.contains('hidden'),
    }),
  },
  {
    id: '_probe-projeto-legado', origin: 'web',
    run: () => { hacData.projectLib = 'web-angular-react'; navigate('view-specifications'); _applyA11yHeaderOriginTitle(); },
    probe: () => JSON.stringify({ lib: getA11yProjectLib(), origin: getA11yProjectOrigin(), header: document.getElementById('a11y-header-title').textContent }),
  },
];
