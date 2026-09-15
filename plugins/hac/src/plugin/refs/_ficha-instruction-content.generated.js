// ============================================================
// GERADO AUTOMATICAMENTE por build-ficha-instruction-constants.cjs — não editar à mão.
// Fonte: refs/ficha-instruction-content.json
// Regenerar via: node src/plugin/refs/build-ficha-instruction-constants.cjs
//            ou: npm run refs:ficha-instruction
//
// Gerado em: 2026-09-15T00:24:42.887Z
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
    "instructionsBody": "É a sequência lógica que o Leitor de tela (VoiceOver/TalkBack) percorre nos elementos INTERATIVOS quando o usuário navega com outros devices em interfaces de toque como teclados, mouses com botões programáveis ou acionadores .",
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
    "title": "Ordem de Leitura Mobile (Swipe)",
    "instructionsHeading": "Instruções sobre a documentação",
    "instructionsBody": "Essa documentação trata-se de como o leitor de tela (VoiceOver/Talkback) deve seguir sequencialmente de forma nativa com o Basic Swipe, ou seja, sem os atalhos do rotor.",
    "stepsHeading": "",
    "steps": [],
    "assetsHeading": "",
    "assets": []
  },
  "leitorTela": {
    "title": "Especificações para Leitores de Tela",
    "instructionsHeading": "Instruções sobre a documentação",
    "instructionsBody": "Especificar para leitores de tela consiste em definir como as tecnologias assistivas (VoiceOver/Talkback) interpretam e anunciam os elementos da interface. Essa documentação assegura que o conteúdo seja plenamente compreendido e inclusivo, fornecendo as orientações fundamentais para que o time de desenvolvimento implemente a experiência exatamente como projetada.",
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
        "label": "Elementos interativos e imagens",
        "description": "Utilizado para referenciar componentes no Super DSC, garantir nome acessível aos elementos e descrever textos alternativos nas imagens."
      },
      {
        "label": "Títulos",
        "description": "Utilizado para estruturar os cabeçalhos da interface, permitindo que o leitor de tela navegue diretamente entre os tópicos que foram definidos como títulos de conteúdo."
      },
      {
        "label": "Elementos decorativos",
        "description": "Utilizado para marcar os elementos que devem ser ignorados pelo leitor de tela, como por exemplo imagens que não passam conteúdo ou função, formas abstratas, divisores ou ícones decorativos."
      }
    ]
  }
};
