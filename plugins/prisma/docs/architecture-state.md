# PRISMA (ex-AMUX) — Estado da Arquitetura e Histórico

> **Nota de rebrand (2026-08-04):** o plugin foi renomeado de AMUX para
> **PRISMA** (Plataforma de Revisão e Inspeção da Maturidade UX). O texto
> abaixo preserva o histórico factual sob o nome antigo onde é narrativo
> (decisões passadas, incidentes) — só as referências técnicas atualmente
> vigentes (storage key, canvas prefix, nome de pasta) foram corrigidas.
> Este documento também está desatualizado em conteúdo além do nome
> (schema real já é v5 com 5 etapas + Teste de Usabilidade, catálogo tem
> 25 frameworks) — não reflete o estado atual do projeto além do rebrand.

Documento vivo mantido pelo agente `architecture-guardian`. Lido no início de qualquer sessão/tarefa nova neste projeto — inclusive sessões do Claude Code abertas diretamente em `plugins/amux` (caminho físico da pasta, ainda não renomeado — ver nota de rebrand acima), que não têm acesso à memória de sessões anteriores abertas em outros diretórios (ex: a sessão que criou este plugin foi aberta em `plugins/handex`).

---

## Origem do projeto (2026-07-28)

O AMUX nasceu como reestruturação do plugin **Maturai UX** (`plugins/maturai-ux`, hoje removido). O Maturai UX era um "injetor de frameworks de UX": um catálogo de 18 templates (Matriz CSD, 5 Porquês, Personas, Jornada, Blueprint de Serviço, etc.) que o designer inseria no canvas do Figma e depois escaneava de volta para coleta estruturada.

O briefing do projeto real — **"Auditoria de Maturidade UX"**, cliente CAIXA Econômica Federal — pedia algo bem diferente: um plugin que avalia a **maturidade do processo de UX** por trás de um produto (não só o protótipo visual), cobrindo:

1. Aderência ao Design System CAIXA (DSC)
2. Conformidade com diretrizes de Acessibilidade (WCAG)
3. Evidências das 4 etapas de UX: **Descoberta** (pesquisas, benchmarks, entrevistas), **Definição** (briefings, jornadas, hipóteses), **Ideação** (wireframe, protótipo de alta e navegável), **Validação** (testes de usabilidade, métricas, evidências)

O resultado esperado é uma pontuação gamificada de 1 a 5 estrelas, calculada com apoio de **agentes de IA orquestrados via Microsoft Azure AI Foundry** — múltiplos agentes especializados, cada um respondendo por uma dimensão da avaliação, não um prompt único monolítico.

### Decisão de produto tomada

Em vez de descartar o Maturai UX, ele foi **evoluído**: a pasta foi renomeada de `maturai-ux` para `amux`, a feature de auditoria (nova, central) foi construída ao lado da feature de frameworks (mantida como ferramenta auxiliar, sem mudança de lógica). Nada do que já funcionava foi jogado fora.

---

## Onde o AMUX vive (Git)

- **Repositório**: `D:\Fóton\Plugins\Plugins Git` (raiz do monorepo — o mesmo repo do Handex, `dsc-a11y-handoff`, `responsivUX`, `ux-brain` etc., cada um como pasta própria em `plugins/`).
- **Branch**: `main`. **O AMUX não tem branch própria** e não é acoplado a nenhuma branch do Handex (nem `main`, nem `beta/v4.3-melhorias-operacionais`) — são produtos distintos, apesar de terem nascido/sido versionados juntos na mesma sessão de trabalho.
- **Remotos**: `origin` (GitHub, `github.com/aab-foton/handex_plugin`) e `gitlab` (`gitlab.foton.la/caixa-design/design-foton`, principal). Ambos sincronizados em `main` a partir do commit `3b6225d` (2026-07-28).
- **Estrutura de pastas irmãs em `plugins/`** (todas na `main`, sem relação de branch entre si):
  ```
  plugins/
  ├── handex/         → Handex stable (v6.1.0)
  ├── handex-beta/     → Handex beta apartado (v6.0.0-beta.1, feature de a11y)
  └── amux/            → este projeto
  ```

## Incidente conhecido: perda e recriação dos agentes `.claude/agents/`

**O que aconteceu (2026-07-28):** ao mover o conteúdo do AMUX da branch beta do Handex (onde ele tinha sido commitado primeiro, por engano de contexto) para a `main`, foi necessário limpar (`rm -rf`) e recriar `plugins/amux/` via `git archive`. Como `.claude/` é ignorado globalmente pelo `.gitignore` do repositório, os 8 arquivos de agentes especializados **não estavam versionados em nenhum commit** — só existiam no disco local. O `rm -rf` apagou esses 8 arquivos, e eles precisaram ser recriados manualmente a partir do texto já gerado na conversa.

**Lição registrada** (também documentada em `qa-plugin.md` e `architecture-guardian.md` do AMUX): antes de qualquer operação destrutiva em `plugins/amux/` (checkout de outra branch sobre o mesmo path, `rm -rf`, `git archive` para "resetar" a pasta), verificar se `.claude/agents/` tem conteúdo a preservar — não é recuperável via Git.

---

## Arquitetura técnica

Mesmo pipeline de build do Handex: `code.js` (fonte) → esbuild → `code.bundle.js` (gerado); `modules/*.js` + `views/*.html` → `build.cjs` → `ui.html` (gerado). Frontend sem módulos ES — tudo concatenado em um `<script>` só, escopo global compartilhado em runtime.

