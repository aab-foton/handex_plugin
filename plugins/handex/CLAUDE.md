# CLAUDE.md — Handex Handoff Express

Contexto de projeto para o assistente. Leia este arquivo antes de qualquer tarefa.

---

## Quem é o usuário

Augusto Brasil, Designer sênior de UX da Fóton, atuando no projeto da CAIXA Econômica Federal. Trabalha com sistemas de design (DSC — Design System CAIXA), handoff para desenvolvimento e ferramentas internas para o time de design. Não é desenvolvedor de formação — contexto técnico deve ser direto e sem jargão desnecessário.

---

## O que é o Handex

Plugin Figma que automatiza o handoff de design. Permite ao designer:
- Registrar frames e escanear tokens de UI contra o DSC
- Anotar specs técnicas sobre elementos do canvas
- Inserir medidas (padding, gap, width, height) no canvas
- Mapear fluxos de tela
- Gerar uma ficha técnica completa no canvas do Figma

**Versão atual:** v6.8.5  
**Documentação:** `BUSINESS_RULES.md` (regras de negócio) · `CHANGELOG.md` (histórico)

---

## `docs/site/` — repositório central de documentação (leitura obrigatória)

Desde 2026-09, `docs/site/` é o site de documentação interno do Handex — HTML estático autocontido (sem build, sem hospedagem externa, repositório permanece privado, nunca GitHub/GitLab Pages), navegável por `docs/site/index.html`. Reúne arquitetura, regras de negócio, Design System (`design-system.html`), changelog e o histórico de propostas/investigações do projeto — hoje 19 páginas.

**Regra:** toda alteração que impacte documentação (nova decisão de produto, mudança de arquitetura, componente novo/alterado no Design System, regra de negócio nova ou revista) precisa atualizar a página correspondente em `docs/site/` **na mesma entrega** — não depois, não "quando sobrar tempo". Cada `.html` é editado diretamente (não há script gerador no momento desta nota — se um for criado depois, atualizar este parágrafo); os `.md` de origem (`BUSINESS_RULES.md`, `docs/*.md`, etc.) continuam sendo a fonte de edição ativa quando existem, e o `.html` correspondente precisa refleti-los.

Isso é a mesma disciplina já exigida entre `guide.html`/`onboarding.js`/tooltips (ver seção "Instruções do sistema devem ficar sempre casadas" nos agentes de UX/frontend) — aplicada agora também à documentação técnica/institucional. Deixar o site defasado silenciosamente é o mesmo tipo de bug de sincronização já visto neste projeto (specs sumindo por dualidade de fonte, guide desatualizado), só que na camada de documentação em vez de UI.

---

## Arquitetura

```
src/plugin/
├── code.js              ← Backend Figma (FONTE — editar aqui)
├── code.bundle.js       ← Backend compilado (GERADO — não editar)
├── ui.html              ← Frontend completo (GERADO — não editar)
├── build.cjs            ← Assembler do ui.html
├── manifest.json        ← Config do plugin para o Figma
├── modules/             ← Fragmentos JS concatenados no build
│   ├── core.js          ← Estado global, navegação, persistência, accordions
│   ├── messages.js      ← Dispatcher único de window.onmessage
│   ├── handoff.js       ← Coleta de dados + geração da ficha no canvas
│   ├── specifications.js← Scan, render de specs, cards de token
│   ├── audit.js         ← Conformidade DSC na UI
│   └── measurement.js   ← Medidas no canvas
├── views/               ← Fragmentos HTML inseridos no build
│   ├── home.html        ← 6 cards de ferramentas (grid 2×3 flex-1)
│   ├── handoff.html     ← Hub por frame (scan + medidas + specs + conformidade)
│   ├── specifications.html
│   ├── flows.html
│   ├── measurement.html
│   ├── guide.html       ← Onboarding com accordions por ferramenta
│   └── modals.html
└── refs/
    ├── _manifest.json   ← FONTE DE VERDADE das libs DSC
    └── _skeleton.json   ← Bundle gerado (~900KB, embarcado no ui.html)
```

