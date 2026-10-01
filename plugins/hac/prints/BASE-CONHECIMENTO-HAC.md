# HAC — Handoff de Acessibilidade CAIXA
## Guia completo da ferramenta

Documento de referência sobre o plugin HAC (versão 0.1.0-beta.66). Explica o
que a ferramenta faz, para quem, como funciona cada etapa e por que ela foi
desenhada assim. Serve de base para materiais de treinamento e tutoriais.

---

## 1. O que é o HAC

O HAC é um plugin do Figma criado pela Fóton para a CAIXA. Ele permite que
designers **documentem a acessibilidade de uma tela diretamente no canvas do
Figma**, sem planilhas, sem documentos separados e sem depender de reuniões
de explicação com o time de desenvolvimento.

Ele registra três informações sobre cada tela:

1. **Ordem de tabulação** — a sequência em que o teclado (ou outro
   dispositivo de navegação) percorre os elementos interativos.
2. **Ordem de leitura por swipe** — no mobile, o caminho que o gesto de
   deslizar percorre, ponto a ponto.
3. **Especificações para leitor de tela** — como VoiceOver e TalkBack devem
   anunciar cada elemento: o que dizem, se devem ou não ser lidos, e qual
   nota técnica o desenvolvedor precisa aplicar.

O resultado é um **documento visual de handoff**, montado no próprio Figma,
que o time de desenvolvimento usa para implementar a acessibilidade
exatamente como foi projetada.

### Para quem é

Designers da CAIXA que trabalham com o Design System CAIXA (DSC). O plugin
pertence à vertical de Acessibilidade. Ele assume que quem usa conhece o
Figma (frames, camadas, componentes), mas **não** assume conhecimento prévio
de acessibilidade — as instruções aparecem dentro do próprio plugin.

### Quem consome o resultado

O time de desenvolvimento. O documento gerado responde a perguntas que
normalmente viram retrabalho: "em que ordem o foco passa pelos elementos?",
"esse ícone deve ser lido?", "qual rótulo o leitor de tela anuncia neste
botão?", "qual propriedade eu aplico no código?".

---

## 2. Conceitos essenciais

Estes termos aparecem em toda a ferramenta.

**Leitor de tela.** Tecnologia assistiva que lê a interface em voz alta para
pessoas cegas ou com baixa visão. No iOS chama-se VoiceOver; no Android,
TalkBack.

**Ordem de tabulação.** A sequência lógica em que o leitor de tela percorre
os elementos **interativos** — botões, links, campos, seletores e imagens
cujo conteúdo é essencial. Quem navega só por teclado ou por dispositivos
acionadores depende dessa ordem. Normalmente segue a leitura ocidental:
esquerda para a direita, de cima para baixo.

**Swipe.** O gesto de deslizar o dedo para avançar de um elemento ao
seguinte no celular. Pessoas que usam leitor de tela no mobile navegam assim.
Documentar o caminho do swipe garante que a ordem faça sentido.

**Especificação (spec).** O registro de como um elemento específico deve ser
tratado pelo leitor de tela. Cada spec tem uma categoria, um rótulo, uma
descrição e, quando necessário, observações e notas de código.

**Tela documentada.** Cada frame que o designer seleciona para documentar.
Funciona como uma "pasta": ela não carrega regra de acessibilidade sozinha,
apenas organiza tudo que é criado para ela.

**Réplica de trabalho.** Uma cópia da tela que o plugin cria automaticamente.
Todos os marcadores são desenhados sobre a réplica, nunca sobre o design
original.

**Handoff.** O documento final, montado no canvas, com a réplica, as três
seções documentadas e os dados de autoria.

**DSC.** Design System CAIXA. O plugin reconhece componentes das bibliotecas
DSC e usa isso para sugerir categorias automaticamente.

**Design Acessível.** A biblioteca Figma que define os componentes visuais
de documentação — selos, conectores e cartões de especificação. O plugin
usa os componentes reais dessa biblioteca; nunca desenha marcadores por
conta própria. É a fonte de verdade das regras de acessibilidade.

---

## 3. Garantia central: o design original nunca é alterado

Este é o princípio mais importante da ferramenta.

Quando o designer inicia qualquer documentação, o plugin **clona a tela** para
um espaço livre do canvas e foca nessa cópia. Selos, trilhas e cartões são
desenhados sobre a réplica. O frame original permanece exatamente como estava.

Por que isso importa:

- O arquivo de design fica limpo — sem centenas de marcadores misturados.
- O designer pode errar, apagar e refazer sem risco.
- A documentação fica isolada e pode ser removida sem tocar no design.

Além disso, o plugin trabalha numa **página dedicada** do Figma, separada
das páginas de design (ver seção 5).

---

## 4. Plataformas suportadas

Na primeira abertura, o plugin pergunta qual biblioteca o projeto usa:

