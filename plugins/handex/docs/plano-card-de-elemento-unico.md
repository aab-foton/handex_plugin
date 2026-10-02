# Plano: card de elemento único na Ficha (aprovado em 2026-10-02, NÃO implementado)

Status: direção aprovada pelo Augusto; implementação aguardando liberação do limite de uso dos agentes (volta em 2026-10-05). Este documento é a referência para retomar sem reabrir a discussão.

## 1. Decisão

A Ficha passa a ser organizada **por tela**. Cada elemento tem **um card só**, que junta o que vem do Escanear Tokens (construção) com o que vem da Spec Detalhada (decisões do designer).

As ferramentas continuam separadas no plugin e uma municia a outra:
- Escanear Tokens refina o elemento e alimenta a **construção** (como construir).
- Spec Detalhada dá as **decisões** (categoria, nota, link, exceções) e a posição no mapa.
- O que se unifica é a **unidade apresentada na Ficha**, não as ferramentas nem os dados persistidos.

Padrões aprovados:
1. A seção "User Interface" separada deixa de existir. Os cards ficam dentro da tela de cada elemento, com um índice curto "Elementos a construir" no topo da Ficha.
2. Todo card nasce no nível **Essencial**; o **Completo** é escolhido pelo designer (`uiDepth`, como já funciona).
3. Elemento do DSC **conforme** com spec e **sem** "Vai para a Ficha": o card traz só as decisões (a lib já documenta a construção). Se o designer marcar "Vai para a Ficha", ganha a construção.

Decisões anteriores preservadas: coluna única de 1080px (872 úteis); só itens `isMarkedCustom` geram construção, exceto o caso 3 acima (spec sem marcação lê a construção do próprio elemento); exceções só atreladas à spec; paleta só da lib DSC | Fundamentos Visuais (exceção: cores das categorias de spec); vocabulário técnico do Figma/dev em inglês, comunicação em português; Essencial × Completo conforme `BUSINESS_RULES.md`.

## 2. Por que (evidência dos prints de 2026-10-02, elemento "Tab 1")

- ~90% das propriedades da spec (Height, Width, auto layout, eixos, gap, padding, borda, sizing) já existem no card User Interface, melhor: padding por lado, token + valor.
- Só o card User Interface traz: base na lib, imagem do elemento, posição da borda, **interações** (hover → selected=true), composição, component properties.
- Só a spec traz: categoria, nota, exceções e o mapa (contorno + letra na tela).
- A spec marcada "Comportamento" não descreve comportamento nenhum; o hover só aparece no card User Interface.
- Defeitos só da spec: padding condensado ("0px 16px" com tokens juntos), `Component` repetindo as variantes em 3 linhas, selo A cobrindo o início do texto, mapa só da tela inteira, nomes de token com e sem prefixo `dsc/`.

## 3. Estrutura alvo da Ficha

```
Informações Básicas · Equipe · Briefing · Regras
Elementos a construir (índice curto: nome · tela · nível)
Por tela (frame):
  [Título da tela]
  Mapa: tela com contornos e letras  (+ recorte do elemento quando for grande)
  Card de elemento (um por elemento):
    Cabeçalho: nome · selo da categoria · base na lib · nível (Essencial|Completo)
    Decisões do designer: nota · link · exceções (cor por tipo)
    Construção (se aplicável): Resumo · Layout · Aparência · Texto · Interações · Composição · Configuração
  Medidas da tela
Specs avulsas / Medidas avulsas (blocos já existentes)
Fluxos
```

Casos por elemento:

| Situação | Card |
|---|---|
| Marcado, sem spec | construção |
| Marcado, com spec | construção + decisões |
| Sem marcação, com spec | decisões + construção lida do elemento |
| DSC conforme, com spec, sem marcação | só decisões |

## 4. Fases

Cada fase fecha com `bundle:ui`, `bundle:code`, `export:plugin`, teste do Augusto no Figma, documentação sincronizada e commit. Não começar uma fase sem a anterior validada.

### Fase A: casamento spec ↔ elemento (leitura, sem mudar a Ficha)
- Item do scan guarda `nodeIds[]` (todos os nós do mesmo `_dedupKey`, limite ~50) além de `nodeId`.
- Função de casamento: `spec.targetNodeId` → item por igualdade em `nodeIds`; senão sobe por `parent` até achar item marcado ou chegar ao frame (`getNodeByIdAsync`, memoizado, sem `findAll`, só na geração da Ficha).
- Várias specs no mesmo item: ordem por letra. Spec sem item dono: segue sozinha. Em dúvida, **não anexar** (falso positivo é pior que ausência).
- Entrega de valor: indicador no item do scan ("tem spec") e na spec ("veio do scan"), sem mudar a Ficha ainda.
- Esforço 1 a 1,5 dia. Risco: dedup por nome e frames antigos sem `nodeIds` (cair na subida pelo parent).

