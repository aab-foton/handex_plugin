# Release notes — Figma Community

Texto pronto para colar no campo de descrição de cada publicação em Community → Manage → Publish new version. Mantido separado do `CHANGELOG.md` (que é técnico/interno) porque este é escrito para o usuário final do plugin, sem jargão de código.

---

## Version [preencher] — v6.34.0 (2026-10-01)

> Próxima publicação. Cobre tudo desde a 6.32.1 (versão hoje na Community). Número da "Version" da Community: [preencher] na hora de publicar.

### Texto curto para o campo "What's new"

```
Novo: Anotar Specs Rápidas - consulte as propriedades de um elemento e veja cada uma como card no canvas, ligado ao elemento por uma linha guia.
"Anotar Specs" agora é Anotar Specs Detalhadas, e a home explica quando usar cada uma.
Ficha: o card "User Interface" agora atualiza e mostra token e valor; "Nova Versão" nasce ao lado da Ficha mais recente.
Conformidade com o Design System mais rigorosa: variantes e tamanhos viram "não avaliado" e alterações feitas em instâncias do DSC aparecem em âmbar.
Correção: o plugin não prende mais o teclado do Figma.
ATENÇÃO: re-escaneie os frames já escaneados.
ATENÇÃO: algumas cores de conformidade vão mudar.
ATENÇÃO: a detecção de personalização é nova e pode mostrar mais itens em âmbar.
```

### Versão detalhada

**Novidades**

**Anotar Specs Rápidas**
Selecione elementos e consulte as propriedades deles na hora. Cada elemento vira um card no canvas, ligado a ele por uma linha guia. Lê só o elemento marcado, guarda as propriedades no próprio card (elas voltam ao reabrir o plugin) e permite converter o card em uma Spec Detalhada. Os cards podem ser ocultados no canvas e organizados em grade. As Specs Rápidas não entram na Ficha.

**Duas ferramentas de spec, com nomes novos**
"Anotar Specs" agora se chama Anotar Specs Detalhadas, e "Spec Express" virou Anotar Specs Rápidas. Os cards da home, o guia e as telas vazias explicam quando usar cada uma. Na home, a Rápida abre ao lado da Detalhada; se você já reordenou os cards, a sua ordem é mantida.

**Specs Detalhadas com mais informação**
Passam a incluir efeitos, tamanhos, componente e estilos, e o card mostra token e valor de cada propriedade.

**Ficha de handoff**
- O card "User Interface" agora é refeito ao usar "Atualizar Tokens na Ficha" (antes nunca atualizava). Traz um card por item marcado, com token e valor, e a composição interna do componente; o que já é do DSC aparece como "reutilizar, não construir".
- O Briefing agora é uma seção da Ficha, que continua em coluna única.
- "Nova Versão" agora nasce à direita da Ficha mais recente (antes podia sobrepor as anteriores a partir da 3ª versão).
- O aviso de frames sem item personalizado agora diz "Tudo parece estar dentro do DSC".

**Conformidade com o Design System**
- A biblioteca do DSC passa a ser a única fonte de verdade. Colocar "[dsc]" no nome da camada deixa de valer como vínculo.
- Variantes e largura/altura (sizing) deixam de mostrar check verde e passam a "não avaliado".
- Bordas de 1px e texto em CAIXA Std sem token deixam de ser aprovados automaticamente.
- Novo: detecção de personalização. Se uma instância do DSC foi alterada em relação ao padrão (token trocado, espaçamento, raio, borda, tipografia, efeito, tamanho fixo ou subcomponente trocado), ela aparece em âmbar com "padrão da lib". Texto, opções liga/desliga, variantes e visibilidade não contam como personalização.

**Correções e melhorias**

**Teclado do Figma preso**
O plugin podia prender o foco de teclado do Figma quando o mouse estava fora da janela dele. Corrigido.

**Canvas travado no modo de captura**
Ao usar as Specs Rápidas, o canvas podia ficar travado com o plugin aberto. Corrigido.

**Botão Limpar**
Agora considera também os dados das Specs Rápidas.

**Antes de atualizar, leia**
1. **Re-escaneie os frames.** Frames escaneados antes desta versão foram avaliados com as regras antigas e precisam ser escaneados de novo.
2. **Algumas cores de conformidade podem mudar.** Tamanhos (sizing) deixam de contar como acerto, bordas de 1px e texto CAIXA Std sem token deixam de passar, e "[dsc]" no nome não vale mais.
3. **A personalização é nova e pode gerar mais itens em âmbar.** Isso é esperado: o plugin agora aponta o que foi alterado em relação ao padrão da biblioteca.

**Ainda não incluído**
A indicação de personalização ainda não aparece nas Specs Detalhadas, nas Specs Rápidas nem na Ficha gerada no canvas.

---

## Version [preencher] — v6.8.0 (2026-08-28)

**Novidades**

**Modal rápida de Dados do Projeto**
O ícone 📋 no header principal agora abre uma janela rápida com Título, Versão, Status e Objetivo — edite sem sair da tela em que você está. Um botão leva direto para a tela completa quando precisar mexer em Equipe, Briefing, Regras ou Links.

