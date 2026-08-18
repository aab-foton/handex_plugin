// ============================================================
// canvas/finalize.js — Epílogo comum de injeção de framework (PRISMA)
// Depois que um builder retorna o mainFrame, este módulo: nomeia,
// reagrupa com os demais frames [PRISMA] da página (autocorrigindo
// groups quebrados/frames órfãos), posiciona, marca metadados e
// devolve os dados já extraídos da instância recém-criada.
// ============================================================

const { CANVAS_PREFIX, PLUGIN_DATA_NS } = require('./scan');

const PRISMA_GROUP_NAME = `${CANVAS_PREFIX} Frameworks`;

// finalizeFrame(mainFrame, framework, ts) → Promise<instance | null>
async function finalizeFrame(mainFrame, framework, ts) {
  if (!mainFrame) return null;

  // Reagrupa TUDO a cada inserção — autocorrige o canvas mesmo que
  // existam groups duplicados/renomeados ou frames [PRISMA] órfãos
  // soltos na página de execuções anteriores. Nunca confia em um
  // único Group "conhecido"; sempre revarre a página inteira.
  const existingGroups = figma.currentPage.findAll(n =>
    n.type === 'GROUP' && n.getSharedPluginData(PLUGIN_DATA_NS, 'prismaGroup') === '1'
  );
  const priorFrames = [];
  existingGroups.forEach(g => {
    priorFrames.push(...g.children.filter(n => n.type === 'FRAME'));
    figma.ungroup(g);
  });
  // Frames [PRISMA] que já estão soltos como filhos diretos da página
  // (nunca chegaram a entrar num Group, ou sobraram de um ungroup).
  figma.currentPage.children.forEach(n => {
    if (n.type === 'FRAME' && n.name.startsWith(CANVAS_PREFIX) && n !== mainFrame && !priorFrames.includes(n)) {
      priorFrames.push(n);
    }
  });

  // Versão = quantas instâncias deste MESMO frameworkId já existem no
  // canvas (nesta página + demais já agrupadas) + 1. Cada clique em
  // "Nova versão" incrementa naturalmente, sem depender de um contador
  // externo que poderia dessincronizar do estado real do canvas.
  const sameFrameworkCount = priorFrames.filter(n =>
    n.getSharedPluginData(PLUGIN_DATA_NS, 'frameworkId') === framework.id
  ).length;
  const version = sameFrameworkCount + 1;

  const tag = framework.category ? `${framework.category} · ` : '';
  const frameName = `${CANVAS_PREFIX} ${tag}${framework.name || mainFrame.name} — v${version} — ${ts}`;
  mainFrame.name = frameName;

  figma.currentPage.appendChild(mainFrame);

  // Posiciona o novo frame ao lado dos demais frames PRISMA já existentes,
  // em vez de sempre no centro do viewport (evita sobreposição entre injeções).
  if (priorFrames.length > 0) {
    const rightmost = priorFrames.reduce((a, b) => (a.x + a.width > b.x + b.width ? a : b));
    mainFrame.x = rightmost.x + rightmost.width + 80;
    mainFrame.y = rightmost.y;
  } else {
    mainFrame.x = 0;
    mainFrame.y = 0;
  }

  mainFrame.setSharedPluginData(PLUGIN_DATA_NS, 'frameworkId', framework.id);
  mainFrame.setSharedPluginData(PLUGIN_DATA_NS, 'frameworkName', framework.name);
  mainFrame.setSharedPluginData(PLUGIN_DATA_NS, 'injectedAt', new Date().toISOString());
  mainFrame.setSharedPluginData(PLUGIN_DATA_NS, 'version', String(version));

  // Replica a versão (+ data de criação) visualmente no canvas — o
  // badge "v1" placeholder criado por kit.mkHeader() é atualizado aqui
  // com o valor real, que só é conhecido depois de contar as instâncias
  // já existentes. ts vem como "AAAA-MM-DD"; exibimos "DD/MM/AAAA" no
  // canvas por ser mais legível para quem olha o desenho.
  const [yyyy, mm, dd] = ts.split('-');
  const displayDate = `${dd}/${mm}/${yyyy}`;
  const versionBadgeText = mainFrame.findAll(n => n.type === 'TEXT' && n.name === '_version_badge_text')[0];
  if (versionBadgeText) {
    try { await figma.loadFontAsync(versionBadgeText.fontName); } catch (e) {}
    versionBadgeText.characters = `v${version} · ${displayDate}`;
  }

  const group = figma.group([...priorFrames, mainFrame], figma.currentPage);
  group.name = PRISMA_GROUP_NAME;
  group.setSharedPluginData(PLUGIN_DATA_NS, 'prismaGroup', '1');

  figma.currentPage.selection = [mainFrame];
  figma.viewport.scrollAndZoomIntoView([mainFrame]);

  // Já devolve os dados da instância recém-criada — o usuário não deveria
  // precisar escanear depois de inserir pelo próprio plugin. Escanear é
  // para descobrir o que já existe no canvas (auditoria), não um passo
  // obrigatório após toda injeção.
  const fieldNodes = mainFrame.findAll(n => n.type === 'TEXT' && n.name.startsWith('field/'));
  const data = {};
  let fieldCount = 0;
  for (const node of fieldNodes) {
    const fieldId = node.name.slice('field/'.length);
    const value = node.characters.trim();

    // Mesma regra de scan.js: texto igual ao placeholder vira '' em
    // `data` (não é dado preenchido) — recém-criado, isso normalmente
    // zera fieldCount, já que nada foi preenchido ainda.
    const placeholder = node.getPluginData('prisma_placeholder').trim();
    const isFilled = !!value && value !== placeholder;
    data[fieldId] = isFilled ? value : '';
    if (isFilled) fieldCount++;
  }

  return {
    frameworkId: framework.id,
    frameworkName: framework.name,
    frameName,
    instanceId: mainFrame.id,
    pageId: figma.currentPage.id,
    pageName: figma.currentPage.name,
    injectedAt: mainFrame.getSharedPluginData(PLUGIN_DATA_NS, 'injectedAt'),
    version,
    scannedAt: new Date().toISOString(),
    fieldCount,
    data
  };
}

module.exports = { finalizeFrame, PRISMA_GROUP_NAME };