### Fase B: card de elemento no backend (substitui `_hdBuildUiItemCard` + `_hdBuildSpecsSubgroup` na saída)
- Novo construtor `_hdBuildElementCard(item?, specs[], level)` reaproveitando `_hdUi*`/`_readNodeSpec` (leitor único já existente). Cabeçalho, decisões no topo, construção por nível.
- Os 4 casos da tabela da seção 3. Caso "só decisões" para DSC conforme.
- Recorte do elemento como imagem (reaproveitar `_hdUiReferenceImage`; teto de 12 imagens por geração).
- Selo da letra sem cobrir o texto (offset do contorno).
- Esforço 2 a 3 dias. Risco: regressão do card User Interface atual e da Documentação Visual; manter ambos atrás de uma flag até validar.

### Fase C: Ficha por tela
- `_hdRebuildDocumentacaoVisualSection` passa a emitir, por frame: mapa + cards de elemento + medidas. Remove a seção `[Seção] User Interface` e deixa o índice "Elementos a construir".
- `insert-ficha-section` ('tokens' e 'specs') passam a reconstruir a mesma seção por tela (uma função só), sem duplicar lógica de idempotência (lição de `insert-frame-in-ficha`).
- `_hdRemoveUiColumns`/`_hdReplaceSection` removem a seção User Interface de Fichas antigas ao regenerar.
- Esforço 2 dias. Risco: Ficha longa com muitos elementos (padrão Essencial mitiga); posição fixa da Ficha e "Nova Versão" já tratadas (`_fichaBasePosition`).

### Fase D: Spec Detalhada com a mesma estrutura na tela do plugin
- Modal de propriedades e card da spec no canvas usam os grupos do leitor único (Layout/Aparência/Texto...), com `key` estável, aliases para dados antigos, padding por lado, `Component` sem repetir variantes.
- A conversão Rápida→Detalhada já leva a observação como nota e lê o elemento convertido (feito em 2026-10-01).
- Escolhas por elemento: grupos, **composição só se ligar, até o último nível** (teto de nós ~150 com aviso visível "o aprofundamento automático pode demorar"), **component properties só se o designer marcar**.
- Esforço 1 a 2 dias.

### Fase E: Re-check
- Assinatura (hash) das propriedades exibidas por elemento; comparação ao abrir a tela, antes de gerar a Ficha e por botão "Re-check" por card e "Re-check todos".
- Valores atualizam sozinhos; decisões do designer nunca; só avisar ("Atualizado desde [data]" + lista do que mudou + "Entendi"). Sem `documentchange` contínuo (risco de loop e de travar o arquivo).
- Mensagens novas: `recheck-nodes` (UI→backend) / `recheck-result` (backend→UI). Esforço 1 a 2 dias.

## 5. Dados e exportações

- Sem bump de `_schemaVersion`. Campos novos opcionais: `item.nodeIds`, `item.readConfig`, `item.lastRead`; migração de leitura de `uiDepth` mantida.
- `createdSpecs[].properties` continua como foto de criação (specs antigas); passa a ser atualizada só por um Re-check aceito.
- Markdown, Ficha HTML e `_aiContext` seguem completos e atrelando exceções à spec; acompanhar a nova unidade (um registro por elemento: decisões + construção resumida). A assimetria "card ≠ export" continua documentada.
- Docs a sincronizar em cada fase: `BUSINESS_RULES.md` (2.4, 2.7, 2.8, Card User Interface), `docs/site/business-rules.html`, `DATA_MODEL.md`, `docs/site/data-model.html`, `onboarding.js`, `guide.html`, `CHANGELOG.md`, `CLAUDE.md`.

## 6. Riscos transversais

- Casamento incorreto (spec no elemento errado): sempre preferir não anexar.
- Regressão de leitura de tokens ao trocar a saída (o leitor único e os fixes de `paint.boundVariables`/`topLeftRadius`/espessura por lado devem ser preservados).
- Componente principal de lib remota pode não expor `boundVariables`: comparar tokens por **chave** (regra assimétrica da Fase 5b).
- Perda silenciosa de dados: `save-storage` agora avisa em falha; **exportar o JSON antes de cada fase**.
- `code.js` já passa de 8.000 linhas: o construtor novo entra como bloco delimitado.

## 7. Pendente antes de começar

- Validação do Augusto das mudanças de 2026-10-01/02 ainda sem commit (ver lista no relatório da sessão) e commit de checkpoint.
- Confirmar no Figma: Tag sem chip "Necessita revisão"; borda por lado sem falso positivo no `[dsc] Card`; exceção criada na modal de sequência aparece no card do canvas.
