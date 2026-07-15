# Changelog

## v2.3.2 — 2026-07-15

### Correções

- **Description da anatomia não era escrita para elementos aninhados** — o template trocou o container "Description" pela instância `[dsc-hub] Card Alert`, mas o código ainda procurava pelo container antigo (nome exato "Description"), então o texto "Nested Component: X" nunca substituía o placeholder do template. Corrigido tanto na geração quanto no fallback de reinjeção de edições manuais (`buscarEAplicarPorNome`), que tinha o mesmo problema.
- **Edições manuais antigas incorretas ficavam presas em handoffs já gerados** — um backup de "edições preservadas" contaminado por um bug anterior de pareamento nome/descrição na anatomia era reinjetado a cada atualização, sobrescrevendo o conteúdo correto recém-gerado. Adicionada ferramenta de dev (Extras, oculta por padrão) pra limpar esse backup por handoff sem precisar descartar todas as edições manuais dele.

## v2.3.1 — 2026-07-13

### Correções

- **Nome do componente perdia o case original** — o título do handoff sempre forçava o nome para minúsculas com só a primeira letra maiúscula (ex: "FAQ" virava "Faq"). Agora o nome é usado exatamente como escrito no Component Set.
- **Token de texto não trocava no dark mode dos cards de preview** — nos cards de variação com fundo escuro, só o fundo (`card background`) trocava de token; o label (ex: "TRUE - Dark") continuava vinculado ao token de texto do modo claro, ficando com baixo contraste. Agora `card text` também é aplicado ao label.

### Manutenção

- Limpeza de lint: removidas 5 funções mortas e 1 variável não usada, `no-empty` liberado para `catch {}` (padrão intencional do plugin), 3 funções internas movidas para a raiz do escopo, e removidos 3 fallbacks deprecados de `setExplicitVariableModeForCollection`.

## v2.3.0 — 2026-07-09

### Novidades

- **Nomes de template configuráveis** — campo "Nome do template" no painel de Configurações permite cadastrar múltiplos nomes reconhecidos como Template de Handoff (um por linha). Se o template for renomeado no arquivo, basta adicionar o nome novo ali; não precisa remover o antigo, e handoffs já gerados continuam funcionando.
- **Varredura de nomes do template (dev, temporário)** — card em Configurações que confere se os nomes literais que o `code.ts` procura dentro do template (Property Table Row, Cell 01/02/03, Subtitle, Slot nativo, badge de item number, etc.) ainda existem no template atual, sem depender de seleção.
- **Chave de fábrica do template** — fallback de biblioteca (`CHAVE_TEMPLATE_PADRAO`) usado quando ainda não há nada em memória/clientStorage, útil na primeira execução em um arquivo novo.

### Correções

- **Template renomeado quebrava a detecção** — o plugin dependia de um nome fixo (`[dsc-h] Template Handoff`) e de uma chave de componente que ficou obsoleta após o template ser renomeado para `[dsc-hub] Handoff de Design`, causando erro 404 ao importar da biblioteca. Agora a chave é atualizada automaticamente assim que o template é resolvido por nome.
- **Componentes internos do template renomeados** — `Property Name/Value/Description` → `Cell 01/02/03`, `Subtitle Variants` → `Subtitle`, `[base] Swap Slot` → `Slot nativo`, `[dsc-h] Item Number` → `[dsc-hub] Item Number`. Leitura de handoffs já existentes (gerados com os nomes antigos) mantém fallback de compatibilidade.
- **Badges de numeração perdiam a instância** — a proteção contra "achatamento" de instâncias (`desvincularTodasInstancias`) e a montagem do badge na anatomia dependiam do prefixo `[dsc-h]`, que não cobre `[dsc-hub]`. Ambos os prefixos agora são reconhecidos.
- **Contraste no dark mode não trocava o fundo do card** — regressão do commit `c03d5ae` (23/03): a checagem que troca o fundo para "card background 2" quando o componente fica escuro-demais no fundo escuro da matriz/variações tinha sido removida ao separar `aplicarModeHandoff` em duas funções. Reintegrada em `criarCardVariacao` e `popularMatrizEstados`.

## v2.2.0 — 2026-07-03

### Novidades

- **Seletor de eixos X e Y para o Formatar Component Set** — ao marcar "Formatar Component Set na página", o plugin exibe chips interativos para escolher qual propriedade vai nas colunas (eixo X) e quais vão nas linhas (eixo Y). A seleção padrão usa a propriedade "state"/"status" como X e as demais como Y.
- **Layout vertical para componentes com 1 propriedade** — quando o Component Set tem apenas uma prop, é possível movê-la para o eixo Y (clicando no chip que está desabilitado no eixo Y), gerando um layout em coluna em vez de linha.
- **Accordions na UI** — as seções "Component Set" e "Seções a atualizar" agora são accordions colapsáveis, deixando a interface mais compacta e organizada.
- **Target `release` no Makefile** — `make release VERSION=x.y.z` compila, commita e envia para GitHub e GitLab em um único comando.

