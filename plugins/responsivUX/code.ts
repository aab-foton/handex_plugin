// ============================================================
//  Responsive Layout Generator – code.ts
//  Plugin principal: clona frames e aplica lógica responsiva
// ============================================================

// Mostra a UI do plugin (permitindo redimensionamento)
figma.showUI(__html__, {
  width: 400,
  height: 700,
  themeColors: true
} as any);

// ────────────────────────────────────────────────────────────
//  Tipos auxiliares
// ────────────────────────────────────────────────────────────

/** Breakpoints disponíveis */
const BREAKPOINTS: Record<string, number> = {
  'Tablet Portrait': 768,
  'Tablet Landscape': 1024,
  'Web Standard': 1280,
  'Web Large': 1440,
  'Desktop Large': 1536,
  'Desktop Full HD': 1920,
  'Desktop 2K': 2560,
  'Desktop 4K': 3840,
};

// ────────────────────────────────────────────────────────────
//  Listener de mensagens da UI (ui.html)
// ────────────────────────────────────────────────────────────

figma.ui.onmessage = async (msg: { type: string; width?: number; gap?: number; height?: number }) => {
  if (msg.type === 'resize' && msg.width && msg.height) {
    figma.ui.resize(msg.width, msg.height);
    return;
  }

  // Valida seleção: precisa ser um FrameNode
  const selection = figma.currentPage.selection;
  if (selection.length === 0 || selection[0].type !== 'FRAME') {
    figma.ui.postMessage({ type: 'error', text: 'Selecione um Frame antes de gerar.' });
    return;
  }

  const sourceFrame = selection[0] as FrameNode;
  const gap = msg.gap ?? 80; // espaçamento entre os frames clonados

  try {
    if (msg.type === 'generate-single' && msg.width) {
      // Gera apenas o breakpoint solicitado
      await generateBreakpoint(sourceFrame, msg.width, gap);
      figma.ui.postMessage({ type: 'success', text: `✓ Frame ${msg.width}px gerado com sucesso.` });

    } else if (msg.type === 'generate-all') {
      // Gera todos os 4 breakpoints em sequência
      const widths = Object.values(BREAKPOINTS);
      for (const w of widths) {
        await generateBreakpoint(sourceFrame, w, gap);
      }
      figma.ui.postMessage({ type: 'success', text: `✓ ${widths.length} frames gerados com sucesso.` });
    }
  } catch (err: any) {
    figma.ui.postMessage({ type: 'error', text: `Erro: ${err?.message ?? 'Desconhecido'}` });
  }
};

// ────────────────────────────────────────────────────────────
//  Função principal: clona o frame e aplica o novo breakpoint
// ────────────────────────────────────────────────────────────

/**
 * Clona o `sourceFrame`, posiciona à direita do original (ou do
 * último clone existente) e executa a lógica de responsividade.
 */
async function generateBreakpoint(
  sourceFrame: FrameNode,
  targetWidth: number,
  gap: number,
): Promise<FrameNode> {

  // 1. Calcula a posição X do novo frame
  //    Usamos o getBoundingRect para evitar sobreposição com
  //    frames já gerados anteriormente na mesma sessão.
  const existingRight = getRightEdge(sourceFrame, gap);

  // 2. Clona o frame inteiro (deep clone: copia filhos, estilos, etc.)
  const clonedFrame = sourceFrame.clone() as FrameNode;

  // 3. Move o clone para fora do frame original (filhos de página)
  figma.currentPage.appendChild(clonedFrame);

  // 4. Posiciona o clone à direita do original
  clonedFrame.x = existingRight;
  clonedFrame.y = sourceFrame.y;

  // 5. Guarda a largura original para calcular o fator de escala
  const originalWidth = sourceFrame.width;
  const scaleFactor = targetWidth / originalWidth;

  // 6. Redimensiona o frame raiz para o novo breakpoint
  clonedFrame.resize(targetWidth, clonedFrame.height);

  // 7. Aplica lógica responsiva recursivamente a todos os filhos
  applyResponsiveness(clonedFrame, originalWidth, targetWidth, scaleFactor);

  // 8. Nomeia o frame clonado com o breakpoint
  clonedFrame.name = `${sourceFrame.name} – ${targetWidth}px`;

  return clonedFrame;
}

// ────────────────────────────────────────────────────────────
//  Lógica Recursiva de Responsividade
// ────────────────────────────────────────────────────────────