**O frontend não usa módulos ES.** Todos os `modules/*.js` são concatenados em um único `<script>` dentro do `ui.html`. Compartilham escopo global em runtime.

**Comunicação backend ↔ frontend:**
- UI → backend: `parent.postMessage({ pluginMessage: {...} }, '*')`
- Backend → UI: `figma.ui.postMessage({...})`
- Roteador: `window.onmessage` em `messages.js`

---

## Scripts essenciais

```bash
npm run bundle:ui        # Reconstrói ui.html (frontend)
npm run bundle:code      # Recompila code.bundle.js (backend)
npm run export:plugin    # Copia os 3 arquivos para handex-plugin/ (distribuição)
npm run refs:update      # Atualiza skeleton das libs DSC + rebuild completo
```

**Após qualquer alteração:** rodar `bundle:ui` e/ou `bundle:code` antes de testar no Figma.  
**Para distribuir:** `npm run bundle:ui && npm run bundle:code && npm run export:plugin`

---

## Remotos git

```bash
origin  → https://github.com/aab-foton/handex_plugin.git   (GitHub)
gitlab  → https://gitlab.foton.la/caixa-design/design-foton.git  (GitLab — principal)
```

**Sempre fazer push para os dois:**
```bash
git push origin main && git push gitlab main
```

---

## Schema de dados (`handoffData`)

```js
{
  _schemaVersion: 2,       // v1 (wizard antigo) é descartado automaticamente
  step1: { titulo, versao, objetivo, status, equipe[] },
  step2: { briefingEnabled, briefingQuestions[], regras[], anexos[] },
  frames: [{               // hub de frames documentados
    id, figmaId, nome, isNewComponent,
    specs: null,           // resultado do scan
    audit: { checkDone, semDesvios, observacoes, ressalvas[] },
    measurements: [],
    createdSpecs: [],
    excecoes: [],
    specGroupNames: {},
    specGroupVisible: {}
  }],
  createdFlows: [],
  nextFlowNumber: 1
}
```

**Nota sobre `createdSpecs[].id`:** refere-se ao id do nó Figma raiz da spec no canvas — sempre um **GROUP** (`figma.group()` agrupando `Conector`/`DotInicio`/`DotFim`/`specCard`), com o `contour` ("Destaque") solto fora do grupo, travado, vinculado por pluginData (`handexSpecMarkerFor`/`handexSpecMarkerId`). Uma migração para FRAME único foi tentada e revertida (ver "Bugs corrigidos relevantes") — não retomar sem alinhamento.

**Nota sobre `specGroupNames`/`specGroupVisible`:** nome legado — refere-se ao agrupamento lógico de specs por letra/categoria na UI, não ao tipo de nó GROUP do Figma.

**Feature oculta — `_aiContext` (2026-08, `modules/design-data.js`):** `exportHandoffData()` e `exportProgress()` injetam um campo `_aiContext` (calculado por `_buildAiContext()`) no JSON exportado, agregando briefing (`step1`/`step2.briefingQuestions`/`regras`), tokens usados nas specs, cenários de exceção, medidas e fluxos do projeto atual num formato compacto. Objetivo: material de apoio para colar como contexto/prompt em ferramentas externas de geração (ex: Figma Make) ao propor uma tela nova dentro do MESMO projeto — nunca integração automática (não existe canal de API para isso) nem geração feita pelo próprio Handex. Sem botão/UI visível de propósito — funciona em background, sempre presente no export existente. `_aiContext` é dado **derivado**, calculado no momento do export: nunca deve ser persistido em `handoffData` nem sobreviver a um ciclo de import (`importHandoffData()` remove o campo antes do `Object.assign`, de propósito). Ver `docs/figma-api-roadmap-2026.md` (item 4b) para o raciocínio completo de escopo — por que isso fica contido a um projeto e não deve crescer para conhecimento institucional agregado entre projetos.

