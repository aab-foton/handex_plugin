# Handex — Handoff Express · v3.0.0

Plugin Figma desenvolvido pela equipe de Design da CAIXA em parceria com a Fóton. Automatiza o processo de handoff de design, gerando fichas técnicas no canvas, escaneando specs de UI e auditando aderência ao Design System Corporativo (DSC).

---

## Sumário

- [O que o plugin faz](#o-que-o-plugin-faz)
- [Instalação no Figma](#instalação-no-figma)
- [Configuração de ambiente](#configuração-de-ambiente)
- [Scripts disponíveis](#scripts-disponíveis)
- [Fluxo de build](#fluxo-de-build)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Arquitetura da UI](#arquitetura-da-ui)
- [Guia por arquivo](#guia-por-arquivo)

---

## O que o plugin faz

| Funcionalidade | Descrição |
|---|---|
| **Handoff** | Formulário em 4 steps (informações, specs, detalhamento, revisão) que culmina em uma ficha técnica gerada diretamente no canvas do Figma |
| **Especificações** | Escaneia o frame selecionado e extrai propriedades por categoria: Componentes, Ícones, Tipografia, Frames, Vetores |
| **Auditoria DSC** | Compara as propriedades escaneadas contra os tokens das bibliotecas do Design System, exibindo % de aderência |
| **Medidas** | Anota dimensões (gap, padding, width, height) sobre os elementos selecionados no canvas |
| **Guia** | Documentação de uso inline para designers |

---

## Instalação no Figma

1. Abra o Figma
2. Menu → Plugins → Development → **Import plugin from manifest...**
3. Selecione `src/plugin/manifest.json`
4. O plugin fica disponível em: Plugins → Handex — Handoff Express

---

## Configuração de ambiente

```bash
# 1. Instale as dependências
npm install

# 2. Crie o .env com o token para buscar referências do DSC via API Figma
cp .env.example .env
# Preencha FIGMA_TOKEN no .env
```

---

## Scripts disponíveis

```bash
npm run bundle:ui      # Monta o ui.html completo (frontend do plugin)
npm run bundle:code    # Compila o code.bundle.js (backend do plugin)
npm run refs:fetch     # Busca style/component keys das libs DSC via API Figma
npm run bundle:refs    # Agrega os {slug}.json em _skeleton.json
npm run refs:rebuild   # refs:fetch + bundle:refs em sequência
npm run version:patch  # Incrementa versão patch (3.0.x)
npm run version:minor  # Incrementa versão minor (3.x.0)
npm run version:major  # Incrementa versão major (x.0.0)
```

> Após qualquer alteração em `src/plugin/`, rode `bundle:ui` e `bundle:code` antes de testar no Figma.

---

## Fluxo de build

```
1. npm run refs:fetch
   └─ Busca styles e component keys nas libs DSC via REST API do Figma
   └─ Requer FIGMA_TOKEN no .env
   └─ Gera: src/plugin/refs/{slug}.json para cada lib

2. npm run bundle:refs
   └─ Agrega todos os {slug}.json em um único skeleton compacto
   └─ Gera: src/plugin/refs/_skeleton.json (~900 KB)

3. npm run bundle:ui
   └─ Roda bundle:refs internamente
   └─ build.cjs agrega views HTML + módulos JS + CSS + Tailwind + Lucide + skeleton
   └─ Gera: src/plugin/ui.html (~1.3 MB — frontend completo do plugin)

4. npm run bundle:code
   └─ esbuild compila code.js + audit.js em bundle único
   └─ Injeta __HANDEX_VERSION__ com o valor de package.json
   └─ Gera: src/plugin/code.bundle.js (backend executado pelo Figma)
```

**Os dois artefatos entregues ao Figma são `ui.html` e `code.bundle.js` — ambos gerados, nunca editados diretamente.**

---

## Estrutura do projeto

```
plugins/handex/
├── package.json               # Versão, scripts de build, dependências
├── README.md                  # Este arquivo
├── .env.example               # Modelo de variáveis de ambiente
│
├── scripts/
│   └── bundle-code.cjs        # Script esbuild para gerar code.bundle.js
│
├── base/
│   ├── estrutura-plugin.html  # Documentação visual da estrutura (HTML)
│   └── Como_usar_o_repositório.pdf
│
├── src/
│   ├── main.tsx               # Entry point do app React de preview (não é o plugin)
│   ├── App.tsx
│   ├── index.css
│   ├── components/
│   │   ├── CodeViewer.tsx
│   │   └── PluginPreview.tsx
│   ├── hooks/
│   │   └── useVersions.ts
│   ├── utils/
│   │   └── downloadPlugin.ts
│   │
│   └── plugin/                # ← PLUGIN FIGMA (tudo que importa aqui)
│       ├── manifest.json      # Configuração do plugin para o Figma
│       ├── code.js            # Backend (FONTE — editar aqui)
│       ├── code.bundle.js     # Backend compilado (GERADO — não editar)
│       ├── ui.html            # Frontend completo (GERADO — não editar)
│       ├── audit.js           # Módulo compartilhado de auditoria (FONTE)
│       ├── build.cjs          # Assembler do ui.html
│       │
│       ├── modules/           # Fragmentos JS do frontend (concatenados no build)
│       │   ├── core.js        # Estado global, navegação, persistência, tema
│       │   ├── messages.js    # Dispatcher único de window.onmessage
│       │   ├── handoff.js     # Fluxo de handoff e criação da ficha no canvas
│       │   ├── specifications.js  # Scan, renderização de specs e props
│       │   ├── audit.js       # Auditoria DSC na UI
│       │   ├── measurement.js # Medidas e anotações no canvas
│       │   └── design-data.js # Dados de design e Code Connect
│       │
│       ├── views/             # Fragmentos HTML do frontend (inseridos no build)
│       │   ├── home.html      # Tela inicial com as 4 ferramentas
│       │   ├── handoff.html   # Fluxo de handoff (4 steps)
│       │   ├── specifications.html  # Tela de especificações
│       │   ├── measurement.html     # Tela de medidas
│       │   ├── guide.html           # Guia de uso
│       │   └── modals.html          # Todas as modais compartilhadas
│       │
│       ├── styles/
│       │   └── plugin.css     # Estilos customizados (complementa Tailwind)
│       │
│       └── refs/              # Referências do Design System Corporativo
│           ├── _manifest.json         # Lista curada das libs DSC (FONTE DE VERDADE)
│           ├── _skeleton.json         # Bundle agregado de todas as libs (GERADO)
│           ├── fundamentos-visuais.json
│           ├── web-angular-react.json
│           ├── super-gerenciador.json
│           ├── super-app.json
│           ├── design-acessivel.json
│           ├── code-mappings.json     # DSC slug → caminho de import no código
│           ├── build-skeleton.cjs     # Script que agrega os {slug}.json
│           ├── fetch-design-refs.cjs  # Script que busca via REST API do Figma
│           └── README.md              # Docs do pipeline de referências
```

---

## Arquitetura da UI

O frontend do plugin **não usa módulos ES nem imports**. Todos os arquivos em `modules/` são fragmentos JavaScript que o `build.cjs` concatena em um único `<script>` dentro do `ui.html`. Eles compartilham o mesmo escopo global em runtime.

```
build.cjs (assembler)
  ├── lê views/*.html          → insere como HTML
  ├── lê modules/*.js          → concatena em <script>
  ├── lê styles/plugin.css     → inline em <style>
  ├── baixa Tailwind CDN       → inline em <style>
  ├── baixa Lucide CDN         → inline em <script>
  └── lê refs/_skeleton.json   → embarca como window.__HANDEX_REF_SKELETON__
      └── gera: ui.html
```

A comunicação entre backend (`code.js`) e frontend (`ui.html`) é feita exclusivamente via:
- `parent.postMessage({ pluginMessage: {...} }, '*')` — UI → backend
- `figma.ui.postMessage({...})` — backend → UI
- `window.onmessage` em `messages.js` — roteador de todas as mensagens recebidas

---

## Guia por arquivo

### `src/plugin/manifest.json`
Configuração obrigatória do Figma. Define `main` (backend), `ui` (frontend), `editorType` e `permissions`. Atualmente inclui `"currentuser"` para identificar o designer logado automaticamente.

### `src/plugin/code.js`
Backend do plugin. Roda no contexto privilegiado do Figma com acesso total ao canvas. Principais handlers: `ui-ready`, `scan-frame`, `create-handoff`, `audit-cache-load`, `extract-tokens`, `apply-measurements`. **Não é distribuído diretamente — gera `code.bundle.js`.**

### `src/plugin/audit.js`
Módulo compartilhado importado tanto pelo `code.js` quanto usado como referência nos módulos da UI. Define `auditProperty()` (matching de token com score fuzzy), `AUDIT_SCORE` e `AUDIT_THRESHOLDS`.

### `src/plugin/build.cjs`
Assembler do `ui.html`. Lê todos os fragmentos, faz o download de Tailwind e Lucide, embarca o skeleton e gera o HTML único. Configurar cores do tema Tailwind aqui (seção `dark: {}`).

### `src/plugin/modules/core.js`
Módulo central. Inicializa `handoffData` (estado global), expõe todas as funções públicas ao `window`, gerencia navegação, persistência (`clientStorage`), dark/light mode, toasts e accordions.

### `src/plugin/modules/messages.js`
Único `window.onmessage` do plugin. Todo roteamento de mensagens do backend passa por aqui. Aplica o tema do Figma na inicialização via `applyFigmaTheme()`.

### `src/plugin/modules/handoff.js`
Fluxo de handoff: coleta dados dos formulários (`collectHandoffData`), controla navegação entre steps e dispara `createHandoffOnCanvas()` para gerar a ficha técnica no canvas.

### `src/plugin/modules/specifications.js`
Escaneamento e exibição de specs. `scanFrame()` envia a seleção ao backend. `renderSpecs()` exibe resultados por categoria. `createSpecItem()` monta cada prop com cadeia de token em breadcrumb.

### `src/plugin/modules/audit.js` *(UI)*
Gerencia o toggle de auditoria (abre `audit-libs-modal` para seleção de bibliotecas), extração de tokens via Plugin API (`startAuditExtraction`), cache do bundle extraído e relatório de aderência.

### `src/plugin/refs/_manifest.json`
**Fonte de verdade das bibliotecas DSC.** Lista cada lib com `slug`, `name`, `fileKey` e contagens. Toda adição ou remoção de biblioteca começa aqui.

### `src/plugin/refs/_skeleton.json`
Bundle agregado gerado por `build-skeleton.cjs`. Contém metadados + style keys + component keys de todas as libs. Embarcado em `ui.html` como `window.__HANDEX_REF_SKELETON__` — base para extração de tokens em runtime. **Os valores reais (hex, fontSize, etc.) são resolvidos em runtime pela Plugin API do Figma.**

---

> Para dúvidas sobre o pipeline de referências DSC, veja `src/plugin/refs/README.md`.
> Para documentação visual da estrutura, abra `base/estrutura-plugin.html` no navegador.

---

Handex — Handoff Express · Desenvolvido por Fóton para CAIXA Design