/**
 * Percorre recursivamente os filhos de um nó e aplica as
 * regras de responsividade dependendo do tipo de nó:
 *
 *   • Auto Layout (FRAME com layoutMode HORIZONTAL/VERTICAL):
 *     – Garante que o frame preencha o container (FILL)
 *     – Ativa layoutWrap se o container encolheu muito
 *     – Ajusta o sizing de cada filho (FILL x HUG)
 *
 *   • Nós sem Auto Layout:
 *     – Recalcula posição e largura com base nas Constraints
 *       (LEFT, RIGHT, CENTER, SCALE, STRETCH)
 */
function applyResponsiveness(
  node: SceneNode,
  originalParentWidth: number,
  newParentWidth: number,
  scaleFactor: number,
): void {

  // Só processamos nós que podem ter filhos
  if (!('children' in node)) return;

  const container = node as FrameNode | GroupNode | ComponentNode | InstanceNode;

  for (const child of container.children) {

    // ── Caso A: filho é um FRAME com Auto Layout ──────────────
    if (child.type === 'FRAME' && child.layoutMode !== 'NONE') {
      handleAutoLayoutFrame(child as FrameNode, originalParentWidth, newParentWidth, scaleFactor);

      // ── Caso B: filho não tem Auto Layout (posicionamento livre) ──
    } else if ('constraints' in child) {
      handleConstrainedNode(child as SceneNode & { constraints: Constraints }, originalParentWidth, newParentWidth, scaleFactor);
    }

    // Desce recursivamente nos filhos (independente do tipo)
    if ('children' in child) {
      const childOriginalWidth = getOriginalChildWidth(child, scaleFactor);
      applyResponsiveness(child, childOriginalWidth, child.width, scaleFactor);
    }
  }
}

// ────────────────────────────────────────────────────────────
//  Handler: Frames com Auto Layout
// ────────────────────────────────────────────────────────────

/**
 * Frames com Auto Layout são o cenário mais rico.
 * Aqui lidamos com:
 *
 *  1. primaryAxisSizingMode / counterAxisSizingMode
 *     – Se o frame era FILL no pai, mantemos FILL para que
 *       ele ocupe toda a largura do novo container.
 *     – Se era FIXED, escalamos a largura proporcionalmente.
 *
 *  2. layoutWrap
 *     – Se a nova largura for menor que a soma aproximada dos
 *       filhos, ativamos WRAP para que os itens quebrem linha.
 *
 *  3. Filhos do Auto Layout
 *     – Garantimos que itens de conteúdo primário usem FILL
 *       para se esticar horizontalmente.
 */
function handleAutoLayoutFrame(
  frame: FrameNode,
  originalParentWidth: number,
  newParentWidth: number,
  scaleFactor: number,
): void {

  // Ajusta o tamanho do frame ao novo container
  if (frame.layoutSizingHorizontal === 'FILL') {
    // FILL: o Auto Layout pai já cuida do tamanho; nada a fazer.
    // Mas garantimos que continua como FILL
    frame.layoutSizingHorizontal = 'FILL';

  } else if (frame.layoutSizingHorizontal === 'FIXED') {
    // FIXED: escalamos proporcionalmente
    const newWidth = Math.round(frame.width * scaleFactor);
    try { frame.resize(newWidth, frame.height); } catch (_) { /* ignora erros de resize */ }

  }
  // HUG: não precisamos alterar (o frame abraça seu conteúdo)

  // ── Ativa layoutWrap se o conteúdo provavelmente não cabe ──
  if (frame.layoutMode === 'HORIZONTAL') {
    const estimatedContentWidth = estimateChildrenTotalWidth(frame);
    if (estimatedContentWidth > frame.width * 0.9) {
      // Quebra linha quando os filhos são maiores que 90% do container
      frame.layoutWrap = 'WRAP';
    }
  }

  // ── Ajusta os filhos diretos do Auto Layout ───────────────
  for (const child of frame.children) {
    if (!('layoutSizingHorizontal' in child)) continue;

    const c = child as FrameNode | RectangleNode | TextNode;

    // Filhos que eram FIXED e ocupavam quase todo o pai → viram FILL
    if (
      'layoutSizingHorizontal' in c &&
      c.layoutSizingHorizontal === 'FIXED' &&
      c.width / originalParentWidth > 0.7
    ) {
      (c as FrameNode).layoutSizingHorizontal = 'FILL';
    }
  }
}

