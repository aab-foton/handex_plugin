// ============================================================
// messages.js — Bridge de mensagens UI ↔ canvas (Maturai UX)
// ============================================================

window.addEventListener('message', (event) => {
  const msg = event.data?.pluginMessage;
  if (!msg) return;

  if (msg.type === 'init-plugin') {
    if (msg.savedState && msg.savedState._schemaVersion === 1) {
      maturaiData = msg.savedState;
    }
    if (msg.currentUser?.name) {
      const el = document.getElementById('current-user');
      if (el) el.textContent = msg.currentUser.name;
    }
    restoreUIFromState();
    return;
  }

  if (msg.type === 'framework-injected') {
    showToast(`Framework inserido: "${msg.frameName}"`, 'success');
    return;
  }

  if (msg.type === 'scan-complete') {
    const results = msg.results || [];
    if (results.length === 0) {
      showToast('Nenhum framework [MaturAI] encontrado no canvas.', 'info');
      return;
    }
    results.forEach(inst => {
      const existing = maturaiData.frameworks.findIndex(f => f.instanceId === inst.instanceId);
      if (existing >= 0) {
        maturaiData.frameworks[existing] = inst;
      } else {
        maturaiData.frameworks.push(inst);
      }
    });
    saveState();
    renderFrameworkInstances();
    updateHomeBadges();
    showToast(`${results.length} framework(s) escaneado(s).`, 'success');
    return;
  }
});
