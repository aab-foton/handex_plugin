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
    window.__amuxFileName = msg.fileName || '';
    restoreUIFromState();
    return;
  }

  if (msg.type === 'framework-injected') {
    if (msg.instance) {
      const existing = amuxData.frameworks.findIndex(f => f.instanceId === msg.instance.instanceId);
      if (existing >= 0) {
        amuxData.frameworks[existing] = msg.instance;
      } else {
        amuxData.frameworks.push(msg.instance);
      }
      saveState();
      renderFrameworkInstances();
      updateHomeBadges();
      const synced = typeof syncEvidenceFromScan === 'function' ? syncEvidenceFromScan([msg.instance]) : [];
      const msgSuffix = synced.length > 0 ? ` — vinculado à Auditoria` : '';
      showToast(`Framework inserido: "${msg.frameName}"${msgSuffix}.`, 'success');

      // Briefing: injeção nasce com placeholders (mesmo mecanismo dos
      // demais frameworks) e é populada em seguida com os dados reais
      // já preenchidos no card, via o mesmo caminho de "Editar campos"
      // (reaproveita fill-framework-fields; o handler fill-framework-result
      // abaixo recebe os values de volta do backend e já sabe atualizar
      // amuxData.frameworks[idx].data, sem depender de estado externo).
      if (msg.frameworkId === 'briefing' && window.__amuxPendingBriefingFill) {
        const values = window.__amuxPendingBriefingFill;
        window.__amuxPendingBriefingFill = null;
        parent.postMessage({ pluginMessage: { type: 'fill-framework-fields', instanceId: msg.instance.instanceId, values } }, '*');
      }
    } else {
      showToast(`Framework inserido: "${msg.frameName}"`, 'success');
    }
    return;
  }

  if (msg.type === 'framework-inject-error') {
    showToast(`Falha ao inserir framework: ${msg.error}`, 'error');
    return;
  }

  if (msg.type === 'scan-complete') {
    const results = msg.results || [];
    if (typeof onScanFinished === 'function') onScanFinished();
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

  if (msg.type === 'framework-deleted') {
    if (msg.ok) {
      const idx = amuxData.frameworks.findIndex(f => f.instanceId === msg.instanceId);
      if (idx >= 0) amuxData.frameworks.splice(idx, 1);
      saveState();
      renderFrameworkInstances();
      updateHomeBadges();
      showToast('Framework removido do canvas.', 'success');
    } else {
      showToast('Não foi possível remover o framework do canvas.', 'error');
    }
    return;
  }

  if (msg.type === 'fill-framework-result') {
    if (typeof closeFillFrameworkModal === 'function') closeFillFrameworkModal();
    if (!msg.ok) {
      showToast(msg.error === 'not-found' ? 'Framework não encontrado no canvas — pode ter sido removido.' : 'Não foi possível salvar os campos.', 'error');
      return;
    }
    const idx = amuxData.frameworks.findIndex(f => f.instanceId === msg.instanceId);
    if (idx >= 0 && msg.values) {
      amuxData.frameworks[idx].data = { ...amuxData.frameworks[idx].data, ...msg.values };
      amuxData.frameworks[idx].fieldCount = Object.values(amuxData.frameworks[idx].data).filter(v => v).length;
      saveState();
      renderFrameworkInstances();
      const synced = typeof syncEvidenceFromScan === 'function' ? syncEvidenceFromScan([amuxData.frameworks[idx]]) : [];
      const msgSuffix = synced.length > 0 ? ' — evidência atualizada na Auditoria' : '';
      showToast(`Campos salvos no canvas${msgSuffix}.`, 'success');
    } else {
      showToast('Campos salvos no canvas.', 'success');
    }
    if (msg.missing && msg.missing.length > 0) {
      showToast(`Alguns campos não foram encontrados no frame: ${msg.missing.join(', ')}`, 'error');
    }
    return;
  }

  if (msg.type === 'focus-framework-result') {
    if (!msg.ok) {
      showToast(msg.error === 'not-found' ? 'Framework não encontrado no canvas — pode ter sido removido.' : 'Não foi possível abrir o framework no canvas.', 'error');
    }
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