// ────────────────────────────────────────────────────────────
//  Handler: Nós com Constraints (sem Auto Layout)
// ────────────────────────────────────────────────────────────

/**
 * Nós posicionados livremente (sem Auto Layout no pai) usam
 * Constraints para se ancorar ao container.
 *
 * Constraints horizontais possíveis:
 *   LEFT     → mantém distância da borda esquerda (não muda X)
 *   RIGHT    → mantém distância da borda direita (ajusta X)
 *   CENTER   → mantém centrado (ajusta X proporcionalmente)
 *   SCALE    → escala proporcionalmente (ajusta X e largura)
 *   STRETCH  → estica (ajusta X e largura para preencher)
 */
function handleConstrainedNode(
  node: SceneNode & { constraints: Constraints },
  originalParentWidth: number,
  newParentWidth: number,
  _scaleFactor: number,
): void {

  const h = node.constraints.horizontal;

  // Pega os valores atuais do nó (já no clone)
  const currentX = (node as any).x as number;
  const currentWidth = (node as any).width as number;

  // Calcula a distância original da borda direita
  const distFromRight = originalParentWidth - (currentX + currentWidth);

  switch (h) {

    case 'MIN': // LEFT – ancora na esquerda; X não muda
      // Nada a fazer
      break;

    case 'MAX': // RIGHT – mantém distância da borda direita
      try {
        (node as any).x = newParentWidth - currentWidth - distFromRight;
      } catch (_) { }
      break;

    case 'CENTER': { // Mantém centralizado
      const originalCenter = currentX + currentWidth / 2;
      const centerRatio = originalCenter / originalParentWidth;
      const newCenter = centerRatio * newParentWidth;
      try { (node as any).x = Math.round(newCenter - currentWidth / 2); } catch (_) { }
      break;
    }

    case 'SCALE': { // Escala proporcionalmente (X e width)
      const xRatio = currentX / originalParentWidth;
      const widthRatio = currentWidth / originalParentWidth;
      try {
        (node as any).x = Math.round(xRatio * newParentWidth);
        (node as any).resize(
          Math.round(widthRatio * newParentWidth),
          (node as any).height,
        );
      } catch (_) { }
      break;
    }

    case 'STRETCH': { // Estica entre margens esquerda e direita
      const leftMargin = currentX;
      const newWidth = newParentWidth - leftMargin - distFromRight;
      try {
        (node as any).resize(Math.max(newWidth, 1), (node as any).height);
      } catch (_) { }
      break;
    }
  }
}

// ────────────────────────────────────────────────────────────
//  Utilitários
// ────────────────────────────────────────────────────────────

/**
 * Calcula a borda direita do frame original + todos os
 * frames já clonados na mesma linha, para não sobrepor.
 */
function getRightEdge(sourceFrame: FrameNode, gap: number): number {
  // Pega todos os frames da página que estão na mesma linha Y
  const sameLine = figma.currentPage.children.filter(n => {
    if (n.type !== 'FRAME') return false;
    const f = n as FrameNode;
    // Considera "mesma linha" se o Y está dentro da altura do frame original
    return (
      f.id !== sourceFrame.id &&
      f.y >= sourceFrame.y - 20 &&
      f.y <= sourceFrame.y + 20
    );
  }) as FrameNode[];

  if (sameLine.length === 0) {
    return sourceFrame.x + sourceFrame.width + gap;
  }

  // Pega o X máximo (borda direita) entre todos os frames na linha
  const maxRight = Math.max(
    sourceFrame.x + sourceFrame.width,
    ...sameLine.map(f => f.x + f.width),
  );

  return maxRight + gap;
}

/**
 * Estima a largura total dos filhos de um Auto Layout horizontal.
 * Usado para decidir se devemos ativar layoutWrap.
 */
function estimateChildrenTotalWidth(frame: FrameNode): number {
  let total = 0;
  for (const child of frame.children) {
    if ('width' in child) total += (child as any).width;
  }
  // Soma o gap entre itens
  total += (frame.itemSpacing ?? 0) * Math.max(frame.children.length - 1, 0);
  return total;
}

/**
 * Devolve uma estimativa da largura original de um filho antes
 * do escalonamento, para uso na recursão.
 */
function getOriginalChildWidth(child: SceneNode, scaleFactor: number): number {
  if (!('width' in child)) return 0;
  return (child as any).width / scaleFactor;
}