### Backend (`src/plugin/code.js`)
- Storage key: `prisma-data` (clientStorage; era `amux-data` antes do rebrand). Canvas prefix: `[PRISMA]` (era `[AMUX]`). `setSharedPluginData` namespace: `'prisma'` (era `'maturai'`, herdado do Maturai UX até o rebrand).
- Handler novo: `analyze-with-ai` → chama `analyzeWithFoundry(payload)` de `src/plugin/ai/foundry-client.js` → responde `ai-analysis-complete` ou `ai-analysis-error`.
- `injectFramework()` / `scanFrameworks()`: herdados do Maturai UX, lógica intacta.

### Camada de IA (`src/plugin/ai/foundry-client.js`)
- **100% mock nesta fase.** `analyzeWithFoundry(payload)` simula latência e retorna notas plausíveis por dimensão, mas a assinatura de entrada/saída já segue o contrato que um endpoint real do Azure AI Foundry precisaria respeitar.
- 6 dimensões avaliadas (`AMUX_AI_DIMENSIONS`): `descoberta`, `definicao`, `ideacao`, `validacao`, `designSystem`, `acessibilidade`.
- Cálculo de estrelas (`_starsFromScore`) é um corte fixo placeholder, **não validado** com os stakeholders CAIXA (Leandro, Edmon, UX Leads, Débora Paganini, Andrea de Almeida).
- Fora de escopo até novo alinhamento: chamada de rede real ao Foundry, upload de artefato binário real, fórmula definitiva de peso por dimensão.

### Schema de dados (`amuxData`, `_schemaVersion: 1`)
```
briefing        → campos do briefing estruturado CAIXA (comunidade, produto, visão geral, objetivos, público-alvo, stakeholders...)
evidencias      → { descoberta, definicao, ideacao, validacao }, cada uma com artefatos[] (referência/link, sem upload binário) + observações
auditoria       → { designSystem, acessibilidade }, cada uma com status/observações/desvios — declaração humana
aiAnalysis      → { status, lastRunAt, agentResponses, scoreBreakdown } — populado pelo retorno do foundry-client
score           → { numeric, stars, computedAt } — derivado de aiAnalysis
frameworks[]    → herdado do Maturai UX, schema inalterado
```

### Frontend (`src/plugin/modules/`)
- `core.js` — estado global, navegação, persistência, tema, toasts.
- `messages.js` — dispatcher único de `window.onmessage`.
- `audit.js` (novo) — as 4 etapas de evidência + toggles DSC/acessibilidade.
- `ai-client.js` (novo) — ponte com `analyze-with-ai`, isola toda lógica de "chamar IA" do resto do frontend.
- `frameworks.js` — herdado, só rebranding de nomenclatura/cor.

### Telas (`src/plugin/views/`)
`home.html`, `briefing.html`, `audit.html` (novo), `score.html` (novo), `frameworks.html`, `collected.html`, `guide.html`, `modals.html`.

### Identidade visual
Cor de marca `blue`/`#2563eb` (trocada do `emerald`/`#059669` original do Maturai UX). Ícones Lucide, Tailwind via CDN.

---

## Agentes especializados (`.claude/agents/`, não versionados — ver incidente acima)

| Agente | Domínio |
|---|---|
| `backend-plugin` | `code.js`, bundling, handlers de mensagem |
| `frontend-ui` | `modules/*.js`, `views/*.html`, build.cjs |
| `ai-orchestration-specialist` | Contrato com `ai/foundry-client.js`, desenho dos agentes Foundry, dimensões avaliadas |
| `m365-integration-specialist` | Autenticação Microsoft/Azure, Power BI, transporte de dados fora do Figma |
| `data-schema-guardian` | Schema `amuxData`, migração, exportação, integração futura com Handex |
| `design-ux` | Visual/UX das telas, hierarquia de informação do score |
| `qa-plugin` | Revisão de mudanças, riscos conhecidos, roteiro de teste manual |
| `architecture-guardian` | Mapa de dependências, modularidade, este documento |

---

## Integração futura com o Handex (ainda não implementada)

Confirmado como objetivo pelo usuário, mas **nenhuma ponte de dados existe ainda**. Ponto de integração mais óbvio: `handoffData.frames[].audit` (Handex, declaração de conformidade DSC por frame) e `amuxData.auditoria.designSystem` (AMUX, declaração por projeto) respondem à mesma pergunta em granularidades diferentes — uma integração futura deveria avaliar se o AMUX pode **ler** dados já declarados no Handex em vez de coletar tudo de novo, ao invés de tratá-los como sistemas totalmente isolados.

## O que fica fora do escopo (não implementar sem alinhamento explícito)

- Chamada de rede real ao Azure AI Foundry (endpoint, autenticação, quais agentes existem de fato)
- Upload real de artefato binário como evidência
- Scan automatizado de tokens DSC (Handex tem pipeline pronto; não foi portado)
- Checagem automatizada de acessibilidade
- SSO corporativo (Entra ID) dentro do plugin
- Exportação automática para Power BI
- Qualquer coisa que pressuponha tenant Azure/workspace Power BI definidos — o briefing do projeto real ainda tem campos como "(preencher)" e "Tempo: A definir"
