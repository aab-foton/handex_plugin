// Ordem dos 6 cards da home reorganizável por arrastar-e-soltar. Preferência
// pessoal de UI do designer (como o tema claro/escuro), não dado de projeto
// -- persistida em localStorage, nunca em handoffData/exportação.
const HOME_CARD_ORDER_KEY = 'handexHomeCardOrder';
const HOME_CARD_IDS_DEFAULT = ['guide', 'dados-projeto', 'tokens', 'specs', 'measurement', 'flows'];

let _homeDragSrcCard = null;

function _loadHomeCardOrder() {
  try {
    const raw = localStorage.getItem(HOME_CARD_ORDER_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved)) return null;
    // Filtra ids que não existem mais (defensivo contra versões futuras que
    // adicionem/removam cards) e completa com qualquer id novo que a ordem
    // salva não conheça ainda, preservando a ordem salva pros que sobrevivem.
    const known = new Set(HOME_CARD_IDS_DEFAULT);
    const filtered = saved.filter(id => known.has(id));
    HOME_CARD_IDS_DEFAULT.forEach(id => { if (!filtered.includes(id)) filtered.push(id); });
    return filtered;
  } catch (e) { return null; }
}

function _saveHomeCardOrder(order) {
  try { localStorage.setItem(HOME_CARD_ORDER_KEY, JSON.stringify(order)); } catch (e) { }
}

// Reordena os elementos DOM dentro do grid pra bater com a ordem salva --
// chamado só uma vez no boot (DOMContentLoaded). Sem isso o card fica na
// ordem estática do HTML a cada reabertura do plugin, ignorando o que o
// designer organizou antes.
function _applyHomeCardOrder() {
  const grid = document.getElementById('home-cards-grid');
  if (!grid) return;
  const order = _loadHomeCardOrder();
  if (!order) return;
  order.forEach(id => {
    const card = grid.querySelector(`[data-home-card-id="${id}"]`);
    if (card) grid.appendChild(card);
  });
}

function _onHomeCardDragStart(e) {
  _homeDragSrcCard = e.currentTarget;
  e.dataTransfer.effectAllowed = 'move';
  // Alguns navegadores/hosts (incluindo o iframe do Figma) exigem setData
  // pra o drag funcionar de verdade -- o valor em si não é usado, a troca
  // real acontece via _homeDragSrcCard.
  try { e.dataTransfer.setData('text/plain', e.currentTarget.dataset.homeCardId || ''); } catch (err) { }
  e.currentTarget.classList.add('opacity-40');
}

function _onHomeCardDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

// Troca as posições do card de origem e do card de destino (swap simples,
// não inserção) -- mais previsível numa grade 2 colunas x 3 linhas do que
// "empurrar" os outros cards, que reordenaria a coluna toda de forma menos
// óbvia pro usuário.
function _onHomeCardDrop(e) {
  e.preventDefault();
  const targetCard = e.currentTarget;
  if (!_homeDragSrcCard || _homeDragSrcCard === targetCard) return;
  const grid = document.getElementById('home-cards-grid');
  if (!grid) return;

  const cards = Array.from(grid.children);
  const srcIdx = cards.indexOf(_homeDragSrcCard);
  const targetIdx = cards.indexOf(targetCard);
  if (srcIdx === -1 || targetIdx === -1) return;

  const placeholder = document.createComment('home-card-swap');
  grid.insertBefore(placeholder, _homeDragSrcCard);
  grid.insertBefore(_homeDragSrcCard, targetCard);
  grid.insertBefore(targetCard, placeholder);
  grid.removeChild(placeholder);

  const newOrder = Array.from(grid.children)
    .map(el => el.dataset && el.dataset.homeCardId)
    .filter(Boolean);
  _saveHomeCardOrder(newOrder);
}

function _onHomeCardDragEnd(e) {
  e.currentTarget.classList.remove('opacity-40');
  _homeDragSrcCard = null;
}

window._onHomeCardDragStart = _onHomeCardDragStart;
window._onHomeCardDragOver = _onHomeCardDragOver;
window._onHomeCardDrop = _onHomeCardDrop;
window._onHomeCardDragEnd = _onHomeCardDragEnd;

document.addEventListener('DOMContentLoaded', _applyHomeCardOrder);