**Feature oculta e DESLIGADA — handoff pra plugins de handoff especializado (2026-08-26, `code.js`):** `_writeDscHandoffSummary(node, frame)` grava, via `setSharedPluginData('dsc-handoff', 'frame-summary', ...)` no próprio nó do frame, a lista de `componentKey`/`name`/`nodeType` que o scan já identificou naquele frame — pensado para plugins irmãos de handoff especializado (ex: **hac**, foco em acessibilidade) lerem o mesmo frame depois e pré-preencherem o que puderem, sem o designer repetir seleção/identificação de componente. Controlado por uma única flag, `DSC_HANDOFF_SUMMARY_ENABLED` (topo de `code.js`, perto de `PLUGIN_VERSION`) — **hoje `false`, deliberadamente**: a função já está implementada e testada (lint/bundle limpos), mas o consumo do lado do hac ainda não está consolidado o suficiente para ativar. Quando o hac estiver pronto para consumir, ativar trocando essa flag para `true` — nenhuma outra mudança de código é necessária deste lado. Canal isolado do `_aiContext` acima: namespace/key diferentes (`dsc-handoff`/`frame-summary` vs. `handex`/`context`), propósito diferente (fato bruto de componentes pra outro PLUGIN consumir, não contexto de prompt pra IA generativa), gatilho diferente (a cada save, não só no export). Deliberadamente **não resolve** lib de origem DSC nem categoria de a11y do lado do Handex — essa lógica já existe e é mantida no hac (`_getDscComponentKeyToFrameMap`/`_resolveDscComponentA11yMatch`); duplicar aqui criaria duas cópias divergentes da mesma resolução.

---

## Decisões de produto tomadas (não reverter sem alinhamento)

| Decisão | Razão |
|---|---|
| Dots de conformidade por propriedade **removidos** da ficha | Criavam falsa impressão de 100% conforme; acurácia é responsabilidade do designer |
| **Vetores** filtrados do scan | Shapes primitivos não representam conformidade DS |
| **Frames com filhos DS** filtrados do scan | São contêineres de layout; conformidade vive nos filhos |
| Frames sem nenhum filho DS **mantidos** no scan | Indicam tela 100% custom fora do DS — informação relevante |
| `isDS` por propriedade **não influencia** os toggles de auditoria | São camadas distintas: scan automatizado vs. declaração humana |
| Accordions do botão `⇅` incluem **cards de frame** | Antes só recolhia accordions internos |
| Spec permanece **GROUP + nó solto (`contour`) vinculado por pluginData** — não migrar para FRAME único | Testado em 2026-08: FRAME único exigia duplo-clique para mover Conector/card sem arrastar o marcador junto; não ficou bom na prática. Revertido para o esquema original (clique simples move só o grupo móvel, marcador nunca acompanha) |

---

## Bugs corrigidos relevantes (contexto histórico)

