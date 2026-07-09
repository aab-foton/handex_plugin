# Proposta: Handex como camada de evidência formal do handoff (2026-07-09)

> Status: **proposta estratégica, não priorizada para implementação imediata**. Nasceu da pergunta "o que nos deixaria à frente do Figma, não só evitando ficar atrás?". Reposicionamento de nível gestão/produto, não backlog operacional — ver `handex-operacional-designer-dev-2026-07.md` para a versão focada no dia a dia de designer/dev.

## Tese

Os problemas reais de handoff design→dev relatados pela indústria em 2025-2026 não são falta de anotação — Figma, Zeplin e Zeroheight já resolvem bem "colocar informação sobre um elemento". As dores que persistem sem solução boa em nenhuma ferramenta são: perda do "porquê" por trás de uma decisão, specs que ficam desatualizadas assim que o dev começa a implementar, e — em contexto regulado como a CAIXA — a falta de evidência formal e imutável de que o processo de aprovação aconteceu.

Nenhuma ferramenta de design genérica ataca essa última dor de propósito, porque nenhuma delas foi desenhada para compliance bancário/governamental. É um nicho estruturalmente defensável: copiar exigiria da Figma redesenhar sua proposta central (colaboração fluida, tudo editável), o que é improvável.

## As 5 apostas

### 1. Motivo obrigatório em exceções e ressalvas
Baixo esforço. `excecoes[]`/`ressalvas[]` já existem no schema; falta um campo obrigatório curto de "por que essa exceção existe", hoje texto livre opcional que na prática fica em branco.

### 2. Selo de evidência imutável (hash + timestamp) na Ficha exportada
Baixo-médio esforço. Hash SHA-256 (Web Crypto API, nativa) do conteúdo da ficha no momento da exportação, embutido no PDF/MD — qualquer alteração posterior fica detectável. Sem blockchain, sem infra nova. Não é assinatura digital juridicamente vinculante — é evidência de integridade.

### 3. Trilha de auditoria de sessão
Esforço médio. Log de eventos-chave (abertura do plugin, scan, declaração de auditoria, exportação de ficha) com timestamp e `figma.currentUser`, usando `setSharedPluginData` já implementado. Restrito a 5-8 tipos de evento com significado auditável — não log genérico de clique.

### 4. Confirmação obrigatória ao reexportar ficha já entregue
Esforço médio, depende do diff de versão (`previousSnapshot`, já existe em `handoff.js`). Um modal simples ao sobrescrever uma ficha já consumida pelo dev — não um processo multi-etapas.

### 5. Não fazer: workflow de aprovação multi-stakeholder
Linha vermelha deliberada. É a extrapolação óbvia das apostas acima e é onde a filosofia "handoff express" quebraria. Se a CAIXA precisar de aprovação formal multi-nível, a integração correta é exportar o selo de evidência (item 2) para um sistema de aprovação que já existe na CAIXA — não construir isso dentro do Handex.

## Por que isso não é o próximo passo operacional

Essas apostas reposicionam o *propósito* do produto (de "documentar handoff" para "provar que o handoff aconteceu corretamente") — decisão de médio/longo prazo, que exige alinhamento com stakeholders de compliance/governança da CAIXA antes de virar trabalho de engenharia. Não é o que um designer ou dev sente no dia a dia de uso da ferramenta. Ver o documento operacional complementar para isso.
