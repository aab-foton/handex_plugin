---
layout: page
title: Changelog
nav_order: 4
permalink: /changelog.html
---

# Changelog

Diário de bordo do hac — decisões técnicas, bugs reais corrigidos e mudanças
de arquitetura, em ordem cronológica. Diferente da
[Documentação Técnica](tecnico.html), que descreve o **estado atual** do
sistema, esta página registra a **evolução**: o que mudou, quando, e por
quê. Este é o documento a atualizar sempre que uma decisão técnica relevante
for tomada — ele é, junto com `tecnico.md`, a fonte primária de verdade da
documentação do hac (ver nota no topo de `tecnico.md`).

---

## 2026-08-24/25 — Nascimento do hac

O hac é extraído da funcionalidade de acessibilidade do plugin Handex Beta
e vira um plugin independente para o Figma. Schema de dados desenhado sem
conceito de "frame"/múltiplas telas (diferente do Handex) — decisão
deliberada para eliminar de raiz um bug conhecido do Handex: specs
"sumindo" por haver duas fontes de verdade divergentes (array avulso vs.
array por frame). O hac nasce com um único array de verdade por tipo
(`a11yAreas`, `a11ySpecs`, `tabOrderItems`).

## 2026-08-26 — Migração para a lib "Super DSC" e ajustes de repositório

- Migração da lib mobile de matching para a "Super DSC" nova (3ª lib real
  mapeada), com storage isolado por arquivo, dedupe de specs, e ajustes de
  posicionamento em zigue-zague dos selos.
- Handoff Handex → hac deixado pronto, porém desligado (sem confirmação de
  consumo real ainda).
- Lib "DSC Android" cadastrada e revertida no mesmo dia, em ambos os
  produtos (Handex e hac) — reavaliação posterior recadastrou essa lib em
  02/09/2026 (ver abaixo), após identificar um bug real de classificação.

## 2026-09-01 — Bug real: componente de lib não mapeada

Descoberto que um "Icon Button" da lib DSC Android (nunca mapeada até
então) era classificado incorretamente como "Elemento Decorativo" — o
matching, sem saber a que lib o componente pertencia, caía num fallback
incorreto. Ficou registrado que a solução ideal era generalizar o matching
por categoria entre libs mobile, não apenas recadastrar a lib pontualmente
— retomado na sessão seguinte.

## 2026-09-02 — Sessão de correções estruturais e definição de arquitetura

Sessão longa com múltiplos bugs estruturais reais corrigidos e a
arquitetura de origem web/mobile revisada três vezes no mesmo dia.

### Origem do projeto (web/mobile): três fases até a versão final

1. **Fase 1 (herdada de antes desta sessão) — voto de maioria por área.**
   `area.origin` era calculado pela proporção de componentes web vs.
   mobile detectados dentro de cada Área Marcada, recalculado a cada
   "Reescanear". Frágil: dependia de haver componentes suficientes
   detectados, e podia mudar retroativamente entre scans da mesma área.
2. **Fase 2 — perguntar a cada ação (implementada e revertida no mesmo
   dia).** O voto de maioria foi substituído por uma modal bloqueante
   perguntada toda vez que uma ação precisava saber a origem. Problema
   real descoberto em teste: quando "Marcar Área" tem auto-detecção
   ligada, ela dispara a Detecção Automática em sequência imediata — o
   designer via a mesma pergunta duas vezes seguidas, parecendo um bug de
   loop.
3. **Fase 3 (estado final) — configuração única por projeto.** A origem
   passou a ser uma característica do arquivo inteiro, nunca mista,
   perguntada uma única vez e reutilizada por todas as ações
   (`ensureA11yProjectOriginThen`). Editável a qualquer momento via modal
   "Sobre o hac". Resetada ao "Limpar Cache". Exceção deliberada: o
   "Reescanear" dentro do resumo da Detecção Automática pergunta de novo
   a cada passada, porque a lib pode ter mudado entre scans — sem
   sobrescrever a configuração global do projeto.

### Matching DSC → categoria de acessibilidade

- Lib **DSC Android** recadastrada (depois de removida em 26/08) — motivo:
  bug real de "Icon Button" sendo classificado como "Elemento Decorativo"
  por a lib nunca ter sido mapeada.
