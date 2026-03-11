# DSC A11Y Handoff

Plugin Figma para handoff de acessibilidade. Permite anotar componentes, component sets e instâncias com propriedades de acessibilidade em um fluxo guiado por steps, gerando documentação visual diretamente no canvas com conectores e frame de especificações.

## Instalação

### Pré-requisitos
- [Node.js](https://nodejs.org/) (v18+)
- [Figma Desktop](https://www.figma.com/downloads/)

### Setup
```bash
npm install
npm run build
```

### Importar no Figma
1. Abra o Figma Desktop
2. Menu **Plugins → Development → Import plugin from manifest...**
3. Selecione o arquivo `manifest.json` desta pasta

### Desenvolvimento
```bash
npm run watch   # Recompila automaticamente a cada alteração
npm run lint    # Verifica erros de linting
```

## Como usar

### 1. Selecionar elemento
Selecione no canvas um **Component**, **Component Set** ou **Instance**.

### Step 1 — Propriedades do Componente
Configurações que se aplicam ao componente como um todo:

| Propriedade | Tipo | Opções |
|---|---|---|
| **Plataforma** | Checkboxes (múltipla) | Mobile Cross-platform, Mobile Android, Mobile iOS, Web, Desktop Nativo |
| **Zoom** | Checkboxes (múltipla) | Redimensionar Texto (até 200%), Refluxo (até 400%) |

### Step 2 — Anotação de Layers
O plugin exibe um **preview visual clicável** do componente. Clique em qualquer elemento no preview para anotar:

| Propriedade | Tipo | Descrição |
|---|---|---|
| **Categoria** | Dropdown | Define o tipo de conector visual (ver mapeamento abaixo) |
| **Função (Role)** | Dropdown | Role ARIA completo ou "Não ler" |
| **Foco** | Toggle | Se o elemento recebe tabulação/foco |
| **Tamanho do Alvo** | Radio | Nenhum, Interativo Mínimo (24px), Interativo Aprimorado (44px) |

Campos extras aparecem conforme a categoria:
- **Nome acessível / texto alt.**: campos de texto
- **Nível de título**: seletor h1–h6

#### Indicadores no preview
- Borda verde: layer já anotada
- Borda colorida: indica a categoria (amarelo, verde, turquesa, vermelho, laranja)
- Borda azul: layer selecionada

### Step 3 — Ordem de Foco
Lista todas as layers com **Foco = Sim**:
- Reordene com botões ↑↓
- Defina categoria e campos extras por item

### Step 4 — Gerar Handoff
Gera a documentação diretamente no canvas:
1. **Frame de especificações**: posicionado ao lado do componente com todas as informações
2. **Conectores visuais**: instâncias dos componentes `[EXCLUSIVO DSC][a11y]` posicionadas ao lado de cada layer anotada

## Mapeamento de Conectores

| Categoria | Conector | Cor |
|---|---|---|
| Função e valor | Círculo amarelo "A" | #f5c542 |
| Nível de título | Círculo verde "H1" | #7bc47f |
| Nome acessível e texto alt. | Triângulo turquesa "A" | #4ecdc4 |
| Decorativo | Círculo vermelho "⊘" | #e74c3c |
| Outros | Quadrado laranja "A" | #e67e22 |

O plugin busca automaticamente os component sets `[EXCLUSIVO DSC][a11y] Conectores`, `Combinados` e `Anotações` no documento. Se encontrados, cria instâncias automaticamente no canvas.

## Armazenamento de dados

Todos os dados ficam no `pluginData` do Figma:

| Chave | Escopo | Conteúdo |
|---|---|---|
| `a11y-component` | Nó raiz | Plataformas e zoom do componente |
| `a11y` | Cada layer | Role, foco, target size, categoria, nome acessível, etc. |
| `a11y-focus-order` | Nó raiz | Array ordenado de elementos com foco |

### Exemplo: dados do componente
```json
{
  "platform": ["web", "mobile-ios"],
  "zoom": ["resize-text", "reflow"]
}
```

### Exemplo: dados por layer
```json
{
  "focus": true,
  "targetSize": "enhanced-44",
  "role": "button",
  "category": "funcao-valor",
  "accessibleName": "Enviar formulário"
}
```

## Estrutura do projeto

```
DSC A11Y Handoff/
├── manifest.json    # Configuração do plugin Figma
├── code.ts          # Lógica do plugin (TypeScript)
├── code.js          # Código compilado (gerado pelo build)
├── ui.html          # Interface do plugin (HTML/CSS/JS)
├── package.json     # Dependências e scripts
├── tsconfig.json    # Configuração TypeScript
└── README.md        # Esta documentação
```

## Roles ARIA disponíveis

`alert`, `alertdialog`, `application`, `article`, `banner`, `button`, `cell`, `checkbox`, `columnheader`, `combobox`, `complementary`, `contentinfo`, `definition`, `dialog`, `directory`, `document`, `feed`, `figure`, `form`, `grid`, `gridcell`, `group`, `heading`, `img`, `link`, `list`, `listbox`, `listitem`, `log`, `main`, `marquee`, `math`, `menu`, `menubar`, `menuitem`, `menuitemcheckbox`, `menuitemradio`, `navigation`, `none`, `note`, `option`, `presentation`, `progressbar`, `radio`, `radiogroup`, `region`, `row`, `rowgroup`, `rowheader`, `scrollbar`, `search`, `searchbox`, `separator`, `slider`, `spinbutton`, `status`, `switch`, `tab`, `table`, `tablist`, `tabpanel`, `term`, `textbox`, `timer`, `toolbar`, `tooltip`, `tree`, `treegrid`, `treeitem`
