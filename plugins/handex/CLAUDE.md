# CLAUDE.md — Handex Handoff Express

Contexto de projeto para o assistente. Leia este arquivo antes de qualquer tarefa.

---

## Quem é o usuário

Augusto Brasil, Designer sênior de UX da Fóton, atuando no projeto da CAIXA Econômica Federal. Trabalha com sistemas de design (DSC — Design System Corporativo da CAIXA), handoff para desenvolvimento e ferramentas internas para o time de design. Não é desenvolvedor de formação — contexto técnico deve ser direto e sem jargão desnecessário.

---

## O que é o Handex

Plugin Figma que automatiza o handoff de design. Permite ao designer:
- Registrar frames e escanear tokens de UI contra o DSC
- Anotar specs técnicas sobre elementos do canvas
- Inserir medidas (padding, gap, width, height) no canvas
- Mapear fluxos de tela
- Gerar uma ficha técnica completa no canvas do Figma

**Versão atual:** v4.1.6  
**Documentação:** `BUSINESS_RULES.md` (regras de negócio) · `CHANGELOG.md` (histórico)

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

---

## Bugs corrigidos relevantes (contexto histórico)

- **`addFrame()` inicializava `audit` errado** — usava `{ status, justificativa }` mas o runtime espera `{ checkDone, semDesvios, observacoes, ressalvas }`. Corrigido em v4.1.4.
- **`setSvgColor` pintava o FRAME container do SVG** — `figma.createNodeFromSvg()` retorna um FRAME envolvendo VECTORs. A função aplicava cor no container, deixando tudo cinza. Corrigido para limpar fills do container e colorir só os nós folha.
- **`toggleFrameAccordion` buscava `frame-arrow-{id}`** — o HTML renderiza `frame-chevron-{id}`. Corrigido em v4.1.6.
- **`handoffData.docs` não inicializado no schema v2** — acessos como `handoffData.docs.proto.link` quebravam. Corrigido com null-guards.

---

## Convenções de código

- **Sem comentários** salvo quando o "porquê" é não óbvio
- **Sem tratamento de erro** para cenários impossíveis — só em boundaries externos
- Texto da UI sempre em **português brasileiro**
- Ícones: biblioteca **Lucide** (`data-lucide="nome"`)
- Estilo: **Tailwind v3** (classes compiladas via `bundle:ui`)
- Bordas dos botões: **`rounded-2xl`** em todo o plugin

---

## Estrutura da home (referência visual)

```
Header: [Logo CAIXA | HANDEX v4.x]  [📋]  [✈ Gerar Ficha]  [🔍]  [☀]  [⇱]

Grid 2×3 (flex-1, preenche altura disponível):
  [Como usar o plugin]   [Informações do Projeto]
  [Escanear Tokens]      [Anotar Specs]
  [Anotar Medidas]       [Fluxos de Tela]

Footer:
  [▶ Gerar Ficha de Handoff]
  [↑ Importar JSON]  [🗑]
```

---

## Distribuição

A pasta `handex-plugin/` (gitignored) contém os 3 arquivos para distribuição:
- `manifest.json` + `code.bundle.js` + `ui.html`
- Instalação: Figma → Plugins → Development → Import plugin from manifest
- Não requer npm install nem build

---

## Observações de processo

- Documentação técnica: `BUSINESS_RULES.md` + `CHANGELOG.md` — atualizar a cada versão
- Versão no `package.json` deve refletir a versão real do plugin
- O `_skeleton.json` das libs DSC precisa ser atualizado periodicamente via `npm run refs:update` (requer `FIGMA_TOKEN` no `.env`)
