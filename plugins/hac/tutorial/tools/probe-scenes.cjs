// Sondagens pontuais (PROBE=1 node tools/shoot.cjs) — prints em prints/_probe-*.png.
module.exports = [
  { id: '_probe-menu-ajuda', origin: 'web', run: () => { navigate('view-specifications'); toggleA11yMoreActionsMenu(); } },
  { id: '_probe-suporte', origin: 'web', run: () => { navigate('view-specifications'); openModal('a11y-support-modal'); } },
  { id: '_probe-como-usar-web', origin: 'web', run: () => { navigate('view-specifications'); openOnboarding('web'); _onboardingStep(1); } },
  { id: '_probe-como-usar-mobile', origin: 'mobile', run: () => { navigate('view-specifications'); openOnboarding('mobile'); _onboardingStep(1); } },
];
