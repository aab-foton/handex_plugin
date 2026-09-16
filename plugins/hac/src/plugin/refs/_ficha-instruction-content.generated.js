// ============================================================
// GERADO AUTOMATICAMENTE por build-ficha-instruction-constants.cjs — não editar à mão.
// Fonte: refs/ficha-instruction-content.json
// Regenerar via: node src/plugin/refs/build-ficha-instruction-constants.cjs
//            ou: npm run refs:ficha-instruction
//
// Gerado em: 2026-09-16T20:16:58.693Z
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
      "Selecione os componentes interativos e imagens essenciais: Selecione apenas os elementos acionáveis da tela (como botões ativos, links, campos de formulário e seletores) e imagens cujo conteúdo seja indispensável para a navegação.",
      "Siga a ordem de leitura ocidental: Selecione esses elementos sequencialmente respeitando o fluxo do layout, da esquerda para a direita, de cima para baixo.",
      "Ignore elementos não interativos: Não inclua na seleção textos puramente estáticos, rótulos de campos, imagens decorativas ou botões desativados (disabled)."
    ],
    "assetsHeading": "",
    "assets": []
  },
  "swipe": {
    "title": "Ordem de Leitura Mobile (Swipe)",
    "instructionsHeading": "Instruções sobre a documentação",
    "instructionsBody": "Essa documentação trata-se de como o leitor de tela (VoiceOver/Talkback) deve seguir sequencialmente de forma nativa com a navegação via Swipe, ou seja, sem os atalhos do rotor.",
    "stepsHeading": "Como fazer a ordem de Leitura Mobile (Swipe)",
    "steps": [
      "Selecione todos os elementos na tela: Classifique elemento a elemento na tela de forma que demonstre um caminho ao qual o leitor de telas deve percorrer quando navegável nativamente com Basic Swipe.",
      "Siga a ordem de leitura ocidental: Selecione esses elementos sequencialmente respeitando o fluxo do layout, da esquerda para a direita, de cima para baixo."
    ],
    "assetsHeading": "",
    "assets": []
  },
  "leitorTela": {
    "title": "Especificações para Leitor de Tela",
    "instructionsHeading": "Instruções sobre a documentação",
    "instructionsBody": "Especificar para leitores de tela consiste em definir como as tecnologias assistivas (VoiceOver/Talkback) interpretam e anunciam os elementos da interface. Essa documentação assegura que o conteúdo seja plenamente compreendido e inclusivo, fornecendo as orientações fundamentais para que o time de desenvolvimento implemente a experiência exatamente como projetada.",
    "stepsHeading": "Como fazer as especificações para Leitor de Tela",
    "steps": [
      "Classifique os componentes: Utilize o conector de Elementos Interativos e Imagens para classificar os componentes interativos e imagens essenciais para o contexto da sua interface. Siga a ordem numérica dentro do círculo.",
      "Especifique os títulos: Se o elemento que você está documentando for um título, utilize o conector Títulos para marcá-lo. No mobile (React Native) não é necessário mapear a hierarquia de níveis como no desktop, todo título usa o mesmo marcador \"H\", sem distinção H1-H6.",
      "Ignore itens decorativos: Imagens e ícones puramente ilustrativos não são lidos pelo leitor de tela, classifique-os com o conector Elementos Decorativos."
    ],
    "assetsHeading": "",
    "assets": []
  }
};
