---
layout: page
title: Documentação Técnica
nav_order: 2
permalink: /tecnico.html
---

# Estado da arquitetura — hac

Documento vivo — **fonte primária de verdade** a partir de 02/09/2026.
Reflete o estado do código na branch de desenvolvimento na mesma data. Para
o histórico de como se chegou a este estado (bugs corrigidos, decisões
revertidas, evolução de arquitetura), ver o [Changelog](changelog.html).
O arquivo `docs/architecture-state.md`, no repositório, é mantido como
espelho/ponto de partida histórico — não é mais o destino principal de
atualização (ver nota no topo daquele arquivo).

## Sumário

1. [Schema de dados (`hacData`)](#1-schema-de-dados-hacdata)
2. [As 5 categorias de spec](#2-as-5-categorias-de-spec)
3. [Origem do projeto (web/mobile)](#3-origem-do-projeto-webmobile--histórico-de-3-decisões-no-mesmo-dia)
4. [`needsReview`](#4-needsreview)
5. [Elementos e Imagens mobile — 3 sub-variantes](#5-elementos-e-imagens-mobile--3-sub-variantes)
6. [Matching DSC → categoria de acessibilidade](#6-matching-dsc--categoria-de-acessibilidade)
7. [Fluxos de criação de spec](#7-fluxos-de-criação-de-spec)
8. [Ordem de Tabulação](#8-ordem-de-tabulação)
9. [Contrato de mensagens (UI ↔ backend)](#9-contrato-de-mensagens-ui--backend)
10. [Escala da UI e `position` dos modais](#10-escala-da-ui---ui-scale-e-position-dos-modais)
11. [Pendências conhecidas](#11-pendências-conhecidas)
12. [Sobre este site](#12-sobre-este-site)

> Para o histórico cronológico de decisões e bugs corrigidos, ver o
> [Changelog](changelog.html).

---

## 1. Schema de dados (`hacData`)

O hac não tem conceito de "frame"/múltiplas telas (diferente do Handex).
Existe **um único array de verdade por tipo**, sem duplicação
avulso+por-frame — essa duplicação foi a causa raiz de um bug conhecido do
Handex (specs "sumindo" por haver duas fontes de verdade divergentes); o
hac nasce sem esse padrão por decisão deliberada.

```js
hacData = {
  _schemaVersion: 1,
  a11yAreas: [],        // Áreas Marcadas — agrupamento principal (accordion)
  a11ySpecs: [],         // Especificações de acessibilidade (5 categorias)
  tabOrderItems: [],     // Ordem de Tabulação (por área, arquitetura de cópia de frame)
  currentUser: null,     // Usuário Figma identificado automaticamente (sem login)
  projectOrigin: null,   // 'web' | 'mobile' | null — ver seção 3
}
```

Definido em `src/plugin/modules/core.js`, espelhado em variáveis globais
soltas (`a11yAreas`, `a11ySpecs`, `tabOrderItems`) que são a fonte de
verdade real durante a sessão — `hacData` é remontado a partir delas só na
hora de persistir (`saveToStorage()`).

`_schemaVersion` continua fixo em `1` desde a origem do plugin — todas as
mudanças de schema tratadas até aqui (variantes mobile, `projectOrigin`)
foram tratadas como **aditivas**, migração por ausência de campo, não por
número de versão.

### `a11yAreas[]`
Selo numerado de seção/tela marcado no canvas. Campos: `id`, `number`,
`label`, `targetNodeId`. Não tem campo `origin` próprio — a origem
web/mobile deixou de ser calculada por área (ver seção 3).

### `a11ySpecs[]`
Cada spec pertence a uma categoria (`a11yType`: `elemento` | `estrutura` |
`titulo` | `decorativo` | `informacoes`) e a uma Área Marcada
(`a11yAreaId`). Campos principais: `id` (nodeId real do specGroup no
canvas), `targetNodeId`, `letter`, `color`/`fillColor`, `properties[]`
(`{key,label,value}`), `a11ySubtype` (chave crua da subvariante, usada
pelo backend pra ajustar a instância aninhada do componente real
importado), `a11yOrigin` (`'web'` | `'mobile'`, gravado no momento da
criação — nunca recalculado depois), `a11ySourceLib`,
`a11yDscComponentName` (nome real do component set DSC, quando resolvido),
`needsReview` (boolean — seção 4), `locked` (specs de a11y nascem sempre
travadas), `visible`.

### `tabOrderItems[]`
Populado pela arquitetura de cópia de frame (`_createTabOrderCloneForArea`
em `code.js`) — nunca desenha sobre o design original. A cópia vive dentro
de uma Section dedicada no canvas, separada da Section de specs — ver
seção 8.

### `projectOrigin`
Ver seção 3 — origem web/mobile do arquivo inteiro, não por área.

### Persistência
`saveToStorage()` remonta `hacData` a partir das variáveis globais e envia
`save-storage` pro backend. Isolamento por arquivo real do Figma: chave
`hacData:${figma.fileKey}`.

Arquivos ainda não salvos não têm `figma.fileKey`. Uma chave de fallback
fixa (`hacData:unsaved`) existiu até 02/09/2026, mas causava vazamento real
de dados entre projetos/clientes diferentes: como `clientStorage` é
escopado por instalação do plugin (não por arquivo/aba), todo arquivo
não-salvo lia e escrevia na MESMA chave. `_getHacDataStorageKey()` agora
retorna `null` nesse cenário: o arquivo não-salvo sempre abre com `hacData`
zerado e nada é gravado até o arquivo ganhar um `fileKey` real (primeiro
save). Consequência aceita: fechar o plugin no meio do trabalho num arquivo
nunca salvo perde o progresso da sessão — preferível a corromper
silenciosamente dados de outro projeto.

`clear-cache` reseta `a11yAreas`/`a11ySpecs`/`tabOrderItems` **e também
`projectOrigin`** — decisão deliberada: "Limpar Cache" deve simular um
arquivo novo por completo, incluindo perguntar a plataforma de novo.
`currentUser` é preservado (identidade/configuração de ambiente, não
conteúdo do projeto).

## 2. As 5 categorias de spec

| Categoria (`a11yType`) | Label | Tag manual? | Equivalente mobile real? |
|---|---|---|---|
| `elemento` | Elementos e Imagens | Sim | Sim — 3 sub-variantes (seção 5) |
| `estrutura` | Estrutura da Página | Sim | **Não** — sem landmark semântico na lib mobile |
| `titulo` | Nível de Título | Não (usa nível como tag) | Sim — marcador único "H", sem hierarquia |
| `decorativo` | Elemento Decorativo | Não (badge fixo) | Sim |
| `informacoes` | Informações Adicionais | Sim | **Não** — formato livre, web-only |

Regra geral: **a origem (web/mobile) filtra tudo** — não só o marcador
visual e o card de spec, mas também qual catálogo de componentes é
sugerido/consultado, manual ou automático. Ver seção 6.

### Diferenças reais web vs. mobile por categoria

- **Nível de Título**: web usa H1-H6 (hierarquia real); mobile usa um
  identificador único "H", sem distinção de nível, porque React Native não
  tem o conceito de hierarquia de heading do HTML.
- **Estrutura da Página**: sem equivalente mobile publicado — a lib
  "Design Acessível | Super App" não modela landmarks semânticos. Specs
  dessa categoria em projeto mobile continuam usando o wrapper desktop
  (comportamento aceito, não é bug).
- **Elementos e Imagens**: mobile tem 3 sub-variantes (Componente, Link,
  Texto Alternativo) com campos próprios — seção 5. Web usa o catálogo de
  16 componentes curados da lib "Design Acessível" desktop.
- **Elemento Decorativo**: card real importado nas duas origens; conteúdo
  textual (Descrição/Notas de Código) é fixo/hardcoded na lib publicada em
  ambas — limitação real do componente Figma, não do plugin.
- **Informações Adicionais**: formato livre, sem diferenciação documentada
  mobile/web.

### Campos padrão e limites de caracteres

Todo campo de texto livre do formulário tem `maxlength` + contador visível.

| Campo | Limite | Observação |
|---|---|---|
| TAG (`elemento`/`estrutura`/`informacoes`) | 8 | Regex `^[A-Z]\d*(\.\d+)*$` — formato tipo "A1.1" para sequências longas dentro de uma área |
| Label (accessibilityLabel) | 100 | Deve ser específico da função, não do tipo de componente |
| Componente "Outro" (desktop) | 80 | |
| Descrição (Estrutura/Informações, subtipo "Customizável") | 200 | Único ponto com edição livre nessas 2 categorias |
| Label de Área Marcada | 80 | |
| Descrição/Texto alternativo (mobile, "Texto Alternativo") | 180 | Alt-text |
| Link/nome do componente (mobile, "Link do Componente") | 300 | URL de deep-link ou nome digitado manualmente |
| Observações (toggle) | 400 | |
| Notas de Código (toggle) | 500 | |
| Dica para Leitor de Tela / accessibilityHint (mobile) | 300 | |

Campos obrigatórios (validados em `confirmA11ySpec`):
- Elemento web, catálogo normal: Label obrigatório.
- Elemento web, "Outro": Componente documentado + Label obrigatórios.
- Elemento mobile, variante "Componente": Link do Componente obrigatório.
- Elemento mobile, variante "Texto Alternativo": Descrição obrigatória.
- Elemento mobile, qualquer variante: Label sempre obrigatório.
- Demais categorias: sem obrigatoriedade além da Tag (quando aplicável).

## 3. Origem do projeto (web/mobile) — histórico de 3 decisões no mesmo dia

**Fase 1 (anterior): voto de maioria por área.** `area.origin` era
calculado a partir da proporção de componentes web vs. mobile detectados
dentro de cada Área Marcada, recalculado a cada "Reescanear". Frágil:
dependia de haver componentes reais suficientes detectados, e podia mudar
retroativamente entre scans da mesma área.

**Fase 2 (revertida no mesmo dia): perguntar a cada ação.** O voto de
maioria foi removido e substituído por uma modal bloqueante ("Este handoff
usa qual biblioteca?") perguntada toda vez que uma ação precisava saber a
origem: Marcar Área, Detecção Automática, Ordem de Tabulação. Problema
real: quando "Marcar Área" tem auto-detecção ligada, ela dispara a
Detecção Automática em sequência imediata — o designer via a mesma
pergunta aparecer duas vezes seguidas, indistinguível de um bug de loop.

**Fase 3 (estado atual): configuração única por projeto.** A origem é uma
característica do **arquivo inteiro**, nunca mista (confirmado
repetidamente pelo usuário: "se é um projeto mobile, tudo referencia
mobile"). Implementação:

- `getA11yProjectOrigin()` lê `hacData.projectOrigin`.
- `ensureA11yProjectOriginThen(onReady)` é o **ponto único** que toda ação
  que precisa da origem deve chamar: se já definida, chama `onReady(origin)`
  direto, sem abrir modal; se não, abre a modal bloqueante uma única vez,
  persiste a resposta, e só então chama `onReady`.
- As 3 ações que precisavam disso (Marcar Área com auto-detecção, Detecção
  Automática, Ordem de Tabulação manual e automática) foram migradas para
  `ensureA11yProjectOriginThen` — nenhuma pergunta de novo depois da
  primeira vez.
- O fluxo manual de criação de spec ("+ Nova spec") lê
  `getA11yProjectOrigin()` diretamente (sem abrir modal).
- Editável a qualquer momento via modal "Sobre o hac" → botão "Trocar".
- Resetada ao "Limpar Cache" (ver seção 1).

**Exceção deliberada: "Reescanear" dentro do resumo da Detecção
Automática.** `rescanA11yBatchArea()` não chama `ensureA11yProjectOriginThen`
— ela zera `pending.declaredOrigin` e força a modal de origem a reabrir
manualmente, mesmo com `hacData.projectOrigin` já definido. Decisão
explícita: a lib pode ter mudado entre uma varredura e outra, então cada
Reescanear pergunta de novo qual plataforma usar para aquela passada
específica — a resposta não sobrescreve `hacData.projectOrigin` (só o
campo local usado para retropreencher Título/Decorativo daquela
varredura). Não é bug — é a única ação que legitimamente pergunta de novo.

## 4. `needsReview`

Campo boolean em cada spec. Hoje só é setado `true` em um cenário real:
migração retroativa de "Elementos e Imagens" mobile pré-sub-variantes,
quando a heurística de inferência cai no fallback mais arriscado (não
consegue determinar a variante com confiança).

Toda spec criada pelo wizard de revisão individual (Detecção Automática)
nasce sempre com `needsReview: false`, mesmo que a detecção original
tivesse baixa confiança — a revisão humana item a item já substitui
qualquer necessidade de sinalização automática. O conceito de "confiança
alta/baixa" foi removido da UI (badges de confiança no resumo do lote)
pela mesma razão: com revisão individual obrigatória, a distinção virou
ruído sem efeito prático.

## 5. Elementos e Imagens mobile — 3 sub-variantes

Estrutura real do componente Figma `[a11y mob] Box specs leitor de tela`
(variante "Conector = Elementos e imagens"), com property `Variante`
(VARIANT): `componente` | `link` | `texto alternativo`.

- **Componente**: Descrição/Nome acessível/Dica Leitor de Tela/Observação
  (toggles opcionais) + **Link do Componente** (sempre visível). O
  dropdown de 64 nomes reais de componentes DSC vem pré-selecionado
  automaticamente quando o `dscComponentName` resolvido bate por nome
  exato com um dos 46 nomes que têm `nodeId` conhecido (gerando também a
  URL de deep-link); os outros 18 nomes divergem editorialmente entre a
  lib real e a lista curada — ficam manuais ("Personalizado"). Sempre que
  o `<select>` aponta para qualquer opção diferente de "Personalizado", o
  campo de texto vira `readOnly`, com hint visual de cadeado — só fica
  editável quando "Personalizado" está selecionado.
- **Link**: Descrição fixa e travada ("Identificar como link e anunciar
  que o link abre uma nova janela..."), Nome acessível/Observação
  opcionais.
- **Texto Alternativo**: Descrição livre **obrigatória** (alt-text real),
  Observação opcional.

O campo `Nome acessível` foi consolidado: existia como toggle duplicado
dentro de "Campos exclusivos mobile" e também como o campo "Label" do topo
do formulário — ambos alimentavam o mesmo `accessibilityLabel`. O toggle
mobile foi removido; "Label" do topo é a única fonte, e seu valor liga o
toggle BOOLEAN real do componente. **Mesmo padrão aplicado ao desktop/web**:
o checkbox dinâmico "Nome Acessível" (renderizado a partir da property
BOOLEAN real do componente DSC selecionado) duplicava o campo "Label"
sempre visível no topo — foi filtrado fora da lista de toggles renderizados,
e o payload passou a injetar `{ key: 'nomeAcessivel', value: label }`
automaticamente a partir do Label do topo, para todo componente. Isso é
seguro porque o backend já ignora silenciosamente properties dinâmicas sem
`toggleDef` correspondente no componente.

**Bug real corrigido**: o toggle BOOLEAN ligava corretamente, mas o TEXTO
da sub-instância continuava sendo o placeholder publicado da lib, nunca o
valor real digitado — mesmo bug nos outros 3 campos desta variante. Causa
raiz: o preenchimento buscava um TEXT node cujo nome de CAMADA batesse com
um regex — mas a árvore real não tem TEXT nodes com esses nomes: cada
campo é uma INSTANCE aninhada cujos dois TEXT filhos se chamam sempre
"Label"/"Text" (genéricos). O conteúdo real é uma component property de
texto própria de cada sub-instância. Correção: novo helper
`_findNestedInstanceByName` acha a INSTANCE pelo nome dela (não pelo TEXT
filho), e o preenchimento passou a usar `setProperties` na property
`Texto` da sub-instância.

## 6. Matching DSC → categoria de acessibilidade

### As 6 libs conhecidas

**Libs de matching/detecção** (categorizam instâncias reais no canvas —
servem só como referência de nome/origem, nunca são a fonte do componente
importado):
- `web-angular-react` → origin `web`
- `super-dsc-web` → origin `web`
- `super-app` → origin `mobile`
- `dsc-android` → origin `mobile`

**Libs de componentes reais** (fonte de fato dos wrappers/marcadores
importados pro canvas):
- Desktop: "Design Acessível" (fileKey `Wy0IhXRVZMSOOr8E609UqI`)
- Mobile: "Design Acessível | Super App - React Native" (fileKey
  `3zdtN13YvPlCGPdXeL0Y2i`)

### Filtro por origem

O matching de categoria usa dois Maps separados por plataforma
(`_dscFrameToA11yMapWeb`/`_dscFrameToA11yMapMobile`). A resolução de match
já sabe a origem do componente **antes** de consultar o mapa de categoria
— consulta só o mapa da própria plataforma. Um componente que só bate por
nome na lib da plataforma errada corretamente vira `isUnmapped: true` em
vez de herdar uma categoria da lib errada.

### Princípio: componente real sempre, procedural só como último recurso

A importação de componente real lança exceção em qualquer ponto de
incerteza; o chamador trata como "cai no card procedural" só para uma
whitelist fixa de razões esperadas. Qualquer outra falha gera erro visível
ao designer (nunca falha silenciosa).

**Preenchimento fino de campos internos**: implementado para as 3
categorias cobertas pelo wrapper mobile (Elementos e Imagens, Títulos,
Elementos Decorativos). Títulos e Elementos Decorativos só expõem uma
property `Observações` (BOOLEAN) internamente — Descrição e Notas de
Código são conteúdo fixo hardcoded na lib publicada, sem property exposta
(limitação real da lib, confirmada via API).

### "Componente DSC" como link de referência

O campo read-only "Componente DSC" no cabeçalho do modal vira um link
clicável para o componente real na lib do Figma, só quando é possível
montar um deep-link com confiança via um dicionário de 46/64 nomes que
existe **só para a lib mobile** (extraído com `containingFrameNodeId`) —
os JSONs das libs web não têm esse campo. Specs de projeto web nunca
ganham link (cai no texto puro), e mesmo em mobile os nomes sem match
seguro ficam só como texto.

### "Outro" (componente não mapeado)

Quando um componentKey real é encontrado sem categoria de a11y catalogada
(ex: `[dsc] Card`, `[dsc] Tooltip`), a Detecção Automática sugere "Outro
(nome do componente)" — sinaliza que aquele componente precisa ganhar uma
spec formal na lib, mas hoje não existe processo institucional
automatizado que capte esse sinal; é só um rótulo visível na tela de
revisão do designer.

## 7. Fluxos de criação de spec

### Manual ("+ Nova spec")
Seleção de elemento → checagem de vínculo da lib → escolha de categoria →
formulário. `a11yOrigin` vem de `getA11yProjectOrigin()` (configuração já
definida do projeto).

### Detecção Automática (wizard sequencial de revisão)
Todo item detectado — sem exceção de categoria — passa por
configuração/confirmação individual antes de virar spec real:

1. Tela de entrada: escolher a Área de destino, ver contagem agregada.
2. Um snapshot em memória é montado (nunca persistido, nunca escreve na
   fonte bruta de detecções).
3. Cada item abre o formulário normal, com indicador de progresso "Item N
   de M", botões "Focar" (destaca o elemento no canvas) e "Descartar"
   (pula sem criar spec).
   - **Correção de categoria durante a revisão**: um ícone de editar
     permite trocar a categoria sugerida inline, reabrindo o formulário em
     estado default para a nova categoria — sem migração de campos entre
     categorias diferentes. Existe só durante o wizard.
   - **Navegação livre + campo de posição editável**: a revisão não é
     mais estritamente sequencial. Botões Voltar/Avançar navegam sempre
     por posição na fila; um campo numérico central permite pular
     diretamente para qualquer item. Reabrir um item confirmado mantém o
     formulário visível mas o botão "Aplicar" vira "Documentado"
     (desabilitado) — nunca duplica a spec. Reabrir um item descartado
     reabre totalmente editável.
   - **Foco automático no canvas ao trocar de item**: a cada troca de
     item, a viewport centraliza/destaca o elemento correspondente
     automaticamente.
4. `confirmA11ySpec()` no modo wizard força `needsReview: false` e aguarda
   a resposta real do backend antes de avançar.
5. Cancelar a revisão preserva as specs já confirmadas; itens ainda não
   vistos voltam para "Não Documentados".
   - **Distinção Cancelar explícito vs. fechamento acidental**: fechar via
     X/backdrop/Esc oferece retomada (toast com botão "Continuar revisão",
     que dispara um novo scan da área e retoma o wizard); clicar em
     "Cancelar" explicitamente não oferece essa opção.

## 8. Ordem de Tabulação

### Organização em Sections dedicadas
O hac usa **duas Sections distintas** no canvas:

- `"hac — Especificações de Acessibilidade"`: Áreas Marcadas + specGroups
  de todas as categorias.
- `"hac — Ordem de Tabulação"`: só as cópias de frame criadas para revisão
  de tabulação (uma por Área Marcada já trabalhada) e os selos numerados
  dentro delas. Separada da Section de specs porque dezenas de
  selos/conectores de spec se misturariam visualmente, no painel de
  Layers, com cópias inteiras de tela.

### Réplica da área criada e focada antes de marcar
Regra válida para os dois modos (manual e automático): a primeira coisa
que acontece é clonar a Área Marcada para um espaço livre do canvas — sem
sobrepor nada que já esteja na página. Logo após criar a cópia, o backend
seleciona e foca a viewport nela, antes de o modal de revisão abrir — a
área original acumula selos de outras specs e ficava visualmente confusa;
o designer nunca marca em cima dela.

- **Modo manual**: o designer clica fisicamente na CÓPIA (é o que está
  focado na tela). A tradução de id do clone para o id do original
  acontece antes de repassar ao frontend — é assim que a lista pendente
  sempre guarda ids do original.
- **Modo automático**: a varredura por elementos interativos continua
  operando sobre o frame ORIGINAL; o backend devolve o mapa
  original↔clone junto com os itens encontrados.

### Modo manual — sem bloqueio
Uma tentativa de bloquear cliques em elementos "não reconhecidos como
acionáveis" foi implementada e **revertida no mesmo dia**: o reconhecimento
automático falhava em casos reais visíveis (Icon Button de libs não
mapeadas, cards customizados sem match) — travar o designer com base num
reconhecimento incompleto causava mais dano do que benefício. Decisão
final: **qualquer clique no modo de captura entra direto na lista, sem
checagem nem aviso**.

### Modo automático — só sugere itens reconhecidos
A varredura só coleta instâncias cujo componente resolve como interativo
(button, checkbox, radio button, switch, inputs, paginator, stepper, tab
group, accordion, breadcrumb, listas, link). É uma sugestão, não uma
trava — o designer ainda revisa e edita a lista antes de aplicar.

### Fluxo de revisão obrigatório
Nenhum selo é desenhado sobre os elementos reais em nenhum dos dois modos
— clique manual e varredura automática só populam uma lista pendente em
memória, revisável (drag-and-drop para reordenar, exclusão individual) no
modal. Só "Aplicar no Canvas" desenha de fato, sempre sobre a mesma cópia
clonada já criada/focada no início do fluxo.

### Selo de ITEM de tabulação vs. selo de ÁREA — dois componentes diferentes

- `[a11y] Item Number` (desktop) / `[a11y mob] Número da tela` (mobile)
  desenham um `Connector` dentro de cada variante de direção — fazem
  sentido para o selo de **Área Marcada**, que precisa de uma linha visual
  até a borda do frame/seção demarcada.
- `[a11y mob] Ordenação` não desenha conector — os filhos de cada variante
  são só número + um ícone de seta encostando na borda do próprio selo.
  Não tem property de direção porque a posição é resolvida por
  x/y absoluto no código, não por variante do componente. É o componente
  certo para o selo de **item de Ordem de Tabulação**.

Desktop não tem um equivalente "sem conector" — é o único componente
disponível na lib "Design Acessível" para selo numerado, e por isso segue
reaproveitado tanto para Área quanto para item de tabulação nesse caso
(assimetria real entre as duas libs, não um bug do plugin).

## 9. Contrato de mensagens (UI ↔ backend)

Toda comunicação passa por `postMessage`/`window.onmessage` — o frontend
NUNCA chama `figma.*` diretamente; qualquer manipulação de canvas só roda
em `code.js`.

| Mensagem | Direção | Payload relevante |
|---|---|---|
| `init-plugin` | backend → UI | `theme`, `version`, `currentUser`, `savedState`, `onboardingSeen` |
| `save-storage` | UI → backend | `data` (hacData completo) |
| `cache-cleared` | backend → UI | reseta hacData/arrays em memória, incluindo `projectOrigin` |
| `create-unified-spec` | UI → backend | `opts` (`a11yType`, `a11ySubtype`, `a11yOrigin`, `a11ySourceLib`, `a11yDscComponentName`, `a11yAreaId`, `targetNodeId`, `needsReview`, `silent`) |
| `spec-created` | backend → UI | `spec` (objeto já no formato de `a11ySpecs[]`) |
| `scan-frame` | UI → backend | `nodeId`, `origin: 'a11y-detection'` |
| `scan-result` | backend → UI | `data`, `origin` (ecoado) |
| `check-a11y-library` | UI → backend | `token` |
| `create-a11y-area` | UI → backend | `targetNodeId`, `label`, `number`, `conector`, `autoDetect`, `origin` |

## 10. Escala da UI (`--ui-scale`) e `position` dos modais

`body` usa `zoom` (não `transform`) para os 3 níveis de escala do plugin
(`[1, 1.15, 1.3]`) — mantido deliberadamente: `zoom` reflui o layout de
verdade (afeta scroll, `overflow`, medidas reais), enquanto
`transform: scale()` só afeta a pintura, exigindo compensação manual e
frequentemente quebrando scroll do corpo.

**Bug real corrigido**: todo modal do hac usava `fixed inset-0`.
`position: fixed` não cria novo containing block sob `zoom` — o containing
block de um elemento `fixed` continua sendo o viewport real do documento,
independente do `zoom` aplicado a um ancestral, mas o `zoom` do ancestral
ainda é aplicado à pintura final. Resultado: o box do modal nascia do
tamanho do viewport real e depois era escalado de novo, ficando maior que
a área visível em qualquer escala > 100% (cortado, sem scroll).

**Correção**: todos os `fixed inset-0` viraram `absolute inset-0`, e
`body` ganhou `position: relative` — todo elemento que antes escapava do
zoom via `fixed` agora resolve seu posicionamento contra o próprio `body`
zoomado.

**Bug real adicional**: mesmo depois da correção acima, o card interno de
5 modais ainda limitava a própria altura com `max-h-[85vh]`/`max-h-[92vh]`
— unidade de viewport, calculada contra a viewport real, não contra o
`body` reescalado. Em qualquer escala diferente de 100%, o card podia
nascer mais alto do que cabia, cortando o rodapé (botões de ação) para
fora da área rolável interna. Corrigido trocando por `max-h-full`, que
resolve contra o wrapper pai imediato.

## 11. Pendências conhecidas

Pendência de processo (não técnica): não existe mecanismo formal para a
vertical de acessibilidade receber o sinal de componentes "Outro" (seção
6) — hoje é só um rótulo visível ao designer.

## 12. Sobre este site

Este site (`aab-foton.github.io/hac_plugin`) foi publicado em 02/09/2026 a
partir da pasta `docs-site/` do repositório, via GitHub Pages, e é a fonte
primária de verdade da documentação do hac (ver nota no topo desta
página). Cobre quatro frentes: esta documentação técnica, o
[Changelog](changelog.html) (histórico cronológico de decisões), as regras
de negócio institucionais (`institucional.md`, gerado a partir de
`docs/hac-regras-de-negocio-institucional.docx`) e o design system próprio
da interface do plugin (`design-system.md`). Ao mudar a arquitetura
técnica de forma estrutural: atualize este arquivo
(`docs-site/tecnico.md`) e registre a mudança no `changelog.md` — o
arquivo local `docs/architecture-state.md` não precisa mais ser mantido em
sincronia obrigatória (é histórico), mas pode ser atualizado por
conveniência se a sessão já estiver com ele aberto.
