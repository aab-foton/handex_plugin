---
name: Template Handoff Structure
description: Complete layer structure and component properties of [dsc-h] Template Handoff
type: reference
---

# [dsc-h] Template Handoff — Estrutura de Layers

**Component key:** `b9dd10fb8aa3b49af1b37206fb2d32e44828618b`
**Variant:** `variant=Acessibility`

## Hierarquia após detach

```
FRAME "[dsc-h] Template Handoff"
├── FRAME "title"
│   ├── TEXT "Title" → "Handoff de Acessibilidade" (estático)
│   ├── TEXT "Component Name" → preencher com nome do componente
│   └── TEXT "Description" → preencher com descrição
│
├── FRAME "mapping"
│   ├── INSTANCE "Title" → type=title, title#3920:6="Mapeamento de Interações..."
│   ├── FRAME "keyboard maping" [1° = Teclado]
│   │   ├── INSTANCE "Subtitle" → subtitle#3920:34="Teclado"
│   │   └── FRAME "table"
│   │       ├── INSTANCE "[dsc doc] Doc Table" type=header, variant="handoff a11y keys"
│   │       └── INSTANCE "[dsc doc] Doc Table" type=line ← PROTÓTIPO (clonar)
│   │           ├── [dsc] Table Cell variant="slot" (Keyboard key)
│   │           └── [dsc] Table Cell variant="text/qualitative number"
│   └── FRAME "keyboard maping" [2° = Gestos]
│       ├── INSTANCE "Subtitle" → subtitle#3920:34="Gestos"
│       └── FRAME "table"
│           ├── INSTANCE "[dsc doc] Doc Table" type=header, variant="Handoff a11y gesture"
│           └── INSTANCE "[dsc doc] Doc Table" type=line ← PROTÓTIPO (clonar)
│               ├── [dsc] Table Cell variant="text/qualitative number"
│               └── [dsc] Table Cell variant="text/qualitative number"
│
├── FRAME "target area" (Fase 2+)
├── FRAME "focus order" (Fase 2+)
├── FRAME "screen reader" (Fase 2+)
└── FRAME "responsiviness" (Fase 2+, typo no template)
```

## Propriedades dos componentes internos

### [dsc doc] Doc Table (row)
- `type` VARIANT: "header" | "line"
- `variant` VARIANT: "handoff a11y keys" | "Handoff a11y gesture"
- `shortcut#3908:0` TEXT: tecla(s) — usado no variant keys
- `description#3879:10` TEXT: descrição da ação
- `description#3920:41` TEXT
- `description#3920:9` TEXT

### [dsc] Table Cell
- `variant` VARIANT: "slot" | "text/qualitative number"
- `content#2521:163` TEXT: conteúdo principal da célula
- `header label#2339:0` TEXT: label do header

## Como preencher

### Teclado
```ts
row.setProperties({ 'shortcut#3908:0': keys, 'description#3879:10': action });
```

### Gestos
Navegar até as cells individuais dentro da row:
```ts
const cells = row.findAll(n => n.type === 'INSTANCE' && n.name === '[dsc] Table Cell');
cells[0].setProperties({ 'content#2521:163': gesture });
cells[1].setProperties({ 'content#2521:163': action });
```
