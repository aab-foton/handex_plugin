---
layout: page
title: Regras de Negócio (Institucional)
nav_order: 3
permalink: /institucional.html
---

<style>
.badge-decidido, .badge-validar {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
  padding: 3px 10px;
  border-radius: 999px;
  margin-left: 6px;
  vertical-align: middle;
  white-space: nowrap;
}
.badge-decidido {
  background: #e3f5e8;
  color: #1e7b34;
  border: 1px solid #b8e6c4;
}
.badge-validar {
  background: #fdf1de;
  color: #b56a00;
  border: 1px solid #f7d9a8;
}
.regra-box {
  border-left: 3px solid #dde3ec;
  padding: 8px 14px;
  margin: 10px 0;
}
.doc-meta-table {
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0;
  font-size: 13px;
}
.doc-meta-table td {
  border: 1px solid #dde3ec;
  padding: 8px 12px;
}
.doc-meta-table td:first-child {
  font-weight: 700;
  width: 35%;
  background: #f8fafc;
}
</style>

# Regras de Negócio do Plugin hac

*Documento de referência para validação com a vertical de Acessibilidade.*

**Convenção de leitura**: cada regra está marcada como
<span class="badge-decidido">DECIDIDO</span> (já implementada e em uso) ou
<span class="badge-validar">REQUER VALIDAÇÃO DA VERTICAL DE ACESSIBILIDADE</span>
(comportamento já implementado, mas que depende de confirmação técnica da
vertical antes de ser considerado definitivo). Lacunas de informação estão
marcadas como *[preencher]*.

<table class="doc-meta-table">
<tr><td>Documento</td><td>Regras de Negócio — plugin hac</td></tr>
<tr><td>Elaboração</td><td>Fóton</td></tr>
<tr><td>Destinatário</td><td>Vertical de Acessibilidade — CAIXA <em>[preencher: nome/área específica]</em></td></tr>
<tr><td>Data de elaboração</td><td>02/09/2026</td></tr>
<tr><td>Versão do documento</td><td>1.0</td></tr>
</table>

## Sumário