- **Filtro por origem no matching**: até então, o matching de categoria
  usava um único Map global fundindo os 4 buckets de mapeamento a11y (das
  4 libs de detecção), sem filtrar por origem — permitindo, em tese,
  colisão silenciosa entre libs de plataformas diferentes com o mesmo nome
  de frame. Corrigido com dois Maps separados por plataforma
  (`_dscFrameToA11yMapWeb`/`_dscFrameToA11yMapMobile`), consultados só
  depois de a origem do componente já ser conhecida.
- Princípio "origem filtra tudo" firmado explicitamente pelo usuário:
  mobile/web declarado deve filtrar todo catálogo/matching, manual ou
  automático — o dropdown manual e o scan automático ainda não respeitavam
  isso plenamente antes desta sessão.

### Wrapper mobile real corrigido

- **Bug real**: a key usada para importar o wrapper mobile do card de spec
  (`[a11y mob] Box specs leitor de tela`) era a key do COMPONENT_SET
  (família), não de uma variante individual —
  `figma.importComponentByKeyAsync` exige key de COMPONENT. Corrigido
  usando as 3 keys reais das variantes (Elementos e imagens / Títulos /
  Elementos decorativos), extraídas via API.
- **Bug real de preenchimento de texto**: o toggle BOOLEAN ligava
  corretamente, mas o texto da sub-instância continuava sendo o
  placeholder publicado da lib, nunca o valor digitado. Causa raiz: a
  busca por TEXT node usava o nome de camada (`/descri/i` etc.), mas a
  árvore real usa INSTANCEs aninhadas com TEXT filhos genéricos
  ("Label"/"Text"). Corrigido com um helper que busca a INSTANCE pelo
  próprio nome, e preenche via `setProperties` na property `Texto` da
  sub-instância — mesmo padrão já usado para "Link do Componente".
- **Distinção selo de ITEM de tabulação vs. selo de ÁREA**: revisão de uma
  conclusão anterior errada. `[a11y mob] Número da tela` desenha um
  `Connector` (linha até a borda do frame) — correto para o selo de Área
  Marcada. `[a11y mob] Ordenação` não desenha conector, só número + ícone
  de seta — é o componente correto para o selo de item de Ordem de
  Tabulação, confirmado pelo usuário e pela estrutura real via API.

### Elementos e Imagens — consolidação do campo Nome Acessível

- **Mobile primeiro**: o campo "Nome acessível" existia duplicado (toggle
  dentro de "Campos exclusivos mobile" e campo "Label" do topo), ambos
  alimentando o mesmo `accessibilityLabel`. O toggle mobile foi removido;
  "Label" do topo passou a ser a única fonte.
- **Depois, mesmo padrão aplicado ao desktop/web**: o checkbox dinâmico
  "Nome Acessível" (renderizado a partir da property BOOLEAN real do
  componente DSC) também duplicava o campo "Label" do topo. Filtrado fora
  da lista de toggles renderizados; o payload passou a injetar o valor do
  Label automaticamente em `properties[]` para todo componente, mesmo os
  que não têm a property real (seguro porque o backend já ignora
  properties dinâmicas sem `toggleDef` correspondente).

### Ordem de Tabulação

- **Sections dedicadas**: criada uma segunda Section no canvas
  ("hac — Ordem de Tabulação"), separada da Section de specos, para
  conter as cópias de frame e selos de tabulação — evita misturar
  visualmente dezenas de selos de spec com cópias inteiras de tela no
  painel de Layers.
- **Réplica da área criada e focada antes de marcar**: corrigido bug em
  que a varredura de posição livre só conhecia o que o próprio hac tinha
  injetado, deixando outras telas do designer na mesma página invisíveis
  para o cálculo — a "faixa livre" podia cair em cima delas. Agora a
  varredura considera todos os nodes de topo de nível da página.
- **Bug real corrigido no modo manual**: o `nodeId` capturado no clique
  (sobre a cópia clonada, que é o que fica focado na tela) era tratado
  como se fosse o id do frame original em toda a cadeia — causando 100%
  de "elemento não encontrado" ao aplicar qualquer sessão manual
  (reproduzido com 23 de 23 itens). Corrigido com tradução
  clone→original antes de repassar ao frontend.
