# hac — regras de trabalho

Contexto de projeto para o assistente. Leia este arquivo antes de qualquer
tarefa — inclusive antes de desenhar uma tarefa para um subagente.

---

## Princípio central — a lib é a referência, nunca o código

**A estrutura real da lib Figma ("Design Acessível | Super App" e as libs
DSC de produção) é a fonte de verdade. O código do hac deve refletir a
lib, nunca o contrário.** Isso vale para nomes de campo, quantidade/tipo de
toggles, variantes disponíveis, textos placeholder — qualquer coisa que a
lib defina estruturalmente.

**Por quê**: em 2026-09-17, a property "Variante" do componente
`[a11y mob] Box specs leitor de tela" mudou de entendimento 3 vezes na
mesma sessão (existe? não existe? vai deixar de existir?) — cada vez
exigindo uma nova rodada de investigação via REST API, porque o formulário
tinha campos hardcoded em `accessibility.js`/`modals.html` que não liam a
estrutura real da lib dinamicamente. O mesmo padrão já causou retrabalho
em: migração de keys mobile pro arquivo novo (as keys antigas nunca
"sentiram" que o arquivo de origem mudou), o workaround `letter: 'H'` fixo
pra "titulo" (peculiaridade da lib publicada que o código não lê
dinamicamente), e um JSON de properties órfão sendo consumido em produção
enquanto o pipeline real gerava dado atualizado em outro arquivo.

**Direção de longo prazo (em planejamento, ver memória do projeto)**: o
sistema de propriedades/toggles por categoria de a11y deveria ser dirigido
pelo dado real do scan da lib (`fetch-component-properties.cjs` →
`design-acessivel-properties.json`/`design-acessivel-mobile-properties.json`),
não por listas fixas escritas em `accessibility.js`/`modals.html` — com
algum gate de revisão (humana ou automatizada) entre "a lib mudou" e "a UI
mudou automaticamente", para não introduzir fragilidade silenciosa.
Enquanto essa arquitetura não está pronta: **toda vez que uma dúvida surgir
sobre "isso existe/tem essa propriedade na lib?", a resposta correta é
consultar a REST API/scan real primeiro — nunca assumir a partir do que já
está no código**, e a leitura estática do código nunca deve ser tratada
como prova de nada sobre "o que a lib tem hoje".

---

## Regra 0 — consultar antes de propor/construir

**Antes de instruir um agente (ou você mesmo) a "investigar", "mapear" ou
"construir" qualquer coisa relacionada a dados/scripts do plugin, primeiro
verificar se já existe:**

1. `src/plugin/refs/README.md` — documenta o pipeline de dados real (o que
   cada script gera, de onde vem, se está desatualizado).
2. `src/plugin/refs/*.cjs` — os scripts de scan/fetch já existentes (ver
   lista abaixo). Muitos cobrem mais casos do que parece à primeira vista
   (paginação, checkpoint, retry, descoberta de nós ocultos).
3. `src/plugin/refs/_manifest.json` — fonte de verdade das libs DSC
   cadastradas.
4. A memória de projeto do usuário (arquivos `hac_*.md` em
   `C:\Users\augus\.claude\projects\...\memory\`) — decisões e investigações
   anteriores já registradas ali não devem ser refeitas do zero.

**Por quê**: em 2026-09-16, uma instrução mal desenhada mandou um agente
"construir um script de scan estrutural da lib Design Acessível do zero" —
esse script já existia (`fetch-component-properties.cjs`, maduro, com
paginação/checkpoint/descoberta de nós ocultos), e o README de `refs/` já
documentava exatamente a lacuna real (um JSON de saída órfão, gerado por um
script que não foi portado ao repo, ainda referenciado em `code.js` em vez
do JSON atualizado do pipeline vigente). O trabalho de investigação virou,
na prática, "redescobrir o que já estava escrito" — desperdício de tempo e
tokens que uma leitura de 5 minutos teria evitado.

**Scripts de `refs/` já existentes (não reconstruir sem necessidade real):**

| Script | Cobre |
|---|---|
| `fetch-design-refs.cjs` | Metadados (keys/nomes/estilos) das libs DSC de produção cadastradas em `_manifest.json` |
| `build-skeleton.cjs` | Agrega `{slug}.json` em `_skeleton.json`, embarcado no `ui.html` |
| `fetch-component-properties.cjs` | Extração PROFUNDA de component property definitions (BOOLEAN/TEXT/VARIANT/INSTANCE_SWAP) para QUALQUER lib cadastrada, incluindo as 2 de a11y (`design-acessivel`, `design-acessivel-mobile`) — paginação, checkpoint, retry, descoberta de component sets ocultos via `--deep-scan` |
| `build-dsc-a11y-mapping.cjs` | Mapa `containingFrame → {shortName, confidence}` por lib, usado em runtime pela Detecção Automática |
| `build-a11y-constants.cjs` | Deriva `A11Y_COMPONENT_PROPERTIES_GENERATED`/`A11Y_MOBILE_LINK_COMPONENT_OPTIONS_GENERATED` a partir dos JSONs de properties |
| `build-ficha-instruction-constants.cjs` | Deriva `FICHA_INSTRUCTION_CONTENT_UI` a partir de `ficha-instruction-content.json` |
| `fetch-instruction-frames.cjs` | Captura via REST API (`/v1/images/:file_key`) a imagem renderizada de frames de instrução didática da lib "Design Acessível" |

Antes de propor um script novo: confirmar que nenhum destes já resolve o
problema (mesmo que precise só ser reexecutado com dado atualizado, ou
estendido, não recriado).

---

## Regra 0b — grafo de conhecimento do contrato de mensagens

**Antes de mexer em qualquer `postMessage`/`figma.ui.onmessage` (adicionar,
remover ou renomear um campo de payload; adicionar um `msg.type` novo; ou
investigar um sintoma de "campo undefined no frontend"/"resposta não
chegou"), consultar primeiro:**

1. `docs/knowledge-graph.json` — grafo de conhecimento próprio do hac
   (construído lendo o código real, NÃO o plugin de terceiros Understand
   Anything instalado em `.ua/`, que é genérico e não captura nenhuma
   aresta de `postMessage`). Cobre os ~93 tipos de mensagem trocados entre
   backend (`code.js`/`backend/*.js`) e frontend (`modules/*.js`), com
   `payloadFields`, `senders` (todos os pontos de disparo — inclusive
   quando há mais de um, sinal de possível ponta solta), `consumers`, e
   arestas `propagatesField` para os campos que aparecem em mais de um
   lugar (`workAnchor`, `savedAnchor`, `nodeMap`, `a11yDscComponentName`,
   `areaId`, `generation`).
2. `docs/knowledge-graph-guide.md` — receitas de consulta ("vou mudar o
   campo X da mensagem Y, o que mais preciso tocar?") e o estado resumido
   (mensagens mortas conhecidas como `clear-highlight`, assimetrias
   documentadas entre os 3 fluxos paralelos de clone — Tabulação/Swipe/
   Leitor de Tela — em `pattern:3-parallel-clone-flows`).

**Por quê**: o padrão de bug mais recorrente e caro em investigações
recentes foi mudança de contrato de mensagem propagada em ALGUNS pontos e
esquecida em outros (`anchorRefNodeId`/`savedAnchor` em alguns pontos de
criação de clone mas não em outros; um campo devolvido só por 1 dos 3
handlers de criação de clone e esquecido nos outros 2). A ponte
`postMessage` é invisível para análise estática genérica de imports/calls
(passagem de mensagem por string de `type`, sem tipagem) — é exatamente a
amarra que este grafo existe para tornar explícita antes de qualquer
mudança.

O grafo é um ponto de partida, não a fonte de verdade absoluta — ele fica
desatualizado se o código mudar e ninguém regenerar; sempre confirmar com
grep real (`grep -rn "nomeDoCampo" src/plugin/`) antes de declarar uma
mudança de contrato pronta, e sinalizar para `qa-plugin` qualquer mudança
de contrato de mensagem ou schema mapeada.

---

## Regra de ouro — nunca inventar/desenhar o que a lib já fornece

Sempre que um elemento visual precisar refletir algo que existe na lib
Figma "Design Acessível" (badges de categoria, ícones, marcadores,
conectores), **usar o componente real da lib** via
`figma.importComponentByKeyAsync` (mesmo padrão de `_tryImportA11yAgrupamento`,
`code.js`) — nunca desenhar do zero com formas primitivas
(`createEllipse`/`createVector`) nem usar um ícone genérico de terceiros
(ex: Lucide via `createNodeFromSvg`) como substituto.

**Por quê**: em 2026-09-16, ao pedir um "ícone ao lado do título" numa
legenda da Ficha, a primeira tentativa desenhou um ícone Lucide genérico
(`book-open-check`) via `createNodeFromSvg` — nunca usado antes no projeto.
O usuário corrigiu: "o componente tem os mesmos ícones... não precisa
inventar o código, o componente da lib tem esses ícones." A resposta certa
era reaproveitar `_tryImportA11yAgrupamento`, já usado nos badges de
categoria (A/H/Ø) espalhados pelo resto do plugin — o mesmo mecanismo,
aplicado num lugar novo, com fallback gracioso (`figma.createEllipse`
sólido) só se o import falhar.

**Como aplicar**: antes de desenhar qualquer elemento visual novo no canvas
(backend, `code.js`/`onmessage.js`), perguntar "isso já existe como
componente publicado na lib? Existe uma função no código que já importa
algo parecido?" — a resposta quase sempre é sim.

---

## FIGMA_TOKEN

Vive em `.env` na raiz do repositório (`FIGMA_TOKEN=...`). Scripts de
`refs/` já leem via `process.env.FIGMA_TOKEN` — rodar prefixando
`FIGMA_TOKEN=$(grep FIGMA_TOKEN .env | cut -d= -f2) node src/plugin/refs/...`
ou equivalente, nunca pedir o token ao usuário nem inventar um valor.

**Se um agente rodar isolado (worktree)**: o `.env` pode não estar presente
nesse ambiente. Isso é bloqueio real — reportar e parar, nunca inventar
um token fictício, nunca pular a etapa silenciosamente fingindo sucesso.

**Princípio geral**: FIGMA_TOKEN é só de manutenção/CI. Nenhuma feature do
plugin em uso normal pelo designer deve depender dele — se depender,
precisa de fallback gracioso (dado estático já commitado) que nunca trava
o plugin.

---

## Versionamento a cada commit

Toda entrega commitada no hac (fix, feature, refactor — qualquer mudança em
`src/plugin/`) precisa bumpar a versão em `package.json` (e por consequência
`code.bundle.js`, gravada pelo bundler) **no mesmo commit**. Não commitar
código novo sem também rodar `npm run version:patch` (ou editar
`package.json` manualmente para minor/major quando fizer sentido) antes do
`bundle:code`.

**Por quê**: de `e16a67c` (commit inicial) até `412588d`, dezenas de commits
reais (fixes, features, refactors) passaram sem nenhum bump — a versão ficou
travada em `0.1.0-beta.1` o tempo todo. Sem o número mudando, não dá para
saber, olhando o plugin exportado, qual entrega ele reflete — nem distinguir
"testei isso" de "testei a versão de ontem".

**Como aplicar**:
1. Antes de commitar: `npm run version:patch` (ou editar `package.json` para
   minor/major).
2. `npm run bundle:code` (grava a versão nova no `code.bundle.js`).
3. `npm run export:plugin`.
4. Commitar tudo junto — código + `package.json` + bundles.

Pré-release (`-beta.N`) não usa `npm version patch` direto — esse comando
promove a pre-release pra release estável (`0.1.0-beta.1` → `0.1.0`), o que
normalmente não é a intenção. Para incrementar o sufixo beta, editar
`package.json` manualmente (`0.1.0-beta.1` → `0.1.0-beta.2`).

---

## Componentes internos da lib aguardando publicação (não implementar ainda)

Investigação via Figma Dev Mode MCP (Gemini, 2026-09-17, duas rodadas — a
segunda com árvore de camadas completa via `get_design_context`, não só
metadados) na lib "Design Acessível | Super App" (`HhriLSpKnCB2dHhyiU16iB`).
Nenhum dos 3 achados tem key publicada hoje (component sets internos/
ocultos, prefixo `.`) — **nenhum pode ser consumido via
`figma.importComponentByKeyAsync` ainda**. Documentado aqui para não
reinvestigar do zero quando a publicação acontecer.

**Foco atual do produto: mobile.** Web fica registrado para depois.

**Arquitetura confirmada do arquivo**: páginas separadas por plataforma —
`⚙️ | Componentes Specs base Mobile`, `⚙️ | Componentes Specs base Web`,
`📱 | Template de Handoff Mobile`, `🖥️ | Template de Handoff Web`. Não é
uma transição de nomenclatura (`mob base` → `web base` não são a mesma
coisa renomeada) — é uma estrutura paralela e deliberada, uma fundação
técnica própria por plataforma.

| Componente | Node ID | Plataforma | O que é | Bloqueio |
|---|---|---|---|---|
| `.[hac mob base] Legenda` | `1:465` | Mobile | Legenda/glossário horizontal — cada bloco (`Role and value`/`Structure`/`Decorative`) já usa uma **INSTANCE real de `[hac] Conectores`** (não desenho próprio) ao lado do texto explicativo ("Elementos e imagens", "Títulos", "Elementos decorativos"); mais uma variação `ordem de tabulação e tabulação web/DS` com instância de `[Acessibilidade] [Accessibility] Order`. 4 toggles booleanos (função e valor / elementos estruturais / decorativo / ordem de foco) ligam/desligam cada bloco individualmente | Sem key publicada — precisa virar component set público |
| `.[hac mob base] Cabeçalho Template` | `7100:1424` | Mobile | Cabeçalho de documento (1846×196px): barra colorida no topo + título do documento + pílula de status com ícone. 4 variantes de `Status`: Finalizado (verde, check_box), Em construção (amarelo, ferramenta), Pausado (vermelho, bloqueio), Personalizado (cinza, texto livre "Escreva aqui") | Mesmo bloqueio — sem key publicada |
| Família `.[hac web base]` (Elementos e imagens, Títulos, Idiomas, Marco de navegação, Título da Página, **Estrutura da Página**, Elementos decorativos) | página `⚙️ \| Componentes Specs base Web` (`10150:16869`) | Web | Subcomponentes "base" privados que montam os componentes públicos `[hac] Agrupamento`/`[hac] Conectores` para web — nós `10766:210`+ (Agrupamento) e `10768:280`+ (Conectores) já **visualmente completos e prontos** (bordas, instâncias, paddings, todas as orientações) | Lib só precisa ser **republicada** ("Publish library") — não é trabalho de design pendente, é uma ação de publicação |

**Achado que pode mudar a estratégia de implementação**: a Legenda e o
Cabeçalho Template parecem peças de um **Template de Handoff maior**
(`📱 | Template de Handoff Mobile`), não componentes isolados soltos —
ao desbloquear, avaliar se o caminho certo é importar o Template inteiro
(se ele também vier a ter key própria) em vez de só os 2 componentes
separados.

**Quando desbloquear**: assim que a equipe de design expuser/republicar
esses componentes, rodar `fetch-component-properties.cjs --lib
design-acessivel-mobile --deep-scan --reset` (mobile) ou o equivalente
`design-acessivel` (web) para confirmar a key nova, e então implementar —
reaproveitando o mesmo padrão de `_tryImportA11yAgrupamento`/
`_tryImportA11yConectorLinha` (nunca desenhar do zero, ver regra de ouro
acima).

**Relatórios fonte**: `hac_internal_components_report.json` (Gemini, scan
inicial) e a investigação detalhada com árvore de camadas completa (Gemini,
2026-09-17, segunda rodada via `get_design_context`) — ambos disponíveis
se precisar revisitar antes de implementar.

---

## Antes de instruir um agente

- Ler o código real (`Grep`/`Read`) do que a tarefa vai tocar ANTES de
  escrever a instrução — não descrever "o estado provável do código" de
  memória. Uma instrução baseada em suposição desatualizada gera trabalho
  duplicado ou, pior, uma correção aplicada no lugar errado.
- Se o usuário corrigir o escopo no meio de uma investigação em andamento
  (ex: "não é isso", "utilize o do componente"), repassar a correção ao
  MESMO agente (via `SendMessage`) sempre que possível, em vez de deixá-lo
  terminar um caminho já sabido como errado — evita gastar o restante do
  orçamento daquela chamada em uma direção descartada.
- Ao final de uma investigação/implementação de agente, conferir o estado
  real do arquivo (`Grep`/`Read`) antes de repassar o resultado ao usuário
  como concluído — principalmente quando mais de um agente mexeu no mesmo
  arquivo em paralelo.

---

## Regra de ouro 2 — nunca retroceder o que já funciona

**Qualquer correção, feature ou refactor tem que preservar o comportamento
já comprovado que funciona — mesmo quando esse comportamento não é o foco
direto da tarefa.** "Já funciona" inclui: dado já coletado (scans/refs com
`deepScan: true` ou paginação completa), fluxo já corrigido em sessão
anterior, e escopo que o usuário já delimitou explicitamente.

**Por quê (2026-09-21/22, três incidentes na mesma sessão, mesma causa
raiz — pressa em "resolver rápido" sem checar o estado anterior antes de
escrever por cima dele):**

1. Uma implementação de posicionamento manual de card mexeu em Tabulação e
   Swipe (`tab-order.js`/`swipe-path.js`) quando o pedido era exclusivamente
   sobre o card de Especificações — usuário: **"Você mexeu num ponto que não
   tem necessidade! Eu queria conseguir mexer, exclusivamente, na criação do
   card da spec. NADA ALÉM!"**. Correção exigiu reverter os dois arquivos ao
   HEAD e reaplicar cirurgicamente só o que fora pedido.
2. Um novo scan de propriedades da lib "Design Acessível" (desktop) rodou
   sem `--deep-scan` e sobrescreveu `design-acessivel-properties.json` —
   `deepScan` foi de `true` para `false` e 19 dos 22 blocos de
   `screenReaderVariants` (dado já obtido, custoso de reobter) desapareceram
   silenciosamente. Só foi achado numa revisão posterior comparando o
   arquivo contra `git diff HEAD`, não durante a própria tarefa.
3. Uma feature de posicionamento manual foi implementada 2 vezes na direção
   ERRADA antes de acertar (toggle escondido no formulário → rejeitado:
   *"em momento algum eu pedi um toggle"*; depois modal obrigatória
   perguntando a cada spec → também rejeitada: *"Podemos acabar com a
   modal... deixar para que ele crie sempre usando o elemento selecionado
   como referência"*) — cada rodada implementou algo plausível, mas nenhuma
   confirmou com o usuário ANTES de construir uma peça de UX nova e visível.

**Como aplicar:**
- Antes de editar um arquivo que uma sessão anterior já corrigiu/ajustou
  por um motivo específico, ler o comentário/commit que explica por quê —
  nunca presumir que "está assim porque ninguém mexeu ainda".
- Ao rodar qualquer script de `refs/` que já tenha rodado antes com uma
  flag (`--deep-scan`, `--reset`, etc.), usar a MESMA flag — checar o
  `_meta` do JSON existente (`deepScan`, `discoverySignature`) antes de
  regerar, não só a existência do arquivo.
- Depois de qualquer scan/regeneração de dado em `refs/`, rodar
  `git diff --stat` sobre os arquivos tocados e olhar se algum encolheu
  (menos bytes, menos ocorrências de uma chave conhecida) antes de seguir —
  crescimento é esperado (a lib publica mais componentes com o tempo),
  encolhimento inesperado é bandeira vermelha de regressão.
- Uma feature nova de UX (modal, toggle, gate, mudança de fluxo) que o
  usuário não descreveu literalmente é uma HIPÓTESE, não um pedido — nomear
  a hipótese e confirmar antes de construir vale mais barato que construir,
  levar rejeição, reverter e reconstruir (aconteceu 2x seguidas no mesmo
  dia por pular esse passo).

---

## Regra de ouro 3 — uma causa raiz plausível não é a causa raiz confirmada

**Corrigir a primeira explicação que "faz sentido" e parar de investigar é
a forma mais comum de reabrir o mesmo bug depois, com um print novo.** Um
bug reportado com sintoma visível pode ter mais de uma causa raiz
simultânea — corrigir uma sem procurar a outra deixa o sintoma
parcialmente resolvido, o que costuma ser confundido com "resolvido".

**Por quê (2026-09-22)**: o bug "documentei Value Section, o plugin
registrou Button" teve DUAS causas raiz independentes, descobertas em duas
rodadas separadas porque a primeira investigação parou assim que achou uma
explicação plausível e corrigível:
- **1ª causa (real, mas parcial)**: o matching de seleção podia resolver
  contra um elemento FILHO durante drill-in/foco concorrente, em vez do
  elemento selecionado — corrigido, e o teste seguinte (feedback visual "X
  selecionado" aparecendo certo) pareceu confirmar que o bug tinha
  acabado.
- **2ª causa (a que efetivamente causava o sintoma do print)**: o wrapper
  mobile do card final tinha uma property `"Componente"` (VARIANT) com
  default publicado pela lib = `"Button"`, e o código nunca a preenchia com
  o valor real — então TODA spec mobile "Elementos e Imagens" nascia
  "Button" independente de qualquer matching de seleção estar certo ou
  errado. Só apareceu porque o usuário testou de novo com um print novo.

Um fix seguinte (fonte do nome do componente pro card) também corrigiu só
metade do caminho de dados na primeira tentativa: usava `linkNome` (o
dropdown manual "Link do Componente") como única fonte — mas no cenário
exato do bug relatado esse dropdown estava vazio/"Personalizado", então o
fix não disparava. Só na revisão seguinte entrou `a11yDscComponentName` (o
componente REALMENTE detectado no canvas) como fonte primária, com o
dropdown como fallback.

**Como aplicar:**
- Depois de confirmar UMA causa raiz via evidência real (API, print, dado),
  perguntar explicitamente "isso explica 100% do sintoma reportado, ou só
  parte dele?" antes de declarar o bug corrigido — não confundir "achei algo
  errado e consertei" com "achei O que causava exatamente este sintoma".
- Quando um fix depende de um campo/dado que pode legitimamente estar
  vazio no caminho normal de uso (ex: um dropdown que o designer pode não
  preencher), preferir a fonte mais automática/confiável como primária e o
  campo manual como fallback — nunca o contrário, especialmente quando o
  print que originou o bug já mostra esse campo vazio.
- Reproduzir mentalmente o cenário EXATO do print/relato (não uma versão
  genérica dele) contra o fix proposto antes de declará-lo pronto — no caso
  acima, isso teria pego o dropdown vazio antes do usuário precisar
  reportar de novo.

**Corolário — posição errada no canvas costuma ser SINTOMA de parentesco
errado na árvore (2026-09-23, o caso mais caro deste padrão até hoje):** o
sintoma "o card de spec nasce longe da réplica" foi tratado como problema
de aritmética de posição em QUATRO rodadas seguidas (reancoragem
horizontal, alinhamento de topo entre categorias, filtro por área no
`_letterMap`, filtro por área na anti-colisão). Cada rodada tinha
explicação plausível, corrigia um branch real do cálculo — e o usuário
voltava com print novo. A causa raiz era estrutural: o `specGroup` estava
caindo num fallback "solto na Section" em vez de entrar no grupo-overlay do
clone da tela, e uma spec fora do overlay não tem referência de posição que
faça sentido. **Só ficou visível quando o usuário mandou o painel de
CAMADAS em vez do canvas.**

Como aplicar:
- Diante de qualquer artefato mal posicionado no canvas, conferir PRIMEIRO
  onde ele está na árvore (`node.parent`, painel de camadas) antes de olhar
  o cálculo de X/Y. Se o pai está errado, a posição errada é consequência —
  corrigir a aritmética só vai mascarar.
- Quando 2 rodadas de correção no mesmo sintoma não resolvem, parar de
  refinar a hipótese atual e trocar a CLASSE de hipótese (de "cálculo" para
  "estrutura", de "dado" para "ciclo de vida"). Insistir na mesma classe é o
  que produziu as 4 rodadas acima.
- Pedir ao usuário o print do painel de camadas, não só do canvas, sempre
  que o sintoma envolver posição/visibilidade de artefato — foi o dado que
  encerrou a investigação, e poderia ter sido pedido na 1ª rodada.
- Fallback silencioso é o que permite esse tipo de bug sobreviver: se um
  caminho de exceção coloca o artefato num lugar diferente do projetado,
  ele precisa AVISAR o designer (`figma.notify`), nunca só
  `console.error` — ver a invariante correspondente em `docs/tecnico.html`,
  seção 8a.