1. [Apresentação e finalidade do documento](#1-apresentação-e-finalidade-do-documento)
2. [O que é o hac, em termos gerais](#2-o-que-é-o-hac-em-termos-gerais)
3. [As cinco categorias de documentação de acessibilidade](#3-as-cinco-categorias-de-documentação-de-acessibilidade)
4. [Web ou Mobile: uma decisão única por projeto](#4-web-ou-mobile-uma-decisão-única-por-projeto)
5. [De onde vêm os componentes reconhecidos pelo plugin](#5-de-onde-vêm-os-componentes-reconhecidos-pelo-plugin)
6. [Como uma especificação de acessibilidade é criada](#6-como-uma-especificação-de-acessibilidade-é-criada)
7. [Ordem de Tabulação (navegação por teclado)](#7-ordem-de-tabulação-navegação-por-teclado)
8. [Limites de caracteres nos campos de texto](#8-limites-de-caracteres-nos-campos-de-texto)
9. [Sugestão automática de preenchimento](#9-sugestão-automática-de-preenchimento)
10. [Observação sobre tratamento de dados](#10-observação-sobre-tratamento-de-dados)
11. [Glossário rápido](#11-glossário-rápido)

---

## 1. Apresentação e finalidade do documento

Este documento descreve, em linguagem acessível a públicos não técnicos, as
regras de negócio implementadas no plugin hac (Handoff de Acessibilidade
CAIXA), uma ferramenta para o Figma que permite a designers documentar
requisitos de acessibilidade diretamente sobre as telas do produto, gerando
um handoff estruturado para as equipes de desenvolvimento.

O objetivo é permitir que a vertical de Acessibilidade da CAIXA valide se
as regras aqui descritas refletem corretamente as diretrizes técnicas e de
conteúdo que devem orientar a documentação de acessibilidade nos produtos
digitais da instituição.

> Este é um documento de produto, mantido pela Fóton como fornecedora
> responsável pelo desenvolvimento do plugin. Ele não substitui nem tem
> valor normativo sobre as diretrizes de acessibilidade da CAIXA — pelo
> contrário, deve ser ajustado sempre que a vertical de Acessibilidade
> indicar divergência entre o que está implementado e o que é tecnicamente
> correto ou institucionalmente exigido.

## 2. O que é o hac, em termos gerais

O hac é um plugin do Figma. Ele funciona dentro do próprio arquivo de
design, permitindo que o designer marque, sobre as telas já desenhadas,
quais elementos precisam de atenção de acessibilidade e qual informação
sobre eles deve chegar ao desenvolvedor (por exemplo: qual texto
alternativo uma imagem deve ter, ou qual nome de leitor de tela um botão
deve anunciar).

O plugin reconhece automaticamente, sempre que possível, os componentes
reais do Design System da CAIXA (DSC) usados na tela — e vincula a
documentação de acessibilidade ao próprio componente oficial, em vez de
depender de anotações soltas sem padronização.

O hac funciona com projetos de dois tipos de plataforma: aplicações Web e
aplicações Mobile (aplicativo). Essa distinção é central em praticamente
todas as regras deste documento — ver seção 4.

## 3. As cinco categorias de documentação de acessibilidade

Toda marcação de acessibilidade feita pelo designer pertence a uma de
cinco categorias. Cada categoria tem um propósito e um conjunto de campos
de preenchimento próprio.

| Categoria | Para que serve | Existe versão mobile? |
|---|---|---|
| Elementos e Imagens | Componentes interativos (botões, campos, links) e imagens que precisam de nome acessível, descrição ou texto alternativo. | Sim — 3 formatos (Componente / Link / Texto Alternativo) |
| Estrutura da Página | Marcações de organização da página (regiões/landmarks) para navegação por leitor de tela. | Não há equivalente publicado ainda |
| Nível de Título | Hierarquia de títulos da página, para leitura estruturada por tecnologia assistiva. | Sim, de forma simplificada (sem níveis hierárquicos) |
| Elemento Decorativo | Sinaliza elementos puramente visuais que devem ser ignorados por leitores de tela. | Sim |
| Informações Adicionais | Campo de formato livre para observações que não se encaixam nas demais categorias. | Não há equivalente mobile definido |

*Nota técnica: as diferenças entre Web e Mobile citadas acima decorrem de
limitações reais dos componentes já publicados nas bibliotecas oficiais do
Design System — não são escolhas arbitrárias do plugin.*

## 4. Web ou Mobile: uma decisão única por projeto

Regra central do plugin, validada ao longo do desenvolvimento: um mesmo
arquivo Figma é tratado como Web OU Mobile, nunca os dois ao mesmo tempo.
Essa escolha é feita uma única vez (na primeira ação que precisa dessa
informação) e passa a valer para todo o projeto: catálogos de componentes
sugeridos, textos padrão e o componente visual do próprio selo de marcação
passam a vir sempre da biblioteca correspondente à plataforma escolhida.

<div class="regra-box">
A origem (Web/Mobile) é uma configuração do projeto inteiro, não de uma
tela ou elemento isolado. Pode ser alterada a qualquer momento pelo
designer, mas nunca fica "mista" dentro do mesmo arquivo.
<span class="badge-decidido">DECIDIDO</span>
</div>

<div class="regra-box">
Ao limpar o cache do plugin, essa escolha é apagada junto com os demais
dados do projeto — o designer precisa escolher novamente, como se fosse um
arquivo novo.
<span class="badge-decidido">DECIDIDO</span>
</div>

Essa regra evita um problema real observado durante os testes: um projeto
Mobile recebendo sugestões de componentes da biblioteca Web (ou
vice-versa), o que geraria documentação tecnicamente incorreta para a
equipe de desenvolvimento.

## 5. De onde vêm os componentes reconhecidos pelo plugin

O plugin trabalha com seis bibliotecas oficiais do Design System da CAIXA,
divididas em dois grupos com propósitos diferentes:

- **Quatro bibliotecas de reconhecimento** — Reconhecem e classificam os
  componentes que o designer já usou na tela, para sugerir automaticamente
  a categoria de acessibilidade correta: Web Angular & React, Super DSC
  Web, DSC Super App (mobile) e DSC Android (mobile).
- **Duas bibliotecas de "Design Acessível"** — São a fonte real dos selos
  e componentes de documentação que o plugin efetivamente insere no
  arquivo do designer: "Design Acessível" (versão Desktop/Web) e "Design
  Acessível | Super App" (versão Mobile).

<div class="regra-box">
Princípio geral: o plugin nunca cria um componente "inventado" quando
existe um componente real equivalente disponível na biblioteca oficial
correspondente à plataforma do projeto. Uma versão simplificada (não
vinculada à biblioteca oficial) só é usada em um conjunto restrito e
conhecido de situações em que ainda não existe um componente oficial
publicado para aquele caso específico.
<span class="badge-decidido">DECIDIDO</span>
</div>

<div class="regra-box">
Quando o plugin reconhece um componente do Design System que ainda não tem
uma categoria de acessibilidade definida (por exemplo, um card ou tooltip
sem especificação prévia), ele sinaliza esse componente como "Outro" na
tela de revisão do designer. Hoje isso é apenas um alerta visível ao
designer — não existe ainda um processo formal (fila, planilha ou
relatório) para que a vertical de Acessibilidade receba e trate esse sinal
de forma sistemática. Recomenda-se que a vertical avalie se deseja
formalizar esse fluxo.
<span class="badge-validar">REQUER VALIDAÇÃO DA VERTICAL DE ACESSIBILIDADE</span>
</div>

## 6. Como uma especificação de acessibilidade é criada

O plugin oferece dois caminhos para o designer documentar acessibilidade:

### 6.1 Caminho manual

O designer seleciona um elemento na tela e escolhe manualmente a categoria
de acessibilidade e os dados a preencher. Usado quando o designer já sabe
exatamente o que precisa documentar, ou quando o elemento não foi (ou não
pode ser) reconhecido automaticamente.

### 6.2 Caminho automático (Detecção Automática)

O plugin varre a tela (ou uma área marcada dela), identifica os
componentes conhecidos do Design System e apresenta um roteiro de revisão
item a item: para cada elemento encontrado, o designer confirma ou ajusta
a categoria e os campos sugeridos antes de a especificação ser
efetivamente criada.

<div class="regra-box">
Nenhum item é documentado automaticamente sem revisão do designer. O
plugin sugere; quem decide e confirma é sempre uma pessoa. Essa escolha
existe justamente porque o reconhecimento automático, embora bom, não é
(e não deve ser tratado como) infalível.
<span class="badge-decidido">DECIDIDO</span>
</div>

<div class="regra-box">
O designer pode cancelar a revisão a qualquer momento sem perder o que já
foi confirmado — apenas os itens ainda não revisados voltam para a lista
de pendentes.
<span class="badge-decidido">DECIDIDO</span>
</div>

## 7. Ordem de Tabulação (navegação por teclado)

Esta funcionalidade documenta em que ordem um usuário que navega por
teclado (ou tecnologia assistiva) deve percorrer os elementos interativos
de uma tela.

<div class="regra-box">
No modo manual, o designer pode clicar em qualquer elemento da tela para
incluí-lo na ordem de tabulação, sem nenhum bloqueio do plugin. Essa
decisão foi tomada após observar, em testes reais, elementos claramente
clicáveis (ex.: cartões, botões customizados) sendo rejeitados por um
mecanismo de reconhecimento automático que ainda não conhecia aquele
padrão específico de componente. Bloquear o designer nesses casos
impediria uma documentação correta — por isso, a responsabilidade final
pela ordem de tabulação é sempre do designer.
<span class="badge-decidido">DECIDIDO</span>
</div>

<div class="regra-box">
No modo automático, o plugin sugere uma ordem varrendo a tela e
identificando elementos reconhecidamente interativos (botões, campos,
links, abas, entre outros). Essa sugestão é sempre revisável e editável
pelo designer antes de ser aplicada — nunca é aplicada automaticamente
sem revisão.
<span class="badge-decidido">DECIDIDO</span>
</div>

Em nenhum dos dois modos a tela original do designer é alterada durante a
revisão: o plugin trabalha sobre uma cópia da tela, e só aplica as
marcações definitivas quando o designer confirma.

## 8. Limites de caracteres nos campos de texto

Todos os campos de texto livre do plugin têm um limite máximo de
caracteres, com um contador visível para o designer. Os limites foram
definidos com base na função de cada campo:

| Campo | Limite | Motivo |
|---|---|---|
| Tag de identificação (ex.: A1.1) | 8 caracteres | Mantém o formato de identificação curto e legível |
| Nome acessível (accessibilityLabel) | 100 caracteres | Deve descrever a função do elemento de forma objetiva |
| Descrição / Texto alternativo de imagem | 180–200 caracteres | Boas práticas de acessibilidade recomendam textos alternativos concisos |
| Observações | 400 caracteres | Espaço para contexto adicional sem virar um texto corrido extenso |
| Notas de Código | 500 caracteres | Orientações técnicas ao desenvolvedor, mais detalhadas |
| Dica para Leitor de Tela (hint) | 300 caracteres | Complementa o nome acessível sem repeti-lo |
| Link/nome do componente | 300 caracteres | Cobre tanto nomes digitados quanto endereços de referência |

## 9. Sugestão automática de preenchimento

Quando o plugin já identificou com segurança qual componente real do
Design System está sendo documentado, ele pré-seleciona automaticamente a
opção correspondente no campo de "Link do Componente" (no fluxo Mobile),
poupando o designer de procurar manualmente na lista.

<div class="regra-box">
O plugin não sugere automaticamente o texto do "Nome acessível" com base
apenas no tipo de componente (por exemplo, sugerir "Botão de ícone" para
todo Icon Button). Avaliação técnica: um nome acessível de qualidade
depende da função real do elemento naquela tela específica (ex.: "Buscar
cartão", "Fechar modal"), informação que o plugin não tem como inferir com
segurança hoje. Uma sugestão genérica correria o risco de ser aceita sem
revisão sob pressão de prazo, prejudicando a qualidade da documentação em
vez de ajudar.
<span class="badge-decidido">DECIDIDO</span>
</div>

<div class="regra-box">
Existe uma proposta em avaliação (ainda não iniciada) de, no futuro, o
plugin aprender com o histórico de confirmações dos designers para
melhorar suas sugestões ao longo do tempo. Essa proposta depende de
análise prévia de viabilidade técnica e de tratamento de dados
(privacidade), e não deve ser considerada uma funcionalidade em
desenvolvimento até essa análise ser concluída.
<span class="badge-validar">REQUER VALIDAÇÃO DA VERTICAL DE ACESSIBILIDADE</span>
</div>

## 10. Observação sobre tratamento de dados

O plugin não coleta nem armazena dados pessoais de usuários finais dos
produtos documentados — ele documenta requisitos de acessibilidade de
telas/design, não dados de saúde ou dados pessoais de pacientes/clientes.
Os dados manipulados pelo plugin (specs de acessibilidade, marcações de
tela) ficam armazenados localmente, associados ao arquivo do Figma.

<div class="regra-box">
Caso a proposta de aprendizado a partir do histórico de confirmações
(seção 9) avance, será necessária uma avaliação específica de privacidade
e de onde esse histórico seria armazenado, já que passaria a registrar
padrões de uso dos próprios designers.
<span class="badge-validar">REQUER VALIDAÇÃO DA VERTICAL DE ACESSIBILIDADE</span>
</div>

## 11. Glossário rápido

| Termo | Significado |
|---|---|
| DSC | Design System da CAIXA — conjunto oficial de componentes visuais reutilizáveis. |
| Handoff | Entrega estruturada de informações de design para a equipe de desenvolvimento. |
| Leitor de tela | Tecnologia assistiva que lê em voz alta o conteúdo de uma tela para pessoas com deficiência visual. |
| Texto alternativo (alt-text) | Descrição textual de uma imagem, lida por leitores de tela no lugar da imagem. |
| Nome acessível (accessibilityLabel) | Texto que um leitor de tela anuncia ao focar em um elemento interativo. |
| Ordem de tabulação | Sequência em que os elementos de uma tela recebem foco ao navegar pela tecla Tab ou por tecnologia assistiva. |

---

*Documento sujeito a revisão conforme validação técnica da vertical de
Acessibilidade da CAIXA. Divergências identificadas devem ser reportadas à
Fóton para ajuste do plugin e atualização deste documento.*