- **`addFrame()` inicializava `audit` errado** — usava `{ status, justificativa }` mas o runtime espera `{ checkDone, semDesvios, observacoes, ressalvas }`. Corrigido em v4.1.4.
- **`setSvgColor` pintava o FRAME container do SVG** — `figma.createNodeFromSvg()` retorna um FRAME envolvendo VECTORs. A função aplicava cor no container, deixando tudo cinza. Corrigido para limpar fills do container e colorir só os nós folha.
- **`toggleFrameAccordion` buscava `frame-arrow-{id}`** — o HTML renderiza `frame-chevron-{id}`. Corrigido em v4.1.6.
- **`handoffData.docs` não inicializado no schema v2** — acessos como `handoffData.docs.proto.link` quebravam. Corrigido com null-guards.
- **Spec criada em "Anotar Specs" sumia da lista sem erro visível** — handler `spec-created` (`messages.js`) tinha `if (activeFrameId) { const frame = getFrame(activeFrameId); if (frame) { ...push... } }` sem `else` para o caso `frame === null`. `activeFrameId` é estado do módulo, nunca resetado por navegação — se ficasse "fantasma" apontando pra um frame excluído (ou de sessão anterior com outro arquivo `.fig` aberto), a spec não caía em nenhum array (nem `frame.createdSpecs`, nem `createdSpecs` global), mas `saveSpecsToStorage()` e o toast "Especificação criada" rodavam do mesmo jeito — o card era criado normalmente no canvas (responsabilidade do backend, independente do frontend), mascarando a falha por completo. Corrigido em 2026-08-27: adicionado `else` tratando `activeFrameId` truthy + frame inexistente como spec avulsa, e resetando `activeFrameId = null` pra não repetir o problema na spec seguinte. **Padrão a vigiar:** qualquer `if (algumEstadoDeModulo) { const x = lookup(...); if (x) { ... } }` sem `else` no nível de fora é um candidato a falha silenciosa — o `if` externo garante execução, mas o `if` interno pode abortar sem sinalizar nada ao usuário.
- **Sub-componentes estruturais auditados isoladamente (ex: "Icon color" dentro de `.[dsc] Menu Hamburger Header`)** — a proteção `_hasDSChild` (não auditar um container que tem filho DS real, porque a conformidade "vive" no filho) só cobria `category === "frames"`. Um COMPONENT/COMPONENT_SET usado como sub-composição interna de um componente maior (ex: wrapper de ícone) era auditado sozinho contra o skeleton via `componentKey`, que nunca bate porque sub-componentes internos não são publicados independentemente — resultado: item "FORA DO PADRÃO" mesmo com todas as props corretas. Corrigido em v6.8.2 estendendo `_hasDSChild` para `components`/`icons`, restrito a `node.type !== 'INSTANCE'` (instâncias reais podem legitimamente conter sub-instâncias e continuam auditadas normalmente).
- **Componente sem vínculo real de lib reportado como "EM CONFORMIDADE"** — `dsElement` (isDS no nível do componente) virava `true` sempre que a coleção agregada de props batia, mesmo quando o próprio componente não tinha `componentKey` reconhecido no skeleton, ou era instância de qualquer arquivo "remoto" do Figma (não necessariamente uma lib do DSC). Ex. real (2026-09-03): "NavBar" é instância de um componente publicado num arquivo pessoal de outro projeto de design (`mainComponent.remote === true`), mas não existe NavBar componentizado no DSC — o override `node.type === 'INSTANCE' && mainComp.remote` tratava esse vínculo genérico como prova de conformidade. Corrigido em duas rodadas:
  - **v6.8.2** (incompleta): tentou exigir vínculo real, mas ainda considerava `mainComponent.remote` como vínculo válido — não resolveu o caso NavBar porque "remoto" ≠ "é do DSC".
  - **v6.8.3** (definitiva): removido o override de `remote` genérico. Vínculo real com o DSC passou a ser só `matchedBy === "key"` (bateu no skeleton das libs DSC) ou convenção `[dsc]` no nome. Sem isso, o item vira `isDS: "warning"` + `isCustomComponent: true` (UI exibe "COMPONENTE PERSONALIZADO"). Além disso, componentes COM vínculo real passaram a herdar a mesma agregação de props já usada em frames — uma instância legítima do DSC com propriedades fora do padrão (gap/padding customizados) não é mais reportada como 100% conforme só por ter vínculo; a conformidade final é vínculo real **E** props OK.
  - **Padrão a vigiar:** `remote === true` no Figma significa "vem de algum arquivo publicado como biblioteca", nunca "é do Design System oficial" — qualquer decisão de conformidade contra o DSC precisa checar o `componentKey`/skeleton, nunca só a flag de remoto.