- **Modo automático também passou a criar e focar a cópia desde o início**
  do fluxo (antes, só criava como fallback tardio dentro de "Aplicar no
  Canvas" — o designer via/clicava sobre a área original o tempo todo
  durante a revisão).
- **Falhas silenciosas corrigidas**: o handler do modo automático rodava
  fora de um try/catch único, então uma rejeição não prevista (ex.
  `root.clone()` falhando) virava unhandled rejection silenciosa — o
  toast inicial ficava para sempre sem o modal de revisão abrir e sem erro
  visível. Também corrigido: falha de import de componente e falha de
  carregamento de fonte no fallback procedural não logavam nada, dificultando
  diagnosticar qualquer selo ausente (fantasma ou real).
- **Decisão revertida**: uma tentativa de bloquear cliques em elementos
  "não reconhecidos como acionáveis" no modo manual foi implementada e
  revertida no mesmo dia — o reconhecimento automático falhava em casos
  reais visíveis, e travar o designer causava mais dano (impedir
  documentação correta) do que benefício. Decisão final: qualquer clique
  no modo de captura entra direto na lista, sem checagem.

### Wizard de revisão da Detecção Automática

- Substituiu, em 31/08/2026, o antigo loop de criação em lote sem revisão
  — todo item detectado passa por confirmação individual.
- **Correção de categoria durante a revisão**: adicionado um seletor
  inline para trocar a categoria sugerida sem sair do wizard.
- **Paginador reformulado no mesmo dia**: a navegação deixou de ser
  estritamente sequencial (botões numéricos clicáveis por posição) e
  passou para o formato "Voltar [ campo numérico ] Avançar", com
  navegação livre por índice e sinalização de status (Documentado/
  Descartado) só no item atual.
- **Foco automático no canvas** ao trocar de item — antes, avançar pelo
  wizard trocava o formulário sem mover a viewport, obrigando clique manual
  em "Focar" a cada item.
- **Snackbar de retomada**: fechar o modal sem confirmar/cancelar
  explicitamente (X, backdrop, Esc) oferece um botão "Continuar revisão"
  que dispara um novo scan da área e retoma o wizard direto, sem exigir
  que o designer veja o resumo de novo. Cancelar explicitamente não
  oferece essa opção.

### Vazamento de dados entre arquivos não salvos

Uma chave de fallback fixa (`hacData:unsaved`) usada para arquivos Figma
ainda não salvos causava vazamento real de dados entre projetos/clientes
diferentes: como o `clientStorage` do Figma é escopado por instalação do
plugin (não por arquivo/aba), todo arquivo não-salvo lia e escrevia na
mesma chave — abrir um segundo arquivo não-salvo carregava os dados do
primeiro. Corrigido: a chave de storage passa a ser `null` nesse cenário
(sem persistência até o arquivo ganhar um `fileKey` real no primeiro
save). Consequência aceita: fechar o plugin no meio do trabalho num
arquivo nunca salvo perde o progresso da sessão — preferível a corromper
silenciosamente dados de outro projeto.

### Responsividade dos modais em zoom da UI

- **Bug real**: todo modal do hac usava `position: fixed`, que não cria
  novo containing block sob `zoom` (usado para os 3 níveis de escala da
  UI). O box do modal nascia do tamanho do viewport real e era escalado
  de novo pelo zoom do body, ficando maior que a área visível em qualquer
  escala acima de 100% — cortado, sem scroll. Corrigido trocando `fixed`
  por `absolute` em todos os modais/overlays, com `body` ganhando
  `position: relative`.
- **Bug real adicional, mesmo dia**: mesmo após essa correção, 5 modais
  ainda limitavam a própria altura com `max-h-[85vh]`/`max-h-[92vh]`
  (unidade de viewport real, dessincronizada do body reescalado) — o card
  podia nascer mais alto do que cabia, cortando o rodapé de botões para
  fora da área rolável. Corrigido trocando por `max-h-full`.

### Limites de caracteres

Todo campo de texto livre do formulário passou a ter `maxlength` e
contador visível de caracteres.

---

*Entradas anteriores a 2026-08-24 pertencem ao histórico do plugin Handex
(produto de origem, antes da extração do hac) e não são replicadas aqui.*