- **Super DSC Mobile** — projetos para aplicativos (React Native).
- **Super DSC Web** — projetos para web. Marcada como **"EM TESTE"**.

Essa escolha é a primeira decisão e vale para o projeto inteiro. Ela define
quais categorias, quais componentes e quais campos o plugin oferece depois.
Pode ser trocada em "Sobre o hac", na opção "Trocar" ao lado de "Plataforma
do projeto".

Para web, o plugin reconhece as bibliotecas **DSC Web Angular & React**
(legado) e **Super DSC Web**, que coexistem durante a migração do design
system.

### Diferenças práticas entre mobile e web

| Aspecto | Mobile | Web |
|---|---|---|
| Categorias de spec | 3 | 5 |
| Nível de título | Um marcador único "H", sem hierarquia | H1 a H6 |
| Ordem de swipe | Disponível | Não se aplica |
| Nota de código | Usa `accessibilityRole` (React Native) | Usa tags HTML (`<header>`, `<nav>`, `<main>` etc.) |

React Native não tem hierarquia de títulos como o HTML, por isso o mobile usa
um marcador único.

---

## 5. Estrutura no Figma

### A página do handoff

O plugin cria uma página dedicada, com o nome **"HAC - Handoff de
Acessibilidade CAIXA"**, e leva o designer até ela. Todas as telas a
documentar são copiadas para essa página.

**Por que uma página separada?** Para isolar a documentação do arquivo de
design original. O trabalho de acessibilidade não se mistura com as páginas
de design.

### Como trazer as telas

1. Ir até a página onde estão as telas.
2. Selecionar as telas e copiar (Ctrl+C, ou Cmd+C no Mac).
3. Voltar à página do handoff e colar (Ctrl+V).
4. Repetir para telas de outras páginas, se houver.
5. Com as telas coladas, usar **Selecionar Tela** para começar a documentar
   cada uma.

### A Section do handoff

Toda a documentação de um designer fica agrupada numa **Section** com nome no
formato:

`[HAC] Handoff de Acessibilidade | data e hora | nome do designer | versão`

Enquanto o handoff não foi finalizado, a versão aparece como **"rascunho"**.

### Vários designers no mesmo arquivo

Cada designer tem a **sua própria Section**, identificada pelo usuário do
Figma (não apenas pelo nome exibido). Dois designers trabalhando no mesmo
arquivo ao mesmo tempo não misturam o trabalho.

---

## 6. A jornada completa

### 6.1 Tela inicial e escolha da biblioteca

O plugin abre com uma tela de boas-vindas: "Documente ordem de tabulação e
especificação para Leitor de Tela de forma simples, rápida e escalável com
o DSC." O designer escolhe entre Super DSC Mobile e Super DSC Web.

### 6.2 Menu "Sobre o hac"

Mostra a versão instalada, a vertical responsável (Acessibilidade) e a
plataforma do projeto, com a opção de trocar. Na área de **Manutenção**:

- **Limpar cache** — apaga dados temporários do plugin.
- **Limpar tudo (cache + canvas)** — apaga também o que o plugin desenhou no
  canvas. É uma ação destrutiva, destacada em vermelho.

### 6.3 Preparar a página e trazer as telas

Depois de escolher a biblioteca, o plugin cria a página dedicada e abre a
janela **"Traga as telas para o handoff"**, com o passo a passo de copiar e
colar descrito na seção 5. Há também uma explicação do motivo de a página ser
separada.

Nessa mesma janela existe o botão **"Buscar documentação existente"**. Ele
varre o arquivo inteiro e lista handoffs já criados, informando quem fez,
quando, quantas telas, a versão, em qual página está, e oferece **"Ver no
canvas"** para navegar até lá. Handoffs de outros designers aparecem com o
aviso de que o trabalho de quem está usando o plugin continuará numa Section
própria. A busca só roda quando o botão é clicado.

### 6.4 Selecionar a primeira tela

O estado inicial mostra "Nenhuma tela selecionada" e o botão **Selecionar
Tela**. O fluxo:

1. Selecionar o frame no canvas.
2. Clicar em Selecionar Tela.
3. Uma janela mostra o **rótulo da tela**, preenchido automaticamente com o
   nome do frame (até 80 caracteres). O botão **"Atualizar nome"** recupera o
   nome atual do frame caso ele tenha mudado.
4. Confirmar em **Selecionar**.

A tela entra na lista **"Telas documentadas"**, numerada. Um selo azul com o
número aparece no canvas. O cartão da tela mostra três pendências —
**Tabulação, Ordem de Leitura e Leitor de Tela** — e um contador
**"Handoff de Acessibilidade: 0/3 seções inseridas"** acompanha o progresso.

Abaixo da lista há o painel **"Handoff de Acessibilidade do projeto"**, que
mostra quantas telas têm o checklist fechado e abriga o botão Finalizar
(ver 6.10).

