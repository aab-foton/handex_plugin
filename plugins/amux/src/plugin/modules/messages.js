// ============================================================
// messages.js — Bridge de mensagens UI ↔ canvas/backend (AMUX)
// ============================================================

window.addEventListener('message', (event) => {
  const msg = event.data?.pluginMessage;
  if (!msg) return;

  if (msg.type === 'init-plugin') {
    if (msg.savedState) {
      const migrated = _migrateState(msg.savedState);
      if (migrated) amuxData = migrated;
    }
    if (msg.currentUser?.name) {
      window.__amuxCurrentUser = msg.currentUser.name;
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
      showToast('Nenhum framework [AMUX] encontrado no canvas.', 'info');
      return;
    }
    results.forEach(inst => {
      const existing = amuxData.frameworks.findIndex(f => f.instanceId === inst.instanceId);
      if (existing >= 0) {
        amuxData.frameworks[existing] = inst;
      } else {
        amuxData.frameworks.push(inst);
      }
    });
    saveState();
    renderFrameworkInstances();
    updateHomeBadges();
    const synced = typeof syncEvidenceFromScan === 'function' ? syncEvidenceFromScan(results) : [];
    const msgSuffix = synced.length > 0 ? ` — ${synced.length} vinculado(s) à Auditoria` : '';
    showToast(`${results.length} framework(s) escaneado(s)${msgSuffix}.`, 'success');
    return;
  }

  if (msg.type === 'ai-analysis-complete') {
    _onAiAnalysisComplete(msg.result);
    return;
  }

  if (msg.type === 'ai-analysis-error') {
    _onAiAnalysisError(msg.error);
    return;
  }
});
