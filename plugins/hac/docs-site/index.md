---
layout: home
title: Início
nav_order: 1
---

# hac — Handoff de Acessibilidade CAIXA

O **hac** é um plugin do Figma que permite a designers documentar requisitos
de acessibilidade diretamente sobre as telas de um projeto, gerando um
handoff estruturado para as equipes de desenvolvimento. Ele reconhece,
sempre que possível, os componentes reais do Design System da CAIXA (DSC)
usados na tela, e vincula a documentação de acessibilidade ao próprio
componente oficial — em vez de depender de anotações soltas.

O hac nasceu em agosto de 2026 como uma extração da funcionalidade de
acessibilidade do plugin Handex Beta, tornando-se um produto independente.
Desenvolvido pela Fóton para a CAIXA.

## Documentos disponíveis

- **[Documentação Técnica](tecnico.html)** — como o plugin está estruturado
  por dentro: schema de dados, contrato de mensagens entre interface e
  backend, as 5 categorias de especificação, o matching entre componentes
  DSC e categorias de acessibilidade, a Ordem de Tabulação, organização do
  canvas em Sections, e o histórico de decisões de arquitetura (o que foi
  tentado, revertido, e por quê). Público-alvo: quem for dar manutenção ou
  continuidade ao código.

- **[Regras de Negócio (Institucional)](institucional.html)** — o mesmo
  conteúdo, em linguagem acessível a públicos não técnicos, para validação
  pela vertical de Acessibilidade da CAIXA. Cada regra está marcada como
  **já decidida** ou **pendente de validação técnica**.

- **[Design System da Interface](design-system.html)** — a linguagem visual
  própria da interface do plugin hac: cores, tipografia, ícones, e os
  padrões de componentes (modais, cards, badges, toggles) reutilizados nas
  telas do plugin. Não deve ser confundido com o DSC da CAIXA (que o plugin
  referencia como fonte de componentes reais) — este documento é sobre a UI
  do próprio hac.

- **[Changelog](changelog.html)** — diário de bordo do projeto: decisões
  técnicas, bugs reais corrigidos e mudanças de arquitetura, em ordem
  cronológica. Enquanto a Documentação Técnica descreve o estado atual do
  sistema, o Changelog registra como ele chegou lá.

## Este site é a fonte de verdade

A partir de 02/09/2026, a documentação técnica do hac (Documentação
Técnica + Changelog) passa a ser mantida **primeiro aqui**, neste site —
não mais em arquivos locais do repositório. Atualizações de arquitetura,
bugs corrigidos e decisões de produto devem ser registradas direto nas
páginas deste site.

## Repositório

Código-fonte em [github.com/aab-foton/hac_plugin](https://github.com/aab-foton/hac_plugin)
(privado).