- **Wrapper estrutural auditado isoladamente mesmo com filho DS real — critério certo é vínculo, nunca nome** — a proteção original (`_hasDSChild`, v6.8.2) só pulava containers estruturais quando `node.type !== 'INSTANCE'`, partindo da premissa "instância real do DSC pode legitimamente conter sub-instâncias e ainda ser o item correto a auditar". Isso vale para uma instância COM vínculo real, mas não cobre wrappers internos da própria lib que também são `INSTANCE` mas SEM vínculo próprio (ex: `.[base] Menu logo`, contendo `[dsc] Slot` como filho real). Uma primeira tentativa de correção (v6.8.4) tentou resolver isso detectando o prefixo de nome `.[base]` via regex — **rejeitada pelo usuário** por se basear em convenção de nomenclatura (texto livre, subjetivo, editável por qualquer designer), não em dado real de vínculo com a lib. Reescrita em v6.8.5 com o critério correto: calcula se o PRÓPRIO nó tem vínculo real com o DSC (`componentKey` batendo no skeleton via `matchedBy` "key", ou convenção `[dsc]` — nunca `.[base]` nem qualquer outro nome, nunca `mainComponent.remote`) *antes* de decidir se ele é estrutural; um nó sem vínculo próprio é pulado se tiver algum descendente (checado recursivamente, também por vínculo real de `componentKey`, não por tipo de nó cru) que tenha esse vínculo. `_ownLibLink`/`_nodeHasRealLibLink`/`_hasRealDSDescendant` substituíram `_hasDSChild`/`_isBaseWrapper`/`_isStructuralContainer` por completo. **Padrão a vigiar:** nome de camada no Figma nunca é dado confiável para decisão de conformidade — é texto livre. Toda decisão de "isso é do DSC" precisa passar por `componentKey` contra o skeleton (ou, no máximo, pela convenção `[dsc]` já estabelecida e documentada como tal, nunca uma convenção nova inferida ad-hoc).

**Nota sobre a arquitetura de spec (GROUP + nó solto) — vigente:** o marcador ("Destaque") vive FORA do `specGroup`, como nó irmão travado na página, vinculado por pluginData (`handexSpecMarkerFor`/`handexSpecMarkerId`). Não é escolha estética, é a única solução dada uma limitação real da Figma Plugin API: a posição de um filho é sempre relativa ao pai (tanto em GROUP quanto em FRAME), e `locked = true` num filho não o desacopla de transformações do container pai — mover/redimensionar o container sempre move todos os filhos, travados ou não. Como o usuário sempre seleciona e arrasta o `specGroup` inteiro como unidade com um clique simples (nunca duplo-clique para "entrar" no container), qualquer filho do mesmo grupo se moveria junto, mesmo travado. Em 2026-08 essa arquitetura foi migrada para FRAME único (contour+dots dentro do mesmo container, exigindo duplo-clique do usuário para mover Conector/card sem arrastar o marcador) e depois **revertida** — o gesto de duplo-clique não funcionou bem na prática. Não remigrar sem alinhamento explícito.

---

## Convenções de código

- **Sem comentários** salvo quando o "porquê" é não óbvio
- **Sem tratamento de erro** para cenários impossíveis — só em boundaries externos
- Texto da UI sempre em **português brasileiro**
- Ícones: biblioteca **Lucide** (`data-lucide="nome"`)
- Estilo: **Tailwind v3** (classes compiladas via `bundle:ui`)
- Bordas dos botões: **`rounded-2xl`** em todo o plugin

---

## Design System do Handex (leitura obrigatória antes de mudança visual)

`docs/design-system-handex.md` é a **referência normativa** de tokens (cor, tipografia, espaçamento, radius) e catálogo de componentes (variantes de botão, accordion, modal, ícone) da UI do plugin — não confundir com o DSC da CAIXA, que é outro documento (ver seção "Arquitetura" acima, `refs/_manifest.json`).

**Antes de criar ou alterar qualquer componente visual** (botão, card, modal, ícone, cor, espaçamento): consultar esse arquivo primeiro. Se o padrão já existe lá, seguir — não inventar uma variante nova sem necessidade. Se a mudança que você está fazendo torna uma regra do documento desatualizada (novo token, variante nova, correção de contraste, etc.), **atualizar o `.md` no mesmo commit** — nunca deixar código e documento divergirem silenciosamente, é exatamente esse tipo de duplicidade sem sincronização que já causou bugs reais neste projeto (ver "Bugs corrigidos relevantes").

Onde o código atual diverge do que o documento define, isso é dívida técnica listada na seção 9 do próprio `.md` — não uma segunda opção válida a copiar.

