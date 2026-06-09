# DSC A11Y Handoff — Plugin Figma

Plugin para preencher templates de handoff de acessibilidade no Figma.
Branch atual: `feat/instance-based-preview`. Versão: `2.2.0`.

## Arquivos

| Arquivo | Papel |
|---------|-------|
| `code.ts` | Lógica do plugin (sandbox Figma, ~2895 linhas) |
| `ui.html` | Interface (iframe sandboxado, ~3039 linhas) |
| `FUNCTIONS.md` | Mapa de funções e handlers com números de linha |
| `Makefile` | `push-github` / `push-gitlab` / `push-all` |

## Fluxo normal (template novo)

```
Seleção Figma (1 componente + 1 handoff)
  → tentarTravarContexto()
  → carregarDadosEEnviarParaUI()
      → parseMasterList()        ← lê tabela Figma (não pluginData)
      → postMessage('setup-ui', isOldFormat=false)
  → UI: renderLists() + dropdowns prontos
  → Usuário clica "Atualizar Handoff"
  → run-handoff: detach → fillTable → salva a11y-component-data
```

## Fluxo de migração (handoff antigo)

```
Seleção com handoff antigo (tem filho 'keyboard maping/mapping')
  → carregarDadosEEnviarParaUI() carrega pluginData salvo (se existir) e envia isOldFormat=true
  → UI: se componentData está vazio → exibe banner "Handoff Antigo Detectado"
         se componentData já tem dados → preenche form diretamente (já foi importado antes)
  → Usuário clica "Importar Tudo"
      → import-old-section para cada seção (geral, toque, tabulacao, leitor)
      → parseOldGeralData / parseOldTouchAreas / parseOldTabOrder / parseOldSRData
      → save-partial-data / save-leitor-tela salvam no frame do handoff (fallback sem dbInstance)
      → UI preenche formulário com dados migrados
  → Usuário clica "Atualizar Handoff"
  → run-handoff detecta isOldHandoff → swap do template:
      → clona seções desmarcadas (oldSnapshots) antes de deletar o antigo
      → importComponentByKeyAsync('4ebd8a017a86b29ca60427416ed4b76af05e4a67')  ← variant=Acessibility
      → createInstance() posicionada onde o antigo estava
      → transfere pluginData, deleta o antigo
      → restaura oldSnapshots nas seções correspondentes do novo template
      → continua fluxo normal (detach → fillTable)
```

## Fonte do masterList

Tabela Figma `"Mapeamento de Teclado e Gestos do Plugin"` dentro do nó
`[dsc-h] Plugin Data A11y` (oculto, bloqueado) no template.
Colunas em ordem: `mapeamento` → `descricao` → `utilizacao` (`"teclado"` ou `"gesto"`).

## Regras de seleção

- **Handoff**: nome contém `[dsc-h] Template Handoff` ou começa com `[dsc] A11Y Handoff:`
- **Componente**: `COMPONENT | COMPONENT_SET | INSTANCE | FRAME` que não seja o handoff
- Precisa exatamente **1 de cada**

## Estrutura interna do template (novo)

```
keyboard maping
  └── table
      ├── [dsc doc] Doc Table  →  2× [dsc] Table Header  ← cabeçalho (preservar)
      └── [dsc doc] Doc Table  →  2× [dsc] Table Cell    ← modelo de linha (clonar)
```

No template fresco (colocado manualmente pelo designer), `table` pode ter `Header` e `Row` direto. `fillTable` suporta ambas as estruturas.

## Persistência

- Chave: `a11y-component-data` — salva em 3 lugares (cascata, mais específico ganha na leitura):
  1. `[dsc-h] Plugin Data A11y` (dbInstance) — quando existir (template novo)
  2. Frame do handoff diretamente — sempre (fallback para handoff antigo sem dbInstance)
  3. COMPONENT_SET / COMPONENT pai — via `resolveDataNode` (baseline compartilhado)
- Estrutura completa:
```ts
{
  plataformas: string[],
  zoom: string[],
  mapeamentos: { mapeamento, descricao, utilizacao }[],
  areas_toque: TouchAreaItem[],   // legado — sem variações
  sem_toque: boolean,
  variacoes: Variacao[],          // variações de toque (novo)
  variacoes_tabulacao: TabVar[],
  variacoes_leitor: SRVar[],
  conectores_leitor: any[],
  sem_leitor: boolean
}
```
- `TouchAreaItem`: `{ nome, preset, width, height, relX, relY }`
- `Variacao`: `{ id, nome, propriedades, areas_toque, sem_toque, frameNodeId, instanceNodeId }`
- `TabVar`: `{ id, nome, propriedades, tab_order, sem_tabulacao, frameNodeId, instanceNodeId }`
- `SRVar`: `{ id, nome, propriedades, conectores_leitor, sem_leitor, frameNodeId, instanceNodeId }`
- Conector leitor de tela: `{ roleNome, especificacao, tipo, tipoConnector, tipoAnotacao, migrBadgeIdx, origem, descricao, observacao, nomeAcessivel, codigoWeb, codigoRN, relX?, relY?, width?, height? }`
  - `tipoAnotacao === 'agrupamento'` → renderiza `[a11y] Agrupamento`; demais → `[a11y] Conectores`

## Convenções

- `setupSearch()` é chamado **uma única vez** fora do `onmessage` (evita acúmulo de listeners)
- Ao preencher tabela do template: remove `(unitário)` e `(em sequência)` do campo mapeamento
- Ao gerar handoff: `detachInstance()` se o nó for `INSTANCE` antes de `appendChild`
- `figma.getNodeByIdAsync(id)` (async) — `getNodeById` síncrono falha no modo `dynamic-page`
- Template antigo detectado por: filho com nome `'keyboard maping'` ou `'keyboard mapping'`
- `tempSROverlayRefX/Y` — armazena posição do componente no momento de `create-sr-overlay` para calcular `relX`/`relY` correto no `confirm-sr-area`
- Agrupamentos de leitor de tela: `relX`/`relY` são relativos ao componente ativo; `width`/`height` são as dimensões do frame de agrupamento
- Badge de número no preview de toque e tabulação: `connector: 'Off'`, posicionado acima do componente (`currentY - numClone.height - 4`), sem linha de conector
- Limpeza pós-geração: os frames `[A11Y Variação*]` e `[A11Y Variações]` são removidos em **varredura única** do `currentPage.findAll` (não 4 passagens separadas)
- Painel "Como usar": botão `i` no header abre `infoOverlay` com passo a passo de seleção, descrição das abas e card de configurações
- Badge de heading no leitor de tela: quando `tipoVariante === 'nível de título'` e `c.especificacao` está preenchido, o texto do badge é `c.especificacao` (h1/h2/h3) — tanto no preview quanto nas specs
- `createComponentInstance` para `COMPONENT_SET`: usa `defaultVariant` → `children.find(COMPONENT)` → frame placeholder vazio. **Nunca** clona o set inteiro (evita mostrar todas as variantes no canvas/handoff)
- Limpeza no início de `run-handoff`: remove `[A11Y Toque]` **e** `[A11Y Leitor]` da página; zera `tempTouchOverlayId` e `tempSROverlayId`
- `oldSRVarCapture` órfãos: nodes de migração SR que não foram reinseridos no handoff são removidos na limpeza final via `cap.comp.parent === figma.currentPage`