### 6.5 Espaço de trabalho da tela

Clicar no cartão da tela abre o espaço de trabalho dela, organizado em
**quatro abas**:

1. **Tabulação**
2. **Swipe**
3. **Leitor de Tela**
4. **Resumo**

Cada uma das três primeiras é uma etapa de documentação. A quarta consolida
tudo e gera o documento final. O botão de voltar (seta) retorna à lista de
telas, e o menu de três pontos oferece ações da tela.

Cada aba de trabalho tem um botão **"Preencher"** (por exemplo, "Preencher
Tabulação") que **insere aquela seção no documento de handoff**.

---

### 6.6 Etapa 1 — Ordem de Tabulação

**Objetivo:** definir a sequência em que o leitor de tela percorre os
elementos interativos.

**Instruções.** Ao abrir a aba pela primeira vez, o plugin mostra o link
**"Ver instruções"**. As regras são:

1. **Selecione os componentes interativos e imagens essenciais.** Apenas
   elementos acionáveis (botões ativos, links, campos de formulário,
   seletores) e imagens cujo conteúdo é indispensável.
2. **Siga a ordem de leitura ocidental.** Esquerda para a direita, cima para
   baixo.
3. **Ignore elementos não interativos.** Não inclua textos estáticos,
   imagens puramente decorativas ou botões desativados.

**Como montar a ordem.** Clicar em **Criar ordem de tabulação**, ler a
instrução e começar a seleção. O plugin cria a réplica e foca nela. O
designer seleciona os elementos **na ordem em que o teclado deve
percorrê-los**, segurando **Shift e clicando** em cada um. Uma barra flutuante
mostra o contador "itens marcados", que cresce a cada clique. Também é
possível usar marquise (arrastar uma caixa de seleção) para marcar vários de
uma vez.

Nesta versão a montagem da tabulação é **manual**. O Mapeamento Automático
existe apenas na aba Leitor de Tela (ver 6.9).

**Concluir e revisar.** Ao clicar em **Concluir seleção**, abre a lista de
revisão: a sequência marcada no canvas, com cada item numerado. Nela é
possível:

- **Arrastar** itens para reordenar.
- **Remover** itens com a lixeira.
- **Adicionar item** para incluir mais elementos — eles sempre somam ao final
  da ordem existente.

**Criar.** Em **Criar ordem de tabulação**, o plugin desenha os **selos
numerados** sobre a réplica, um por um. Uma janela **"Processando"** mostra o
avanço ("Desenhando 3 de 16..."). Os selos são componentes reais da
biblioteca Design Acessível.

**Resultado.** A aba passa a mostrar a lista numerada. Cada linha tem:

- Um ícone de mira para **focar** o elemento no canvas.
- Uma lixeira para remover o item.
- Alça para arrastar e reordenar.

**Simular leitura.** Um botão dispara uma narração em voz real, percorrendo
cada parada da ordem e destacando o elemento correspondente no canvas — como
um leitor de tela faria. Há seletor de **idioma** (PT) e de **velocidade**
(por exemplo, 1.5x). Serve para o designer "ouvir" a experiência que está
documentando e conferir se a sequência faz sentido antes de entregar. Usa a
síntese de voz do próprio navegador, sem serviço externo.

**Atualizar.** Depois de criada a ordem, a lista da aba ainda permite
reordenar (arrastando) e apagar itens. Essas mudanças aparecem primeiro só na
lista; o botão **Atualizar** envia a nova numeração para os selos no canvas.
Ele fica desabilitado enquanto não há nada a sincronizar.

**Preencher Tabulação.** Insere a seção no documento de handoff.

**Adicionar depois.** Uma ordem já criada pode receber mais itens com
**Adicionar itens**; eles entram sempre no final.

---

### 6.7 Etapa 2 — Ordem de Leitura (Swipe)

**Exclusiva para mobile.** Em projetos web esta etapa não se aplica. Segundo
a documentação interna, é um recurso ainda em validação de campo.

**Objetivo:** documentar o caminho do gesto de swipe, ponto a ponto.

**O que é.** É a ordem em que os leitores de tela mobile (VoiceOver e
TalkBack) devem seguir sequencialmente, de forma nativa, com o **Basic Swipe**
— ou seja, **sem os atalhos do rotor**. Basic Swipe é o gesto simples de
deslizar o dedo para o próximo elemento. O rotor é o atalho do leitor de tela
que permite pular direto por tipo de elemento (por exemplo, só títulos ou só
links); ele fica fora desta documentação.

**Diferença em relação à tabulação.** A tabulação lista apenas os elementos
**interativos**. O swipe pede que se **selecione todos os elementos da tela**
(textos, imagens, botões), de forma que a sequência demonstre o caminho
completo que o leitor de tela percorre. O resultado é uma **trilha**: uma linha
contínua, com setas, que liga os pontos na ordem em que o gesto os visita. Os
pontos podem ser qualquer elemento ou frame.

**Como fazer.** A mecânica de captura é a mesma da tabulação:

- Shift + clique em cada ponto, na ordem em que o swipe deve passar.
- A instrução mostra o contador de pontos ("1 ponto marcado").
- **Concluir seleção** abre a lista **"Trilha de Ordem de Leitura"**, com os
  pontos numerados, arrastáveis para reordenar e removíveis. Há **"Adicionar
  ponto"** para incluir mais.
- **Criar trilha de ordem de leitura** desenha a trilha sobre a réplica.

**Resultado no canvas.** Uma linha azul, em traço grosso, com setas
direcionais em cada segmento, em zigue-zague, ligando os pontos na ordem
definida. O plugin confirma com a mensagem **"Trilha de swipe criada."** e a
aba passa a mostrar o título **"Trilha de Ordem de Leitura (16 pontos)"**.

**Regra.** Cada tela tem no máximo uma trilha. Recriar substitui a anterior.
O plugin só remove a trilha antiga depois de confirmar que a nova foi
desenhada com sucesso — se algo falhar, a antiga permanece intacta.

---

### 6.8 Etapa 3 — Leitor de Tela

**Objetivo:** definir **como cada elemento é anunciado** pela tecnologia
assistiva.

**Instruções.** A janela **"Especificações para Leitor de Tela"** explica que
especificar para leitores de tela é definir como VoiceOver e TalkBack
interpretam e anunciam os elementos, garantindo que o conteúdo seja
plenamente compreendido e que o time implemente exatamente como projetado.

**Dois jeitos de criar specs:**

- **+ Nova spec** (manual).
- **Mapeamento Automático** (ver 6.9).

**Fluxo manual:**

1. Selecionar um elemento no canvas. **Se já houver um elemento selecionado
   ao clicar em "+ Nova spec", ele é usado direto** — não é preciso
   selecionar de novo. O plugin mantém a seleção e leva a visão até a
   réplica, centralizada no elemento equivalente.
2. Clicar em **+ Nova spec**.
3. A janela **"Nova especificação"** mostra o elemento selecionado e as
   categorias. O plugin identifica o componente e marca a categoria
   provável com **"SUGERIDO"**. Se não houver sugestão, informa "Sem
   categoria sugerida — escolha abaixo".
4. Escolher a categoria e preencher o formulário.
5. **Aplicar.**

**Ao aplicar**, o cartão da especificação nasce no canvas, ao lado da
réplica, com um marcador sobre o elemento. Aparece o aviso: *"Especificação
criada e posicionada, travada por padrão. Use o cadeado pra ajustar."*

#### O formulário da especificação

Depois de escolher a categoria, abre o formulário, que mostra no topo a **tela**
(Área) e o **elemento** ("Camada no canvas"), com o componente do DSC
identificado ou "Não identificado".

**Elementos e Imagens (mobile)** pede:

- **Componente do DSC** — lista dos componentes reconhecidos, já preenchida
  automaticamente quando o plugin identifica o componente.
- **Leitor de Tela** — o comportamento do componente, por exemplo "Default".
- **Link ou nome do componente** — preenchido automaticamente a partir do
  componente do DSC e **bloqueado com cadeado** (limite de 300 caracteres).
  Só fica editável quando se escolhe "Personalizado".
- **Tag** — o número que aparece dentro do círculo do marcador (o plugin
  sugere o próximo da sequência).
- **Observações** — caixa de seleção que liga um campo opcional de texto.

**Elemento Decorativo (mobile)** mostra o subtipo ("Elemento Decorativo
(mobile, sem subtipo)"), uma **Descrição fixa** ("Não deve ser anunciado pelo
Leitor de Tela.") e as caixas opcionais **Observações** e **Notas de Código**.

**Em todas as categorias**, o rodapé do formulário pede:

- **Modo de marcação** — como o marcador aparece sobre o elemento:
  **Contorno** envolve o elemento com uma moldura; **Linha** liga um ponto do
  elemento ao cartão da spec com um traço.
- **Lado da guia** — de que lado do elemento o cartão nasce: **Dir.**
  (direita), **Esq.** (esquerda), **Topo** ou **Base**.

Os botões finais são **Cancelar** e **Aplicar**.

#### As categorias

**Mobile (3 categorias):**

| Categoria | Selo | Para que serve |
|---|---|---|
| **Títulos** | **H** (verde-limão) | Elementos que estruturam a página em seções |
| **Elementos e Imagens** | **1** (amarelo, numerado) | Componentes interativos e imagens com conteúdo relevante |
| **Elemento Decorativo** | **Ø** (vermelho) | Elementos que **não** devem ser anunciados |

**Web (5 categorias):** as três acima (com Nível de Título usando H1 a H6) e
mais:

| Categoria | Selo | Para que serve |
|---|---|---|
| **Estrutura da Página** | Estrela (coral) | Marcos de navegação: cabeçalho, navegação, conteúdo principal, rodapé |
| **Informações Adicionais** | Quadrado (laranja) | Formato livre para observações que não cabem nas outras |

O mobile não tem Estrutura da Página nem Informações Adicionais porque a
biblioteca mobile não modela marcos semânticos, e o formato livre é
exclusivo do web.

#### O que cada categoria registra

Toda spec tem, no fundo, os mesmos campos:

- **Descrição** — como o elemento deve ou não ser lido em voz alta.
- **Notas de Código** — o apontamento técnico que o desenvolvedor usa para
  implementar.
- **Observações** — informação adicional opcional.

Para **Elementos e Imagens**, o formulário pede também o **Label** — o nome
acessível, ou seja, o texto que o leitor de tela anuncia. Regra de ouro: o
label deve descrever a **função** do elemento, não o tipo de componente.

**No mobile, Elementos e Imagens tem três variantes:**

1. **Componente** — para componentes do DSC. Mostra o nome do componente, um
   **link** para ele na biblioteca e o comportamento do leitor de tela.
2. **Link** — para links, com descrição fixa que indica ao usuário que o link
   abre uma nova janela.
3. **Texto alternativo** — para imagens; a descrição livre é o texto
   alternativo real.

#### Limites de caracteres

Todo campo de texto livre tem limite, mostrado por um contador na tela:

| Campo | Limite |
|---|---|
| Rótulo da tela | 80 |
| Label (nome acessível) | 100 |
| Tag manual (elementos, estrutura, informações) | 8 |
| Texto alternativo / Descrição (mobile) | 180 |
| Descrição (formato customizável) | 200 |
| Link ou nome do componente (mobile) | 300 |
| Dica para o leitor de tela (mobile) | 300 |
| Observações | 400 |
| Notas de código | 500 |

#### Gerenciando as specs

Depois de criadas, as specs aparecem agrupadas **por categoria** na lista,
em seções que podem ser expandidas e recolhidas (**Expandir todos** /
**Recolher todos**). Cada spec tem ações:

- **Mira** — foca o elemento no canvas.
- **Olho** — mostra ou oculta a spec no canvas.
- **Cadeado** — trava ou destrava a posição do cartão. Specs nascem travadas
  para não serem movidas sem querer.
- **Lápis** — edita a spec.
- **Lixeira** — exclui a spec.

O botão **Preencher Leitor de Tela** insere a seção no documento de handoff.

#### Como as specs se posicionam

Os cartões nascem ao lado da réplica, organizados em **colunas por
categoria**. Novas specs da mesma categoria empilham na mesma coluna, sem
sobrepor as anteriores.

---

### 6.9 Mapeamento Automático de specs

Dentro da aba Leitor de Tela, o botão **Mapeamento Automático** faz o plugin
varrer a tela, comparar cada componente com o catálogo do Design System e
**sugerir a categoria** de cada um.

O resultado abre num resumo com grupos sugeridos. Ao clicar em **Iniciar
Revisão**, cada item detectado abre **um por vez**, com o indicador **"Item
N de M"**. Para cada um, o designer pode:

- **Confirmar** e aplicar a spec.
- **Ajustar a categoria** com o ícone de trocar ao lado do título.
- **Descartar** o item sem criar spec.
- **Focar** para destacar o elemento no canvas.
- **Navegar** livremente entre itens, ou pular direto para um número.

**Quem decide é o designer.** O plugin sugere pelo tipo de componente, mas
ícones e imagens exigem atenção: se são decorativos ou informativos depende
do contexto de uso, não só do componente.

Componentes que o scan encontrou mas ainda não viraram spec ficam no grupo
**"Não Documentados"**, na aba Leitor de Tela, com o botão **Criar spec**. É a
garantia de que nenhum componente fique de fora do handoff por esquecimento.

Fechar a revisão sem querer oferece retomada; cancelar explicitamente não
oferece. As specs já confirmadas são sempre preservadas.

---

### 6.10 Aba Resumo, geração e finalização

**Resumo.** Mostra o status de cada etapa. Antes de gerar, as três aparecem
como **"Ainda não inserida no handoff"**. O botão **Gerar Handoff** monta o
documento completo.

**O documento gerado.** Uma moldura **"[HAC] Documentação"**, dentro da
Section do designer, com:

- Um cabeçalho escuro com o título "Documentação da Tela N".
- A **réplica da tela** com o selo numerado.
- A seção **Ordem de Tabulação**, com os selos e o texto de instrução.
- A seção **Ordem de Leitura | Swipe**, com a trilha.
- A seção **Leitor de Tela**, com a réplica, os marcadores e as
  especificações.

Um rótulo acima do documento mostra a **data e hora, o nome do autor e o
status** ("rascunho").

**Depois de gerar.** As três etapas aparecem concluídas com as contagens
(por exemplo, "16 selos no handoff", "16 pontos no handoff", "3
especificações no handoff"). Na lista de telas, cada etapa mostra seu total
e os **selos de categoria** com a contagem de cada uma.

**Alerta de desatualizado.** Se o designer edita uma etapa depois de
inseri-la e esquece de atualizar, o plugin avisa que o documento está
desatualizado, mostrando a contagem atual contra a gravada. O botão **Gerar
Handoff** reinsere apenas o que está pendente ou desatualizado.

**Finalizar.** Quando todas as telas têm o checklist fechado, o painel
**"Handoff de Acessibilidade completo"** habilita o botão **Finalizar**. Ao
clicar, uma janela pede confirmação e explica que finalizar marca esta
geração do handoff como concluída e inicia uma nova versão. Confirmando, o
rótulo do documento muda de "rascunho" para **v1.0**. O designer pode
continuar editando o projeto normalmente depois. O plugin confirma com a
mensagem **"Handoff finalizado: v1.0."**

**Versionamento.** Enquanto o handoff está em andamento, a versão aparece
como **"rascunho"** — inserir seções ou gerar o handoff não altera esse
rótulo. Só **Finalizar** consolida uma versão real: a primeira finalização
gera **v1.0**, a seguinte **v2.0**, depois **v3.0**, e assim por diante. Não
existem versões intermediárias como v1.1. A versão pertence ao projeto
inteiro, não a uma tela.

---

## 7. Ferramentas de apoio

**Ajuda "?".** No cabeçalho do espaço de trabalho, dá acesso ao guia das
categorias: quando usar cada uma, exemplos e casos de borda.

**Onboarding.** Há uma jornada de introdução para mobile e outra para web,
com os passos essenciais. Um banner "Primeira vez aqui?" a oferece, e ela
pode ser revista a qualquer momento.

**Foco no canvas.** Em toda lista existe o ícone de mira, que destaca o
elemento correspondente no Figma.

**Salvamento automático.** O plugin salva o trabalho continuamente e avisa
com a mensagem **"Salvo automaticamente"**.

**Tema.** O plugin tem tema claro e escuro.

---

## 8. Boas práticas

1. **Escolha a biblioteca certa logo no início.** Ela define categorias e
   campos do projeto inteiro.
2. **Documente uma tela por vez**, fechando as três etapas antes de passar
   para a próxima.
3. **Na tabulação, marque só o que é interativo.** Textos estáticos e
   imagens decorativas ficam de fora.
4. **Respeite a ordem de leitura.** Esquerda para a direita, cima para
   baixo, salvo motivo claro para o contrário.
5. **Use Simular leitura antes de gerar o handoff.** Ouvir a sequência
   revela erros que o olhar não pega.
6. **Escreva labels pela função.** "Voltar" e não "Botão seta".
7. **Revise com atenção os ícones no Mapeamento Automático.** Decorativo ou
   informativo depende do contexto.
8. **Confira o alerta de desatualizado** antes de finalizar.
9. **Não edite a documentação em outra Section.** O trabalho de outro
   designer fica na Section dele; o seu, na sua.

---

## 9. Perguntas frequentes

**O plugin altera o meu design?**
Não. Tudo é desenhado sobre uma réplica. O frame original nunca é tocado.

**Por que a documentação fica em outra página?**
Para isolar o trabalho de acessibilidade do arquivo de design original.

**Errei a ordem dos itens. Preciso refazer?**
Não. Na lista de revisão é possível arrastar itens para reordenar, remover e
adicionar.

**Posso acrescentar itens a uma ordem que já criei?**
Sim, com "Adicionar itens". Eles entram sempre no final.

**Outro designer já documentou este arquivo. O que acontece?**
O botão "Buscar documentação existente" mostra o que existe, quem fez e
quando, e leva até lá. O seu trabalho nasce numa Section própria; o do colega
não é alterado.

**Por que a spec nasceu "travada"?**
Para que ninguém a mova sem querer. O cadeado destrava quando for preciso
ajustar a posição.

**O que acontece se eu finalizar?**
O handoff deixa de ser "rascunho" e recebe uma versão (v1.0 na primeira
vez, v2.0 na seguinte). Nada é apagado, e o projeto continua editável.

**A ordem de swipe aparece no web?**
Não. É exclusiva do mobile.

**Por que o mobile tem menos categorias?**
A biblioteca mobile só define três: Títulos, Elementos e Imagens e Elemento
Decorativo. Estrutura da Página e Informações Adicionais existem só no web.

**O que o plugin NÃO faz?**
Não avalia se a tela é acessível, não corrige o design e não substitui o
conhecimento de acessibilidade. Ele **documenta** decisões que o designer
toma, no formato que o time de desenvolvimento consome.

---

## 10. Resumo da jornada em uma página

1. Abrir o plugin e escolher **Super DSC Mobile** ou **Web**.
2. O plugin cria a **página do handoff**; copiar e colar as telas nela.
3. **Selecionar Tela** para cada frame a documentar.
4. Abrir o espaço de trabalho da tela (quatro abas).
5. **Tabulação:** Shift + clique nos elementos interativos, na ordem; revisar;
   **Criar ordem de tabulação**; **Simular leitura**; **Preencher**.
6. **Swipe (mobile):** marcar os pontos do gesto; revisar; **Criar trilha**;
   **Preencher**.
7. **Leitor de Tela:** **+ Nova spec** ou **Mapeamento Automático**; escolher a
   categoria (Título, Elementos e Imagens, Decorativo); preencher; aplicar;
   **Preencher**.
8. **Resumo:** **Gerar Handoff** monta o documento no canvas.
9. Com o checklist fechado, **Finalizar** atribui a versão v1.0.
10. O time de desenvolvimento recebe o documento e implementa.

---

## Anexo A — Texto oficial da vertical, por módulo

A vertical de acessibilidade definiu três módulos para o tutorial. Cada um se
divide em três partes, sempre na mesma ordem: **O que é?**, **Como aplicar em
tela?** e **Como fazer no plugin?**. Os textos abaixo são a redação oficial e
devem ser a base da explicação.

**Termo equivalente.** A vertical e a biblioteca Design Acessível chamam de
**conector** cada tipo de marcador de especificação (Elementos Interativos e
Imagens, Títulos, Elementos Decorativos). No plugin, esses mesmos itens
aparecem como **categorias** na janela "Nova especificação". São a mesma
coisa. Também: **Basic Swipe** é o gesto simples de deslizar para o próximo
elemento, e **rotor** é o atalho do leitor de tela para pular por tipo de
elemento.

### Módulo 1 — Ordem de Tabulação
*Aplica-se a projetos Super DSC Web e Super DSC Mobile.*

**O que é?** É a sequência lógica que os leitores de tela Web e Mobile
percorrem nos elementos interativos quando o usuário navega com dispositivos
como teclados, mouses com botões programáveis ou acionadores.

**Como aplicar em tela?** Selecione apenas os elementos acionáveis da tela,
como botões ativos, links, campos de formulário e seletores cujo conteúdo seja
indispensável para a navegação. Esses elementos devem ser sequenciais,
respeitando o fluxo do layout, da esquerda para a direita, de cima para baixo.
Não inclua na seleção textos puramente estáticos, rótulos de campos, imagens
decorativas ou elementos desativados.

**Como fazer no plugin?** Segure o Shift e vá clicando para selecionar os
elementos acionáveis, um por um. No final, confirme para o plugin mapear a
tabulação de todos esses elementos selecionados.

### Módulo 2 — Ordem de Leitura Mobile (Swipe)
*Aplica-se apenas a projetos Super DSC Mobile.*

**O que é?** É a ordem como os leitores de tela mobile devem seguir
sequencialmente, de forma nativa, com o Basic Swipe — ou seja, sem os atalhos
do rotor.

**Como aplicar em tela?** Selecione todos os elementos da tela, de forma que
demonstrem o caminho que o leitor de tela deve percorrer quando navegável
nativamente com Basic Swipe. Esses elementos devem ser sequenciais,
respeitando o fluxo do layout, da esquerda para a direita, de cima para
baixo.

**Como fazer no plugin?** Segure o Shift e vá clicando para selecionar todos
os elementos, um por um. No final, confirme para o plugin mapear a ordem de
leitura de todos esses elementos selecionados.

### Módulo 3 — Especificações para Leitores de Tela
*Aplica-se a projetos Super DSC Mobile.*

**O que é?** Especificar para leitores de tela consiste em definir como as
tecnologias assistivas (VoiceOver/TalkBack) interpretam e anunciam os
elementos da interface, assegurando que o conteúdo seja plenamente
compreendido e inclusivo, fornecendo as orientações fundamentais para que o
time de desenvolvimento implemente a experiência exatamente como projetada.

**Como aplicar em tela?** Utilize o conector de Elementos Interativos e
Imagens para classificar os componentes interativos e imagens essenciais para
o contexto da sua interface, identificados por número dentro do círculo. Se o
elemento que você está documentando for um título, utilize o conector Títulos
para marcá-lo. No mobile (React Native) não é necessário mapear a hierarquia
de níveis como no desktop: todo título usa o mesmo marcador "H", sem
distinção H1-H6. Imagens e ícones puramente ilustrativos não são lidos pelo
leitor de tela; classifique-os com o conector Elementos Decorativos.

**Como fazer no plugin?** Selecione um componente ou elemento na tela, em
seguida escolha qual tipo de conector deseja utilizar e aplique a
especificação que se aplica ao seu conteúdo: componentes, imagens ou
elementos decorativos.

### Como a vertical organiza cada tela do tutorial

Cada módulo usa o mesmo modelo visual: cabeçalho azul da CAIXA com o logotipo
à esquerda e, à direita, etiquetas com as plataformas em que o módulo se
aplica (Super DSC Web, Super DSC Mobile); título grande em azul; e as três
seções na ordem acima. Para "Como aplicar em tela?" a vertical sugere imagens
de tela com a etapa já pronta pelo plugin. Para "Como fazer no plugin?", imagens
mostrando o plugin rodando.

---

## Anexo B — Mapa dos prints

Os arquivos se chamam "Screenshot 2026-09-30 HHMMSS.png". A ordem
cronológica é a ordem da jornada. Abaixo, o número identifica o horário do
arquivo (HHMMSS) e o que ele mostra.

### Início e preparação
- **093507** — Boas-vindas e escolha entre Super DSC Mobile e Web.
- **093600** — Janela "Sobre o hac" (versão, plataforma, manutenção).
- **093632** — Janela "Traga as telas para o handoff" (passo a passo de copiar
  e colar).
- **093913** — Página do handoff destacada no painel de páginas do Figma, e o
  estado vazio "Nenhuma tela selecionada".
- **094035** — Janela "Selecionar Tela" com o rótulo e o frame no canvas.
- **094109** — Lista "Telas documentadas": tela 1 com as três pendências e o
  contador 0/3.

### Módulo 1 — Ordem de Tabulação
Plugin rodando:
- **094135** — Aba Tabulação vazia, com "Ver instruções" e "Criar ordem de
  tabulação".
- **094152** — Janela de instruções da Ordem de Tabulação.
- **094255** — Barra flutuante com "0 itens marcados" e a dica do Shift.
- **094350** — "16 itens marcados", com as molduras dos elementos no canvas.
- **094428** — Lista de revisão com os itens numerados e "Criar ordem de
  tabulação".
- **094449** — Janela "Processando" ("Desenhando 3 de 16...").
- **094559** — Aba com a lista numerada, "Adicionar itens" e o botão de apagar
  tudo.
- **094733** — Fim da lista, com **Simular leitura**, idioma, velocidade,
  Atualizar e **Preencher Tabulação**.

Tela com a etapa pronta:
- **094913** — Canvas com os selos numerados sobre a réplica (visíveis nas
  linhas de itens 10 a 16).
- **095714** — Documento final, com a seção Ordem de Tabulação.

### Módulo 2 — Ordem de Leitura Mobile (Swipe)
Plugin rodando:
- **094757** — Janela de instruções da Ordem de Leitura Mobile (Swipe).
- **094823** — Barra flutuante "1 ponto marcado".
- **094913** — Barra flutuante "16 pontos marcados", com as molduras no canvas.
- **094934** — Lista "Trilha de Ordem de Leitura" para revisar e "Criar trilha
  de ordem de leitura".

Tela com a etapa pronta:
- **094949** — Trilha azul com setas em zigue-zague sobre a réplica, ao lado da
  aba Swipe com os 16 pontos e a mensagem "Trilha de swipe criada."

### Módulo 3 — Especificações para Leitores de Tela
Plugin rodando:
- **095034** — Janela de instruções das Especificações para Leitor de Tela.
- **095143** — Janela "Nova especificação" com "Value Section" selecionado e
  Elementos e Imagens marcado como **SUGERIDO**.
- **095200** — Formulário de Elementos e Imagens.
- **095315** — Formulário de Elemento Decorativo.
- **095524** — Janela "Nova especificação" com "Title" selecionado e "Sem
  categoria sugerida".

Tela com a etapa pronta:
- **095224** — Primeira spec criada: cartão ao lado da réplica, marcador
  amarelo, e a mensagem "Especificação criada e posicionada, travada por
  padrão."
- **095334** — Duas categorias criadas (Elementos e Imagens e Elemento
  Decorativo), com os cartões no canvas.
- **095538** — As três categorias criadas (Elementos e Imagens, Títulos e
  Elemento Decorativo).

### Fechamento
- **095623** — Aba Resumo antes de gerar ("Ainda não inserida no handoff").
- **095638** — Janela "Processando": "Consolidando Tabulação no Handoff de
  Acessibilidade...".
- **095714** — Resumo com as três etapas concluídas e o documento gerado no
  canvas, com o rótulo "rascunho".
- **095732** — Lista de telas com as contagens e o painel "Handoff de
  Acessibilidade completo" com o botão Finalizar.
- **095815** — Janela "Finalizar Handoff de Acessibilidade".
- **095837** — Mensagem "Handoff finalizado: v1.0." e o rótulo do documento
  mudando para v1.0.