**Toggles no Contexto de Negócio**
Briefing Estratégico, Regras de Negócio e HUs e Links de Referência agora têm um interruptor próprio — vêm ativados por padrão, e você pode desligar qualquer um deles quando não fizer sentido para o projeto, sem perder o que já preencheu.

**Limpar Briefing**
Novo botão para apagar todas as perguntas do Briefing de uma vez, com uma confirmação simples — não precisa mais remover pergunta por pergunta.

**Correções e melhorias**

**Especificação criada podia não aparecer na lista**
Em algumas sessões — geralmente depois de trocar de arquivo Figma ou excluir um frame com o plugin ainda aberto — uma nova especificação era criada normalmente no canvas, mas não aparecia na lista de "Anotar Specs" dentro do plugin. Corrigido — a especificação agora aparece sempre, mesmo nesses casos.

**Conformidade com o Design System volta a ser verificada automaticamente**
Na etapa "Escanear Tokens", cada item escaneado (componente, ícone, tipografia) agora mostra de novo se está "Em conformidade", "Necessita revisão" ou "Fora do padrão" em relação ao Design System CAIXA — com a contagem de propriedades em cada situação. O critério é rigoroso: um item sem token vinculado é tratado como fora do padrão, mesmo que você marque "Sem desvios" — só passa para "Em revisão" depois que você escreve uma justificativa no campo de observações.

**Botão de atualizar escaneamento mais fácil de encontrar**
Antes, o botão para re-escanear um frame só aparecia depois de declarar a conformidade — dificultando revisar e escanear de novo antes de decidir. Agora ele fica sempre visível, ao lado do título "Tokens Escaneados".

**Instruções de "Escanear Tokens" mais claras**
O onboarding e o guia "Como usar o plugin" foram reescritos para deixar explícito que o scan é um ponto de partida, não uma aprovação automática — cabe a você revisar cada item antes de declarar conformidade.

**Clique no canvas não trava mais o Tab dentro do plugin**
Depois de abrir um modal e clicar no canvas do Figma, o teclado podia ficar "preso" tentando voltar para o plugin em vez de navegar no Figma normalmente. Corrigido — clicar fora do plugin agora funciona como esperado, sem interferência do plugin.

**Rodapé da home reorganizado**
"Gerar Ficha de Handoff" agora ocupa a linha inteira, sozinho, como ação principal. Abaixo, os botões de Baixar, Importar e Limpar ficaram do mesmo tamanho, distribuídos lado a lado.

**Tela de resumo do Handoff reorganizada**
"Gerar Ficha" agora vem antes das opções de exportação, para que o que você exporta sempre reflita o que já foi gerado no canvas. Um aviso explica a diferença entre exportar em Markdown (para ler) e em JSON (backup completo, o único que pode ser reimportado depois).

**Instruções mais claras em Informações do Projeto**
O guia agora explica o "porquê" de preencher o Briefing Estratégico, as Regras de Negócio e HUs, e os Links de Referência — não só o "como".

**Nomenclatura corrigida**
"DSC" agora aparece corretamente como "Design System CAIXA" em todo o plugin.

---

## Version 11 — v6.2.0 (2026-08-04)

**Correções e melhorias**

**Especificação apagada não volta mais sozinha**
Ao excluir uma especificação e depois navegar para outra tela do plugin (ou reabrir o plugin), ela podia reaparecer na lista mesmo já tendo sido apagada. Corrigido — agora a exclusão é definitiva.

> Se você já tinha apagado alguma especificação antes desta atualização e ela ainda aparecer uma última vez, é só excluir novamente — a partir daqui ela não volta mais.

**Indicação visual no ícone de linhas do grupo de especificações**
O ícone que oculta/exibe as linhas de conexão de um grupo de especificações agora fica azul quando as linhas estão visíveis, no mesmo padrão do ícone de olho ao lado.

---

## Version 10 — v6.1.2 (2026-07-29)

**Novidade**

**Sugestão automática de tag ao criar especificação**
Ao criar uma nova especificação, o campo de tag já vem preenchido com a próxima letra disponível (A, B, C...), com base nas especificações já existentes no frame. Você continua podendo editar livremente — inclusive para criar sub-níveis como A1 ou B1.1 — a sugestão só poupa o trabalho de digitar do zero toda vez.

---

## Version 9 — v6.1.1 (2026-07-29)

> Publicada sem este texto colado no campo de release notes da Figma — ver nota no `CHANGELOG.md` v6.1.1. Reaproveitar aqui na próxima publicação, ou adicionar retroativamente se a Figma permitir editar a descrição de uma versão já publicada.

**Correções e melhorias**

**Especificações sem frame associado agora permanecem salvas**
Especificações criadas sem vincular a um frame específico podiam desaparecer da lista ao navegar entre telas do plugin. Corrigido — elas agora persistem normalmente, junto com as especificações vinculadas a frames.

**Ficha de handoff exportada sem mais duplicações**
A ficha HTML exportada podia mostrar a mesma especificação duas vezes em seções diferentes. Agora cada especificação aparece uma única vez.

**Importação de backup (JSON) mais confiável**
Ao restaurar um backup, especificações e medidas que não estavam vinculadas a um frame específico eram ignoradas — o resumo da importação mostrava contagem zerada e nada era recriado no canvas. Agora esses dados são reconhecidos e recriados corretamente.
