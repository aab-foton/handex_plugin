// ============================================================
// accessibility.js — hac
//
// PORTADO do Handex Beta (src/plugin/modules/accessibility.js) — 2026-08-24.
// Cinco categorias de spec estruturada, criadas exatamente como uma spec
// normal (elemento selecionado no canvas → formulário → create-unified-spec).
// Cada categoria tem selo, cor e regra de numeração próprios — estrutura e
// cores confirmadas inspecionando o arquivo real da lib Figma "Design
// Acessível" (fileKey Wy0IhXRVZMSOOr8E609UqI):
//
//   - elemento     Elementos interativos e imagens. Select com o catálogo real
//                  de 16 componentes do DSC (+ "Outro" livre). Tag MANUAL no
//                  formato A, A1, A1.1... — mesmo input/validação das specs
//                  normais, o designer controla a ordem/agrupamento.
//                  Cor: #FCBE05.
//   - estrutura    Estrutura da página (idiomas / marco de navegação / título
//                  da página / customizável). Tag MANUAL também.
//                  Cor: #EF765E.
//   - titulo       Nível de título — H1-H6 (web) ou "H" fixo (mobile, React
//                  Native não tem semântica de nível). Selo FIXO conforme o
//                  nível escolhido, não usa o input de tag.
//                  Cor: #AFCA0B.
//   - decorativo   Elemento Decorativo (Gerais / Imagem). Selo FIXO "Ø" —
//                  fora da ordem de leitura.
//                  Cor: #D93636.
//   - informacoes  Informações adicionais (Handoffs / Conteúdo extra /
//                  Customizável). Tag MANUAL também.
//                  Cor: #F39200.
//
// ADAPTAÇÃO DE SCHEMA (Handex → hac): o Handex tem DOIS lugares de origem
// pra specs/áreas/itens de tab order — avulsos (handoffData.a11ySpecs, sem
// activeFrameId) e por-frame (frame.a11ySpecs) — e um bug histórico documentado
// (specs "sumindo" por resync sem merge/dedup dos dois lados). O hac NÃO
// TEM conceito de frame: existe só o array único a11ySpecs/a11yAreas/
// tabOrderItems (core.js) — toda a ramificação condicional "se tem frame
// ativo, senão..." foi removida, sempre operando no array único. Não há
// syncAndRenderSpecs/saveSpecsToStorage separados — tudo passa por
// saveToStorage() (core.js).
//
// Depende de: hacData, a11ySpecs, a11yAreas, tabOrderItems,
// renderA11yGroupedList, saveToStorage, showToast, focusNode, openModal/
// closeModal, escapeHtml (todos em core.js/messages.js).
// ============================================================

// Flag temporária (2026-09-10, pedido do usuário) — REVERTIDA (2026-09-11,
// pedido do usuário): reativa os 3 pontos de entrada de mapeamento/geração
// automática — "ou usar Mapeamento Automático" em Tabulação e Leitor de
// Tela, "ou usar a Ordem de Tabulação já mapeada" em Swipe — que tinham
// sido ocultados enquanto o fluxo automático era refinado. Nenhuma lógica
// foi tocada nesse meio-tempo (_confirmGenerateTabOrderFromLayers,
// startSwipePathFromTabOrder, _startA11yMappingFromLeitorTab continuaram
// intactas e funcionais o tempo todo) — só o botão de entrada volta a
// aparecer. Um scan mais aprofundado nas camadas (drill-in maior) é
// melhoria separada, ainda a investigar/planejar.
//
// Correção de escopo (2026-09-11): o pedido de reativação era só para
// Leitor de Tela — Tabulação e Swipe continuaram ocultos sob a MESMA flag
// (A11Y_AUTO_MAPPING_HIDDEN_TAB_SWIPE), apesar de controlarem 2 botões
// conceitualmente distintos: "Mapeamento Automático" de Tabulação (scan de
// camadas/zigue-zague, _confirmGenerateTabOrderFromLayers) e "usar a Ordem
// de Tabulação já mapeada" no Swipe (startSwipePathFromTabOrder — nunca
// deixou de existir/funcionar, só o botão ficou escondido). Separado em
// 2026-09-18 (pedido do usuário: testar SÓ o Swipe automático de novo, sem
// reativar o Mapeamento Automático de Tabulação) — cada botão agora tem sua
// própria flag, independentes.
const A11Y_AUTO_MAPPING_HIDDEN_LEITOR = false;
const A11Y_AUTO_MAPPING_HIDDEN_TABULACAO = true;
// Ocultado de novo (2026-09-18, pedido do usuário): o scan próprio
// (generate-swipe-path-from-layers) ficou funcional depois da correção de
// tradução clone→original, mas a ORDEM final (zigue-zague sobre os
// componentes reais encontrados) ainda produz uma trilha reta/errática em
// telas reais — fica pra depois, com a lógica intacta (nada foi apagado,
// só o botão de entrada esconde de novo, mesmo padrão já usado antes pra
// Tabulação). Manter só o caminho manual visível por enquanto.
const A11Y_AUTO_MAPPING_HIDDEN_SWIPE = true;

// Cores reais extraídas dos fills dos componentes publicados na lib "Design
// Acessível". O selo (Tag/Chip) de cada categoria usa a cor "color" no
// stroke/texto e "fill" como tinta de fundo.
//
// "shape" (2026-09-16) — forma geométrica REAL do marcador na lib publicada,
// confirmada inspecionando o arquivo Figma (fileKey Wy0IhXRVZMSOOr8E609UqI):
// círculo cheio (elemento/titulo/decorativo), estrela de 5 pontas cheia
// (estrutura) ou quadrado arredondado cheio (informacoes).
//
// "badge" continua sendo o CONTEÚDO textual gravado de fato em spec.letter
// quando a categoria tem selo fixo (ver confirmA11ySpec: `letter =
// meta.badge` pro caso 'decorativo') — não pode virar null só por causa do
// SVG novo, sob risco de specs decorativas perderem a letra 'Ø' salva no
// dado real e exibida no card da listagem (_a11ySpecItemHtml). O SVG de
// badge (renderA11yCategoryBadgeSvg) NÃO usa badge='Ø' como texto: pra
// categoryKey === 'decorativo' ele ignora badge e desenha o ícone vetorial
// de "proibido" (círculo vazado + barra diagonal) por cima da forma, que é a
// representação fiel do componente real — 'Ø' continua existindo só como
// selo textual gravado no dado (specs/Ficha/Ordem de Tabulação). Pra
// 'titulo', badge='H' é só o valor MOBILE (sem distinção de nível) — o valor
// web ("H1", número do nível real) é resolvido em runtime dentro de
// renderA11yCategoryBadgeSvg via isA11yMobileProject(), não hardcoded aqui.
// "textColor" (2026-09-22) — variante ESCURECIDA de "color", mesma família
// de matiz, só pra texto/ícone pintado DIRETO sobre "fill" (chip/pill de
// categoria já documentada — _a11ySpecItemHtml, _a11yAreaAccordionEl). Não
// existe na lib real (não é uma cor "oficial" do componente) — é uma
// correção puramente de legibilidade: "color" bruto sobre "fill" claro
// falha WCAG AA (limiar 4.5:1 — texto 12px bold NÃO qualifica como "texto
// grande", que exigiria só 3:1). Auditoria 2026-09-22 (recalculada com o
// limiar certo): elemento 1.56, estrutura 2.44, titulo 1.72, decorativo
// 3.82, informacoes 2.11 — as 5 falhavam. Valores abaixo confirmados via
// REST API contra os componentes reais [hac] Agrupamento (fileKey
// HhriLSpKnCB2dHhyiU16iB) e recalculados para passar >=4.5:1 em todas.
// "color" continua sendo a cor de IDENTIDADE (círculo/estrela/quadrado
// cheio nos badges SVG, stroke do chip) — nunca trocar "color" por
// "textColor" nesses usos, só nos pontos onde o texto senta em cima do
// "fill" claro. Ver também A11Y_BADGE_TEXT_COLOR abaixo — cor do texto
// DENTRO do badge de letra (círculo/estrela/quadrado cheio), que é um caso
// diferente: ali o fundo é "color" (sólido), não "fill" (claro).
const A11Y_CATEGORIES = {
  elemento:    { label: 'Elementos e Imagens',     icon: 'image',   color: '#FCBE05', textColor: '#8D6A03', fill: '#FFF6DC', badge: null, shape: 'circle' },
  estrutura:   { label: 'Estrutura da Página',     icon: 'star',    color: '#EF765E', textColor: '#A75342', fill: '#FDEAE6', badge: null, shape: 'star' },
  // label abaixo é o valor WEB (default/fallback quando a origem não está
  // disponível no ponto de consumo) — RN não tem hierarquia H1-H6, então o
  // rótulo correto em contexto mobile é "Títulos" (sem "Nível"), confirmado
  // no print real da modal "[HAC] Handoff Super DSC Mobile e Web",
  // 2026-09-16. Nunca ler A11Y_CATEGORIES[key].label diretamente para a
  // categoria 'titulo' fora daqui — use getA11yCategoryLabel(key, origin).
  titulo:      { label: 'Nível de Título',         icon: 'heading', color: '#AFCA0B', textColor: '#677706', fill: '#F5F9DA', badge: 'H', shape: 'circle' },
  decorativo:  { label: 'Elemento Decorativo',     icon: 'ban',     color: '#D93636', textColor: '#C33131', fill: '#FBE4E4', badge: 'Ø', shape: 'circle' },
  informacoes: { label: 'Informações Adicionais',  icon: 'info',    color: '#F39200', textColor: '#A06000', fill: '#FEF1DE', badge: null, shape: 'square' },
};

// Cor do texto/letra DENTRO do badge cheio (círculo/estrela/quadrado com
// "color" sólido de fundo) — NÃO confundir com "textColor" acima (que é
// texto sobre "fill" claro). Confirmado via REST API contra os componentes
// REAIS [hac] Agrupamento na lib publicada (elemento/titulo/decorativo/
// estrutura): o texto "Number" dentro do componente usa #22292E (escuro),
// não branco — o hac divergia da própria lib nesse ponto. 'decorativo' é a
// única exceção: fundo #D93636 é escuro o bastante pra passar AA (4.63:1)
// com branco, e a lib usa um badge mais escuro ali. Nunca hardcodar
// 'text-white'/'#FFFFFF' de novo pros badges de letra — ler daqui.
const A11Y_BADGE_TEXT_COLOR_DARK = '#22292E';
const A11Y_BADGE_TEXT_COLOR_LIGHT = '#FFFFFF';
function getA11yBadgeTextColor(categoryKey) {
  return categoryKey === 'decorativo' ? A11Y_BADGE_TEXT_COLOR_LIGHT : A11Y_BADGE_TEXT_COLOR_DARK;
}

// Rótulo mobile de 'titulo' — só essa categoria varia por origem (RN não tem
// hierarquia de nível; as outras 4 categorias têm o mesmo nome nas duas
// plataformas). Ponto único de correção se a lib mudar o nome publicado.
const A11Y_CATEGORY_LABEL_MOBILE_OVERRIDES = {
  titulo: 'Títulos',
};

// Resolve o label de exibição de uma categoria já considerando a origem
// (web/mobile) — fonte única para qualquer consumidor (cards de spec,
// accordions de contagem, título do modal de especificação, picker,
// modal "Entendendo as categorias"), evitando duplicar a condicional em
// cada ponto de uso. `origin` aceita 'web'/'mobile' explícito (ex.:
// spec.a11yOrigin, modal.dataset.a11yOrigin); quando omitido, cai no
// projeto atual via isA11yMobileProject().
function getA11yCategoryLabel(categoryKey, origin) {
  const cat = A11Y_CATEGORIES[categoryKey];
  if (!cat) return '';
  const isMobile = origin ? origin === 'mobile' : (typeof isA11yMobileProject === 'function' && isA11yMobileProject());
  if (isMobile && A11Y_CATEGORY_LABEL_MOBILE_OVERRIDES[categoryKey]) {
    return A11Y_CATEGORY_LABEL_MOBILE_OVERRIDES[categoryKey];
  }
  return cat.label;
}
window.getA11yCategoryLabel = getA11yCategoryLabel;

// ── Badge SVG unificado das 5 categorias ────────────────────────────────────
// Reproduz fielmente a forma real de cada categoria na lib "Design Acessível"
// (círculo/estrela/quadrado cheios, cor sólida da categoria) em vez do ícone
// Lucide semântico genérico usado até 2026-09-16. Usado na modal "Entendendo
// as categorias" (renderA11yCategoriesHelpBadges) e no picker de categoria
// (a11y-category-picker-modal) — ambos só ilustrativos, nunca uma spec real.
// O card real de spec na listagem (_a11ySpecItemHtml) usa a letra VERDADEIRA
// da instância (spec.letter) num círculo simples — não foi migrado pra este
// SVG porque nem toda categoria é círculo (estrela/quadrado exigiriam
// reescrever esse template com risco de regressão visual na listagem;
// decisão: manter como está).
//
// Conteúdo interno por categoria, confirmado nos prints reais da modal
// "Especificações para Leitores de Tela" (2026-09-16):
//   - elemento: NÚMERO ilustrativo fixo "1" (2026-09-22, corrigido de letra
//     "A" — "Elementos e Imagens" sugere tag NUMÉRICA desde 2026-09-18
//     (pedido do usuário, ver _suggestNextA11yTagForArea: "pra não
//     conflitar com o nível de título"), mas o SVG ilustrativo do picker
//     nunca foi atualizado junto, continuava mostrando "A" — divergindo
//     do dado real gravado em spec.letter)
//   - estrutura: estrela SEM nenhuma letra/conteúdo (vazia) — só existe na
//     versão web, nunca chamada em contexto mobile
//   - titulo: badge muda por origem — "H1" (web, número do nível real; aqui
//     é sempre "1" fixo, ilustrativo) ou "H" genérico (mobile, sem
//     distinção de nível) — decidido em runtime via isA11yMobileProject()
//   - decorativo: sem letra, ícone vetorial de "proibido"
//   - informacoes: letra ilustrativa fixa "A" (categoria usa letras reais,
//     ver _suggestNextA11yTagForArea — só 'elemento' é numérica)
//
// size: lado do viewBox em px (o SVG é sempre quadrado, a estrela/quadrado
// ficam inscritos nesse quadrado). letterOverride: usado pra sobrescrever a
// letra ilustrativa das categorias sem badge fixo (elemento/informacoes)
// quando o chamador quiser outra letra que não "A".
function renderA11yCategoryBadgeSvg(categoryKey, size, letterOverride) {
  const cat = A11Y_CATEGORIES[categoryKey];
  if (!cat) return '';
  size = size || 28;
  const cx = size / 2;
  const cy = size / 2;
  const color = cat.color;

  let shapeSvg = '';
  if (cat.shape === 'star') {
    shapeSvg = '<polygon points="' + _a11yStarPoints(cx, cy, size * 0.48, size * 0.19) + '" fill="' + color + '"/>';
  } else if (cat.shape === 'square') {
    const rectSize = size * 0.86;
    const rectOffset = (size - rectSize) / 2;
    const rx = size * 0.18;
    shapeSvg = '<rect x="' + rectOffset + '" y="' + rectOffset + '" width="' + rectSize + '" height="' + rectSize + '" rx="' + rx + '" fill="' + color + '"/>';
  } else {
    shapeSvg = '<circle cx="' + cx + '" cy="' + cy + '" r="' + (size * 0.48) + '" fill="' + color + '"/>';
  }

  // Conteúdo interno: ícone vetorial de "proibido" (decorativo, sem letra),
  // estrela vazia (estrutura, sem letra), badge por origem (título:
  // "H1" web / "H" mobile) ou letra de exemplo ilustrativa.
  let contentSvg = '';
  if (categoryKey === 'decorativo') {
    contentSvg = _a11yBanIconSvg(cx, cy, size * 0.30);
  } else if (categoryKey === 'estrutura') {
    contentSvg = ''; // estrela sempre vazia nos prints de referência — nunca chamada em contexto mobile
  } else {
    let letter;
    if (categoryKey === 'titulo') {
      letter = (typeof isA11yMobileProject === 'function' && isA11yMobileProject()) ? 'H' : 'H1';
    } else if (categoryKey === 'elemento') {
      // Numérica, não alfabética — ver _suggestNextA11yTagForArea. letterOverride
      // continua tendo prioridade (chamador pode querer ilustrar outro número).
      letter = cat.badge || letterOverride || '1';
    } else {
      letter = cat.badge || letterOverride || 'A';
    }
    // Fonte reduzida pra badges de 2+ caracteres (ex.: "H1"), senão vaza do
    // círculo — 1 caractere (A, H, Ø...) continua no tamanho original.
    const fontSize = Math.round(size * (letter.length > 1 ? 0.34 : 0.46));
    // Cor do texto do badge: #22292E (escuro) pra alinhar com o componente
    // REAL da lib publicada, exceto 'decorativo' (branco) — ver
    // getA11yBadgeTextColor / A11Y_BADGE_TEXT_COLOR_DARK acima.
    const badgeTextColor = getA11yBadgeTextColor(categoryKey);
    contentSvg = '<text x="' + cx + '" y="' + cy + '" text-anchor="middle" dominant-baseline="central" ' +
      'font-family="inherit" font-weight="800" font-size="' + fontSize + '" fill="' + badgeTextColor + '">' + escapeHtml(letter) + '</text>';
  }

  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" ' +
    'xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">' + shapeSvg + contentSvg + '</svg>';
}
window.renderA11yCategoryBadgeSvg = renderA11yCategoryBadgeSvg;

// Pontos da estrela de 5 pontas (Estrutura da Página), cheia, apontada pra
// cima — outerR/innerR calculados a partir do size recebido em
// renderA11yCategoryBadgeSvg (proporção fixa 0.48/0.19, igual à estrela
// publicada na lib real).
function _a11yStarPoints(cx, cy, outerR, innerR) {
  const points = [];
  const spikes = 5;
  const step = Math.PI / spikes;
  let rot = -Math.PI / 2; // primeira ponta apontando pra cima
  for (let i = 0; i < spikes; i++) {
    points.push((cx + Math.cos(rot) * outerR) + ',' + (cy + Math.sin(rot) * outerR));
    rot += step;
    points.push((cx + Math.cos(rot) * innerR) + ',' + (cy + Math.sin(rot) * innerR));
    rot += step;
  }
  return points.join(' ');
}

// Ícone universal de "proibido" (círculo vazado + barra diagonal), desenhado
// em vetor puro branco sobre o fundo vermelho sólido de "decorativo" — mesma
// leitura visual do componente real da lib (círculo vazado riscado), sem
// depender do glyph Lucide "ban".
function _a11yBanIconSvg(cx, cy, r) {
  const strokeWidth = Math.max(1.5, r * 0.18);
  const diag = r * 0.68;
  return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="#FFFFFF" stroke-width="' + strokeWidth + '"/>' +
    '<line x1="' + (cx - diag) + '" y1="' + (cy + diag) + '" x2="' + (cx + diag) + '" y2="' + (cy - diag) + '" stroke="#FFFFFF" stroke-width="' + strokeWidth + '" stroke-linecap="round"/>';
}

// Conteúdo real da lib (Descrição / Observações / Notas de Código). Mantido
// como literal JS (não JSON importado) porque o bundle do frontend é um
// único <script> concatenado sem require/import.
const A11Y_CONTENT = {
  elemento: {
    componentes: {
      accordion:     { descricao: 'Identificar como button e ler o seu rótulo visível em tela.', notasCodigo: 'O título de cada cabeçalho do accordion deve ser atrelado em um elemento com a role="button", considerar também o status do painel como expandindo ou recolhido com o atributo aria-expanded.' },
      breadcrumb:    { descricao: 'Agrupar e identificar como link, deve ler o seu rótulo visível em tela.' },
      button:        { descricao: 'Identificar como button e ler o seu rótulo visível em tela.' },
      checkbox:      { descricao: 'Identificar como checkbox.', notasCodigo: 'Em HTML, identificar o status do componente como desmarcado com o atributo aria-checked="false". Deve-se também inserir aria-label para adicionar um nome acessível ao elemento.' },
      dialog:        { descricao: 'Identificar como dialog e anunciar o título seguido do conteúdo assim que o componente for apresentado em tela.', notasCodigo: 'Em HTML é necessário atrelar os seguintes atributos ao componente: aria-labelledby, aria-describedby e aria-modal.' },
      inputs:        { descricao: 'Agrupar e identificar como textbox.' },
      link:          { descricao: 'Identificar como link e ler o seu rótulo visível em tela.' },
      listas:        { descricao: 'Construir como lista ordenada.', notasCodigo: 'Em HTML utilize a tag <ol>.' },
      paginator:     { descricao: 'Identificar como combobox e ler a quantidade de itens por página, seleção atual e o status do componente como recolhido ou expandido.', notasCodigo: 'Em HTML, identificar o status do componente como "expandido" ou "recolhido" com aria-expanded. Utilizar aria-labelledby para indicar o elemento que rotula a caixa de combinação e aria-controls para definir que o componente funciona como um pop-up.' },
      'radio button':{ descricao: 'Identificar como radio button.', notasCodigo: 'Identificar o status do componente como marcado ou desmarcado com o atributo aria-checked="true" ou "false". Deve-se também, inserir aria-label para adicionar um nome acessível ao elemento.' },
      snackbar:      { descricao: 'Identificar como alert, deve interromper outros processos e anunciar o conteúdo da notificação sem mover o foco para ele.', notasCodigo: 'Em HTML, o atributo aria-live="assertive" está implícito na função de alerta.' },
      stepper:       { descricao: 'Agrupar e identificar como tab. Deve-se ler o seu rótulo visível junto de sua localização no grupo. A exemplo: "1 de 3". Também considerar o status do elemento como "selecionado".', notasCodigo: 'Em HTML, deve ser fornecido a role="tablist" por padrão, role="tab" quando selecionado e role="tabpanel" quando expandindo. O atributo aria-selected é definido automaticamente com base na alteração da seleção.' },
      switch:        { descricao: 'Identificar como switch.', notasCodigo: 'Identificar o status do componente como marcado ou desmarcado com o atributo aria-checked="true" ou "false". Deve-se também, inserir aria-label para adicionar um nome acessível ao elemento.' },
      table:         { descricao: 'Identificar como table e ler a sua estrutura com a quantidade de linhas e colunas.', notasCodigo: 'Inserir o atributo aria-label em HTML para adicionar um nome acessível e aria-describedby="IDREF" referindo-se a legenda para a tabela.' },
      'tab group':   { descricao: 'Agrupar e identificar como tab. Deve-se ler o seu rótulo visível junto de sua localização no grupo. A exemplo: "1 de 3". Também considerar o status do componente quando estiver "selecionado".', notasCodigo: 'Em HTML, deve ser fornecido a role="tablist" por padrão, role="tab" quando selecionado e role="tabpanel" quando expandindo. O atributo aria-selected é definido automaticamente com base na alteração da seleção.' },
      imagem:        { descricao: 'Inserir o seguinte texto alternativo no elemento: [insira aqui o texto alternativo].', notasCodigo: 'Insira seu texto com as anotações necessárias para o pessoal de desenvolvimento.' },
    },
    // Conteúdo exclusivo da sub-variante mobile "link" (ver
    // A11Y_ELEMENTO_MOBILE_VARIANTS) — Descrição fixa e travada (não
    // editável), texto igual ao já usado no catálogo desktop pro componente
    // "link" (A11Y_CONTENT.elemento.componentes.link), mas com a menção
    // explícita de abertura de nova janela/foco que a doc da vertical exige
    // aqui. Chave própria em vez de reutilizar 'link' pra não colidir com o
    // catálogo de 16 componentes indexado por nome.
    mobileLink: {
      descricao: 'Identificar como link e anunciar que o link abre uma nova janela e direciona o foco para ela.',
    },
  },
  estrutura: {
    idiomas: {
      'da pagina':  { descricao: 'Indicar o idioma predominante da página como: [insira aqui o idioma].', notasCodigo: 'Em HTML Insira o atributo lang e defina o idioma principal da página, por exemplo: Para português do Brasil: <html lang="pt-br">. Para inglês: <html lang="en">. Para espanhol: <html lang="es">.' },
      'das partes': { descricao: 'Indicar a(s) palavras(s) em um idioma.', notasCodigo: 'Em HTML, use o atributo lang para declarar o conteúdo circundante como links ou outras partes do texto.' },
    },
    marco: {
      header: { descricao: 'Indicar como cabeçalho.', notasCodigo: 'Em HTML use a tag <header> para um cabeçalho de uma seção ou página.' },
      nav:    { descricao: 'Indicar como navegação.', notasCodigo: 'Em HTML use a tag <nav> para agrupar os link.' },
      main:   { descricao: 'Indicar o conteúdo como principal da página.', notasCodigo: 'Em HTML <main> não deve ser usado dentro de elementos como <article>, <aside>, <footer>, <header> ou <nav>.' },
      aside:  { descricao: 'Indicar como seção.', notasCodigo: 'Em HTML <aside> possui um significado semântico, indicando que o conteúdo é "à parte", mas relacionado.' },
      footer: { descricao: 'Indicar como rodapé.', notasCodigo: 'Em HTML use a tag <footer> para agrupar informações relacionadas à parte inferior de uma página ou seção.' },
    },
    // Nota de Código mobile do marco de navegação (React Native não tem tags
    // HTML de landmark — usa accessibilityRole, seguindo o mesmo princípio já
    // aplicado em A11Y_CONTENT.titulo.mobile). Chave própria por tipo pra
    // manter o valor correto de accessibilityRole em cada marco (RN não tem
    // um role único de "landmark genérico" equivalente a <header>/<nav>/etc).
    marcoMobile: {
      header: { notaCodigo: 'accessibilityRole="header"' },
      nav:    { notaCodigo: 'accessibilityRole="menu" (ou "navigation" nas plataformas/bibliotecas que suportarem o role customizado)' },
      main:   { notaCodigo: 'accessibilityRole="summary" (ou marcar o container principal da tela via accessible={true} agrupando o conteúdo, já que RN não tem role nativo equivalente a <main>)' },
      aside:  { notaCodigo: 'accessibilityRole="summary" (papel semântico aproximado: RN não tem role nativo equivalente a <aside>; descrever o agrupamento via accessibilityLabel)' },
      footer: { notaCodigo: 'accessibilityRole="summary" (papel semântico aproximado: RN não tem role nativo equivalente a <footer>; descrever o agrupamento via accessibilityLabel)' },
    },
    tituloPagina: { descricao: 'Definir o título da página como: [insira aqui o título].', notasCodigo: 'Definir usando a tag <title> no HTML.' },
    customizavel: { descricao: 'Insira seu texto da descrição.', notasCodigo: 'Insira seu texto com as anotações necessárias para o pessoal de desenvolvimento.' },
  },
  titulo: {
    niveis: {
      h1: { descricao: 'Identificar como título de nível 1.' },
      h2: { descricao: 'Identificar como título de nível 2.' },
      h3: { descricao: 'Identificar como título de nível 3.' },
      h4: { descricao: 'Identificar como título de nível 4.' },
      h5: { descricao: 'Identificar como título de nível 5.' },
      h6: { descricao: 'Identificar como título de nível 6.' },
    },
    mobile: { descricao: 'Identificar como título.', notaCodigo: 'accessibilityRole="header"' },
  },
  decorativo: {
    gerais: { descricao: 'Não deve ser anunciado pelo Leitor de Tela.', notasCodigo: 'Insira seu texto com as anotações necessárias para o pessoal de desenvolvimento.' },
    imagem: { descricao: 'Não deve ser anunciado pelo Leitor de Tela.', notasCodigo: 'Em HTML utilize o atributo alt="" com o valor vazio.' },
    // Mobile (confirmado via REST API, fileKey HhriLSpKnCB2dHhyiU16iB, node
    // 5413:1260, 2026-09-22): o wrapper "[hac mob] Box specs leitor de tela"
    // não tem a distinção "Gerais"/"Imagem" — a instância aninhada
    // "Elementos decorativos" (componentId 5370:1835) só tem UMA property
    // real ("Observações", BOOLEAN) e nenhuma property "variacao"/"tipo"
    // equivalente à `[NÃO UTILIZAR][a11y base] elementos decorativos`
    // (node 31:530, property "variacao": "gerais"/"imagem") que só existe no
    // wrapper desktop ("[a11y] Box specs LT", node 31:544). A Descrição fixa
    // da instância mobile é idêntica à de "gerais"/"imagem" web, mas não há
    // Nota de Código nenhuma na lib mobile (nem HTML nem RN) — por isso
    // `notasCodigo` fica ausente aqui, e o card fixo de Nota de Código some
    // no formulário mobile (ver _applyA11yDecorativoOriginLock).
    mobile: { descricao: 'Não deve ser anunciado pelo Leitor de Tela.' },
  },
  informacoes: {
    handoffs:      { descricao: 'Especificado no handoff: [insira aqui o link ou nome do handoff].' },
    conteudoExtra: { descricao: 'Saiba mais em: [insira aqui o link ou nome do conteúdo].' },
    customizavel:  { descricao: 'Insira seu texto da descrição.' },
  },
};

// Rótulos amigáveis dos 16 componentes do catálogo (mesma chave usada em
// A11Y_CONTENT.elemento.componentes) — só pra exibição no <select>.
const A11Y_COMPONENTE_LABELS = {
  accordion: 'Accordion', breadcrumb: 'Breadcrumb', button: 'Button', checkbox: 'Checkbox',
  dialog: 'Dialog', inputs: 'Inputs', link: 'Link', listas: 'Listas', paginator: 'Paginator',
  'radio button': 'Radio Button', snackbar: 'Snackbar', stepper: 'Stepper', switch: 'Switch',
  table: 'Table', 'tab group': 'Tab Group', imagem: 'Imagem',
};

// Léxico de tradução shortName → fala em português natural, usado SÓ pela
// Simulação de leitura por voz da Ordem de Tabulação (2026-09-09,
// resolve-tab-order-narration em code.js). Deliberadamente SEPARADO de
// A11Y_COMPONENTE_LABELS acima: aquele é vocabulário técnico (nomes de
// componente em inglês/misto, ex. "Button", "Radio Button" — correto para
// exibição em UI/<select>) mas soaria estranho narrado em voz por um
// "leitor de tela simulado" em português. Cobre os shortNames de
// A11Y_INTERACTIVE_SHORTNAMES (code.js) — o vocabulário de controles reais
// de foco de teclado que a simulação de fato percorre — mais os fallbacks
// de tipo nativo que o backend pode devolver quando não há match DSC (ex.
// 'texto', para um TEXT node solto). shortName sem entrada aqui narra só o
// nome do elemento, sem prefixo de tipo (ver _tabOrderNarrationPhrase).
const A11Y_NARRATION_TYPE_LABELS = {
  button: 'Botão',
  checkbox: 'Caixa de seleção',
  'radio button': 'Botão de opção',
  switch: 'Alternador',
  inputs: 'Campo de texto',
  paginator: 'Paginação',
  stepper: 'Seletor numérico',
  'tab group': 'Grupo de abas',
  accordion: 'Acordeão',
  breadcrumb: 'Trilha de navegação',
  listas: 'Lista',
  link: 'Link',
  texto: 'Texto',
};

// Espelho em inglês do léxico acima — usado quando o designer escolhe EN no
// seletor de idioma ao lado de "Simular leitura" (pedido do usuário,
// 2026-09-09: "mantemos EN e PT só pela nomenclatura dos itens", ou seja, só
// o IDIOMA/pronúncia da síntese de voz muda — o NOME do elemento continua
// vindo como está gravado no Figma, só o rótulo do tipo troca de idioma
// junto com utterance.lang em _tabOrderNarrationPhrase/_tabOrderNarrationAdvance).
const A11Y_NARRATION_TYPE_LABELS_EN = {
  button: 'Button',
  checkbox: 'Checkbox',
  'radio button': 'Radio button',
  switch: 'Switch',
  inputs: 'Text field',
  paginator: 'Pagination',
  stepper: 'Stepper',
  'tab group': 'Tab group',
  accordion: 'Accordion',
  breadcrumb: 'Breadcrumb',
  listas: 'List',
  link: 'Link',
  texto: 'Text',
};

// ── Component properties reais dos 25 component sets internos "[a11y base]"
// da lib "Design Acessível" — extraído via REST API. Fonte de verdade agora é
// o arquivo GERADO refs/_a11y-constants.generated.js (concatenado no bundle
// ANTES deste módulo, ver build.cjs), produzido por
// refs/build-a11y-constants.cjs a partir de refs/design-acessivel-
// properties.json. Alias mantido com o nome histórico para não exigir
// alterar todos os pontos de consumo já espalhados neste arquivo. Regenerar
// via: npm run refs:a11y-constants (NÃO editar A11Y_COMPONENT_PROPERTIES à
// mão — a fonte real é o JSON extraído da API).
const A11Y_COMPONENT_PROPERTIES = A11Y_COMPONENT_PROPERTIES_GENERATED;

// O <select> de "Elementos e Imagens" usa a chave "imagem" (mesma de
// A11Y_CONTENT.elemento.componentes), mas o component set real correspondente
// na lib se chama "texto alternativo para imagens" — os outros 15 valores do
// select já casam 1:1 com o shortName do component set.
const _A11Y_SELECT_TO_SHORTNAME = {
  imagem: 'texto alternativo para imagens',
};

// Vocabulário canônico dos toggles booleanos encontrados nos 25 component
// sets — a lib tem erros de digitação inconsistentes entre componentes:
//   "nome acesivel" (Switch, Texto alternativo) / "nome acessivel" (maioria)
//   / "nome acessível" (Breadcrumb, com acento) → nomeAcessivel
//   "observacao" (Breadcrumb, singular) / "observacoes" (maioria)          → observacoes
//   "notas" (maioria) / "notas de codigo" (Accordion, Snackbar)            → notas
function _normalizeA11yToggleName(rawName) {
  const s = String(rawName || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos
    .toLowerCase()
    .trim();
  if (s === 'nome acesivel' || s === 'nome acessivel') return 'nomeAcessivel';
  if (s === 'observacao' || s === 'observacoes') return 'observacoes';
  if (s === 'notas' || s === 'notas de codigo') return 'notas';
  return null; // property que não é um dos 3 toggles canônicos (ex: variantes, texto "letter")
}

// Rótulos amigáveis dos toggles canônicos — usados no formulário dinâmico
// (label do checkbox) e na persistência (properties[].label).
const A11Y_TOGGLE_LABELS = {
  nomeAcessivel: 'Nome Acessível',
  observacoes: 'Observações',
  notas: 'Notas de Código',
  // Exclusivos do wrapper mobile "[a11y mob] Box specs leitor de tela"
  // (fileKey 3zdtN13YvPlCGPdXeL0Y2i, node 5413:1262, variante "Conector=
  // Elementos e imagens") — confirmados via REST API, NÃO existem no
  // wrapper desktop equivalente ("[a11y] Box specs LT"). Ver
  // A11Y_MOBILE_ONLY_TOGGLES abaixo.
  accessibilityHint: 'Dica para Leitor de Tela',
  linkComponente: 'Link do Componente',
};

// Limite de caracteres dos textareas de toggle dinâmico (Observações/Notas de
// Código/Dica para Leitor de Tela) — anotações livres pro dev, podem ser mais
// longas que um label, mas ainda devem caber num card de spec sem virar bloco
// de texto. "notas" (Notas de Código) usa um teto maior por poder incluir
// referência técnica (ex: nome de prop/atributo) junto da explicação.
const A11Y_TOGGLE_MAXLENGTH = {
  notas: 500,
  observacoes: 400,
  accessibilityHint: 300,
  linkComponente: 300,
};
const A11Y_TOGGLE_MAXLENGTH_DEFAULT = 400;

// Toggle que só existia no wrapper mobile ANTIGO, na sub-variante
// "componente" — chave própria, fora de A11Y_COMPONENT_PROPERTIES (catálogo
// desktop): a origem desse campo era o texto da lib mobile ANTIGA (fileKey
// 3zdtN13YvPlCGPdXeL0Y2i, DESCONTINUADA — "📍 Instruções (comece por aqui)",
// node 811:866), confirmado via REST API em 2026-08-31 (ver
// refs/design-acessivel-mobile-link-property.json).
//
// Removido do FORMULÁRIO de specs NOVAS em 2026-09-17: não corresponde a
// nenhuma property real confirmada na lib NOVA (fileKey HhriLSpKnCB2dHhyiU16iB)
// — nem no component set ".[hac mob base] Elementos e imagens" (nível do
// set), nem em nenhuma das 66 instâncias aninhadas por variante (ver
// extractPerVariantProperties/A11Y_MOBILE_COMPONENTS_WITH_NOME_ACESSIVEL,
// mesmo dado real usado pra confirmar "Nome Acessível" — "Dica Leitor de
// Tela"/"Dica para Leitor de Tela" não aparece em nenhuma delas).
//
// A constante e o array seguem existindo (não removidos) só pra alimentar a
// RESTAURAÇÃO de specs antigas que já salvaram esse campo preenchido — ver
// A11Y_MOBILE_ONLY_TOGGLE_KEYS_LEGACY (chaves aceitas em
// _restoreA11yElementoMobileToggles) e o princípio de dado histórico já
// aplicado a 'nomeAcessivel' no restante deste arquivo. Nenhum ponto de
// RENDERIZAÇÃO de spec nova itera mais A11Y_MOBILE_ONLY_TOGGLES.
const A11Y_MOBILE_ONLY_TOGGLES = [
  { key: 'accessibilityHint', label: 'Dica para Leitor de Tela', placeholder: 'Inserir o seguinte accessibilityHint: [explicação sobre o que acontecerá após a ação].' },
];
// Chaves aceitas por _restoreA11yElementoMobileToggles (dado histórico) —
// mesma lista de sempre, só nomeada explicitamente agora que
// A11Y_MOBILE_ONLY_TOGGLES não é mais usada para renderizar specs novas.
const A11Y_MOBILE_ONLY_TOGGLE_KEYS_LEGACY = A11Y_MOBILE_ONLY_TOGGLES.map(t => t.key);

// As 3 sub-variantes mutuamente exclusivas de "Elementos e Imagens" mobile —
// strings EXATAS da property VARIANT real "Variante" do component set
// ".[a11y mob base] Elementos e imagens" (fileKey 3zdtN13YvPlCGPdXeL0Y2i,
// node 5362:961), confirmadas via REST API em 2026-08-31 (ver
// refs/design-acessivel-mobile-link-property.json). Não usar camelCase
// aqui — o valor persistido em a11ySubtype.variant precisa bater 1:1 com a
// nomenclatura real do Figma, ainda que as chaves deste objeto (JS) usem
// nomes mais convenientes.
const A11Y_ELEMENTO_MOBILE_VARIANTS = {
  componente: 'componente',
  link: 'link',
  textoAlternativo: 'texto alternativo',
};

// As opções reais do dropdown VARIANT "Componente" do component set
// ".[hac mob base] Elementos e imagens" (fileKey HhriLSpKnCB2dHhyiU16iB, lib
// NOVA — migrado 2026-09-15 da lib antiga ".[a11y mob base] Link do
// Componente", fileKey 3zdtN13YvPlCGPdXeL0Y2i, DESCONTINUADA) — hoje 78
// nomes exatos, na mesma ordem retornada pela API. Fonte de verdade é o
// arquivo GERADO refs/_a11y-constants.generated.js (concatenado no bundle
// ANTES deste módulo, ver build.cjs), produzido por
// refs/build-a11y-constants.cjs a partir de
// refs/design-acessivel-mobile-properties.json. Alias mantido com o nome
// histórico ("Link") para não exigir alterar todos os pontos de consumo já
// espalhados neste arquivo — o campo em si documenta o COMPONENTE
// vinculado, não um link avulso. Diferente da lib antiga, NÃO existe opção
// "Personalizado"/"Outro" no catálogo real: quando o auto-match por nome
// exato não encontra nada, o formulário cai no modo de texto livre (ver
// buildMobileLinkOptions em build-a11y-constants.cjs). Este dropdown é só
// um RÓTULO textual (type VARIANT, não INSTANCE_SWAP) — não há vínculo de
// componente real por trás de cada opção. Regenerar via: npm run
// refs:a11y-constants (NÃO editar A11Y_MOBILE_LINK_COMPONENT_OPTIONS à
// mão).
const A11Y_MOBILE_LINK_COMPONENT_OPTIONS = A11Y_MOBILE_LINK_COMPONENT_OPTIONS_GENERATED;
const A11Y_MOBILE_LINK_URL_PLACEHOLDER = '[insira aqui o link do componente]. Se o componente não estiver na lista acima, escreva o nome real dele aqui: é assim que a vertical de a11y sabe que falta mapear esse componente na lib.';

// Tabela nome-do-dropdown -> node_id do component set REAL na lib "DSC |
// Super App" (fileKey abaixo) — só os nomes com match EXATO e sem
// ambiguidade contra os containingFrame reais (hoje 46 dos 66 nomes reais do
// catálogo da lib "Elementos e imagens"; os demais, incl. a opção sintética
// "Personalizado" — ver _renderA11yElementoMobileFields —, não têm
// correspondência segura e ficam de fora, mantendo o preenchimento manual).
// Números batem exatamente com o array/tabela gerados em
// refs/_a11y-constants.generated.js; não hardcodar de novo se mudarem — só
// documentativo aqui. Gerada 100% a partir do dado extraído
// via REST API (refs/super-app.json + refs/_manifest.json) por
// refs/build-a11y-constants.cjs — NÃO editar à mão, e nunca usar como tabela
// estática: se o componente mudar de nodeId/for renomeado na lib real, o
// próximo refresh do skeleton (fetch-design-refs.cjs → build-skeleton.cjs →
// build-a11y-constants.cjs, o mesmo pipeline do CI semanal) já atualiza este
// arquivo gerado. Consumida por _autofillA11yMobileLinkUrlFromComponentName.
const A11Y_MOBILE_COMPONENT_LINK_NODE_IDS = A11Y_MOBILE_COMPONENT_LINK_NODE_IDS_GENERATED;

// Nomes dos componentes reais (mesma grafia de A11Y_MOBILE_LINK_COMPONENT_
// OPTIONS) cuja instância aninhada, no component set real ".[hac mob base]
// Elementos e imagens", declara a property BOOLEAN "Nome Acessível" — dado
// 100% extraído via REST API (extractPerVariantProperties em
// fetch-component-properties.cjs, camada "instância aninhada por variante"),
// nunca hardcodado à mão. Hoje 26/65 componentes reais (confirmado
// 2026-09-17). Consumido por _updateA11yMobileNomeAcessivelVisibility pra
// mostrar/esconder o toggle informativo "Nome Acessível" (só indicativo — o
// texto em si continua vindo do campo Label do topo do formulário, ver
// A11Y_TOGGLE_LABELS.nomeAcessivel/_buildA11yElementoPayload equivalente
// mobile) conforme o componente escolhido no dropdown "Link do Componente".
const A11Y_MOBILE_COMPONENTS_WITH_NOME_ACESSIVEL = A11Y_MOBILE_COMPONENTS_WITH_NOME_ACESSIVEL_GENERATED;

// Dropdown "Leitor de Tela" (decisão de produto 2026-09-17): mapa {
// [nomeComponente]: { subModeProperty, variants: [{name, hasNomeAcessivel}] } }
// — só contém os componentes cuja instância aninhada é, ela mesma, uma folha
// de um SEGUNDO component set oculto com sub-variantes de sub-modo (ex:
// "Leitor de Tela"={Baseline,Disabled,Loading} do Button). Presença de uma
// chave aqui é o sinal para o formulário renderizar o dropdown novo; ausência
// = componente "folha simples", sem dropdown, comportamento antigo mantido.
// 100% derivado de screenReaderVariants (fetch-component-properties.cjs,
// --deep-scan) — nunca hardcodar à mão. Consumido por
// _renderA11yElementoMobileFields/_updateA11yMobileScreenReaderVariantOptions/
// _updateA11yMobileNomeAcessivelVisibility.
const A11Y_MOBILE_SCREEN_READER_VARIANTS = A11Y_MOBILE_SCREEN_READER_VARIANTS_GENERATED;

// Mapa { [nomeComponente]: string[] } com os nomes BOOLEAN reais ("Nome
// Acessível"/"Observações", raw — mesma grafia de A11Y_MOBILE_SCREEN_READER_
// VARIANTS[x].variants[].activeToggles) que aquele componente tem em
// QUALQUER sub-variante — fallback defensivo pra componentes SEM
// screenReaderVariants ("folha simples") ou pra antes de uma sub-variante
// ser escolhida. Fonte de verdade 100% real (fetch-component-properties.cjs
// --deep-scan → build-a11y-constants.cjs), nunca lista hardcoded. Consumido
// por _a11yMobileComponentHasToggle (generalização 2026-09-22 do critério
// que já existia só para "Nome Acessível" — ver comentário lá — agora
// aplicável a QUALQUER toggle booleano real, ex. "Observações").
const A11Y_MOBILE_COMPONENT_TOGGLES = A11Y_MOBILE_COMPONENT_TOGGLES_GENERATED;
const A11Y_SUPER_APP_FILE_KEY = A11Y_SUPER_APP_FILE_KEY_GENERATED;
const A11Y_SUPER_APP_FILE_NAME = A11Y_SUPER_APP_FILE_NAME_GENERATED;

// Monta o deep-link real do Figma para o node_id de um component set da lib
// "DSC | Super App". type: 'URL' (não 'NODE' — NODE não suporta link
// cross-file a partir de um plugin rodando em outro arquivo). O Figma não
// valida o segmento de nome do arquivo na URL — funciona com qualquer
// string —, mas usamos o nome real (slugificado) da lib por clareza.
function _buildA11yMobileComponentDeepLink(nodeId) {
  if (!nodeId || !A11Y_SUPER_APP_FILE_KEY) return '';
  return `https://www.figma.com/design/${A11Y_SUPER_APP_FILE_KEY}/${A11Y_SUPER_APP_FILE_NAME}?node-id=${encodeURIComponent(nodeId)}`;
}

// Handler do <select> "Componente do DSC" (dropdown "Link do Componente") —
// se o nome escolhido tiver nodeId real conhecido (um dos cobertos por
// A11Y_MOBILE_COMPONENT_LINK_NODE_IDS), preenche AUTOMATICAMENTE o campo de
// texto companheiro com a URL do deep-link real. Nunca sobrescreve um valor
// que o designer já tenha digitado manualmente (nem ao trocar de opção
// depois) — só entra quando o campo de URL está vazio. Nomes sem match
// seguro (incl. a opção sintética "Personalizado") não alteram o campo:
// comportamento manual de sempre.
// Renderiza "Componente DSC: <nome>" no cabeçalho do modal — vira link
// clicável (deep-link real do Figma pra lib "DSC | Super App") só quando dá
// pra resolver um nodeId com confiança: origem mobile + nome limpo batendo
// EXATO contra A11Y_MOBILE_COMPONENT_LINK_NODE_IDS (mesmo critério/mesma
// tabela usada em _autofillA11yMobileLinkUrlFromComponentName). A lib
// desktop ("Web Angular & React"/"Super DSC Web") não
// entra aqui: o dado extraído dela (refs/web-angular-react.json,
// refs/super-dsc-web.json) não tem containingFrameNodeId, só componentKey de
// variante — sem nodeId real de component set não dá pra montar um deep-link
// confiável, então cai sempre no texto puro (fallback seguro, sem link
// quebrado). target="_blank" abre a lib publicada numa aba nova do
// navegador; o Figma intercepta e trata normalmente dentro do iframe da UI
// do plugin, sem precisar de postMessage/figma.openExternal (que é API de
// backend e não existe pra esse caso de link estático).
function _renderA11yModalDscComponentName(elId, dscComponentNameRaw, a11yOrigin) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!dscComponentNameRaw) { el.innerHTML = 'Não identificado'; return; }
  const clean = _cleanDscContainingFrameName(dscComponentNameRaw);
  const cleanKey = clean.trim().toLowerCase();
  let nodeId = null;
  if (a11yOrigin === 'mobile') {
    const matchName = Object.keys(A11Y_MOBILE_COMPONENT_LINK_NODE_IDS)
      .find(name => name.trim().toLowerCase() === cleanKey);
    if (matchName) nodeId = A11Y_MOBILE_COMPONENT_LINK_NODE_IDS[matchName];
  }
  const url = nodeId ? _buildA11yMobileComponentDeepLink(nodeId) : '';
  if (url) {
    el.innerHTML = `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" title="Abrir componente na lib DSC" class="text-[#005ca9] dark:text-blue-400 underline decoration-dotted hover:decoration-solid">${escapeHtml(clean)}</a>`;
  } else {
    el.textContent = clean;
  }
}

function _autofillA11yMobileLinkUrlFromComponentName() {
  const select = document.getElementById('a11y-el-mobile-link-select');
  const linkUrl = document.getElementById('a11y-el-mobile-link-url');
  if (!select || !linkUrl) return;
  if (!linkUrl.value.trim()) {
    const nodeId = A11Y_MOBILE_COMPONENT_LINK_NODE_IDS[select.value];
    if (nodeId) {
      const url = _buildA11yMobileComponentDeepLink(nodeId);
      if (url) { linkUrl.value = url; updateA11yCharCounter(linkUrl); }
    }
  }
  _syncA11yMobileLinkUrlLockState();
}

// Trava #a11y-el-mobile-link-url sempre que o <select> companheiro aponta
// para um componente real conhecido (qualquer opção != "Personalizado") —
// nesses casos o texto já foi resolvido automaticamente (ou é a escolha
// deliberada do designer dentre as opções reais do catálogo) e não deve divergir do
// nome escolhido. Só fica editável quando "Personalizado" está selecionado
// (equivalente ao "Outro" desktop: único jeito de documentar componente fora
// do catálogo). readOnly em vez de disabled: mantém o valor acessível via
// .value no submit (_collectA11yElementoMobileToggleProperties) e visível
// pro designer, só bloqueia edição — disabled removeria o campo do fluxo de
// leitura normal e teria semântica de "campo indisponível", não é o caso.
function _syncA11yMobileLinkUrlLockState() {
  const select = document.getElementById('a11y-el-mobile-link-select');
  const linkUrl = document.getElementById('a11y-el-mobile-link-url');
  const lockHint = document.getElementById('a11y-el-mobile-link-url-lock-hint');
  if (!select || !linkUrl) return;
  const isLocked = select.value !== 'Personalizado';
  linkUrl.readOnly = isLocked;
  linkUrl.classList.toggle('bg-gray-50', isLocked);
  linkUrl.classList.toggle('dark:bg-dark-bg', isLocked);
  linkUrl.classList.toggle('cursor-not-allowed', isLocked);
  if (lockHint) lockHint.classList.toggle('hidden', !isLocked);
}

// ── Migração aditiva: specs "elemento" mobile pré-existentes ganham
// a11ySubtype.variant ──────────────────────────────────────────────────────
// Chamada uma única vez em messages.js (handler 'init-plugin'), logo após
// a11ySpecs ser restaurado de hacData.a11ySpecs — silenciosa, sem toast, sem
// subir _schemaVersion (aditiva por-spec, não estrutural). Idempotente: só
// toca specs que ainda não têm a11ySubtype.variant, então rodar de novo em
// specs já migradas (ou em specs desktop, que nunca ganham essa chave) é
// no-op.
//
// Cobre só o legado ANTERIOR à existência de a11ySubtype.variant — specs
// criadas/editadas depois da correção "a origem filtra tudo" (2026-09) já
// nascem com variant preenchido (inclusive no branch isOutro legado), então
// nunca mais entram neste caminho de inferência por heurística.
//
// Regra de inferência (decisão de produto, ver conversa que introduziu esta
// migração — 2026-08-31):
//   1. properties[key:'linkComponente'] preenchido → 'componente' (tinha o
//      campo de link preenchido, é claramente um componente real).
//   2. properties[key:'descricao'] preenchido E a11ySubtype.componente
//      null/ausente E a11ySubtype.isOutro falso/ausente (só tinha descrição
//      livre, sem componente do catálogo escolhido) → 'texto alternativo'.
//   3. Fallback mais seguro: 'componente'. Quando cai neste fallback E não
//      havia link preenchido, marca spec.needsReview = true (campo que já
//      existe no schema, ver code.js create-unified-spec) pro designer
//      completar o Link do Componente manualmente depois.
function _migrateA11yElementoMobileVariants(specs) {
  return (specs || []).map(spec => {
    if (!spec || spec.a11yType !== 'elemento' || spec.a11yOrigin !== 'mobile') return spec;
    if (spec.a11ySubtype && spec.a11ySubtype.variant) return spec; // já migrada — idempotente

    const props = spec.properties || [];
    const getProp = key => {
      const p = props.find(x => x && x.key === key);
      return p ? p.value : '';
    };
    const linkComponente = getProp('linkComponente');
    const descricao = getProp('descricao');
    const sub = spec.a11ySubtype || {};

    let variant;
    let needsReview = false;
    if (linkComponente && String(linkComponente).trim()) {
      variant = A11Y_ELEMENTO_MOBILE_VARIANTS.componente;
    } else if (descricao && String(descricao).trim() && !sub.componente && !sub.isOutro) {
      variant = A11Y_ELEMENTO_MOBILE_VARIANTS.textoAlternativo;
    } else {
      variant = A11Y_ELEMENTO_MOBILE_VARIANTS.componente;
      needsReview = true; // sem link preenchido — designer precisa completar depois
    }

    return {
      ...spec,
      a11ySubtype: { ...sub, variant },
      needsReview: needsReview ? true : !!spec.needsReview,
    };
  });
}
window._migrateA11yElementoMobileVariants = _migrateA11yElementoMobileVariants;

// Properties VARIANT que já são controladas pelo próprio <select> de
// "Componente" (nível 1, wrapper "componentes/icones/imagens") — nunca viram
// um segundo seletor redundante no formulário, mesmo aparecendo no array
// bruto de properties do catálogo.
const _A11Y_VARIANT_BLOCKLIST = new Set(['componente', 'variante']);

// Capitaliza só a primeira letra — suficiente pra rotular opções de variante
// (ex: "de icone" → "De icone").
function _capitalizeFirst(s) {
  const str = String(s || '');
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Dado o shortName do <select> de "Elementos e Imagens" (ex: 'button',
// 'imagem'), retorna { toggles: [{ key, label, syncId }], texts: [...],
// variants: [...], variantFields: [{ name, syncId, options, rawName }] } com
// os toggles/variantes canônicos DISPONÍVEIS naquele componente real, ou null
// se o componente não estiver catalogado (fallback gracioso).
function _getA11yComponentToggles(selectValue) {
  const shortName = _A11Y_SELECT_TO_SHORTNAME[selectValue] || selectValue;
  const entry = A11Y_COMPONENT_PROPERTIES.find(c => c.shortName === shortName);
  if (!entry) return null;

  const toggles = [];
  const seen = new Set();
  entry.properties.forEach(p => {
    if (p.type !== 'BOOLEAN') return;
    const canonical = _normalizeA11yToggleName(p.name);
    if (!canonical || seen.has(canonical)) return;
    seen.add(canonical);
    toggles.push({ key: canonical, label: A11Y_TOGGLE_LABELS[canonical] || canonical, syncId: p.syncId, rawName: p.name });
  });

  const variantFields = entry.properties
    .filter(p => p.type === 'VARIANT' && !_A11Y_VARIANT_BLOCKLIST.has(String(p.name || '').toLowerCase()))
    .map(p => ({
      name: p.name,
      syncId: p.syncId,
      rawName: p.name,
      options: (p.variantOptions || []).map(v => ({ value: v, label: _capitalizeFirst(v) })),
      defaultValue: p.defaultValue,
    }));

  return {
    toggles,
    texts: entry.properties.filter(p => p.type === 'TEXT').map(p => p.name),
    variants: entry.properties.filter(p => p.type === 'VARIANT').map(p => p.name),
    variantFields,
  };
}
window._getA11yComponentToggles = _getA11yComponentToggles;

// Procura uma Área Marcada pelo id — array único, sem escopos avulso/
// por-frame (diferença de schema em relação ao Handex).
function _findA11yAreaById(areaId) {
  if (!areaId) return null;
  return (a11yAreas || []).find(a => a && a.id === areaId) || null;
}

// Posição fixa (X, Y) da RÉPLICA DE TRABALHO desta área — persistida em
// hacData.a11yAreas[].workAnchor na primeira vez que qualquer clone
// (spec/Tabulação/Swipe/Leitor de Tela) é criado pra ela, ver
// _saveA11yAreaWorkAnchor logo abaixo (2026-09-21, pedido do usuário: bug
// real reportado com print — lote de Detecção Automática misturando
// itens de áreas diferentes fazia specs de uma área nascerem na faixa Y
// de outra, mesmo com verticalAnchorBounds já existindo no backend).
// Enviado em TODA mensagem que possa criar/resolver um clone de trabalho
// — se `null` (1ª vez), o backend calcula normalmente e devolve o valor
// calculado na resposta; se presente, o backend usa direto, sem
// recalcular nem checar colisão (decisão de produto: a posição de uma
// área nunca muda depois de fixada).
function _getA11yAreaWorkAnchor(areaId) {
  const area = _findA11yAreaById(areaId);
  return (area && area.workAnchor && typeof area.workAnchor.x === 'number' && typeof area.workAnchor.y === 'number')
    ? area.workAnchor
    : null;
}
window._getA11yAreaWorkAnchor = _getA11yAreaWorkAnchor;

// Grava o workAnchor devolvido pelo backend na 1ª criação do clone de
// trabalho de uma área — chamada por TODOS os handlers de resposta que
// podem carregar esse campo (tab-order-copy-started, swipe-path-copy-started,
// spec-copy-started, handleSpecCreated). Idempotente e defensivo: nunca
// sobrescreve um workAnchor já salvo (a posição, uma vez fixada, nunca
// muda — mesmo que o backend eco-e o mesmo valor de volta, não há razão
// pra reescrever/salvar de novo).
function _saveA11yAreaWorkAnchor(areaId, workAnchor) {
  if (!areaId || !workAnchor || typeof workAnchor.x !== 'number' || typeof workAnchor.y !== 'number') return;
  const area = _findA11yAreaById(areaId);
  if (!area || area.workAnchor) return;
  area.workAnchor = { x: workAnchor.x, y: workAnchor.y };
  saveToStorage();
}
window._saveA11yAreaWorkAnchor = _saveA11yAreaWorkAnchor;

// ── Criação ──────────────────────────────────────────────────────────────

// Botão "+" no cabeçalho de cada accordion de Área Marcada primeiro checa se
// a lib "Design Acessível" está acessível antes de abrir o modal de escolha
// de categoria — ver handler 'check-a11y-library' em code.js. A área clicada
// fica guardada em window._a11yPendingAreaId até o formulário (openA11yModal)
// ler e gravar em modal.dataset.areaId — é assim que confirmA11ySpec sabe em
// qual área a nova spec deve nascer.
//
// Gate de seleção (2026-09-11): antes desta mudança, o picker de categoria
// abria direto e o erro "Selecione um elemento no canvas" (create-unified-spec,
// code.js) só aparecia DEPOIS do designer preencher o formulário inteiro e
// clicar Aplicar — frustração tardia e evitável. Agora, ao clicar "Nova
// spec": (1) foca o canvas no elemento principal da Área (focusNode,
// core.js — seleciona + dá scroll/zoom), (2) mostra uma orientação curta e
// NÃO bloqueante via snackbar orientando a clicar no elemento específico
// dentro do frame em destaque, (3) dispara em paralelo o matching
// determinístico (resolve-manual-spec-match, ver handler em code.js) pra já
// chegar com uma categoria sugerida quando o designer abrir o picker. Nada
// disso trava quem já sabe o que fazer — é só orientação/pré-preenchimento,
// o picker abre normalmente assim que a checagem da lib responder,
// independente do estado da seleção ou do matching.
//
// Decisão de UX (revisada 2026-09-16-c, pedido do usuário com print real):
// a instrução aparecia SEMPRE que "Nova spec" era clicado (decisão anterior,
// registrada abaixo por histórico) — o usuário reportou que isso "reinicia o
// processo" a cada clique, incômodo real em uso repetido. Agora a modal
// aparece só na PRIMEIRA vez (flag hacData.a11yLeitorInstructionSeen,
// core.js — mesmo padrão de campo simples de configuração de projeto que
// projectOrigin/activeSectionName, persistido via saveToStorage()); nas
// vezes seguintes pula direto pro picker de categoria. A flag só afeta esta
// abertura AUTOMÁTICA — a reabertura MANUAL (botão "Instruções sobre esta
// documentação" na aba Leitor de Tela, _a11yWorkspaceTabLeitorDeTela, que
// chama openA11yInstructionManually('leitorTela')) sempre abre a modal
// completa, independente do valor da flag, e nunca grava nada nela.
//
// Histórico (decisão anterior, substituída pela acima): "a instrução
// aparece SEMPRE que 'Nova spec' é clicado, sem lógica de 'não repetir na
// sessão' — substituiu a antiga dica única de vida inteira
// (window._a11ySpecModalInstructionShown, removida de dentro de
// openA11yModal) porque as duas mensagens competiam pelo mesmo momento.
// Como é um snackbar curto e de leitura rápida (uma frase), repetir a cada
// clique não deveria incomodar". Na prática o modal cresceu (virou o modal
// rico do template oficial, 2026-09-15) e deixou de ser um snackbar curto,
// invalidando essa premissa original.
//
// Modal de instrução rico do template oficial de "Especificações para
// Leitor de Tela" (2026-09-15) — diferente de Tabulação/Swipe (que hoje
// mostram as instruções embutidas na própria barra de captura, sempre
// visíveis por padrão, ver core.js/tab-order.js), o Leitor de Tela não tem
// um "modo contínuo" minimizado (é spec por spec). Cobre as 5 categorias de
// uma vez só (todas fazem parte do mesmo bloco "Leitor de Tela" na Ficha
// final) — aparece ANTES do designer escolher qual categoria vai
// documentar, então nunca marca/desmarca onboardingSeen (mecanismo
// diferente, ver setOnboardingSeenState).
function openA11yCategoryPickerModal(areaId) {
  if (hacData.a11yLeitorInstructionSeen) {
    _openA11yCategoryPickerModalAfterInstruction(areaId);
    return;
  }
  if (typeof _renderA11yInstructionModal === 'function' && _renderA11yInstructionModal('leitorTela')) {
    // Callback consumido por _confirmA11yInstructionModal (tab-order.js) ao
    // fechar o modal — mesmo mecanismo usado por
    // openA11yInstructionThenStart (tab-order.js) pros botões "Iniciar
    // Ordem de Tabulação"/"Iniciar trilha de ordem de leitura" (2026-09-16,
    // bug real corrigido: "Entendi, começar seleção" não iniciava nada
    // pra esses dois fluxos).
    window._pendingA11yInstructionConfirm = () => {
      // Marca "visto" só na CONFIRMAÇÃO (não na abertura) — se o designer
      // fechar pelo X/backdrop (_cancelA11yInstructionModal) sem confirmar,
      // a modal deve aparecer de novo no próximo "+ Nova spec", já que ele
      // não chegou a "ver" o conteúdo até o fim.
      hacData.a11yLeitorInstructionSeen = true;
      saveToStorage();
      _openA11yCategoryPickerModalAfterInstruction(areaId);
    };
    // Reset defensivo (2026-09-16-b): o Leitor de Tela sempre inicia do
    // zero (não tem "Adicionar itens" aqui, é o próprio picker de
    // categoria quem decide o que criar) — garante que o texto do botão
    // não fique preso em "Entendi, adicionar itens" deixado por uma
    // chamada anterior a openA11yInstructionThenStart (tab-order.js) na
    // mesma sessão da UI.
    const continueBtn = document.getElementById('btn-a11y-instruction-modal-continue');
    if (continueBtn) continueBtn.textContent = 'Entendi, começar seleção';
    openModal('a11y-instruction-modal');
    if (typeof _refreshIcons === 'function') _refreshIcons();
    return;
  }
  _openA11yCategoryPickerModalAfterInstruction(areaId);
}
window.openA11yCategoryPickerModal = openA11yCategoryPickerModal;

function _openA11yCategoryPickerModalAfterInstruction(areaId) {
  window._a11yPendingAreaId = areaId || null;
  window._a11yLibCheckOnSuccess = null; // fluxo normal "+" nunca usa o desvio de openA11yFormFromUndocumented
  window._a11yCategoryPickerWizardSwitch = false;

  // Cria (ou reaproveita) a RÉPLICA DE TRABALHO do Leitor de Tela ANTES de
  // focar — 2026-09-15, pedido do usuário: "assim que eu clico pra criar a
  // spec, já deveríamos ter a réplica e o canvas focar na réplica".
  //
  // Até aqui a réplica só nascia dentro de create-unified-spec, ou seja, ao
  // APLICAR a primeira spec: o focusA11yCloneNode abaixo não tinha o que
  // focar e caía no Frame Principal, então o designer clicava sobre o
  // design original enquanto a spec seria desenhada sobre uma réplica que
  // ainda ia ser criada. O wizard de Detecção Automática já resolvia isso
  // desde 2026-09-14 (startA11yBatchWizard) — este é o mesmo adiantamento
  // para o fluxo MANUAL ("+ Nova spec"), reusando o mesmo handler
  // idempotente (start-spec-copy → _resolveActiveSpecClone, que reusa
  // clone existente e só cria do zero na primeira vez).
  //
  // O foco roda no retorno de 'spec-copy-started' (messages.js), não aqui:
  // focar antes da réplica existir repetiria o bug que esta mudança corrige.
  // Best-effort — área sem targetNodeId resolvível não trava o fluxo, só
  // perde o adiantamento e foca o que houver.
  const area = _findA11yAreaById(areaId);
  if (area && area.targetNodeId) {
    window._a11ySpecCopyPendingFocusAreaId = areaId;
    // Loading de canvas enquanto a réplica é clonada — mesmo padrão de
    // Tabulação/Swipe (_startTabOrderManualModeInner), pelo mesmo motivo:
    // em telas grandes a clonagem demora o bastante pra parecer que nada
    // aconteceu ao clicar. Fechado em 'spec-copy-started' (messages.js).
    if (typeof showA11yCanvasLoading === 'function') showA11yCanvasLoading('Preparando a réplica de trabalho…');
    // savedAnchor (2026-09-21) — posição fixa da réplica de trabalho desta
    // área, se já existir (ver _getA11yAreaWorkAnchor/_saveA11yAreaWorkAnchor
    // acima); `null` na 1ª vez, o backend calcula e devolve o valor usado.
    parent.postMessage({ pluginMessage: { type: 'start-spec-copy', areaId, targetNodeId: area.targetNodeId, sectionName: getA11yActiveSectionName(), designerName: getA11yDesignerName(), designerId: getA11yDesignerId(), savedAnchor: _getA11yAreaWorkAnchor(areaId) } }, '*');
  } else if (area && typeof focusA11yCloneNode === 'function') {
    focusA11yCloneNode(areaId, 'leitor', area.targetNodeId || null);
  }

  // Matching determinístico (Parte 2) — token de correlação próprio, igual
  // ao padrão já usado abaixo pra check-a11y-library: só a resposta do
  // pedido MAIS recente pode aplicar sugestão de categoria (o designer pode
  // clicar "+" em áreas diferentes, ou selecionar outro elemento, antes da
  // primeira resposta chegar).
  window._a11yManualMatchResult = null;
  const matchToken = 'a11y-manual-match-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  window._a11yManualMatchToken = matchToken;
  parent.postMessage({ pluginMessage: { type: 'resolve-manual-spec-match', token: matchToken } }, '*');

  // Token de correlação — se o designer clicar "+" em duas áreas diferentes
  // antes da primeira checagem responder, só a resposta do pedido MAIS
  // recente pode abrir o modal.
  const token = 'a11y-lib-check-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  window._a11yLibCheckToken = token;
  parent.postMessage({ pluginMessage: { type: 'check-a11y-library', token } }, '*');
}

// Abre o mesmo modal de escolha de categoria, mas para TROCAR a categoria de
// um item em revisão no wizard da Detecção Automática (botão de alterar
// categoria no cabeçalho de openA11yModal). Diferente do "+ Nova spec", a lib
// "Design Acessível" já está garantida (o item só existe porque a Detecção
// Automática rodou), então pula a checagem 'check-a11y-library' e abre direto.
function openA11yWizardCategoryPickerModal() {
  window._a11yCategoryPickerWizardSwitch = true;
  const label = document.getElementById('a11y-category-picker-area-label');
  if (label) label.classList.add('hidden');
  const titleText = document.getElementById('a11y-category-picker-title-text');
  if (titleText) titleText.textContent = 'Alterar Especificação';
  _applyA11yCategoryPickerOriginFilter();
  openModal('a11y-category-picker-modal');
}
window.openA11yWizardCategoryPickerModal = openA11yWizardCategoryPickerModal;

// A lib mobile "Design Acessível | Super App" só publica 3 das 5 categorias
// (Elementos e Imagens, Nível de Título, Elemento Decorativo) — Estrutura da
// Página (sem landmark semântico mobile) e Informações Adicionais (formato
// livre exclusivo web) não têm componente real nessa lib. Origem 'web' ou
// ainda não definida (null) mostra as 5 normalmente.
function _applyA11yCategoryPickerOriginFilter() {
  const mobileOnly = isA11yMobileProject();
  ['estrutura', 'informacoes'].forEach((category) => {
    const btn = document.getElementById('a11y-category-btn-' + category);
    if (btn) btn.classList.toggle('hidden', mobileOnly);
  });
  // "Nível de Título" (web) / "Títulos" (mobile) — única categoria cujo
  // NOME muda por origem (RN não tem hierarquia H1-H6). Ver
  // getA11yCategoryLabel/A11Y_CATEGORY_LABEL_MOBILE_OVERRIDES.
  const tituloLabelEl = document.getElementById('a11y-category-btn-titulo-label');
  if (tituloLabelEl) tituloLabelEl.textContent = getA11yCategoryLabel('titulo');
}

// Chamado por messages.js quando o backend confirma que a lib está acessível
// (resposta 'a11y-library-status', linked: true) — só ocorre no fluxo normal
// "+ Nova spec" (openA11yWizardCategoryPickerModal não passa por essa checagem).
function _openA11yCategoryPickerModalNow() {
  const areaId = window._a11yPendingAreaId;
  const label = document.getElementById('a11y-category-picker-area-label');
  if (label) {
    const area = _findA11yAreaById(areaId);
    if (area) {
      label.textContent = `Nova spec em: ${area.number}  ${area.label}`;
      label.classList.remove('hidden');
    } else {
      label.classList.add('hidden');
    }
  }
  const titleText = document.getElementById('a11y-category-picker-title-text');
  if (titleText) titleText.textContent = 'Nova especificação';
  _applyA11yCategoryPickerOriginFilter();
  openModal('a11y-category-picker-modal');
  // Matching determinístico (Parte 2) — se resolve-manual-spec-match já
  // respondeu antes da checagem da lib (ou responder logo em seguida,
  // _applyA11yManualMatchToPicker é chamado de novo por messages.js quando
  // chegar), realça a categoria sugerida sem escolher por conta própria.
  _applyA11yManualMatchToPicker();
}
window._openA11yCategoryPickerModalNow = _openA11yCategoryPickerModalNow;

// Decisão de UX (Parte 2, ambiguidade do plano): o picker já está sendo
// aberto neste ponto do fluxo manual (diferente do wizard de Detecção
// Automática/Não Documentados, que pula o picker inteiramente quando já
// conhece a categoria) — pular a etapa aqui destruiria a única tela onde o
// designer confirma a categoria no fluxo manual, mesmo quando o matching
// está certo. Por isso a sugestão só REALÇA visualmente o botão da
// categoria (borda/fundo cyan + rótulo "Sugerido"), nunca fecha o picker
// nem pré-clica em nada — o designer sempre decide clicando, com ou sem
// sugestão. `window._a11yManualMatchResult` chega de
// manual-spec-match-resolved (messages.js); presetOptions correspondentes
// (presetComponente/presetEstruturaTipo/presetTituloNivel) ficam guardados
// em window._a11yManualMatchPreset pra chooseA11yType repassar pra
// openA11yModal quando o designer confirmar QUALQUER categoria — se ele
// escolher a categoria sugerida, o formulário já abre com o preset certo;
// se escolher outra, o preset (de uma categoria diferente) é descartado.
function _applyA11yManualMatchToPicker() {
  // Sempre limpa o realce anterior primeiro — chamado toda vez que o picker
  // reabre ou que uma resposta de matching chega, nunca deve acumular
  // realce de uma seleção anterior.
  document.querySelectorAll('#a11y-category-picker-modal [data-a11y-suggested]').forEach(el => {
    el.removeAttribute('data-a11y-suggested');
    el.classList.remove('ring-2', 'ring-blue-500', 'bg-blue-50', 'dark:bg-blue-900/20');
    const badge = el.querySelector('[data-a11y-suggested-badge]');
    if (badge) badge.remove();
  });

  const result = window._a11yManualMatchResult;

  // Retorno visual do elemento selecionado no canvas AGORA (2026-09-22,
  // pedido do usuário) — independente de ter dado match de categoria ou
  // não: o designer precisa ver que o clique dele "chegou" no plugin, nem
  // que seja num elemento sem componente DSC catalogado. Nome puro
  // (result.nodeName) quando não há match; "Nome — [dsc] Componente" quando
  // há um componente real identificado, mais claro que só o nome da camada.
  const statusWrap = document.getElementById('a11y-category-picker-selection-status');
  const statusName = document.getElementById('a11y-category-picker-selection-name');
  const statusHint = document.getElementById('a11y-category-picker-selection-hint');
  if (statusWrap && statusName) {
    if (result && result.nodeId && result.nodeName) {
      // O componente DSC identificado é mostrado SEMPRE que existir — também
      // quando ele não tem categoria de a11y catalogada (isUnmapped). Era o
      // contrário até 2026-09-22 (só aparecia quando havia match), justo no
      // caso em que essa informação é MAIS útil: o designer via só o nome da
      // camada ("Slot Hero") e nenhuma sugestão destacada, sem nenhuma pista
      // de que o plugin tinha reconhecido o componente e apenas não sabia a
      // categoria dele.
      const frameLabel = result.match && result.match.containingFrame
        ? ` — ${result.match.containingFrame}`
        : '';
      statusName.textContent = result.nodeName + frameLabel;
      statusWrap.classList.remove('hidden');
      // Explica a ausência de sugestão em vez de deixar o picker mudo: sem
      // isso, "nenhuma categoria destacada" é indistinguível de "o plugin
      // não viu minha seleção" (confusão real relatada pelo usuário).
      if (statusHint) {
        const semCategoria = !result.match || result.match.isUnmapped || !result.match.a11yCategory;
        statusHint.textContent = semCategoria ? 'Sem categoria sugerida — escolha abaixo.' : '';
        statusHint.classList.toggle('hidden', !semCategoria);
      }
    } else {
      statusWrap.classList.add('hidden');
      statusName.textContent = '';
      if (statusHint) { statusHint.textContent = ''; statusHint.classList.add('hidden'); }
    }
  }

  window._a11yManualMatchPreset = null;
  if (!result || !result.match || result.match.isUnmapped || !result.match.a11yCategory) return;

  // Reaproveita o mesmo mapeamento categoria/preset usado pela Detecção
  // Automática (_resolveA11yFormPresetFromItem) — não duplica a lógica de
  // "shortName → categoria/subtipo" aqui. Empacota o match no mesmo formato
  // de item esperado (kind 'detection').
  const fakeItem = { name: result.nodeName || null, nodeId: result.nodeId || null, dscComponentMatch: result.match };
  const { category, options } = _resolveA11yFormPresetFromItem(fakeItem, 'detection');
  window._a11yManualMatchPreset = { category, options };

  const btn = document.getElementById('a11y-category-btn-' + category);
  if (btn) {
    btn.setAttribute('data-a11y-suggested', 'true');
    btn.classList.add('ring-2', 'ring-blue-500', 'bg-blue-50', 'dark:bg-blue-900/20');
    const badge = document.createElement('span');
    badge.setAttribute('data-a11y-suggested-badge', 'true');
    badge.className = 'ml-auto shrink-0 text-[9px] font-bold uppercase tracking-wider text-white bg-blue-600 rounded-full px-1.5 py-0.5';
    badge.textContent = 'Sugerido';
    btn.appendChild(badge);
  }
}
window._applyA11yManualMatchToPicker = _applyA11yManualMatchToPicker;

function closeA11yCategoryPickerModal() {
  closeModal('a11y-category-picker-modal');
  // Desliga o listener de re-matching ao vivo (Parte 2, ver
  // _a11yManualMatchModeActive em code.js) — chamado tanto ao confirmar uma
  // categoria (chooseA11yType) quanto ao fechar pelo X/backdrop. Inofensivo
  // quando o modo nunca esteve ligado (ex.: fechar o picker do wizard de
  // troca de categoria, que não passa pelo gate de seleção).
  parent.postMessage({ pluginMessage: { type: 'stop-manual-spec-match-mode' } }, '*');
}
window.closeA11yCategoryPickerModal = closeA11yCategoryPickerModal;

// Reabre a checagem de vínculo depois que o designer resolve o passo a passo
// (habilitar a lib no Assets) e clica em "Já habilitei, tentar de novo".
function retryA11yLibraryCheck() {
  closeModal('a11y-library-required-modal');
  const token = 'a11y-lib-check-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  window._a11yLibCheckToken = token;
  parent.postMessage({ pluginMessage: { type: 'check-a11y-library', token } }, '*');
}
window.retryA11yLibraryCheck = retryA11yLibraryCheck;

function chooseA11yType(category) {
  closeA11yCategoryPickerModal();
  if (window._a11yCategoryPickerWizardSwitch) {
    window._a11yCategoryPickerWizardSwitch = false;
    switchA11yWizardCategory(category);
    return;
  }
  // Preset do matching determinístico (Parte 2) — só é aproveitado quando o
  // designer escolhe A MESMA categoria que foi sugerida/realçada no picker
  // (_applyA11yManualMatchToPicker). Escolher outra categoria descarta o
  // preset (ele pertence à categoria sugerida, não faria sentido em outra) —
  // a sugestão nunca trava a decisão final do designer.
  const manualPreset = window._a11yManualMatchPreset;
  window._a11yManualMatchPreset = null;
  window._a11yManualMatchResult = null;
  if (manualPreset && manualPreset.category === category) {
    openA11yModal(category, Object.assign(
      { a11yOrigin: getA11yProjectOrigin() || 'web' },
      manualPreset.options
    ));
    return;
  }
  // Origem da spec manual "+ Nova spec": lê a origem já configurada do
  // projeto (definida antes, no mínimo em Marcar Área — toda spec pertence a
  // uma Área) em vez de assumir 'web' sempre. Só lê o valor já persistido
  // (getA11yProjectOrigin) — não chama ensureA11yProjectOriginThen aqui, que
  // abriria uma modal bloqueante; a esta altura do fluxo a origem já deveria
  // estar definida. Fallback 'web' cobre só o caso raro de ainda não estar.
  openA11yModal(category, { a11yOrigin: getA11yProjectOrigin() || 'web' });
}
window.chooseA11yType = chooseA11yType;

// Título do modal de especificação por categoria — resolvido via
// getA11yCategoryLabel (não mais um mapa fixo) para que 'titulo' mostre
// "Nível de Título" (web) ou "Títulos" (mobile) conforme a origem já
// resolvida em modal.dataset.a11yOrigin. Ver chamada em openA11yModal.

// Categorias que usam tag manual (A, A1, A1.1...) — Título usa selo fixo por
// nível, Decorativo usa selo fixo de ícone.
const A11Y_TAG_INPUT_ID = {
  elemento: 'a11y-el-tag-input',
  estrutura: 'a11y-estrutura-tag-input',
  informacoes: 'a11y-informacoes-tag-input',
};
const A11Y_TAG_ERROR_ID = {
  elemento: 'a11y-el-tag-error',
  estrutura: 'a11y-estrutura-tag-error',
  informacoes: 'a11y-informacoes-tag-error',
};

function openA11yModal(category, options) {
  const meta = A11Y_CATEGORIES[category];
  if (!meta) return;
  const presetComponente = options && options.presetComponente;
  // Mesma ideia de presetComponente, mas pro subtipo de "estrutura"
  // (header/nav/main/aside/footer) e o nível de "titulo" — os dois únicos
  // casos, fora "elemento", onde o scan já indica uma variante específica em
  // vez de só a categoria.
  const presetEstruturaTipo = options && options.presetEstruturaTipo;
  const presetTituloNivel = options && options.presetTituloNivel;
  // Origem (web/mobile) da spec sendo criada/editada — decide se os 2 campos
  // exclusivos do wrapper mobile (Dica para Leitor de Tela/Link do
  // Componente) aparecem em "Elementos e Imagens" (ver
  // _renderA11yElementoMobileFields). O fluxo manual "+ Nova spec"
  // (chooseA11yType) já resolve isto lendo getA11yProjectOrigin() antes de
  // chamar este modal; default 'web' aqui cobre só o caso raro de a origem
  // do projeto ainda não estar definida.
  const a11yOrigin = (options && options.a11yOrigin) || 'web';
  // Nome cru do component set DSC real (containingFrame, ex: "[dsc] Button")
  // já resolvido pelo scan que abriu este formulário via
  // openA11yFormFromUndocumented — mesmo raciocínio do a11yOrigin acima.
  // O fluxo manual "+ Nova spec" nunca passa isto, então cai em null.
  const dscComponentName = (options && options.dscComponentName) || null;

  const modal = document.getElementById('a11y-spec-modal');
  if (!modal) return;
  // Instrução única de vida inteira REMOVIDA em 2026-09-11 (era mostrada
  // aqui, na primeira vez que este modal abria — window._a11ySpecModalInstructionShown/
  // save-spec-modal-instruction-seen). Virou orientação repetida a cada
  // clique em "Nova spec", mostrada mais cedo no fluxo (ver
  // openA11yCategoryPickerModal, gate de seleção antes do picker de
  // categoria) — as duas mensagens competiam pelo mesmo momento de trabalho,
  // então só a nova permanece. O conteúdo (travamento/cadeado) continua
  // coberto pelo hint fixo do rodapé do modal (ver modals.html) e pelo
  // onboarding.
  modal.dataset.category = category;
  modal.dataset.areaId = window._a11yPendingAreaId || '';
  modal.dataset.a11yOrigin = a11yOrigin;
  if (dscComponentName) modal.dataset.dscComponentName = dscComponentName;
  else delete modal.dataset.dscComponentName;
  // Usado pelo lote automatizado pra pré-selecionar o componente sugerido no
  // <select>.
  if (presetComponente) modal.dataset.presetComponente = presetComponente;
  else delete modal.dataset.presetComponente;
  // Fixa qual nó do canvas a spec deve apontar, igual editA11ySpec faz via
  // editingSpec.targetNodeId. Sem isso o backend cairia na seleção atual do
  // canvas (comportamento normal de criação manual), que não é o elemento
  // que o designer clicou na lista de pendentes.
  const pendingTargetNodeId = options && options.pendingTargetNodeId;
  if (pendingTargetNodeId) modal.dataset.pendingTargetNodeId = pendingTargetNodeId;
  else delete modal.dataset.pendingTargetNodeId;
  // editA11ySpec sobrescreve editingSpecId e o texto do botão logo depois
  // desta chamada — abrir pra criar uma spec nova sempre limpa qualquer
  // resquício de edição anterior. editingOriginalIndex não existe mais
  // como dataset (2026-09-11) — confirmA11ySpec sempre resolve o índice
  // na hora, a partir de editingSpecId, nunca de um valor congelado.
  delete modal.dataset.editingSpecId;
  const confirmBtnReset = document.getElementById('btn-a11y-confirm');
  if (confirmBtnReset) confirmBtnReset.textContent = 'Aplicar';
  // Reset defensivo do estado visual do wizard (botões "Localizar no
  // canvas"/"Descartar", progresso "N de M") — abrir o formulário fora do wizard
  // (botão "+ Nova spec"/pendências avulsas) nunca deve herdar UI de uma
  // revisão anterior. _advanceA11yBatchWizard reativa o dataset/UI logo
  // depois desta chamada quando de fato é o wizard quem está abrindo.
  delete modal.dataset.wizardActive;
  _resetA11yBatchWizardUi();
  // Posição manual do card (ver confirmA11ySpec mais abaixo) — nunca deve
  // herdar a referência de uma spec anterior; cada abertura de formulário
  // limpa o estado pendente, mesmo em edição (que nem chega a ler seleção,
  // ver confirmA11ySpec — edição usa seu próprio mecanismo de posição fixa
  // via pinnedPosition/cardX/cardY).
  window._a11yPendingManualAnchorNodeId = null;
  window._a11ySpecPositionGateOnReady = null;

  const areaLabelEl = document.getElementById('a11y-modal-area-label');
  if (areaLabelEl) {
    const area = _findA11yAreaById(modal.dataset.areaId);
    if (area) {
      areaLabelEl.textContent = `Área: ${area.number}  ${area.label}`;
      areaLabelEl.classList.remove('hidden');
    } else {
      areaLabelEl.classList.add('hidden');
    }
  }

  // "Camada no canvas"/"Componente DSC" — read-only, comuns às 5 categorias
  // (ver bloco correspondente em modals.html). "Camada no canvas" só chega
  // depois, via get-selection-name/prefillA11yComponentName (fluxo manual) ou
  // já no options.targetNodeName do lote (fluxo automático) — resetado aqui
  // pra nunca herdar o nó da spec anterior enquanto a resposta não chega.
  // "Componente DSC" já pode estar disponível de imediato no fluxo
  // automático (dscComponentName resolvido antes de abrir o modal).
  const targetNodeNameEl = document.getElementById('a11y-modal-target-node-name');
  if (targetNodeNameEl) {
    const presetTargetNodeName = (options && options.targetNodeName) || null;
    targetNodeNameEl.textContent = presetTargetNodeName || '—';
  }
  // "Está dentro de:" (2026-09-11) — mesmo raciocínio do card em
  // _a11yUndocumentedItemHtml: reforça no formulário de confirmação (onde
  // o designer de fato aplica) que este elemento é filho de outra coisa,
  // evitando o mesmo engano de confirmar um sub-elemento pensando ser o
  // componente inteiro. Só disponível no fluxo automático (o item já traz
  // imediateParentName do scan); fluxo manual não tem esse dado ainda —
  // fica oculto nesse caso, sem quebrar nada.
  const immediateParentWrap = document.getElementById('a11y-modal-immediate-parent-wrap');
  const immediateParentNameEl = document.getElementById('a11y-modal-immediate-parent-name');
  const immediateParentName = (options && options.immediateParentName) || null;
  if (immediateParentWrap && immediateParentNameEl) {
    immediateParentWrap.classList.toggle('hidden', !immediateParentName);
    immediateParentNameEl.textContent = immediateParentName || '—';
  }
  _renderA11yModalDscComponentName('a11y-modal-dsc-component-name', dscComponentName, a11yOrigin);

  const title = document.getElementById('a11y-modal-title-text');
  if (title) title.textContent = getA11yCategoryLabel(category, a11yOrigin) || 'Especificação de Acessibilidade';

  const titleIconWrap = document.getElementById('a11y-modal-title-icon');
  if (titleIconWrap) {
    titleIconWrap.innerHTML = `<i data-lucide="${meta.icon}" class="w-4 h-4" style="color:${meta.color}" aria-hidden="true"></i>`;
    _refreshIcons(titleIconWrap);
  }

  // Correção de categoria (ícone de alterar, abre openA11yWizardCategoryPickerModal)
  // só existe durante a revisão do wizard — fora dele, categoria errada é
  // resolvida apagando e recriando a spec (edição normal não tem esse atalho).
  const categoryEditBtn = document.getElementById('a11y-modal-category-edit-btn');
  if (categoryEditBtn) categoryEditBtn.classList.toggle('hidden', !window._a11yBatchWizardState);

  ['elemento', 'estrutura', 'titulo', 'decorativo', 'informacoes'].forEach(c => {
    const block = document.getElementById(`a11y-fields-${c}`);
    if (block) block.classList.toggle('hidden', category !== c);
  });

  [
    'a11y-el-label',
    'a11y-el-componente-outro',
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.value = ''; updateA11yCharCounter(el); }
  });

  const drawModeDefault = document.querySelector('input[name="a11y-draw-mode"][value="contorno"]');
  if (drawModeDefault) drawModeDefault.checked = true;

  // Resolve "Camada no canvas"/"Componente DSC" (campos read-only, comuns às
  // 5 categorias) a partir da seleção atual do canvas — só no fluxo manual
  // "+ Nova spec". O fluxo automático já chega com targetNodeName/
  // dscComponentName via options (resolvidos em memória pelo scan, ver
  // _resolveA11yFormPresetFromItem), e o modo edição (options.editing, ver
  // editA11ySpec) já populou os 2 campos com os dados salvos da spec — nos
  // dois casos, a seleção atual do canvas é irrelevante e não pode pisar por
  // cima assim que a resposta assíncrona chegar. Não usar
  // modal.dataset.editingSpecId aqui: editA11ySpec só grava esse dataset
  // DEPOIS desta chamada retornar, tarde demais pra este check síncrono
  // (prefillA11yComponentName, chamado bem mais tarde de forma assíncrona,
  // já enxerga o dataset correto e por isso usa ele em vez de options.editing).
  const isPresetOpen = !!(options && (options.editing || options.targetNodeName));
  if (!isPresetOpen) {
    parent.postMessage({ pluginMessage: { type: 'get-selection-name' } }, '*');
  }

  if (category === 'elemento') {
    const select = document.getElementById('a11y-el-componente-select');
    // Preset "imagem" (2026-09-17): "Imagem" saiu do <select> de 15
    // componentes e virou a opção 'imagem' do radio a11y-el-variante (ver
    // comentário de reestruturação em modals.html) — reflete a property REAL
    // "variante" do component set base. Se a Detecção Automática/match
    // manual sugerir presetComponente === 'imagem', marca o radio certo em
    // vez de tentar selecionar 'imagem' no <select> (que não tem mais essa
    // opção).
    const isPresetImagem = presetComponente === 'imagem';
    const varianteRadio = document.querySelector(`input[name="a11y-el-variante"][value="${isPresetImagem ? 'imagem' : 'componente'}"]`);
    if (varianteRadio) varianteRadio.checked = true;
    if (select) {
      // Sem preset válido (nenhum match real de componente DSC), o select
      // cai em "outro" — opção neutra explícita do catálogo (ver comentário
      // em _resolveA11yFormPresetFromItem/isUnmapped acima) — nunca na
      // primeira chave do objeto (Object.keys(...)[0] === 'accordion', bug
      // real reportado 2026-09-17: usuário via "Accordion" pré-selecionado
      // no dropdown sem nenhuma lógica de match ativa, só o efeito colateral
      // de indexar Object.keys em vez de usar a opção neutra que o próprio
      // <select> já tem). "outro" não é chave de A11Y_CONTENT.elemento.
      // componentes (é tratado à parte, ver isOutro em updateA11yElementoFields).
      // "imagem" nunca é um valor válido do <select> desde a reestruturação
      // acima — cai em "outro" como qualquer preset não reconhecido (o radio
      // já foi marcado como 'imagem' acima, então updateA11yElementoFields
      // esconde este <select> de qualquer forma).
      const validPreset = !isPresetImagem && presetComponente && A11Y_CONTENT.elemento.componentes[presetComponente];
      select.value = validPreset ? presetComponente : 'outro';
    }
    // Reset do seletor de sub-variante mobile pro default real da property
    // ("componente") — editA11ySpec restaura o valor salvo depois, via
    // _prefillA11ySpecForEdit/_restoreA11yElementoMobileVariant.
    const mobileVariantDefault = document.querySelector('input[name="a11y-el-mobile-variant"][value="componente"]');
    if (mobileVariantDefault) mobileVariantDefault.checked = true;
    const mobileList = document.getElementById('a11y-el-mobile-toggles-list');
    if (mobileList) { delete mobileList.dataset.renderedVariant; mobileList.innerHTML = ''; }
    updateA11yElementoFields();
  } else if (category === 'estrutura') {
    const subtipoSelect = document.getElementById('a11y-estrutura-subtipo-select');
    // presetEstruturaTipo só existe pra marco de navegação (header/nav/main/
    // aside/footer), então já implica variacao = 'marco de navegacao' em vez
    // do default 'idiomas'.
    if (subtipoSelect) subtipoSelect.value = presetEstruturaTipo ? 'marco de navegacao' : 'idiomas';
    const idiomasSelect = document.getElementById('a11y-estrutura-idiomas-select');
    if (idiomasSelect) idiomasSelect.value = 'da pagina';
    const marcoSelect = document.getElementById('a11y-estrutura-marco-select');
    if (marcoSelect) marcoSelect.value = presetEstruturaTipo || 'header';
    updateA11yEstruturaFields();
  } else if (category === 'titulo') {
    const nivelSelect = document.getElementById('a11y-titulo-nivel-select');
    if (nivelSelect) nivelSelect.value = presetTituloNivel || _defaultTituloNivelForOrigin(a11yOrigin);
    updateA11yTituloFields();
  } else if (category === 'decorativo') {
    const subtipoSelect = document.getElementById('a11y-decorativo-subtipo-select');
    if (subtipoSelect) subtipoSelect.value = 'gerais';
    updateA11yDecorativoFields();
  } else if (category === 'informacoes') {
    const subtipoSelect = document.getElementById('a11y-informacoes-subtipo-select');
    if (subtipoSelect) subtipoSelect.value = 'handoffs';
    updateA11yInformacoesFields();
  }

  const tagInputId = A11Y_TAG_INPUT_ID[category];
  if (tagInputId) {
    const tagInput = document.getElementById(tagInputId);
    if (tagInput) tagInput.value = _suggestNextA11yTagForArea(modal.dataset.areaId, category);
  }
  validateA11yTagInput();

  openModal('a11y-spec-modal');
}
window.openA11yModal = openA11yModal;

// Corrige a categoria sugerida pela Detecção Automática sem descartar o item
// (ver botão de alterar categoria no cabeçalho, openA11yWizardCategoryPickerModal)
// — reabre o mesmo formulário só que com outra categoria, preservando
// targetNodeId/origem/componente DSC/nome de camada do item atual (o que
// _resolveA11yFormPresetFromItem já resolveu pra ele); presetComponente/
// presetTituloNivel/presetEstruturaTipo não se aplicam à nova categoria, por
// isso não são repassados — cada categoria nasce no próprio default.
function switchA11yWizardCategory(newCategory) {
  const modal = document.getElementById('a11y-spec-modal');
  if (!modal || !A11Y_CATEGORIES[newCategory]) return;
  if (newCategory === modal.dataset.category) return;
  const options = {
    pendingTargetNodeId: modal.dataset.pendingTargetNodeId || null,
    a11yOrigin: modal.dataset.a11yOrigin || 'web',
    dscComponentName: modal.dataset.dscComponentName || null,
    targetNodeName: document.getElementById('a11y-modal-target-node-name').textContent,
  };
  openA11yModal(newCategory, options);
  const state = window._a11yBatchWizardState;
  if (state) _applyA11yWizardModalUi(state);
}
window.switchA11yWizardCategory = switchA11yWizardCategory;

// Contador de caracteres genérico e reaproveitável — usado por TODOS os
// campos de texto livre da spec de a11y (estáticos em modals.html e
// dinâmicos gerados via template string aqui neste arquivo). Convenção:
// todo campo com contador tem um <span id="{id-do-campo}-counter"> logo ao
// lado (irmão no mesmo wrapper) mostrando "N/limite". `oninput` chama esta
// função passando `this` — nenhuma lógica por campo, só lê maxlength do
// próprio elemento. Chamada também on-render (ver chamadas logo após cada
// innerHTML dinâmico) pra refletir valores já restaurados em modo edição.
function updateA11yCharCounter(el) {
  if (!el) return;
  const counter = document.getElementById(el.id + '-counter');
  if (!counter) return;
  const max = el.getAttribute('maxlength');
  const len = (el.value || '').length;
  counter.textContent = max ? `${len}/${max}` : String(len);
}
window.updateA11yCharCounter = updateA11yCharCounter;

// Igual updateA11yCharCounter, mas para contadores dinâmicos sem id fixo —
// usado nos toggles renderizados em loop (Observações/Notas de Código por
// componente), onde vários textareas compartilham o mesmo padrão mas não têm
// id único prático. `el` é o textarea/input; `counterEl` é o <span> irmão
// direto já resolvido pelo chamador (ver _renderA11yElementoToggles e afins).
function updateA11yCharCounterEl(el, counterEl) {
  if (!el || !counterEl) return;
  const max = el.getAttribute('maxlength');
  const len = (el.value || '').length;
  counterEl.textContent = max ? `${len}/${max}` : String(len);
}
window.updateA11yCharCounterEl = updateA11yCharCounterEl;

// Tag manual — formato varia por categoria (ver A11Y_TAG_PATTERN_BY_CATEGORY
// abaixo). Resolve o input/erro certo a partir da categoria aberta no
// momento (modal.dataset.category). Título e Elemento Decorativo usam selo
// fixo, não participam dessa numeração — nesse caso não há o que validar,
// botão sempre habilitado.
//
// "elemento" (Elementos e Imagens) mudou de alfanumérico (A, A1, A1.1...)
// pra puramente numérico (1, 1.1, 1.2...) em 2026-09-18, pedido explícito do
// usuário: "pra não conflitar com o nível de título" — o marcador de Título
// usa letra "H"/"H1"-"H6", então uma tag de Elemento também começando por
// letra podia se confundir visualmente/logicamente com ele. "estrutura" e
// "informacoes" continuam alfanuméricas (A, A1...) — não fazem parte deste
// pedido, mantidas como estavam.
const A11Y_TAG_PATTERN_BY_CATEGORY = {
  elemento: /^\d+(\.\d+)*$/,
  estrutura: /^[A-Z]\d*(\.\d+)*$/,
  informacoes: /^[A-Z]\d*(\.\d+)*$/,
};
function validateA11yTagInput() {
  const modal = document.getElementById('a11y-spec-modal');
  const category = modal ? modal.dataset.category : '';
  const confirmBtn = document.getElementById('btn-a11y-confirm');
  const inputId = A11Y_TAG_INPUT_ID[category];
  if (!inputId) {
    if (confirmBtn) confirmBtn.disabled = false;
    return true;
  }
  const input = document.getElementById(inputId);
  const error = document.getElementById(A11Y_TAG_ERROR_ID[category]);
  if (!input) return true;
  updateA11yCharCounter(input);
  const pattern = A11Y_TAG_PATTERN_BY_CATEGORY[category] || /^[A-Z]\d*(\.\d+)*$/;
  const value = category === 'elemento' ? input.value : input.value.toUpperCase();
  const isValid = pattern.test(value);
  if (error) error.classList.toggle('hidden', isValid);
  if (confirmBtn) confirmBtn.disabled = !isValid;
  return isValid;
}
window.validateA11yTagInput = validateA11yTagInput;

// A origem filtra tudo (decisão de produto, 2026-09): specs mobile de
// "Elementos e Imagens" nunca compartilham tela com o catálogo desktop de 15
// componentes + Imagem. Esconde/mostra de uma vez só o seletor "Tipo de
// elemento" (a11y-el-desktop-variante-wrap), o bloco do <select> "Componente"
// (trigger + menu) e o bloco #a11y-el-desktop-block ("Outro", preview de
// Descrição/Nota de Código) + variantes/toggles do catálogo
// (#a11y-el-variants-wrap/#a11y-el-toggles-wrap, que já têm sua própria
// lógica condicional de "tem conteúdo catalogado" — aqui só sobrepomos com
// 'hidden' por cima quando mobile). Chamada sempre do topo de
// updateA11yElementoFields, antes de qualquer outra decisão — a decisão
// "componente vs imagem" (isImagem, dentro de updateA11yElementoFields) só é
// avaliada depois, e só é relevante quando isMobile === false.
function _toggleA11yElementoDesktopBlock(isMobile) {
  const varianteWrap = document.getElementById('a11y-el-desktop-variante-wrap');
  const componenteCol = document.getElementById('a11y-el-desktop-componente-col');
  const imagemInfoWrap = document.getElementById('a11y-el-imagem-info-wrap');
  const desktopBlock = document.getElementById('a11y-el-desktop-block');
  const variantsWrap = document.getElementById('a11y-el-variants-wrap');
  const togglesWrap = document.getElementById('a11y-el-toggles-wrap');
  if (varianteWrap) varianteWrap.classList.toggle('hidden', isMobile);
  if (componenteCol) componenteCol.classList.toggle('hidden', isMobile);
  if (desktopBlock) desktopBlock.classList.toggle('hidden', isMobile);
  if (isMobile) {
    // Sobrepõe o 'hidden' condicional que _renderA11yElementoVariants/
    // _renderA11yElementoToggles/updateA11yElementoFields (isImagem) já
    // controlam — em mobile nenhum bloco desktop deve aparecer, mesmo que o
    // <select>/radio escondidos ainda guardem um valor residual de sessão
    // anterior.
    if (imagemInfoWrap) imagemInfoWrap.classList.add('hidden');
    if (variantsWrap) variantsWrap.classList.add('hidden');
    if (togglesWrap) togglesWrap.classList.add('hidden');
  }
  // Reavalia a visibilidade do campo Label (#a11y-el-label-wrap) aqui,
  // incondicionalmente — este é o único ponto por onde TODO re-render da
  // categoria "elemento" passa (mobile e desktop), então cobre os dois
  // ramos sem depender só do caminho mobile-only de
  // _renderA11yElementoMobileFields (que faz early-return antes de chegar
  // lá quando !isMobile). Chamada aqui no TOPO de updateA11yElementoFields
  // (antes de isImagem/desktopSelect.value serem lidos mais abaixo nesta
  // função) é segura: o <select> só dispara 'change' (que chama
  // updateA11yElementoFields) DEPOIS que o DOM já atualizou seu .value —
  // _updateA11yMobileLabelVisibility lê esse valor de novo, direto do
  // select, então nunca vê um valor desatualizado.
  if (typeof _updateA11yMobileLabelVisibility === 'function') _updateA11yMobileLabelVisibility();
}

// ── Elementos e Imagens ──────────────────────────────────────────────────
// Lê o radio "Componente ou Imagem" (a11y-el-variante) — reflete a property
// REAL "variante" do component set base (2 opções publicadas: "componente" |
// "texto alternativo para imagens", confirmadas via REST API, fileKey
// Wy0IhXRVZMSOOr8E609UqI, nodeId 31:902). Default 'componente' (mesmo
// default real da property). Só relevante em specs desktop — specs mobile
// nem têm este radio visível (bloco inteiro escondido, ver
// _toggleA11yElementoDesktopBlock).
function _getA11yElementoVariante() {
  const checked = document.querySelector('input[name="a11y-el-variante"]:checked');
  return checked ? checked.value : 'componente';
}
window._getA11yElementoVariante = _getA11yElementoVariante;

// onchange do radio "Componente ou Imagem" — só alterna a visibilidade do
// dropdown de catálogo vs. o bloco informativo de Imagem e força o rerender
// dos campos condicionais (updateA11yElementoFields resolve o shortName real
// a consultar a partir daqui).
function updateA11yElementoVariante() {
  updateA11yElementoFields();
}
window.updateA11yElementoVariante = updateA11yElementoVariante;

// Select com o catálogo real de 15 componentes do DSC + "Outro" (texto
// livre, pra telas com componentes fora do catálogo) — usado só quando
// a11y-el-variante === 'componente'. Quando === 'imagem', o dropdown fica
// escondido e o shortName consultado passa a ser fixo 'imagem' (mesmo
// componente real "texto alternativo para imagens" de sempre — não existe
// catálogo de imagens separado no plugin). Ao escolher um item, mostra
// preview somente-leitura de Descrição/Nota de Código. Specs mobile
// (modal.dataset.a11yOrigin === 'mobile') pulam esse catálogo inteiro — só a
// lib de Acessibilidade MOBILE alimenta essas specs, nunca a desktop (ver
// _toggleA11yElementoDesktopBlock acima).
function updateA11yElementoFields() {
  const modal = document.getElementById('a11y-spec-modal');
  const isMobile = !!modal && modal.dataset.a11yOrigin === 'mobile';
  // _toggleA11yElementoDesktopBlock já reavalia _updateA11yMobileLabelVisibility
  // incondicionalmente no fim de si mesma (único ponto por onde todo
  // re-render desta categoria passa, mobile e desktop) — não duplicar a
  // chamada aqui.
  _toggleA11yElementoDesktopBlock(isMobile);
  if (isMobile) {
    _renderA11yElementoMobileFields();
    return;
  }

  const select = document.getElementById('a11y-el-componente-select');
  const outroWrap = document.getElementById('a11y-el-componente-outro-wrap');
  const previewWrap = document.getElementById('a11y-el-preview');
  const componenteCol = document.getElementById('a11y-el-desktop-componente-col');
  const imagemInfoWrap = document.getElementById('a11y-el-imagem-info-wrap');
  if (!select) return;

  const isImagem = _getA11yElementoVariante() === 'imagem';
  if (componenteCol) componenteCol.classList.toggle('hidden', isImagem);
  if (imagemInfoWrap) imagemInfoWrap.classList.toggle('hidden', !isImagem);

  const triggerLabel = document.getElementById('a11y-el-componente-trigger-label');
  if (triggerLabel) {
    const opt = select.options[select.selectedIndex];
    if (opt) triggerLabel.textContent = opt.textContent;
  }
  const isOutro = !isImagem && select.value === 'outro';
  if (outroWrap) outroWrap.classList.toggle('hidden', !isOutro);
  if (previewWrap) previewWrap.classList.toggle('hidden', isOutro);
  // shortName real a consultar: 'imagem' quando a variante é Imagem
  // (independente do valor residual do <select>, que fica escondido/
  // irrelevante nesse modo); senão, o valor do <select> (ou null se "Outro").
  const shortNameKey = isImagem ? 'imagem' : (isOutro ? null : select.value);
  _renderA11yElementoVariants(shortNameKey);
  _renderA11yElementoToggles(shortNameKey);
  _renderA11yElementoMobileFields();
  if (isOutro) return;

  const entry = A11Y_CONTENT.elemento.componentes[isImagem ? 'imagem' : select.value];
  const descEl = document.getElementById('a11y-el-preview-descricao');
  const notaWrap = document.getElementById('a11y-el-preview-nota-wrap');
  const notaEl = document.getElementById('a11y-el-preview-nota');
  if (descEl) descEl.textContent = (entry && entry.descricao) || '';
  if (notaWrap) notaWrap.classList.toggle('hidden', !(entry && entry.notasCodigo));
  if (notaEl) notaEl.textContent = (entry && entry.notasCodigo) || '';
}
window.updateA11yElementoFields = updateA11yElementoFields;

// Renderiza, dentro de #a11y-el-variants-list, um <select> nativo por
// property VARIANT secundária REAL que o componente escolhido tem na lib
// (ex: Button → "tipo": default/desabilitado/de icone...) — ver
// _getA11yComponentToggles/variantFields. Nunca duplica o próprio <select>
// de "Componente" (esse já é o nível 1, controlado por outro elemento do
// formulário) — variantFields já vem filtrado disso. Aparece ANTES dos
// toggles booleanos (característica mais estrutural do componente).
function _renderA11yElementoVariants(selectValue) {
  const wrap = document.getElementById('a11y-el-variants-wrap');
  const list = document.getElementById('a11y-el-variants-list');
  if (!wrap || !list) return;
  list.innerHTML = '';

  const info = selectValue ? _getA11yComponentToggles(selectValue) : null;
  const fields = (info && info.variantFields) || [];
  wrap.classList.toggle('hidden', fields.length === 0);
  if (fields.length === 0) return;

  fields.forEach(f => {
    const row = document.createElement('div');
    const optionsHtml = f.options.map(o =>
      `<option value="${escapeHtml(o.value)}"${o.value === f.defaultValue ? ' selected' : ''}>${escapeHtml(o.label)}</option>`
    ).join('');
    row.innerHTML = `
      <label class="block text-dsc-label-tiny font-bold text-slate-500 dark:text-dark-muted normal-case tracking-normal mb-1.5 ml-1">${escapeHtml(_capitalizeFirst(f.name))}</label>
      <select data-a11y-variant-name="${escapeHtml(f.rawName)}"
        class="dsc-select w-full bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-line rounded-dsc-medium px-dsc-micro py-2.5 text-[12px] text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-100 transition-all">
        ${optionsHtml}
      </select>
    `;
    list.appendChild(row);
  });
}

// Lê o(s) <select> de variante dinâmica de volta — chamado por
// confirmA11ySpec. Retorna o valor do primeiro campo encontrado (hoje só
// existe "tipo" por componente) ou null se não houver campo renderizado
// (componente sem variante secundária, ou "Outro").
function _collectA11yElementoVariantValue() {
  const list = document.getElementById('a11y-el-variants-list');
  if (!list) return null;
  const select = list.querySelector('[data-a11y-variant-name]');
  return select ? select.value : null;
}

// Inverso de _collectA11yElementoVariantValue — usado em
// _prefillA11ySpecForEdit (editA11ySpec) pra restaurar o valor salvo em
// spec.a11ySubtype.tipo depois que updateA11yElementoFields já recriou o
// <select> pro componente certo.
function _restoreA11yElementoVariant(tipoValue) {
  if (!tipoValue) return;
  const list = document.getElementById('a11y-el-variants-list');
  if (!list) return;
  const select = list.querySelector('[data-a11y-variant-name]');
  if (select) select.value = tipoValue;
}

// Renderiza, dentro de #a11y-el-toggles-list, um toggle por campo booleano
// REAL que o componente escolhido tem na lib (ver _getA11yComponentToggles) —
// componentes diferentes mostram conjuntos diferentes. Cada toggle começa
// DESLIGADO por padrão (decisão de produto: o designer escolhe explicitamente
// o que documentar a cada spec) e, quando ligado, revela um textarea de texto
// livre — é esse texto que o backend grava de verdade dentro do campo do
// componente real (ver _tryImportA11yComponent, code.js). Reconstrói a lista
// do zero a cada troca de componente.
function _renderA11yElementoToggles(selectValue) {
  const wrap = document.getElementById('a11y-el-toggles-wrap');
  const list = document.getElementById('a11y-el-toggles-list');
  if (!wrap || !list) return;
  list.innerHTML = '';

  const info = selectValue ? _getA11yComponentToggles(selectValue) : null;
  // "Nome Acessível" não é renderizado aqui (removido em 2026-09, mesmo
  // padrão já aplicado ao mobile): duplicava o campo "Label
  // (accessibilityLabel)" sempre visível no topo do formulário
  // (#a11y-el-label) — os dois alimentavam o mesmo accessibilityLabel real.
  // O Label do topo agora é a ÚNICA fonte; confirmA11ySpec/
  // _buildA11yElementoPayload injeta o valor do Label em properties[] com
  // key 'nomeAcessivel' automaticamente quando o componente tem essa
  // property real. Ver _restoreA11yElementoToggles para a migração de specs
  // antigas que salvaram os dois campos com valores divergentes.
  const toggles = ((info && info.toggles) || []).filter(t => t.key !== 'nomeAcessivel');
  wrap.classList.toggle('hidden', toggles.length === 0);
  if (toggles.length === 0) return;

  toggles.forEach(t => {
    const max = A11Y_TOGGLE_MAXLENGTH[t.key] || A11Y_TOGGLE_MAXLENGTH_DEFAULT;
    const row = document.createElement('div');
    row.className = 'bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-line rounded-dsc-medium overflow-hidden';
    row.innerHTML = `
      <label class="flex items-center gap-dsc-nano px-dsc-micro py-2.5 cursor-pointer select-none">
        <input type="checkbox" data-a11y-toggle-key="${t.key}"
          onchange="_onA11yElementoToggleChange(this)"
          class="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0" />
        <span class="text-[12px] font-bold text-slate-700 dark:text-white">${escapeHtml(t.label)}</span>
      </label>
      <div class="hidden px-dsc-micro pb-3" data-a11y-toggle-textarea-wrap>
        <textarea data-a11y-toggle-value maxlength="${max}" rows="2" placeholder="Insira seu texto de ${escapeHtml(t.label.toLowerCase())}."
          oninput="updateA11yCharCounterEl(this, this.nextElementSibling)"
          class="w-full bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-line rounded-dsc-small px-2.5 py-dsc-nano text-[12px] text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-100 transition-all resize-none"></textarea>
        <span class="block text-right text-dsc-label-tiny normal-case tracking-normal text-slate-400 dark:text-dark-muted mt-0.5">0/${max}</span>
      </div>
    `;
    list.appendChild(row);
  });
}

// Mostra/esconde o textarea do campo quando o toggle correspondente muda:
// limpa o texto ao desligar, pra não persistir um valor "fantasma" de um
// toggle desativado. `row` é o container criado em
// _renderA11yElementoToggles (checkbox e textarea são sempre irmãos diretos
// dentro dele) — cobre o padrão "card fechado" original (toggleRowHtml).
//
// Fallback por data-a11y-toggle-key (2026-09-22): o checkbox "Observações"
// do formulário mobile "componente" foi movido pra linha da Tag (pedido do
// usuário: "checkbox ao lado, input abre abaixo"), ficando fisicamente longe
// do textarea companheiro — não são mais irmãos dentro do mesmo `div`, então
// `closest('div')` nunca encontra o wrap certo (sobe até um container maior
// sem o textarea dentro). Quando isso acontece, busca por id fixo específico
// desse caso (#a11y-el-mobile-observacoes-textarea-wrap) — não por
// querySelector global (que pegaria o wrap errado se houver mais de um
// toggle "observacoes" simultâneo no DOM, hoje não acontece mas evita a
// armadilha se algum dia acontecer).
function _onA11yElementoToggleChange(checkbox) {
  const row = checkbox.closest('div');
  let wrap = row ? row.querySelector('[data-a11y-toggle-textarea-wrap]') : null;
  if (!wrap && checkbox.closest('#a11y-el-mobile-observacoes-inline-wrap')) {
    wrap = document.getElementById('a11y-el-mobile-observacoes-textarea-wrap');
  }
  if (!wrap) return;
  wrap.classList.toggle('hidden', !checkbox.checked);
  const ta = wrap.querySelector('[data-a11y-toggle-value]');
  if (!checkbox.checked) {
    if (ta) ta.value = '';
  }
  if (ta) updateA11yCharCounterEl(ta, ta.nextElementSibling);
}
window._onA11yElementoToggleChange = _onA11yElementoToggleChange;

// Lê os toggles ligados com texto preenchido de volta em properties[] —
// chamado por confirmA11ySpec. Cada item vira { key, label, value } igual
// descricao/notaCodigo já fazem hoje, fluindo pro backend do mesmo jeito.
function _collectA11yElementoToggleProperties() {
  const list = document.getElementById('a11y-el-toggles-list');
  if (!list) return [];
  const result = [];
  list.querySelectorAll('[data-a11y-toggle-key]').forEach(checkbox => {
    if (!checkbox.checked) return;
    const row = checkbox.closest('div');
    const wrap = row ? row.querySelector('[data-a11y-toggle-textarea-wrap]') : null;
    const ta = wrap ? wrap.querySelector('[data-a11y-toggle-value]') : null;
    const value = ta ? ta.value.trim() : '';
    if (!value) return;
    const key = checkbox.getAttribute('data-a11y-toggle-key');
    result.push({ key, label: A11Y_TOGGLE_LABELS[key] || key, value });
  });
  return result;
}

// Inverso de _collectA11yElementoToggleProperties — usado em
// _prefillA11ySpecForEdit (editA11ySpec) pra religar os toggles que a spec
// salva tinha marcado, com o texto já digitado de volta no textarea.
// Chamada DEPOIS de `setVal('a11y-el-label', getProp('label'))` (ver
// _prefillA11ySpecForEdit) — ordem relevante pro fallback de 'nomeAcessivel'
// abaixo, mesmo padrão de _restoreA11yElementoMobileToggles.
function _restoreA11yElementoToggles(props) {
  const list = document.getElementById('a11y-el-toggles-list');
  if (!list) return;
  const canonicalKeys = new Set(Object.keys(A11Y_TOGGLE_LABELS));
  (props || []).forEach(p => {
    if (!p) return;
    // Migração: specs desktop ANTIGAS podiam ter properties['nomeAcessivel']
    // preenchido pelo checkbox "Nome Acessível" removido em 2026-09
    // (duplicava o campo "Label (accessibilityLabel)" sempre visível no topo
    // do formulário). Ao reabrir pra edição, o valor volta a aparecer — agora
    // no campo Label do topo — sem perder dado. Só entra se o Label ainda
    // estiver vazio (não sobrescreve um valor de Label já salvo na mesma
    // spec — cenário legado em que os dois campos coexistiam preenchidos).
    if (p.key === 'nomeAcessivel') {
      const labelInput = document.getElementById('a11y-el-label');
      if (labelInput && !labelInput.value.trim()) { labelInput.value = p.value || ''; updateA11yCharCounter(labelInput); }
      return;
    }
    if (!canonicalKeys.has(p.key)) return;
    const checkbox = list.querySelector(`[data-a11y-toggle-key="${p.key}"]`);
    if (!checkbox) return;
    checkbox.checked = true;
    const row = checkbox.closest('div');
    const wrap = row ? row.querySelector('[data-a11y-toggle-textarea-wrap]') : null;
    if (wrap) {
      wrap.classList.remove('hidden');
      const ta = wrap.querySelector('[data-a11y-toggle-value]');
      if (ta) { ta.value = p.value || ''; updateA11yCharCounterEl(ta, ta.nextElementSibling); }
    }
  });
}

// Lê o seletor de sub-variante mobile (radio a11y-el-mobile-variant) — só
// existe/é relevante quando modal.dataset.a11yOrigin === 'mobile'. Default
// 'componente' (mesmo default da property VARIANT real "Variante" no
// component set base, ver A11Y_ELEMENTO_MOBILE_VARIANTS).
function _getA11yElementoMobileVariant() {
  const checked = document.querySelector('input[name="a11y-el-mobile-variant"]:checked');
  return checked ? checked.value : A11Y_ELEMENTO_MOBILE_VARIANTS.componente;
}

// onchange do radio de sub-variante mobile — força o rerender do bloco
// condicional (limpa o guard de dataset.renderedVariant pra
// _renderA11yElementoMobileFields não pular a reconstrução).
function updateA11yElementoMobileVariant() {
  const list = document.getElementById('a11y-el-mobile-toggles-list');
  if (list) delete list.dataset.renderedVariant;
  _renderA11yElementoMobileFields();
}
window.updateA11yElementoMobileVariant = updateA11yElementoMobileVariant;

// Campos exclusivos de "Elementos e Imagens" mobile — bloco inteiro
// reconstruído a cada troca de sub-variante (componente / link / texto
// alternativo), refletindo a árvore real do component set mobile (ver
// refs/design-acessivel-mobile-link-property.json). O toggle "Nome
// Acessível" que existia aqui até 2026-09 foi REMOVIDO (duplicava o campo
// "Label (accessibilityLabel)" sempre visível no topo do formulário,
// #a11y-el-label — ver comentário em _renderA11yElementoMobileFields):
//   - "componente": Descrição/Dica Leitor de Tela/Observação (toggles
//     opcionais, cada um com textarea) + Link do Componente (SEMPRE
//     visível, sem toggle — dropdown com o catálogo real de nomes + URL obrigatória).
//   - "link": Descrição fixa e travada (A11Y_CONTENT.elemento.mobileLink) +
//     Observação opcional. Sem Dica Leitor de Tela, sem Link do Componente
//     (não existem nessa variante na lib real).
//   - "texto alternativo": Descrição é textarea LIVRE OBRIGATÓRIA (o alt-text
//     real da mídia) + Observação opcional. Sem Dica, sem Link do
//     Componente.
// Visibilidade do bloco inteiro decidida por modal.dataset.a11yOrigin
// ('mobile'), setado por openA11yModal — nunca aparece em specs web, porque
// o wrapper real desktop ("[a11y] Box specs LT") não tem essa sub-variação.
//
// 2026-09-17 (pedido explícito do usuário): a escolha manual dos radios
// "Link"/"Texto Alternativo" (ver a11y-el-mobile-variant-wrap, modals.html)
// foi removida da UI — motivo: "isso já vem como propriedade do componente".
// Investigado via REST API (lib "DSC | Super App", fileKey
// epCGtlKQxedDxQVlK3lNcN, refs/super-app-properties.json): os
// componentPropertyDefinitions reais dessa lib não têm nenhuma property que
// carregue link/vínculo pro componente — os 20 INSTANCE_SWAP reais
// existentes (Card/Accordion "swap slot", Button/Icon Button/Badge "change
// icon" etc.) são todos de composição visual interna, nenhum aponta de volta
// pro próprio componente. O único dado real de vínculo disponível hoje é o
// NOME do component set (containingFrame), resolvido a partir do
// componentKey da instância via _resolveDscComponentA11yMatch
// (backend/dsc-matching.js) — e esse nome já chega automaticamente em
// modal.dataset.dscComponentName, já alimenta o cabeçalho do modal
// ("Componente do DSC") e já pré-seleciona/preenche automaticamente o
// dropdown+URL de "Link do Componente" mais abaixo (ver
// autoMatchedOption/_autofillA11yMobileLinkUrlFromComponentName). Ou seja, a
// automação pedida (usar o vínculo real em vez de pedir pro designer
// declarar manualmente) JÁ EXISTIA antes deste pedido — o que faltava
// remover era só a escolha manual redundante "Link"/"Texto Alternativo", que
// não tinha lastro em nenhuma property real (a property real "Variante" do
// component set ".[a11y mob base] Elementos e imagens" é um rótulo textual
// do WRAPPER de documentação de a11y, não do componente DSC em si — não
// existe fonte de dado real que preencha esses 2 radios automaticamente a
// partir do componente vinculado, diferente do que se cogitou).
// Os branches `variant === link` e `variant === textoAlternativo` abaixo
// continuam existindo (nunca mais alcançáveis a partir da UI de specs NOVAS,
// já que o radio correspondente só existe hidden — ver modals.html) só para
// _restoreA11yElementoMobileToggles/_prefillA11ySpecForEdit conseguirem
// reconstruir corretamente o formulário ao EDITAR specs mobile ANTIGAS que
// tenham usado essas variantes — dado histórico nunca se perde. Não remover
// esses branches sem migrar antes os dados de specs antigas.
function _renderA11yElementoMobileFields() {
  const modal = document.getElementById('a11y-spec-modal');
  const wrap = document.getElementById('a11y-el-mobile-toggles-wrap');
  const list = document.getElementById('a11y-el-mobile-toggles-list');
  const variantWrap = document.getElementById('a11y-el-mobile-variant-wrap');
  if (!wrap || !list) return;
  const isMobile = modal && modal.dataset.a11yOrigin === 'mobile';
  // 2026-09-17 (pedido explícito do usuário, mesmo padrão de
  // updateA11yTituloFields/updateA11yDecorativoFields): só o grupo de radios
  // "Variante (mobile)" (Componente/Link/Texto Alternativo — a11y-el-mobile-
  // variant-wrap) fica sempre oculto com `hidden` pra specs NOVAS,
  // independente da origem, porque a escolha manual "Link"/"Texto
  // Alternativo" não tem mais lastro em nenhuma property real (ver
  // comentário grande acima da função). Os <input> continuam no DOM só para
  // _prefillA11ySpecForEdit reconstruir o valor salvo de specs mobile
  // ANTIGAS.
  //
  // BUG CORRIGIDO (2026-09-17, regressão real): o wrapper "Campos exclusivos
  // mobile" (#a11y-el-mobile-toggles-wrap — Observações, Nome Acessível e
  // TODO o bloco "Link do Componente"/dropdown de Componente DSC/Leitor de
  // Tela) tinha sido colocado no MESMO `wrap.classList.add('hidden')`
  // incondicional por engano, herdando o tratamento que só deveria valer
  // para variantWrap. Isso escondia o formulário inteiro reconstruído nesta
  // sessão (Nome Acessível condicional, Leitor de Tela condicional, Link do
  // Componente) para toda spec NOVA de "Elementos e Imagens" mobile — só os
  // campos genéricos fora deste wrap (Tag/Label/Modo de Marcação/Lado da
  // Guia) permaneciam visíveis, reproduzindo exatamente o modal
  // "praticamente vazio" reportado no teste real. `wrap` precisa continuar
  // condicionado a isMobile (mesma regra de sempre): é ele quem contém o
  // conteúdo real do formulário mobile, não um resquício de UI descontinuada
  // como variantWrap.
  wrap.classList.toggle('hidden', !isMobile);
  if (variantWrap) variantWrap.classList.add('hidden');
  if (!isMobile) { list.innerHTML = ''; return; }

  const variant = _getA11yElementoMobileVariant();
  // O bloco desktop (catálogo de 16 categorias) nunca fica visível/ativo
  // simultaneamente a este bloco (ver _toggleA11yElementoDesktopBlock) —
  // decisão de produto "a origem filtra tudo" (2026-09): a lib mobile é a
  // única fonte pra specs mobile. Os toggles mobile (Descrição/Dica Leitor
  // de Tela/Observação) são sempre renderizados, sem checagem de duplicidade
  // contra o catálogo desktop — catalogToggleKeys foi removido junto com
  // essa checagem.
  //
  // "Nome Acessível" NÃO é mais renderizado aqui (removido em 2026-09):
  // duplicava o campo "Label (accessibilityLabel)" sempre visível no topo do
  // formulário (#a11y-el-label) — os dois alimentavam o mesmo conceito de
  // texto acessível do elemento (aria-label/accessibilityLabel) e, no
  // fallback procedural (que é o caminho real hoje pra specs mobile
  // "elemento" comuns, já que não existe wrapper mobile real cadastrado em
  // A11Y_CONTENT — ver _tryImportA11yComponent, code.js), apareciam como
  // DUAS linhas separadas e redundantes no card. Ver
  // _restoreA11yElementoMobileToggles/_prefillA11ySpecForEdit para a
  // migração que herda o valor salvo de specs antigas com
  // properties['nomeAcessivel'] de volta pro campo Label do topo.
  // Reconstrói sempre que a variante mudar de fato — guarda no dataset da
  // própria lista pra não perder o texto digitado em rerenders triviais.
  const renderKey = variant;
  if (list.dataset.renderedVariant === renderKey && list.childElementCount > 0) return;
  list.dataset.renderedVariant = renderKey;
  list.innerHTML = '';

  const toggleRowHtml = (key, label, placeholder) => {
    const max = A11Y_TOGGLE_MAXLENGTH[key] || A11Y_TOGGLE_MAXLENGTH_DEFAULT;
    return `
    <div class="bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-line rounded-dsc-medium overflow-hidden">
      <label class="flex items-center gap-dsc-nano px-dsc-micro py-2.5 cursor-pointer select-none">
        <input type="checkbox" data-a11y-toggle-key="${key}"
          onchange="_onA11yElementoToggleChange(this)"
          class="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0" />
        <span class="text-[12px] font-bold text-slate-700 dark:text-white">${escapeHtml(label)}</span>
      </label>
      <div class="hidden px-dsc-micro pb-3" data-a11y-toggle-textarea-wrap>
        <textarea data-a11y-toggle-value maxlength="${max}" rows="2" placeholder="${escapeHtml(placeholder)}"
          oninput="updateA11yCharCounterEl(this, this.nextElementSibling)"
          class="w-full bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-line rounded-dsc-small px-2.5 py-dsc-nano text-[12px] text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-100 transition-all resize-none"></textarea>
        <span class="block text-right text-dsc-label-tiny normal-case tracking-normal text-slate-400 dark:text-dark-muted mt-0.5">0/${max}</span>
      </div>
    </div>`;
  };

  if (variant === A11Y_ELEMENTO_MOBILE_VARIANTS.link) {
    const wrapDiv = document.createElement('div');
    wrapDiv.className = 'space-y-2.5';
    wrapDiv.innerHTML = `
      <div class="p-3 bg-gray-50 dark:bg-dark-bg rounded-dsc-medium border border-gray-200 dark:border-dark-line">
        <p class="text-dsc-label-tiny font-bold text-slate-500 dark:text-dark-muted normal-case tracking-normal mb-1">Descrição (fixa)</p>
        <p class="text-[12px] text-slate-700 dark:text-white leading-snug">${escapeHtml(A11Y_CONTENT.elemento.mobileLink.descricao)}</p>
      </div>
      ${toggleRowHtml('observacoes', A11Y_TOGGLE_LABELS.observacoes, 'Insira seu texto de observações.')}
    `;
    list.appendChild(wrapDiv);
    _resetA11yMobileNomeAcessivelSlot();
  } else if (variant === A11Y_ELEMENTO_MOBILE_VARIANTS.textoAlternativo) {
    const wrapDiv = document.createElement('div');
    wrapDiv.className = 'space-y-2.5';
    wrapDiv.innerHTML = `
      <div>
        <div class="flex items-center justify-between mb-1.5 ml-1">
          <label for="a11y-el-mobile-alt-descricao" class="block text-dsc-label-tiny font-bold text-slate-500 dark:text-dark-muted normal-case tracking-normal">Descrição (texto alternativo) *</label>
          <span id="a11y-el-mobile-alt-descricao-counter" class="text-dsc-label-tiny normal-case tracking-normal text-slate-400 dark:text-dark-muted shrink-0">0/180</span>
        </div>
        <textarea id="a11y-el-mobile-alt-descricao" maxlength="180" rows="2" placeholder="Insira aqui o texto alternativo da imagem/mídia."
          oninput="updateA11yCharCounter(this)"
          class="w-full bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-line rounded-dsc-medium px-dsc-micro py-2.5 text-[12px] text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-100 transition-all resize-none"></textarea>
      </div>
      ${toggleRowHtml('observacoes', A11Y_TOGGLE_LABELS.observacoes, 'Insira seu texto de observações.')}
    `;
    list.appendChild(wrapDiv);
    _resetA11yMobileNomeAcessivelSlot();
  } else {
    // "componente" — toggle opcional Observações (reaproveita o rótulo
    // canônico do catálogo desktop) + Nome Acessível (informativo,
    // condicional — ver abaixo) + Link do Componente sempre visível. "Dica
    // para Leitor de Tela" (A11Y_MOBILE_ONLY_TOGGLES) NÃO é mais renderizada
    // aqui — ver comentário na declaração da constante: não corresponde a
    // nenhuma property real da lib nova, só existia na lib antiga
    // descontinuada. Fica só na restauração de dado histórico
    // (_restoreA11yElementoMobileToggles).
    // EXTENSÃO (2026-09-22, pedido explícito do usuário: "o plugin tem que
    // refletir a mesma estrutura [do box spec], só que se modificar a
    // depender da variante, do componente listado"): "Observações" deixou de
    // ser sempre renderizado — visibilidade agora segue o mesmo critério
    // real já usado por Nome Acessível/Label (_a11yMobileComponentHasToggle
    // generalizado), sincronizado por _updateA11yMobileObservacoesVisibility
    // nos MESMOS pontos de _updateA11yMobileNomeAcessivelVisibility. Impacto
    // real hoje é raro (109 sub-variantes reais mapeadas, só 1 sem
    // Observações — "Top App Bar"/"Show Filters") mas a lib é quem decide,
    // não uma lista fixa no código (ver CLAUDE.md, "a lib é a referência").
    //
    // Checkbox movido pra linha da Tag (2026-09-22, ver
    // #a11y-el-mobile-observacoes-inline-wrap em modals.html — pedido do
    // usuário: "o checkbox de observações pode estar ao lado pra ser
    // marcado"): não cria mais um card novo aqui dentro da lista — o
    // checkbox JÁ existe fixo no HTML, só precisa ser (re)exibido/ocultado
    // por _updateA11yMobileObservacoesVisibility, chamada logo abaixo neste
    // mesmo render (mesmo padrão de Nome Acessível/Label, que também vivem
    // fora desta lista dinâmica).

    // "Nome Acessível" (editável, revisto 2026-09-23) — o card
    // #a11y-el-mobile-nome-acessivel-row NÃO é mais criado aqui: é FIXO no
    // HTML (modals.html, dentro de #a11y-el-mobile-toggles-wrap, logo antes
    // desta lista), e sua visibilidade + o REALOCAMENTO do input real
    // (#a11y-el-label-wrap) pra dentro dele são feitos por
    // _updateA11yMobileNomeAcessivelVisibility (chamada logo abaixo neste
    // mesmo render). Recriar via innerHTML a cada troca de variante — como
    // acontecia antes — destruiria e reconstruiria o card em toda mudança de
    // select, o que é desnecessário agora que ele é um elemento único
    // persistente (mesmo padrão já aplicado ao checkbox de Observações em
    // 2026-09-22).

    // Link do Componente — sempre visível, sem toggle (reflete a árvore real
    // do Figma: a instância "Link do componente" não tem visible vinculado a
    // nenhum BOOLEAN, ver estruturaCompletaVarianteElementosEImagens no JSON
    // extraído). Dropdown com o catálogo real de nomes (default "Personalizado",
    // opção sintética adicionada na renderização — ver comentário acima de
    // A11Y_MOBILE_LINK_COMPONENT_OPTIONS) + campo de texto livre obrigatório
    // (companheiro do dropdown). "Personalizado" É o equivalente mobile
    // do "Outro (fora do catálogo)" desktop: quando o designer não encontra o
    // componente real nas opções do catálogo, deixa "Personalizado" selecionado e usa
    // o campo de texto livre abaixo pra documentar o NOME REAL do componente
    // não mapeado — sinal formal pra vertical de a11y criar essa spec na lib.
    // Reaproveita a mesma key 'linkComponente'/'linkComponenteNome' de sempre
    // (ver _collectA11yElementoMobileToggleProperties) — não precisou criar
    // campo novo, só deixar o rótulo/placeholder explícitos sobre esse uso.
    // Pré-seleção automática (UX, 2026-09): se o nome do componente DSC já
    // resolvido pelo backend (modal.dataset.dscComponentName, ex: "[dsc] Top
    // App Bar") bater com uma das opções fixas do catálogo, usa essa opção
    // como default em vez de "Personalizado" — é só uma SUGESTÃO editável, o
    // designer sempre pode trocar. Dois passos, do mais para o menos
    // confiável: 1) match EXATO (case-insensitive/trim) após limpar o
    // prefixo "[dsc]"; 2) se não houver exato, match APROXIMADO por
    // substring nos dois sentidos (nome limpo contém a opção OU é contido
    // por ela — ex. "[dsc] Value Section" -> "Value Section" exato; "[dsc]
    // Text Field Single Line" -> sugere "Text Field" se essa for a única
    // opção contida). Ambíguo (mais de 1 opção aproximada bate) não sugere
    // nada — evita adivinhar errado quando duas opções são candidatas.
    // Decisão de produto (2026-09-18): antes só o match exato era aceito
    // (nomes reais divergem editorialmente da lista curada em vários casos —
    // ex. "[dsc] Chip" vs "Chips" — e por isso a sugestão aproximada é
    // sempre editável, nunca tratada como certeza). Só entra em specs
    // NOVAS: em edição, _restoreA11yElementoMobileToggles roda DEPOIS deste
    // render e sobrescreve linkSelect.value com o dado salvo
    // (sub.linkComponenteNome), então a escolha do designer sempre prevalece.
    const dscNameRaw = modal ? modal.dataset.dscComponentName : '';
    const dscNameClean = dscNameRaw ? _cleanDscContainingFrameName(dscNameRaw).trim().toLowerCase() : '';
    let autoMatchedOption = dscNameClean
      ? A11Y_MOBILE_LINK_COMPONENT_OPTIONS.find(name => name.trim().toLowerCase() === dscNameClean) || null
      : null;
    if (!autoMatchedOption && dscNameClean) {
      const approx = A11Y_MOBILE_LINK_COMPONENT_OPTIONS.filter(name => {
        const opt = name.trim().toLowerCase();
        return opt.length > 2 && (dscNameClean.includes(opt) || opt.includes(dscNameClean));
      });
      if (approx.length === 1) autoMatchedOption = approx[0];
    }
    // "Personalizado" NÃO existe mais como opção real na lib nova (ver
    // buildMobileLinkOptions em build-a11y-constants.cjs — decisão de
    // produto: o catálogo real não tem opção de exceção). Mantido aqui como
    // opção SINTÉTICA, fora do array gerado, só na renderização do <select>:
    // é o equivalente mobile do "Outro (fora do catálogo)" desktop, preserva
    // a mecânica de lock/autofill (_syncA11yMobileLinkUrlLockState,
    // _autofillA11yMobileLinkUrlFromComponentName) e o dado histórico de
    // specs antigas que salvaram linkComponenteNome:'Personalizado'
    // (_restoreA11yElementoMobileToggles) sem exigir tocar nesses pontos.
    const linkOptionsHtml = [A11Y_MOBILE_LINK_COMPONENT_OPTIONS, ['Personalizado']].flat()
      .map(name => {
        const isSelected = autoMatchedOption ? name === autoMatchedOption : name === 'Personalizado';
        return `<option value="${escapeHtml(name)}"${isSelected ? ' selected' : ''}>${escapeHtml(name)}</option>`;
      })
      .join('');
    const linkRow = document.createElement('div');
    linkRow.className = 'bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-line rounded-dsc-medium p-3 space-y-2';
    linkRow.innerHTML = `
      <p class="text-[12px] font-bold text-slate-700 dark:text-white">${escapeHtml(A11Y_TOGGLE_LABELS.linkComponente)}</p>
      <div>
        <label for="a11y-el-mobile-link-select" class="block text-dsc-label-tiny font-bold text-slate-500 dark:text-dark-muted normal-case tracking-normal mb-1.5 ml-1">Componente do DSC</label>
        <select id="a11y-el-mobile-link-select"
          class="dsc-select w-full bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-line rounded-dsc-medium px-2.5 py-dsc-nano text-[12px] text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-100 transition-all">
          ${linkOptionsHtml}
        </select>
      </div>
      <div id="a11y-el-mobile-screen-reader-variant-wrap" class="hidden">
        <label for="a11y-el-mobile-screen-reader-variant-select" class="block text-dsc-label-tiny font-bold text-slate-500 dark:text-dark-muted normal-case tracking-normal mb-1.5 ml-1">Leitor de Tela</label>
        <select id="a11y-el-mobile-screen-reader-variant-select"
          class="dsc-select w-full bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-line rounded-dsc-medium px-2.5 py-dsc-nano text-[12px] text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-100 transition-all">
        </select>
      </div>
      <div>
        <div class="flex items-center justify-between mb-1.5 ml-1">
          <label for="a11y-el-mobile-link-url" class="block text-dsc-label-tiny font-bold text-slate-500 dark:text-dark-muted normal-case tracking-normal">Link ou nome do componente *</label>
          <span id="a11y-el-mobile-link-url-counter" class="text-dsc-label-tiny normal-case tracking-normal text-slate-400 dark:text-dark-muted shrink-0">0/300</span>
        </div>
        <input type="text" id="a11y-el-mobile-link-url" maxlength="300" placeholder="${escapeHtml(A11Y_MOBILE_LINK_URL_PLACEHOLDER)}"
          oninput="updateA11yCharCounter(this)"
          class="w-full bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-line rounded-dsc-small px-2.5 py-dsc-nano text-[12px] text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-100 transition-all" />
        <p id="a11y-el-mobile-link-url-lock-hint" class="hidden flex items-center gap-dsc-quark mt-1 ml-1 text-dsc-label-tiny normal-case tracking-normal text-slate-400 dark:text-dark-muted">
          <i data-lucide="lock" class="w-2.5 h-2.5"></i> Preenchido automaticamente a partir do componente do DSC.
        </p>
      </div>
    `;
    list.appendChild(linkRow);
    _refreshIcons(linkRow);

    // Auto-preenchimento do link a partir do nome escolhido (ver
    // _autofillA11yMobileLinkUrlFromComponentName) — só reage a interação
    // real do usuário: atribuição direta de select.value (ex: restauração em
    // modo edição, _restoreA11yElementoMobileToggles) NÃO dispara 'change',
    // então não sobrescreve valores salvos. O listener também reavalia o
    // lock (_syncA11yMobileLinkUrlLockState) a cada troca manual do select.
    const linkSelectEl = linkRow.querySelector('#a11y-el-mobile-link-select');
    if (linkSelectEl) {
      linkSelectEl.addEventListener('change', _autofillA11yMobileLinkUrlFromComponentName);
      linkSelectEl.addEventListener('change', () => {
        // Troca de componente sempre reconstrói o dropdown "Leitor de Tela"
        // do zero (as opções pertencem a outro componente, o valor anterior
        // não faz mais sentido) — default para a PRIMEIRA sub-variante real
        // da lib (nenhum <option> marcado explicitamente "selected", o
        // <select> nativo assume o primeiro item), mesmo padrão já usado
        // pelos <select> de variante secundária do catálogo desktop
        // (_renderA11yElementoVariants: só marca "selected" quando bate
        // com um defaultValue conhecido; component sets deep-scan não têm
        // "default" declarado entre as sub-variantes de Leitor de Tela,
        // então a 1ª da lista real é o default mais conservador).
        _updateA11yMobileScreenReaderVariantOptions();
        _updateA11yMobileNomeAcessivelVisibility();
        _updateA11yMobileLabelVisibility();
        _updateA11yMobileObservacoesVisibility();
      });
    }
    const screenReaderSelectEl = linkRow.querySelector('#a11y-el-mobile-screen-reader-variant-select');
    if (screenReaderSelectEl) {
      screenReaderSelectEl.addEventListener('change', () => {
        _updateA11yMobileNomeAcessivelVisibility();
        _updateA11yMobileLabelVisibility();
        _updateA11yMobileObservacoesVisibility();
      });
    }

    // Se a pré-seleção automática encontrou match, preenche a URL de bônus
    // já nesta primeira renderização (equivalente a disparar o 'change' que
    // o designer disparia manualmente). Em modo edição isso é inofensivo: a
    // restauração de dados salvos (_restoreA11yElementoMobileToggles, ver
    // openA11yModal/editA11ySpec) roda DEPOIS, sobrescreve select/URL com os
    // valores da spec original e reaplica o lock por conta própria.
    // Constrói o dropdown "Leitor de Tela" (oculto se o componente inicial
    // não tiver sub-variantes reais) já na primeira renderização, ANTES de
    // avaliar a visibilidade de "Nome Acessível" (que agora depende da
    // combinação componente+sub-variante, ver comentário abaixo).
    _updateA11yMobileScreenReaderVariantOptions();
    if (autoMatchedOption) _autofillA11yMobileLinkUrlFromComponentName();
    else _syncA11yMobileLinkUrlLockState();
    _updateA11yMobileNomeAcessivelVisibility();
    _updateA11yMobileLabelVisibility();
    _updateA11yMobileObservacoesVisibility();
  }
}

// Reconstrói as opções do dropdown "Leitor de Tela" (#a11y-el-mobile-screen-
// reader-variant-select) a partir do componente atualmente selecionado em
// #a11y-el-mobile-link-select, usando A11Y_MOBILE_SCREEN_READER_VARIANTS
// (dado real, ver comentário na declaração). Quando o componente não tem
// sub-variantes (chave ausente no mapa — maioria dos casos, "folha
// simples"), esconde o wrap inteiro e limpa as opções — comportamento
// idêntico ao que existia antes deste dropdown existir. Quando tem, mostra o
// wrap e preenche <option> por sub-variante real; nenhuma option leva
// "selected" explícito — o <select> nativo assume a primeira da lista como
// default (mesmo padrão conservador de _renderA11yElementoVariants quando
// não há defaultValue conhecido). Chamada na renderização inicial e a cada
// 'change' de #a11y-el-mobile-link-select; _restoreA11yElementoMobileToggles
// (modo edição) roda esta função primeiro e só DEPOIS aplica o valor salvo
// (sub.leitorDeTela), pra não perder a seleção real ao reconstruir a lista.
function _updateA11yMobileScreenReaderVariantOptions() {
  const linkSelect = document.getElementById('a11y-el-mobile-link-select');
  const wrap = document.getElementById('a11y-el-mobile-screen-reader-variant-wrap');
  const select = document.getElementById('a11y-el-mobile-screen-reader-variant-select');
  if (!linkSelect || !wrap || !select) return;

  const entry = A11Y_MOBILE_SCREEN_READER_VARIANTS[linkSelect.value];
  const variants = (entry && Array.isArray(entry.variants)) ? entry.variants : [];
  wrap.classList.toggle('hidden', variants.length === 0);
  select.innerHTML = variants
    .map(v => `<option value="${escapeHtml(v.name)}">${escapeHtml(v.name)}</option>`)
    .join('');
}
window._updateA11yMobileScreenReaderVariantOptions = _updateA11yMobileScreenReaderVariantOptions;

// Resolve se o componente (+ sub-variante de Leitor de Tela, quando
// aplicável) ATUALMENTE selecionado nos dois <select> mobile tem, de fato,
// uma property real de nome acessível na lib — dado real extraído da
// instância aninhada de cada variante (A11Y_MOBILE_SCREEN_READER_VARIANTS/
// A11Y_MOBILE_COMPONENTS_WITH_NOME_ACESSIVEL, nunca lista hardcoded). Fonte
// única de verdade usada tanto pela linha informativa "Nome Acessível"
// quanto pela visibilidade do campo "Label (accessibilityLabel)" do topo do
// formulário (ver _updateA11yMobileNomeAcessivelVisibility/
// _updateA11yMobileLabelVisibility abaixo) — os dois precisam concordar
// sempre, então não duplicar a lógica de leitura do dado. Dois caminhos:
//   1. Componente TEM sub-variantes reais (chave presente em
//      A11Y_MOBILE_SCREEN_READER_VARIANTS): depende só do hasNomeAcessivel
//      da sub-variante ATUALMENTE selecionada — ignora
//      A11Y_MOBILE_COMPONENTS_WITH_NOME_ACESSIVEL nesse caso (seria menos
//      preciso, já temos o dado exato aqui). Sub-variante ainda não
//      populada (select.value vazio, ex. innerHTML acabou de ser limpo)
//      conta como "sem Nome Acessível" — nunca assume por engano antes do
//      <select> nativo assumir a primeira option.
//   2. Componente NÃO tem sub-variantes (chave ausente — "folha simples"):
//      critério único A11Y_MOBILE_COMPONENTS_WITH_NOME_ACESSIVEL.includes.
function _a11yMobileComponentHasNomeAcessivel() {
  return _a11yMobileComponentHasToggle('Nome Acessível');
}

// Generalização (2026-09-22, pedido explícito do usuário: "o plugin tem que
// refletir a mesma estrutura [do box spec], só que se modificar a depender
// da variante, do componente listado") do critério acima — mesma lógica,
// mas parametrizada pelo NOME RAW do toggle (ex. "Nome Acessível",
// "Observações"), não mais hardcoded só pra Nome Acessível. Usa o dado mais
// preciso disponível, nesta ordem:
//   1. Componente TEM sub-variantes reais em A11Y_MOBILE_SCREEN_READER_
//      VARIANTS: verifica `activeToggles` da sub-variante ATUALMENTE
//      selecionada (dado real por combinação componente+sub-variante, o
//      mais preciso que existe) — sub-variante ainda não populada conta
//      como "sem o toggle", nunca assume por engano.
//   2. Componente NÃO tem sub-variantes ("folha simples"): consulta
//      A11Y_MOBILE_COMPONENT_TOGGLES (união de toggles reais daquele
//      componente — sem ambiguidade de sub-variante nesse caso).
// _a11yMobileComponentHasNomeAcessivel (acima) é só um atalho desta função
// pro caso mais comum — mantido com o nome antigo pra não exigir alterar
// todos os pontos de consumo já espalhados neste arquivo.
function _a11yMobileComponentHasToggle(rawToggleName) {
  const select = document.getElementById('a11y-el-mobile-link-select');
  if (!select) return false;

  const srvEntry = A11Y_MOBILE_SCREEN_READER_VARIANTS[select.value];
  if (srvEntry && Array.isArray(srvEntry.variants) && srvEntry.variants.length > 0) {
    const variantSelect = document.getElementById('a11y-el-mobile-screen-reader-variant-select');
    const currentVariantName = variantSelect ? variantSelect.value : '';
    const activeVariant = srvEntry.variants.find(v => v.name === currentVariantName);
    if (!activeVariant) return false;
    // activeToggles é o dado novo (2026-09-22); hasNomeAcessivel (antigo)
    // continua existindo em paralelo só pra retrocompatibilidade — nunca
    // deveriam divergir (mesmo array de origem), mas o fallback abaixo evita
    // quebrar se algum dado gerado mais antigo (cache/skeleton desatualizado)
    // ainda não tiver activeToggles.
    //
    // Estado do dado VIGENTE (auditoria 2026-09-23): 0 de 109 sub-variantes
    // reais estão sem activeToggles — a migração está 100% completa e este
    // fallback não é exercitado hoje. Mantido mesmo assim: é proteção contra
    // dado gerado por uma versão ANTERIOR do pipeline (ex. designer com
    // ui.html antigo em cache, ou refs não regeneradas depois de um pull),
    // não uma migração pendente. Não remover por "código morto".
    if (Array.isArray(activeVariant.activeToggles)) {
      return activeVariant.activeToggles.includes(rawToggleName);
    }
    return rawToggleName === 'Nome Acessível' && !!activeVariant.hasNomeAcessivel;
  }
  // Caminho 2 — componente "folha simples" (sem sub-variantes). Só chega
  // aqui quando A11Y_MOBILE_SCREEN_READER_VARIANTS não tem entrada com
  // variants para este componente; os 15 componentes que aparecem nas DUAS
  // listas (ver comentário em build-a11y-constants.cjs) nunca alcançam
  // estas linhas, e é por isso que a sobreposição do dado gerado é
  // inofensiva.
  if (rawToggleName === 'Nome Acessível') {
    return A11Y_MOBILE_COMPONENTS_WITH_NOME_ACESSIVEL.includes(select.value);
  }
  const toggles = A11Y_MOBILE_COMPONENT_TOGGLES[select.value];
  return Array.isArray(toggles) && toggles.includes(rawToggleName);
}

// Mostra/esconde o slot "Nome Acessível" e REALOCA o input real
// (#a11y-el-label-wrap) entre o lar original — na linha da Tag, posição
// default/desktop, ver #a11y-el-label-wrap em modals.html — e o slot
// #a11y-el-mobile-nome-acessivel-slot, um segundo campo NA MESMA LINHA
// (2026-09-23, pedido do usuário: "coloque o nome acessível ao lado da tag
// e observações abaixo deles", revisão no mesmo dia de uma versão anterior
// onde o slot vivia lá embaixo, dentro de um card em "Campos exclusivos
// mobile"). Inverte a decisão original de 2026-09-17 (card puramente
// informativo, campo só no topo).
//
// appendChild MOVE o nó (nunca clona) — o mesmo <input id="a11y-el-label">
// circula entre os dois lugares, preservando o valor digitado e todos os
// listeners. Clonar criaria um segundo elemento com o mesmo id, quebrando
// todo getElementById('a11y-el-label') espalhado pelo arquivo (prefill,
// contador de caracteres, coleta ao salvar).
//
// _a11yMobileLabelWrapHomeParent/_a11yMobileLabelWrapHomeNext (module-level,
// abaixo) guardam ONDE o wrapper vivia antes de ser movido a primeira vez,
// pra devolvê-lo exatamente à mesma posição (não só "em algum lugar do
// topo") quando a condição deixa de valer.
//
// Critério de quando mover pro card: mobile E o componente selecionado tem
// a property real "Nome Acessível" (_a11yMobileComponentHasNomeAcessivel).
// Fora disso (desktop, ou mobile sem a property) o campo fica no topo —
// mesmo comportamento de sempre nesses dois casos.
//
// Chamada na renderização inicial, a cada 'change' de qualquer um dos dois
// selects, e por _restoreA11yElementoMobileToggles (modo edição) depois de
// restaurar linkComponenteNome/leitorDeTela — sempre reavalia a partir do
// valor ATUAL dos selects, nunca guarda estado próprio.
let _a11yMobileLabelWrapHomeParent = null;
let _a11yMobileLabelWrapHomeNext = null;

// Devolve o campo ao lar original e esconde o slot "Nome Acessível", SEM
// consultar os selects mobile — usada pelos branches "link"/"texto
// alternativo" de _renderA11yElementoMobileFields, que não têm
// #a11y-el-mobile-link-select nenhum (esse select só existe no branch
// "componente") e onde "Nome Acessível" nunca se aplica.
//
// Por que existe (auditoria 2026-09-23, achado de FRAGILIDADE, não de bug):
// esses dois branches faziam `list.innerHTML = ...` e retornavam sem chamar
// nenhuma das funções de visibilidade. O resultado final ficava correto por
// ACIDENTE — _restoreA11yElementoMobileToggles roda depois e chama
// _updateA11yMobileNomeAcessivelVisibility, que nesse ponto lê
// getElementById('a11y-el-mobile-link-select') === null (o select foi
// destruído pelo innerHTML acima) e resolve "sem a property", escondendo o
// slot. Ou seja: a rede de segurança era um efeito colateral de o elemento
// não existir, não uma decisão explícita. Se algum dia esses branches
// ganharem um select próprio com esse id, o vazamento (card "Nome
// Acessível" visível numa spec "link") passaria a ser real e silencioso.
// Esta chamada explícita remove a dependência desse acidente.
function _resetA11yMobileNomeAcessivelSlot() {
  const row = document.getElementById('a11y-el-mobile-nome-acessivel-row');
  const slot = document.getElementById('a11y-el-mobile-nome-acessivel-slot');
  const labelWrap = document.getElementById('a11y-el-label-wrap');
  const labelWrapHeading = document.getElementById('a11y-el-label-wrap-heading');
  if (row) row.classList.add('hidden');
  if (labelWrapHeading) labelWrapHeading.classList.remove('hidden');
  if (labelWrap && slot && labelWrap.parentNode === slot && _a11yMobileLabelWrapHomeParent) {
    _a11yMobileLabelWrapHomeParent.insertBefore(labelWrap, _a11yMobileLabelWrapHomeNext);
  }
}

function _updateA11yMobileNomeAcessivelVisibility() {
  const row = document.getElementById('a11y-el-mobile-nome-acessivel-row');
  const slot = document.getElementById('a11y-el-mobile-nome-acessivel-slot');
  const labelWrap = document.getElementById('a11y-el-label-wrap');
  const labelWrapHeading = document.getElementById('a11y-el-label-wrap-heading');
  const select = document.getElementById('a11y-el-mobile-link-select');
  if (!row || !slot || !labelWrap) return;

  const modal = document.getElementById('a11y-spec-modal');
  const isMobile = !!modal && modal.dataset.a11yOrigin === 'mobile';
  const shouldMoveToCard = isMobile && !!select && _a11yMobileComponentHasNomeAcessivel();

  row.classList.toggle('hidden', !shouldMoveToCard);
  // Esconde "Label (accessibilityLabel)" + contador SÓ quando o input está
  // dentro do card (o cabeçalho "Nome Acessível" já identifica o campo —
  // repetir os dois textos era a duplicação reportada pelo usuário). No
  // topo (desktop, ou mobile sem a property) o label interno volta.
  if (labelWrapHeading) labelWrapHeading.classList.toggle('hidden', shouldMoveToCard);

  if (shouldMoveToCard) {
    // Guarda o lar original SÓ na primeira vez que move (labelWrap.parentNode
    // ainda é o topo nesse momento) — chamadas seguintes com o wrapper já
    // dentro do slot não devem sobrescrever essa referência com o próprio
    // slot.
    if (labelWrap.parentNode !== slot) {
      _a11yMobileLabelWrapHomeParent = labelWrap.parentNode;
      _a11yMobileLabelWrapHomeNext = labelWrap.nextSibling;
    }
    slot.appendChild(labelWrap);
    // Limpa 'hidden' residual (bug real 2026-09-24, print do usuário:
    // "Button/Loading" mostrava o título "Nome Acessível" mas SEM o input
    // embaixo). Introduzido pela correção do mesmo dia que passou a
    // ESCONDER #a11y-el-label-wrap quando o componente não tem a property:
    // ao trocar de um componente sem a property (wrap fica hidden) pra um
    // COM (wrap é movido pro slot aqui), ninguém removia a classe — o slot
    // aparecia populado com um filho invisível. Antes dessa correção o
    // wrap nunca ficava hidden, então mover bastava.
    labelWrap.classList.remove('hidden');
  } else if (labelWrap.parentNode === slot && _a11yMobileLabelWrapHomeParent) {
    // Devolve pro lar original, na posição exata (antes do irmão que vinha
    // depois dele) — nextSibling null (era o último filho) cai no caso
    // insertBefore(node, null), que a spec do DOM já trata como appendChild.
    _a11yMobileLabelWrapHomeParent.insertBefore(labelWrap, _a11yMobileLabelWrapHomeNext);
  }
}

// Mostra/esconde o toggle "Observações" (variante "componente", ver render
// em _renderA11yElementoMobileFields) conforme _a11yMobileComponentHasToggle
// ('Observações') — mesmo critério/mesma fonte real de Nome Acessível acima,
// generalizado (2026-09-22, pedido explícito do usuário). Chamada nos MESMOS
// pontos de _updateA11yMobileNomeAcessivelVisibility (render inicial,
// 'change' dos dois selects, _restoreA11yElementoMobileToggles em modo
// edição) — nunca sozinha, pra não divergir de quando o bloco é
// reconstruído. Ao esconder, limpa o checkbox/textarea por padrão (não deixa
// um valor digitado "fantasma" persistir escondido e ser gravado sem o
// designer ver o campo) — mesma lógica de _onA11yElementoToggleChange ao
// desligar. `preserveValue=true` (usado só por _restoreA11yElementoMobile
// Toggles, modo edição) pula essa limpeza: uma spec ANTIGA pode ter
// Observações preenchida numa combinação componente+sub-variante que hoje
// não oferece mais o campo (ex.: componente reclassificado na lib desde que
// a spec foi criada) — esconder a UI nunca deve apagar o dado histórico já
// salvo, só parar de expor/regravar por engano (_collectA11yElementoMobile
// ToggleProperties já não lê um checkbox invisível/unchecked, então o valor
// simplesmente para de ser SALVO de novo a partir daqui, sem ser perdido
// agora).
function _updateA11yMobileObservacoesVisibility(preserveValue) {
  // Checkbox FIXO na linha da Tag (2026-09-22, ver comentário completo em
  // modals.html) — não mais um card criado dentro da lista dinâmica. O
  // textarea companheiro (#a11y-el-mobile-observacoes-textarea-wrap) também é
  // fixo; escondê-lo aqui junto com o checkbox evita que um textarea aberto
  // de uma variante anterior fique visível "solto" depois de trocar pra uma
  // variante/componente sem o toggle.
  const inlineWrap = document.getElementById('a11y-el-mobile-observacoes-inline-wrap');
  const textareaWrap = document.getElementById('a11y-el-mobile-observacoes-textarea-wrap');
  const select = document.getElementById('a11y-el-mobile-link-select');
  if (!inlineWrap || !select) return;
  const has = _a11yMobileComponentHasToggle('Observações');
  inlineWrap.classList.toggle('hidden', !has);
  const checkbox = inlineWrap.querySelector('[data-a11y-toggle-key="observacoes"]');
  if (!has) {
    if (textareaWrap) textareaWrap.classList.add('hidden');
    if (!preserveValue && checkbox && checkbox.checked) {
      checkbox.checked = false;
      const ta = textareaWrap ? textareaWrap.querySelector('[data-a11y-toggle-value]') : null;
      if (ta) ta.value = '';
    }
  }
  _syncA11yMobileObservacoesPlacement(has);
}

// Move o checkbox "Observações" pra linha da Tag quando ele é o ÚNICO campo
// daquela linha (2026-09-24, pedido do usuário: "quando tivermos só
// observações, o checkbox fica ao lado da TAG e o input das observações abre
// abaixo deles"). Quando há Nome Acessível/Label ocupando o espaço ao lado
// da Tag, Observações volta pro lar original (linha própria, abaixo) —
// senão os dois disputariam a mesma linha e o layout truncaria, que foi
// exatamente o problema já reportado em 2026-09-22/23.
//
// appendChild MOVE o nó (nunca clona) — o checkbox é sempre o mesmo
// elemento, com o mesmo data-a11y-toggle-key que
// _onA11yElementoToggleChange/_collectA11yElementoMobileToggleProperties já
// resolvem independente de onde ele esteja no DOM (o textarea companheiro
// continua fixo, abaixo da linha, e abre pelo mesmo onchange — "o input das
// observações abre abaixo deles" é o comportamento que já existia).
let _a11yObservacoesWrapHomeParent = null;
let _a11yObservacoesWrapHomeNext = null;

function _syncA11yMobileObservacoesPlacement(hasObservacoes) {
  const inlineWrap = document.getElementById('a11y-el-mobile-observacoes-inline-wrap');
  const inlineSlot = document.getElementById('a11y-el-mobile-observacoes-inline-slot');
  const labelWrap = document.getElementById('a11y-el-label-wrap');
  const nomeAcessivelRow = document.getElementById('a11y-el-mobile-nome-acessivel-row');
  if (!inlineWrap || !inlineSlot) return;

  // "Linha da Tag está livre" = o campo de texto acessível não está
  // ocupando espaço nela, em nenhuma das suas 2 formas possíveis:
  //   a) Label genérico, fisicamente na própria linha e sem 'hidden';
  //   b) slot "Nome Acessível" visível (que é onde o MESMO campo vai parar
  //      quando o componente tem a property — ver
  //      _updateA11yMobileNomeAcessivelVisibility).
  const nomeAcessivelSlot = document.getElementById('a11y-el-mobile-nome-acessivel-slot');
  const labelNaLinhaDaTag = !!labelWrap
    && labelWrap.parentNode !== nomeAcessivelSlot
    && !labelWrap.classList.contains('hidden');
  const nomeAcessivelVisivel = !!nomeAcessivelRow && !nomeAcessivelRow.classList.contains('hidden');
  const tagRowLivre = !labelNaLinhaDaTag && !nomeAcessivelVisivel;
  const moverParaLinhaDaTag = hasObservacoes && tagRowLivre;

  inlineSlot.classList.toggle('hidden', !moverParaLinhaDaTag);

  if (moverParaLinhaDaTag) {
    if (inlineWrap.parentNode !== inlineSlot) {
      _a11yObservacoesWrapHomeParent = inlineWrap.parentNode;
      _a11yObservacoesWrapHomeNext = inlineWrap.nextSibling;
    }
    inlineSlot.appendChild(inlineWrap);
  } else if (inlineWrap.parentNode === inlineSlot && _a11yObservacoesWrapHomeParent) {
    _a11yObservacoesWrapHomeParent.insertBefore(inlineWrap, _a11yObservacoesWrapHomeNext);
  }
}

// Mostra/esconde o campo "Label (accessibilityLabel)" do topo do formulário
// (#a11y-el-label-wrap) em specs MOBILE, conforme
// _a11yMobileComponentHasNomeAcessivel() — bug real reportado 2026-09-22:
// o campo era estrutural/sempre visível (sobrevivência de quando existia um
// toggle "Nome Acessível" próprio, removido em 2026-09 na consolidação "fonte
// única"), então aceitava texto mesmo para componentes sem a property real
// (ex: "[dsc] Value Section", que só tem "Leitor de Tela"/"Observações" —
// confirmado via REST API, fileKey HhriLSpKnCB2dHhyiU16iB, node 10206:2177,
// perVariantProperties de "Value Section": nenhuma sub-variante de Leitor de
// Tela tem toggle de nome acessível entre os activeToggles). Em specs WEB
// este campo permanece sempre visível — não existe hoje dado real
// equivalente (por componente do catálogo desktop) pra decidir isso com a
// mesma precisão, e o critério documentado aqui é estritamente mobile (ver
// chamada condicionada a modal.dataset.a11yOrigin === 'mobile' nos pontos
// abaixo). Chamada nos MESMOS pontos de _updateA11yMobileNomeAcessivelVisibility
// (render inicial, 'change' dos dois selects, _restoreA11yElementoMobileToggles
// em modo edição).
//
// Bug real corrigido (2026-09-22, print do usuário: "essa proposta ficou
// péssima! O espaço truncado, o checkbox sem um card"): a versão anterior
// fazia #a11y-el-tag-wrap perder "w-11 shrink-0" e virar "w-full" quando o
// Label sumia, esticando o campo Tag (só "1"/"A1", conceitualmente pequeno)
// até a largura inteira do modal — e o checkbox de Observações, que
// continua na mesma linha flex com shrink-0, quebrava pra linha de baixo
// sem nenhum agrupamento visual que explicasse por que estava ali. Tag
// agora SEMPRE mantém "w-11 shrink-0" no HTML (ver modals.html), visível ou
// não o Label — o espaço vago da linha é absorvido pelo flex-wrap do
// container pai, sem esticar nenhum campo além do seu tamanho real.
//
// _syncA11yObservacoesFlexWithLabel REMOVIDA em 2026-09-23 (revisão no
// mesmo dia): existia pra fazer Observações crescer (flex-1) quando o Label
// saía da linha da Tag, ocupando o vão vazio. Descartada porque o próprio
// card de Observações passou a ter largura compacta fixa e conteúdo visível
// (checkbox + texto "Observações" lado a lado, mesmo padrão da Tag) — não
// existe mais "vão vazio" a preencher, ver comentário completo no HTML.
//
// Bug real corrigido (2026-09-24, print do usuário — painel real do
// componente "[hac mob] Box spec..." no Figma para "Value Section": só
// expõe Variante/Componente/Leitor de Tela/Observações, NENHUM campo de
// texto acessível em nenhuma das 4 sub-variantes reais, confirmado contra
// A11Y_MOBILE_SCREEN_READER_VARIANTS — "a fonte é o componente da lib, não
// é o plugin. O plugin tem que apresentar exatamente o que tem na lib"):
// o comentário anterior desta função dizia "o campo nunca deveria sumir de
// vez, só ser reposicionado" — PREMISSA ERRADA. Existe um terceiro estado,
// além de "no topo" (desktop/mobile-com-Label-genérico) e "dentro do slot"
// (mobile-com-Nome-Acessível): mobile SEM property alguma de texto
// acessível, onde o campo inteiro não deveria existir na tela — a lib não
// declara Nome Acessível NEM um Label genérico equivalente para esses
// componentes/sub-variantes.
//
// Esconde #a11y-el-label-wrap (E a linha inteira #a11y-el-mobile-nome-
// acessivel-row, que compartilha a mesma linha flex) quando mobile e o
// componente não tem a property em NENHUMA forma. Limpa o valor digitado
// ao esconder (mesmo padrão de _updateA11yMobileObservacoesVisibility) —
// preserveValue=true (usado só por _restoreA11yElementoMobileToggles, modo
// edição) pula a limpeza: uma spec ANTIGA pode ter 'label' preenchido numa
// combinação componente+sub-variante que hoje não oferece mais o campo,
// e esconder a UI nunca deve apagar dado histórico já salvo.
// EXTENSÃO 2026-09-24 (pedido do usuário: "não é pra ter no mobile e nem no
// web"): a mesma regra sem fallback passou a valer pro DESKTOP também — até
// aqui o Label desktop era tratado como "anotação sempre válida do
// designer", existindo mesmo sem o BOOLEAN "nome acessível"/variações real
// no componente selecionado (só o RÓTULO "Nome Acessível" no payload salvo
// era condicional, ver _buildA11yElementoPayload). Decisão confirmada:
// campo inteiro segue o mesmo padrão do mobile — sem a property real, sem
// campo na tela. Fonte: _getA11yComponentToggles(selectValue), MESMA função
// já usada por _renderA11yElementoToggles (lista de toggles reais) e pelo
// payload de salvamento — nenhuma lógica nova, só aplicada também aqui.
function _a11yDesktopComponentHasNomeAcessivel(selectValue) {
  if (!selectValue) return false;
  const info = _getA11yComponentToggles(selectValue);
  return !!(info && info.toggles && info.toggles.some(t => t.key === 'nomeAcessivel'));
}

function _updateA11yMobileLabelVisibility(preserveValue) {
  const labelWrap = document.getElementById('a11y-el-label-wrap');
  const slot = document.getElementById('a11y-el-mobile-nome-acessivel-slot');
  const labelInput = document.getElementById('a11y-el-label');
  if (!labelWrap) return;

  const modal = document.getElementById('a11y-spec-modal');
  const isMobile = !!modal && modal.dataset.a11yOrigin === 'mobile';

  // SEM FALLBACK, nos dois ramos (2026-09-24, pedido explícito do usuário:
  // "não é pra ter fallback de nada. Fallback aqui é invenção" — extensão
  // "não é pra ter no mobile e nem no web"). A lib é a única fonte: o campo
  // de texto acessível aparece SE E SOMENTE SE o dado real confirmar a
  // property "Nome Acessível" pra este componente (desktop) ou esta
  // combinação componente+sub-variante (mobile). Não existe estado "não
  // sei, deixa visível" — ausência de dado é ausência de campo.
  //
  // Histórico das tentativas anteriores no ramo MOBILE, ambas com fallback,
  // ambas erradas (cada uma reintroduziu o campo fantasma num conjunto
  // diferente de componentes):
  //   1ª: `hasNomeAcessivel || !hasSubVariants` — tratava componente folha
  //       como "sem dado", deixando visível em 26 componentes que declaram
  //       só ["Observações"] (Alert Dialog, Card, Menu, Tooltip, Imagem...).
  //   2ª: `hasNomeAcessivel || !hasAnyRealData` — reduziu pra 1 caso
  //       ("Loading Animation", sem toggles no scan), mas ainda inventava
  //       um campo que a lib não declara.
  let hasNomeAcessivel;
  if (isMobile) {
    const select = document.getElementById('a11y-el-mobile-link-select');
    // Select mobile ainda não montado no DOM (early na renderização) — não
    // decide nada aqui, a próxima chamada (já com o select presente)
    // resolve de verdade. Diferente de "sem dado real": é só timing.
    if (!select) { labelWrap.classList.remove('hidden'); return; }
    // O wrap está DENTRO do slot "Nome Acessível" agora — quem decide a
    // visibilidade desse caminho é _updateA11yMobileNomeAcessivelVisibility
    // (o slot inteiro fica hidden/visible junto do card). Não mexer aqui.
    if (slot && labelWrap.parentNode === slot) return;
    hasNomeAcessivel = _a11yMobileComponentHasNomeAcessivel();
  } else {
    const desktopSelect = document.getElementById('a11y-el-componente-select');
    const isImagem = _getA11yElementoVariante() === 'imagem';
    const isOutro = !isImagem && desktopSelect && desktopSelect.value === 'outro';
    // "Outro (fora do catálogo)" não tem entrada em A11Y_COMPONENT_PROPERTIES
    // (é, por definição, um componente não catalogado) — não há dado real
    // pra confirmar OU negar a property, e nesse caso específico o campo
    // continua a anotação livre de sempre (não é "sem property", é "sem
    // catálogo pra consultar").
    if (isOutro) { labelWrap.classList.remove('hidden'); return; }
    const shortNameKey = isImagem ? 'imagem' : (desktopSelect ? desktopSelect.value : null);
    hasNomeAcessivel = _a11yDesktopComponentHasNomeAcessivel(shortNameKey);
  }

  labelWrap.classList.toggle('hidden', !hasNomeAcessivel);

  if (!hasNomeAcessivel) {
    if (!preserveValue && labelInput && labelInput.value) {
      labelInput.value = '';
      if (typeof updateA11yCharCounter === 'function') updateA11yCharCounter(labelInput);
    }
  }
}
window._updateA11yMobileNomeAcessivelVisibility = _updateA11yMobileNomeAcessivelVisibility;
window._updateA11yMobileLabelVisibility = _updateA11yMobileLabelVisibility;
window._updateA11yMobileObservacoesVisibility = _updateA11yMobileObservacoesVisibility;

// Lê os toggles mobile ligados com texto preenchido de volta em
// properties[], mais o campo de Descrição livre (variante "texto
// alternativo") e o Link do Componente (variante "componente", sempre
// visível) — chamado por confirmA11ySpec. `linkComponente` só entra quando o
// campo de URL está preenchido (obrigatório na variante "componente"); o
// `select` de nome do componente vai junto como `linkComponenteNome`, mesmo
// no default "Personalizado".
function _collectA11yElementoMobileToggleProperties() {
  const list = document.getElementById('a11y-el-mobile-toggles-list');
  if (!list) return [];
  const result = [];
  const _collectFrom = (checkbox) => {
    if (!checkbox.checked) return;
    // "observacoes" (2026-09-22): checkbox fixo na linha da Tag, textarea
    // companheiro fixo logo abaixo — não são mais irmãos dentro do mesmo
    // `div` (ver comentário completo em _updateA11yMobileObservacoesVisibility/
    // modals.html), então closest('div')+querySelector nunca encontra o wrap
    // certo pra esse caso específico. Demais toggles continuam no padrão
    // antigo (checkbox e textarea irmãos dentro do mesmo card).
    const key = checkbox.getAttribute('data-a11y-toggle-key');
    const wrap = key === 'observacoes'
      ? document.getElementById('a11y-el-mobile-observacoes-textarea-wrap')
      : (checkbox.closest('div') ? checkbox.closest('div').querySelector('[data-a11y-toggle-textarea-wrap]') : null);
    const ta = wrap ? wrap.querySelector('[data-a11y-toggle-value]') : null;
    const value = ta ? ta.value.trim() : '';
    if (!value) return;
    result.push({ key, label: A11Y_TOGGLE_LABELS[key] || key, value });
  };
  list.querySelectorAll('[data-a11y-toggle-key]').forEach(_collectFrom);
  const observacoesInlineCheckbox = document.querySelector('#a11y-el-mobile-observacoes-inline-wrap [data-a11y-toggle-key="observacoes"]');
  if (observacoesInlineCheckbox) _collectFrom(observacoesInlineCheckbox);

  const altDescricao = document.getElementById('a11y-el-mobile-alt-descricao');
  if (altDescricao && altDescricao.value.trim()) {
    result.push({ key: 'descricao', label: 'Descrição', value: altDescricao.value.trim() });
  }

  const linkSelect = document.getElementById('a11y-el-mobile-link-select');
  const linkUrl = document.getElementById('a11y-el-mobile-link-url');
  if (linkUrl && linkUrl.value.trim()) {
    if (linkSelect) result.push({ key: 'linkComponenteNome', label: 'Componente do DSC (Link)', value: linkSelect.value });
    result.push({ key: 'linkComponente', label: A11Y_TOGGLE_LABELS.linkComponente, value: linkUrl.value.trim() });
  }

  // "Leitor de Tela" (sub-variante, decisão de produto 2026-09-17) — só
  // coletado quando o wrap está visível (componente selecionado tem
  // sub-variantes reais em A11Y_MOBILE_SCREEN_READER_VARIANTS, ver
  // _updateA11yMobileScreenReaderVariantOptions). Mesmo padrão de
  // linkComponenteNome acima: persistido em properties[] (aparece na spec
  // renderizada) pra registrar QUAL sub-variante foi documentada.
  const screenReaderWrap = document.getElementById('a11y-el-mobile-screen-reader-variant-wrap');
  const screenReaderSelect = document.getElementById('a11y-el-mobile-screen-reader-variant-select');
  if (screenReaderWrap && !screenReaderWrap.classList.contains('hidden') && screenReaderSelect && screenReaderSelect.value) {
    result.push({ key: 'leitorDeTela', label: 'Leitor de Tela', value: screenReaderSelect.value });
  }

  return result;
}

// Inverso de _collectA11yElementoMobileToggleProperties — usado em
// _prefillA11ySpecForEdit. Precisa que _renderA11yElementoMobileFields já
// tenha rodado (o formulário de edição já é aberto com dataset.a11yOrigin
// setado, ver editA11ySpec) pra achar os campos na DOM. Chamada DEPOIS de
// `setVal('a11y-el-label', getProp('label'))` (ver _prefillA11ySpecForEdit)
// — ordem relevante pro fallback de 'nomeAcessivel' abaixo.
function _restoreA11yElementoMobileToggles(props) {
  const list = document.getElementById('a11y-el-mobile-toggles-list');
  if (!list) return;
  const mobileToggleKeys = new Set(A11Y_MOBILE_ONLY_TOGGLES.map(t => t.key).concat(['observacoes']));
  // "Leitor de Tela" (sub-variante) precisa ser aplicado DEPOIS que
  // linkComponenteNome já restaurou o componente e o dropdown novo já foi
  // reconstruído com as opções REAIS daquele componente (ver
  // _updateA11yMobileScreenReaderVariantOptions) — não dá pra confiar na
  // ordem em que 'linkComponenteNome'/'leitorDeTela' aparecem dentro de
  // props (array reflete a ordem de coleta no momento em que a spec foi
  // salva, não uma ordem garantida). Guarda o valor bruto aqui e só atribui
  // ao <select> no fim da função, já com as options certas no lugar. Specs
  // ANTIGAS (criadas antes deste campo existir) simplesmente não têm essa
  // key em props — leitorDeTelaValue fica null, _updateA11yMobileScreenReader
  // VariantOptions já terá marcado a 1ª option como default (fallback
  // gracioso, sem erro).
  let leitorDeTelaValue = null;
  (props || []).forEach(p => {
    if (!p) return;
    if (p.key === 'leitorDeTela') { leitorDeTelaValue = p.value || null; return; }
    // Migração: specs mobile ANTIGAS podiam ter properties['nomeAcessivel']
    // preenchido pelo toggle "Nome Acessível" removido em 2026-09 (duplicava
    // o campo "Label (accessibilityLabel)" sempre visível no topo do
    // formulário). Ao reabrir pra edição, o valor volta a aparecer — agora
    // no campo Label do topo — sem perder dado. Só entra se o Label ainda
    // estiver vazio (não sobrescreve um valor de Label já salvo na mesma
    // spec — cenário legado em que os dois campos coexistiam preenchidos).
    if (p.key === 'nomeAcessivel') {
      const labelInput = document.getElementById('a11y-el-label');
      if (labelInput && !labelInput.value.trim()) { labelInput.value = p.value || ''; updateA11yCharCounter(labelInput); }
      return;
    }
    if (mobileToggleKeys.has(p.key)) {
      // "observacoes" (2026-09-22): checkbox e textarea foram movidos pra
      // fora de #a11y-el-mobile-toggles-list (ver comentário completo em
      // _updateA11yMobileObservacoesVisibility) — busca no par fixo em vez
      // de dentro da lista, que não os contém mais. Os demais
      // A11Y_MOBILE_ONLY_TOGGLES continuam dentro da lista, sem mudança.
      const checkbox = p.key === 'observacoes'
        ? document.querySelector('#a11y-el-mobile-observacoes-inline-wrap [data-a11y-toggle-key="observacoes"]')
        : list.querySelector(`[data-a11y-toggle-key="${p.key}"]`);
      if (!checkbox) return;
      checkbox.checked = true;
      const wrap = p.key === 'observacoes'
        ? document.getElementById('a11y-el-mobile-observacoes-textarea-wrap')
        : (checkbox.closest('div') ? checkbox.closest('div').querySelector('[data-a11y-toggle-textarea-wrap]') : null);
      if (wrap) {
        wrap.classList.remove('hidden');
        const ta = wrap.querySelector('[data-a11y-toggle-value]');
        if (ta) { ta.value = p.value || ''; updateA11yCharCounterEl(ta, ta.nextElementSibling); }
      }
      return;
    }
    if (p.key === 'descricao') {
      const altDescricao = document.getElementById('a11y-el-mobile-alt-descricao');
      if (altDescricao) { altDescricao.value = p.value || ''; updateA11yCharCounter(altDescricao); }
      return;
    }
    if (p.key === 'linkComponente') {
      const linkUrl = document.getElementById('a11y-el-mobile-link-url');
      if (linkUrl) { linkUrl.value = p.value || ''; updateA11yCharCounter(linkUrl); }
      return;
    }
    if (p.key === 'linkComponenteNome') {
      const linkSelect = document.getElementById('a11y-el-mobile-link-select');
      if (linkSelect) linkSelect.value = p.value || 'Personalizado';
    }
  });
  // Reconstrói o dropdown "Leitor de Tela" com as opções do componente já
  // restaurado (linkComponenteNome acima) e SÓ ENTÃO aplica o valor salvo —
  // se leitorDeTelaValue for null (spec antiga sem o campo, ou componente
  // sem sub-variantes) o <select> nativo mantém a 1ª option como default,
  // sem lançar erro (fallback gracioso, dado histórico preservado).
  _updateA11yMobileScreenReaderVariantOptions();
  if (leitorDeTelaValue) {
    const screenReaderSelect = document.getElementById('a11y-el-mobile-screen-reader-variant-select');
    if (screenReaderSelect) screenReaderSelect.value = leitorDeTelaValue;
  }
  // Atribuição direta de .value acima não dispara 'change' — reaplica o
  // lock aqui pra refletir o estado final restaurado (select.value pode ter
  // sido setado antes ou depois de linkUrl.value neste forEach, dependendo
  // da ordem em que a spec salvou 'linkComponenteNome'/'linkComponente').
  _syncA11yMobileLinkUrlLockState();
  _updateA11yMobileNomeAcessivelVisibility();
  // preserveValue=true nos dois: nunca apagar Label/Observações de uma spec
  // ANTIGA já salva, mesmo que a combinação componente+sub-variante
  // restaurada não ofereça mais o campo hoje (ver comentário completo na
  // declaração de cada função).
  _updateA11yMobileLabelVisibility(true);
  _updateA11yMobileObservacoesVisibility(true);
}

// Menu customizado do "Componente" — o <select> nativo escondido continua
// sendo a fonte de valor (updateA11yElementoFields/confirmA11ySpec leem
// .value dele), esse popover é só a camada visual, pra garantir que abre
// sempre pra baixo (um <select> nativo decide sozinho, sem controle via CSS,
// e dentro da modal abria pra cima por falta de espaço).
let _a11yComponenteMenuCloseHandlers = null;

function toggleA11yComponenteMenu(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('a11y-el-componente-menu');
  const trigger = document.getElementById('a11y-el-componente-trigger');
  if (!menu) return;
  const isOpen = !menu.classList.contains('hidden');
  if (isOpen) { closeA11yComponenteMenu(); return; }
  menu.classList.remove('hidden');
  if (trigger) trigger.setAttribute('aria-expanded', 'true');
  const close = (ev) => {
    const wrap = trigger ? trigger.parentElement : null;
    if (!wrap || !wrap.contains(ev.target)) closeA11yComponenteMenu();
  };
  const onEsc = (ev) => { if (ev.key === 'Escape') closeA11yComponenteMenu(); };
  _a11yComponenteMenuCloseHandlers = { close, onEsc };
  setTimeout(() => {
    document.addEventListener('click', close, true);
    document.addEventListener('keydown', onEsc, true);
  }, 0);
}
window.toggleA11yComponenteMenu = toggleA11yComponenteMenu;

function closeA11yComponenteMenu() {
  const menu = document.getElementById('a11y-el-componente-menu');
  const trigger = document.getElementById('a11y-el-componente-trigger');
  if (menu) menu.classList.add('hidden');
  if (trigger) trigger.setAttribute('aria-expanded', 'false');
  if (_a11yComponenteMenuCloseHandlers) {
    document.removeEventListener('click', _a11yComponenteMenuCloseHandlers.close, true);
    document.removeEventListener('keydown', _a11yComponenteMenuCloseHandlers.onEsc, true);
    _a11yComponenteMenuCloseHandlers = null;
  }
}
window.closeA11yComponenteMenu = closeA11yComponenteMenu;

// Dropdown "Mais ações" do header secundário (specifications.html) —
// mesmo padrão de toggle/fechar-ao-clicar-fora/Escape de
// toggleA11yComponenteMenu acima. Reúne onboarding/guia de categorias/
// recolher-expandir, que saíram do header direto pra dar espaço ao título
// dinâmico ("Documentando projeto Web/Mobile").
let _a11yMoreActionsMenuCloseHandlers = null;

function toggleA11yMoreActionsMenu(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('a11y-more-actions-menu');
  const trigger = document.getElementById('btn-a11y-more-actions');
  if (!menu) return;
  const isOpen = !menu.classList.contains('hidden');
  if (isOpen) { closeA11yMoreActionsMenu(); return; }
  menu.classList.remove('hidden');
  if (trigger) trigger.setAttribute('aria-expanded', 'true');
  const close = (ev) => {
    const wrap = trigger ? trigger.parentElement : null;
    if (!wrap || !wrap.contains(ev.target)) closeA11yMoreActionsMenu();
  };
  const onEsc = (ev) => { if (ev.key === 'Escape') closeA11yMoreActionsMenu(); };
  _a11yMoreActionsMenuCloseHandlers = { close, onEsc };
  setTimeout(() => {
    document.addEventListener('click', close, true);
    document.addEventListener('keydown', onEsc, true);
  }, 0);
}
window.toggleA11yMoreActionsMenu = toggleA11yMoreActionsMenu;

function closeA11yMoreActionsMenu() {
  const menu = document.getElementById('a11y-more-actions-menu');
  const trigger = document.getElementById('btn-a11y-more-actions');
  if (menu) menu.classList.add('hidden');
  if (trigger) trigger.setAttribute('aria-expanded', 'false');
  if (_a11yMoreActionsMenuCloseHandlers) {
    document.removeEventListener('click', _a11yMoreActionsMenuCloseHandlers.close, true);
    document.removeEventListener('keydown', _a11yMoreActionsMenuCloseHandlers.onEsc, true);
    _a11yMoreActionsMenuCloseHandlers = null;
  }
}
window.closeA11yMoreActionsMenu = closeA11yMoreActionsMenu;

// ── Workspace de uma Área Marcada (2026-09-04) ──────────────────────────
// Primeira sub-navegação real do hac — até aqui só existiam 2 views
// top-level (view-home/view-specifications), trocadas via
// classList.toggle('active') dentro de navigate() (core.js). Cada Área
// Marcada deixou de ser um accordion que expande in-line na lista principal
// (ver _a11yAreaAccordionEl mais abaixo, agora um card clicável) e passou a
// abrir uma "view" própria (view-area-workspace, specifications.html) com 4
// tabs: Tabulação → Swipe → Leitor de Tela → Handoff. Leitor de Tela é a
// aba de TRABALHO (criar/editar specs); Handoff é o dashboard de
// consolidação (status agregado + "Gerar handoff", ver seção 8b em
// docs/architecture-state.md). Não existe mais aba "Resumo do handoff".
//
// navigate() não aceita parâmetro extra, então o contexto (qual área, qual
// tab inicial, qual spec focar) viaja fora do DOM em variáveis globais,
// lidas uma única vez ao montar a view e limpas depois de consumidas —
// mesmo princípio já usado por window._a11yExpandedAreaIds etc., só que
// aqui representando "qual área estou olhando agora", não um conjunto de
// estados persistentes.
window._a11yWorkspaceAreaId = null;
window._a11yWorkspaceActiveTab = 'tabulacao';
window._a11yWorkspaceInitialTab = null;
window._a11yWorkspaceFocusSpecId = null;

// Chamada pelo clique no CORPO do card de uma Área (_a11yAreaAccordionEl) ou
// pelo atalho "Nova spec" (que passa opts.initialTab = 'leitor', a aba de
// trabalho). opts também aceita focusSpecId, usado pelo botão "Editar" do
// dashboard da tab Handoff quando ele precisa abrir a workspace de uma área
// que ainda não estava aberta (hoje sempre já está, mas a opção existe pela
// simetria com switchA11yWorkspaceTab).
function openA11yAreaWorkspace(areaId, opts) {
  if (!areaId) return;
  const o = opts || {};
  window._a11yWorkspaceAreaId = areaId;
  window._a11yWorkspaceActiveTab = o.initialTab || 'tabulacao';
  window._a11yWorkspaceInitialTab = o.initialTab || null;
  window._a11yWorkspaceFocusSpecId = o.focusSpecId || null;
  navigate('view-area-workspace');
}
window.openA11yAreaWorkspace = openA11yAreaWorkspace;

// "Voltar" no header da workspace — nunca leva pra Home, sempre pra
// listagem principal de especificações.
function navigateBackToA11yList() {
  window._a11yWorkspaceAreaId = null;
  window._a11yWorkspaceActiveTab = 'tabulacao';
  window._a11yWorkspaceInitialTab = null;
  window._a11yWorkspaceFocusSpecId = null;
  navigate('view-specifications');
}
window.navigateBackToA11yList = navigateBackToA11yList;

// Preenche o título dinâmico do header (número + label da área) e sincroniza
// o item "Ocultar/Mostrar" do dropdown "Mais ações" com o estado real de
// visibilidade (window._a11yAreaHiddenIds, mesmo Set que o card na listagem
// já usa). Chamada ao entrar na view (navigate(), core.js) e de novo depois
// de qualquer ação que possa mudar esses dados (toggle de visibilidade).
function _renderA11yWorkspaceHeader() {
  const areaId = window._a11yWorkspaceAreaId;
  const area = (a11yAreas || []).find(a => a && a.id === areaId);
  const titleEl = document.getElementById('a11y-workspace-title');
  if (titleEl) {
    titleEl.textContent = area ? `${area.number ? area.number + ' · ' : ''}${area.label || 'Tela'}` : 'Tela';
  }

  // Tab "Swipe" some inteira do tab-switcher em projetos web (2026-09-04-r,
  // pedido do usuário — antes ela ficava visível com um aviso "Disponível
  // apenas para projetos mobile" ao clicar; agora nem aparece na barra).
  // grid-cols muda de 4 pra 3 quando ela some, pra não sobrar coluna vazia.
  const swipeTabBtn = document.querySelector('[data-a11y-workspace-tab="swipe"]');
  const tabsGrid = document.getElementById('a11y-workspace-tabs');
  const isMobile = isA11yMobileProject();
  if (swipeTabBtn) swipeTabBtn.classList.toggle('hidden', !isMobile);
  if (tabsGrid) {
    tabsGrid.classList.toggle('grid-cols-4', isMobile);
    tabsGrid.classList.toggle('grid-cols-3', !isMobile);
  }
  // Se a tab ativa era "swipe" e o projeto não é mobile (ex.: origem
  // definida DEPOIS de já ter navegado pra essa tab, caso raro mas
  // possível), volta pra "tabulacao" — nunca deixa a tab de conteúdo
  // ativa apontando pra uma aba que sumiu da barra.
  if (!isMobile && window._a11yWorkspaceActiveTab === 'swipe') {
    window._a11yWorkspaceActiveTab = 'tabulacao';
  }

  const toggleBtn = document.getElementById('btn-a11y-workspace-toggle-visibility');
  if (toggleBtn) {
    const hidden = areaId ? window._a11yAreaHiddenIds.has(areaId) : false;
    const icon = toggleBtn.querySelector('[data-lucide]');
    if (icon) icon.setAttribute('data-lucide', hidden ? 'eye' : 'eye-off');
    // Texto some depois do <i> no HTML fixo do dropdown (ver
    // specifications.html) — troca o nó de texto sem depender de um span
    // dedicado, pra não precisar editar aquele HTML (já validado/fechado).
    const textNode = Array.from(toggleBtn.childNodes).find(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
    if (textNode) textNode.textContent = hidden ? ' Mostrar no canvas' : ' Ocultar/Mostrar no canvas';
    _refreshIcons();
  }
}
window._renderA11yWorkspaceHeader = _renderA11yWorkspaceHeader;

// Dropdown "Mais ações" da workspace — mesmo padrão exato de
// toggleA11yComponenteMenu/toggleA11yMoreActionsMenu acima (toggle + fechar
// ao clicar fora/Escape).
let _a11yWorkspaceMoreActionsMenuCloseHandlers = null;

function toggleA11yWorkspaceMoreActionsMenu(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('a11y-workspace-more-actions-menu');
  const trigger = document.getElementById('btn-a11y-workspace-more-actions');
  if (!menu) return;
  const isOpen = !menu.classList.contains('hidden');
  if (isOpen) { closeA11yWorkspaceMoreActionsMenu(); return; }
  menu.classList.remove('hidden');
  if (trigger) trigger.setAttribute('aria-expanded', 'true');
  const close = (ev) => {
    const wrap = trigger ? trigger.parentElement : null;
    if (!wrap || !wrap.contains(ev.target)) closeA11yWorkspaceMoreActionsMenu();
  };
  const onEsc = (ev) => { if (ev.key === 'Escape') closeA11yWorkspaceMoreActionsMenu(); };
  _a11yWorkspaceMoreActionsMenuCloseHandlers = { close, onEsc };
  setTimeout(() => {
    document.addEventListener('click', close, true);
    document.addEventListener('keydown', onEsc, true);
  }, 0);
}
window.toggleA11yWorkspaceMoreActionsMenu = toggleA11yWorkspaceMoreActionsMenu;

function closeA11yWorkspaceMoreActionsMenu() {
  const menu = document.getElementById('a11y-workspace-more-actions-menu');
  const trigger = document.getElementById('btn-a11y-workspace-more-actions');
  if (menu) menu.classList.add('hidden');
  if (trigger) trigger.setAttribute('aria-expanded', 'false');
  if (_a11yWorkspaceMoreActionsMenuCloseHandlers) {
    document.removeEventListener('click', _a11yWorkspaceMoreActionsMenuCloseHandlers.close, true);
    document.removeEventListener('keydown', _a11yWorkspaceMoreActionsMenuCloseHandlers.onEsc, true);
    _a11yWorkspaceMoreActionsMenuCloseHandlers = null;
  }
}
window.closeA11yWorkspaceMoreActionsMenu = closeA11yWorkspaceMoreActionsMenu;

// "Remover área" no dropdown "Mais ações" — reaproveita a exclusão em
// cascata já existente (deleteA11yArea) e volta pra listagem principal (a
// área que a workspace estava mostrando deixou de existir).
function _deleteA11yAreaFromWorkspace() {
  const areaId = window._a11yWorkspaceAreaId;
  const area = (a11yAreas || []).find(a => a && a.id === areaId);
  if (!area) { navigateBackToA11yList(); return; }
  deleteA11yArea(area.id);
  navigateBackToA11yList();
}
window._deleteA11yAreaFromWorkspace = _deleteA11yAreaFromWorkspace;

// Aplica o estilo visual "ativa"/"inativa" nos botões do tab-switcher —
// extraída como função própria (2026-09-04-d) porque precisa ser chamada
// de 2 pontos: switchA11yWorkspaceTab (troca manual de tab) e navigate()
// (core.js, ao abrir a workspace pela 1ª vez, quando o dispatcher já
// renderiza a tab default sem passar por switchA11yWorkspaceTab).
function _applyA11yWorkspaceTabStyles(activeTab) {
  document.querySelectorAll('.a11y-workspace-tab-btn').forEach(btn => {
    const isActive = btn.getAttribute('data-a11y-workspace-tab') === activeTab;
    btn.classList.toggle('text-blue-700', isActive);
    btn.classList.toggle('dark:text-blue-400', isActive);
    btn.classList.toggle('border-blue-600', isActive);
    btn.classList.toggle('text-slate-400', !isActive);
    btn.classList.toggle('dark:text-dark-muted', !isActive);
    btn.classList.toggle('border-transparent', !isActive);
  });
}
window._applyA11yWorkspaceTabStyles = _applyA11yWorkspaceTabStyles;

// Tab-switcher — primeira vez no hac que existe uma barra de tabs interna a
// uma view. Atualiza window._a11yWorkspaceActiveTab, o estilo visual dos 4
// botões (ativa: cor de destaque cyan (texto + ícone + sublinhado);
// inativa: cinza neutro + borda transparente — seção própria de fundo
// branco, separada da barra azul do header desde 2026-09-04-d) e chama o
// dispatcher, que re-renderiza só o painel de conteúdo abaixo — a barra de
// tabs em si nunca é reconstruída.
function switchA11yWorkspaceTab(tabKey, opts) {
  window._a11yWorkspaceActiveTab = tabKey || 'tabulacao';
  if (opts && opts.focusSpecId) window._a11yWorkspaceFocusSpecId = opts.focusSpecId;
  _applyA11yWorkspaceTabStyles(window._a11yWorkspaceActiveTab);
  _renderA11yWorkspaceTab();
}
window.switchA11yWorkspaceTab = switchA11yWorkspaceTab;

// Dispatcher — lê o areaId/tab ativos das variáveis globais, busca a área e
// suas specs, e chama a função de render da tab ativa, injetando o HTML
// resultante em #a11y-workspace-tab-content. Só a tab ativa é montada no
// DOM por vez (nunca as 4 simultaneamente).
function _renderA11yWorkspaceTab() {
  const container = document.getElementById('a11y-workspace-tab-content');
  if (!container) return;
  const areaId = window._a11yWorkspaceAreaId;
  const area = (a11yAreas || [])
    .map((a, i) => (a ? Object.assign({}, a, { originalIndex: i }) : null))
    .filter(Boolean)
    .find(a => a.id === areaId);
  if (!area) {
    // Área foi excluída (ex.: em outra aba/instância) enquanto a workspace
    // ainda estava aberta — volta pra listagem em vez de renderizar uma tab
    // órfã sem dados.
    navigateBackToA11yList();
    return;
  }
  const areaSpecsRaw = (a11ySpecs || [])
    .map((s, i) => (s ? Object.assign({}, s, { originalIndex: i }) : null))
    .filter(Boolean)
    .filter(s => s.a11yAreaId === area.id);
  const areaSpecs = _a11ySortSpecsByLayerOrder(areaSpecsRaw, area.id);

  const tab = window._a11yWorkspaceActiveTab || 'tabulacao';
  let html = '';
  if (tab === 'tabulacao') html = _a11yWorkspaceTabTabulacao(area);
  else if (tab === 'swipe') html = _a11yWorkspaceTabSwipe(area);
  else if (tab === 'leitor') html = _a11yWorkspaceTabLeitorDeTela(area, areaSpecs);
  else if (tab === 'handoff') html = _a11yWorkspaceTabHandoffDashboard(area, areaSpecs);
  container.innerHTML = html;

  // Os <ul> de Tabulação/Swipe nascem vazios no template (mesmo padrão de
  // renderA11yGroupedList) — preenche agora que já estão no DOM.
  if (tab === 'tabulacao') {
    _renderTabOrderListForArea(area.id, document.getElementById(`tab-order-list-workspace-${area.id}`));
  }
  // Trilha de Swipe ganhou lista editável direto na aba (2026-09-11,
  // paridade com Tabulação) — só popula se já existir trilha salva
  // (_renderSwipePathTabList sai cedo sozinha se não achar, mas
  // typeof-guard evita erro em telas web, onde esta função nem é
  // carregada por não fazer sentido — Swipe é mobile-only).
  if (tab === 'swipe' && typeof _renderSwipePathTabList === 'function') {
    _renderSwipePathTabList(area.id, area.targetNodeId || null);
  }

  _refreshIcons();
}
window._renderA11yWorkspaceTab = _renderA11yWorkspaceTab;

function selectA11yComponente(value) {
  const select = document.getElementById('a11y-el-componente-select');
  if (select) {
    select.value = value;
    select.dispatchEvent(new Event('change'));
  }
  closeA11yComponenteMenu();
}
window.selectA11yComponente = selectA11yComponente;

// Botão "Editar especificação existente" do aviso de duplicidade — lê o
// índice guardado por prefillA11yComponentName e reabre o formulário em
// modo edição pra ela, descartando o que estava sendo preenchido na spec
// nova (mesmo comportamento de clicar "Editar" direto na listagem).
function _editA11yDuplicateSpecFromModal() {
  const warningEl = document.getElementById('a11y-modal-duplicate-warning');
  const duplicateSpecId = warningEl ? warningEl.dataset.duplicateSpecId : '';
  if (!duplicateSpecId) return;
  closeA11yModal();
  editA11ySpec(duplicateSpecId);
}
window._editA11yDuplicateSpecFromModal = _editA11yDuplicateSpecFromModal;

function prefillA11yComponentName(name, mainText, dscComponentName, targetNodeId) {
  const modal = document.getElementById('a11y-spec-modal');
  if (!modal || modal.classList.contains('hidden')) return;
  // "Camada no canvas"/"Componente DSC" (read-only, comuns às 5 categorias) —
  // populados aqui independente da categoria aberta, ao contrário do restante
  // desta função (Label/Componente do select), que só existe em "elemento".
  // Resposta assíncrona de get-selection-name (fluxo manual); fluxo
  // automático já resolve os 2 no momento de abrir o modal (openA11yModal),
  // sem passar por aqui.
  const targetNodeNameEl = document.getElementById('a11y-modal-target-node-name');
  if (targetNodeNameEl && name) targetNodeNameEl.textContent = name;
  // Fixa o alvo real da spec NO MOMENTO em que "Camada no canvas" é exibido
  // (bug real reportado 2026-09-17: campo mostrava "Top App Bar" mas a spec
  // era criada sobre "Actions", um node diferente). Causa raiz: o fluxo
  // manual nunca gravava modal.dataset.pendingTargetNodeId — só o fluxo
  // automático/wizard fazia isso (ver _resolveA11yFormPresetFromItem). Sem
  // essa gravação, confirmA11ySpec (mais abaixo) não tinha targetNodeId fixo
  // pra usar, e create-unified-spec (backend) caía no fallback de ler
  // figma.currentPage.selection[0] NO INSTANTE do "Aplicar" — se a seleção
  // do canvas mudasse entre abrir o modal e confirmar (drill-in, clique
  // acidental, foco em outro elemento), a spec era criada sobre um node
  // diferente do que o formulário exibia, sem qualquer aviso. Nunca
  // sobrescreve em modo edição (editingSpecId já usa editingSpec.targetNodeId,
  // fixado desde a criação original) nem quando falta id (sem seleção real).
  if (targetNodeId && !modal.dataset.editingSpecId) {
    modal.dataset.pendingTargetNodeId = targetNodeId;
  }
  if (dscComponentName) {
    _renderA11yModalDscComponentName('a11y-modal-dsc-component-name', dscComponentName, modal.dataset.a11yOrigin || 'web');
  }
  // Aviso de spec duplicada (2026-09-04-ae, bug real corrigido: o fluxo
  // manual "+ Nova spec" nunca checava se o elemento já tinha spec da
  // mesma categoria antes de criar outra — 2 specs de título idênticas
  // sobre o mesmo "Page Header" real, confirmado com screenshot). Só
  // roda em modo CRIAÇÃO (nunca em edição — modal.dataset.editingSpecId
  // já é a própria spec existente, não faria sentido avisar sobre ela
  // mesma) e só quando targetNodeId veio resolvido (fluxo manual; o
  // automático já filtra "não documentados" antes de chegar aqui, ver
  // _collectA11yUndocumentedForArea). Não-bloqueante: só oferece um
  // atalho pra editar a existente, o designer decide se quer mesmo criar
  // uma segunda (ex.: categorias diferentes sobre o mesmo nó).
  const warningEl = document.getElementById('a11y-modal-duplicate-warning');
  if (warningEl) {
    let duplicateSpec = null;
    if (!modal.dataset.editingSpecId && targetNodeId) {
      const areaId = window._a11yPendingAreaId;
      const category = modal.dataset.category;
      duplicateSpec = (a11ySpecs || []).find(s =>
        s && s.a11yAreaId === areaId && s.targetNodeId === targetNodeId && s.a11yType === category
      ) || null;
    }
    warningEl.classList.toggle('hidden', !duplicateSpec);
    warningEl.dataset.duplicateSpecId = duplicateSpec && duplicateSpec.id ? duplicateSpec.id : '';
  }
  if (modal.dataset.category !== 'elemento') return;
  // Label a partir do texto real do elemento (ver _findMainTextContent,
  // code.js) — independente do Componente ter sido reconhecido ou não, e
  // sem sobrescrever se o designer já digitou algo.
  _fillA11yLabelIfEmpty(mainText);
  // Em modo edição (editA11ySpec) o formulário já foi preenchido com os
  // dados salvos da spec — o nome do que estiver selecionado no canvas
  // nesse momento é irrelevante e não pode pisar num "Componente" do
  // catálogo já escolhido (a resposta assíncrona de get-selection-name
  // chegaria depois do prefill síncrono e trocaria pra "Outro" silenciosamente).
  if (modal.dataset.editingSpecId) return;
  // Mesma lógica de proteção do modo edição: se o formulário foi aberto com
  // um componente pré-selecionado (botão da Detecção Automática), o nome do
  // canvas não pode trocar o select pra "Outro" por cima da sugestão já
  // escolhida.
  if (modal.dataset.presetComponente) return;
  // Specs mobile não usam mais o select/"Outro" desktop (bloco escondido, ver
  // _toggleA11yElementoDesktopBlock) — nada aqui pra pré-preencher a partir
  // do nome do canvas; o designer identifica o componente pelo dropdown
  // "Link do Componente" mobile manualmente.
  if (modal.dataset.a11yOrigin === 'mobile') return;
  const outro = document.getElementById('a11y-el-componente-outro');
  const select = document.getElementById('a11y-el-componente-select');
  // Nome do canvas raramente bate com uma chave do catálogo — cai sempre em
  // "Outro" com o nome pré-preenchido, o designer troca pro item certo se
  // reconhecer o componente na lista.
  if (select && outro && !outro.value && name) {
    select.value = 'outro';
    outro.value = name;
    updateA11yCharCounter(outro);
    updateA11yElementoFields();
  }
}
window.prefillA11yComponentName = prefillA11yComponentName;

// Escreve o texto real do elemento (primeiro TEXT visível encontrado no
// canvas, ver _findMainTextContent em code.js) no campo Label, só se ele
// ainda estiver vazio — nunca sobrescreve o que o designer já digitou.
function _fillA11yLabelIfEmpty(mainText) {
  if (!mainText) return;
  const labelInput = document.getElementById('a11y-el-label');
  if (labelInput && !labelInput.value.trim()) { labelInput.value = mainText; updateA11yCharCounter(labelInput); }
}

// ── Toggles dinâmicos genéricos (Título/Decorativo/Estrutura/Informações) ──
// Mesmo padrão de _renderA11yElementoToggles/_collectA11yElementoToggleProperties/
// _restoreA11yElementoToggles, mas parametrizado por wrapId/listId/shortName
// em vez de fixo em "a11y-el-*" — usado pelas 4 categorias que não têm um
// <select> de "Componente" dinâmico. Reaproveita _getA11yComponentToggles
// inteiramente: essa função já faz `_A11Y_SELECT_TO_SHORTNAME[selectValue] ||
// selectValue`, então passar o shortName exato do catálogo (ex: 'niveis de
// titulo', 'ED gerais') cai direto no fallback `|| selectValue` e funciona
// sem nenhuma mudança lá.
function _renderA11yFixedToggles(wrapId, listId, shortName) {
  const wrap = document.getElementById(wrapId);
  const list = document.getElementById(listId);
  if (!wrap || !list) return;
  list.innerHTML = '';

  const info = shortName ? _getA11yComponentToggles(shortName) : null;
  const toggles = (info && info.toggles) || [];
  wrap.classList.toggle('hidden', toggles.length === 0);
  if (toggles.length === 0) return;

  toggles.forEach(t => {
    const max = A11Y_TOGGLE_MAXLENGTH[t.key] || A11Y_TOGGLE_MAXLENGTH_DEFAULT;
    const row = document.createElement('div');
    row.className = 'bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-line rounded-dsc-medium overflow-hidden';
    row.innerHTML = `
      <label class="flex items-center gap-dsc-nano px-dsc-micro py-2.5 cursor-pointer select-none">
        <input type="checkbox" data-a11y-toggle-key="${t.key}"
          onchange="_onA11yElementoToggleChange(this)"
          class="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0" />
        <span class="text-[12px] font-bold text-slate-700 dark:text-white">${escapeHtml(t.label)}</span>
      </label>
      <div class="hidden px-dsc-micro pb-3" data-a11y-toggle-textarea-wrap>
        <textarea data-a11y-toggle-value maxlength="${max}" rows="2" placeholder="Insira seu texto de ${escapeHtml(t.label.toLowerCase())}."
          oninput="updateA11yCharCounterEl(this, this.nextElementSibling)"
          class="w-full bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-line rounded-dsc-small px-2.5 py-dsc-nano text-[12px] text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-100 transition-all resize-none"></textarea>
        <span class="block text-right text-dsc-label-tiny normal-case tracking-normal text-slate-400 dark:text-dark-muted mt-0.5">0/${max}</span>
      </div>
    `;
    list.appendChild(row);
  });
}

// Lê os toggles ligados com texto preenchido de volta em properties[] — mesma
// mecânica de _collectA11yElementoToggleProperties, parametrizada por listId.
function _collectA11yFixedToggleProperties(listId) {
  const list = document.getElementById(listId);
  if (!list) return [];
  const result = [];
  list.querySelectorAll('[data-a11y-toggle-key]').forEach(checkbox => {
    if (!checkbox.checked) return;
    const row = checkbox.closest('div');
    const wrap = row ? row.querySelector('[data-a11y-toggle-textarea-wrap]') : null;
    const ta = wrap ? wrap.querySelector('[data-a11y-toggle-value]') : null;
    const value = ta ? ta.value.trim() : '';
    if (!value) return;
    const key = checkbox.getAttribute('data-a11y-toggle-key');
    result.push({ key, label: A11Y_TOGGLE_LABELS[key] || key, value });
  });
  return result;
}

// Inverso de _collectA11yFixedToggleProperties — usado em
// _prefillA11ySpecForEdit pra religar os toggles salvos com o texto de volta.
function _restoreA11yFixedToggles(listId, props) {
  const list = document.getElementById(listId);
  if (!list) return;
  const canonicalKeys = new Set(Object.keys(A11Y_TOGGLE_LABELS));
  (props || []).forEach(p => {
    if (!p || !canonicalKeys.has(p.key)) return;
    const checkbox = list.querySelector(`[data-a11y-toggle-key="${p.key}"]`);
    if (!checkbox) return;
    checkbox.checked = true;
    const row = checkbox.closest('div');
    const wrap = row ? row.querySelector('[data-a11y-toggle-textarea-wrap]') : null;
    if (wrap) {
      wrap.classList.remove('hidden');
      const ta = wrap.querySelector('[data-a11y-toggle-value]');
      if (ta) { ta.value = p.value || ''; updateA11yCharCounterEl(ta, ta.nextElementSibling); }
    }
  });
}

// ── Estrutura da Página ──────────────────────────────────────────────────
// Seletor em até 2 níveis: subtipo (idiomas / marco de navegação / título da
// página / customizável) e, quando aplicável, o subtipo específico.
// Origem mobile (modal.dataset.a11yOrigin === 'mobile') troca a Nota de
// Código do subtipo "Marco de Navegação" de tags HTML (<header>/<nav>/etc.,
// que não existem em React Native) para accessibilityRole — mesmo princípio
// já usado em A11Y_CONTENT.titulo.mobile pra Nível de Título. Os demais
// subtipos (Idiomas, Título da Página) não têm Nota de Código dependente de
// tag HTML de landmark, então não precisam de variação por origem.
function updateA11yEstruturaFields() {
  const subtipo = document.getElementById('a11y-estrutura-subtipo-select');
  if (!subtipo) return;
  const val = subtipo.value;
  const modal = document.getElementById('a11y-spec-modal');
  const isMobile = modal && modal.dataset.a11yOrigin === 'mobile';

  const idiomasWrap = document.getElementById('a11y-estrutura-idiomas-wrap');
  const marcoWrap = document.getElementById('a11y-estrutura-marco-wrap');
  if (idiomasWrap) idiomasWrap.classList.toggle('hidden', val !== 'idiomas');
  if (marcoWrap) marcoWrap.classList.toggle('hidden', val !== 'marco de navegacao');

  let entry = null;
  let isCustomizavel = val === 'customizavel';
  if (val === 'idiomas') {
    const sub = document.getElementById('a11y-estrutura-idiomas-select');
    entry = A11Y_CONTENT.estrutura.idiomas[sub ? sub.value : 'da pagina'];
  } else if (val === 'marco de navegacao') {
    const sub = document.getElementById('a11y-estrutura-marco-select');
    const subVal = sub ? sub.value : 'header';
    if (subVal === 'customizavel') {
      isCustomizavel = true;
    } else {
      entry = A11Y_CONTENT.estrutura.marco[subVal];
      // Mobile: mesma Descrição (papel semântico é o mesmo, independe de
      // plataforma), mas Nota de Código troca para accessibilityRole — nunca
      // mencionar tag HTML numa spec de origem mobile.
      if (isMobile) {
        const notaMobile = A11Y_CONTENT.estrutura.marcoMobile[subVal];
        entry = Object.assign({}, entry, { notasCodigo: notaMobile ? notaMobile.notaCodigo : '' });
      }
    }
  } else if (val === 'titulo da pagina') {
    entry = A11Y_CONTENT.estrutura.tituloPagina;
  }
  if (isCustomizavel) entry = A11Y_CONTENT.estrutura.customizavel;

  const descInput = document.getElementById('a11y-estrutura-descricao');
  const notaWrap = document.getElementById('a11y-estrutura-nota-wrap');
  const notaEl = document.getElementById('a11y-estrutura-nota');
  if (descInput) {
    descInput.readOnly = !isCustomizavel;
    descInput.classList.toggle('bg-gray-50', !isCustomizavel);
    descInput.classList.toggle('dark:bg-dark-bg', !isCustomizavel);
    // Só reescreve o valor quando o campo é somente-leitura — em modo
    // customizável não sobrescreve o que o designer já digitou.
    if (!isCustomizavel) descInput.value = (entry && entry.descricao) || '';
    else if (!descInput.value) descInput.value = (entry && entry.descricao) || '';
    // Contador só faz sentido quando o campo é digitável (customizável) — nos
    // demais subtipos o texto é curado pela lib, sem limite prático de UX.
    const counter = document.getElementById('a11y-estrutura-descricao-counter');
    if (counter) counter.classList.toggle('hidden', !isCustomizavel);
    updateA11yCharCounter(descInput);
  }
  if (notaWrap) notaWrap.classList.toggle('hidden', !(entry && entry.notasCodigo));
  if (notaEl) notaEl.textContent = (entry && entry.notasCodigo) || '';

  // Toggles dos sub-níveis reais ("EE idiomas": notas+observacoes; "EE marco
  // de navegacao": observacoes) — só existem quando o import real é possível
  // ("customizavel" no nível 1 e "customizavel" dentro de marco de navegação
  // não têm componente catalogado).
  let _estruturaToggleShortName = null;
  if (!isCustomizavel) {
    if (val === 'idiomas') _estruturaToggleShortName = 'EE idiomas';
    else if (val === 'marco de navegacao') _estruturaToggleShortName = 'EE marco de navegacao';
    // "titulo da pagina" não tem sub-nível catalogado — permanece null.
  }
  _renderA11yFixedToggles('a11y-estrutura-toggles-wrap', 'a11y-estrutura-toggles-list', _estruturaToggleShortName);
}
window.updateA11yEstruturaFields = updateA11yEstruturaFields;

// Trava as opções do select de Nível de Título pela origem da área (web só
// H1-H6, mobile só "H (mobile)") — RN não tem hierarquia de título por
// nível, então nunca faz sentido oferecer H1-H6 numa spec mobile e
// vice-versa. Chamada de dentro de updateA11yTituloFields (que já roda nos 3
// pontos de entrada: nova spec, edição de spec existente, e o próprio
// onchange do select), então nunca precisa de uma chamada extra à parte.
function _applyA11yTituloOriginLock(select, isMobile) {
  if (!select) return;
  Array.prototype.forEach.call(select.options, opt => {
    const isMobileOption = opt.value === 'mobile';
    opt.hidden = isMobile ? !isMobileOption : isMobileOption;
    opt.disabled = opt.hidden;
  });
  // Se a opção atualmente selecionada não é compatível com a origem (ex.
  // spec antiga sem origem clara, ou troca de origem em runtime), força o
  // default correto em vez de deixar uma opção oculta selecionada.
  const currentIsMobile = select.value === 'mobile';
  if (currentIsMobile !== isMobile) select.value = _defaultTituloNivelForOrigin(isMobile ? 'mobile' : 'web');

  // Mobile só tem 1 opção real ("mobile") — um <select> sem escolha de
  // verdade é interação supérflua (pedido do usuário, 2026-09-18). Esconde
  // o <select> e mostra o texto fixo equivalente; select continua no DOM
  // (só oculto) e com o valor certo, pra updateA11yTituloFields/
  // confirmA11ySpec lerem normalmente sem mudança de lógica.
  const fixedDisplay = document.getElementById('a11y-titulo-nivel-fixed');
  select.classList.toggle('hidden', isMobile);
  if (fixedDisplay) fixedDisplay.classList.toggle('hidden', !isMobile);
}

// ── Nível de Título ──────────────────────────────────────────────────────
// H1-H6 (web) ou "H (mobile)" fixo — cada nível tem Descrição própria; só o
// modo mobile também tem Nota de Código (accessibilityRole="header").
function updateA11yTituloFields() {
  const select = document.getElementById('a11y-titulo-nivel-select');
  if (!select) return;
  const modal = document.getElementById('a11y-spec-modal');
  const originIsMobile = modal && modal.dataset.a11yOrigin === 'mobile';
  _applyA11yTituloOriginLock(select, originIsMobile);
  const isMobile = select.value === 'mobile';
  const entry = isMobile ? A11Y_CONTENT.titulo.mobile : A11Y_CONTENT.titulo.niveis[select.value];

  const descEl = document.getElementById('a11y-fixed-descricao');
  const notaWrap = document.getElementById('a11y-fixed-nota-wrap');
  const notaEl = document.getElementById('a11y-fixed-nota');
  if (descEl) descEl.textContent = (entry && entry.descricao) || '';
  if (notaWrap) notaWrap.classList.toggle('hidden', !isMobile);
  if (notaEl) notaEl.textContent = (isMobile && entry && entry.notaCodigo) || '';

  // REABERTO em 2026-09-24 (pedido explícito do usuário: "cada propriedade
  // específica [deve] ser apresentada da maneira correta quando selecionado
  // o componente" — reafirmado após auditoria confirmar que o shortName
  // real 'niveis de titulo' declara um BOOLEAN "observacoes" verdadeiro na
  // lib, que ficava escondido incondicionalmente). Histórico: entre
  // 2026-09-17 e 2026-09-24 o accordion "Campos do componente" desta
  // categoria ficava sempre oculto pra specs NOVAS (shortName forçado a
  // null, decisão de simplificação de UX). Revertido — mesmo shortName real
  // usado por Informações Adicionais/Estrutura da Página, sem gambiarra:
  // 'niveis de titulo' é o único shortName real desta categoria (não varia
  // por nível h1-h6 escolhido, confirmado no dado gerado). Descrição/Nota de
  // Código continuam vindo do catálogo fixo A11Y_CONTENT.titulo (não são
  // property BOOLEAN/TEXT opcional, são conteúdo didático por role — nunca
  // foram o alvo desta reabertura).
  _renderA11yFixedToggles('a11y-titulo-toggles-wrap', 'a11y-titulo-toggles-list', 'niveis de titulo');
}
window.updateA11yTituloFields = updateA11yTituloFields;

// ── Elemento Decorativo ──────────────────────────────────────────────────
// Sub-select entre "Gerais" e "Imagem" — mesma Descrição, Nota de Código
// diferente (alt="" em HTML pra imagem, anotação genérica pra gerais). Cada
// subtipo abria um component set PRÓPRIO com toggles diferentes (mapeamento
// que existia aqui em `_A11Y_DECORATIVO_SHORTNAME`), mas desde 2026-09-17 o
// accordion "Campos do componente" fica sempre oculto pra specs NOVAS (ver
// comentário em updateA11yDecorativoFields) — o dicionário de shortName
// ficou sem uso e foi removido; specs antigas continuam restauradas por
// _restoreA11yFixedToggles, que lê direto de `props`, sem depender dele.
//
// 2026-09-22 (bug real confirmado via REST API, pedido do usuário): o select
// "Gerais"/"Imagem" só tem lastro na lib DESKTOP (`[a11y] Box specs LT`,
// node 31:544 → instância aninhada com property "variacao":
// "gerais"/"imagem", node 31:530). O wrapper mobile ("[hac mob] Box specs
// leitor de tela", node 5413:1260) não tem essa distinção — só um toggle
// "Observações". Antes desta correção o select aparecia (e era lido por
// confirmA11ySpec) incondicionalmente pras duas origens, gravando
// `a11ySubtype.tipo: 'gerais'|'imagem'` em specs mobile sem nenhuma property
// real por trás. Ver _applyA11yDecorativoOriginLock.
function updateA11yDecorativoFields() {
  const select = document.getElementById('a11y-decorativo-subtipo-select');
  if (!select) return;
  const modal = document.getElementById('a11y-spec-modal');
  const originIsMobile = modal && modal.dataset.a11yOrigin === 'mobile';
  _applyA11yDecorativoOriginLock(select, originIsMobile);
  const entry = A11Y_CONTENT.decorativo[originIsMobile ? 'mobile' : select.value];
  const descEl = document.getElementById('a11y-fixed-descricao-dec');
  const notaWrap = document.getElementById('a11y-fixed-nota-dec-wrap');
  const notaEl = document.getElementById('a11y-fixed-nota-dec');
  if (descEl) descEl.textContent = (entry && entry.descricao) || '';
  const notaTexto = (entry && entry.notasCodigo) || '';
  if (notaWrap) notaWrap.classList.toggle('hidden', !notaTexto);
  if (notaEl) notaEl.textContent = notaTexto;

  // REABERTO em 2026-09-24 (mesmo motivo de updateA11yTituloFields — ver
  // comentário lá). Entre 2026-09-17 e hoje o accordion "Campos do
  // componente" ficava sempre oculto pra specs NOVAS (shortName forçado a
  // null), mesmo os shortNames reais 'ED gerais'/'ED imagem' declarando
  // BOOLEAN "observacoes" (os dois) e "notas" (os dois) na lib.
  // select.value já é 'gerais'/'imagem' — bate 1:1 com os shortNames reais
  // 'ED gerais'/'ED imagem' (confirmado no dado gerado), sem precisar de
  // dicionário de tradução. Em mobile, _applyA11yDecorativoOriginLock (logo
  // acima) já trava select.value em 'gerais' antes desta linha rodar — a
  // mesma distinção real que a lib desktop declara (mobile não tem os 2
  // subtipos, só 1 toggle "Observações" no wrapper "[hac mob] Box specs
  // leitor de tela", ver comentário 2026-09-22 acima).
  _renderA11yFixedToggles('a11y-decorativo-toggles-wrap', 'a11y-decorativo-toggles-list', select.value === 'imagem' ? 'ED imagem' : 'ED gerais');
}

// Trava o select "Subtipo" (Gerais/Imagem) por origem — mesmo padrão de
// _applyA11yTituloOriginLock. Mobile não tem essa distinção estruturalmente
// (ver comentário acima updateA11yDecorativoFields): esconde o <select> e
// mostra um texto fixo equivalente; o <select> continua no DOM (só oculto),
// travado em 'gerais' (mesma Descrição que a lib mobile realmente usa),
// pra confirmA11ySpec/_prefillA11ySpecForEdit lerem select.value sem
// precisar de um caminho de código à parte.
function _applyA11yDecorativoOriginLock(select, isMobile) {
  if (!select) return;
  if (isMobile && select.value !== 'gerais') select.value = 'gerais';
  select.classList.toggle('hidden', isMobile);
  const fixedDisplay = document.getElementById('a11y-decorativo-subtipo-fixed');
  if (fixedDisplay) fixedDisplay.classList.toggle('hidden', !isMobile);
}
window.updateA11yDecorativoFields = updateA11yDecorativoFields;

// ── Informações Adicionais ───────────────────────────────────────────────
// Sub-select entre "Handoffs" / "Conteúdo extra" / "Customizável" — sem Nota
// de Código nessa categoria (só Descrição + Observações).
function updateA11yInformacoesFields() {
  const select = document.getElementById('a11y-informacoes-subtipo-select');
  if (!select) return;
  const isCustomizavel = select.value === 'customizavel';
  const key = select.value === 'conteudo extra' ? 'conteudoExtra' : select.value;
  const entry = A11Y_CONTENT.informacoes[key];

  const descInput = document.getElementById('a11y-informacoes-descricao');
  if (descInput) {
    descInput.readOnly = !isCustomizavel;
    descInput.classList.toggle('bg-gray-50', !isCustomizavel);
    descInput.classList.toggle('dark:bg-dark-bg', !isCustomizavel);
    if (!isCustomizavel) descInput.value = (entry && entry.descricao) || '';
    else if (!descInput.value) descInput.value = (entry && entry.descricao) || '';
    const counter = document.getElementById('a11y-informacoes-descricao-counter');
    if (counter) counter.classList.toggle('hidden', !isCustomizavel);
    updateA11yCharCounter(descInput);
  }

  // "Customizável" não tem componente real catalogado — sem sentido mostrar
  // o toggle, cai sempre no card procedural.
  _renderA11yFixedToggles('a11y-informacoes-toggles-wrap', 'a11y-informacoes-toggles-list', isCustomizavel ? null : 'informações adicionais');
}
window.updateA11yInformacoesFields = updateA11yInformacoesFields;

// Ponto único de fechamento do modal — X e Esc (genérico, ver core.js)
// chamam esta função diretamente. Também é chamada pelo
// caminho de SUCESSO em confirmA11ySpec (botão "Aplicar"), que por isso
// limpa modal.dataset.wizardActive ANTES de chamar closeA11yModal — só
// quando o dataset ainda diz '1' aqui é que o fechamento é "externo"
// (usuário abandonando o formulário sem confirmar), e é isso que deve
// acionar stopA11yBatchWizard.
// O botão "Cancelar" do formulário NÃO chama mais isto direto — chama
// cancelA11yModalExplicit() logo abaixo, que repassa viaExplicitCancelButton
// = true pra stopA11yBatchWizard. Essa distinção existe só pra decidir se o
// snackbar de retomada da revisão aparece: clique em "Cancelar" é intenção
// clara de parar (sem oferta de retomar); X/Esc podem ser
// acidentais (oferece retomar via snackbar). Ver stopA11yBatchWizard.
function closeA11yModal() {
  const modal = document.getElementById('a11y-spec-modal');
  const wasWizardActive = modal && modal.dataset.wizardActive === '1';
  closeModal('a11y-spec-modal');
  if (wasWizardActive && window._a11yBatchWizardState) {
    stopA11yBatchWizard(false);
  }
}
window.closeA11yModal = closeA11yModal;

// Chamado só pelo botão "Cancelar" do formulário — ver comentário acima de
// closeA11yModal pra por que a distinção existe.
function cancelA11yModalExplicit() {
  const modal = document.getElementById('a11y-spec-modal');
  const wasWizardActive = modal && modal.dataset.wizardActive === '1';
  closeModal('a11y-spec-modal');
  if (wasWizardActive && window._a11yBatchWizardState) {
    stopA11yBatchWizard(true);
  }
}
window.cancelA11yModalExplicit = cancelA11yModalExplicit;

// Ponte de request/response com o backend para pegar {id, name} da seleção
// atual no canvas — usada por "Marcar Área" (confirmA11yArea, que cria um
// selo perto do elemento) e pelo pré-preenchimento cosmético do nome do
// componente em openA11yModal. confirmA11ySpec NÃO usa mais isso:
// create-unified-spec usa a seleção atual do canvas direto no backend. Só
// existe um pedido pendente por vez (não há fila): se um novo pedido for
// feito antes do anterior responder, o resolver antigo é perdido
// silenciosamente — cenário improvável nesse fluxo (um modal por vez).
function _getA11ySelectionInfo() {
  return new Promise(resolve => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (window._a11ySelectionInfoResolve === resolve_) window._a11ySelectionInfoResolve = null;
      resolve(value);
    };
    // Timeout de segurança — se a resposta do backend nunca chegar, o botão
    // não pode ficar preso pra sempre esperando.
    const timeoutId = setTimeout(() => finish(null), 4000);
    const resolve_ = (value) => { clearTimeout(timeoutId); finish(value); };
    window._a11ySelectionInfoResolve = resolve_;
    parent.postMessage({ pluginMessage: { type: 'get-a11y-selection-info' } }, '*');
  });
}
window._getA11ySelectionInfo = _getA11ySelectionInfo;

// Posição manual do card (2026-09-21) — histórico: começou como um toggle
// escondido dentro do formulário (rejeitado: "em momento algum eu pedi um
// toggle"), depois virou uma modal obrigatória perguntando "ao lado de quê"
// a cada spec nova (rejeitada também: "Podemos acabar com a posição
// automática. Ele não funciona. Podemos até acabar com a modal e deixar
// para que ele crie sempre usando o elemento selecionado como referência").
// Versão final, sem pergunta nenhuma: confirmA11ySpec (mais abaixo) sempre
// lê a seleção ATUAL do canvas via _getA11ySelectionInfo e usa como
// referência de posição — o algoritmo de empilhamento automático
// (_letterMap/_areaMap em onmessage.js) só entra como fallback quando não
// há nada selecionado no momento de aplicar.

// _getA11yDocumentationStatus (consultava se a Section ativa já tinha
// documentação, pra alimentar o aviso "Continuar/Iniciar nova Section" do
// modal de Marcar Área) foi REMOVIDA em 2026-09-04-k, junto com o aviso —
// ver comentário em openA11yAreaModal acima. O handler de backend
// correspondente (get-a11y-documentation-status) também foi removido.

// ── Payload puro de "Elementos e Imagens" (fluxo WEB) ───────────────────
// Usado pelo fluxo manual (confirmA11ySpec, categoria 'elemento', origem
// web, fora do caso "Outro") — recebe os dados JÁ RESOLVIDOS (nunca lê do
// DOM) e devolve { letter, properties, a11ySubtype } no mesmo formato que
// confirmA11ySpec monta pra 'create-unified-spec'. O wizard de revisão da
// Detecção Automática NÃO usa este builder — ele reaproveita o próprio
// formulário manual (openA11yModal/confirmA11ySpec) item a item, então os
// dados vêm sempre do DOM preenchido pelo designer, igual ao fluxo manual
// normal. Specs mobile não passam mais por aqui (ver branch `isMobile` em
// confirmA11ySpec, que monta o payload direto a partir de
// linkComponente/variant, sem depender do catálogo desktop).
//
// options:
//   componenteKey  chave do catálogo (ex: 'accordion') — nunca "outro" aqui.
//   label          valor de accessibilityLabel digitado pelo designer.
//   tipo           variante secundária (ex: Button → "de icone"), lida do
//                  <select> dinâmico correspondente quando existe.
//   toggleProperties  array já no formato properties[] ({key,label,value})
//                  dos toggles dinâmicos ligados.
function _buildA11yElementoPayload(letter, componenteKey, label, options) {
  const opts = options || {};
  const tipo = opts.tipo != null ? opts.tipo : null;
  const toggleProperties = opts.toggleProperties || [];
  const componente = A11Y_COMPONENTE_LABELS[componenteKey] || componenteKey;
  const a11ySubtype = { componente: componenteKey, isOutro: false, tipo };
  let properties = [
    { key: 'componente', label: 'Componente', value: componente },
    { key: 'label', label: 'Label', value: label },
  ];
  const entry = A11Y_CONTENT.elemento.componentes[componenteKey];
  if (entry && entry.descricao) properties.push({ key: 'descricao', label: 'Descrição', value: entry.descricao });
  if (entry && entry.notasCodigo) properties.push({ key: 'notaCodigo', label: 'Nota de Código', value: entry.notasCodigo });
  // O Label do topo é a ÚNICA fonte do accessibilityLabel (checkbox "Nome
  // Acessível" removido do formulário em 2026-09, mesmo padrão do mobile) —
  // injeta esse valor em properties['nomeAcessivel'] pro backend ligar o
  // BOOLEAN real da instância e escrever o texto quando o componente tiver
  // essa property (code.js já ignora silenciosamente o setProperties quando
  // não tiver, ver _dynamicToggleKeys/toggleMap em code.js). Fix real
  // 2026-09-22 (mesma classe do bug mobile "Label em Value Section", ver
  // _updateA11yMobileLabelVisibility): só GRAVA 'nomeAcessivel' em
  // properties[] (o que o CARD/Ficha exibem) quando o componente
  // selecionado REALMENTE tem esse toggle na lib — usa a mesma leitura
  // dinâmica já confiável (_getA11yComponentToggles/_normalizeA11yToggleName,
  // que já resolve as 3 grafias divergentes "nome acessivel"/"nome
  // acesivel"/"nome acessível" publicadas nos 25 component sets, confirmado
  // via REST API). O campo 'label' em si continua sempre gravado (não é
  // exclusivo de nenhuma property específica — é a anotação do texto
  // acessível independente de o Figma ter ou não um BOOLEAN próprio pra
  // isso); só o rótulo redundante "Nome Acessível" que reivindicava suporte
  // real do componente deixa de aparecer quando é falso.
  const _toggles = (_getA11yComponentToggles(componenteKey) || {}).toggles || [];
  const _hasNomeAcessivelToggle = _toggles.some(t => t.key === 'nomeAcessivel');
  if (_hasNomeAcessivelToggle) {
    properties.push({ key: 'nomeAcessivel', label: A11Y_TOGGLE_LABELS.nomeAcessivel, value: label });
  }
  properties.push(...toggleProperties);
  properties = properties.filter(p => p.value);
  return { letter, properties, a11ySubtype };
}

// containingFrame chega como o nome cru do component set (ex: "[dsc]
// Alert") — remove o prefixo "[dsc]"/colchetes pra virar um nome legível no
// campo "Componente" (ex: "Alert").
function _cleanDscContainingFrameName(containingFrame) {
  return String(containingFrame || '')
    .replace(/^\[dsc\]\s*/i, '')
    .trim() || (containingFrame || 'Componente');
}
window._cleanDscContainingFrameName = _cleanDscContainingFrameName;

// Default de nível de título quando não há sugestão prévia. O WAI recomenda
// nunca inferir nível pelo tamanho visual da fonte — por isso não existe
// heurística real aqui, só um fallback fixo. A única variação é por origem:
// mobile (React Native) não tem escala H1..H6, só um identificador único de
// título ('mobile', ver A11Y_CONTENT.titulo.mobile) — então o default pra
// specs mobile é essa opção, não 'h1'.
function _defaultTituloNivelForOrigin(origin) {
  return origin === 'mobile' ? 'mobile' : 'h1';
}

// Deduz o "tipo" de marco de navegação (header/nav/main/aside/footer) a
// partir do containingFrame do componente DSC real detectado no canvas — por
// ora só "[dsc] Header" → 'header' e "[dsc] Footer" → 'footer' têm
// correspondência curada. Fallback 'header' quando o nome não é reconhecido.
function _inferA11yEstruturaTipoFromContainingFrame(containingFrame) {
  const name = String(containingFrame || '').toLowerCase();
  if (name.includes('footer')) return 'footer';
  if (name.includes('header')) return 'header';
  return 'header';
}

// Botão "Aplicar" do formulário de spec (modals.html) — ponto único de
// entrada tanto do fluxo manual ("+ Nova spec") quanto de cada item do
// wizard de Detecção Automática (_openA11yWizardItemAt reusa o mesmo
// formulário/confirmA11ySpec item a item, ver accessibility.js). Por isso a
// leitura de seleção do canvas (logo abaixo) intercepta bem aqui: um único
// ponto cobre os dois fluxos reais de criação de spec.
// Gate de posição do card removido (2026-09-21, pedido do usuário: "Podemos
// acabar com a posição automática. Ele não funciona. Podemos até acabar com
// a modal e deixar para que ele crie sempre usando o elemento selecionado
// como referência para criar a spec.") — antes disso existiu uma modal
// perguntando "ao lado de quê" a cada spec nova (histórico: um toggle
// escondido dentro do formulário foi tentado primeiro e rejeitado — "em
// momento algum eu pedi um toggle" — depois a modal também foi rejeitada em
// favor desta versão sem pergunta nenhuma). Agora toda spec nova sempre usa
// a seleção ATUAL do canvas como referência de posição — sem gate, sem
// escolha, sem cair no empilhamento automático por letra/área (que o
// usuário classificou como não funcional).
function confirmA11ySpec() {
  const modal = document.getElementById('a11y-spec-modal');
  const editingSpecId = modal ? modal.dataset.editingSpecId : '';
  // Edição nunca reposiciona — a spec já tem lugar (opts.pinnedPosition,
  // montado em _finishA11ySpecConfirm) — editar preserva onde já estava.
  if (editingSpecId) {
    window._a11yPendingManualAnchorNodeId = null;
    _finishA11ySpecConfirm();
    return;
  }
  // Lê a seleção ATUAL do canvas (mesma ponte _getA11ySelectionInfo já usada
  // por "Marcar Área"/pré-preenchimento de nome) e usa como referência de
  // onde o card nasce. Sem seleção válida no momento do clique (designer
  // clicou em algum lugar do canvas fora de um elemento, ou nada
  // selecionado), segue mesmo assim — opts.manualAnchorNodeId fica null e o
  // backend cai no algoritmo automático de sempre como fallback, nunca
  // bloqueia a criação da spec por falta de seleção.
  _getA11ySelectionInfo().then(sel => {
    window._a11yPendingManualAnchorNodeId = (sel && sel.id) || null;
    _finishA11ySpecConfirm();
  });
}
window.confirmA11ySpec = confirmA11ySpec;

// Corpo real de confirmA11ySpec (2026-09-21: extraído pra trás da leitura de
// seleção acima). Monta opts a partir do formulário e dispara
// create-unified-spec.
function _finishA11ySpecConfirm() {
  const modal = document.getElementById('a11y-spec-modal');
  const category = modal ? modal.dataset.category : '';
  const areaId = modal ? modal.dataset.areaId : '';
  const editingSpecId = modal ? modal.dataset.editingSpecId : '';
  // Bug real corrigido (2026-09-11): antes localizava a spec em edição por
  // um índice de array "congelado" no dataset (editingOriginalIndex),
  // capturado no momento em que o modal abriu — se qualquer re-render
  // assíncrono (ex. layer-order-resolved) mudasse a ordem/posição de
  // a11ySpecs enquanto o modal estava aberto, o índice apontava pra outra
  // spec (ou pra nada) na hora de salvar. Agora sempre resolve pela
  // identidade real (editingSpecId), nunca por posição.
  const editingOriginalIndex = editingSpecId
    ? a11ySpecs.findIndex(s => s && s.id === editingSpecId) : -1;
  const meta = A11Y_CATEGORIES[category];
  if (!meta) return;

  const g = id => {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  };

  let properties = [];
  let letter;
  // a11ySubtype: chave crua da subvariante escolhida (não o texto já resolvido
  // em properties[]) — usada só pelo backend pra saber qual variante ajustar
  // na instância aninhada do componente real importado da lib.
  let a11ySubtype = null;

  if (category === 'elemento') {
    const tag = g('a11y-el-tag-input');
    if (!validateA11yTagInput()) {
      showToast('Tag inválida. Use o formato 1, 2, 1.1, 1.2...');
      return;
    }
    const select = document.getElementById('a11y-el-componente-select');
    const isMobile = (modal && modal.dataset.a11yOrigin) === 'mobile';
    // Em specs mobile este select fica escondido e travado no default (ver
    // _toggleA11yElementoDesktopBlock) — isOutro é sempre false pra specs
    // mobile NOVAS. O equivalente mobile de "Outro" é escolher "Personalizado"
    // no dropdown "Link do Componente" (default real da property) e descrever
    // o nome do componente não mapeado no campo de texto livre companheiro —
    // ver A11Y_MOBILE_LINK_COMPONENT_OPTIONS/_renderA11yElementoMobileFields.
    // O branch `if (isOutro)` abaixo continua existindo só pra edição de
    // specs mobile ANTIGAS que já nasceram com isOutro=true (antes desta
    // correção) — não é mais alcançável a partir do formulário mobile atual.
    // "Imagem" (2026-09-17): reflete o radio a11y-el-variante (property REAL
    // "variante" do component set base) — quando marcado, o <select> de 15
    // componentes fica escondido/irrelevante e o shortName real a usar é
    // sempre 'imagem', independente do valor residual do <select>.
    const isImagem = !isMobile && _getA11yElementoVariante() === 'imagem';
    const isOutro = !isMobile && !isImagem && select && select.value === 'outro';
    const label = g('a11y-el-label');
    // Sub-variante mobile ('componente' | 'link' | 'texto alternativo') — só
    // relevante/lida quando a origem é mobile; ausente em specs web (ver
    // A11Y_ELEMENTO_MOBILE_VARIANTS).
    const mobileVariant = isMobile ? _getA11yElementoMobileVariant() : null;

    // Validações obrigatórias exclusivas de cada sub-variante mobile — a doc
    // da vertical exigia esses campos antes de confirmar a spec.
    // 2026-09-17: removidas (pedido explícito do usuário) porque "Variante
    // (mobile)"/"Campos exclusivos mobile" (Link do Componente/Descrição
    // alternativa inclusos) ficaram sempre ocultos pra specs NOVAS (ver
    // _renderA11yElementoMobileFields) — o radio de variante permanece
    // travado em "componente" (default real da property) porque o designer
    // não tem mais como trocá-lo nesta tela simplificada, então
    // mobileVariant nunca chega aqui como "link"/"texto alternativo" pra uma
    // spec nova; manter a validação bloquearia a confirmação de todo mundo,
    // já que o campo exigido nem aparece mais pra ser preenchido. Specs
    // mobile ANTIGAS com variante "link"/"texto alternativo" e esses campos
    // já preenchidos continuam sendo restauradas e salvas normalmente em modo
    // edição (_restoreA11yElementoMobileToggles), só não passam mais por
    // validação obrigatória ao reconfirmar.

    if (isOutro) {
      const componenteOutro = g('a11y-el-componente-outro');
      if (!componenteOutro) {
        showToast('Informe o Componente documentado.');
        return;
      }
      if (!label) {
        showToast('Informe o Label (accessibilityLabel) do elemento.');
        return;
      }
      letter = tag;
      a11ySubtype = { componente: null, isOutro: true, tipo: null, variant: mobileVariant };
      properties = [
        { key: 'componente', label: 'Componente', value: componenteOutro },
        { key: 'label', label: 'Label', value: label },
        // Descrição fixa da variante "link" — "Outro" (componente fora do
        // catálogo) também pode ser mobile (ex: componente novo do DSC |
        // Super App ainda sem mapeamento de a11y curado).
        ...(isMobile && mobileVariant === A11Y_ELEMENTO_MOBILE_VARIANTS.link
          ? [{ key: 'descricao', label: 'Descrição', value: A11Y_CONTENT.elemento.mobileLink.descricao }]
          : []),
        // Dica para Leitor de Tela/Observações/Link do Componente/Descrição
        // (texto alternativo) — coletados conforme a sub-variante mobile ativa
        // (_renderA11yElementoMobileFields já renderizou só os campos
        // pertinentes).
        ..._collectA11yElementoMobileToggleProperties(),
      ].filter(p => p.value);
    } else if (isMobile) {
      // Specs mobile não-"Outro" nunca passam pelo catálogo desktop (select
      // fica escondido/travado no default, ver _toggleA11yElementoDesktopBlock)
      // — a origem filtra tudo, fonte de verdade aqui é só a sub-variante
      // mobile (linkComponente/variant), nunca select.value. a11ySubtype.
      // componente fica null (não existe "componente do catálogo desktop"
      // pra essa spec); linkComponente/linkComponenteNome (variante
      // "componente") é quem de fato identifica o componente real
      // documentado, coletado via _collectA11yElementoMobileToggleProperties.
      // Label só é exigido/gravado quando o componente (+ sub-variante de
      // Leitor de Tela) REALMENTE tem property de nome acessível na lib —
      // mesmo critério de _updateA11yMobileLabelVisibility (dado real, ver
      // comentário lá). Bug real corrigido 2026-09-22: antes o campo era
      // sempre obrigatório/gravado mesmo pra componentes como "[dsc] Value
      // Section" (só "Leitor de Tela"/"Observações" na lib, confirmado via
      // REST API), fazendo o card/Ficha exibirem um "Label" que o componente
      // não suporta.
      const hasNomeAcessivel = typeof _a11yMobileComponentHasNomeAcessivel === 'function'
        ? _a11yMobileComponentHasNomeAcessivel() : true;
      if (hasNomeAcessivel && !label) {
        showToast('Informe o Label (accessibilityLabel) do elemento.');
        return;
      }
      letter = tag;
      a11ySubtype = { componente: null, isOutro: false, tipo: null, variant: mobileVariant };
      const overrideDescricao = mobileVariant === A11Y_ELEMENTO_MOBILE_VARIANTS.link
        ? A11Y_CONTENT.elemento.mobileLink.descricao
        : null;
      properties = [
        ...(hasNomeAcessivel ? [{ key: 'label', label: 'Label', value: label }] : []),
        ...(overrideDescricao ? [{ key: 'descricao', label: 'Descrição', value: overrideDescricao }] : []),
        // Dica para Leitor de Tela/Observações/Link do Componente/Descrição
        // (texto alternativo) — coletados conforme a sub-variante mobile ativa
        // (_renderA11yElementoMobileFields já renderizou só os campos
        // pertinentes).
        ..._collectA11yElementoMobileToggleProperties(),
      ].filter(p => p.value);
    } else {
      if (!label) {
        showToast('Informe o Label (accessibilityLabel) do elemento.');
        return;
      }
      // tipo: valor do <select> dinâmico de variante secundária (ex: Button →
      // "de icone") — null quando o componente não tem nenhuma variante
      // catalogada além de "componente".
      const tipo = _collectA11yElementoVariantValue();
      // Toggles dinâmicos do componente real (Nome Acessível/Observações/
      // Notas de Código, conforme disponíveis naquele componente específico).
      // Só entram os que o designer ligou E preencheu; o backend usa
      // properties[].key pra saber qual property ativar via setProperties na
      // instância aninhada certa. componenteKey é 'imagem' quando o radio
      // "Tipo de elemento" está em Imagem (select.value fica escondido/
      // residual nesse modo, nunca a fonte de verdade — ver isImagem acima).
      const componenteKey = isImagem ? 'imagem' : select.value;
      const built = _buildA11yElementoPayload(tag, componenteKey, label, {
        tipo,
        toggleProperties: _collectA11yElementoToggleProperties(),
      });
      letter = built.letter;
      properties = built.properties;
      a11ySubtype = built.a11ySubtype;
    }
  } else if (category === 'estrutura') {
    const tag = g('a11y-estrutura-tag-input').toUpperCase();
    if (!validateA11yTagInput()) {
      showToast('Tag inválida. Use o formato A, B, A1, A1.1...');
      return;
    }
    letter = tag;
    const descricao = g('a11y-estrutura-descricao');
    const notaEl = document.getElementById('a11y-estrutura-nota');
    const notaWrap = document.getElementById('a11y-estrutura-nota-wrap');
    properties = [
      { key: 'descricao', label: 'Descrição', value: descricao },
    ];
    if (notaWrap && !notaWrap.classList.contains('hidden') && notaEl && notaEl.textContent) {
      properties.push({ key: 'notaCodigo', label: 'Nota de Código', value: notaEl.textContent });
    }
    const subtipoSelect = document.getElementById('a11y-estrutura-subtipo-select');
    const marcoSelect = document.getElementById('a11y-estrutura-marco-select');
    const idiomasSelect = document.getElementById('a11y-estrutura-idiomas-select');
    const variacao = subtipoSelect ? subtipoSelect.value : 'idiomas';
    a11ySubtype = {
      variacao,
      tipo: variacao === 'marco de navegacao' ? (marcoSelect ? marcoSelect.value : 'header') : null,
      idioma: variacao === 'idiomas' ? (idiomasSelect ? idiomasSelect.value : 'da pagina') : null,
    };
    // Toggles dos sub-níveis "EE idiomas"/"EE marco de navegacao" — o
    // backend usa properties[].key pra ativar a property booleana real na
    // instância aninhada certa.
    properties.push(..._collectA11yFixedToggleProperties('a11y-estrutura-toggles-list'));
  } else if (category === 'titulo') {
    const nivelSelect = document.getElementById('a11y-titulo-nivel-select');
    const nivel = nivelSelect ? nivelSelect.value : 'h1';
    letter = nivel === 'mobile' ? 'H' : nivel.toUpperCase();
    const descEl = document.getElementById('a11y-fixed-descricao');
    properties = [
      { key: 'descricao', label: 'Descrição', value: descEl ? descEl.textContent : '' },
    ];
    if (nivel === 'mobile') {
      const notaEl = document.getElementById('a11y-fixed-nota');
      if (notaEl && notaEl.textContent) properties.push({ key: 'notaCodigo', label: 'Nota de Código', value: notaEl.textContent });
    }
    // Toggle real "observacoes" do set "niveis de titulo" — formulário
    // simplificado (2026-09-17, pedido explícito do usuário) escondeu o
    // accordion "Campos do componente" pra sempre, então
    // _collectA11yFixedToggleProperties nunca mais encontra o checkbox (a
    // lista nem é renderizada, ver updateA11yTituloFields) e retornaria
    // sempre []. Sem este fallback, reabrir e salvar de novo uma spec de
    // Título ANTIGA que já tinha Observações preenchidas apagaria esse dado
    // silenciosamente. Preserva o valor salvo anteriormente (se houver)
    // quando editando; specs novas simplesmente não têm essa property.
    const collectedToggles = _collectA11yFixedToggleProperties('a11y-titulo-toggles-list');
    if (collectedToggles.length) {
      properties.push(...collectedToggles);
    } else if (editingOriginalIndex > -1) {
      const previousSpec = a11ySpecs[editingOriginalIndex];
      const previousObservacoes = previousSpec && Array.isArray(previousSpec.properties)
        ? previousSpec.properties.find(p => p && p.key === 'observacoes')
        : null;
      if (previousObservacoes) properties.push(previousObservacoes);
    }
    a11ySubtype = { nivel };
  } else if (category === 'decorativo') {
    letter = meta.badge;
    const descEl = document.getElementById('a11y-fixed-descricao-dec');
    const notaEl = document.getElementById('a11y-fixed-nota-dec');
    properties = [
      { key: 'descricao', label: 'Descrição', value: descEl ? descEl.textContent : '' },
    ];
    if (notaEl && notaEl.textContent) properties.push({ key: 'notaCodigo', label: 'Nota de Código', value: notaEl.textContent });
    // Toggles reais "observacoes"/"notas" do set correspondente ao subtipo
    // (ED gerais / ED imagem).
    properties.push(..._collectA11yFixedToggleProperties('a11y-decorativo-toggles-list'));
    const decSelect = document.getElementById('a11y-decorativo-subtipo-select');
    // 2026-09-22 (bug real confirmado via REST API): "Gerais"/"Imagem" só
    // existe na lib DESKTOP (ver comentário grande em
    // updateA11yDecorativoFields). _applyA11yDecorativoOriginLock já força
    // decSelect.value='gerais' e esconde o select quando a origem é mobile,
    // mas o guard explícito abaixo evita depender silenciosamente do DOM já
    // estar sincronizado — nunca grava 'imagem' (nem qualquer outro valor
    // fora do default) numa spec mobile.
    const decOriginIsMobile = (modal && modal.dataset.a11yOrigin) === 'mobile';
    a11ySubtype = { tipo: decOriginIsMobile ? 'gerais' : (decSelect ? decSelect.value : 'gerais') };
  } else if (category === 'informacoes') {
    const tag = g('a11y-informacoes-tag-input').toUpperCase();
    if (!validateA11yTagInput()) {
      showToast('Tag inválida. Use o formato A, B, A1, A1.1...');
      return;
    }
    letter = tag;
    const descricao = g('a11y-informacoes-descricao');
    properties = [
      { key: 'descricao', label: 'Descrição', value: descricao },
    ];
    // Toggle real "observacoes" do set "informações adicionais" — não
    // aparece no subtipo "customizavel" (sem componente real catalogado).
    properties.push(..._collectA11yFixedToggleProperties('a11y-informacoes-toggles-list'));
    const infoSelect = document.getElementById('a11y-informacoes-subtipo-select');
    a11ySubtype = { subtipo: infoSelect ? infoSelect.value : 'handoffs' };
  }

  // Lido ANTES de limpar o dataset — este é sempre o caminho de SUCESSO
  // (botão "Aplicar"), diferente do fechamento "externo" (X/Esc/"Cancelar")
  // que aciona stopA11yBatchWizard dentro de closeA11yModal.
  // Limpa wizardActive ANTES de chamar closeA11yModal() propositalmente:
  // sem isso, closeA11yModal interpretaria este fechamento como abandono e
  // encerraria o wizard no meio de uma confirmação bem-sucedida.
  const isWizardActive = modal && modal.dataset.wizardActive === '1';
  if (modal) delete modal.dataset.wizardActive;

  closeA11yModal();
  // O modal fecha na hora, mas o backend ainda precisa de figma.loadFontAsync
  // (x3) + importComponentByKeyAsync (import real da lib "Design Acessível")
  // antes de notificar. Isso pode levar segundos sem NENHUM feedback visível,
  // criando a falsa impressão de que um clique posterior (ex: na árvore de
  // camadas) foi o que disparou o toast "Especificação criada" quando ele
  // finalmente aparece. No wizard o toast por item é suprimido (silent:
  // true, ver opts abaixo) — o resumo agregado do fim (_advanceA11yBatchWizard)
  // já cobre o feedback.
  if (!isWizardActive) showToast('Criando especificação de acessibilidade…');

  const guideSideEl = document.querySelector('input[name="a11y-guide-side"]:checked');
  const drawModeEl = document.querySelector('input[name="a11y-draw-mode"]:checked');
  const drawMode = drawModeEl ? drawModeEl.value : 'contorno';

  const opts = {
    category: 'acessibilidade',
    categoryLabel: getA11yCategoryLabel(category, (modal && modal.dataset.a11yOrigin) || 'web'),
    letter,
    color: meta.color,
    fillColor: meta.fill,
    properties,
    guideSide: guideSideEl ? guideSideEl.value : 'right',
    sectionName: getA11yActiveSectionName(),
    designerName: getA11yDesignerName(),
    designerId: getA11yDesignerId(),
    // Modo "Contorno" (default) usa o marcador real "Agrupamento" — a moldura
    // já embute o selo, não precisa de linha ligando ao card. Modo "Linha"
    // reativa o conector (real da lib quando disponível; vetor procedural
    // como fallback).
    drawMode,
    drawConnection: drawMode === 'linha',
    a11yType: category,
    // Chave crua da subvariante — usada pelo backend pra tentar o import real
    // do componente da lib (ver code.js, _tryImportA11yComponent).
    a11ySubtype,
    // Origem já resolvida por quem abriu o modal: Detecção Automática via
    // openA11yFormFromUndocumented, edição de uma spec existente via
    // editA11ySpec, ou o botão "+ Nova spec" via chooseA11yType (que lê
    // getA11yProjectOrigin() — a origem já configurada do projeto). Default
    // 'web' aqui cobre só o caso raro de modal.dataset.a11yOrigin não ter
    // sido setado.
    a11yOrigin: (modal && modal.dataset.a11yOrigin) || 'web',
    // Mesmo raciocínio do a11yOrigin acima: fluxo manual não passou pela
    // Detecção Automática, então não há componentKey resolvido pra apontar
    // uma lib DSC de origem. Explícito null (em vez de omitir o campo) pra
    // deixar claro, na leitura do payload, que o campo existe e foi
    // conscientemente deixado sem valor. Sobrescrito abaixo quando é edição
    // de uma spec que já tinha origem resolvida — editar não deve apagar o
    // badge de lib de origem que a Detecção Automática já tinha resolvido.
    a11ySourceLib: null,
    // Nome real do component set DSC (ex: "[dsc] Button"), resolvido pelo
    // scan e propagado via modal.dataset.dscComponentName (ver openA11yModal/
    // openA11yFormFromUndocumented). Mesmo raciocínio do a11ySourceLib acima:
    // null explícito no fluxo manual, sobrescrito abaixo na edição pra não
    // apagar o badge de componente que a Detecção Automática já tinha resolvido.
    a11yDscComponentName: (modal && modal.dataset.dscComponentName) || null,
    // Posição manual do card (2026-09-21) — id do elemento selecionado no
    // canvas no momento de "Aplicar", capturado em confirmA11ySpec (roda
    // ANTES desta função). null quando não havia nada selecionado — o
    // backend cai no algoritmo automático de sempre nesse caso. Ignorado
    // quando opts.pinnedPosition também está presente (edição preservando a
    // posição já existente tem prioridade, ver bloco abaixo — edição nem lê
    // a seleção, ver confirmA11ySpec).
    manualAnchorNodeId: window._a11yPendingManualAnchorNodeId || null,
    // Área Marcada onde a spec nasceu — associação explícita, escolhida no
    // momento da criação. O backend ecoa esse campo de volta em spec-created
    // pra spec.a11yAreaId continuar presente no objeto salvo localmente.
    a11yAreaId: areaId || null,
    // targetNodeId do FRAME ORIGINAL da área (2026-09-08, não confundir
    // com opts.targetNodeId acima, que é o elemento ESPECÍFICO sendo
    // documentado) — o backend usa isto pra resolver/criar o clone da
    // área e desenhar a spec sobre a cópia, nunca mais sobre o original.
    a11yAreaTargetNodeId: (_findA11yAreaById(areaId) || {}).targetNodeId || null,
    // Posição fixa da réplica de trabalho desta área, se já existir
    // (2026-09-21) — ver _getA11yAreaWorkAnchor/_saveA11yAreaWorkAnchor.
    savedAnchor: _getA11yAreaWorkAnchor(areaId),
    // IDs das specs irmãs (mesma área + mesma categoria) já no canvas —
    // permite ao backend alinhar o card novo na mesma sub-coluna X das
    // demais specs da área+categoria, mesmo quando usam letras ou lados de
    // conector diferentes.
    existingAreaSpecIds: _collectAreaSiblingSpecIds(areaId, category),
    // Todas as specs da área (qualquer categoria) — só usado quando a
    // categoria acima é nova na área, pra decidir ao lado de qual sub-coluna
    // existente posicionar a nova.
    existingAreaAllSpecIds: _collectAreaAllSpecIds(areaId),
    // Specs criadas pelo wizard de revisão da Detecção Automática SEMPRE
    // nascem com needsReview: false — mesmo que a detecção original tivesse
    // confiança baixa ou fosse um componente não catalogado (isUnmapped),
    // já que passaram por configuração/confirmação humana item a item. Fora
    // do wizard, o fluxo manual nunca setava este campo (nasce false por
    // omissão) — explícito aqui só reforça a mesma regra nos dois casos.
    needsReview: false,
    // Suprime o toast individual de create-unified-spec (code.js) durante o
    // wizard: com N itens revisados em sequência, N toasts do caso feliz só
    // competiriam com o resumo agregado disparado no fim
    // (_advanceA11yBatchWizard). Fora do wizard, continua notificando item a
    // item normalmente (showToast acima já cobre o "Criando…").
    silent: isWizardActive,
  };
  // Consome a referência manual assim que ela entra em opts — cada chamada
  // de confirmA11ySpec lê a seleção do canvas de novo, então um valor
  // residual aqui nunca deve vazar pra uma criação seguinte (ex: edição,
  // que nem chega a ler seleção).
  window._a11yPendingManualAnchorNodeId = null;

  if (areaId) {
    window._a11yExpandedAreaIds = window._a11yExpandedAreaIds || new Set();
    window._a11yExpandedAreaIds.add(areaId);
  }

  // Criação a partir de um item da lista de pendentes aponta pro nó real que
  // o scan já identificou, em vez de depender da seleção atual do canvas
  // (mesmo raciocínio de editingSpec.targetNodeId logo abaixo, só que pra
  // criação nova). Não entra no branch de edição: aqui é sempre uma spec
  // nova, sem nó antigo pra apagar.
  const pendingTargetNodeId = modal ? modal.dataset.pendingTargetNodeId : '';
  if (pendingTargetNodeId && !editingSpecId) opts.targetNodeId = pendingTargetNodeId;

  // Editar = apagar o nó antigo (selo + card real) e recriar do zero com os
  // dados atualizados, fixando targetNodeId pra não depender da seleção
  // atual do canvas (o elemento já foi escolhido na criação original).
  const editingSpec = editingOriginalIndex >= 0 ? a11ySpecs[editingOriginalIndex] : null;
  if (editingSpecId && editingSpec) {
    opts.targetNodeId = editingSpec.targetNodeId;
    // Mantém a spec exatamente onde estava no canvas — sem isso o backend
    // trata a recriação como spec nova e a empilha no fim do grupo.
    if (typeof editingSpec.cardX === 'number' && typeof editingSpec.cardY === 'number') {
      opts.pinnedPosition = { x: editingSpec.cardX, y: editingSpec.cardY };
    }
    // Editar reusa este fluxo manual, que por padrão não conhece a origem
    // DSC (ver a11yOrigin/a11ySourceLib acima). Sem isto, editar uma spec
    // criada via Detecção Automática apagaria o badge de lib de origem dela
    // — a edição muda texto/variante, não deveria mudar a proveniência.
    if (editingSpec.a11yOrigin) opts.a11yOrigin = editingSpec.a11yOrigin;
    if (editingSpec.a11ySourceLib) opts.a11ySourceLib = editingSpec.a11ySourceLib;
    if (editingSpec.a11yDscComponentName) opts.a11yDscComponentName = editingSpec.a11yDscComponentName;
    parent.postMessage({ pluginMessage: { type: 'delete-node', id: editingSpecId } }, '*');
    // Guarda a posição original pra spec-created (messages.js) reinserir no
    // mesmo lugar em vez de só empilhar no fim do array — evita que ela
    // "desça" na lista quando duas specs da mesma área compartilham a mesma
    // letra (ordenação por letra é estável, desempate é a ordem de inserção).
    window._a11yEditingReinsertIndex = editingOriginalIndex;
    a11ySpecs.splice(editingOriginalIndex, 1);
  }

  // Fora do wizard: fire-and-forget, igual sempre foi. Dentro do wizard:
  // espera a resposta real 'spec-created' (_createA11ySpecAndWait, mesmo
  // padrão de serialização já usado pelo antigo loop de lote) antes de
  // avançar pro próximo item da fila — evita duas criações concorrentes
  // colidindo (o backend calcula posição/import da lib de forma assíncrona
  // por chamada).
  //
  // Rede de segurança contra duplicidade: recalcula _getDocumentedNodeIdsForArea
  // NA HORA (não usa um snapshot tirado na montagem da fila) — mesma checagem
  // que o antigo loop de lote (confirmA11yBatchGenerate, removido) fazia a
  // cada iteração. Mesmo com revisão humana item a item reduzindo o risco, o
  // hac já teve bug de spec duplicada 4x em sessões anteriores (duplicidade
  // avulso-vs-por-frame); o nó revisado no item corrente pode ter ganhado
  // spec por outra via (edição concorrente, outro item do mesmo lote apontando
  // pro mesmo nó) enquanto o wizard estava parado neste modal. Se o nó já
  // está documentado nesta área, trata como descarte automático e silencioso
  // — não chama o backend, não mostra o toast genérico de falha.
  if (isWizardActive) {
    const wizardState = window._a11yBatchWizardState;
    // Índice capturado agora — navegação livre significa que o designer
    // pode pular pra outro item enquanto o _createA11ySpecAndWait abaixo
    // ainda está em voo (await); sem isso, o .then() marcaria como
    // confirmado/descartado o item que estiver em state.currentIndex NO
    // MOMENTO em que a resposta chegar, não o item que de fato foi
    // confirmado.
    const confirmingIndex = wizardState ? wizardState.currentIndex : -1;
    const dedupeNodeId = opts.targetNodeId || pendingTargetNodeId;
    const alreadyDocumented = wizardState
      && dedupeNodeId
      && _getDocumentedNodeIdsForArea(areaId).has(dedupeNodeId);
    if (alreadyDocumented) {
      wizardState.discarded.add(confirmingIndex);
      showToast('Item já documentado nesta tela, pulado automaticamente.');
      _advanceA11yBatchWizard();
      return;
    }
    showA11yWizardSavingIndicator();
    _createA11ySpecAndWait(opts).then(ok => {
      // Lê window._a11yBatchWizardState de novo (não uma cópia capturada
      // antes do await) — se stopA11yBatchWizard() rodou enquanto esta
      // Promise estava pendente, a variável global já foi zerada e esta
      // resposta tardia não deve reviver/mutar um wizard que o usuário já
      // encerrou.
      const state = window._a11yBatchWizardState;
      hideA11yWizardSavingIndicator();
      if (!state) return;
      if (ok) state.confirmed.add(confirmingIndex);
      else showToast('Não foi possível criar esta especificação. Item pulado.');
      // Só avança automaticamente pro próximo pendente se o designer ainda
      // está olhando pro item que acabou de confirmar — se ele já pulou pra
      // outro item enquanto isso, o avanço aconteceria por baixo do formulário
      // aberto, trocando o conteúdo sem ação do usuário.
      if (state.currentIndex === confirmingIndex) _advanceA11yBatchWizard();
      else _refreshA11yWizardPaginator(state);
    });
  } else {
    // Loading de canvas (2026-09-14) — mesmo motivo do wizard
    // (showA11yWizardSavingIndicator): criar/importar o componente real da
    // lib pode levar segundos. Fechado em spec-created (messages.js); sem
    // resposta explícita de FALHA neste caminho manual (create-unified-spec
    // usa figma.notify direto em erro, sem postMessage de volta) — timeout
    // de segurança evita o loading ficar preso indefinidamente se algo
    // impedir a resposta de chegar.
    if (typeof showA11yCanvasLoading === 'function') showA11yCanvasLoading('Salvando especificação…');
    if (window._a11yManualSpecLoadingTimeout) clearTimeout(window._a11yManualSpecLoadingTimeout);
    window._a11yManualSpecLoadingTimeout = setTimeout(() => {
      if (typeof hideA11yCanvasLoading === 'function') hideA11yCanvasLoading();
    }, 15000);
    parent.postMessage({ pluginMessage: { type: 'create-unified-spec', opts } }, '*');
  }
}
window._finishA11ySpecConfirm = _finishA11ySpecConfirm;

// ── Listagem ─────────────────────────────────────────────────────────────
// Áreas Marcadas são o agrupamento principal (accordion). Toda spec de A11y
// nasce DENTRO de uma área específica; não existe spec "solta" no fluxo
// normal (o bucket "Sem área" só acolhe dado legado/órfão).
// `showCategoryChip` (2026-09-24, pedido do usuário: "remova o chip de
// categoria de dentro do accordion, isso já é trazido dentro do header do
// accordion") — default true por compatibilidade com o único outro
// call-site (_a11ySemAreaAccordionEl, bucket "Sem tela"/legado, mais
// abaixo), onde specs de categorias DIFERENTES aparecem misturadas sob um
// header genérico ("Sem tela") sem nenhuma outra indicação de categoria.
// _a11yCategoryAccordionEl passa false explicitamente — ali o header do
// próprio accordion já mostra ícone + nome da categoria + contagem, e
// repetir o mesmo chip em cada item era redundante (todas as specs dali são
// da mesma categoria, por definição).
function _a11ySpecItemHtml(spec, showCategoryChip) {
  if (showCategoryChip === undefined) showCategoryChip = true;
  const meta = A11Y_CATEGORIES[spec.a11yType] || { label: 'Acessibilidade', icon: 'accessibility' };
  // Label por ORIGEM DA PRÓPRIA SPEC (spec.a11yOrigin), não a lib atualmente
  // selecionada no projeto — uma spec 'titulo' criada em contexto mobile
  // continua rotulada "Títulos" mesmo que o designer troque a lib depois.
  const categoryLabel = spec.a11yType ? (getA11yCategoryLabel(spec.a11yType, spec.a11yOrigin) || meta.label) : meta.label;
  const color = spec.color || meta.color || '#005ca9';
  const fill = spec.fillColor || meta.fill || '#E0F5FA';
  // textColor: variante escura de "color" pro texto/borda do chip de
  // categoria abaixo (sentado direto sobre "fill" claro) — "color" bruto
  // falha WCAG AA nesse contexto (ver comentário em A11Y_CATEGORIES). Specs
  // antigas não persistem esse campo (não precisam — é resolvido aqui via
  // meta, que é sempre a categoria atual, não um snapshot por spec).
  const textColor = meta.textColor || color;
  // Cor do texto/letra do badge redondo (fundo sólido "color") — alinhada
  // com o componente REAL da lib (#22292E), branco só em 'decorativo'. Ver
  // getA11yBadgeTextColor / A11Y_BADGE_TEXT_COLOR_DARK.
  const badgeTextColor = getA11yBadgeTextColor(spec.a11yType);
  const props = spec.properties || [];
  const isHidden = spec.visible === false;
  const isUnlocked = spec.locked === false;

  const dscComponentLabel = spec.a11yDscComponentName ? _cleanDscContainingFrameName(spec.a11yDscComponentName) : null;

  const searchText = _normalizeSearchText(
    [spec.letter, spec.targetNodeName, spec.name, categoryLabel, spec.a11yType, spec.a11ySourceLib?.label, dscComponentLabel]
      .concat(props.flatMap(p => [p.label, p.value]))
      .filter(Boolean)
      .join(' ')
  );

  return `
    <div class="relative bg-gray-50/60 dark:bg-dark-bg/40 rounded-dsc-medium border ${isUnlocked ? 'border-amber-200 dark:border-amber-800/40' : isHidden ? 'border-gray-100 opacity-50' : 'border-gray-100 dark:border-dark-line'} overflow-hidden"
      data-a11y-spec-item data-a11y-category="${escapeHtml(spec.a11yType || '')}" data-a11y-search="${escapeHtml(searchText)}">
      <div class="flex items-start px-2.5 py-dsc-nano gap-dsc-nano">
        <div class="w-6 h-6 rounded-dsc-circ flex items-center justify-center text-dsc-label-tiny normal-case tracking-normal font-extrabold shrink-0 mt-0.5" style="background-color:${color};color:${badgeTextColor}">${escapeHtml(spec.letter || 'A')}</div>
        <div class="flex-1 min-w-0">
          <p class="text-dsc-label-tiny normal-case tracking-normal font-semibold text-slate-700 dark:text-white truncate">${escapeHtml(spec.targetNodeName || spec.name || 'Elemento')}</p>
          <div class="flex items-center flex-wrap gap-dsc-quark mt-0.5">
            ${showCategoryChip ? `
            <span class="inline-flex items-center gap-dsc-quark px-1.5 py-0.5 rounded-dsc-circ border text-dsc-label-tiny normal-case tracking-normal font-bold" style="background-color:${fill};border-color:${textColor};color:${textColor};">
              <i data-lucide="${meta.icon}" class="w-2.5 h-2.5"></i> ${escapeHtml(categoryLabel)}
            </span>` : ''}
            ${spec.a11ySourceLib ? `
            <span class="inline-flex items-center px-1.5 py-0.5 rounded-dsc-circ border text-dsc-label-tiny normal-case tracking-normal font-medium bg-slate-50 dark:bg-dark-bg/60 border-slate-200 dark:border-dark-line text-slate-500 dark:text-dark-muted">
              ${escapeHtml(spec.a11ySourceLib.label)}
            </span>` : ''}
            ${dscComponentLabel ? `
            <span class="inline-flex items-center gap-dsc-quark px-1.5 py-0.5 rounded-dsc-circ border text-dsc-label-tiny normal-case tracking-normal font-medium bg-slate-50 dark:bg-dark-bg/60 border-slate-200 dark:border-dark-line text-slate-500 dark:text-dark-muted">
              <i data-lucide="component" class="w-2.5 h-2.5"></i> ${escapeHtml(dscComponentLabel)}
            </span>` : ''}
            ${spec.needsReview ? `
            <button type="button" title="Especificação precisa de revisão, clique para verificar" aria-label="Verificar especificação, precisa de revisão"
              onclick="editA11ySpec('${escapeHtml(spec.id)}')"
              class="inline-flex items-center gap-dsc-quark px-1.5 py-0.5 rounded-dsc-circ border text-dsc-label-tiny normal-case tracking-normal font-bold bg-amber-50/60 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/40 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/20 transition-colors">
              <i data-lucide="alert-triangle" class="w-2.5 h-2.5"></i> Verificar
            </button>` : ''}
          </div>
        </div>
        <button type="button" title="Focar no elemento no canvas" aria-label="Focar no elemento no canvas"
          onclick="_highlightSpecListItem('${escapeHtml(spec.targetNodeId)}', '${escapeHtml(spec.a11yAreaId || '')}')"
          class="w-10 h-10 flex items-center justify-center rounded-2xl text-gray-400 hover:text-[#005ca9] transition-colors shrink-0">
          <i data-lucide="locate" class="w-5 h-5"></i>
        </button>
        <button type="button" title="${isHidden ? 'Mostrar' : 'Ocultar'} no canvas" aria-label="${isHidden ? 'Mostrar' : 'Ocultar'} no canvas"
          onclick="toggleA11ySpecVisibility('${escapeHtml(spec.id)}')"
          class="w-10 h-10 flex items-center justify-center rounded-2xl text-gray-400 hover:text-[#005ca9] transition-colors shrink-0">
          <i data-lucide="${isHidden ? 'eye-off' : 'eye'}" class="w-5 h-5"></i>
        </button>
        <button type="button" title="${isUnlocked ? 'Travar' : 'Destravar'}" aria-label="${isUnlocked ? 'Travar' : 'Destravar'}"
          onclick="toggleA11ySpecLock('${escapeHtml(spec.id)}')"
          class="w-10 h-10 flex items-center justify-center rounded-2xl ${isUnlocked ? 'text-amber-500' : 'text-gray-400'} hover:text-[#005ca9] transition-colors shrink-0">
          <i data-lucide="${isUnlocked ? 'lock-open' : 'lock'}" class="w-5 h-5"></i>
        </button>
        <button type="button" title="Editar" aria-label="Editar especificação de acessibilidade"
          onclick="editA11ySpec('${escapeHtml(spec.id)}')"
          class="w-10 h-10 flex items-center justify-center rounded-2xl text-gray-400 hover:text-[#005ca9] transition-colors shrink-0">
          <i data-lucide="pencil" class="w-5 h-5"></i>
        </button>
        <button type="button" title="Remover" aria-label="Remover especificação de acessibilidade"
          onclick="deleteA11ySpec('${escapeHtml(spec.id)}')"
          class="w-10 h-10 flex items-center justify-center rounded-2xl text-gray-400 hover:text-red-500 transition-colors shrink-0">
          <i data-lucide="trash-2" class="w-5 h-5"></i>
        </button>
      </div>
      ${props.length > 0 ? `
      <div class="px-2.5 pb-2.5 space-y-1">
        ${props.map(p => {
          const isLink = p.key === 'linkComponente' && /^https?:\/\//.test(String(p.value || ''));
          const valueHtml = isLink
            ? `<a href="${escapeHtml(p.value)}" target="_blank" rel="noopener noreferrer" title="Abrir componente no Figma" class="text-[10px] leading-snug font-semibold text-[#005ca9] dark:text-blue-300 text-right break-all min-w-0 underline hover:no-underline">${escapeHtml(String(p.value))}</a>`
            : `<span class="text-dsc-label-tiny normal-case tracking-normal font-semibold text-slate-700 dark:text-white text-right break-all min-w-0">${escapeHtml(String(p.value))}</span>`;
          return `
          <div class="flex items-start justify-between gap-dsc-nano px-2 py-1 bg-white dark:bg-dark-surface rounded-dsc-small">
            <span class="text-dsc-label-tiny normal-case tracking-normal font-bold text-slate-500 dark:text-dark-muted shrink-0 pt-px">${escapeHtml(p.label)}</span>
            ${valueHtml}
          </div>`;
        }).join('')}
      </div>` : ''}
    </div>
  `;
}

// Conjunto persistente de áreas expandidas — sobrevive a re-renders (ex.:
// criar/editar qualquer spec dispara renderA11yGroupedList e reconstrói a
// lista do zero). Sem isso, cada re-render colapsava de volta qualquer área
// que o designer tivesse aberto manualmente pra consulta.
window._a11yExpandedAreaIds = window._a11yExpandedAreaIds || new Set();

function toggleA11yAreaAccordion(uid, areaId) {
  const body = document.getElementById(`body-${uid}`);
  const chevron = document.getElementById(`chevron-${uid}`);
  if (!body) return;
  const isHidden = body.classList.contains('hidden');
  body.classList.toggle('hidden', !isHidden);
  if (chevron) chevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
  if (areaId) {
    if (isHidden) window._a11yExpandedAreaIds.add(areaId);
    else window._a11yExpandedAreaIds.delete(areaId);
  }
}
window.toggleA11yAreaAccordion = toggleA11yAreaAccordion;

// Subaccordion de Ordem de Tabulação. Conjunto separado de
// window._a11yExpandedAreaIds: expandir/recolher a seção de Ordem de
// Tabulação de uma área não pode afetar o estado de expansão da própria
// área (são dois accordions independentes, aninhados). Chaveado pelo uid do
// accordion PAI (área ou "sem área"), não pelo areaId.
window._a11yExpandedTabOrderIds = window._a11yExpandedTabOrderIds || new Set();

// Ação em massa disparada pelos botões "Expandir todos"/"Recolher todos"
// dentro da aba "Leitor de Tela" da workspace de UMA área (nunca afeta
// outras áreas/abas). `btn` é o próprio elemento clicado — sobe até
// #a11y-workspace-tab-content (bug real corrigido 2026-09-16: antes subia
// até `.accordion-content`, herdado de uma versão anterior da UI —
// listagem em accordion, pré-reforma pra workspace por abas — que não
// existe mais nesse contexto; closest() sempre retornava null e a função
// saía sem fazer nada, então os botões nunca funcionavam dentro da
// workspace), depois localiza cada `.accordion-content` filho nesse
// escopo. Sincroniza os dois Sets de estado pra um toggle individual
// posterior não reabrir/fechar algo que a ação em massa acabou de definir.
function _a11ySetAllSubaccordions(btn, expand) {
  const areaBody = btn.closest('#a11y-workspace-tab-content') || btn.closest('.accordion-content');
  if (!areaBody) return;
  areaBody.querySelectorAll('.accordion-content').forEach(body => {
    body.classList.toggle('hidden', !expand);
    const idSuffix = body.id.replace(/^(body-|tab-order-body-|undoc-body-)/, '');
    const chevronPrefix = body.id.startsWith('tab-order-body-') ? 'tab-order-chevron-'
      : body.id.startsWith('undoc-body-') ? 'undoc-chevron-'
      : 'chevron-';
    const chevron = document.getElementById(`${chevronPrefix}${idSuffix}`);
    if (chevron) chevron.style.transform = expand ? 'rotate(180deg)' : 'rotate(0deg)';
    if (body.id.startsWith('tab-order-body-')) {
      if (expand) window._a11yExpandedTabOrderIds.add(idSuffix);
      else window._a11yExpandedTabOrderIds.delete(idSuffix);
    } else if (body.id.startsWith('undoc-body-')) {
      if (expand) window._a11yExpandedUndocumentedIds.add(idSuffix);
      else window._a11yExpandedUndocumentedIds.delete(idSuffix);
    }
  });
}
window._a11ySetAllSubaccordions = _a11ySetAllSubaccordions;

// Subaccordion por categoria (elemento/estrutura/titulo/decorativo/informacoes)
// dentro de cada Área. Nasce RECOLHIDO por padrão (mudou em 2026-08-25, avaliação
// design-ux + accessibility-specialist sobre densidade do card de Área — antes
// nascia sempre expandido sem memória de estado). Estado próprio em
// window._a11yExpandedCategoryIds, mesmo padrão de _a11yExpandedTabOrderIds/
// _a11yExpandedUndocumentedIds — chaveado por uid (categoria dentro de uma
// área específica), não por catKey sozinho (a mesma categoria em áreas
// diferentes tem estado independente).
window._a11yExpandedCategoryIds = window._a11yExpandedCategoryIds || new Set();

function toggleA11yCategoryAccordion(uid) {
  const body = document.getElementById(`body-${uid}`);
  const chevron = document.getElementById(`chevron-${uid}`);
  if (!body) return;
  const isHidden = body.classList.contains('hidden');
  body.classList.toggle('hidden', !isHidden);
  if (chevron) chevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
  if (isHidden) window._a11yExpandedCategoryIds.add(uid);
  else window._a11yExpandedCategoryIds.delete(uid);
}
window.toggleA11yCategoryAccordion = toggleA11yCategoryAccordion;

function _a11yCategoryAccordionEl(uid, catKey, catSpecs) {
  const meta = A11Y_CATEGORIES[catKey] || { label: _capitalizeFirst(catKey), icon: 'accessibility', color: '#005ca9', fill: '#E0F5FA' };
  // Origem pela PRIMEIRA spec do grupo — todas as specs de uma mesma
  // área/categoria compartilham a mesma origem (a área inteira pertence a
  // uma única lib), então basta uma amostra em vez de recalcular por item.
  const groupOrigin = (catSpecs && catSpecs[0] && catSpecs[0].a11yOrigin) || null;
  const categoryLabel = getA11yCategoryLabel(catKey, groupOrigin) || meta.label;
  const expand = window._a11yExpandedCategoryIds.has(uid);
  return `
    <div class="rounded-dsc-small border border-gray-100 dark:border-dark-line overflow-hidden ml-1 bg-white dark:bg-dark-surface" data-a11y-subcat="${escapeHtml(catKey)}">
      <div class="flex items-center gap-dsc-nano px-2.5 py-dsc-nano cursor-pointer select-none hover:bg-gray-50 dark:hover:bg-dark-line/20 transition-colors"
        onclick="toggleA11yCategoryAccordion('${uid}')">
        <div class="w-4.5 h-4.5 rounded-dsc-circ flex items-center justify-center shrink-0" style="background-color:${meta.fill}">
          <i data-lucide="${meta.icon}" class="w-2.5 h-2.5" style="color:${meta.textColor || meta.color}"></i>
        </div>
        <p class="flex-1 min-w-0 text-dsc-label-tiny normal-case tracking-normal font-bold text-slate-600 dark:text-dark-muted truncate">${escapeHtml(categoryLabel)} (${catSpecs.length})</p>
        <i data-lucide="chevron-down" id="chevron-${uid}" class="w-3.5 h-3.5 text-gray-400 transition-transform shrink-0" style="transform:${expand ? 'rotate(180deg)' : 'rotate(0deg)'}"></i>
      </div>
      <div id="body-${uid}" class="accordion-content ${expand ? '' : 'hidden'} border-t border-gray-100 dark:border-dark-line p-1.5 space-y-1.5">
        ${catSpecs.map(spec => _a11ySpecItemHtml(spec, false)).join('')}
      </div>
    </div>
  `;
}

// Mesmo padrão visual/estrutural de _a11yCategoryAccordionEl (header
// clicável com chevron + contador entre parênteses + corpo com
// accordion-content/hidden), com estado de expansão próprio em
// window._a11yExpandedUndocumentedIds. Some completamente da área quando não
// há pendência nenhuma (nada a mostrar).
window._a11yExpandedUndocumentedIds = window._a11yExpandedUndocumentedIds || new Set();

function toggleA11yUndocumentedAccordion(uid) {
  const body = document.getElementById(`undoc-body-${uid}`);
  const chevron = document.getElementById(`undoc-chevron-${uid}`);
  if (!body) return;
  const isHidden = body.classList.contains('hidden');
  body.classList.toggle('hidden', !isHidden);
  if (chevron) chevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
  if (isHidden) window._a11yExpandedUndocumentedIds.add(uid);
  else window._a11yExpandedUndocumentedIds.delete(uid);
}
window.toggleA11yUndocumentedAccordion = toggleA11yUndocumentedAccordion;

// Rótulo curto pro card de cada item pendente.
function _a11yUndocumentedItemLabel(kind, item) {
  if (kind === 'tokenReview') return 'Possível título sem token DSC';
  const match = item.dscComponentMatch;
  if (match.isUnmapped === true) return `Outro (${_cleanDscContainingFrameName(match.containingFrame)})`;
  const shortName = match.a11yCategory;
  if (shortName === 'titulo') return `Nível de Título (${(match.suggestedLevel || 'h1').toUpperCase()})`;
  if (shortName === 'decorativo') return 'Elemento Decorativo';
  if (shortName === 'estrutura') return `Estrutura da Página (${_cleanDscContainingFrameName(match.containingFrame)})`;
  return A11Y_COMPONENTE_LABELS[shortName] || _capitalizeFirst(shortName);
}

function _a11yUndocumentedItemHtml(areaId, entry) {
  const { kind, item } = entry;
  const label = _a11yUndocumentedItemLabel(kind, item);
  const name = item.layerName || item.name || 'Elemento';
  // Único destaque de aviso (fundo âmbar) que sobrevive nesta lista: "token
  // sem DSC vinculado" (kind === 'tokenReview'), o único caso em que a
  // detecção genuinamente não tem nada pra trabalhar. "Outro" (isUnmapped —
  // componente DSC real, mas sem categoria de a11y catalogada) e a antiga
  // distinção de confiança alta/baixa foram removidos deste destaque: com o
  // wizard sequencial, todo item passa por revisão humana individual de
  // qualquer forma, então a distinção de confiança virou ruído sem efeito
  // prático (decisão de produto, 2026-09-02).
  const isBaixa = kind === 'tokenReview';
  // encodeURIComponent pro item sobreviver dentro do atributo onclick (nomes
  // de camada podem ter aspas/caracteres especiais) — decodificado de volta
  // em openA11yFormFromUndocumented.
  const encodedItem = encodeURIComponent(JSON.stringify(item));
  return `
    <div class="flex items-center gap-dsc-nano px-2.5 py-dsc-nano rounded-dsc-medium border ${isBaixa ? 'bg-amber-50/60 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/40' : 'bg-gray-50 dark:bg-dark-bg border-gray-100 dark:border-dark-line'}">
      <i data-lucide="${kind === 'tokenReview' ? 'alert-circle' : 'circle-help'}" class="w-3.5 h-3.5 ${isBaixa ? 'text-amber-500' : 'text-slate-400'} shrink-0" aria-hidden="true"></i>
      <div class="flex-1 min-w-0">
        <p class="text-dsc-label-tiny normal-case tracking-normal font-semibold text-slate-700 dark:text-white truncate" title="${escapeHtml(name)}">${escapeHtml(name)}</p>
        <p class="text-dsc-label-tiny normal-case tracking-normal text-slate-400 dark:text-dark-muted truncate">${escapeHtml(label)}</p>
        ${item.immediateParentName ? `
        <!-- Contexto do pai imediato (2026-09-11, bug real reportado):
             designer confirmou um TEXT interno de um componente não
             reconhecido pensando ser o componente inteiro. Diferente do
             card de "componente pai reconhecido" (parentComponentMatch,
             usado em outro lugar), este é o nome cru do node pai na
             árvore — sempre disponível, mesmo sem match DSC. -->
        <p class="text-dsc-label-tiny normal-case tracking-normal text-slate-400 dark:text-dark-muted truncate italic" title="Este elemento está dentro de: ${escapeHtml(item.immediateParentName)}">
          dentro de: ${escapeHtml(item.immediateParentName)}
        </p>` : ''}
      </div>
      <button type="button" title="Focar no canvas" aria-label="Focar no canvas"
        onclick="focusNode('${item.nodeId}')"
        class="shrink-0 w-6 h-6 flex items-center justify-center rounded-dsc-small text-gray-400 hover:text-[#005ca9] transition-colors">
        <i data-lucide="crosshair" class="w-3.5 h-3.5" aria-hidden="true"></i>
      </button>
      <button type="button" title="Criar especificação" aria-label="Criar especificação de acessibilidade para ${escapeHtml(name)}"
        onclick="openA11yFormFromUndocumented('${areaId}', '${kind}', '${encodedItem}')"
        class="shrink-0 inline-flex items-center gap-dsc-quark h-7 px-2 rounded-dsc-circ bg-[#005ca9] text-white text-dsc-label-tiny normal-case tracking-normal font-bold hover:bg-blue-700 active:scale-95 transition-all">
        <i data-lucide="plus" class="w-3 h-3"></i> Criar spec
      </button>
    </div>
  `;
}

// Some da área inteira quando não há pendência (mesmo critério dos 4
// accordions de categoria — sem itens, sem accordion).
function _a11yUndocumentedAccordionEl(uid, areaId, entries) {
  if (!entries || entries.length === 0) return '';
  const expand = window._a11yExpandedUndocumentedIds.has(uid);
  const chevronStyle = expand ? 'rotate(180deg)' : 'rotate(0deg)';
  const bodyHiddenClass = expand ? '' : 'hidden';
  return `
    <div class="rounded-dsc-small border border-amber-200 dark:border-amber-800/40 overflow-hidden ml-1" data-a11y-subcat="nao-documentados">
      <div class="flex items-center gap-dsc-nano px-2 py-1.5 cursor-pointer select-none bg-amber-50/60 dark:bg-amber-900/10 hover:bg-amber-100/60 dark:hover:bg-amber-900/20 transition-colors"
        onclick="toggleA11yUndocumentedAccordion('${uid}')">
        <div class="w-4.5 h-4.5 rounded-dsc-circ flex items-center justify-center shrink-0 bg-amber-100 dark:bg-amber-900/30">
          <i data-lucide="circle-help" class="w-2.5 h-2.5 text-amber-600 dark:text-amber-400"></i>
        </div>
        <p class="flex-1 min-w-0 text-dsc-label-tiny normal-case tracking-normal font-bold text-amber-700 dark:text-amber-400 truncate">Não documentados (${entries.length})</p>
        <i data-lucide="chevron-down" id="undoc-chevron-${uid}" class="w-3.5 h-3.5 text-amber-500 transition-transform shrink-0" style="transform:${chevronStyle}"></i>
      </div>
      <div id="undoc-body-${uid}" class="accordion-content ${bodyHiddenClass} border-t border-amber-100 dark:border-amber-900/30 p-1.5 space-y-1.5">
        ${entries.map(entry => _a11yUndocumentedItemHtml(areaId, entry)).join('')}
      </div>
    </div>
  `;
}

// ── Tabs da workspace de uma Área (view-area-workspace) ─────────────────
// Ver bloco "Workspace de uma Área Marcada" acima (openA11yAreaWorkspace/
// _renderA11yWorkspaceTab) para o dispatcher que escolhe qual destas 5
// funções chamar.

// Tab "Tabulação" — reaproveita o CONTEÚDO de _tabOrderSectionHtml, mas sem
// o wrapper de accordion (a própria tab já cumpre esse papel; um accordion
// dentro de uma tab de conteúdo único seria redundante). Constrói o mesmo
// corpo inline em vez de chamar _tabOrderSectionHtml diretamente porque
// aquela função sempre embrulha num header clicável de accordion — mais
// simples reescrever o corpo aqui (poucos elementos) do que fatorar um
// terceiro parâmetro "sem wrapper" numa função já usada pelo card antigo.
function _a11yWorkspaceTabTabulacao(area) {
  // uid usa area.id (não area.originalIndex, 2026-09-11) — precisa ser
  // uma chave estável entre renders, ver comentário completo em
  // _a11yWorkspaceTabLeitorDeTela.
  const uid = `workspace-${area.id}`;
  const ulId = `tab-order-list-${uid}`;
  const areaIdAttr = area.id;
  // Mapeamento Automático some assim que já existe documentação MANUAL
  // nesta área (2026-09-04-x, pedido do usuário) — Manual sempre fica
  // disponível; o automático é só uma alternativa de partida, não faz
  // sentido oferecê-lo depois que o designer já começou a trilha manual
  // (evita a confusão de "gerar automaticamente" sobrepor/duplicar itens
  // já documentados à mão). Mesmo critério usado por
  // _renderTabOrderListForArea pra saber se a área já tem itens.
  const hasManualItems = typeof _currentTabOrderItems === 'function' && _currentTabOrderItems(area.id).length > 0;
  // "Atualizar" só aparece quando existe de fato uma renumeração pendente
  // pra empurrar pro canvas (2026-09-16, ajuste de escopo — o botão ficava
  // sempre visível mesmo sem nenhuma mudança, e clicar nesse estado só
  // mostrava o toast "A ordem já está atualizada no canvas", uma ação sem
  // efeito nenhum). Mesmo critério de comparação já usado dentro de
  // updateTabOrderNumbering (tab-order.js): compara `number` (ordem em
  // memória) com `canvasNumber` (último valor de fato desenhado) —
  // reordenar a lista (drag-and-drop) é o que desalinha os dois.
  const needsCanvasSync = hasManualItems && _currentTabOrderItems(area.id).some(it => it.id && it.number !== it.canvasNumber);
  // Ícone de hint compacto (2026-09-18) — usado SÓ no estado já documentado
  // (hasManualItems), ao lado dos botões de ação. Reabertura MANUAL da
  // modal completa (openA11yInstructionManually, nunca seta callback).
  // tooltip-bottom (correção 2026-09-18, bug real reportado com print: a
  // tooltip não aparecia) — "tooltip-top" não existe como classe no CSS
  // (só tooltip-left/tooltip-right/tooltip-bottom existem, ver plugin.css);
  // mesmo se existisse, o padrão default já desenha ACIMA do elemento, e
  // este botão vive perto do TOPO da área com scroll da workspace
  // (#a11y-workspace-scroll-container, overflow-y-auto) — a tooltip nascia
  // cortada pelo próprio scroll container. tooltip-bottom é o padrão já
  // usado (2026-09-15) exatamente para "controles que vivem no topo da
  // janela do plugin".
  const tabulacaoHintIconBtn = `
    <button type="button" onclick="openA11yInstructionManually('tabulacao')"
      data-tooltip="Instruções sobre esta documentação" aria-label="Instruções sobre esta documentação"
      class="tooltip-bottom tooltip-right shrink-0 w-9 h-9 flex items-center justify-center rounded-dsc-large border border-gray-200 dark:border-dark-line text-slate-500 dark:text-dark-muted hover:bg-slate-50 dark:hover:bg-dark-line/40 active:scale-[0.99] transition-all">
      <i data-lucide="circle-help" class="w-3.5 h-3.5" aria-hidden="true"></i>
    </button>`;
  return `
    <div class="space-y-2 flex flex-col flex-1">
      ${hasManualItems ? '' : `
      <!-- Alert com botão embutido (2026-09-18, pedido do usuário: trocar
           o botão-link "Instruções sobre esta documentação" por um alerta
           mais chamativo) — SÓ no estado VAZIO (sem nada documentado); o
           estado já documentado continua com o ícone de hint compacto
           (tabulacaoHintIconBtn, ao lado do botão de ação), sem mudança.
           Fica FIXO no topo — o botão "Iniciar" abaixo desce pro CENTRO
           VERTICAL do espaço vazio da aba, mesmo princípio visual do
           empty-state "Nenhuma tela selecionada" da Home/lista de telas
           (#a11y-select-frame-btn em home.html). -->
      <div class="flex items-center gap-dsc-nano px-dsc-micro py-dsc-nano rounded-dsc-medium bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30">
        <i data-lucide="info" class="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0" aria-hidden="true"></i>
        <p class="flex-1 min-w-0 text-dsc-label-tiny normal-case tracking-normal text-blue-700 dark:text-blue-400">Antes de começar, veja como documentar corretamente.</p>
        <button type="button" onclick="openA11yInstructionManually('tabulacao')"
          class="shrink-0 text-dsc-label-tiny normal-case tracking-normal font-bold text-blue-700 dark:text-blue-400 underline hover:no-underline">
          Ver instruções
        </button>
      </div>`}
      ${hasManualItems ? `
      <div class="flex items-center gap-dsc-nano">
        <!-- Área já documentada (manual ou Mapeamento Automático,
             2026-09-04-aj, pedido do usuário): não faz sentido "Iniciar"
             de novo (recriaria a cópia do zero) — o botão vira "Adicionar
             itens", que abre o modal já populado com a ordem existente e
             arma a captura de novo(s) elemento(s), reaproveitando a MESMA
             cópia clonada (nenhum selo já desenhado é tocado). -->
        ${tabulacaoHintIconBtn}
        <button type="button" onclick="startTabOrderAddItemsFromCard('${escapeHtml(areaIdAttr)}')"
          class="flex-1 min-w-0 flex items-center justify-center gap-dsc-nano h-9 rounded-dsc-large text-dsc-label-tiny normal-case tracking-normal font-bold transition-all bg-[#005ca9] text-white hover:bg-blue-700 active:scale-[0.99] shadow-sm shadow-blue-500/20">
          <i data-lucide="plus" class="w-3.5 h-3.5 shrink-0" aria-hidden="true"></i>
          <span class="truncate">Adicionar itens</span>
        </button>
        <button type="button" onclick="deleteAllTabOrderForArea('${escapeHtml(areaIdAttr)}')"
          data-tooltip="Apagar todos os selos desta tela e recomeçar a ordem do zero" aria-label="Apagar toda a ordem de tabulação desta tela"
          class="tooltip-bottom tooltip-left shrink-0 w-9 h-9 flex items-center justify-center rounded-dsc-large border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 active:scale-[0.99] transition-all">
          <i data-lucide="trash-2" class="w-3.5 h-3.5" aria-hidden="true"></i>
        </button>
      </div>` : `
      <!-- Estado VAZIO (2026-09-18, reestruturado) — coluna centralizada
           no espaço restante da aba: texto explicativo ACIMA do botão
           (mesmo texto/posição adotados nas 3 abas, adequado ao domínio de
           cada uma — ver equivalentes em Swipe/Leitor de Tela), botão
           "Criar ordem de tabulação" (renomeado de "Iniciar Ordem de
           Tabulação" — nomenclatura unificada nas 3 abas: Criar ordem de
           tabulação / Criar ordem de leitura / Criar especificações), e
           "Mapeamento Automático" com respiro próprio abaixo (antes vinha
           colado, mt-0.5, e com o prefixo "ou usar" — removido). -->
      <div class="flex-1 flex flex-col items-center justify-center gap-2">
        <p class="text-dsc-label-tiny normal-case tracking-normal text-slate-400 dark:text-dark-muted text-center">Nenhuma ordem de tabulação nesta tela ainda. Use o botão abaixo.</p>
        <button type="button" onclick="openA11yInstructionThenStart('tabulacao', '${escapeHtml(areaIdAttr)}', '${escapeHtml(area.targetNodeId || '')}')"
          class="flex items-center justify-center gap-dsc-nano h-9 px-5 rounded-dsc-large text-dsc-label-tiny normal-case tracking-normal font-bold transition-all bg-[#005ca9] text-white hover:bg-blue-700 active:scale-[0.99] shadow-sm shadow-blue-500/20">
          <i data-lucide="list-ordered" class="w-3.5 h-3.5" aria-hidden="true"></i>
          Criar ordem de tabulação
        </button>
        ${A11Y_AUTO_MAPPING_HIDDEN_TABULACAO ? '' : `
        <button type="button" onclick="_confirmGenerateTabOrderFromLayers('${escapeHtml(areaIdAttr)}', '${escapeHtml(area.targetNodeId || '')}')"
          class="mt-1 flex items-center justify-center gap-1.5 h-7 px-3 rounded-dsc-small text-dsc-label-tiny normal-case tracking-normal font-bold text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 active:scale-[0.99] transition-all">
          <i data-lucide="sparkles" class="w-3.5 h-3.5" aria-hidden="true"></i>
          Mapeamento Automático
        </button>`}
      </div>`}
      <ul id="${ulId}" class="flex flex-col gap-1.5 min-h-[10px] min-w-0"></ul>
      ${hasManualItems ? `
      <div class="flex items-center gap-1.5 mt-1">
        <button type="button" id="tab-order-narration-btn-${uid}" onclick="toggleTabOrderNarration('${escapeHtml(areaIdAttr)}', '${escapeHtml(uid)}')"
          class="flex-1 min-w-0 flex items-center justify-center gap-dsc-nano h-8 rounded-dsc-large text-dsc-label-tiny normal-case tracking-normal font-bold bg-white dark:bg-dark-surface text-slate-600 dark:text-dark-muted shadow-sm hover:shadow transition-all">
          <i data-lucide="play" class="w-3.5 h-3.5 shrink-0" aria-hidden="true"></i>
          <span class="truncate">Simular leitura</span>
        </button>
        <!-- Idioma da voz da simulação (pedido do usuário, 2026-09-09) — só
             muda a pronúncia/idioma da síntese e o rótulo do tipo narrado
             (A11Y_NARRATION_TYPE_LABELS vs. _EN); o nome do elemento nunca
             muda, sempre vem como está gravado no Figma. Lido ao clicar em
             "Simular leitura" (toggleTabOrderNarration), não reage sozinho.
             dsc-select (2026-09-24, substitui o pr-8 manual de 2026-09-14
             — ver plugin.css): a correção anterior só aumentava o padding
             sem tratar a causa raiz (chevron nativo do SO, fora de
             controle do CSS); dsc-select resolve isso globalmente
             (appearance:none + chevron SVG próprio) e também padroniza o
             radius (rounded-dsc-medium em vez de -large, pedido do
             usuário: "corrija o border radius dos selects... em todo o
             plugin", sem exceção). -->
        <select id="tab-order-narration-lang-${uid}" title="Idioma da narração" aria-label="Idioma da narração"
          class="dsc-select shrink-0 h-8 pl-2.5 rounded-dsc-medium text-dsc-label-tiny normal-case tracking-normal font-bold bg-white dark:bg-dark-surface text-slate-600 dark:text-dark-muted shadow-sm hover:shadow transition-all border-0 cursor-pointer">
          <option value="pt" selected>PT</option>
          <option value="en">EN</option>
        </select>
        <!-- Velocidade da narração (2026-09-11, pedido do usuário) —
             multiplicador aplicado em utterance.rate na Web Speech API.
             Lido no mesmo momento do idioma (toggleTabOrderNarration), e
             relido a cada item narrado pra que mudar a velocidade no meio
             da simulação valha já no próximo item, sem reiniciar. -->
        <select id="tab-order-narration-rate-${uid}" title="Velocidade da narração" aria-label="Velocidade da narração"
          class="dsc-select shrink-0 h-8 pl-2.5 rounded-dsc-medium text-dsc-label-tiny normal-case tracking-normal font-bold bg-white dark:bg-dark-surface text-slate-600 dark:text-dark-muted shadow-sm hover:shadow transition-all border-0 cursor-pointer">
          <option value="1">1x</option>
          <option value="1.5" selected>1.5x</option>
          <option value="2">2x</option>
          <option value="2.5">2.5x</option>
        </select>
      </div>` : ''}
      ${hasManualItems ? `
      <!-- "Atualizar" (2026-09-16, ajuste de escopo): antes ficava sempre
           habilitado mesmo sem nenhuma renumeração pendente — clicar nesse
           estado só mostrava o toast "A ordem já está atualizada no
           canvas", uma ação sem efeito nenhum. Agora nasce desabilitado
           quando needsCanvasSync é false. Reordenar (drag-and-drop,
           _tabOrderDrop) e apagar um item (deleteTabOrderItem) não
           re-renderizam a tab inteira (só o <ul> escopado, ver
           _renderTabOrderListForArea) — _tabOrderSyncUpdateButton
           (tab-order.js) reavalia e reativa/desativa este botão pelo id
           logo depois de cada uma dessas duas ações, sem precisar de um
           re-render pesado da tab inteira. -->
      <button type="button" id="tab-order-update-btn-${uid}" onclick="updateTabOrderNumbering('${escapeHtml(areaIdAttr)}')" ${needsCanvasSync ? '' : 'disabled'}
        class="w-full flex items-center justify-center gap-dsc-nano h-8 mt-1 rounded-dsc-large text-dsc-label-tiny normal-case tracking-normal font-bold bg-white dark:bg-dark-surface text-slate-600 dark:text-dark-muted shadow-sm hover:shadow transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-sm">
        <i data-lucide="refresh-cw" class="w-3.5 h-3.5" aria-hidden="true"></i>
        Atualizar
      </button>` : ''}
      ${typeof _fichaInsertButtonHtml === 'function' ? _fichaInsertButtonHtml(area, 'tabulacao', hasManualItems) : ''}
    </div>
  `;
}

// Tab "Swipe" — 3ª REFORMULAÇÃO (2026-09-04): deixou de ser uma conexão
// reta entre EXATAMENTE 2 Áreas Marcadas escolhidas por dropdown (v2,
// removida por completo — imagem de referência real do usuário mostrou uma
// trilha ziguezagueante com MUITOS pontos) e passou a ser uma TRILHA
// DIRECIONAL DE N PONTOS, capturados por clique sequencial no canvas OU
// seleção múltipla de uma vez — mesmo modelo em lote já usado por Ordem de
// Tabulação, e nada é desenhado até "Criar trilha de swipe". CLONA o
// frame da Área ao iniciar (2026-09-04-ac, correção real: a linha nunca
// pode ser desenhada sobre o design original) — os pontos ficam
// restritos ao conteúdo da cópia, mesma regra de Ordem de Tabulação
// (perdeu a liberdade anterior de "qualquer nó da tela", que só fazia
// sentido operando sobre nós reais). Exclusivamente mobile — em projetos
// web mostra só o aviso, sem registrar nenhum handler de clique. Sem
// "Mapeamento Automático" nesta entrega (fora de escopo, ver plano).
function _a11yWorkspaceTabSwipe(area) {
  if (!isA11yMobileProject()) {
    return `
      <div class="space-y-2">
        <div class="flex flex-col items-center justify-center py-8 text-center">
          <i data-lucide="smartphone" class="w-8 h-8 text-slate-200 dark:text-slate-700 mb-2" style="opacity:0.5" aria-hidden="true"></i>
          <p class="text-dsc-label-tiny normal-case tracking-normal font-semibold text-slate-500 dark:text-dark-muted">Disponível apenas para projetos mobile</p>
          <p class="text-dsc-label-tiny normal-case tracking-normal text-slate-400 dark:text-dark-muted mt-1 px-6">Trilha de Ordem de Leitura documenta a navegação por gesto de deslizar, exclusiva do leitor de tela mobile.</p>
        </div>
      </div>
    `;
  }

  const existingPath = (hacData.a11ySwipePaths || []).find(p => p && p.areaId === area.id) || null;
  const pointCount = existingPath && Array.isArray(existingPath.points) ? existingPath.points.length : 0;
  const areaIdAttr = area.id;
  const targetNodeIdAttr = area.targetNodeId || '';

  // Ícone de hint (2026-09-18, pedido do usuário — substitui o antigo botão
  // largo "Instruções sobre esta documentação" que ficava sempre no topo,
  // mesmo padrão de tabulacaoHintIconBtn em _a11yWorkspaceTabTabulacao):
  // reabertura MANUAL da modal completa (openA11yInstructionManually, nunca
  // seta callback). Usado SÓ no estado com trilha já existente
  // (existingPath), ao lado do botão "Refazer trilha" — no estado vazio o
  // layout ORIGINAL volta (barra larga no topo, ver abaixo).
  // tooltip-bottom (correção 2026-09-18, ver comentário completo em
  // tabulacaoHintIconBtn) — "tooltip-top" não existe no CSS e, mesmo o
  // default (acima) existisse, seria cortado pelo scroll container do topo
  // da workspace.
  const swipeHintIconBtn = `
    <button type="button" onclick="openA11yInstructionManually('swipe')"
      data-tooltip="Instruções sobre esta documentação" aria-label="Instruções sobre esta documentação"
      class="tooltip-bottom tooltip-right shrink-0 w-9 h-9 flex items-center justify-center rounded-dsc-large border border-gray-200 dark:border-dark-line text-slate-500 dark:text-dark-muted hover:bg-slate-50 dark:hover:bg-dark-line/40 active:scale-[0.99] transition-all">
      <i data-lucide="circle-help" class="w-3.5 h-3.5" aria-hidden="true"></i>
    </button>`;
  return `
    <div class="space-y-2 flex flex-col flex-1">
      ${existingPath ? `
      <!-- Linha do topo reestruturada (2026-09-21, pedido do usuário,
           mesma estrutura de tabulacaoHintIconBtn): Hint → Adicionar ponto
           → Remover trilha (só ícone). Substitui os antigos "Refazer
           trilha de ordem de leitura" (botão largo, removido por
           completo) e "Remover trilha" (antes um botão largo com texto
           embaixo da lista, agora só o ícone aqui). -->
      <div class="flex items-center gap-dsc-nano">
        ${swipeHintIconBtn}
        <button type="button" onclick="openSwipePathEditMode('${escapeHtml(areaIdAttr)}', '${escapeHtml(targetNodeIdAttr)}')"
          class="flex-1 min-w-0 flex items-center justify-center gap-dsc-nano h-9 rounded-dsc-large text-dsc-label-tiny normal-case tracking-normal font-bold transition-all bg-[#005ca9] text-white hover:bg-blue-700 active:scale-[0.99] shadow-sm shadow-blue-500/20">
          <i data-lucide="plus" class="w-3.5 h-3.5 shrink-0" aria-hidden="true"></i>
          <span class="truncate">Adicionar ponto</span>
        </button>
        <button type="button" onclick="deleteSwipePathForArea('${escapeHtml(areaIdAttr)}')"
          data-tooltip="Remover trilha de swipe desta tela" aria-label="Remover trilha de swipe desta tela"
          class="tooltip-bottom tooltip-left shrink-0 w-9 h-9 flex items-center justify-center rounded-dsc-large border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 active:scale-[0.99] transition-all">
          <i data-lucide="trash-2" class="w-3.5 h-3.5" aria-hidden="true"></i>
        </button>
      </div>
      <div class="flex items-center gap-dsc-nano px-dsc-micro py-dsc-nano rounded-dsc-medium bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30">
        <i data-lucide="route" class="w-3.5 h-3.5 text-blue-700 dark:text-blue-400 shrink-0" aria-hidden="true"></i>
        <span class="text-dsc-label-tiny normal-case tracking-normal font-semibold text-blue-700 dark:text-blue-400">Trilha de Ordem de Leitura (${pointCount} ${pointCount === 1 ? 'ponto' : 'pontos'})</span>
      </div>
      <!-- Lista editável dos pontos já salvos, direto na aba (2026-09-11,
           paridade pedida pelo usuário com a aba Tabulação — inicialmente
           tinha ficado só leitura, depois o usuário confirmou que quer
           arrastar/remover aqui também, igual Tabulação). Reaproveita 100%
           o mesmo estado/mecânica do modal "Editar pontos"
           (window._swipePathPendingList, _swipePathPendingDragStart/Drop,
           deleteSwipePathPendingItem) — populado ao renderizar a aba via
           _renderSwipePathTabList (swipe-path.js), que por baixo já é
           openSwipePathEditMode sem abrir modal. Cada mudança (arrastar OU
           remover) dispara applySwipePathToCanvas() automaticamente — não
           há botão "Salvar" aqui: como cada ponto não tem selo próprio no
           canvas (só a trilha inteira tem um grupo), toda edição já
           implica redesenhar a trilha do zero mesmo, então não faz
           sentido represar mudanças pendentes sem persistir. -->
      <ul id="a11y-swipe-path-tab-list" class="flex flex-col gap-1.5 min-h-[10px] min-w-0"></ul>` : `
      <!-- Alert com botão embutido (2026-09-18) — mesmo padrão de
           tabulacaoHintIconBtn/o bloco correspondente em
           _a11yWorkspaceTabTabulacao; SÓ no estado VAZIO (sem trilha ainda).
           Com trilha já existente, continua o ícone de hint compacto
           (swipeHintIconBtn), sem mudança. -->
      <div class="flex items-center gap-dsc-nano px-dsc-micro py-dsc-nano rounded-dsc-medium bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30">
        <i data-lucide="info" class="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0" aria-hidden="true"></i>
        <p class="flex-1 min-w-0 text-dsc-label-tiny normal-case tracking-normal text-blue-700 dark:text-blue-400">Antes de começar, veja como documentar corretamente.</p>
        <button type="button" onclick="openA11yInstructionManually('swipe')"
          class="shrink-0 text-dsc-label-tiny normal-case tracking-normal font-bold text-blue-700 dark:text-blue-400 underline hover:no-underline">
          Ver instruções
        </button>
      </div>`}
      ${existingPath ? '' : `
      <!-- Estado VAZIO (2026-09-18, reestruturado) — coluna centralizada no
           CENTRO VERTICAL do espaço restante da aba (hint fica fixo no
           topo, ver acima): texto explicativo ACIMA do botão (mesmo
           padrão de Tabulação/Leitor de Tela, adequado ao domínio desta
           aba), botão "Criar ordem de leitura" (renomeado de "Iniciar
           trilha de swipe"/"route" — ícone trocado pra move-horizontal,
           mesmo ícone da aba na barra de tabs, pedido do usuário), e
           "Mapeamento Automático" com respiro próprio abaixo (2026-09-16,
           perdido sem querer no revert b228343, reimplementado 2026-09-18
           — faz um SCAN PRÓPRIO via _confirmGenerateSwipePathFromLayers,
           reaproveitando _a11yScanArea; diferente do antigo
           startSwipePathFromTabOrder, que só reutilizava a Ordem de
           Tabulação já mapeada — ver comentário completo em swipe-path.js).
           "ou usar" removido do texto (mesma correção de Tabulação/Leitor
           de Tela). -->
      <div class="flex-1 flex flex-col items-center justify-center gap-2">
        <p class="text-dsc-label-tiny normal-case tracking-normal text-slate-400 dark:text-dark-muted text-center">Nenhuma trilha de swipe nesta tela ainda. Use o botão abaixo.</p>
        <button type="button" onclick="openA11yInstructionThenStart('swipe', '${escapeHtml(areaIdAttr)}', '${escapeHtml(targetNodeIdAttr)}')"
          class="flex items-center justify-center gap-dsc-nano h-9 px-5 rounded-dsc-large text-dsc-label-tiny normal-case tracking-normal font-bold transition-all bg-[#005ca9] text-white hover:bg-blue-700 active:scale-[0.99] shadow-sm shadow-blue-500/20">
          <i data-lucide="move-horizontal" class="w-3.5 h-3.5" aria-hidden="true"></i>
          Criar ordem de leitura
        </button>
        ${A11Y_AUTO_MAPPING_HIDDEN_SWIPE ? '' : `
        <button type="button" onclick="_confirmGenerateSwipePathFromLayers('${escapeHtml(areaIdAttr)}', '${escapeHtml(targetNodeIdAttr)}')"
          class="mt-1 flex items-center justify-center gap-1.5 h-7 px-3 rounded-dsc-small text-dsc-label-tiny normal-case tracking-normal font-bold text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 active:scale-[0.99] transition-all">
          <i data-lucide="sparkles" class="w-3.5 h-3.5" aria-hidden="true"></i>
          Mapeamento Automático
        </button>`}
      </div>`}
      ${typeof _fichaInsertButtonHtml === 'function' ? _fichaInsertButtonHtml(area, 'swipe', !!existingPath) : ''}
    </div>
  `;
}

// Tab "Leitor de Tela" — a aba de TRABALHO real (2026-09-04-b: reafirmado
// pelo usuário que Leitor de Tela é a etapa de criação de specs — antes
// disso, na primeira versão da workspace, esse papel estava em "Handoff").
// Reaproveita _a11yCategoryAccordionEl (iterando A11Y_CATEGORIES) e
// _a11yUndocumentedAccordionEl tal como funcionavam dentro do antigo
// accordion de área — criar/editar/excluir spec continua 100% igual, só
// migrado de contêiner. Se chegou aqui via focusSpecId (vindo do botão
// "Editar" do dashboard da tab Handoff), expande automaticamente o
// sub-accordion da categoria correspondente.
function _a11yWorkspaceTabLeitorDeTela(area, areaSpecs) {
  // Bug real corrigido (2026-09-11, comportamento intermitente reportado
  // pelo usuário — "às vezes as ações não aparecem"): uid usava
  // area.originalIndex, uma posição de array recalculada a cada render
  // (renderA11yGroupedList/_renderA11yWorkspaceTab), em vez de area.id
  // (identidade estável da área). window._a11yExpandedCategoryIds/
  // _a11ySeenCategoryIds são chaveados por `${uid}-cat-${catKey}` — se a
  // resposta assíncrona de layer-order-resolved (que dispara um segundo
  // render para reordenar por camada real) chegasse depois de qualquer
  // mudança na ordenação relativa de a11yAreas, o originalIndex da MESMA
  // área mudava entre o primeiro e o segundo render, gerando um uid
  // diferente — o accordion recém-renderizado nascia com uid novo,
  // encontrava _a11yExpandedCategoryIds vazio pra essa chave (o registro
  // antigo ficava órfão) e fechava sozinho, escondendo as ações de cada
  // item mesmo o usuário tendo acabado de abri-lo. area.id nunca muda.
  const uid = `workspace-${area.id}`;
  const undocumentedEntries = _collectA11yUndocumentedForArea(area.id);

  const focusSpecId = window._a11yWorkspaceFocusSpecId;
  let focusCatKey = null;
  if (focusSpecId) {
    const focusSpec = areaSpecs.find(s => s.id === focusSpecId);
    if (focusSpec) focusCatKey = focusSpec.a11yType;
  }

  const categoryHtml = Object.keys(A11Y_CATEGORIES)
    .map(catKey => ({ catKey, catSpecs: areaSpecs.filter(s => s.a11yType === catKey) }))
    .filter(({ catSpecs }) => catSpecs.length > 0)
    .map(({ catKey, catSpecs }) => {
      const catUid = `${uid}-cat-${catKey}`;
      // Sub-accordions de categoria nascem ABERTOS por padrão (2026-09-10,
      // pedido do usuário com print — antes só a categoria em foco, vinda
      // de "Editar", nascia expandida; as demais precisavam de clique
      // manual). Marca em window._a11ySeenCategoryIds (Set à parte, só
      // "já apareceu pelo menos uma vez") na PRIMEIRA vez que o
      // catUid é renderizado, e só então adiciona ao Set de expansão real
      // (window._a11yExpandedCategoryIds) — sem isso, forçar .add() direto
      // no Set de expansão a cada render reabriria uma categoria que o
      // designer tenha recolhido manualmente (toggleA11yCategoryAccordion
      // só mexe no DOM, não bloqueia um próximo render de mexer no Set de
      // novo). Com o Set à parte, o estado "aberto por padrão" só vale na
      // primeira aparição — depois disso, a escolha manual do designer
      // (aberto ou fechado) é respeitada em todo re-render seguinte.
      window._a11ySeenCategoryIds = window._a11ySeenCategoryIds || new Set();
      if (!window._a11ySeenCategoryIds.has(catUid)) {
        window._a11ySeenCategoryIds.add(catUid);
        window._a11yExpandedCategoryIds.add(catUid);
      }
      if (catKey === focusCatKey) window._a11yExpandedCategoryIds.add(catUid);
      return _a11yCategoryAccordionEl(catUid, catKey, catSpecs);
    })
    .join('');

  // focusSpecId só serve pra ESTA renderização — consome e limpa.
  window._a11yWorkspaceFocusSpecId = null;

  // Mapeamento Automático some assim que já existe documentação MANUAL
  // nesta área (2026-09-04-x, pedido do usuário, mesmo critério aplicado
  // à tab Tabulação) — Manual ("Nova spec") sempre fica disponível.
  const hasManualSpecs = areaSpecs.length > 0;
  return `
    <div class="space-y-2 flex flex-col flex-1">
      <!-- Botão de instruções (2026-09-16-c, pedido do usuário: "clicar no
           campos de instruções da documentação do leitor de tela (inclusive
           está sem o botão)") — mesmo padrão visual/estrutural do botão
           "Instruções sobre esta documentação" já existente em
           _a11yWorkspaceTabTabulacao/_a11yWorkspaceTabSwipe. Chama
           openA11yInstructionManually('leitorTela') (tab-order.js) — NUNCA
           openA11yCategoryPickerModal/openA11yInstructionThenStart: esta
           reabertura é puramente informativa e não pode setar
           window._pendingA11yInstructionConfirm, senão "Entendi, começar
           seleção" reiniciaria o picker de categoria/a réplica de trabalho
           sem o designer ter pedido isso. Passou a existir porque a modal
           de instrução deixou de abrir sozinha em toda "+ Nova spec"
           (ver openA11yCategoryPickerModal acima, flag
           hacData.a11yLeitorInstructionSeen) — sem este botão, depois da
           1ª vez não haveria como revê-la. -->
      ${hasManualSpecs ? '' : `
      <!-- Alert com botão embutido (2026-09-18) — mesmo padrão das outras
           2 abas; SÓ no estado VAZIO (sem specs ainda). Com specs já
           existentes, continua o ícone de hint compacto ao lado de "Nova
           spec", sem mudança. -->
      <div class="flex items-center gap-dsc-nano px-dsc-micro py-dsc-nano rounded-dsc-medium bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30">
        <i data-lucide="info" class="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0" aria-hidden="true"></i>
        <p class="flex-1 min-w-0 text-dsc-label-tiny normal-case tracking-normal text-blue-700 dark:text-blue-400">Antes de começar, veja como documentar corretamente.</p>
        <button type="button" onclick="openA11yInstructionManually('leitorTela')"
          class="shrink-0 text-dsc-label-tiny normal-case tracking-normal font-bold text-blue-700 dark:text-blue-400 underline hover:no-underline">
          Ver instruções
        </button>
      </div>`}
      <!-- Botão primário no mesmo padrão visual de "Iniciar Ordem de
           Tabulação"/"Iniciar trilha de swipe" (2026-09-04-x, pedido do
           usuário) — antes era um pill pequeno ao lado do texto
           descritivo, inconsistente com as outras 2 tabs. Estrutura de hint
           igual às outras 2 abas (2026-09-18): barra larga no topo só no
           estado vazio (acima); com specs já existentes, vira ícone
           compacto na mesma linha deste botão, mesmo padrão de
           tabulacaoHintIconBtn/swipeHintIconBtn. -->
      ${hasManualSpecs ? `
      <div class="flex items-center gap-dsc-nano">
        <button type="button" onclick="openA11yInstructionManually('leitorTela')"
          data-tooltip="Instruções sobre esta documentação" aria-label="Instruções sobre esta documentação"
          class="tooltip-bottom tooltip-right shrink-0 w-9 h-9 flex items-center justify-center rounded-dsc-large border border-gray-200 dark:border-dark-line text-slate-500 dark:text-dark-muted hover:bg-slate-50 dark:hover:bg-dark-line/40 active:scale-[0.99] transition-all">
          <i data-lucide="circle-help" class="w-3.5 h-3.5" aria-hidden="true"></i>
        </button>
        <button type="button" onclick="openA11yCategoryPickerModal('${area.id}')"
          class="flex-1 min-w-0 flex items-center justify-center gap-dsc-nano h-9 rounded-dsc-large text-dsc-label-tiny normal-case tracking-normal font-bold transition-all bg-[#005ca9] text-white hover:bg-blue-700 active:scale-[0.99] shadow-sm shadow-blue-500/20">
          <i data-lucide="plus" class="w-3.5 h-3.5 shrink-0" aria-hidden="true"></i>
          <span class="truncate">Nova spec</span>
        </button>
        <!-- Excluir todas as especificações (2026-09-24, pedido do usuário:
             "todas as outras abas têm o ícone da lixeira pra excluir tudo,
             no leitor de tela temos apenas a exclusão por item") — mesmo
             padrão visual/posição do botão equivalente em Tabulação
             (deleteAllTabOrderForArea) e Swipe (deleteSwipePathForArea). -->
        <button type="button" onclick="deleteAllA11ySpecsForArea('${escapeHtml(area.id)}')"
          data-tooltip="Excluir todas as especificações de Leitor de Tela desta tela" aria-label="Excluir todas as especificações de Leitor de Tela desta tela"
          class="tooltip-bottom tooltip-left shrink-0 w-9 h-9 flex items-center justify-center rounded-dsc-large border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 active:scale-[0.99] transition-all">
          <i data-lucide="trash-2" class="w-3.5 h-3.5" aria-hidden="true"></i>
        </button>
      </div>` : `
      <!-- Estado VAZIO (2026-09-18, reestruturado) — coluna centralizada
           no CENTRO VERTICAL do espaço restante da aba (hint fica fixo no
           topo, ver acima): texto explicativo ACIMA do botão (mesmo texto
           que antes vivia solto lá embaixo, dentro da lista de resultados
           — removido de lá, ver div.space-y-2 mais abaixo, pra não
           duplicar a mesma informação em 2 lugares), botão "Criar
           especificações" (renomeado de "Nova spec" — "+ Nova spec" é o
           rótulo certo pro estado JÁ documentado/recolhido, não pra
           partida inicial, mesma nomenclatura unificada das 3 abas: Criar
           ordem de tabulação / Criar ordem de leitura / Criar
           especificações), e "Mapeamento Automático" com respiro próprio
           abaixo ("ou usar" removido do texto, 2026-09-04-g). -->
      <div class="flex-1 flex flex-col items-center justify-center gap-2">
        <p class="text-dsc-label-tiny normal-case tracking-normal text-slate-400 dark:text-dark-muted text-center">Nenhuma especificação nesta tela ainda. Use o botão abaixo.</p>
        <button type="button" onclick="openA11yCategoryPickerModal('${area.id}')"
          class="flex items-center justify-center gap-dsc-nano h-9 px-5 rounded-dsc-large text-dsc-label-tiny normal-case tracking-normal font-bold transition-all bg-[#005ca9] text-white hover:bg-blue-700 active:scale-[0.99] shadow-sm shadow-blue-500/20">
          <i data-lucide="plus" class="w-3.5 h-3.5" aria-hidden="true"></i>
          Criar especificações
        </button>
        ${A11Y_AUTO_MAPPING_HIDDEN_LEITOR ? '' : `
        <button type="button" onclick="_startA11yMappingFromLeitorTab('${escapeHtml(area.id)}')"
          class="mt-1 flex items-center justify-center gap-1.5 h-7 px-3 rounded-dsc-small text-dsc-label-tiny normal-case tracking-normal font-bold text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 active:scale-[0.99] transition-all">
          <i data-lucide="radar" class="w-3.5 h-3.5" aria-hidden="true"></i>
          Mapeamento Automático
        </button>`}
      </div>`}
      ${(areaSpecs.length > 0 || undocumentedEntries.length > 0) ? `
      <div class="flex items-center justify-end gap-dsc-quark px-0.5 -mb-0.5">
        <button type="button" onclick="_a11ySetAllSubaccordions(this, true)"
          class="text-dsc-label-tiny normal-case tracking-normal font-bold text-blue-700 dark:text-blue-400 hover:underline px-1">Expandir todos</button>
        <span class="text-dsc-label-tiny normal-case tracking-normal text-gray-300 dark:text-dark-line">·</span>
        <button type="button" onclick="_a11ySetAllSubaccordions(this, false)"
          class="text-dsc-label-tiny normal-case tracking-normal font-bold text-slate-500 dark:text-dark-muted hover:underline px-1">Recolher todos</button>
      </div>` : ''}
      <div class="space-y-2">
        <!-- Mensagem de "nenhuma especificação" migrou pro bloco centralizado
             do estado vazio, acima (2026-09-18) — não duplicar aqui: quando
             hasManualSpecs é false, areaSpecs também é sempre [] (mesmo
             critério), então este ramo nunca precisou de texto próprio. -->
        ${areaSpecs.length > 0 ? categoryHtml : ''}
        ${_a11yUndocumentedAccordionEl(`${uid}-undoc`, area.id, undocumentedEntries)}
      </div>
      ${typeof _fichaInsertButtonHtml === 'function' ? _fichaInsertButtonHtml(area, 'leitor', hasManualSpecs) : ''}
    </div>
  `;
}

// Tab "Handoff" — DASHBOARD de consolidação (2026-09-04-b: deixou de ser a
// aba de trabalho — isso agora é "Leitor de Tela" — e a antiga "Resumo do
// handoff" foi removida como 5ª tab, seu papel foi absorvido aqui).
// 2026-09-04-c: o botão único "Gerar handoff" (placeholder) saiu — a
// geração REAL da Ficha de Handoff agora é incremental, por seção, um
// botão em cada uma das outras 3 tabs (ver handoff-ficha.js). Este
// dashboard é só STATUS + link: 3 cards (um por seção, via
// _fichaDashboardHtml) — SEM listar as specs em si (2026-09-10, pedido
// explícito do usuário com print: a lista detalhada de especificações por
// elemento pertence só à aba Leitor de Tela, que já é a aba de trabalho
// dessas specs; repeti-la aqui duplicava informação e confundia o que cada
// aba mostra). areaSpecs continua recebido só porque outros chamadores desta
// função ainda passam esse argumento — não usado mais neste corpo.
function _a11yWorkspaceTabHandoffDashboard(area, areaSpecs) {
  // "Ver handoff no canvas" (2026-09-24, pedido do usuário: "pode ser um
  // botão mais discreto ao lado do gerar handoff. pode ser um ícone de
  // focus com o tooltip") — deixou de ser um 2º botão largo, empilhado
  // abaixo de "Gerar Handoff" (ver _fichaDashboardHtml, handoff-ficha.js,
  // onde vivia antes) e virou um ícone compacto NA MESMA LINHA, ao lado
  // dele. Só aparece quando já existe algo inserido no canvas
  // (area.handoffFicha.frameId) — mesma condição de sempre, só reposicionada
  // aqui porque "Gerar Handoff" (que sempre existe) é quem define a linha.
  const hasAnyInserted = !!(area.handoffFicha && area.handoffFicha.frameId);
  return `
    <div class="space-y-4">
      <div>
        <p class="text-dsc-label-tiny normal-case tracking-normal text-slate-500 dark:text-dark-muted mb-2">Status do Handoff de Acessibilidade desta tela, reunindo o que já foi inserido de cada etapa.</p>
        <!-- "Gerar handoff completo" (2026-09-09, pedido do usuário) —
             reinsere só as seções pendentes/desatualizadas (nunca as 4
             incondicionalmente, ver _fichaGenerateCompleteHandoff em
             handoff-ficha.js). Ícone "layers" pra não colidir visualmente
             com "sparkles" (já usado em "ou usar Mapeamento Automático"
             nesta mesma workspace, em outro contexto). -->
        <div class="flex items-center gap-dsc-nano mb-2">
          <button type="button" onclick="_fichaGenerateCompleteHandoff('${escapeHtml(area.id)}')"
            class="flex-1 min-w-0 flex items-center justify-center gap-dsc-nano h-9 rounded-dsc-large text-dsc-label-tiny normal-case tracking-normal font-bold transition-all bg-[#005ca9] text-white hover:bg-blue-700 active:scale-[0.99] shadow-sm shadow-blue-500/20">
            <i data-lucide="layers" class="w-3.5 h-3.5" aria-hidden="true"></i>
            Gerar Handoff
          </button>
          ${hasAnyInserted ? `
          <button type="button" onclick="_fichaViewOnCanvas()"
            data-tooltip="Ver handoff no canvas" aria-label="Ver handoff no canvas"
            class="tooltip-bottom tooltip-left shrink-0 w-9 h-9 flex items-center justify-center rounded-dsc-large border border-gray-200 dark:border-dark-line text-slate-500 dark:text-dark-muted hover:bg-slate-50 dark:hover:bg-dark-line/40 active:scale-[0.99] transition-all">
            <i data-lucide="scan-eye" class="w-3.5 h-3.5" aria-hidden="true"></i>
          </button>` : ''}
        </div>
        ${typeof _fichaDashboardHtml === 'function' ? _fichaDashboardHtml(area) : ''}
      </div>
    </div>
  `;
}

// Dropdown "⋯" do CARD da listagem (2026-09-04-f, pedido do usuário: hoje
// não dá pra excluir uma área sem entrar na workspace primeiro, já que
// Focar/Ocultar/Excluir migraram todos pro dropdown "Mais ações" DENTRO da
// workspace, 2026-09-04). Devolve as 3 ações diretamente no card, sem
// precisar abrir a área — mesmo padrão exato de toggle/fechar (clique
// fora/Escape) de toggleA11yWorkspaceMoreActionsMenu, mas com UM menu por
// CARD (id dinâmico via areaId) em vez de um único elemento fixo no DOM.
//
// Correção de corte (2026-09-04-j, achado real reportado pelo usuário):
// o menu nasce dentro do <li> do card (overflow-hidden, necessário pro
// rounded-dsc-large) e a lista inteira também tem overflow-y-auto — um
// `position: absolute` comum fica cortado por QUALQUER um dos dois
// ancestrais. `position: fixed` NÃO resolve aqui (diferente do padrão já
// usado no Handex, `toggleStatusDropdown`): o body do hac roda com
// `zoom: var(--ui-scale)` e um comentário explícito em plugin.css
// documenta que `fixed` não escala com `zoom` (containing block continua
// o viewport real, não o body "zoomado") — por isso todo `fixed` do hac
// foi trocado por `absolute` resolvido contra `body` (que é
// `position: relative`, o containing block real). Este dropdown segue o
// mesmo princípio: ao abrir, é REPARENTADO pra `document.body` (escapando
// dos dois overflow-hidden) com `position: absolute` calculado via
// getBoundingClientRect() do BOTÃO gatilho relativo ao body (soma
// scrollY/scrollX — body não rola, mas defensivo) — nunca `fixed`. Ao
// fechar, volta pro `<li>` original (`_a11yCardMenuHomeParent`), pra não
// acumular menus soltos em `document.body` a cada card já renderizado.
let _a11yCardMenuCloseHandlers = null;
let _a11yCardMenuHomeParent = null; // { menu, parent, nextSibling } do menu atualmente reparentado

function _restoreA11yCardMenuToOrigin() {
  if (!_a11yCardMenuHomeParent) return;
  const { menu, parent, nextSibling } = _a11yCardMenuHomeParent;
  menu.style.cssText = '';
  if (parent) parent.insertBefore(menu, nextSibling || null);
  _a11yCardMenuHomeParent = null;
}

function toggleA11yCardMenu(e, areaId) {
  if (e) e.stopPropagation();
  const menu = document.getElementById(`a11y-card-menu-${areaId}`);
  const trigger = e && e.currentTarget;
  if (!menu) return;
  const isOpen = !menu.classList.contains('hidden');

  // Fecha qualquer outro menu de card já aberto antes de abrir este — só
  // um por vez, mesmo em listas longas — devolvendo-o pro lugar original.
  document.querySelectorAll('[id^="a11y-card-menu-"]').forEach(m => { if (m !== menu) m.classList.add('hidden'); });
  if (_a11yCardMenuHomeParent && _a11yCardMenuHomeParent.menu !== menu) _restoreA11yCardMenuToOrigin();
  if (_a11yCardMenuCloseHandlers) {
    document.removeEventListener('click', _a11yCardMenuCloseHandlers.close, true);
    document.removeEventListener('keydown', _a11yCardMenuCloseHandlers.onEsc, true);
    _a11yCardMenuCloseHandlers = null;
  }

  if (isOpen) { menu.classList.add('hidden'); _restoreA11yCardMenuToOrigin(); return; }

  // Reparenta pra body ANTES de medir o trigger — o menu tem que estar
  // fora do fluxo/overflow no momento do cálculo, senão herda a mesma
  // largura truncada do ancestral que estamos tentando escapar.
  if (!_a11yCardMenuHomeParent) {
    _a11yCardMenuHomeParent = { menu, parent: menu.parentElement, nextSibling: menu.nextSibling };
  }
  document.body.appendChild(menu);
  menu.classList.remove('hidden');
  if (trigger) {
    const r = trigger.getBoundingClientRect();
    const menuWidth = menu.offsetWidth || 192; // w-48 = 192px, fallback antes do 1º layout
    // Alinha a borda DIREITA do menu com a borda direita do botão (mesmo
    // efeito visual de "right-0" que o CSS original tinha, agora calculado
    // em px porque saiu do container relative que dava esse referencial).
    const left = Math.max(8, r.right - menuWidth);
    // Sem animação (2026-09-04-o, pedido do usuário: a tentativa de
    // esmaecer estava aparecendo "subindo de baixo pra cima" — revertida,
    // aparecimento simples e instantâneo no clique).
    menu.style.cssText = `position:absolute;top:${r.bottom + window.scrollY + 4}px;left:${left + window.scrollX}px;width:192px;z-index:9999;`;
  }

  const close = (ev) => { if (!menu.contains(ev.target) && ev.target !== trigger) { menu.classList.add('hidden'); _closeA11yCardMenuHandlers(); } };
  const onEsc = (ev) => { if (ev.key === 'Escape') { menu.classList.add('hidden'); _closeA11yCardMenuHandlers(); } };
  function _closeA11yCardMenuHandlers() {
    document.removeEventListener('click', close, true);
    document.removeEventListener('keydown', onEsc, true);
    _a11yCardMenuCloseHandlers = null;
    _restoreA11yCardMenuToOrigin();
  }
  _a11yCardMenuCloseHandlers = { close, onEsc };
  setTimeout(() => {
    document.addEventListener('click', close, true);
    document.addEventListener('keydown', onEsc, true);
  }, 0);
}
window.toggleA11yCardMenu = toggleA11yCardMenu;

// Wrapper de exclusão a partir do card — deleteA11yArea já aceita areaId
// diretamente (2026-09-11), não precisa mais resolver índice aqui.
function deleteA11yAreaFromCard(e, areaId) {
  if (e) e.stopPropagation();
  deleteA11yArea(areaId);
}
window.deleteA11yAreaFromCard = deleteA11yAreaFromCard;

// "Editar conector" (popover de 5 direções) e todo o fluxo
// update-a11y-area-conector foram REMOVIDOS (2026-09-14, pedido do
// usuário): número e direção do selo nascem sequenciais/automáticos, sem
// UI de edição pós-criação — ver confirmA11yArea (não envia mais escolha
// de conector, o backend sempre usa o default 'superior' quando ausente).
// O handler update-a11y-area-conector segue existindo em code.js (não
// removido, só órfão) — não há mais nenhum call site no frontend.

// Área Marcada — CARD CLICÁVEL (deixou de ser accordion em 2026-09-04, ver
// bloco "Workspace de uma Área Marcada" acima). Clicar no CORPO do card
// abre a workspace dedicada (openA11yAreaWorkspace). Focar/Ocultar/Excluir
// ficam disponíveis em DOIS lugares agora: no dropdown "⋯" do próprio
// card (acima, 2026-09-04-f) e no dropdown "Mais ações" da workspace
// (toggleA11yWorkspaceMoreActionsMenu) — o do card evita ter que entrar na
// área só pra excluir/ocultar/focar.
//
// Ampliado em 2026-09-04-c (pedido do usuário, com screenshot real): sem
// "Nova spec" no card — criar spec passou a ser só dentro da workspace, aba
// Leitor de Tela (o card fica mais limpo e sem competir com o resumo); sem
// o chevron de "abrir" (o card inteiro já é obviamente clicável, o ícone
// era redundante). Em troca, ganhou um resumo mais rico do que já foi
// documentado — 3 blocos: status por etapa (Tabulação/Swipe/Leitor de
// Tela, mesmo padrão visual do dashboard da tab Handoff), breakdown por
// categoria de spec (pills coloridas, uma por A11Y_CATEGORIES com pelo
// menos 1 spec), e status da Ficha de Handoff (X/N seções inseridas).
// Extraído de _a11yAreaAccordionEl (2026-09-08) — antes calculado só
// dentro do card da listagem principal (montando HTML direto). Devolve
// os DADOS CRUS (sem HTML), reaproveitável tanto ali quanto no payload
// de `insert-ficha-section` pro bloco "Handoff Review" da Ficha
// (_fichaInsertSection, handoff-ficha.js) — o backend não tem acesso a
// A11Y_CATEGORIES nem a areaSpecs, então o resumo precisa chegar pronto.
function _a11yComputeCategoryBreakdown(areaSpecs) {
  return Object.keys(A11Y_CATEGORIES)
    .map(catKey => {
      const specsInCat = (areaSpecs || []).filter(s => s.a11yType === catKey);
      // Origem pela primeira spec do subgrupo (mesma premissa de
      // _a11yCategoryAccordionEl: specs da mesma área/categoria compartilham
      // origem) — resolve "Nível de Título" vs "Títulos" aqui, uma vez só,
      // pra handoff-ficha.js (sem acesso a A11Y_CATEGORIES) reaproveitar
      // via categoryLabel já pronto, sem duplicar a lógica de origem lá.
      const groupOrigin = (specsInCat[0] && specsInCat[0].a11yOrigin) || null;
      const meta = A11Y_CATEGORIES[catKey];
      return { catKey, meta, categoryLabel: getA11yCategoryLabel(catKey, groupOrigin) || (meta && meta.label), count: specsInCat.length };
    })
    .filter(({ count }) => count > 0);
}
window._a11yComputeCategoryBreakdown = _a11yComputeCategoryBreakdown;

function _a11yAreaAccordionEl(area, areaSpecs) {
  // uid usa area.id (não area.originalIndex, 2026-09-11) — mesma correção
  // de estabilidade de chave aplicada em _a11yWorkspaceTabLeitorDeTela.
  const uid = `a11y-area-${area.id}`;
  const tabOrderCount = _currentTabOrderItems(area.id).length;
  const isMobile = isA11yMobileProject();
  // Indicador "Swipe" reflete a CONTAGEM DE PONTOS da trilha desta área
  // (3ª reformulação, 2026-09-04) — ver bloco "Trilha de Swipe".
  const swipePath = isMobile ? (hacData.a11ySwipePaths || []).find(p => p && p.areaId === area.id) : null;
  const swipePointCount = swipePath && Array.isArray(swipePath.points) ? swipePath.points.length : 0;

  const statusPill = (icon, label, ok) => `
    <span class="inline-flex items-center gap-dsc-quark text-dsc-label-tiny normal-case tracking-normal font-semibold" style="color:${ok ? '#16a34a' : '#94a3b8'}">
      <i data-lucide="${icon}" class="w-3 h-3 shrink-0"></i>${label}
    </span>
  `;

  const categoryBreakdownData = _a11yComputeCategoryBreakdown(areaSpecs);
  const categoryBreakdown = categoryBreakdownData
    .map(({ meta, categoryLabel, count }) => `
      <span class="inline-flex items-center gap-dsc-quark h-5 px-2 rounded-dsc-circ text-dsc-label-tiny normal-case tracking-normal font-bold" style="background-color:${meta.fill};color:${meta.textColor || meta.color}">
        ${count} ${escapeHtml(categoryLabel || meta.label)}
      </span>
    `).join('');

  const fichaState = area.handoffFicha && area.handoffFicha.sections ? area.handoffFicha.sections : null;
  // Havia uma 4ª chave ('review', Handoff Review/consolidado) — removida em
  // 2026-09-10, funcionalidade descontinuada (ver _buildFichaReviewSection,
  // code.js). "X/N seções inseridas" abaixo se ajusta sozinho (N vem do
  // length deste array).
  const fichaSectionKeys = isMobile ? ['tabulacao', 'swipe', 'leitor'] : ['tabulacao', 'leitor'];
  // Critério corrigido em 2026-09-24 (print do usuário: card mostrava "3/3
  // seções inseridas" ao mesmo tempo em que Tabulação/Ordem de Leitura
  // apareciam como "pendente" no mesmo card) — antes contava só
  // `insertedAt`, então uma seção inserida VAZIA (0 itens reais no canvas)
  // contava como pronta. Agora usa o MESMO critério rigoroso de
  // _fichaAreaIsComplete (handoff-ficha.js): insertedAt presente E conteúdo
  // real (_fichaCurrentSectionCount > 0) E em dia (!_fichaSectionIsStale).
  // As 3 funções são globais (window.*), carregadas de handoff-ficha.js —
  // mesmo bundle final, chamada só acontece em runtime de render, não há
  // problema de ordem de declaração.
  const fichaInsertedCount = fichaSectionKeys.filter(k => {
    const state = typeof _fichaSectionState === 'function' ? _fichaSectionState(area, k) : (fichaState && fichaState[k]);
    if (!state || !state.insertedAt) return false;
    if (typeof _fichaCurrentSectionCount === 'function' && _fichaCurrentSectionCount(area, k) === 0) return false;
    if (typeof _fichaSectionIsStale === 'function' && _fichaSectionIsStale(area, k)) return false;
    return true;
  }).length;

  const li = document.createElement('li');
  li.className = 'list-none bg-white dark:bg-dark-surface rounded-dsc-large border border-gray-100 dark:border-dark-line shadow-dsc-elevation-1 overflow-hidden';
  li.setAttribute('data-a11y-area', area.id);
  li.setAttribute('data-a11y-area-search', escapeHtml(_normalizeSearchText(area.label)));
  li.innerHTML = `
    <div class="flex flex-col gap-2.5 px-3.5 py-3 cursor-pointer select-none hover:bg-gray-50 dark:hover:bg-dark-line/20 transition-colors"
      onclick="openA11yAreaWorkspace('${area.id}')" id="${uid}">
      <div class="flex items-center gap-2.5">
        <div class="w-7 h-7 rounded-dsc-circ flex items-center justify-center text-dsc-label-tiny normal-case tracking-normal font-extrabold text-white shrink-0" style="background-color:#005ca9">${escapeHtml(String(area.number))}</div>
        <div class="flex-1 min-w-0">
          <p class="text-[12px] font-semibold text-slate-700 dark:text-white break-words leading-snug">${escapeHtml(area.label || '')}</p>
          <p class="text-dsc-label-tiny normal-case tracking-normal text-slate-400 dark:text-dark-muted">${areaSpecs.length} especificaç${areaSpecs.length === 1 ? 'ão' : 'ões'}</p>
        </div>
        <div class="relative shrink-0" onclick="event.stopPropagation()">
          <button type="button" title="Mais ações" aria-label="Mais ações desta tela" aria-haspopup="true"
            onclick="toggleA11yCardMenu(event, '${escapeHtml(area.id)}')"
            class="w-7 h-7 flex items-center justify-center rounded-dsc-small hover:bg-gray-100 dark:hover:bg-dark-line text-slate-400 dark:text-dark-muted transition-colors">
            <i data-lucide="ellipsis-vertical" class="w-4 h-4" aria-hidden="true"></i>
          </button>
          <div id="a11y-card-menu-${escapeHtml(area.id)}" class="hidden absolute right-0 top-full mt-1 w-48 py-1.5 bg-white dark:bg-dark-surface rounded-dsc-large shadow-2xl border border-gray-100 dark:border-dark-line z-50">
            <button type="button" onclick="focusNode('${escapeHtml(area.id)}')"
              class="w-full flex items-center gap-2.5 px-3.5 py-dsc-nano text-dsc-label-tiny normal-case tracking-normal font-semibold text-slate-700 dark:text-white hover:bg-gray-50 dark:hover:bg-dark-line transition-colors text-left">
              <i data-lucide="locate" class="w-3.5 h-3.5 text-slate-500 dark:text-dark-muted shrink-0" aria-hidden="true"></i>
              Focar no canvas
            </button>
            <!-- "Editar conector" e "Ocultar/Mostrar no canvas" removidos
                 (pedido do usuário, 2026-09-14): números e direção do selo
                 nascem sequenciais/automáticos, sem necessidade de edição
                 manual pós-criação. -->
            <button type="button" onclick="deleteA11yAreaFromCard(event, '${escapeHtml(area.id)}')"
              class="w-full flex items-center gap-2.5 px-3.5 py-dsc-nano text-dsc-label-tiny normal-case tracking-normal font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors text-left">
              <i data-lucide="trash-2" class="w-3.5 h-3.5 shrink-0" aria-hidden="true"></i>
              Remover tela
            </button>
          </div>
        </div>
      </div>

      <div class="flex flex-col items-start gap-dsc-quark pl-[38px]">
        ${statusPill(tabOrderCount > 0 ? 'check-circle-2' : 'circle-dashed', tabOrderCount > 0 ? `Tabulação (${tabOrderCount})` : 'Tabulação pendente', tabOrderCount > 0)}
        ${isMobile ? statusPill(swipePointCount > 0 ? 'check-circle-2' : 'circle-dashed', swipePointCount > 0 ? `Ordem de Leitura (${swipePointCount} pontos)` : 'Ordem de Leitura pendente', swipePointCount > 0) : ''}
        ${statusPill(areaSpecs.length > 0 ? 'check-circle-2' : 'circle-dashed', areaSpecs.length > 0 ? `Leitor de Tela (${areaSpecs.length})` : 'Leitor de Tela pendente', areaSpecs.length > 0)}
      </div>

      ${categoryBreakdown ? `<div class="flex items-center gap-dsc-quark flex-wrap pl-[38px]">${categoryBreakdown}</div>` : ''}

      <div class="flex items-center gap-1.5 pl-[38px]">
        <i data-lucide="file-output" class="w-3 h-3 shrink-0" style="color:${fichaInsertedCount > 0 ? '#005ca9' : '#94a3b8'}"></i>
        <span class="text-dsc-label-tiny normal-case tracking-normal font-semibold" style="color:${fichaInsertedCount > 0 ? '#005ca9' : '#94a3b8'}">
          Handoff de Acessibilidade: ${fichaInsertedCount}/${fichaSectionKeys.length} seções inseridas
        </span>
      </div>
    </div>
  `;
  return li;
}

// Bucket "Sem área" — specs que não têm a11yAreaId válido (dado legado/
// órfão — não deveria mais acontecer no fluxo novo, área é pré-requisito
// pra criar spec). Nunca tenta adivinhar a área certa. Também acolhe itens
// de Ordem de Tabulação legados sem a11yAreaId, na mesma vitrine read-only
// (sem botões de criação — não há área real pra escopar clique manual ou
// varredura de camadas).
function _a11ySemAreaAccordionEl(specs, tabItemsCount) {
  const uid = 'a11y-area-sem';
  const li = document.createElement('li');
  li.className = 'list-none bg-white dark:bg-dark-surface rounded-dsc-medium border border-amber-200 dark:border-amber-800/40 overflow-hidden';
  li.setAttribute('data-a11y-area', '__sem_area__');
  li.setAttribute('data-a11y-area-search', 'sem area');
  const parts = [`${specs.length} especificaç${specs.length === 1 ? 'ão' : 'ões'}`];
  if (tabItemsCount > 0) parts.push(`${tabItemsCount} ${tabItemsCount === 1 ? 'item' : 'itens'} de ordem de tabulação`);
  li.innerHTML = `
    <div class="flex items-center gap-dsc-nano px-2.5 py-dsc-nano cursor-pointer select-none hover:bg-amber-50/50 dark:hover:bg-amber-900/10 transition-colors"
      onclick="toggleA11yAreaAccordion('${uid}')">
      <div class="w-6 h-6 rounded-dsc-circ flex items-center justify-center bg-amber-50 dark:bg-amber-900/30 text-amber-500 shrink-0">
        <i data-lucide="alert-triangle" class="w-3.5 h-3.5"></i>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-dsc-label-tiny normal-case tracking-normal font-semibold text-slate-700 dark:text-white truncate">Sem tela</p>
        <p class="text-dsc-label-tiny normal-case tracking-normal text-slate-400 dark:text-dark-muted">${parts.join(' · ')} sem tela associada</p>
      </div>
      <i data-lucide="chevron-down" id="chevron-${uid}" class="w-4 h-4 text-gray-400 transition-transform shrink-0"></i>
    </div>
    <div id="body-${uid}" class="accordion-content hidden border-t border-gray-50 dark:border-dark-line p-2 space-y-2">
      ${specs.map(_a11ySpecItemHtml).join('')}
      ${tabItemsCount > 0 ? _tabOrderSectionHtml(uid, null) : ''}
    </div>
  `;
  return li;
}

// A árvore de camadas do Figma (painel Layers) é a fonte de verdade
// estrutural do documento — a listagem agrupada ordena as specs de cada
// área pela ordem de camadas real (DFS a partir da Área Marcada), não pela
// tag (letter) alfabética nem por x/y.
//
// Cache em memória (não persiste entre sessões/reload do plugin). Estrutura:
// { [areaId]: { [nodeId]: índice de visita DFS } } — o índice só é
// comparável DENTRO da mesma área (a árvore percorrida é a da Área Marcada,
// não do documento inteiro), por isso o cache é escopado por areaId em vez
// de ser um mapa único nodeId→índice.
window._a11yLayerOrderCache = window._a11yLayerOrderCache || {};

function _a11ySortSpecsByLayerOrder(specsList, areaId) {
  const areaCache = (window._a11yLayerOrderCache && areaId) ? window._a11yLayerOrderCache[areaId] : null;
  return specsList.slice().sort((a, b) => {
    const orderA = (areaCache && a.targetNodeId) ? areaCache[a.targetNodeId] : undefined;
    const orderB = (areaCache && b.targetNodeId) ? areaCache[b.targetNodeId] : undefined;
    // null == RESOLVIDO-E-NÃO-ENCONTRADO (2026-09-15, ver resolve-layer-order
    // em onmessage.js): o id foi procurado e não existe nesta árvore — quase
    // sempre porque um ancestral está oculto e a DFS pula a subárvore. Vale
    // como "já perguntei, não pergunte de novo" pro cache (é o que encerra o
    // ciclo de render infinito), mas NÃO é uma posição válida de ordenação.
    // Precisa cair no mesmo fallback alfabético de quando a resposta ainda
    // não chegou — sem o `== null` abaixo, `null - null` daria 0 e essas
    // specs seriam tratadas como empatadas na posição zero, embaralhando a
    // lista em vez de preservar a ordem por tag.
    if (orderA == null || orderB == null) {
      return String(a.letter || '').localeCompare(String(b.letter || ''));
    }
    return orderA - orderB;
  });
}

// Coleta os targetNodeId ainda não cacheados PARA ESTA ÁREA (o índice de
// ordem de camadas só faz sentido escopado à árvore de uma área específica)
// e consulta o backend de uma vez só. Re-renderiza ao final — chamada
// "fire and forget" a partir de renderA11yGroupedList, que já rendeu uma vez
// com o fallback alfabético enquanto a consulta está em voo.
// Guard de requisição em voo, por área (2026-09-15). Segunda linha de
// defesa do ciclo de render infinito corrigido em resolve-layer-order
// (onmessage.js): mesmo com o backend marcando os ids não encontrados,
// esta função é chamada por TODO render, e vários renders podem acontecer
// antes da primeira resposta voltar (spec criada → render → resposta de
// outra mensagem → render...). Sem o guard, cada um desses renders
// dispararia um pedido idêntico, multiplicando mensagens e renders.
window._a11yLayerOrderInFlight = window._a11yLayerOrderInFlight || {};

function _a11yQueueLayerOrderResolution(areaId, targetNodeId, specsList) {
  if (!areaId || !targetNodeId) return;
  if (window._a11yLayerOrderInFlight[areaId]) return;
  const cache = window._a11yLayerOrderCache;
  const areaCache = cache[areaId] || {};
  const missingIds = Array.from(new Set(
    specsList
      .map(s => s.targetNodeId)
      .filter(id => id && !(id in areaCache))
  ));
  if (missingIds.length === 0) return;

  window._a11yLayerOrderInFlight[areaId] = true;
  parent.postMessage({ pluginMessage: { type: 'resolve-layer-order', areaId, areaTargetNodeId: targetNodeId, nodeIds: missingIds } }, '*');
}

function renderA11yGroupedList() {
  const list = document.getElementById('a11y-groups-results');
  if (!list) return;
  // Fecha/restaura qualquer menu "⋯" de card aberto ANTES de destruir a
  // lista — o menu foi reparentado pra document.body ao abrir (correção de
  // corte, 2026-09-04-j), então sobreviveria ao innerHTML='' abaixo como
  // um elemento órfão e invisível, com _a11yCardMenuHomeParent apontando
  // pra um <li> já desconectado do DOM.
  if (typeof _restoreA11yCardMenuToOrigin === 'function') _restoreA11yCardMenuToOrigin();
  list.innerHTML = '';

  const areas = (a11yAreas || [])
    .map((a, i) => (a ? Object.assign({}, a, { originalIndex: i }) : null))
    .filter(Boolean)
    .sort((a, b) => (a.number || 0) - (b.number || 0));

  const specs = (a11ySpecs || [])
    .map((s, i) => (s ? Object.assign({}, s, { originalIndex: i }) : null))
    .filter(Boolean);

  // Banner vira um snackbar (showToast) — dispara só 1x por sessão do
  // plugin, não persiste entre sessões.
  if (areas.length === 0 && !window._a11yEmptyAreasHintShown) {
    window._a11yEmptyAreasHintShown = true;
    showToast('As especificações de acessibilidade nascem dentro de uma tela selecionada.');
  }

  // Selecionar Tela é pré-requisito: sem nenhuma tela, nem mostramos a
  // lista — orienta a selecionar a primeira antes de anotar qualquer spec.
  // O botão grande some do header (fab-inline) e reaparece centralizado
  // aqui, em destaque; quando já há tela(s) documentada(s), o header volta
  // a ser o único lugar onde ele aparece (ver toggle logo abaixo).
  const headerSelectScreenBtn = document.getElementById('btn-a11y-select-screen-header');
  if (headerSelectScreenBtn) headerSelectScreenBtn.classList.toggle('hidden', areas.length === 0);

  // Contagem ao lado de "Telas Documentadas" — só aparece quando há
  // telas (2026-09-10, pedido do usuário: retirar o texto explicativo
  // fixo abaixo do título, mostrar só o título + contagem quando houver
  // conteúdo).
  const areasCountHeader = document.getElementById('a11y-areas-count-header');
  const areasCountValue = document.getElementById('a11y-areas-count-value');
  if (areasCountHeader) areasCountHeader.classList.toggle('hidden', areas.length === 0);
  if (areasCountValue) areasCountValue.textContent = String(areas.length);

  // Alterna o "modo estado vazio" na cadeia de containers pais (2026-09-14,
  // pedido do usuário: centralizar sem depender de um min-h chutado em vh —
  // isso causou scroll indevido quando a janela era menor que o valor
  // chutado, achado real com print). SEM tela nenhuma, os 2 containers
  // pais (a div interna do scroll container + a div deste bloco) viram
  // 'flex flex-col h-full', propagando altura real do
  // #specs-scroll-container (sempre flex-1, altura real da janela menos o
  // header) até o <li> único, que passa a poder centralizar de verdade com
  // justify-center. COM telas, nenhuma classe extra — a lista volta a
  // fluir/rolar normalmente como sempre funcionou (o scroll continua
  // existindo quando o conteúdo excede a janela, ou com zoom aplicado).
  const scrollInner = document.getElementById('specs-scroll-container-inner');
  const emptyStateBlock = document.getElementById('a11y-empty-state-block');
  const isEmpty = areas.length === 0;
  if (scrollInner) scrollInner.classList.toggle('h-full', isEmpty);
  if (emptyStateBlock) emptyStateBlock.classList.toggle('h-full', isEmpty);
  if (emptyStateBlock) emptyStateBlock.classList.toggle('flex', isEmpty);
  if (emptyStateBlock) emptyStateBlock.classList.toggle('flex-col', isEmpty);

  if (areas.length === 0) {
    // flex-1 (no <ul>, ver toggle acima) faz este <li> único ocupar a
    // altura real restante dentro da cadeia h-full — justify-center
    // centraliza de fato, sem nenhum valor de altura chutado.
    list.classList.add('flex-1');
    list.innerHTML = `
      <li class="w-full h-full flex flex-col items-center justify-center animate-in fade-in duration-500 list-none">
        <div class="relative mb-4">
          <!-- Sem opacity extra (2026-09-11): text-slate-300 + opacity 0.25
               deixava o ícone quase invisível — a cor do token já dá o
               contraste baixo pretendido pra um estado vazio. -->
          <i data-lucide="scan" class="w-16 h-16 text-slate-300 dark:text-slate-600" aria-hidden="true"></i>
        </div>
        <p class="w-full text-[13px] font-bold text-slate-600 dark:text-white text-center px-4 mb-1">Nenhuma tela selecionada</p>
        <p class="w-full text-dsc-label-tiny normal-case tracking-normal text-slate-400 dark:text-dark-muted text-center px-6 mb-4 max-w-[260px] mx-auto leading-relaxed">Selecione um frame no figma e clique no botão a seguir para iniciar as etapas de preenchimento do handoff.</p>
        <button type="button" onclick="openA11yAreaModal()" class="flex items-center gap-dsc-nano h-11 px-6 rounded-dsc-large text-[13px] font-bold text-white bg-[#005ca9] hover:bg-blue-700 active:scale-[0.99] shadow-lg shadow-blue-500/20 transition-all">
          <i data-lucide="scan" class="w-4 h-4 shrink-0" aria-hidden="true"></i>
          Selecionar Tela
        </button>
      </li>
    `;
    _refreshIcons();
    // Bug real corrigido (2026-09-22, print do usuário após "Limpar tudo"):
    // este ramo tem return ANTECIPADO, então a chamada no fim da função
    // nunca rodava com a lista vazia — o bloco de completude ficava
    // congelado no último HTML renderizado ("1 de 1 tela com o checklist
    // fechado") mesmo com tudo apagado. Precisa rodar aqui também, para
    // ESCONDER o bloco (total === 0 → classList.add('hidden')).
    if (typeof _fichaRenderProjectSummary === 'function') {
      _fichaRenderProjectSummary();
    }
    return;
  }
  list.classList.remove('flex-1');

  areas.forEach(area => {
    const areaSpecsRaw = specs.filter(s => s.a11yAreaId === area.id);
    const areaSpecs = _a11ySortSpecsByLayerOrder(areaSpecsRaw, area.id);
    const areaLi = _a11yAreaAccordionEl(area, areaSpecs);
    list.appendChild(areaLi);
    // _a11yAreaAccordionEl virou card (2026-09-04) — não tem mais <ul> de
    // Ordem de Tabulação inline (isso agora vive só dentro da workspace,
    // tab "Tabulação", preenchido por _renderA11yWorkspaceTab). Mantém só a
    // resolução de ordem de camadas, usada pelo card e pela workspace.
    _a11yQueueLayerOrderResolution(area.id, area.targetNodeId, areaSpecsRaw);
  });

  // O bucket "Sem área" (specs sem a11yAreaId válido) não tem uma área real
  // pra escopar a árvore/DFS, então mantém o fallback alfabético por tag
  // (letter), sem consulta de ordem de camadas.
  const semArea = specs
    .filter(s => !s.a11yAreaId || !areas.some(a => a.id === s.a11yAreaId))
    .slice()
    .sort((a, b) => String(a.letter || '').localeCompare(String(b.letter || '')));
  const semAreaTabItems = _currentTabOrderItems('__sem_area__');
  if (semArea.length > 0 || semAreaTabItems.length > 0) {
    const semLi = _a11ySemAreaAccordionEl(semArea, semAreaTabItems.length);
    list.appendChild(semLi);
    if (semAreaTabItems.length > 0) {
      _renderTabOrderListForArea('__sem_area__', document.getElementById('tab-order-list-a11y-area-sem'));
    }
  }

  _refreshIcons();

  // A workspace de uma Área (view-area-workspace) vive num container à
  // parte de #a11y-groups-results — qualquer ação que dispare
  // renderA11yGroupedList() (criar/editar/excluir spec, Ordem de Tabulação
  // etc.) precisa também atualizar o conteúdo da tab ativa da workspace, se
  // ela estiver aberta no momento, senão a workspace ficava com dado
  // desatualizado até o designer trocar de tab manualmente.
  if (window._a11yWorkspaceAreaId && typeof _renderA11yWorkspaceTab === 'function') {
    _renderA11yWorkspaceTab();
  }

  // Resumo de completude do PROJETO (2026-09-22, distinto do status por
  // TELA de cada card acima) — ver _fichaRenderProjectSummary,
  // handoff-ficha.js.
  if (typeof _fichaRenderProjectSummary === 'function') {
    _fichaRenderProjectSummary();
  }
}
window.renderA11yGroupedList = renderA11yGroupedList;

// Normaliza texto pra comparação insensível a maiúsculas/acentos — usada
// por _a11yAreaAccordionEl (atributo de busca do card) e pelo bucket "Sem
// área" (agrupamento por spec).
function _normalizeSearchText(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}


// Wrappers pra não quebrar chamadores existentes (core.js, messages.js) que
// ainda pedem a lista de specs ou a de áreas separadamente — ambos
// renderizam o mesmo accordion unificado.
function renderA11ySpecsList() { renderA11yGroupedList(); }
window.renderA11ySpecsList = renderA11ySpecsList;
function renderA11yAreasList() { renderA11yGroupedList(); }
window.renderA11yAreasList = renderA11yAreasList;

// ── Origem do projeto (web/mobile) — pergunta única por arquivo ─────────
// Decisão de produto (2026-09-02, REVERTE a decisão de 2026-09-01 abaixo):
// a origem web/mobile voltou a ser uma característica do ARQUIVO/PROJETO
// inteiro (nunca misto — confirmado repetidamente pelo usuário), perguntada
// UMA ÚNICA VEZ e persistida em hacData.projectOrigin (core.js), sobrevivendo
// a reaberturas do plugin (mesmo save-storage/clientStorage escopado por
// fileKey de todo o resto do hacData).
//
// Motivo da reversão: perguntar a cada ação (Marcar Área, Detecção
// Automática, Ordem de Tabulação) fazia a MESMA pergunta aparecer duas vezes
// em sequência imediata quando autoDetect está ligado (Marcar Área → abre a
// Detecção Automática automaticamente) — parecia um loop/bug pro designer.
//
// ensureA11yProjectOriginThen(onReady) é o ponto único que toda ação que
// precisa da origem deve chamar: se hacData.projectOrigin já está definido,
// chama onReady(origin) DIRETO (sem abrir modal nenhuma); se não, abre a
// mesma modal bloqueante já existente (#a11y-post-area-detect-modal, estado
// #a11y-post-area-origin) e, na escolha, persiste em hacData.projectOrigin
// (setA11yProjectOrigin) antes de chamar onReady — daí em diante nenhuma
// outra ação nesse arquivo pergunta de novo.
function getA11yProjectOrigin() {
  return (hacData && hacData.projectOrigin) || null;
}
window.getA11yProjectOrigin = getA11yProjectOrigin;

// Atalho pra checagem mais comum sobre getA11yProjectOrigin() — a origem do
// PROJETO inteiro (web/mobile), não a origem de uma spec/elemento individual
// (essa é outro conceito, modal.dataset.a11yOrigin, não substituído aqui).
function isA11yMobileProject() {
  return getA11yProjectOrigin() === 'mobile';
}
window.isA11yMobileProject = isA11yMobileProject;

// silent: true evita o toast (usado no fluxo de primeira pergunta, onde o
// toast seria ruído — a confirmação visual já é o modal fechando e a ação
// prosseguindo). false é usado pela troca manual via "Sobre o hac".
function setA11yProjectOrigin(origin, opts) {
  if (origin !== 'web' && origin !== 'mobile') return;
  hacData.projectOrigin = origin;
  saveToStorage();
  if (!opts || !opts.silent) {
    showToast(`Plataforma do projeto definida como ${origin === 'mobile' ? 'Mobile' : 'Web'}.`);
  }
  _refreshUiForProjectOrigin();
}
window.setA11yProjectOrigin = setA11yProjectOrigin;

// ── Lib específica do projeto (2026-09-04) ──────────────────────────────
// projectOrigin (web/mobile) continua sendo a fonte de verdade pra TODA a
// lógica binária já madura do plugin (formulário mobile/desktop, seleção
// de componente de selo A11Y_ITEM_NUMBER_KEYS/_MOBILE, filtro de
// categorias) — nada disso muda. projectLib é um campo MAIS granular,
// adicionado por cima: qual das 3 libs de produto escolhíveis
// (web-angular-react legado, super-dsc-web novo, super-app mobile) o
// designer está de fato documentando. Motivo: o hac já reconhece e mapeia
// as libs individualmente no matching de componente
// (_resolveDscComponentA11yMatch, code.js, campo sourceLib) — só a UI
// (Home, header) ainda tratava tudo como 2 categorias amplas, o que ficava
// impreciso quando existem 2 libs web coexistindo na mesma tela (legado +
// nova). dsc-android é reconhecida no matching mas NÃO é uma opção de
// escolha aqui (decisão explícita do usuário, 2026-09-04).
const A11Y_LIB_TO_ORIGIN = { 'web-angular-react': 'web', 'super-dsc-web': 'web', 'super-app': 'mobile' };
const A11Y_LIB_LABELS = { 'web-angular-react': 'DSC Web Angular & React', 'super-dsc-web': 'Super DSC Web', 'super-app': 'Super DSC Mobile' };
const A11Y_LIB_ICONS = { 'web-angular-react': 'monitor', 'super-dsc-web': 'monitor', 'super-app': 'smartphone' };

function getA11yProjectLib() {
  return (hacData && hacData.projectLib) || null;
}
window.getA11yProjectLib = getA11yProjectLib;

// Sempre grava projectLib E o projectOrigin derivado (via A11Y_LIB_TO_ORIGIN)
// juntos, num único ponto — assim a lógica binária existente (que só
// conhece projectOrigin) nunca fica dessincronizada da escolha granular.
// setA11yProjectOrigin já dispara _refreshUiForProjectOrigin, então não
// duplica essa chamada aqui.
function setA11yProjectLib(lib, opts) {
  if (!A11Y_LIB_TO_ORIGIN[lib]) return;
  hacData.projectLib = lib;
  setA11yProjectOrigin(A11Y_LIB_TO_ORIGIN[lib], opts);
}
window.setA11yProjectLib = setA11yProjectLib;

// Ponto único de atualização de UI sempre que a plataforma muda — chamado
// tanto pela escolha inicial na Home (chooseA11yHomeOrigin) quanto pela
// troca manual depois ("Sobre o hac" → Trocar, openA11yProjectOriginPrompt).
// Cada elemento só se atualiza se já estiver montado no DOM (a Home e a
// tela de Acessibilidade nunca coexistem — só uma view fica sem "hidden"
// por vez), então é seguro chamar isto incondicionalmente em qualquer
// momento sem checar em qual view o designer está.
function _refreshUiForProjectOrigin() {
  _renderA11yHomeOriginPicker();
  _applyA11yHeaderOriginTitle();
  _applyA11yCategoryPickerOriginFilter();
  _applyA11yCategoriesHelpOriginFilter();
}
window._refreshUiForProjectOrigin = _refreshUiForProjectOrigin;

// Escolha de LIB feita na PRÓPRIA Home — ver home.html (recebe o slug da
// lib, ex: 'super-app', não mais 'web'/'mobile' direto). Navega direto pra
// view-specifications (2026-09-08, pedido do usuário: a Etapa 2 antiga —
// resumo de 3 passos + botão "Começar" — só informava, nunca fazia nada de
// fato, e tinha conteúdo desatualizado, sem citar Swipe/Handoff; o
// onboarding stepper que dispara a seguir já cobre o fluxo completo e
// atualizado). Dispara, na sequência, o onboarding específico dessa lib
// (Camada 2 — ver ONBOARDING_TOOLS em onboarding.js) uma única vez por
// lib/arquivo, complementando o onboarding geral de fluxo (Camada 1, já
// existente).
// Bug real corrigido (2026-09-09): antes, escolher a lib aqui abria um
// modal de onboarding automaticamente ("Camada 2", 3 passos específicos
// da lib, com pouco conteúdo real) — DIFERENTE do onboarding completo que
// o banner "Primeira vez aqui?"/o ícone de chapéu mostravam (7 passos
// genéricos), fazendo o designer ver dois onboardings distintos pro mesmo
// momento. Aquele onboarding curto foi removido.
// Reintroduzido (2026-09-10, pedido do usuário) usando o onboarding
// COMPLETO (o mesmo que banner/chapéu já abrem, sem duplicação de
// conteúdo agora): ao escolher a lib, abre automaticamente o onboarding
// certo pra essa origem — só na primeira vez por lib/arquivo (mesmo
// critério "visto" de sempre, _onboardingSeen). O banner "Primeira vez
// aqui?" foi removido do HTML (ficaria redundante com a abertura
// automática) — ver onboarding.js/specifications.html/core.js.
function chooseA11yHomeOrigin(lib) {
  setA11yProjectLib(lib, { silent: true });
  navigate('view-specifications');
  if (typeof openOnboardingForCurrentOrigin === 'function') {
    openOnboardingForCurrentOrigin({ markSeenOnOpen: true, onlyIfUnseen: true });
  }
  // Checagem de handoff de outro designer/próprio (2026-09-11, movida de
  // ensureA11yProjectOriginThen — ver comentário lá: aquele bloco só
  // rodava na primeira confirmação de origem do arquivo, o que quase nunca
  // acontece na prática, já que a lib é escolhida aqui na Home antes de
  // qualquer ação em view-specifications). Disparada logo após escolher a
  // lib — mesmo instante em que o designer entra na tela de trabalho,
  // então o alerta (se houver) já aparece pronto ao carregar a tela, sem
  // esperar nenhuma ação subsequente do usuário.
  parent.postMessage({ pluginMessage: { type: 'check-other-designers-sections', currentUserId: getA11yDesignerId() } }, '*');
  parent.postMessage({ pluginMessage: { type: 'check-my-prior-session', currentUserId: getA11yDesignerId() } }, '*');
  // Página dedicada do handoff (2026-09-22, jornada pedida pelo usuário:
  // "seleciona a lib, a página do HAC é criada e abre-se a modal para ctrl
  // c e ctrl v das telas a serem documentadas"). O backend cria/reaproveita
  // a página, leva o designer até ela e responde 'hac-page-ready' — só
  // então a modal de instrução abre (ver _openHacPageInstructionModal
  // abaixo e o handler em messages.js).
  parent.postMessage({ pluginMessage: { type: 'ensure-hac-page' } }, '*');
}
window.chooseA11yHomeOrigin = chooseA11yHomeOrigin;

// Modal de instrução da página do handoff — aberta em resposta a
// 'hac-page-ready' (messages.js), nunca direto daqui: só faz sentido
// instruir "cole as telas aqui" depois que a página existe de fato e o
// designer já foi levado até ela.
//
// Abre em DOIS casos (decisão 2026-09-22): página recém-criada (`created`)
// ou página que já existia mas está VAZIA — reabrir o plugin num arquivo
// onde a página foi criada mas nada foi colado ainda deve reinstruir, senão
// o designer fica numa página vazia sem saber o que fazer. Página já com
// telas dentro não interrompe: ele já passou por isso e está trabalhando.
function _openHacPageInstructionModal(msg) {
  if (!msg || msg.failed) return;

  // Persiste qual página é a do handoff (2026-09-22) — a completude do
  // PROJETO (_fichaProjectCompletion) usa isso pra contar só as telas
  // documentadas DENTRO dela, ignorando Áreas avulsas no resto do arquivo.
  // Gravado sempre que a página é resolvida, inclusive quando a modal não
  // abre (página já existente e com telas) — o dado é necessário de
  // qualquer forma.
  if (msg.pageId && hacData.hacPageId !== msg.pageId) {
    hacData.hacPageId = msg.pageId;
    saveToStorage();
    if (typeof renderA11yGroupedList === 'function') renderA11yGroupedList();
  }

  if (!msg.created && !msg.isEmpty) return;

  // ENFILEIRA atrás do onboarding (bug real evitado, 2026-09-22): na
  // primeira escolha de lib, chooseA11yHomeOrigin abre o onboarding
  // SÍNCRONO e só depois chega a resposta assíncrona de 'ensure-hac-page'.
  // Como openModal (core.js) fecha qualquer outro modal aberto antes de
  // abrir o novo, esta modal MATARIA o onboarding no meio — repetindo o
  // sintoma de "dois onboardings distintos pro mesmo momento" que já foi
  // corrigido em 2026-09-09 (ver comentário em chooseA11yHomeOrigin). Com
  // o onboarding aberto, guarda o payload e deixa closeOnboarding
  // (onboarding.js) disparar esta mesma função no fim.
  const onboardingEl = document.getElementById('onboarding-modal');
  const onboardingOpen = !!onboardingEl && !onboardingEl.classList.contains('hidden');
  if (onboardingOpen) {
    window._pendingHacPageInstruction = msg;
    return;
  }
  window._pendingHacPageInstruction = null;

  const intro = document.getElementById('hac-page-instruction-intro');
  if (intro) {
    intro.textContent = msg.created
      ? 'Criamos a página do handoff e levamos você até ela. Agora copie e cole aqui as telas que serão documentadas.'
      : 'Esta é a página do handoff. Copie e cole aqui as telas que serão documentadas.';
  }
  openModal('hac-page-instruction-modal');
  if (typeof _refreshIcons === 'function') _refreshIcons();
}
window._openHacPageInstructionModal = _openHacPageInstructionModal;

// Alterna, na Home, entre a ETAPA 1 (pergunta de plataforma, objetiva) e a
// ETAPA 1b (sub-escolha de lib web) — nunca as duas ao mesmo tempo. A
// antiga ETAPA 2 (resumo do fluxo + "Voltar"/"Começar") foi removida
// (2026-09-08): escolher a lib agora navega direto pra view-specifications
// (ver chooseA11yHomeOrigin). Chamado ao entrar na Home e também por
// openA11yProjectOriginPrompt ("Sobre o hac" → Trocar), que precisa forçar
// a Etapa 1 de volta mesmo com hacData.projectOrigin já preenchido.
//
// Renderiza SEMPRE a Etapa 1 quando chamada — a decisão de "pular" essa
// função inteira quando a origem já está definida e a navegação não é um
// pedido explícito de troca (2026-09-16, reversão seletiva do "Home sempre
// reexibe a Etapa 1" de 2026-09-08) vive em navigate() (core.js), não
// aqui, DE PROPÓSITO: esta função também é chamada por
// _refreshUiForProjectOrigin (toda vez que a plataforma muda, de qualquer
// view) e no boot (messages.js, antes de qualquer navigate() rodar) —
// nesses dois casos ela só precisa atualizar/preencher o DOM da Home nos
// bastidores, nunca navegar pra outra view por conta própria. Só
// navigate('view-home') (o botão "Voltar", especificamente) deve decidir
// se pula a Etapa 1 — ver comentário em core.js.
//
// NÃO chama mais _resetA11yProjectOriginIfNothingDocumented() aqui (bug
// real corrigido em 2026-09-16, mesmo dia): esta função é chamada por
// _refreshUiForProjectOrigin, que por sua vez é chamada de DENTRO do
// próprio setA11yProjectOrigin — ou seja, ao escolher a lib pela primeira
// vez (chooseA11yHomeOrigin), a sequência era: hacData.projectOrigin =
// 'web' → saveToStorage() → _refreshUiForProjectOrigin() →
// _renderA11yHomeOriginPicker() → _resetA11yProjectOriginIfNothingDocumented()
// via aqui, que via os 4 arrays ainda vazios (nenhuma Área/Spec/Tabulação/
// Swipe existe — é literalmente a escolha inicial) e zerava
// hacData.projectOrigin de volta pra null NO MESMO INSTANTE em que acabara
// de ser definido. O picker "Plataforma do Projeto" reabria ao tentar
// Marcar Área logo em seguida, porque ensureA11yProjectOriginThen lia null.
// O reset por "nada documentado" agora roda uma única vez, no BOOT (ver
// messages.js, handler 'init-plugin', antes desta função ser chamada pela
// primeira vez) — nunca mais durante o uso normal da sessão atual, onde
// uma escolha recém-feita pelo usuário é sempre válida mesmo sem nenhum
// dado documentado ainda.
function _renderA11yHomeOriginPicker() {
  const step1 = document.getElementById('a11y-home-step-origin');
  const stepWebSublib = document.getElementById('a11y-home-step-web-sublib');
  if (!step1) return;

  step1.classList.remove('hidden');
  if (stepWebSublib) stepWebSublib.classList.add('hidden');

  if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
}
window._renderA11yHomeOriginPicker = _renderA11yHomeOriginPicker;

// Critério de "nada real documentado ainda" pra decisão acima: nenhuma
// Área Marcada, nenhuma spec de categoria, nenhum item de Ordem de
// Tabulação e nenhuma Trilha de Swipe. Qualquer um presente significa que
// o designer já está "dentro" do fluxo daquela plataforma, mesmo que
// ainda não tenha documentado nenhum elemento — nesse caso a origem NÃO é
// zerada, mesmo com a Home sendo reexibida (ex.: botão "Voltar" a partir
// de view-specifications). Só zera de fato quando os 4 arrays estão
// vazios — arquivo genuinamente "em branco" do ponto de vista de a11y.
function _resetA11yProjectOriginIfNothingDocumented() {
  if (!hacData || !hacData.projectOrigin) return;
  const hasAreas = Array.isArray(a11yAreas) && a11yAreas.length > 0;
  const hasSpecs = Array.isArray(a11ySpecs) && a11ySpecs.length > 0;
  const hasTabOrder = Array.isArray(tabOrderItems) && tabOrderItems.length > 0;
  const hasSwipePaths = Array.isArray(hacData.a11ySwipePaths) && hacData.a11ySwipePaths.length > 0;
  if (hasAreas || hasSpecs || hasTabOrder || hasSwipePaths) return;

  hacData.projectOrigin = null;
  hacData.projectLib = null;
  if (typeof saveToStorage === 'function') saveToStorage();
}
window._resetA11yProjectOriginIfNothingDocumented = _resetA11yProjectOriginIfNothingDocumented;

// Avança da Etapa 1 (Web/Mobile) pra Etapa 1b (sub-escolha de lib web) —
// Mobile não passa por aqui, resolve direto em chooseA11yHomeOrigin('super-app')
// já que só existe 1 lib mobile real hoje. Só troca a visibilidade das 2
// etapas — nenhuma escolha é persistida ainda (só chooseA11yHomeOrigin
// grava de fato, quando uma das 2 libs web é escolhida na Etapa 1b).
function _showA11yHomeWebSublibStep() {
  const step1 = document.getElementById('a11y-home-step-origin');
  const stepWebSublib = document.getElementById('a11y-home-step-web-sublib');
  if (!step1 || !stepWebSublib) return;
  step1.classList.add('hidden');
  stepWebSublib.classList.remove('hidden');
}
window._showA11yHomeWebSublibStep = _showA11yHomeWebSublibStep;

// "Voltar" da Etapa 1b pra Etapa 1 — desiste da sub-escolha sem persistir
// nada.
function _hideA11yHomeWebSublibStep() {
  const step1 = document.getElementById('a11y-home-step-origin');
  const stepWebSublib = document.getElementById('a11y-home-step-web-sublib');
  if (!step1 || !stepWebSublib) return;
  stepWebSublib.classList.add('hidden');
  step1.classList.remove('hidden');
}
window._hideA11yHomeWebSublibStep = _hideA11yHomeWebSublibStep;

// Título do header secundário (specifications.html) — substitui o antigo
// texto fixo "Acessibilidade" por "Documentando projeto Web/Mobile", já que
// a plataforma agora é sempre conhecida antes de chegar nesta tela (exceto
// arquivos legados que ainda não passaram pela Home com esta feature —
// nesse caso cai no fallback "Acessibilidade" genérico, idêntico ao
// comportamento anterior a esta mudança).
function _applyA11yHeaderOriginTitle() {
  const titleEl = document.getElementById('a11y-header-title');
  if (!titleEl) return;
  const lib = getA11yProjectLib();
  if (lib && A11Y_LIB_LABELS[lib]) {
    titleEl.textContent = A11Y_LIB_LABELS[lib];
    return;
  }
  // Fallback: arquivo legado com projectOrigin mas sem projectLib (salvo
  // antes desta versão) — rótulo genérico por família, nunca assume qual
  // das 2 libs web específicas era.
  const origin = getA11yProjectOrigin();
  titleEl.textContent = origin === 'mobile' ? 'Acessibilidade · Mobile'
    : origin === 'web' ? 'Acessibilidade · Web'
    : 'Acessibilidade';
}
window._applyA11yHeaderOriginTitle = _applyA11yHeaderOriginTitle;

// ── Section de specs ativa (2026-09-03) ──────────────────────────────────
// Mesmo padrão de projectOrigin acima: campo simples de configuração de
// projeto, persistido em hacData.activeSectionName, lido pelo backend em
// TODA mensagem que cria nós dentro da Section organizadora (create-a11y-
// area, create-unified-spec, generate-tab-order-from-layers, start-tab-
// order-copy, draw-tab-order-badge). null = ainda não escolhida
// explicitamente — backend resolve pro nome fixo original
// (A11Y_SECTION_NAME, code.js) quando sectionName vem vazio/ausente, então
// arquivos que nunca passaram por este fluxo continuam funcionando
// exatamente como antes. Só passa a ter valor quando o designer opta por
// "Iniciar nova Section" no aviso de documentação existente (ver
// openA11yAreaModal abaixo).
function getA11yActiveSectionName() {
  return (hacData && hacData.activeSectionName) || null;
}
window.getA11yActiveSectionName = getA11yActiveSectionName;

function setA11yActiveSectionName(sectionName) {
  hacData.activeSectionName = sectionName || null;
  saveToStorage();
}
window.setA11yActiveSectionName = setA11yActiveSectionName;

// Nome do designer logado, já lido de figma.currentUser uma única vez em
// 'ui-ready' (code.js) e guardado em hacData.currentUser. Vai no payload de
// toda mensagem que pode criar a Section de sessão
// (_getOrCreateA11ySessionSection, code.js) — o backend não relê
// figma.currentUser. Cosmético: só decide o texto do nome da Section na
// criação, nunca é usado como critério de busca/isolamento (ver
// getA11yDesignerId abaixo, que é o critério real).
function getA11yDesignerName() {
  return (hacData && hacData.currentUser && hacData.currentUser.name) || null;
}
window.getA11yDesignerName = getA11yDesignerName;

// Id estável do designer logado (figma.currentUser.id, nativo do Figma) —
// critério REAL de isolamento de sessão entre designers diferentes no mesmo
// arquivo (2026-09-10, bug real: dois designers trabalhando ao mesmo tempo
// tiveram o trabalho misturado na mesma Section, porque a busca no backend
// nunca filtrava por dono). Vai lado a lado com designerName em todo
// payload que pode criar/reaproveitar a Section de sessão
// (_getOrCreateA11ySessionSection, code.js) — null quando figma.currentUser
// não resolveu (caso raro), e o backend cai no comportamento antigo sem
// filtro nesse caso.
function getA11yDesignerId() {
  return (hacData && hacData.currentUser && hacData.currentUser.id) || null;
}
window.getA11yDesignerId = getA11yDesignerId;

// #a11y-post-area-origin visível / #a11y-post-area-loading escondido —
// reaproveitado tanto pela pergunta de origem quanto pelo indicador de
// progresso da Detecção Automática/salvamento do wizard (ver
// showA11yWizardSavingIndicator, mais abaixo).
function _setA11yPostAreaModalStage(stage) {
  const originStage = document.getElementById('a11y-post-area-origin');
  const loadingStage = document.getElementById('a11y-post-area-loading');
  if (originStage) originStage.classList.toggle('hidden', stage !== 'origin');
  if (loadingStage) loadingStage.classList.toggle('hidden', stage !== 'loading');
}

// Ponto único que qualquer ação (Marcar Área, Detecção Automática, Ordem de
// Tabulação, e futuras) deve chamar antes de precisar saber a origem
// web/mobile do arquivo. Nunca pergunta mais de uma vez por arquivo — só
// reabre a modal quando hacData.projectOrigin ainda é null (arquivo novo, ou
// arquivo salvo antes desta versão, sem o campo — migração por ausência).
function ensureA11yProjectOriginThen(onReady) {
  const known = getA11yProjectOrigin();
  if (known) {
    onReady(known);
    return;
  }
  window._a11yPendingOriginCallback = (origin) => {
    setA11yProjectOrigin(origin, { silent: true });
    // Checagem de handoff de outro designer/próprio (2026-09-10) — MOVIDA
    // para chooseA11yHomeOrigin (2026-09-11, bug real corrigido: este bloco
    // só roda na PRIMEIRA confirmação de origem do arquivo, o que quase
    // nunca acontece na prática, já que a origem é escolhida na Home antes
    // de qualquer ação em view-specifications — o early-return logo no
    // topo desta função, quando a origem já é conhecida, pulava direto pro
    // onReady sem nunca disparar as checagens). Ver chooseA11yHomeOrigin.
    onReady(origin);
  };
  const originTitle = document.getElementById('a11y-post-area-title');
  if (originTitle) originTitle.innerHTML = '<i data-lucide="smartphone" class="w-4 h-4 text-[#005ca9]" aria-hidden="true"></i> Plataforma do Projeto';
  _setA11yPostAreaModalStage('origin');
  openModal('a11y-post-area-detect-modal');
  if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
}
window.ensureA11yProjectOriginThen = ensureA11yProjectOriginThen;

// Reabre a escolha sob demanda (botão "Trocar" na modal "Sobre o hac") —
// única forma de mudar hacData.projectLib/projectOrigin depois de já
// definido. Em vez de um modal pequeno com 2 botões fixos (Web/Mobile),
// redireciona pra Home, que já tem a escolha real de 3 libs (Etapa 1) —
// evita duplicar essa UI em dois lugares. Seta
// window._a11yForceHomeOriginStep = true ANTES de navegar — é a flag que
// navigate('view-home') (core.js) lê para diferenciar este pedido
// EXPLÍCITO de troca do botão genérico "Voltar para a página inicial"
// (specifications.html) de um clique comum. Diferente de confirmBackToHome
// logo abaixo, este é um pedido explícito de trocar ("Trocar" na modal
// "Sobre o hac") — vai direto pra Etapa 1 sem perguntar de novo, pois
// perguntar "deseja trocar?" depois de já ter clicado em "Trocar" seria
// redundante.
function openA11yProjectOriginPrompt() {
  if (typeof closeModal === 'function') closeModal('about-hac-modal');
  window._a11yForceHomeOriginStep = true;
  if (typeof navigate === 'function') navigate('view-home');
}
window.openA11yProjectOriginPrompt = openA11yProjectOriginPrompt;

// Botão genérico "Voltar para a página inicial" (specifications.html) —
// 2026-09-16, 2ª iteração da mesma sessão. A 1ª correção (ver comentário em
// openA11yProjectOriginPrompt acima) fez "Voltar" pular direto pra
// view-specifications sem perguntar nada quando já havia plataforma
// escolhida; o usuário testou e pediu uma 3ª opção: nem "sempre volta pra
// Home" (comportamento original, perdia contexto sem aviso) nem "nunca
// pergunta" (o skip silencioso da 1ª correção) — em vez disso, SEMPRE
// intercepta com uma confirmação quando já há plataforma escolhida, e só
// navega de fato pro picker (Etapa 1) se o usuário confirmar. Reaproveita o
// modal de confirmação genérico #a11y-confirm-modal (modals.html) em vez de
// criar um modal dedicado — ver openA11yConfirmModal abaixo.
//
// Se hacData.projectOrigin ainda não está definido (arquivo "em branco"; na
// prática este botão só existe dentro de view-specifications, que hoje só é
// alcançável depois de escolher plataforma na Home — mas sem essa guarda um
// arquivo legado/estado intermediário cairia num diálogo sem sentido
// perguntando "deseja trocar" de algo que nunca foi escolhido), navega
// direto sem perguntar — não há nada a "trocar" ainda.
function confirmBackToHome() {
  if (typeof hacData === 'undefined' || !hacData || !hacData.projectOrigin) {
    if (typeof navigate === 'function') navigate('view-home');
    return;
  }
  openA11yConfirmModal({
    title: 'Deseja trocar de plataforma?',
    body: 'Voltar para a página inicial abre novamente a escolha entre Web e Mobile. O trabalho já documentado neste arquivo é mantido.',
    confirmLabel: 'Trocar plataforma',
    cancelLabel: 'Cancelar',
    onConfirm: () => {
      window._a11yForceHomeOriginStep = true;
      if (typeof navigate === 'function') navigate('view-home');
    }
  });
}
window.confirmBackToHome = confirmBackToHome;

// Modal de confirmação GENÉRICO (sim/não) — #a11y-confirm-modal (modals.html).
// Reutilizável por qualquer fluxo futuro que precise de uma pausa de
// confirmação antes de agir (hoje só confirmBackToHome usa). Callback fica
// em window._a11yConfirmModalOnConfirm porque onclick inline no HTML não
// consegue receber uma função como argumento; é one-shot, sempre limpo ao
// fechar (_closeA11yConfirmModal) pra não vazar pro próximo uso do modal.
function openA11yConfirmModal(opts) {
  const o = opts || {};
  const titleEl = document.getElementById('a11y-confirm-modal-title-text');
  const bodyEl = document.getElementById('a11y-confirm-modal-body');
  const confirmBtn = document.getElementById('a11y-confirm-modal-confirm-btn');
  const cancelBtn = document.getElementById('a11y-confirm-modal-cancel-btn');
  if (titleEl) titleEl.textContent = o.title || 'Confirmar ação';
  if (bodyEl) bodyEl.textContent = o.body || '';
  if (confirmBtn) confirmBtn.textContent = o.confirmLabel || 'Confirmar';
  if (cancelBtn) cancelBtn.textContent = o.cancelLabel || 'Cancelar';
  window._a11yConfirmModalOnConfirm = typeof o.onConfirm === 'function' ? o.onConfirm : null;
  if (typeof openModal === 'function') openModal('a11y-confirm-modal');
  if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
}
window.openA11yConfirmModal = openA11yConfirmModal;

// Botão "Confirmar" do #a11y-confirm-modal — dispara o callback guardado e
// fecha. Fechar ANTES de chamar onConfirm (em vez de depois) porque
// callbacks como o de confirmBackToHome chamam navigate(), que já teria que
// lidar com o modal de confirmação ainda visível por cima da view nova.
function _confirmA11yConfirmModal() {
  const cb = window._a11yConfirmModalOnConfirm;
  window._a11yConfirmModalOnConfirm = null;
  if (typeof closeModal === 'function') closeModal('a11y-confirm-modal');
  if (typeof cb === 'function') cb();
}
window._confirmA11yConfirmModal = _confirmA11yConfirmModal;

// Botão "Cancelar"/"X"/backdrop/Escape do #a11y-confirm-modal — fecha sem
// fazer nada (nenhuma navegação, nenhum efeito colateral). Limpa o callback
// pendente pra garantir que um Escape não deixe uma ação "presa" pro
// próximo uso do modal.
function _closeA11yConfirmModal() {
  window._a11yConfirmModalOnConfirm = null;
  if (typeof closeModal === 'function') closeModal('a11y-confirm-modal');
}
window._closeA11yConfirmModal = _closeA11yConfirmModal;

// Abre a modal "Sobre o hac" (botão CAIXA|HAC no header) já preenchendo
// #about-hac-project-origin com a plataforma atual do arquivo (ou "Não
// definida" nos arquivos legados/ainda não perguntados) — o botão "Trocar"
// ao lado chama openA11yProjectOriginPrompt acima.
function openAboutHacModal() {
  const originLabelEl = document.getElementById('about-hac-project-origin');
  if (originLabelEl) {
    const origin = getA11yProjectOrigin();
    originLabelEl.textContent = origin === 'mobile' ? 'Mobile' : origin === 'web' ? 'Web' : 'Não definida';
  }
  openModal('about-hac-modal');
}
window.openAboutHacModal = openAboutHacModal;

// Modal informativo "Handoff já existe neste arquivo" (2026-09-10) — aberta
// só quando a resposta de check-other-designers-sections (messages.js) traz
// pelo menos uma Section de outro designer. `sections` é o array
// otherDesignersSections vindo do backend ({ name, ownerId }[]). Nunca
// bloqueia nenhuma ação — só "Entendi" pra fechar, sem nenhum botão de
// decisão (trocar de usuário/ver histórico ficam fora de escopo).
function openA11yOtherDesignerModal(sections) {
  const body = document.getElementById('a11y-other-designer-body');
  if (!body) return;
  const list = Array.isArray(sections) ? sections : [];
  if (list.length === 0) return;

  // Nome do designer é o que sobra do formato "[HAC] Handoff de
  // Acessibilidade | timestamp | Nome | vN.N" — Sections antigas (formato
  // pré-2026-09-10, sem esse separador) caem no fallback genérico.
  const extractDesignerName = (sectionName) => {
    const parts = String(sectionName || '').split('|').map(s => s.trim());
    return (parts.length >= 3 && parts[2]) ? parts[2] : 'outro designer';
  };
  const names = list.map(s => extractDesignerName(s.name));

  let message;
  if (names.length === 1) {
    message = `Já existe documentação do HAC feita por <strong>${names[0]}</strong> neste arquivo.`;
  } else {
    const [first, ...rest] = names;
    message = `Já existe documentação do HAC feita por <strong>${first}</strong> e outros ${rest.length} designer${rest.length > 1 ? 's' : ''} neste arquivo.`;
  }

  body.innerHTML = `
    <p class="text-dsc-label-tiny normal-case tracking-normal text-slate-600 dark:text-dark-muted leading-relaxed">${message}</p>
    <p class="text-dsc-label-tiny normal-case tracking-normal text-slate-600 dark:text-dark-muted leading-relaxed">Seu trabalho fica isolado numa Section própria. Nada do que você fizer sobrescreve o handoff já existente. Combine com a equipe se o objetivo é complementar a mesma documentação.</p>
  `;
  openModal('a11y-other-designer-modal');
  if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
}
window.openA11yOtherDesignerModal = openA11yOtherDesignerModal;

// Alerta "handoff próprio já iniciado" (2026-09-10, texto revisado em
// 2026-09-11) — populado a partir da resposta de check-my-prior-session
// (messages.js), disparada no mesmo momento que
// check-other-designers-sections (ver ensureA11yProjectOriginThen acima).
// Diferente do modal de outro designer: aqui é o PRÓPRIO designer reabrindo
// o arquivo (ou trocando de máquina/sessão) e encontrando telas que ele
// mesmo já documentou. `priorSession` é { name, ownerId, version, areaCount,
// timestamp, designerName, sectionId } vindo do backend
// (_findOwnPriorSessionSection, code.js — timestamp/designerName extraídos
// do nome da Section com o mesmo split usado aqui por extractDesignerName).
// Pra N, preferimos a11yAreas (já carregado nesse ponto do fluxo, é a mesma
// fonte que a lista de telas documentadas exibe) e só caímos pra
// priorSession.areaCount — uma contagem aproximada feita no canvas — se
// a11yAreas ainda não estiver populado.
// 2026-09-11: removida a frase "Continue de onde parou" — promessa falsa,
// não existe hoje nenhum mecanismo de retomada/reidratação real a partir do
// canvas (decisão explícita do usuário, ver docs/tecnico.html). No lugar,
// ganhou um botão "Ver no canvas" — a única ação de retomada honesta que
// existe: focar a Section no Figma (focusNode, já usado no resto do
// projeto), não reconstruir nenhum dado.
function renderA11yPriorSessionAlert(priorSession) {
  const el = document.getElementById('a11y-prior-session-alert');
  if (!el || !priorSession) return;

  const areaCount = (Array.isArray(a11yAreas) && a11yAreas.length > 0)
    ? a11yAreas.length
    : (priorSession.areaCount || 0);
  // 'rascunho' (2026-09-24, revisão do modelo de versionamento) — texto,
  // não número: nunca foi finalizado ainda. "versão rascunho" leria mal, daí
  // o texto muda de forma pra esse caso em vez de só interpolar o valor cru.
  const version = priorSession.version || 'rascunho';
  const versionText = version === 'rascunho' ? 'ainda em rascunho (não finalizado)' : `versão ${version}`;
  const timestamp = priorSession.timestamp || null;
  const designerName = priorSession.designerName || null;
  const sectionId = priorSession.sectionId || null;

  const whenBy = timestamp && designerName
    ? `Handoff iniciado em ${timestamp} por ${designerName}`
    : 'Handoff já iniciado neste arquivo';

  el.innerHTML = `
    <i data-lucide="history" class="w-4 h-4 text-[#005ca9] dark:text-blue-300 shrink-0 mt-0.5" aria-hidden="true"></i>
    <div class="flex-1 min-w-0">
      <p class="text-dsc-label-tiny normal-case tracking-normal font-bold text-[#005ca9] dark:text-blue-300">${whenBy}</p>
      <p class="text-dsc-label-tiny normal-case tracking-normal text-[#005ca9]/80 dark:text-blue-300/80 leading-relaxed mt-0.5">${areaCount} tela${areaCount === 1 ? '' : 's'}, ${versionText}.</p>
      ${sectionId ? `<button type="button" onclick="focusNode('${sectionId}')" class="mt-1 text-dsc-label-tiny normal-case tracking-normal font-bold text-[#005ca9] dark:text-blue-300 underline hover:no-underline">Ver no canvas</button>` : ''}
    </div>
    <button type="button" onclick="this.closest('#a11y-prior-session-alert').classList.add('hidden')" title="Dispensar" aria-label="Dispensar" class="p-1 text-[#005ca9]/60 hover:text-[#005ca9] dark:text-blue-300/60 dark:hover:text-blue-300 transition-colors shrink-0">
      <i data-lucide="x" class="w-3.5 h-3.5" aria-hidden="true"></i>
    </button>
  `;
  el.classList.remove('hidden');
  if (typeof _refreshIcons === 'function') _refreshIcons();
}
window.renderA11yPriorSessionAlert = renderA11yPriorSessionAlert;

// ── Detecção Automática pós-Marcar-Área ─────────────────────────────────
// A detecção nasce escopada ao elemento que ACABOU de virar Área
// (targetNodeId, já resolvido no backend em create-a11y-area).
// a11y-area-created (messages.js) só chama isto quando area.autoDetect é
// truthy (Manual não abre modal nenhum).
//
// A origem web/mobile usada pra retropreencher Título/Decorativo desta
// varredura vem de hacData.projectOrigin (ensureA11yProjectOriginThen),
// nunca mais perguntada aqui isoladamente — ver bloco "Origem do projeto"
// acima para o histórico da decisão.
// Wrapper do botão "ou usar Mapeamento Automático" da tab Leitor de Tela
// (2026-09-04-g) — resolve o objeto `area` ATUAL a partir do areaId (o
// onclick só pode passar uma string, não o objeto completo com segurança)
// e delega pra openA11yPostAreaDetectModal, o mesmo caminho já usado hoje
// por _resumeA11yBatchWizardForArea pra retomar detecção numa área
// existente.
function _startA11yMappingFromLeitorTab(areaId) {
  const area = _findA11yAreaById(areaId);
  if (!area) {
    showToast('Não foi possível localizar a tela.');
    return;
  }
  openA11yPostAreaDetectModal(area);
}
window._startA11yMappingFromLeitorTab = _startA11yMappingFromLeitorTab;

function openA11yPostAreaDetectModal(area) {
  if (!area || !area.targetNodeId) return;
  window._a11yPendingDetectionArea = {
    targetNodeId: area.targetNodeId,
    areaId: area.id,
    label: area.label,
    declaredOrigin: null,
  };
  ensureA11yProjectOriginThen((origin) => {
    const pending = window._a11yPendingDetectionArea;
    if (!pending) return;
    pending.declaredOrigin = origin;
    const loadingText = document.getElementById('a11y-post-area-loading-text');
    if (loadingText) loadingText.textContent = 'Detectando componentes…';
    _setA11yPostAreaModalStage('loading');
    openModal('a11y-post-area-detect-modal');
    runA11yPostAreaDetection();
  });
}
window.openA11yPostAreaDetectModal = openA11yPostAreaDetectModal;

// Resposta do designer à pergunta bloqueante de origem — único jeito de sair
// do estado de pergunta da modal #a11y-post-area-detect-modal. Reaproveitada
// por ensureA11yProjectOriginThen/openA11yProjectOriginPrompt (window.
// _a11yPendingOriginCallback sempre setado por quem abriu a pergunta).
function chooseA11yDetectionOrigin(origin) {
  if (origin !== 'web' && origin !== 'mobile') return;
  if (typeof window._a11yPendingOriginCallback !== 'function') return;
  const callback = window._a11yPendingOriginCallback;
  window._a11yPendingOriginCallback = null;
  closeModal('a11y-post-area-detect-modal');
  _restoreA11yPostAreaModalTitle();
  callback(origin);
}
window.chooseA11yDetectionOrigin = chooseA11yDetectionOrigin;

// Restaura o título/ícone padrão ("Processando") da modal reaproveitada —
// chamado depois que openA11yProjectOriginPrompt (troca manual via "Sobre o
// hac") troca temporariamente esse título. Nome genérico (2026-09-16, pedido
// do usuário) porque este mesmo modal de loading é reaproveitado por vários
// fluxos além da Detecção Automática (Ordem de Tabulação, Trilha de Swipe,
// wizard de specs, salvamento manual) — "Detecção Automática" era enganoso
// nesses outros contextos. O texto do estado "loading"
// (#a11y-post-area-loading-text) já é customizado por chamada
// (showA11yCanvasLoading) e continua descrevendo a ação real em curso; só o
// título do dialog precisava generalizar.
function _restoreA11yPostAreaModalTitle() {
  const originTitle = document.getElementById('a11y-post-area-title');
  if (originTitle) originTitle.innerHTML = '<i data-lucide="radar" class="w-4 h-4 text-[#005ca9]" aria-hidden="true"></i> Processando';
  if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
}

// (Removida em 2026-09-02: _askTabOrderOriginThen, que perguntava a origem
// web/mobile de novo, do zero, toda vez que a Ordem de Tabulação rodava —
// decisão de 2026-09-01. Substituída por ensureA11yProjectOriginThen
// (bloco "Origem do projeto" acima), que reaproveita hacData.projectOrigin
// já respondido pela primeira ação do arquivo. startTabOrderManualMode e
// _confirmGenerateTabOrderFromLayers chamam ensureA11yProjectOriginThen
// diretamente; window._tabOrderDeclaredOrigin continua existindo como cache
// da origem durante a sessão de revisão, lido por _tabOrderRequestPreview e
// applyTabOrderToCanvas — só a pergunta repetida foi eliminada.)

function closeA11yPostAreaDetectModal() {
  closeModal('a11y-post-area-detect-modal');
  window._a11yPendingDetectionArea = null;
}
window.closeA11yPostAreaDetectModal = closeA11yPostAreaDetectModal;

// Loading genérico de canvas (2026-09-14, pedido do usuário: "loading na
// hora que estiver criando as layers, vale pra todas funcionalidades").
// Reaproveita o mesmo modal/spinner já usado pela varredura pós-Marcar-Área
// (#a11y-post-area-detect-modal, estado 2 "loading") — não é um componente
// novo, só um ponto único pra abrir/fechar esse estado com texto
// customizável. Usado por qualquer operação que desenha layers reais no
// canvas e precisa de segundos pra responder (fontes + import de componente
// real da lib, N selos em lote, etc.) — sem isso o plugin parece travado
// entre o clique e o resultado aparecer.
function showA11yCanvasLoading(text) {
  const loadingText = document.getElementById('a11y-post-area-loading-text');
  if (loadingText) loadingText.textContent = text || 'Processando…';
  _setA11yPostAreaModalStage('loading');
  openModal('a11y-post-area-detect-modal');
}
window.showA11yCanvasLoading = showA11yCanvasLoading;
function hideA11yCanvasLoading() {
  closeModal('a11y-post-area-detect-modal');
}
window.hideA11yCanvasLoading = hideA11yCanvasLoading;

// Achado de QA (wizard de revisão individual): entre o clique em "Aplicar"
// (fecha #a11y-spec-modal de forma síncrona) e a resposta 'spec-created'
// chegando (pode levar segundos — fontes + import de componente real da
// lib), não havia NENHUM feedback visual: o plugin parecia travado. Chamado
// em confirmA11ySpec logo depois de fechar o modal individual; escondido em
// _advanceA11yBatchWizard, no mesmo instante em que o próximo item abre (ou
// em que o wizard termina/é interrompido). Mantidas como wrappers nomeados
// (em vez de inlinar showA11yCanvasLoading direto nas chamadas) só pra não
// reescrever os call sites já existentes — mesmo comportamento de antes.
function showA11yWizardSavingIndicator() {
  showA11yCanvasLoading('Salvando especificação…');
}
function hideA11yWizardSavingIndicator() {
  hideA11yCanvasLoading();
}

// Agrega os 5 buckets do scan (components/icons/typography/vectors/images)
// que vierem com dscComponentMatch preenchido — components/icons cobrem os
// 16 componentes reais do DSC (confidence pode ser 'alta' ou 'baixa');
// typography/vectors só existem por heurística de nome de camada/estilo
// (categorias 'titulo'/'decorativo') e por isso vêm sempre 'baixa'. `images`
// (fills tipo IMAGE) também entra. Usado tanto no fluxo pós-Marcar-Área
// quanto no scan normal (messages.js, handler scan-result).
function _collectA11yDetections(data) {
  if (!data) return [];
  // Cada bucket já chega do backend ordenado por conformidade+alfabético
  // (correto pro Scan de Tokens, mas irrelevante aqui: a Detecção Automática
  // de a11y precisa da ordem estrutural real da árvore de camadas pra que as
  // tags sequenciais (A, B, C...) atribuídas no lote batam com a ordem em
  // que os elementos aparecem na página). `treeOrder` (índice de visita DFS
  // pré-order anexado por extractSpecs/addElement em code.js) sobrevive ao
  // spread genérico do backend. Ordenamos por ele como último passo — itens
  // sem treeOrder vão pro fim via `?? Infinity`.
  return [
    ...(data.components || []),
    ...(data.icons || []),
    ...(data.typography || []),
    ...(data.vectors || []),
    ...(data.images || []),
  ]
    .filter(c => c && c.dscComponentMatch)
    .sort((a, b) => (a.treeOrder ?? Infinity) - (b.treeOrder ?? Infinity));
}
window._collectA11yDetections = _collectA11yDetections;

// Coleta separada dos itens de category === 'typography' que NÃO viraram
// sugestão real (dscComponentMatch continua null/undefined) mas foram
// marcados pelo backend (needsA11yTokenReview) por não terem token DSC de
// tipografia vinculado. Nunca se mistura com _collectA11yDetections (que
// exige dscComponentMatch truthy) — são candidatos de aviso, não sugestões
// elegíveis pro lote.
function _collectA11yTokenReviewCandidates(data) {
  if (!data) return [];
  return (data.typography || []).filter(c => c && c.needsA11yTokenReview === true && !c.dscComponentMatch);
}
window._collectA11yTokenReviewCandidates = _collectA11yTokenReviewCandidates;

// nodeId (real, do canvas) de toda spec de a11y JÁ CONFIRMADA na área — toda
// spec nasce com targetNodeId = nodeId do elemento que a originou, então
// basta cruzar contra a11ySpecs pra saber "esse elemento já foi documentado
// nesta área?". Fonte única de verdade de dedupe por elemento, usada tanto
// pelo accordion "Não Documentados" quanto pelo filtro de elegibilidade do
// lote (ver _filterA11yBatchEligible) — extraída depois de um bug real em
// que as duas listas divergiam: o lote não cruzava contra a11ySpecs, então
// Detecção Automática + Reescanear reapresentava os MESMOS elementos já
// documentados como candidatos elegíveis, e confirmar de novo criava specs
// duplicadas sobre o mesmo targetNodeId (visualmente sobrepostas no canvas).
function _getDocumentedNodeIdsForArea(areaId) {
  if (!areaId) return new Set();
  return new Set(
    (a11ySpecs || [])
      .filter(s => s && s.a11yAreaId === areaId && s.targetNodeId)
      .map(s => s.targetNodeId)
  );
}
window._getDocumentedNodeIdsForArea = _getDocumentedNodeIdsForArea;

// Une as duas fontes de candidato do scan que hoje ficam presas dentro do
// modal de lote (window._a11yDetectionsByArea/_a11yTokenReviewByArea) e
// devolve só quem AINDA não virou spec nesta área — candidato do scan MENOS
// quem já tem spec confirmada pro mesmo nó (_getDocumentedNodeIdsForArea).
// Não guarda flag nenhuma — recalculado a cada render de _a11yAreaAccordionEl.
function _collectA11yUndocumentedForArea(areaId) {
  if (!areaId) return [];
  const documentedNodeIds = _getDocumentedNodeIdsForArea(areaId);

  const byArea = (window._a11yDetectionsByArea && window._a11yDetectionsByArea[areaId]) || [];
  const tokenByArea = (window._a11yTokenReviewByArea && window._a11yTokenReviewByArea[areaId]) || [];

  const fromDetections = byArea
    .filter(item => item && item.nodeId && item.dscComponentMatch && !documentedNodeIds.has(item.nodeId))
    .map(item => ({ kind: 'detection', item }));

  const fromTokenReview = tokenByArea
    .filter(item => item && item.nodeId && !documentedNodeIds.has(item.nodeId))
    .map(item => ({ kind: 'tokenReview', item }));

  return [...fromDetections, ...fromTokenReview]
    .sort((a, b) => (a.item.treeOrder ?? Infinity) - (b.item.treeOrder ?? Infinity));
}
window._collectA11yUndocumentedForArea = _collectA11yUndocumentedForArea;

// Ação de "criar spec" de um item da lista de pendentes — reaproveita o MESMO
// formulário manual (openA11yModal) que o botão "+ Nova spec" do card da área
// abre, só que já com categoria/subtipo pré-selecionados e o nó-alvo fixado
// (ver modal.dataset.pendingTargetNodeId em openA11yModal/confirmA11ySpec) —
// sem isso o formulário cairia na seleção atual do canvas, sem relação com
// o item clicado na lista.
// Ainda passa pela mesma checagem de vínculo da lib "Design Acessível" que
// o botão "+" normal usa. window._a11yLibCheckOnSuccess desvia a resposta
// bem-sucedida da checagem pro formulário direto, pulando o seletor de
// categoria — a categoria aqui já é conhecida, perguntar de novo seria
// redundante.
// Resolve categoria + preset (options de openA11yModal) a partir de um item
// de detecção/pendência JÁ EM MEMÓRIA — extraído de openA11yFormFromUndocumented
// pra ser reaproveitado tanto por ela (item chega serializado num onclick de
// HTML) quanto pelo wizard de revisão da Detecção Automática
// (_advanceA11yBatchWizard, item já vive na fila em memória, sem precisar
// serializar/desserializar). Única fonte de verdade do mapeamento
// categoria/preset — nunca duplicar esta lógica em outro lugar.
// `kind` é 'tokenReview' (texto sem token DSC, sem dscComponentMatch) ou
// 'detection' (default, com dscComponentMatch).
function _resolveA11yFormPresetFromItem(item, kind) {
  // Nome da camada do canvas (item.name === item.layerName, ver
  // _a11yScanArea/code.js) — já em memória desde o scan, sem precisar de
  // round-trip a mais pro backend. Alimenta o campo read-only "Camada no
  // canvas" do formulário (ver openA11yModal/prefillA11yComponentName).
  const targetNodeName = item.name || null;
  // Nome do pai imediato (2026-09-11) — sempre propagado pro formulário
  // quando o scan já resolveu (ver code.js:_a11yScanArea), independente
  // de categoria/match — mesmo raciocínio de targetNodeName acima.
  const immediateParentName = item.immediateParentName || null;

  if (kind === 'tokenReview') {
    // needsA11yTokenReview nunca tem dscComponentMatch — é só um texto sem
    // token DSC vinculado, sem componente real reconhecido. "Informações
    // Adicionais" é a categoria mais plausível pra um texto solto sem
    // função de título/componente clara — o designer troca de categoria
    // manualmente se o texto for na verdade outra coisa.
    return { category: 'informacoes', options: { pendingTargetNodeId: item.nodeId, targetNodeName, immediateParentName } };
  }

  const match = item.dscComponentMatch;
  const isUnmapped = match.isUnmapped === true;
  const shortName = match.a11yCategory;
  const category = (shortName === 'titulo' || shortName === 'decorativo' || shortName === 'estrutura') ? shortName : 'elemento';
  // Origem do componente DETECTADO — mesma fonte que o lote usa
  // (item.dscComponentMatch.origin). Em "elemento"/"estrutura" vem da lib do
  // componente DSC real (_resolveDscComponentA11yMatch, code.js). Em
  // "titulo"/"decorativo" (heurística de texto/ícone, sem componente real)
  // vem retropreenchida com a origin da Área Marcada
  // (handleA11yPostAreaDetectionResult, acima) — nunca fica undefined depois
  // do retropreenchimento, mas o fallback 'web' é mantido por segurança
  // (ex: item avulso fora do fluxo de Detecção Automática por Área).
  const a11yOrigin = match.origin || 'web';
  // Nome real do component set DSC (ex: "[dsc] Button") — null nas
  // heurísticas de texto/ícone (titulo/decorativo/imagem não têm
  // componente DSC real por trás, ver _resolveTypographyA11yMatch/
  // _resolveDecorativeA11yMatch/_resolveImageA11yMatch em code.js).
  const dscComponentName = match.containingFrame || null;

  if (isUnmapped) {
    // "Outro" dentro de Elementos e Imagens — mesmo componente sem
    // categoria catalogada que o lote usa. openA11yModal não tem preset
    // pronto pro caso "Outro" (select cai em 'outro' só quando
    // presetComponente é inválido/ausente, e o campo de texto livre
    // "Componente" fica vazio pro designer preencher) — o designer
    // confirma manualmente, igual seria digitando do zero.
    return { category: 'elemento', options: { pendingTargetNodeId: item.nodeId, a11yOrigin, dscComponentName, targetNodeName, immediateParentName } };
  }
  if (category === 'titulo') {
    return { category: 'titulo', options: { pendingTargetNodeId: item.nodeId, presetTituloNivel: match.suggestedLevel, a11yOrigin, dscComponentName, targetNodeName, immediateParentName } };
  }
  if (category === 'decorativo') {
    return { category: 'decorativo', options: { pendingTargetNodeId: item.nodeId, a11yOrigin, dscComponentName, targetNodeName, immediateParentName } };
  }
  if (category === 'estrutura') {
    const tipo = _inferA11yEstruturaTipoFromContainingFrame(match.containingFrame);
    return { category: 'estrutura', options: { pendingTargetNodeId: item.nodeId, presetEstruturaTipo: tipo, a11yOrigin, dscComponentName, targetNodeName, immediateParentName } };
  }
  return { category: 'elemento', options: { pendingTargetNodeId: item.nodeId, presetComponente: shortName, a11yOrigin, dscComponentName, targetNodeName, immediateParentName } };
}
window._resolveA11yFormPresetFromItem = _resolveA11yFormPresetFromItem;

function openA11yFormFromUndocumented(areaId, kind, encodedItem) {
  const item = JSON.parse(decodeURIComponent(encodedItem));
  window._a11yPendingAreaId = areaId || null;

  const openForm = () => {
    const { category, options } = _resolveA11yFormPresetFromItem(item, kind);
    openA11yModal(category, options);
  };

  window._a11yLibCheckOnSuccess = openForm;
  const token = 'a11y-lib-check-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  window._a11yLibCheckToken = token;
  parent.postMessage({ pluginMessage: { type: 'check-a11y-library', token } }, '*');
}
window.openA11yFormFromUndocumented = openA11yFormFromUndocumented;

// Dispara o mesmo scan de conformidade DSC, escopado ao targetNodeId da área
// (não a um frame) e com origin: 'a11y-detection' — o backend só repassa
// esse campo de volta na resposta; é o handler scan-result (messages.js)
// que usa esse campo pra rotear a resposta pra cá. Só é chamada depois que
// o designer já respondeu a pergunta de origem (chooseA11yDetectionOrigin já
// trocou a modal pro estado de loading antes de chamar esta função) — exceto
// no reaproveitamento como indicador de "salvando" do wizard
// (showA11yWizardSavingIndicator), que não passa por aqui.
// declaredOrigin viaja no payload só como registro/depuração do lado
// backend — quem de fato consome a escolha do designer é o frontend, em
// handleA11yPostAreaDetectionResult (retropreenchimento de Título/
// Decorativo desta passada).
function runA11yPostAreaDetection() {
  const pending = window._a11yPendingDetectionArea;
  if (!pending || !pending.targetNodeId) return;

  parent.postMessage({
    pluginMessage: {
      type: 'scan-frame',
      frameId: null,
      nodeId: pending.targetNodeId,
      isAudit: false,
      referenceTokens: null,
      selectedLibSlugs: null,
      categories: null,
      origin: 'a11y-detection',
      declaredOrigin: pending.declaredOrigin || null
    }
  }, '*');
}
window.runA11yPostAreaDetection = runA11yPostAreaDetection;

// Chamado pelo handler scan-result (messages.js) quando origin ===
// 'a11y-detection' — recebe as detecções já filtradas (components com
// dscComponentMatch). Guarda em window._a11yLooseDetections pra alimentar o
// botão de lote nesta sessão do modal (hac não tem frame, então não há
// persistência por-frame equivalente ao Handex).
//
// Ao terminar a varredura, pula direto pro modal de resumo do lote
// (openA11yBatchSummaryModal) quando há algo elegível, ou fecha o modal com
// um toast informativo quando não há. Segundo parâmetro opcional
// (tokenReviewCandidates) com os TEXT que parecem título mas não têm token
// DSC vinculado — só ganham um bloco de aviso no modal de resumo, nunca
// entram no lote em si nem geram spec sozinhos.
function handleA11yPostAreaDetectionResult(detections, tokenReviewCandidates) {
  // Restaura o botão de reescanear (spinner) se foi ele quem disparou esta
  // resposta. Feito aqui, não em rescanA11yBatchArea, porque a resposta é
  // assíncrona.
  if (window._a11yBatchRescanBtnPending) {
    window._a11yBatchRescanBtnPending = false;
    const rescanBtn = document.getElementById('btn-a11y-batch-rescan');
    if (rescanBtn) {
      rescanBtn.disabled = false;
      rescanBtn.classList.remove('animate-spin');
    }
    showToast('Tela reescaneada.');
  }

  window._a11yLooseDetections = detections;
  window._a11yTokenReviewCandidates = tokenReviewCandidates || [];

  // window._a11yLooseDetections é sobrescrito a cada varredura, então só
  // serve pro lote da ÚLTIMA área escaneada. O accordion "Não Documentados"
  // precisa enxergar os candidatos de TODAS as áreas já escaneadas na
  // sessão (o designer normalmente marca várias áreas antes de revisar
  // pendências), por isso acumulamos aqui por areaId em vez de substituir.
  // Não persiste entre sessões do plugin — um novo scan da mesma área
  // substitui só a entrada dela.
  const pendingAreaId = window._a11yPendingDetectionArea && window._a11yPendingDetectionArea.areaId;
  if (pendingAreaId) {
    window._a11yDetectionsByArea = window._a11yDetectionsByArea || {};
    window._a11yTokenReviewByArea = window._a11yTokenReviewByArea || {};
    window._a11yDetectionsByArea[pendingAreaId] = detections || [];
    window._a11yTokenReviewByArea[pendingAreaId] = tokenReviewCandidates || [];

    // Origem (web/mobile) desta PASSADA de scan — declarada explicitamente
    // pelo designer na pergunta bloqueante que abre a modal
    // (chooseA11yDetectionOrigin), NUNCA mais calculada por voto de maioria
    // entre os componentes detectados. Não é persistida em area.origin (esse
    // campo de schema deixou de ser escrito automaticamente aqui) — vale só
    // pra retropreencher Título/Decorativo desta execução do scan.
    // Título/Decorativo (heurística de texto/ícone, sem componente DSC real
    // por trás) nunca têm como calcular a própria origin no backend — ver
    // _resolveTypographyA11yMatch/_resolveDecorativeA11yMatch (code.js).
    // Retropreenche aqui, no frontend, com a origem declarada nesta rodada.
    // Muta os itens em `detections` in-place — o mesmo array já foi guardado
    // em window._a11yDetectionsByArea[pendingAreaId] acima, então o
    // retropreenchimento vale também pro accordion "Não Documentados", não
    // só pro lote desta passada.
    const declaredOrigin = window._a11yPendingDetectionArea.declaredOrigin || 'web';
    (detections || []).forEach(d => {
      if (d && d.dscComponentMatch && !d.dscComponentMatch.origin) {
        d.dscComponentMatch.origin = declaredOrigin;
      }
    });

    saveToStorage();
  }

  const eligible = _filterA11yBatchEligible(detections, pendingAreaId);
  const hasTokenReviewCandidates = window._a11yTokenReviewCandidates.length > 0;

  if ((!detections || detections.length === 0 || eligible.length === 0) && !hasTokenReviewCandidates) {
    window._a11yResumeWizardAfterScan = false;
    closeA11yPostAreaDetectModal();
    // Se esta resposta veio de um reescaneio (modal de resumo já aberto com
    // dados do scan anterior), fecha também o resumo — sem isso ele ficaria
    // visível mostrando um resultado que não existe mais.
    closeModal('a11y-batch-summary-modal');
    showToast('Nenhum componente do DSC reconhecido nessa tela. Anote manualmente.');
    return;
  }

  // Quando não há nada elegível pro lote mas existe pelo menos um candidato
  // de aviso, ainda vale abrir o modal de resumo (só pra mostrar o bloco de
  // aviso) em vez de fechar tudo com o toast de "nenhum componente
  // reconhecido", que seria enganoso.
  // Abre o resumo do lote ANTES de fechar o modal de detecção — precisa que
  // window._a11yPendingDetectionArea ainda esteja setado pra pré-selecionar
  // a área de origem no <select> (closeA11yPostAreaDetectModal zera essa
  // variável). closeModal direto (em vez do wrapper) evita empilhar os dois
  // modais visíveis ao mesmo tempo sem perder esse dado.
  openA11yBatchSummaryModal();
  closeModal('a11y-post-area-detect-modal');

  // Retomada via snackbar de "Revisão interrompida" (_resumeA11yBatchWizardForArea)
  // — pula direto pro wizard com o resultado do NOVO scan, sem exigir que o
  // designer veja o resumo e clique em "Iniciar Revisão" de novo.
  // openA11yBatchSummaryModal (acima) já populou window._a11yBatchDetections
  // e pré-selecionou a área no <select>, que é o que startA11yBatchWizard lê.
  if (window._a11yResumeWizardAfterScan) {
    window._a11yResumeWizardAfterScan = false;
    if (eligible.length > 0) startA11yBatchWizard();
  }
}
window.handleA11yPostAreaDetectionResult = handleA11yPostAreaDetectionResult;

// ── Lote "Mapeamento Automatizado" ────────────────────────────────────────
// Processa as detecções da área corrente (alta E baixa confiança, ver
// window._a11yLooseDetections) de uma vez: mostra um modal de resumo
// agregado, o designer escolhe a Área de destino (pré-requisito — toda spec
// de A11y precisa de a11yAreaId) e confirma uma única vez. O único caminho
// de criação a partir da Detecção Automática — sem confirmação item a item.
function _allA11yAreas() {
  return a11yAreas || [];
}

// Todo item com dscComponentMatch é elegível pro lote — inclui 'titulo'
// (nasce como H1) e 'decorativo' (nasce como subtipo "gerais"), sempre com o
// default mais comum. Decisão consciente do usuário: velocidade acima de
// precisão perfeita — o designer revisa/corrige nível de título e subtipo
// decorativo manualmente depois, em vez de precisar confirmar item a item.
// Também elegível quando dscComponentMatch.isUnmapped === true (componente
// DSC real reconhecido, mas sem categoria de a11y catalogada) — vira
// sugestão "Outro" em elemento.
// `areaId` opcional: quando informado, exclui candidatos cujo nodeId já tem
// spec confirmada NESSA área (_getDocumentedNodeIdsForArea) — sem isso, um
// Reescanear (ou reabrir o resumo) sobre uma área que já teve specs criadas
// reapresenta os mesmos elementos como elegíveis, e confirmar de novo nasce
// specs duplicadas sobre o mesmo targetNodeId (ver bug real documentado em
// _getDocumentedNodeIdsForArea).
function _filterA11yBatchEligible(detections, areaId) {
  const documentedNodeIds = areaId ? _getDocumentedNodeIdsForArea(areaId) : null;
  return (detections || []).filter(d => d && d.dscComponentMatch
    && (d.dscComponentMatch.a11yCategory || d.dscComponentMatch.isUnmapped === true)
    && !(documentedNodeIds && d.nodeId && documentedNodeIds.has(d.nodeId)));
}

// Fonte das detecções pro lote — hac não tem frame, sempre a última
// varredura em memória.
function _currentA11yDetectionsSource() {
  return window._a11yLooseDetections || [];
}

// Reescaneia a mesma área SEM fechar o modal de resumo, pro caso em que o
// designer vincula um Text Style do DSC num item do bloco "Possíveis
// títulos sem token DSC" (ou corrige qualquer outra coisa no Figma) e quer
// ver o resultado atualizado sem perder o contexto (área selecionada,
// scroll, etc.). Passa pela MESMA pergunta bloqueante de origem que a
// Detecção Automática inicial — decisão explícita do usuário: a modal
// aparece toda vez que o scan roda, mesmo reescaneando uma área já
// respondida antes (a lib pode até ter mudado entre uma passada e outra).
// Empilha #a11y-post-area-detect-modal por cima de #a11y-batch-summary-modal
// (ambos ficam tecnicamente abertos; o de resumo só é fechado/reaberto por
// handleA11yPostAreaDetectionResult quando a resposta do scan chega).
function rescanA11yBatchArea() {
  const pending = window._a11yPendingDetectionArea;
  if (!pending || !pending.targetNodeId) {
    showToast('Não foi possível identificar a tela para reescanear. Selecione novamente.');
    return;
  }
  const btn = document.getElementById('btn-a11y-batch-rescan');
  if (btn) {
    btn.disabled = true;
    btn.classList.add('animate-spin');
  }
  window._a11yBatchRescanBtnPending = true;
  pending.declaredOrigin = null;
  // A escolha de origem só tem efeito através de chooseA11yDetectionOrigin,
  // que exige window._a11yPendingOriginCallback setado (mesmo contrato de
  // ensureA11yProjectOriginThen/openA11yProjectOriginPrompt) — sem isso o
  // clique em Web/Mobile não faz nada e a modal fica travada nessa tela
  // (bug real: reescanear nunca setava esse callback, 2026-09-03).
  window._a11yPendingOriginCallback = (origin) => {
    pending.declaredOrigin = origin;
    const loadingText = document.getElementById('a11y-post-area-loading-text');
    if (loadingText) loadingText.textContent = 'Detectando componentes…';
    _setA11yPostAreaModalStage('loading');
    openModal('a11y-post-area-detect-modal');
    runA11yPostAreaDetection();
  };
  _setA11yPostAreaModalStage('origin');
  openModal('a11y-post-area-detect-modal');
}
window.rescanA11yBatchArea = rescanA11yBatchArea;

function openA11yBatchSummaryModal() {
  const allDetections = _currentA11yDetectionsSource();
  // areaId usado pro dedupe de elegibilidade é o MESMO que pré-seleciona o
  // <select> mais abaixo (window._a11yPendingDetectionArea.areaId, com
  // fallback pra primeira área ordenada) — o <select> não tem onchange (não
  // há re-render dinâmico da lista ao trocar de área neste modal hoje), por
  // isso a lista exibida já nasce filtrada contra a área de destino real.
  // Trocar de área no dropdown sem reabrir o modal é um caso não coberto
  // aqui — startA11yBatchWizard lê areaSelect.value no momento em que o
  // wizard é iniciado, então usa a área realmente selecionada (mesmo que
  // diferente de filterAreaId usado só pra esta exibição). O dedupe contra
  // specs já confirmadas (_getDocumentedNodeIdsForArea) só acontece aqui, na
  // montagem da lista exibida — diferente do antigo loop de lote, o wizard
  // NÃO recalcula esse dedupe a cada item confirmado, já que cada item passa
  // por revisão humana individual antes de virar spec (o próprio designer
  // vê o elemento e decide se já foi documentado).
  const pendingAreaIdForFilter = window._a11yPendingDetectionArea && window._a11yPendingDetectionArea.areaId;
  const sortedAreasForFilter = [..._allA11yAreas()].sort((a, b) => (a.number || 0) - (b.number || 0));
  const filterAreaId = pendingAreaIdForFilter && sortedAreasForFilter.some(a => a.id === pendingAreaIdForFilter)
    ? pendingAreaIdForFilter
    : (sortedAreasForFilter[0] ? sortedAreasForFilter[0].id : null);
  const detections = _filterA11yBatchEligible(allDetections, filterAreaId);
  const skippedCount = allDetections.length - detections.length;
  const tokenReviewCandidates = window._a11yTokenReviewCandidates || [];
  if (detections.length === 0 && tokenReviewCandidates.length === 0) return;

  const areas = _allA11yAreas();
  if (detections.length > 0 && areas.length === 0) {
    showToast('Selecione uma tela antes de gerar o handoff automatizado.');
    return;
  }

  // Agrupa por shortName de componente, pra mostrar contagem agregada ("2
  // Accordion") em vez de listar item a item. A antiga distinção de
  // confiança alta/baixa foi removida do agrupamento e da exibição: com o
  // wizard sequencial, todo item passa por revisão humana individual de
  // qualquer forma, então a distinção virou ruído sem efeito prático
  // (decisão de produto, 2026-09-02) — o campo dscComponentMatch.confidence
  // continua existindo no dado bruto (ver _resolveDscComponentA11yMatch,
  // code.js), só não influencia mais nada visível pro designer aqui. Itens
  // com dscComponentMatch.isUnmapped agrupam por containingFrame (nome do
  // component set DSC real, ex: "[dsc] Alert") em vez de a11yCategory (que
  // vem null nesse caso). 'estrutura' agrupa por containingFrame também no
  // caso mapeado (não só isUnmapped): "[dsc] Header" e "[dsc] Footer"
  // resolvem pro mesmo shortName 'estrutura', mas são marcos de navegação
  // DIFERENTES.
  const groups = {};
  detections.forEach(item => {
    const isUnmapped = item.dscComponentMatch.isUnmapped === true;
    const shortName = isUnmapped ? null : item.dscComponentMatch.a11yCategory;
    const containingFrame = item.dscComponentMatch.containingFrame;
    const key = isUnmapped ? ('outro|' + containingFrame)
      : shortName === 'estrutura' ? ('estrutura|' + containingFrame)
      : shortName;
    if (!groups[key]) groups[key] = { shortName, containingFrame, isUnmapped, count: 0 };
    groups[key].count++;
  });
  const groupList = Object.values(groups).sort((a, b) => {
    const labelA = a.isUnmapped ? _cleanDscContainingFrameName(a.containingFrame) : (A11Y_COMPONENTE_LABELS[a.shortName] || a.shortName);
    const labelB = b.isUnmapped ? _cleanDscContainingFrameName(b.containingFrame) : (A11Y_COMPONENTE_LABELS[b.shortName] || b.shortName);
    return labelA.localeCompare(labelB);
  });

  // Reseta o accordion pra fechado a cada abertura do modal (não deve
  // herdar o estado de um lote anterior) e atualiza o contador do
  // cabeçalho com o total agregado de grupos+itens.
  const groupsBlock = document.getElementById('a11y-batch-summary-groups-block');
  const groupsTitle = document.getElementById('a11y-batch-summary-groups-title');
  if (groupsBlock && groupsTitle) {
    const totalItems = groupList.reduce((sum, g) => sum + g.count, 0);
    groupsTitle.textContent = `Componentes detectados (${groupList.length} grupo${groupList.length === 1 ? '' : 's'}, ${totalItems} ${totalItems === 1 ? 'item' : 'itens'})`;
    const groupsToggleBtn = groupsBlock.querySelector('button[onclick^="toggleAccordion"]');
    const groupsContent = groupsBlock.querySelector('.accordion-content');
    const groupsChevron = groupsToggleBtn ? groupsToggleBtn.querySelector('[data-lucide="chevron-down"]') : null;
    if (groupsContent) groupsContent.classList.add('hidden');
    if (groupsToggleBtn) groupsToggleBtn.setAttribute('aria-expanded', 'false');
    if (groupsChevron) groupsChevron.style.transform = 'rotate(0deg)';
  }

  const groupsWrap = document.getElementById('a11y-batch-summary-groups');
  if (groupsWrap) {
    groupsWrap.innerHTML = groupList.map(g => {
      const label = g.isUnmapped
        ? `Outro (${_cleanDscContainingFrameName(g.containingFrame)})`
        : g.shortName === 'estrutura' ? `Estrutura da Página (${_cleanDscContainingFrameName(g.containingFrame)})`
        : (A11Y_COMPONENTE_LABELS[g.shortName] || _capitalizeFirst(g.shortName));
      return `
        <div class="flex items-center gap-dsc-nano px-dsc-micro py-dsc-nano rounded-dsc-medium border bg-gray-50 dark:bg-dark-bg border-gray-100 dark:border-dark-line">
          <div class="w-6 h-6 rounded-dsc-circ flex items-center justify-center shrink-0 text-dsc-label-tiny normal-case tracking-normal font-extrabold bg-[#FFF6DC] text-[#FCBE05]">${g.count}</div>
          <p class="flex-1 text-dsc-label-tiny normal-case tracking-normal font-semibold text-slate-700 dark:text-white">${escapeHtml(label)}</p>
        </div>
      `;
    }).join('');
  }

  // Select/botão de lote só fazem sentido quando há algo elegível; no caso
  // "só aviso" ficam ocultos/desabilitados em vez de forçar escolha de área
  // sem propósito.
  const areaSelect = document.getElementById('a11y-batch-area-select');
  const areaWrap = document.getElementById('a11y-batch-area-wrap');
  if (areaWrap) areaWrap.classList.toggle('hidden', detections.length === 0);
  if (areaSelect && detections.length > 0) {
    const sortedAreas = [...areas].sort((a, b) => (a.number || 0) - (b.number || 0));
    areaSelect.innerHTML = sortedAreas.map(a => `<option value="${escapeHtml(a.id)}">${escapeHtml(String(a.number))}  ${escapeHtml(a.label)}</option>`).join('');
    // Pré-seleciona a área que originou a detecção (fluxo pós-Marcar-Área),
    // quando existir — mais previsível que sempre cair na primeira da lista.
    const pendingAreaId = window._a11yPendingDetectionArea && window._a11yPendingDetectionArea.areaId;
    const preselected = pendingAreaId && sortedAreas.some(a => a.id === pendingAreaId) ? pendingAreaId : (sortedAreas[0] ? sortedAreas[0].id : '');
    areaSelect.value = preselected;
    // Só uma área: não faz sentido exigir escolha, mas deixa visível pra
    // transparência (o designer vê onde as specs vão nascer).
    if (areaWrap) areaWrap.classList.toggle('opacity-60', sortedAreas.length === 1);
    if (sortedAreas.length === 1 && areaSelect) areaSelect.disabled = true;
    else if (areaSelect) areaSelect.disabled = false;
  }

  // Botão passou de "Criar N Especificações" (criação direta em lote) pra
  // "Iniciar Revisão (N itens)" — chama startA11yBatchWizard, que abre o
  // wizard sequencial de confirmação individual (ver decisão de produto:
  // todo item detectado exige confirmação, sem exceção de categoria).
  const confirmBtn = document.getElementById('btn-a11y-batch-confirm');
  if (confirmBtn) {
    confirmBtn.classList.toggle('hidden', detections.length === 0);
    confirmBtn.textContent = `Iniciar Revisão (${detections.length} ${detections.length === 1 ? 'item' : 'itens'})`;
    confirmBtn.disabled = detections.length === 0;
  }

  // _filterA11yBatchEligible não exclui mais categoria nenhuma (titulo/
  // decorativo entram no lote com defaults) — skippedCount só fica > 0 hoje
  // quando o Reescanear reencontra elementos que já viraram spec confirmada
  // nesta área (dedupe por targetNodeId, ver _getDocumentedNodeIdsForArea).
  const skippedNotice = document.getElementById('a11y-batch-summary-skipped-notice');
  if (skippedNotice) {
    if (skippedCount > 0) {
      skippedNotice.textContent = `${skippedCount} ${skippedCount === 1 ? 'item' : 'itens'} não ${skippedCount === 1 ? 'entra' : 'entram'} nesta revisão.`;
      skippedNotice.classList.remove('hidden');
    } else {
      skippedNotice.classList.add('hidden');
    }
  }

  // Renderiza o bloco de aviso (fica oculto se não houver nenhum candidato).
  // Cada item ganha um botão de foco no canvas — nenhuma ação de criação de
  // spec aqui.
  const tokenReviewBlock = document.getElementById('a11y-token-review-block');
  const tokenReviewList = document.getElementById('a11y-token-review-list');
  const tokenReviewTitle = document.getElementById('a11y-token-review-title');
  if (tokenReviewBlock && tokenReviewList) {
    if (tokenReviewCandidates.length === 0) {
      tokenReviewBlock.classList.add('hidden');
      tokenReviewList.innerHTML = '';
    } else {
      tokenReviewBlock.classList.remove('hidden');
      if (tokenReviewTitle) tokenReviewTitle.textContent = `Possíveis títulos sem token DSC (${tokenReviewCandidates.length})`;
      // Sempre reabre fechado (estado do accordion não deve persistir entre
      // lotes diferentes).
      const tokenReviewToggleBtn = tokenReviewBlock.querySelector('button[onclick^="toggleAccordion"]');
      const tokenReviewContent = tokenReviewBlock.querySelector('.accordion-content');
      const tokenReviewChevron = tokenReviewToggleBtn ? tokenReviewToggleBtn.querySelector('[data-lucide="chevron-down"]') : null;
      if (tokenReviewContent) tokenReviewContent.classList.add('hidden');
      if (tokenReviewToggleBtn) tokenReviewToggleBtn.setAttribute('aria-expanded', 'false');
      if (tokenReviewChevron) tokenReviewChevron.style.transform = 'rotate(0deg)';
      tokenReviewList.innerHTML = tokenReviewCandidates.map(item => `
        <div class="flex items-center gap-dsc-nano px-dsc-micro py-dsc-nano rounded-dsc-medium border bg-amber-50/60 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/40">
          <i data-lucide="alert-circle" class="w-3.5 h-3.5 text-amber-500 shrink-0" aria-hidden="true"></i>
          <p class="flex-1 text-dsc-label-tiny normal-case tracking-normal font-semibold text-slate-700 dark:text-white truncate" title="${escapeHtml(item.layerName || item.name || 'Elemento')}">${escapeHtml(item.layerName || item.name || 'Elemento')}</p>
          <button type="button" onclick="focusNode('${item.nodeId}')" title="Focar no canvas" aria-label="Focar no canvas"
            class="shrink-0 w-6 h-6 flex items-center justify-center rounded-dsc-small text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors">
            <i data-lucide="crosshair" class="w-3.5 h-3.5" aria-hidden="true"></i>
          </button>
        </div>
      `).join('');
      if (typeof _refreshIcons === 'function') _refreshIcons();
    }
  }

  window._a11yBatchDetections = detections;
  openModal('a11y-batch-summary-modal');
}
window.openA11yBatchSummaryModal = openA11yBatchSummaryModal;

function closeA11yBatchSummaryModal() {
  closeModal('a11y-batch-summary-modal');
}
window.closeA11yBatchSummaryModal = closeA11yBatchSummaryModal;

// Espera a resposta 'spec-created' (messages.js) de UMA chamada de
// 'create-unified-spec' antes de disparar a próxima — necessário porque o
// backend calcula posição/import da lib de forma assíncrona por chamada;
// sem serializar, duas criações concorrentes poderiam colidir. Timeout de
// segurança evita travar o wizard inteiro se uma resposta nunca chegar.
// Reaproveitado por confirmA11ySpec quando modal.dataset.wizardActive === '1'
// (decisão de produto: só o wizard precisa serializar — o fluxo manual
// normal continua fire-and-forget, um modal por vez).
function _createA11ySpecAndWait(opts) {
  return new Promise(resolve => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      window._a11yBatchCreateResolve = null;
      resolve(ok);
    };
    const timeoutId = setTimeout(() => finish(false), 15000);
    window._a11yBatchCreateResolve = (ok) => { clearTimeout(timeoutId); finish(ok); };
    parent.postMessage({ pluginMessage: { type: 'create-unified-spec', opts } }, '*');
  });
}

// IDs (node.id reais no canvas) das specs já criadas na mesma Área Marcada E
// na mesma categoria (a11yType) — usado pelo backend (create-unified-spec,
// code.js) pra alinhar o card novo na mesma SUB-COLUNA X das demais specs
// da área+categoria, independente de letra/lado do conector. Categorias
// diferentes da mesma área ganham colunas X distintas (chave composta
// areaId::a11yType) — por isso o filtro aqui precisa dos dois campos.
function _collectAreaSiblingSpecIds(areaId, a11yType) {
  if (!areaId) return [];
  return (a11ySpecs || [])
    .filter(s => s && s.a11yAreaId === areaId && s.a11yType === a11yType && s.id)
    .map(s => s.id);
}

// Todas as specs da mesma área, de QUALQUER categoria — usado pelo backend
// só quando a categoria da spec sendo criada ainda não tem nenhuma spec na
// área (existingAreaSpecIds vem vazio nesse caso): precisa achar a coluna
// mais à direita já ocupada por OUTRA categoria da mesma área pra
// posicionar a nova sub-coluna ao lado dela.
function _collectAreaAllSpecIds(areaId) {
  if (!areaId) return [];
  return (a11ySpecs || [])
    .filter(s => s && s.a11yAreaId === areaId && s.id)
    .map(s => s.id);
}

// Próxima tag livre DENTRO DA ÁREA de destino. Cada área tem seu próprio
// namespace de tags — sem isso o lote poderia começar em "K" (ou "5") mesmo
// numa área nova, sem nenhuma relação com o que já existe ali. Reaproveitada
// também por openA11yModal (equivalente do _suggestNextSpecTag do Handex,
// que olhava createdSpecs/a11ySpecs por frame — aqui não há frame, então a
// próxima tag é sempre por área).
//
// "elemento" (Elementos e Imagens) sugere NÚMERO (1, 2, 3...) desde
// 2026-09-18, pedido explícito do usuário: "pra não conflitar com o nível
// de título" (marcador de Título usa letra "H"/"H1"-"H6"). "estrutura" e
// "informacoes" continuam sugerindo LETRA (A, B, C...) — mantidas como
// estavam, fora deste pedido.
function _suggestNextA11yTagForArea(areaId, category) {
  const specs = (a11ySpecs || []).filter(s => s && s.a11yAreaId === areaId);
  if (category === 'elemento') {
    const usedBaseNumbers = new Set();
    specs.forEach(s => {
      const raw = String((s && s.letter) || '').trim();
      const match = raw.match(/^(\d+)/);
      if (match) usedBaseNumbers.add(Number(match[1]));
    });
    let n = 1;
    while (usedBaseNumbers.has(n)) n++;
    return String(n);
  }
  const usedBaseLetters = new Set();
  specs.forEach(s => {
    const raw = String((s && s.letter) || '').trim().toUpperCase();
    const match = raw.match(/^([A-Z]+)/);
    if (match) usedBaseLetters.add(match[1]);
  });
  let i = 0;
  const toLetters = (n) => {
    let s = '';
    n += 1;
    while (n > 0) {
      const rem = (n - 1) % 26;
      s = String.fromCharCode(65 + rem) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  };
  let candidate = toLetters(i);
  while (usedBaseLetters.has(candidate)) {
    i++;
    candidate = toLetters(i);
  }
  return candidate;
}

// ── Wizard de revisão individual (Detecção Automática) ──────────────────
// Substitui o antigo confirmA11yBatchGenerate (criação em lote sem
// confirmação item a item, removido nesta entrega). Decisão de produto:
// TODO item detectado exige configuração/confirmação individual antes de
// virar spec real — sem exceção de categoria (título e decorativo também
// passam a exigir confirmação, ao contrário do comportamento antigo).
//
// window._a11yBatchWizardState é um SNAPSHOT em memória, não persistido —
// nunca consome/apaga a fonte bruta (window._a11yDetectionsByArea[areaId]/
// window._a11yLooseDetections, que alimentam _collectA11yUndocumentedForArea).
// Por isso cancelar no meio (stopA11yBatchWizard) é de graça: os itens ainda
// não vistos continuam na fonte bruta e voltam a aparecer no accordion "Não
// Documentados" automaticamente, sem nenhuma ação extra aqui. Os já
// confirmados já são specs reais (persistidas via create-unified-spec/
// spec-created) — nada a fazer com eles na hora de parar.
// Ver docs/architecture-state.md pra mais contexto desta decisão.
function _resetA11yBatchWizardUi() {
  const focusBtn = document.getElementById('btn-a11y-wizard-focus');
  if (focusBtn) focusBtn.classList.add('hidden');
  const discardBtn = document.getElementById('btn-a11y-wizard-discard');
  if (discardBtn) discardBtn.classList.add('hidden');
  const progress = document.getElementById('a11y-modal-wizard-progress');
  if (progress) progress.classList.add('hidden');
  const paginator = document.getElementById('a11y-modal-wizard-paginator');
  if (paginator) paginator.classList.add('hidden');
  const confirmBtn = document.getElementById('btn-a11y-confirm');
  if (confirmBtn) confirmBtn.disabled = false;
  const modal = document.getElementById('a11y-spec-modal');
  if (modal) delete modal.dataset.wizardActive;
}

// Abre a tela de entrada do wizard: monta a fila a partir do MESMO array já
// filtrado que openA11yBatchSummaryModal exibe (window._a11yBatchDetections)
// como um snapshot próprio — trocar de área no meio do wizard não é
// suportado (mesma limitação que o resumo já tinha).
function startA11yBatchWizard() {
  const detections = window._a11yBatchDetections || [];
  const areaSelect = document.getElementById('a11y-batch-area-select');
  const areaId = areaSelect ? areaSelect.value : null;
  if (!areaId) {
    showToast('Selecione a tela de destino.');
    return;
  }
  if (detections.length === 0) return;

  window._a11yBatchWizardState = {
    areaId,
    queue: detections.slice(),
    // -1: _advanceA11yBatchWizard busca o próximo pendente a partir de
    // currentIndex + 1, então -1 faz a primeira busca começar no índice 0.
    currentIndex: -1,
    // Sets de ÍNDICES da queue (não dos itens) — permite navegação livre
    // (paginador) consultar o status de qualquer posição em O(1) sem
    // depender de currentIndex ter passado por ali em ordem. Reempurrar o
    // mesmo índice (ex: descartar de novo um item já descartado, ao
    // reabri-lo pelo paginador) é idempotente por construção de Set.
    confirmed: new Set(),
    discarded: new Set(),
  };

  window._a11yExpandedAreaIds = window._a11yExpandedAreaIds || new Set();
  window._a11yExpandedAreaIds.add(areaId);

  // Cria (ou reaproveita) a réplica de trabalho do Leitor de Tela desta área
  // ANTES de abrir o primeiro item do wizard — 2026-09-14, pedido do
  // usuário: "cria-se primeiro a réplica e depois o foco é sempre na
  // réplica", mesmo timing que Tabulação já usa (start-tab-order-copy antes
  // de abrir a escuta de cliques). Sem isso, o botão "Focar" do wizard caía
  // no Frame Principal até a primeira spec ser de fato aplicada (ver
  // handler start-spec-copy, code.js).
  //
  // Bug real corrigido (2026-09-16, print do usuário: "hoje ele para o
  // loading antes de criar a estrutura do Leitor de Tela"): até aqui esta
  // função disparava 'start-spec-copy' e IGNORAVA a resposta (ver comentário
  // antigo em messages.js, "o wizard dispara e ignora") — _advanceA11yBatchWizard
  // já abria o formulário do primeiro item em seguida, sem nenhum loading
  // visível cobrindo a clonagem da réplica (_createSpecCloneForArea, code.js
  // — clone do frame inteiro + rebuild do mapa de nós + reposicionamento +
  // legenda, pode levar segundos em telas grandes). O modal de "Detectando
  // componentes…" já tinha fechado corretamente ao fim do scan (ver
  // handleA11yPostAreaDetectionResult) — faltava reabri-lo pra esta etapa
  // seguinte, exatamente como o fluxo manual "+ Nova spec" já faz
  // (_openA11yCategoryPickerModalAfterInstruction, showA11yCanvasLoading +
  // 'Preparando a réplica de trabalho…'). Agora o wizard só abre o primeiro
  // item depois que 'spec-copy-started' confirma (ver
  // window._a11yBatchWizardCopyPendingAreaId, messages.js) — best-effort
  // preservado: área sem targetNodeId resolvível segue direto, sem loading.
  const area = _findA11yAreaById(areaId);
  if (area && area.targetNodeId) {
    closeA11yBatchSummaryModal();
    window._a11yBatchWizardCopyPendingAreaId = areaId;
    if (typeof showA11yCanvasLoading === 'function') showA11yCanvasLoading('Preparando a réplica de trabalho…');
    parent.postMessage({ pluginMessage: { type: 'start-spec-copy', areaId, targetNodeId: area.targetNodeId, sectionName: getA11yActiveSectionName(), designerName: getA11yDesignerName(), designerId: getA11yDesignerId(), savedAnchor: _getA11yAreaWorkAnchor(areaId) } }, '*');
    return;
  }

  closeA11yBatchSummaryModal();
  _advanceA11yBatchWizard();
}
window.startA11yBatchWizard = startA11yBatchWizard;

// Índice do primeiro item pendente (nem confirmado, nem descartado) a
// partir de `from` — usado tanto pra decidir o próximo item ao avançar
// quanto pra saber se a fila inteira já foi resolvida. Navegação livre
// (paginador) significa que "pendente" não é mais só "ainda não alcançado
// por currentIndex": qualquer posição da fila pode estar pendente,
// confirmada ou descartada independente de onde o cursor está agora.
function _findNextA11yWizardPendingIndex(state, from) {
  for (let i = from; i < state.queue.length; i++) {
    if (!state.confirmed.has(i) && !state.discarded.has(i)) return i;
  }
  for (let i = 0; i < from; i++) {
    if (!state.confirmed.has(i) && !state.discarded.has(i)) return i;
  }
  return -1;
}

// Avança pro próximo item pendente da fila (ou encerra, se não sobrar
// nenhum). Chamada tanto pelo início do wizard quanto depois de cada
// confirmação/descarte feitos no item corrente.
function _advanceA11yBatchWizard() {
  const state = window._a11yBatchWizardState;
  if (!state) return;

  const nextIndex = _findNextA11yWizardPendingIndex(state, state.currentIndex + 1);
  if (nextIndex === -1) {
    const confirmedCount = state.confirmed.size;
    const discardedCount = state.discarded.size;
    window._a11yBatchWizardState = null;
    // closeModal direto (não closeA11yModal) — a fila já terminou
    // normalmente, não é um fechamento "externo"/abandono, não deve
    // reacionar stopA11yBatchWizard (que já checaria _a11yBatchWizardState
    // === null e não faria nada, mas ainda assim é mais claro fechar direto
    // aqui e resetar a UI do wizard explicitamente).
    closeModal('a11y-spec-modal');
    _resetA11yBatchWizardUi();
    if (typeof closeA11yPostAreaDetectModal === 'function') closeA11yPostAreaDetectModal();
    if (confirmedCount === 0 && discardedCount === 0) return;
    if (confirmedCount > 0 && discardedCount === 0) {
      showToast(`${confirmedCount} especifica${confirmedCount === 1 ? 'ção criada' : 'ções criadas'}.`);
    } else if (confirmedCount === 0 && discardedCount > 0) {
      showToast(`Revisão concluída: ${discardedCount} ${discardedCount === 1 ? 'item' : 'itens'} descartado${discardedCount === 1 ? '' : 's'}, nenhuma especificação criada.`);
    } else {
      showToast(`${confirmedCount} especifica${confirmedCount === 1 ? 'ção criada' : 'ções criadas'}, ${discardedCount} descartado${discardedCount === 1 ? '' : 's'}.`);
    }
    return;
  }

  _openA11yWizardItemAt(nextIndex);
}
window._advanceA11yBatchWizard = _advanceA11yBatchWizard;

// Abre o formulário pra um item específico da fila por índice — usada tanto
// por _advanceA11yBatchWizard (sequencial) quanto pelo paginador (navegação
// livre, qualquer índice, em qualquer direção, revisado ou não).
function _openA11yWizardItemAt(index) {
  const state = window._a11yBatchWizardState;
  if (!state || index < 0 || index >= state.queue.length) return;
  state.currentIndex = index;
  // window._a11yBatchDetections (fonte da fila, ver startA11yBatchWizard) só
  // contém itens com dscComponentMatch (_filterA11yBatchEligible) — nunca
  // candidatos de 'tokenReview' (esses só aparecem como aviso informativo no
  // resumo, nunca entram no lote/wizard). 'detection' é sempre o kind aqui.
  const rawItem = state.queue[index];
  // A fila (window._a11yBatchDetections) é montada UMA VEZ, na abertura do
  // resumo do lote (_filterA11yBatchEligible) — nunca recalculada depois.
  // Se o mesmo nodeId já ganhou spec confirmada por outro caminho enquanto
  // o wizard está aberto (outro item da fila apontando pro mesmo node,
  // edição manual concorrente), state.confirmed (só populado pelo PRÓPRIO
  // wizard ao confirmar) não sabe disso — o botão Aplicar continuava
  // habilitado sem nenhum feedback até o clique cair na rede de segurança
  // de confirmA11ySpec, que só mostra um toast fugaz (bug real, 2026-09-03).
  // Promove pra state.confirmed aqui, ao ABRIR o item, pra que UI e
  // navegação sequencial (_findNextA11yWizardPendingIndex) tratem do mesmo
  // jeito um item confirmado nesta sessão e um já documentado antes dela.
  if (rawItem && rawItem.nodeId && !state.confirmed.has(index) && !state.discarded.has(index)) {
    if (_getDocumentedNodeIdsForArea(state.areaId).has(rawItem.nodeId)) {
      state.confirmed.add(index);
    }
  }
  const { category, options } = _resolveA11yFormPresetFromItem(rawItem, 'detection');
  window._a11yPendingAreaId = state.areaId;
  openA11yModal(category, options);
  _applyA11yWizardModalUi(state);
  // Acompanha a troca de item com scroll + highlight no canvas — sem isso o
  // designer precisa clicar em "Focar" manualmente a cada avanço (aplicar/
  // descartar) ou pulo pelo paginador, perdendo de vista qual elemento
  // corresponde ao formulário aberto numa área com muitos itens.
  focusA11yWizardCurrentNode();
}
window._openA11yWizardItemAt = _openA11yWizardItemAt;

// Pulo direto pra qualquer posição do paginador, em qualquer direção,
// revisado ou não. Itens já confirmados reabrem normalmente (pra
// visualização), mas com "Aplicar" trocado por "Documentado"
// (desabilitado) — ver _applyA11yWizardModalUi — pra nunca duplicar spec
// sobre o mesmo nó. Descartados reabrem totalmente editáveis: navegação
// livre inclui poder reconsiderar um descarte e aplicar depois.
function jumpToA11yWizardItem(index) {
  const state = window._a11yBatchWizardState;
  if (!state) return;
  _openA11yWizardItemAt(index);
}
window.jumpToA11yWizardItem = jumpToA11yWizardItem;

// Reaplica o "modo wizard" da modal (dataset.wizardActive, botões
// Focar/Descartar, progresso "N de M") — openA11yModal sempre reseta esse
// estado no início (ver _resetA11yBatchWizardUi ali dentro), então tanto
// avançar pra um novo item quanto trocar a categoria do item atual (ver
// switchA11yWizardCategory) precisam reaplicar por cima depois de chamar
// openA11yModal.
function _applyA11yWizardModalUi(state) {
  const modal = document.getElementById('a11y-spec-modal');
  if (modal) modal.dataset.wizardActive = '1';
  const focusBtn = document.getElementById('btn-a11y-wizard-focus');
  if (focusBtn) focusBtn.classList.remove('hidden');
  const isConfirmed = state.confirmed.has(state.currentIndex);
  const isDiscarded = state.discarded.has(state.currentIndex);
  const progress = document.getElementById('a11y-modal-wizard-progress');
  if (progress) {
    const statusSuffix = isConfirmed ? ' — Documentado' : isDiscarded ? ' — Descartado' : '';
    progress.textContent = `Item ${state.currentIndex + 1} de ${state.queue.length}${statusSuffix}`;
    progress.classList.remove('hidden');
    progress.classList.toggle('text-emerald-600', isConfirmed);
    progress.classList.toggle('dark:text-emerald-400', isConfirmed);
    progress.classList.toggle('text-gray-400', isDiscarded);
  }

  const discardBtn = document.getElementById('btn-a11y-wizard-discard');
  if (discardBtn) discardBtn.classList.toggle('hidden', isConfirmed);
  const confirmBtn = document.getElementById('btn-a11y-confirm');
  if (confirmBtn) {
    confirmBtn.textContent = isConfirmed ? 'Documentado' : 'Aplicar';
    confirmBtn.disabled = isConfirmed;
  }

  const paginator = document.getElementById('a11y-modal-wizard-paginator');
  if (paginator) paginator.classList.remove('hidden');
  _renderA11yWizardPaginator(state);
}

// Só o essencial pra refletir status novo (Set confirmed/discarded mudou)
// sem reabrir o formulário — usado quando uma confirmação assíncrona chega
// pra um item que não é mais o exibido (o designer já pulou pra outro).
function _refreshA11yWizardPaginator(state) {
  if (!state) return;
  _renderA11yWizardPaginator(state);
}
window._refreshA11yWizardPaginator = _refreshA11yWizardPaginator;

// Voltar/Avançar navegam SEMPRE por posição na fila (currentIndex ± 1),
// diferente de _advanceA11yBatchWizard (que pula pro próximo pendente após
// Aplicar/Descartar) — aqui o designer está passeando manualmente pela fila
// inteira, revisado ou não, então pular itens já resolvidos seria
// surpreendente.
function _stepA11yWizardItem(delta) {
  const state = window._a11yBatchWizardState;
  if (!state) return;
  const target = state.currentIndex + delta;
  if (target < 0 || target >= state.queue.length) return;
  _openA11yWizardItemAt(target);
}
window._stepA11yWizardItem = _stepA11yWizardItem;

// Handler do campo numérico central (Enter ou blur, ver onkeydown/onblur no
// input em modals.html). Só aceita inteiro 1-based dentro da fila; qualquer
// entrada inválida (vazia, não numérica, fora do range) reverte o campo pro
// índice atual sem navegar — nunca deixa o input num estado inconsistente.
function _commitA11yWizardIndexInput(rawValue) {
  const state = window._a11yBatchWizardState;
  if (!state) return;
  const parsed = Number.parseInt(String(rawValue).trim(), 10);
  const isValid = Number.isInteger(parsed) && String(parsed) === String(rawValue).trim() && parsed >= 1 && parsed <= state.queue.length;
  if (isValid && (parsed - 1) !== state.currentIndex) {
    _openA11yWizardItemAt(parsed - 1);
    return;
  }
  _renderA11yWizardPaginator(state);
}
window._commitA11yWizardIndexInput = _commitA11yWizardIndexInput;

function _renderA11yWizardPaginator(state) {
  const wrap = document.getElementById('a11y-modal-wizard-paginator');
  if (!wrap) return;
  const total = state.queue.length;
  const input = document.getElementById('a11y-wizard-index-input');
  if (input) input.value = String(state.currentIndex + 1);
  const totalLabel = document.getElementById('a11y-wizard-index-total');
  if (totalLabel) totalLabel.textContent = `de ${total}`;
  const prevBtn = document.getElementById('btn-a11y-wizard-prev');
  if (prevBtn) prevBtn.disabled = state.currentIndex <= 0;
  const nextBtn = document.getElementById('btn-a11y-wizard-next');
  if (nextBtn) nextBtn.disabled = state.currentIndex >= total - 1;
}

// Centraliza/dá zoom no elemento do item atual do wizard no canvas — reusa o
// mesmo nodeId que openA11yModal já grava em modal.dataset.pendingTargetNodeId
// (ver _advanceA11yBatchWizard acima) em vez de duplicar estado próprio do
// wizard.
// Bug real corrigido (2026-09-09): usava focusNode(id) (core.js) — o mesmo
// highlight-node genérico da listagem de specs — que sempre foca o nodeId
// ORIGINAL. Isso fazia sentido antes de create-unified-spec passar a
// clonar réplica (2026-09-08): desde essa mudança, o card da spec é
// desenhado sobre a CÓPIA de trabalho da área, não mais sobre o design
// original, então focar o original mostrava o frame principal, sem
// nenhum card visível ali (o designer via a tela errada). Usa o handler
// dedicado highlight-spec-copy-node (code.js), que traduz o nodeId
// original pro node equivalente dentro da cópia ativa da área via
// _activeSpecCloneMaps — mesmo padrão já usado por
// _highlightTabOrderListItem/_highlightSwipePathListItem.
function focusA11yWizardCurrentNode() {
  const modal = document.getElementById('a11y-spec-modal');
  const nodeId = modal ? modal.dataset.pendingTargetNodeId : '';
  if (!nodeId) return;
  const areaId = modal ? modal.dataset.areaId : '';
  parent.postMessage({ pluginMessage: { type: 'highlight-spec-copy-node', id: nodeId, areaId: areaId || null, shouldScroll: true } }, '*');
}
window.focusA11yWizardCurrentNode = focusA11yWizardCurrentNode;

// Botão "Focar no elemento no canvas" da LISTAGEM de specs já confirmadas
// (_a11ySpecItemHtml) — mesmo bug/correção de focusA11yWizardCurrentNode:
// spec.targetNodeId é sempre o nodeId ORIGINAL (_originalTargetNodeId,
// code.js), nunca o equivalente dentro do clone de trabalho do Leitor de
// Tela. Usa o mesmo handler dedicado highlight-spec-copy-node.
function _highlightSpecListItem(nodeId, areaId) {
  if (!nodeId) return;
  parent.postMessage({ pluginMessage: { type: 'highlight-spec-copy-node', id: nodeId, areaId: areaId || null, shouldScroll: true } }, '*');
}
window._highlightSpecListItem = _highlightSpecListItem;

// Descarta o item corrente sem criar spec — nunca chama create-unified-spec.
// Idempotente por índice (Set): reabrir pelo paginador um item já
// confirmado nunca chega aqui (botão vira "Documentado", ver
// _applyA11yWizardModalUi), então não há risco de descartar algo que já
// virou spec real.
function discardCurrentA11yBatchWizardItem() {
  const state = window._a11yBatchWizardState;
  if (!state) return;
  state.discarded.add(state.currentIndex);
  _advanceA11yBatchWizard();
}
window.discardCurrentA11yBatchWizardItem = discardCurrentA11yBatchWizardItem;

// Encerra o wizard a qualquer momento — X e Esc chamam via closeA11yModal
// (viaExplicitCancelButton = false); o botão "Cancelar" chama via
// cancelA11yModalExplicit (viaExplicitCancelButton = true). Itens já
// confirmados permanecem como specs reais; os pendentes (nem confirmados,
// nem descartados — navegação livre significa que isso não é mais só "do
// currentIndex em diante") voltam automaticamente pra "Não Documentados" —
// não precisam de nenhum tratamento aqui, a fonte bruta nunca foi tocada.
//
// Quando o fechamento NÃO veio do botão "Cancelar" (pode ter sido
// acidental — clique perdido no X, Esc sem querer) e ainda restam
// itens na fila, oferece retomar via snackbar com ação: reabrir a revisão
// dispara um NOVO scan da área (não reaproveita a fila antiga em memória),
// porque o canvas pode ter mudado entre o cancelamento e a retomada.
// Reaproveita o mesmo caminho de scan que a Detecção Automática usa
// (openA11yPostAreaDetectModal), então o dedupe por targetNodeId contra
// specs já confirmadas continua valendo automaticamente — ver
// _filterA11yBatchEligible/_getDocumentedNodeIdsForArea.
function stopA11yBatchWizard(viaExplicitCancelButton) {
  const state = window._a11yBatchWizardState;
  window._a11yBatchWizardState = null;
  _resetA11yBatchWizardUi();
  closeModal('a11y-spec-modal');
  if (typeof closeA11yPostAreaDetectModal === 'function') closeA11yPostAreaDetectModal();
  if (!state) return;
  const confirmedCount = state.confirmed.size;
  const remaining = state.queue.length - state.confirmed.size - state.discarded.size;
  const areaId = state.areaId;
  if (!viaExplicitCancelButton && remaining > 0 && areaId) {
    const message = confirmedCount > 0
      ? `Revisão interrompida: ${confirmedCount} especifica${confirmedCount === 1 ? 'ção criada' : 'ções criadas'}, ${remaining} ${remaining === 1 ? 'item' : 'itens'} de volta pra "Não Documentados".`
      : `Revisão interrompida: ${remaining} ${remaining === 1 ? 'item' : 'itens'} continua${remaining === 1 ? '' : 'm'} em "Não Documentados".`;
    showSnackbar(message, {
      actionLabel: 'Continuar revisão',
      onAction: () => _resumeA11yBatchWizardForArea(areaId),
    });
    return;
  }
  if (confirmedCount > 0) {
    showToast(`Revisão interrompida: ${confirmedCount} especifica${confirmedCount === 1 ? 'ção criada' : 'ções criadas'}, ${remaining} ${remaining === 1 ? 'item' : 'itens'} de volta pra "Não Documentados".`);
  } else {
    showToast(`Revisão interrompida: ${remaining} ${remaining === 1 ? 'item' : 'itens'} continua${remaining === 1 ? '' : 'm'} em "Não Documentados".`);
  }
}
window.stopA11yBatchWizard = stopA11yBatchWizard;

// Dispara um novo scan da área (mesmo caminho que a Detecção Automática
// inicial usa) e, quando o resultado chegar, reabre o wizard direto — sem
// passar pelo modal de resumo agregado, pra ser o mais próximo possível de
// "retomar de onde parou" com um clique só. handleA11yPostAreaDetectionResult
// (fluxo normal de scan) já monta window._a11yBatchDetections/
// window._a11yPendingDetectionArea; aqui só marcamos a intenção de pular
// direto pro wizard quando esse resultado chegar.
function _resumeA11yBatchWizardForArea(areaId) {
  const area = _findA11yAreaById(areaId);
  if (!area || !area.targetNodeId) {
    showToast('Não foi possível localizar a tela para retomar. Reescaneie manualmente.');
    return;
  }
  window._a11yResumeWizardAfterScan = true;
  openA11yPostAreaDetectModal(area);
}
window._resumeA11yBatchWizardForArea = _resumeA11yBatchWizardForArea;

// Remover a entrada também remove o nó no canvas (mesmo padrão de
// deleteA11yArea logo abaixo) — specs de A11y têm nó real desde a criação.
// Bug real corrigido (2026-09-11): recebia `originalIndex` (posição
// recalculada no array a cada render — ver comentário em
// _a11ySpecItemHtml) em vez de `specId` (identidade estável) — se um
// re-render assíncrono (ex. layer-order-resolved chegando) acontecesse
// entre a montagem do HTML e o clique, o índice embutido no onclick podia
// já não corresponder mais ao spec certo, apagando/alterando o item
// errado silenciosamente. Agora recebe o id real e localiza a posição
// atual no array na hora do clique — nunca confia num índice "congelado"
// no HTML.
function deleteA11ySpec(specId) {
  const originalIndex = a11ySpecs.findIndex(s => s && s.id === specId);
  const spec = a11ySpecs[originalIndex];
  if (!spec) return;
  if (spec.id) {
    parent.postMessage({ pluginMessage: { type: 'delete-node', id: spec.id } }, '*');
  }
  a11ySpecs.splice(originalIndex, 1);
  saveToStorage();
  renderA11yGroupedList();
}
window.deleteA11ySpec = deleteA11ySpec;

// "Excluir todas as especificações" da aba Leitor de Tela (2026-09-24,
// pedido do usuário: "todas as outras abas têm o ícone da lixeira pra
// excluir tudo, no leitor de tela temos apenas a exclusão por item" — mesmo
// padrão visual/de confirmação de deleteAllTabOrderForArea (tab-order.js) e
// deleteSwipePathForArea (swipe-path.js), que já têm esse botão na mesma
// posição do header da aba).
//
// Diferente de Tabulação/Swipe (uma cópia clonada única, um só id a
// apagar), cada spec de Leitor de Tela é um nó PRÓPRIO no canvas (spec.id) —
// não há um único id "pai" que arraste todos ao ser removido. Reaproveita
// 'delete-specs-for-area' (mesmo handler já usado por deleteA11yArea, ver
// linha ~7925), que varre por pluginData ('hacSpecForArea'/
// 'hacSpecCloneForArea') em vez de depender da lista local de specs — cobre
// inclusive specs órfãs (array dessincronizado do canvas), sem precisar
// disparar um 'delete-node' por item (que geraria uma notificação do Figma
// por spec).
function deleteAllA11ySpecsForArea(areaId) {
  if (!areaId) return;
  const hasSpecs = (a11ySpecs || []).some(s => s && s.a11yAreaId === areaId);
  if (!hasSpecs) return;

  // Sem window.confirm (2026-09-24) — mesmo padrão de
  // deleteAllTabOrderForArea/deleteSwipePathForArea/deleteA11yArea, nenhum
  // pede confirmação: a ação é imediata, avisada só pelo texto do tooltip
  // do botão ("Excluir todas as especificações... — não pode ser desfeito").
  parent.postMessage({ pluginMessage: { type: 'delete-specs-for-area', areaId } }, '*');
  a11ySpecs = (a11ySpecs || []).filter(s => !(s && s.a11yAreaId === areaId));
  saveToStorage();
  showToast('Especificações de Leitor de Tela removidas.');
  if (typeof _renderA11yWorkspaceTab === 'function') _renderA11yWorkspaceTab();
  renderA11yGroupedList();
}
window.deleteAllA11ySpecsForArea = deleteAllA11ySpecsForArea;

// Mostrar/ocultar o nó da spec no canvas — mesmo par de mensagens
// ('hide-node'/'show-node') que specs normais usam no Handex.
function toggleA11ySpecVisibility(specId) {
  const spec = a11ySpecs.find(s => s && s.id === specId);
  if (!spec || !spec.id) return;
  spec.visible = spec.visible === false ? true : false;
  parent.postMessage({ pluginMessage: { type: spec.visible === false ? 'hide-node' : 'show-node', id: spec.id } }, '*');
  saveToStorage();
  renderA11yGroupedList();
}
window.toggleA11ySpecVisibility = toggleA11ySpecVisibility;

// Estado efêmero (não persiste entre sessões) das áreas ocultadas de uma vez
// pelo botão de olho no cabeçalho do card. Set de areaId, não de spec.id —
// a visibilidade por spec continua controlada individualmente por
// toggleA11ySpecVisibility.
window._a11yAreaHiddenIds = window._a11yAreaHiddenIds || new Set();

// Ocultar/mostrar TUDO de uma área de uma vez: as specs de leitor de tela (5
// categorias) e os itens de Ordem de Tabulação daquela área — que vivem numa
// CÓPIA separada do frame, não nos elementos de trabalho reais.
function toggleAreaGroupVisibility(areaId) {
  if (window._a11yAreaHiddenIds.has(areaId)) {
    window._a11yAreaHiddenIds.delete(areaId);
  } else {
    window._a11yAreaHiddenIds.add(areaId);
  }
  const hidden = window._a11yAreaHiddenIds.has(areaId);

  (a11ySpecs || []).forEach(spec => {
    if (!spec || spec.a11yAreaId !== areaId || !spec.id) return;
    spec.visible = !hidden;
    parent.postMessage({ pluginMessage: { type: hidden ? 'hide-node' : 'show-node', id: spec.id } }, '*');
  });

  // Cópia de Ordem de Tabulação: fire-and-forget, o backend simplesmente
  // não encontra nada se a área nunca gerou cópia.
  parent.postMessage({ pluginMessage: { type: 'toggle-tab-order-copy-visibility', areaId, visible: !hidden } }, '*');
  // Trilha de Swipe não tem um toggle de visibilidade próprio (é uma única
  // linha/setas, não uma cópia inteira de frame como Tabulação tinha) —
  // limitação conhecida, aceita de propósito (mesma decisão da v2
  // anterior): ocultar a área não afeta a trilha desenhada no canvas.
  // 3ª cascata: Ficha de Handoff (handoff-ficha.js), mesmo raciocínio.
  parent.postMessage({ pluginMessage: { type: 'toggle-ficha-visibility', areaId, visible: !hidden } }, '*');

  saveToStorage();
  renderA11yGroupedList();
}
window.toggleAreaGroupVisibility = toggleAreaGroupVisibility;

// "Concluir posicionamento" — trava/destrava o specGroup no canvas via
// unlock-spec-group (code.js). Specs de A11y nascem travadas — este toggle
// é o único jeito de mexer nelas depois.
function toggleA11ySpecLock(specId) {
  const spec = a11ySpecs.find(s => s && s.id === specId);
  if (!spec || !spec.id) return;
  const isNowUnlocked = spec.locked === false;
  spec.locked = isNowUnlocked ? true : false;
  parent.postMessage({ pluginMessage: { type: 'unlock-spec-group', specIds: [spec.id], locked: spec.locked } }, '*');
  saveToStorage();
  renderA11yGroupedList();
  showToast(isNowUnlocked
    ? 'Especificação travada novamente.'
    : 'Especificação destravada. Edite com cuidado e trave novamente ao concluir.');
}
window.toggleA11ySpecLock = toggleA11ySpecLock;

// Abre o mesmo formulário usado pra criar (sem passar pelo seletor de
// categoria — a categoria de uma spec existente não muda) já preenchido com
// os dados atuais. confirmA11ySpec detecta modal.dataset.editingSpecId e, em
// vez de só criar, apaga o nó antigo no canvas e recria com os valores
// atualizados.
function editA11ySpec(specId) {
  const spec = a11ySpecs.find(s => s && s.id === specId);
  if (!spec || !spec.a11yType) return;
  window._a11yPendingAreaId = spec.a11yAreaId || null;
  // targetNodeName/dscComponentName (já salvos na spec) populam os 2 campos
  // read-only do topo do formulário também em modo edição — mesmos dados que
  // a criação exibe, sem depender de nova resolução via canvas/scan.
  openA11yModal(spec.a11yType, {
    a11yOrigin: spec.a11yOrigin || 'web',
    targetNodeName: spec.targetNodeName || null,
    dscComponentName: spec.a11yDscComponentName || null,
    // Sinaliza pra openA11yModal não disparar get-selection-name — os 2
    // campos read-only já foram resolvidos acima a partir da spec salva, sem
    // depender da seleção atual do canvas (que é irrelevante aqui e mudaria
    // silenciosamente o conteúdo exibido quando a resposta assíncrona
    // chegasse). Ver comentário em openA11yModal.
    editing: true,
  });
  const modal = document.getElementById('a11y-spec-modal');
  if (modal) {
    modal.dataset.editingSpecId = spec.id || '';
  }
  _prefillA11ySpecForEdit(spec);
  const confirmBtn = document.getElementById('btn-a11y-confirm');
  if (confirmBtn) confirmBtn.textContent = 'Salvar';
}
window.editA11ySpec = editA11ySpec;

// Reconstrói os campos do formulário a partir de spec.a11ySubtype (chave
// crua da subvariante) e spec.properties[] (valores já resolvidos/digitados
// pelo designer) — o inverso exato do que confirmA11ySpec monta por
// categoria.
function _prefillA11ySpecForEdit(spec) {
  const category = spec.a11yType;
  const sub = spec.a11ySubtype || {};
  const props = spec.properties || [];
  const getProp = key => {
    const p = props.find(x => x.key === key);
    return p ? p.value : '';
  };
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el && val) { el.value = val; updateA11yCharCounter(el); }
  };

  const tagInputId = A11Y_TAG_INPUT_ID[category];
  if (tagInputId) setVal(tagInputId, spec.letter || (category === 'elemento' ? '1' : 'A'));

  if (category === 'elemento') {
    const modal = document.getElementById('a11y-spec-modal');
    const isMobile = !!modal && modal.dataset.a11yOrigin === 'mobile';
    const select = document.getElementById('a11y-el-componente-select');
    // Specs mobile nunca restauram o select desktop (bloco fica escondido,
    // ver _toggleA11yElementoDesktopBlock) — mesmo specs mobile ANTIGAS que
    // tenham sub.componente preenchido (resquício de quando o bug de
    // exclusão mútua existia) simplesmente ignoram esse campo aqui, sem
    // quebrar o resto do formulário.
    if (!isMobile) {
      // "Imagem" (2026-09-17): sub.componente === 'imagem' continua sendo o
      // MESMO valor persistido de sempre (formato de dado inalterado —
      // specs antigas e novas usam a mesma chave) — só a UI que consulta esse
      // valor mudou: 'imagem' agora marca o radio a11y-el-variante em vez de
      // uma opção do <select> (que não tem mais essa opção, ver
      // reestruturação em modals.html). Precisa vir ANTES de
      // updateA11yElementoFields(), chamada logo abaixo, pra ela já enxergar
      // o radio certo ao decidir isImagem.
      const isImagemSpec = !sub.isOutro && sub.componente === 'imagem';
      const varianteRadio = document.querySelector(`input[name="a11y-el-variante"][value="${isImagemSpec ? 'imagem' : 'componente'}"]`);
      if (varianteRadio) varianteRadio.checked = true;
      if (sub.isOutro) {
        if (select) select.value = 'outro';
        setVal('a11y-el-componente-outro', getProp('componente'));
      } else if (sub.componente && select && !isImagemSpec) {
        select.value = sub.componente;
      }
    } else if (sub.isOutro) {
      // Spec mobile ANTIGA que nasceu com isOutro=true (antes desta correção,
      // quando o "Outro" desktop ainda convivia com o bloco mobile) — o nome
      // real do componente documentado estava em properties['componente'].
      // Reabrir pra edição precisa recuperar esse valor sem quebrar: joga no
      // campo de texto livre "Link ou nome do componente" mobile (mesmo
      // espírito do "Personalizado", ver A11Y_MOBILE_LINK_COMPONENT_OPTIONS),
      // só se o campo de link real ainda não tiver um valor próprio salvo.
      // _renderA11yElementoMobileFields (chamada por updateA11yElementoFields
      // logo abaixo) precisa já ter recriado #a11y-el-mobile-link-url antes
      // deste valor ser aplicado — por isso este preenchimento acontece de
      // novo, redundante, depois de updateA11yElementoFields mais adiante
      // (ver bloco _restoreA11yElementoMobileToggles/fallback isOutro logo
      // após).
      window._a11yPrefillMobileOutroComponente = getProp('componente') || '';
    }
    // Restaura a sub-variante mobile salva (componente/link/texto
    // alternativo) ANTES de updateA11yElementoFields — _renderA11yElemento
    // MobileFields (chamada de dentro dela) lê o radio marcado pra decidir
    // qual bloco condicional montar. Specs desktop (sub.variant ausente)
    // não têm esse radio no DOM relevante (bloco fica escondido por origem).
    if (sub.variant) {
      const mobileVariantRadio = document.querySelector(`input[name="a11y-el-mobile-variant"][value="${sub.variant}"]`);
      if (mobileVariantRadio) mobileVariantRadio.checked = true;
    }
    const mobileList = document.getElementById('a11y-el-mobile-toggles-list');
    if (mobileList) delete mobileList.dataset.renderedVariant; // força reconstrução do bloco certo
    updateA11yElementoFields();
    setVal('a11y-el-label', getProp('label'));
    // Reavalia a visibilidade do Label DEPOIS de escrever o valor salvo
    // (2026-09-24): a chamada de dentro de updateA11yElementoFields acima
    // rodou ANTES do setVal, então via o campo ainda vazio — inofensivo pra
    // decidir show/hide, mas preserveValue não fazia diferença nesse
    // momento. Esta chamada, com preserveValue=true, garante que uma spec
    // ANTIGA cujo componente perdeu a property "nome acessível" num scan
    // mais novo da lib tenha o valor salvo PRESERVADO (campo escondido, mas
    // dado intacto) — nunca apagado só por reabrir pra editar.
    if (typeof _updateA11yMobileLabelVisibility === 'function') _updateA11yMobileLabelVisibility(true);
    // Restaura a variante secundária salva (ex: Button → "de icone") —
    // updateA11yElementoFields acima já recriou o <select> pro componente
    // certo, aqui só aplicamos o valor gravado em cima do default.
    _restoreA11yElementoVariant(sub.tipo);
    // Restaura os toggles dinâmicos salvos (Nome Acessível/Observações/Notas
    // de Código).
    _restoreA11yElementoToggles(props);
    // Restaura os campos exclusivos mobile (Dica para Leitor de Tela/Nome
    // Acessível/Observações/Link do Componente/Descrição livre — conforme a
    // sub-variante) — só existem em specs mobile; updateA11yElementoFields
    // acima já rendereu o bloco certo a partir do radio de variante e de
    // modal.dataset.a11yOrigin, setados antes desta chamada.
    _restoreA11yElementoMobileToggles(props);
    // Fallback pra specs mobile ANTIGAS com isOutro=true (ver bloco acima) —
    // só preenche se o campo real de link ainda estiver vazio (spec antiga
    // não tinha linkComponente, então não há conflito de valor).
    if (window._a11yPrefillMobileOutroComponente) {
      const linkUrl = document.getElementById('a11y-el-mobile-link-url');
      if (linkUrl && !linkUrl.value.trim()) linkUrl.value = window._a11yPrefillMobileOutroComponente;
      delete window._a11yPrefillMobileOutroComponente;
    }
  } else if (category === 'estrutura') {
    const subtipoSelect = document.getElementById('a11y-estrutura-subtipo-select');
    if (subtipoSelect) subtipoSelect.value = sub.variacao || 'idiomas';
    if (sub.variacao === 'marco de navegacao') {
      const marcoSelect = document.getElementById('a11y-estrutura-marco-select');
      if (marcoSelect) marcoSelect.value = sub.tipo || 'header';
    } else if (sub.variacao === 'idiomas') {
      const idiomasSelect = document.getElementById('a11y-estrutura-idiomas-select');
      if (idiomasSelect) idiomasSelect.value = sub.idioma || 'da pagina';
    }
    updateA11yEstruturaFields();
    const isCustom = sub.variacao === 'customizavel' || (sub.variacao === 'marco de navegacao' && sub.tipo === 'customizavel');
    if (isCustom) setVal('a11y-estrutura-descricao', getProp('descricao'));
    _restoreA11yFixedToggles('a11y-estrutura-toggles-list', props);
  } else if (category === 'titulo') {
    const nivelSelect = document.getElementById('a11y-titulo-nivel-select');
    if (nivelSelect) nivelSelect.value = sub.nivel || 'h1';
    updateA11yTituloFields();
    _restoreA11yFixedToggles('a11y-titulo-toggles-list', props);
  } else if (category === 'decorativo') {
    const decSelect = document.getElementById('a11y-decorativo-subtipo-select');
    if (decSelect) decSelect.value = sub.tipo || 'gerais';
    updateA11yDecorativoFields();
    _restoreA11yFixedToggles('a11y-decorativo-toggles-list', props);
  } else if (category === 'informacoes') {
    const infoSelect = document.getElementById('a11y-informacoes-subtipo-select');
    if (infoSelect) infoSelect.value = sub.subtipo || 'handoffs';
    updateA11yInformacoesFields();
    const isCustom = sub.subtipo === 'customizavel';
    if (isCustom) setVal('a11y-informacoes-descricao', getProp('descricao'));
    _restoreA11yFixedToggles('a11y-informacoes-toggles-list', props);
  }

  validateA11yTagInput();

  const guideRadio = document.querySelector(`input[name="a11y-guide-side"][value="${spec.guideSide || 'right'}"]`);
  if (guideRadio) guideRadio.checked = true;

  const drawModeRadio = document.querySelector(`input[name="a11y-draw-mode"][value="${spec.drawMode || 'contorno'}"]`);
  if (drawModeRadio) drawModeRadio.checked = true;
}

// ── Áreas Marcadas ───────────────────────────────────────────────────────
// Selo azul numerado (1, 2, 3...) apontando uma seção/região da tela. Vira o
// agrupamento principal da aba: cada área é um accordion e toda spec de A11y
// nasce dentro de uma área. Numeração sequencial por PROJETO inteiro (nunca
// reaproveita número de área excluída).
function openA11yAreaModal() {
  const input = document.getElementById('a11y-area-label-input');
  if (input) { input.value = ''; updateA11yCharCounter(input); }
  openModal('a11y-area-modal');
  setTimeout(() => { if (input) input.focus(); }, 50);
  // Pré-preenche com o nome do frame/elemento selecionado no canvas — só
  // cosmético, o designer pode sobrescrever antes de confirmar.
  _getA11ySelectionInfo().then(sel => {
    const modal = document.getElementById('a11y-area-modal');
    if (!modal || modal.classList.contains('hidden')) return;
    if (input && !input.value && sel && sel.name) { input.value = sel.name; updateA11yCharCounter(input); }
  });
}
window.openA11yAreaModal = openA11yAreaModal;

// A pergunta "Continuar na Section atual / Iniciar nova Section" dentro
// deste modal foi REMOVIDA (2026-09-04-k, achado real reportado pelo
// usuário com screenshot): aparecia toda vez que "Marcar Área" era
// aberto num arquivo já documentado, mesmo sendo só mais um frame do
// MESMO handoff — resultado prático era cada área acabando numa Section
// diferente (3 frames documentados viravam 2-3 Sections com 1 grupo cada,
// em vez de 3 grupos irmãos na mesma Section). Marcar Área agora SEMPRE
// entra na Section ativa (getA11yActiveSectionName), sem perguntar nada.
//
// O versionamento de Section (nova vX com réplica completa da
// documentação) NÃO virou uma ação manual solta — o usuário descreveu o
// gatilho real esperado: disparado AUTOMATICAMENTE ao gerar/atualizar a
// Ficha de Handoff (hoje placeholder, "em breve") num projeto que JÁ TEM
// uma Ficha gerada antes, com mudanças desde então — o sistema replica a
// documentação inteira numa Section nova + as modificações, preservando a
// versão anterior intocada como histórico. Isso pertence ao planejamento
// futuro da geração real da Ficha de Handoff (módulo apartado, já
// registrado como fora de escopo em `docs/architecture-state.md` seção
// 8c) — não implementado aqui, e não deve ganhar nenhum botão solo de
// "nova versão" antes desse planejamento acontecer.

// Rebusca a seleção atual do canvas e substitui o rótulo — diferente do
// pré-preenchimento de abertura (que só entra se o campo estiver vazio),
// aqui é ação explícita do designer, então sempre sobrescreve.
function refreshA11yAreaLabelFromSelection() {
  const input = document.getElementById('a11y-area-label-input');
  _getA11ySelectionInfo().then(sel => {
    if (!sel || !sel.name) {
      showToast('Selecione um elemento no canvas antes de atualizar o nome.');
      return;
    }
    if (input) { input.value = sel.name; updateA11yCharCounter(input); }
  });
}
window.refreshA11yAreaLabelFromSelection = refreshA11yAreaLabelFromSelection;

function closeA11yAreaModal() {
  closeModal('a11y-area-modal');
}
window.closeA11yAreaModal = closeA11yAreaModal;

function _nextA11yAreaNumber() {
  const max = (a11yAreas || []).reduce((m, a) => Math.max(m, (a && a.number) || 0), 0);
  return max + 1;
}

// A origem web/mobile também é necessária aqui, na criação da própria
// Área — o selo de número da Área (A11Y_AREA_CONECTOR_KEYS no backend)
// precisa saber se importa o componente desktop ou mobile da lib Design
// Acessível. Usa ensureA11yProjectOriginThen (ver bloco "Origem do
// projeto" acima): se hacData.projectOrigin já foi respondido nesta
// sessão do arquivo, segue direto sem perguntar de novo — decisão de
// produto de 2026-09-02, que substitui a pergunta independente por área
// (2026-09-01).
//
// Marcar Área NÃO escolhe mais Automático/Manual (2026-09-04-g, pedido do
// usuário) — a área sempre nasce "vazia" (sem varredura disparada), e o
// Mapeamento Automático vira uma ação disponível a qualquer momento
// dentro da tab Leitor de Tela (ver _startA11yMappingFromLeitorTab acima),
// ao lado das outras funcionalidades automáticas do plugin. `autoDetect`
// não é mais enviado em create-a11y-area — o backend trata a ausência
// como falsy (`!!msg.autoDetect`) e messages.js (`a11y-area-created`)
// simplesmente nunca dispara o modal de detecção automaticamente.
function confirmA11yArea() {
  const input = document.getElementById('a11y-area-label-input');
  const label = input ? input.value.trim() : '';
  if (!label) {
    showToast('Informe o rótulo da tela.');
    return;
  }
  // Direção do selo e número não têm mais UI de escolha (2026-09-14,
  // pedido do usuário) — selos nascem sequenciais e organizados dentro
  // da Section, sempre com a direção default e o próximo número livre.
  const conector = 'superior';
  const number = _nextA11yAreaNumber();
  closeA11yAreaModal();
  _getA11ySelectionInfo().then(sel => {
    if (!sel || !sel.id) {
      showToast('Selecione um elemento no canvas antes de selecionar a tela.');
      return;
    }
    ensureA11yProjectOriginThen((origin) => {
      parent.postMessage({ pluginMessage: { type: 'create-a11y-area', targetNodeId: sel.id, label, number, conector, origin, sectionName: getA11yActiveSectionName(), designerName: getA11yDesignerName(), designerId: getA11yDesignerId() } }, '*');
    });
  });
}
window.confirmA11yArea = confirmA11yArea;

// Excluir uma área remove do canvas o Grupo dela e, com ele, TODOS os
// artefatos que passaram a viver dentro desse Grupo (selo, specs
// vinculadas, cópia+selos de Ordem de Tabulação, cópia+linha de Trilha de
// Swipe, Ficha de Handoff) — uma única operação, sem confirmação extra
// (decisão do usuário). Resolve de quebra o vazamento real do clone de
// Swipe, que nunca era removido neste fluxo.
//
// As 3 cascatas por tipo continuam sendo disparadas ANTES do delete do
// Grupo, e só por causa das Áreas criadas antes de 2026-09-05: nelas
// area.id é a INSTANCE solta do selo (não aceita filhos), então os
// artefatos continuam espalhados nas Sections por tipo e só esses handlers
// os encontram. Em Áreas novas elas viram no-op — o Grupo já leva tudo.
//
// A limpeza de DADO (specs/tabOrderItems/a11ySwipePaths em hacData) é
// local, não depende de resposta do backend.
// Bug real corrigido (2026-09-11): recebia originalIndex (posição
// "congelada" no array no momento do render) em vez de areaId — mesma
// classe de bug já corrigida em deleteA11ySpec/toggleA11ySpecVisibility/
// toggleA11ySpecLock/editA11ySpec, ver comentário em deleteA11ySpec.
function deleteA11yArea(areaId) {
  const originalIndex = a11yAreas.findIndex(a => a && a.id === areaId);
  const area = a11yAreas[originalIndex];
  if (!area) return;

  const specsToRemove = (a11ySpecs || []).filter(s => s && s.a11yAreaId === area.id);
  specsToRemove.forEach(spec => {
    if (spec.id) parent.postMessage({ pluginMessage: { type: 'delete-node', id: spec.id } }, '*');
  });
  a11ySpecs = (a11ySpecs || []).filter(s => !(s && s.a11yAreaId === area.id));
  // Rede de segurança pro clone de specs (2026-09-08) — o delete-node
  // individual acima cobre as specs já conhecidas no array local, mas o
  // clone da área (specs agora documentam sobre uma cópia, não mais o
  // frame original) e qualquer spec órfã (array local dessincronizado)
  // precisam ser localizados por pluginData direto no canvas.
  parent.postMessage({ pluginMessage: { type: 'delete-specs-for-area', areaId: area.id } }, '*');

  const tabItemsToRemove = _currentTabOrderItems(area.id);
  tabItemsToRemove.forEach(it => {
    if (it.id) parent.postMessage({ pluginMessage: { type: 'delete-node', id: it.id } }, '*');
  });
  tabOrderItems = (tabOrderItems || []).filter(it => !(it && it.a11yAreaId === area.id));

  parent.postMessage({ pluginMessage: { type: 'delete-tab-order-copy-for-area', areaId: area.id } }, '*');
  // A limpeza local de hacData.a11ySwipePaths acontece na resposta
  // (handleSwipePathCleanedUp, messages.js), pra não dessincronizar se o
  // backend não achar nada.
  parent.postMessage({ pluginMessage: { type: 'cleanup-swipe-path-for-area', areaId: area.id } }, '*');
  parent.postMessage({ pluginMessage: { type: 'delete-ficha-for-area', areaId: area.id } }, '*');

  if (area.id) {
    parent.postMessage({ pluginMessage: { type: 'delete-node', id: area.id } }, '*');
  }
  a11yAreas.splice(originalIndex, 1);
  saveToStorage();
  renderA11yGroupedList();
}
window.deleteA11yArea = deleteA11yArea;

// ── Guia de categorias ───────────────────────────────────────────────────
function openA11yCategoriesHelp() {
  _applyA11yCategoriesHelpOriginFilter();
  openModal('a11y-categories-help-modal');
}
window.openA11yCategoriesHelp = openA11yCategoriesHelp;

// Mesma regra de _applyA11yCategoryPickerOriginFilter (a lib mobile "Design
// Acessível | Super App" só publica 3 das 5 categorias) aplicada ao modal
// educativo "Entendendo as categorias" — antes desta correção, o modal
// mostrava as 5 categorias sempre, com o texto de cada uma mencionando as
// duas plataformas ao mesmo tempo ("...No mobile, esta categoria não tem
// componente equivalente..."), incoerente com o resto do app (que já filtra
// estruturalmente por origem). Agora esconde os blocos inteiros de
// "Estrutura da Página" e "Informações Adicionais" quando mobile — mesmas
// duas categorias já escondidas no seletor de Nova Spec — e o texto de cada
// categoria remanescente não precisa mais citar a outra plataforma.
function _applyA11yCategoriesHelpOriginFilter() {
  const mobileOnly = isA11yMobileProject();
  ['estrutura', 'informacoes'].forEach((category) => {
    const block = document.getElementById('a11y-categories-help-' + category);
    if (block) block.classList.toggle('hidden', mobileOnly);
  });
  // Mesma correção de nome do picker (_applyA11yCategoryPickerOriginFilter):
  // "Nível de Título" (web) / "Títulos" (mobile).
  const tituloLabelEl = document.getElementById('a11y-categories-help-titulo-label');
  if (tituloLabelEl) tituloLabelEl.textContent = getA11yCategoryLabel('titulo');
  // "Nível de título" e "Elementos interativos e imagens" continuam visíveis
  // nas duas plataformas, mas com um parágrafo de explicação DIFERENTE por
  // origem (data-a11y-help-origin="web"/"mobile") — nunca os dois ao mesmo
  // tempo, ao contrário do texto híbrido anterior a esta correção.
  document.querySelectorAll('#a11y-categories-help-modal [data-a11y-help-origin]').forEach((p) => {
    const matchesOrigin = p.getAttribute('data-a11y-help-origin') === (mobileOnly ? 'mobile' : 'web');
    p.classList.toggle('hidden', !matchesOrigin);
  });
}

window._applyA11yCategoriesHelpOriginFilter = _applyA11yCategoriesHelpOriginFilter;