Há também uma versão navegável publicada como Artifact (link não fixo, buscar via `Artifact action:"list"` se precisar) — é gerada manualmente a partir do `.md`, não é fonte, só vitrine. Se o `.md` mudar, o artifact deveria ser republicado para não ficar defasado.

---

## Estrutura da home (referência visual)

**Corrigido em 2026-08-24** — a versão anterior deste bloco descrevia um header com "Gerar Ficha" e busca que não existe mais no código (`src/plugin/ui.html:616-667`); ficou desatualizada silenciosamente por pelo menos uma versão e induziu análise incorreta numa auditoria de UX. Verificar contra `ui.html` antes de confiar neste bloco em revisões futuras.

```
Header: [Logo | HANDEX vX]  [📋 Dados do Projeto]  [🔍− zoom out (oculto por padrão)]  [🔍+ zoom in]  [☀/🌙 tema]  [⇱ minimizar]

Grid 2×3 (flex-1, preenche altura disponível):
  [Como usar o plugin]   [Informações do Projeto]
  [Escanear Tokens]      [Anotar Specs]
  [Anotar Medidas]       [Fluxos de Tela]

Footer:
  [▶ Gerar Ficha de Handoff]
  [↑ Importar JSON]  [🗑]
```

"Gerar Ficha" não está mais no header global — hoje só é acionável de dentro de `view-dados-projeto` (`dados-projeto.html:314`) ou `view-handoff-summary` (`handoff-summary.html:146`), ambos chamando `openHandoffInjectModal()`.

---

## Distribuição

A pasta `handex-plugin/` (gitignored) contém os 3 arquivos para distribuição:
- `manifest.json` + `code.bundle.js` + `ui.html`
- Instalação: Figma → Plugins → Development → Import plugin from manifest
- Não requer npm install nem build

---

## Observações de processo

- Documentação técnica: `BUSINESS_RULES.md` + `CHANGELOG.md` — atualizar a cada versão
- O `_skeleton.json` das libs DSC precisa ser atualizado periodicamente via `npm run refs:update` (requer `FIGMA_TOKEN` no `.env`)

### Versionamento (obrigatório a cada commit extenso)

- **Minor a cada entrega grande** (conjunto de features/fixes que muda comportamento perceptível do produto): `5.0.0 → 5.1.0 → 5.2.0`. Patch (`5.0.x`) fica reservado só para ajustes pequenos isolados.
- Bump em `package.json` (`npm version <x.y.z> --no-git-tag-version`) e em `CLAUDE.md` ("Versão atual") **antes** de commitar, não depois — nunca deixar a versão do código dessincronizada do relatório de atividades.
- Beta e estável versionam de forma independente: a beta usa sufixo `-beta.N` (ex: `5.1.0-beta.1`) enquanto está em teste; ao promover pra `main`, o sufixo é removido.
- `code.bundle.js` já lê a versão do `package.json` automaticamente via `scripts/bundle-code.cjs` — rodar `npm run bundle:code` depois do bump para propagar.

### Versão do `package.json` ≠ "Version N" da Figma Community

São **dois números completamente independentes** — não confundir nem tentar sincronizar um com o outro:

- **`package.json` (semver, ex: `6.1.1`)**: versionamento interno do código, segue as regras acima (minor/patch, beta com sufixo).
- **"Version N" da Figma Community** (ex: "Version 7", "Version 8"): contador próprio da Figma, incrementado automaticamente a cada publicação de nova versão no Community, visível em Community → Manage → Version history. Não é configurável, não lê `package.json`, e não tem relação matemática com o semver do projeto — a publicação da v6.1.1 pode virar "Version 8" na Community mesmo sem qualquer conexão numérica entre os dois.

Ao falar de "nova versão" com o time, sempre deixar claro qual dos dois números está em jogo — já causou confusão real (2026-07-28: tentativa de forçar o `package.json` para `8.0.0` para "alinhar" com o Version 7/8 da Community, revertida depois de esclarecido que são sistemas distintos).