### Melhorias de UX

- Chips do eixo X e Y do Component Set são totalmente interativos nos dois sentidos: clicar no X troca o prop e libera o anterior no Y; clicar num chip "off" no Y faz swap automático com o X atual.
- Removido o estado "disabled" visual dos chips do Y — props bloqueadas pelo X aparecem apenas como não selecionadas (cinza normal), sem aparência acinzentada diferente.
- Fallback defensivo no seletor de eixos: se o padrão de X não for detectado, o primeiro prop disponível é selecionado automaticamente.

### Correções

- **Bug: X ficava vazio com múltiplas props** — clicar no chip desabilitado do Y com 2+ props deselecionava o X indevidamente. Corrigido para fazer swap apenas quando há exatamente 1 prop.

---

## v2.1.0 — 2026-06-03

### Novidades

- **Seletor de Eixo Y da Matriz de Estados** — o plugin agora detecta automaticamente todas as propriedades VARIANT não-estado do componente e exibe chips interativos na UI para o usuário escolher quais usar como eixo Y da matriz. Por padrão as 2 primeiras são selecionadas. Propriedades de slot, swap e change são excluídas automaticamente.
- **Matriz de estados agora inclui todas as props VARIANT** — a lista de candidatos ao eixo Y deixou de ser uma whitelist de nomes fixos (`variant`, `type`, `color`, etc.) e passou a considerar qualquer prop VARIANT do componente que não seja estado, device ou breakpoint.

### Correções

- **Variante Danger (e outras) não era aplicada nas variações** — `setProperties` falhava silenciosamente para props VARIANT quando só uma propriedade era alterada de cada vez. Corrigido com busca direta via `variantProperties` no ComponentSet: o plugin agora localiza o ComponentNode exato que corresponde à combinação pedida (usando o variant padrão como base para as demais dimensões) e cria a instância a partir dele.
- **Cards da Matriz de Estados não redimensionavam verticalmente** — a altura do card ficava fixa no valor do template mesmo quando o componente era maior. Corrigido com `layoutSizingVertical = "HUG"`.
- **Componente horizontal cortado na Matriz de Estados** — a largura da célula era calculada apenas com o variant padrão (ex: Vertical). Corrigido para medir todas as combinações do eixo Y e usar a maior largura.
- **Erro `Cannot unwrap symbol` em `set_strokeWeight`** — `sincronizarPropriedadesLayout` atribuía `strokeWeight` sem checar se era `figma.mixed`. Corrigido com guarda de tipo.

### UI

- Janela redimensionada para 380×600px.
- Tabs maiores e mais legíveis (13px, padding 10px, borda 2px edge-to-edge).
- Header com ícone 30px e título 14px.
- Botão de ação com fonte 13px bold e padding 12px.
- Chips de seleção substituem checkboxes no seletor de Eixo Y (mais compactos).
- `truePrimeiro` agora é enviado corretamente também no fluxo de atualização.

---

## v2.0.3 — 2026-05-28

### Correções

- **Formatar Component Set detachava sub-instâncias dos variants** — ao mover o component set para um container ainda "órfão" (fora da página), o Figma convertia internamente as instâncias dentro dos variants em frames. Corrigido ancorando o docFrame na página antes de mover o component set para o setWrapper.
- **Checkboxes de seção ignoradas no update** — ao desmarcar todas (ou parte das) seções antes de "Atualizar Handoff", a lógica de filtro tratava um array vazio `[]` como "sem filtro" e atualizava tudo. Corrigido para tratar `[]` como "não atualizar nenhuma seção".

---

## v2.0.2 — 2026-05-26

### Correções

- **Formatar Component Set deletava conteúdo do frame pai** — ao executar "Formatar Component Set" com o componente dentro de um frame, section ou grupo, o plugin subia até o ancestral raiz e removia o nó inteiro, apagando todo o conteúdo do container. Corrigido para mover apenas o component set para fora e só remover o frame raiz se ele foi gerado por uma execução anterior desta mesma função (identificado via `pluginData`).

---

## v2.0.1 — 2026-05-15

### Correções

- **Handoff dentro de Section não era detectado como atualização** — o check de `isUpdate` usava `figma.currentPage.children`, que não percorre Sections. Com isso, o botão aparecia como "Gerar Handoff" mesmo quando o handoff já existia, e ao clicar o plugin não encontrava o template e exibia erro. Corrigido para usar `buscarHandoffExistente()`, que busca recursivamente em toda a página incluindo Sections.

---

## v2.0.0 — 2026-05-14

- Versão inicial estável do DSC Handoff.
