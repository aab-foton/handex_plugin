// ============================================================
// GERADO AUTOMATICAMENTE por build-ficha-instruction-constants.cjs — não editar à mão.
// Fonte: refs/ficha-instruction-content.json
// Regenerar via: node src/plugin/refs/build-ficha-instruction-constants.cjs
//            ou: npm run refs:ficha-instruction
//
// Gerado em: 2026-09-10T17:26:08.670Z
//
// Consumido por src/plugin/modules/onboarding.js como
// FICHA_INSTRUCTION_CONTENT_UI.tabulacao/.swipe/.leitorTela — mesmo
// conteúdo rico usado pelo backend (code.js) na coluna de legenda da Ficha
// (ver _buildFichaLegendColumn). Concatenado por build.cjs no bundle final
// (ui.html) ANTES de accessibility.js/onboarding.js.
// ============================================================

const FICHA_INSTRUCTION_CONTENT_UI = {
  "tabulacao": {
    "title": "Ordem de Tabulação",
    "instructionsHeading": "Instruções sobre o tipo de documentação",
    "instructionsBody": "É a sequência lógica que o leitor de telas (VoiceOver/TalkBack) percorre nos elementos INTERATIVOS quando o usuário navega pela interface usando o gesto de varredura (deslizando o dedo na tela para avançar ou retornar).\n\n⚠️ Atenção: Use os marcadores numéricos apenas para indicar a sequência dos elementos na tela.\nDescrever os textos que o leitor de telas deve falar é a próxima etapa do handoff.",
    "stepsHeading": "Como fazer a ordem de tabulação",
    "steps": [
      "Dê detach no template para poder usar.",
      "Posicione as telas: Cole as telas do seu fluxo na área de trabalho e utilize o conector de identificação para nomear cada uma delas. (O frame permite redimensionamento livre para se adequar às dimensões da sua interface).",
      "Numere apenas os interativos: Aplique os marcadores de ordem de tabulação exclusivamente nos elementos acionáveis (botões ativos, campos de digitação, links e cards).",
      "Ignore os itens sem ação: Textos puramente estáticos e botões desativados (disabled) não recebem foco do leitor de telas. Deixe esses elementos sem numeração.",
      "Siga a ordem de leitura: Posicione os números de forma sequencial, da esquerda para a direita e de cima para baixo."
    ],
    "assetsHeading": "Assets",
    "assets": [
      {
        "label": "Conector de identificação",
        "description": "para nomear telas ou itens:"
      },
      {
        "label": "Marcadores de ordem",
        "description": "para a ordem de tabulação:"
      }
    ]
  },
  "swipe": {
    "title": "",
    "instructionsHeading": "",
    "instructionsBody": "",
    "stepsHeading": "",
    "steps": [],
    "assetsHeading": "",
    "assets": []
  },
  "leitorTela": {
    "title": "Especificações para Leitores de Tela",
    "instructionsHeading": "Instruções sobre o tipo de documentação",
    "instructionsBody": "A Ordem de Tabulação define o caminho, já os cards de especificação (Box Specs) definem o que o leitor de telas vai falar em cada passo.",
    "stepsHeading": "Como classificar os Elementos na Tela",
    "steps": [
      "Posicione as telas: Cole as telas do seu fluxo na área de trabalho para iniciar a documentação.",
      "Classifique os componentes: Utilize o conector de Elementos e Imagens para classificar os componentes, links e imagens essenciais para o contexto da sua interface. Siga a ordem alfabética ou numérica dentro do circulo. ️Atenção: os specs possuem variáveis, customize de acordo com a necessidade.",
      "Especifique os títulos: Se o elemento que você está documentando for um título, utilize exclusivamente o componente de Título para marcá-lo.",
      "Ignore itens decorativos: Imagens e ícones puramente ilustrativos não são lidos pelo leitor de telas. Deixe esses elementos de fora da classificação utilizando o conector de Elemento decorativo."
    ],
    "assetsHeading": "Entendendo as categorias",
    "assets": [
      {
        "label": "Elementos e imagens",
        "description": "Utilizado para garantir a acessibilidade de elementos interativos e imagens. Atenção: descreva imagens apenas se forem essenciais para a navegação ou contexto, nos demais casos, marque as imagens como decorativas. Para ícones clicáveis, o label deve ditar a ação (ex: ‘Buscar’ para ícone de lupa)"
      },
      {
        "label": "Título",
        "description": "Estrutura os cabeçalhos do app, permitindo que o leitor de telas navegue diretamente entre os tópicos. Atenção: Diferente da web, no mobile React não existe marcação de níveis como H1, H2, H3... O marcador é único e serve apenas para identificar o elemento como título."
      },
      {
        "label": "Elemento decorativo",
        "description": "Utilizado para marcar os elementos decorativos, que devem ser ignorados por leitores de tela, como imagens que não passam conteúdo ou função, formas abstratas, divisores ou ícones decorativos."
      }
    ]
  }
};
