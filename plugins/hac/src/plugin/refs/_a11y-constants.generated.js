// ============================================================
// GERADO AUTOMATICAMENTE por build-a11y-constants.cjs — não editar à mão.
// Fonte: refs/design-acessivel-properties.json (2026-09-23T18:22:20.494Z)
//      + refs/design-acessivel-mobile-properties.json (2026-09-23T18:23:18.121Z)
//      + refs/super-app.json (2026-09-23T18:19:18.058Z)
//      + refs/_manifest.json (fileKey da lib 'super-app')
// Regenerar via: node src/plugin/refs/build-a11y-constants.cjs
//            ou: npm run refs:a11y-constants
//
// Gerado em: 2026-09-23T19:38:58.836Z
//
// Consumido via alias em src/plugin/modules/accessibility.js:
//   const A11Y_COMPONENT_PROPERTIES = A11Y_COMPONENT_PROPERTIES_GENERATED;
//   const A11Y_MOBILE_LINK_COMPONENT_OPTIONS = A11Y_MOBILE_LINK_COMPONENT_OPTIONS_GENERATED;
//   const A11Y_MOBILE_COMPONENT_LINK_NODE_IDS = A11Y_MOBILE_COMPONENT_LINK_NODE_IDS_GENERATED;
//   const A11Y_MOBILE_COMPONENTS_WITH_NOME_ACESSIVEL = A11Y_MOBILE_COMPONENTS_WITH_NOME_ACESSIVEL_GENERATED;
//   const A11Y_MOBILE_SCREEN_READER_VARIANTS = A11Y_MOBILE_SCREEN_READER_VARIANTS_GENERATED;
//   const A11Y_MOBILE_COMPONENT_TOGGLES = A11Y_MOBILE_COMPONENT_TOGGLES_GENERATED;
//   const A11Y_SUPER_APP_FILE_KEY = A11Y_SUPER_APP_FILE_KEY_GENERATED;
//   const A11Y_SUPER_APP_FILE_NAME = A11Y_SUPER_APP_FILE_NAME_GENERATED;
// Concatenado por build.cjs no bundle final (ui.html) ANTES de
// accessibility.js — não editar este arquivo à mão.
// ============================================================

const A11Y_COMPONENT_PROPERTIES_GENERATED = [{"shortName":"niveis de titulo","properties":[{"name":"observacoes","syncId":"7489:0","type":"BOOLEAN"},{"name":"nivel","syncId":null,"type":"VARIANT","variantOptions":["h1","h2","h3","h4","h5","h6"],"defaultValue":"h1"}]},{"shortName":"ED gerais","properties":[{"name":"observacoes","syncId":"7489:0","type":"BOOLEAN"},{"name":"notas","syncId":"7489:18","type":"BOOLEAN"},{"name":"tipo","syncId":null,"type":"VARIANT","variantOptions":["ignorar pelo LT","customizável"],"defaultValue":"ignorar pelo LT"}]},{"shortName":"estrutura da página","properties":[{"name":"variacao","syncId":null,"type":"VARIANT","variantOptions":["idiomas","marco de navegacao","titulo da pagina"],"defaultValue":"marco de navegacao"}]},{"shortName":"tab group","properties":[{"name":"nome acessivel","syncId":"742:10","type":"BOOLEAN"},{"name":"letter","syncId":"1303:0","type":"TEXT"},{"name":"observacoes","syncId":"1327:115","type":"BOOLEAN"},{"name":"notas","syncId":"1327:118","type":"BOOLEAN"},{"name":"tipo","syncId":null,"type":"VARIANT","variantOptions":["tabs","customizável"],"defaultValue":"tabs"}]},{"shortName":"breadcrumb","properties":[{"name":"nome acessível","syncId":"741:15","type":"BOOLEAN"},{"name":"letter","syncId":"1303:0","type":"TEXT"},{"name":"observacao","syncId":"1325:19","type":"BOOLEAN"},{"name":"notas","syncId":"1325:25","type":"BOOLEAN"},{"name":"tipo","syncId":null,"type":"VARIANT","variantOptions":["link inicio","link secundario","texto truncado","pagina atual","customizável"],"defaultValue":"link inicio"}]},{"shortName":"stepper","properties":[{"name":"nome acessivel","syncId":"742:22","type":"BOOLEAN"},{"name":"letter","syncId":"1303:0","type":"TEXT"},{"name":"observacoes","syncId":"1327:93","type":"BOOLEAN"},{"name":"notas","syncId":"1327:99","type":"BOOLEAN"},{"name":"tipo","syncId":null,"type":"VARIANT","variantOptions":["atual","editavel","preenchido","inativo","customizável"],"defaultValue":"atual"}]},{"shortName":"EE marco de navegacao","properties":[{"name":"observacoes","syncId":"7489:0","type":"BOOLEAN"},{"name":"letter","syncId":"7500:37","type":"TEXT"},{"name":"tipo","syncId":null,"type":"VARIANT","variantOptions":["header","nav","main","aside","footer","customizável"],"defaultValue":"header"}]},{"shortName":"button","properties":[{"name":"nome acessivel","syncId":"742:67","type":"BOOLEAN"},{"name":"observacoes","syncId":"7489:0","type":"BOOLEAN"},{"name":"letter","syncId":"7489:9","type":"TEXT"},{"name":"notas","syncId":"7489:18","type":"BOOLEAN"},{"name":"tipo","syncId":null,"type":"VARIANT","variantOptions":["default","desabilitado","com expansao","agrupado","de icone","de icone com expansao","com nome acessivel","customizável"],"defaultValue":"default"}]},{"shortName":"inputs","properties":[{"name":"nome acessivel","syncId":"742:0","type":"BOOLEAN"},{"name":"letter","syncId":"1303:0","type":"TEXT"},{"name":"observacoes","syncId":"1325:49","type":"BOOLEAN"},{"name":"notas","syncId":"1325:59","type":"BOOLEAN"},{"name":"tipo","syncId":null,"type":"VARIANT","variantOptions":["default","tipo numero","tipo data","tipo selecao","tipo senha","somente leitura","botao (i) e tooltip","botao visualizar senha","customizável"],"defaultValue":"default"}]},{"shortName":"paginator","properties":[{"name":"nome acessivel","syncId":"742:31","type":"BOOLEAN"},{"name":"letter","syncId":"1303:0","type":"TEXT"},{"name":"observacoes","syncId":"1327:69","type":"BOOLEAN"},{"name":"notas","syncId":"1327:73","type":"BOOLEAN"},{"name":"tipo","syncId":null,"type":"VARIANT","variantOptions":["caixa de selecao","listagem","customizável"],"defaultValue":"caixa de selecao"}]},{"shortName":"snackbar","properties":[{"name":"nome acessivel","syncId":"742:28","type":"BOOLEAN"},{"name":"letter","syncId":"1303:0","type":"TEXT"},{"name":"observacoes","syncId":"1327:87","type":"BOOLEAN"},{"name":"notas de codigo","syncId":"1327:90","type":"BOOLEAN"},{"name":"tipo","syncId":null,"type":"VARIANT","variantOptions":["notificacao imediata","customizável"],"defaultValue":"notificacao imediata"}]},{"shortName":"checkbox","properties":[{"name":"nome acessivel","syncId":"742:46","type":"BOOLEAN"},{"name":"letter","syncId":"1303:0","type":"TEXT"},{"name":"observacoes","syncId":"1325:31","type":"BOOLEAN"},{"name":"notas","syncId":"1325:37","type":"BOOLEAN"},{"name":"tipo","syncId":null,"type":"VARIANT","variantOptions":["somente caixa","Indeterminada em grupo","caixa e rotulo","customizável"],"defaultValue":"somente caixa"}]},{"shortName":"listas","properties":[{"name":"observacoes","syncId":"7489:0","type":"BOOLEAN"},{"name":"letter","syncId":"7500:37","type":"TEXT"},{"name":"tipo","syncId":null,"type":"VARIANT","variantOptions":["ordenada","nao ordenada","de definicao","customizável"],"defaultValue":"ordenada"}]},{"shortName":"EE idiomas","properties":[{"name":"notas","syncId":"1417:0","type":"BOOLEAN"},{"name":"observacoes","syncId":"7489:0","type":"BOOLEAN"},{"name":"letter","syncId":"7500:37","type":"TEXT"},{"name":"tipo","syncId":null,"type":"VARIANT","variantOptions":["da pagina","das partes","customizável"],"defaultValue":"da pagina"}]},{"shortName":"table","properties":[{"name":"nome acessivel","syncId":"742:16","type":"BOOLEAN"},{"name":"letter","syncId":"1303:0","type":"TEXT"},{"name":"observacoes","syncId":"1327:121","type":"BOOLEAN"},{"name":"notas","syncId":"1327:127","type":"BOOLEAN"},{"name":"tipo","syncId":null,"type":"VARIANT","variantOptions":["estruturada","cabecalho","celula","botao de ordenacao","customizável"],"defaultValue":"estruturada"}]},{"shortName":"accordion","properties":[{"name":"nome acessivel","syncId":"742:51","type":"BOOLEAN"},{"name":"notas de codigo","syncId":"742:54","type":"BOOLEAN"},{"name":"observacoes","syncId":"742:57","type":"BOOLEAN"},{"name":"letter","syncId":"1325:12","type":"TEXT"},{"name":"tipo","syncId":null,"type":"VARIANT","variantOptions":["default","customizável"],"defaultValue":"default"}]},{"shortName":"informações adicionais","properties":[{"name":"observacoes","syncId":"7489:0","type":"BOOLEAN"},{"name":"letter","syncId":"7500:37","type":"TEXT"},{"name":"tipo","syncId":null,"type":"VARIANT","variantOptions":["handoffs","conteudo extra","customizável"],"defaultValue":"handoffs"}]},{"shortName":"radio button","properties":[{"name":"nome acessivel","syncId":"742:42","type":"BOOLEAN"},{"name":"letter","syncId":"1303:0","type":"TEXT"},{"name":"observacoes","syncId":"1327:77","type":"BOOLEAN"},{"name":"notas","syncId":"1327:82","type":"BOOLEAN"},{"name":"tipo","syncId":null,"type":"VARIANT","variantOptions":["Somente rádio","radio e rotulo","customizável"],"defaultValue":"Somente rádio"}]},{"shortName":"switch","properties":[{"name":"nome acesivel","syncId":"742:38","type":"BOOLEAN"},{"name":"letter","syncId":"1303:0","type":"TEXT"},{"name":"observacoes","syncId":"1327:105","type":"BOOLEAN"},{"name":"notas","syncId":"1327:110","type":"BOOLEAN"},{"name":"tipo","syncId":null,"type":"VARIANT","variantOptions":["Somente switch","switch e rotulo","customizável"],"defaultValue":"Somente switch"}]},{"shortName":"texto alternativo para imagens","properties":[{"name":"nome acesivel","syncId":"742:13","type":"BOOLEAN"},{"name":"observacoes","syncId":"7500:34","type":"BOOLEAN"},{"name":"notas","syncId":"7500:35","type":"BOOLEAN"},{"name":"letter","syncId":"7500:36","type":"TEXT"},{"name":"tipo","syncId":null,"type":"VARIANT","variantOptions":["texto alternativo","customizável"],"defaultValue":"texto alternativo"}]},{"shortName":"link","properties":[{"name":"nome acessivel","syncId":"742:60","type":"BOOLEAN"},{"name":"letter","syncId":"1303:0","type":"TEXT"},{"name":"notas","syncId":"1325:0","type":"BOOLEAN"},{"name":"observacoes","syncId":"1325:6","type":"BOOLEAN"},{"name":"tipo","syncId":null,"type":"VARIANT","variantOptions":["default","nova janela","com nome acessivel","agrupado","enviar email","customizável"],"defaultValue":"default"}]},{"shortName":"dialog","properties":[{"name":"nome acessivel","syncId":"742:35","type":"BOOLEAN"},{"name":"letter","syncId":"1303:0","type":"TEXT"},{"name":"observacoes","syncId":"1325:43","type":"BOOLEAN"},{"name":"notas","syncId":"1325:46","type":"BOOLEAN"},{"name":"tipo","syncId":null,"type":"VARIANT","variantOptions":["default","customizável"],"defaultValue":"default"}]},{"shortName":"ED imagem","properties":[{"name":"observacoes","syncId":"7500:31","type":"BOOLEAN"},{"name":"notas","syncId":"7500:32","type":"BOOLEAN"},{"name":"tipo","syncId":null,"type":"VARIANT","variantOptions":["texto alternativo","customizável"],"defaultValue":"texto alternativo"}]},{"shortName":"componentes/icones/imagens","properties":[{"name":"variante","syncId":null,"type":"VARIANT","variantOptions":["componente","texto alternativo para imagens"],"defaultValue":"componente"},{"name":"componente","syncId":null,"type":"VARIANT","variantOptions":["accordion","breadcrumb","button","checkbox","dialog","inputs","link","listas","paginator","radio button","snackbar","stepper","switch","tab group","table","imagem"],"defaultValue":"accordion"}]},{"shortName":"elementos decorativos","properties":[{"name":"variacao","syncId":null,"type":"VARIANT","variantOptions":["gerais","imagem"],"defaultValue":"gerais"}]}];

const A11Y_MOBILE_LINK_COMPONENT_OPTIONS_GENERATED = [
  "Accordion",
  "Account Select",
  "Alert Dialog",
  "Avatar",
  "Avatar Hero",
  "Badge",
  "Badge Notification",
  "Badge Text",
  "Button",
  "Card",
  "Card Account",
  "Card Alert",
  "Card Carousel Vertical",
  "Card Feed",
  "Card Notification",
  "Card Product Offer",
  "Card Wallet",
  "Card Widget",
  "Checkbox",
  "Chips",
  "Comparison Table",
  "Credit Card Button",
  "Date Picker",
  "Digital Wallet Button",
  "Icon Button",
  "Icon Button Text",
  "Input Chat",
  "Input Money",
  "Input Pin",
  "Input Slider",
  "Input Stepper",
  "Input / Text Field Form",
  "Input / Text Field Single",
  "List Accordion",
  "List Footer",
  "List Item",
  "List Item Funds",
  "List Item Transaction",
  "Loading Animation",
  "Menu",
  "Popover",
  "Product Card",
  "Progress",
  "Radio",
  "Search Bar",
  "Segmented Button",
  "Selectable Media",
  "Sheet",
  "Shimmer",
  "Slider",
  "Snackbar",
  "Spinner",
  "Swap Preview",
  "Switch",
  "Tabs",
  "Tile Button",
  "Timeline",
  "Tipkit Inline",
  "Tipkit Popover",
  "Toolbar",
  "Tooltip",
  "Top App Bar",
  "Value Section",
  "Wheel Picker",
  "Imagem",
  "Page Controler"
];

const A11Y_MOBILE_COMPONENT_LINK_NODE_IDS_GENERATED = {
  "Accordion": "6104:22176",
  "Account Select": "14199:414",
  "Avatar": "6092:2496",
  "Avatar Hero": "39694:12330",
  "Badge": "40651:4695",
  "Badge Notification": "16679:26782",
  "Badge Text": "6791:5353",
  "Button": "6068:198",
  "Card": "6791:5569",
  "Card Alert": "6791:6531",
  "Card Carousel Vertical": "7073:8075",
  "Card Feed": "59069:4810",
  "Card Notification": "7732:2499",
  "Card Product Offer": "13179:2980",
  "Card Wallet": "13775:39234",
  "Card Widget": "7566:7691",
  "Checkbox": "6104:23727",
  "Credit Card Button": "6791:8528",
  "Date Picker": "23073:35340",
  "Digital Wallet Button": "53842:12012",
  "Icon Button": "7296:13338",
  "Icon Button Text": "6791:11812",
  "Input Chat": "47929:8716",
  "Input Money": "7537:871",
  "Input Pin": "9208:4462",
  "Input Slider": "41519:2512",
  "Input Stepper": "8193:4840",
  "List Accordion": "9934:1290",
  "List Footer": "23278:73726",
  "List Item": "6791:16928",
  "List Item Funds": "60967:5915",
  "Popover": "6092:1875",
  "Product Card": "46753:21125",
  "Radio": "6104:24152",
  "Search Bar": "11934:5702",
  "Segmented Button": "7970:1776",
  "Selectable Media": "35542:8202",
  "Sheet": "6104:24349",
  "Slider": "37466:5383",
  "Spinner": "6115:2994",
  "Switch": "6115:3093",
  "Tabs": "17487:1671",
  "Tile Button": "10426:3257",
  "Tipkit Popover": "54189:4237",
  "Tooltip": "6090:1345",
  "Top App Bar": "14199:10124",
  "Value Section": "9169:8460",
  "Wheel Picker": "34624:20638"
};

const A11Y_MOBILE_COMPONENTS_WITH_NOME_ACESSIVEL_GENERATED = [
  "Avatar",
  "Avatar Hero",
  "Badge",
  "Badge Notification",
  "Button",
  "Card Product Offer",
  "Card Wallet",
  "Checkbox",
  "Chips",
  "Comparison Table",
  "Credit Card Button",
  "Digital Wallet Button",
  "Icon Button",
  "Input Stepper",
  "List Accordion",
  "List Footer",
  "List Item",
  "List Item Funds",
  "Progress",
  "Selectable Media",
  "Shimmer",
  "Slider",
  "Spinner",
  "Top App Bar",
  "Wheel Picker",
  "Product Card"
];

const A11Y_MOBILE_SCREEN_READER_VARIANTS_GENERATED = {
  "Accordion": {
    "subModeProperty": "Leitor de Tela",
    "variants": [
      {
        "name": "Baseline",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "Disabled",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      }
    ]
  },
  "Account Select": {
    "subModeProperty": "Leitor de Tela",
    "variants": [
      {
        "name": "Baseline",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "Disabled",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "Without Expansion",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "Left Slots",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      }
    ]
  },
  "Avatar": {
    "subModeProperty": "Leitor de Tela",
    "variants": [
      {
        "name": "Interactive",
        "hasNomeAcessivel": true,
        "activeToggles": [
          "Nome Acessível",
          "Observações"
        ]
      },
      {
        "name": "With Badge Notification",
        "hasNomeAcessivel": true,
        "activeToggles": [
          "Nome Acessível",
          "Observações"
        ]
      },
      {
        "name": "Leitor de Tela3",
        "hasNomeAcessivel": true,
        "activeToggles": [
          "Nome Acessível",
          "Observações"
        ]
      }
    ]
  },
  "Avatar Hero": {
    "subModeProperty": "Leitor de Tela",
    "variants": [
      {
        "name": "Show Badge On",
        "hasNomeAcessivel": true,
        "activeToggles": [
          "Observações",
          "Nome Acessível"
        ]
      },
      {
        "name": "With Feedbacks",
        "hasNomeAcessivel": true,
        "activeToggles": [
          "Observações",
          "Nome Acessível"
        ]
      }
    ]
  },
  "Button": {
    "subModeProperty": "Leitor de Tela",
    "variants": [
      {
        "name": "Baseline",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "Disabled",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "Loading",
        "hasNomeAcessivel": true,
        "activeToggles": [
          "Nome Acessível",
          "Observações"
        ]
      },
      {
        "name": "Label in Name",
        "hasNomeAcessivel": true,
        "activeToggles": [
          "Nome Acessível",
          "Observações"
        ]
      },
      {
        "name": "With Expansion",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      }
    ]
  },
  "Card Product Offer": {
    "subModeProperty": "Leitor de Tela",
    "variants": [
      {
        "name": "Baseline",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "Sequencial",
        "hasNomeAcessivel": true,
        "activeToggles": [
          "Observações",
          "Nome Acessível"
        ]
      },
      {
        "name": "Loading",
        "hasNomeAcessivel": true,
        "activeToggles": [
          "Observações",
          "Nome Acessível"
        ]
      },
      {
        "name": "State Message",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      }
    ]
  },
  "Card Wallet": {
    "subModeProperty": "Leitor de Tela",
    "variants": [
      {
        "name": "Baseline",
        "hasNomeAcessivel": true,
        "activeToggles": [
          "Observações",
          "Nome Acessível"
        ]
      },
      {
        "name": "With Button",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      }
    ]
  },
  "Card Widget": {
    "subModeProperty": "Leitor de Tela",
    "variants": [
      {
        "name": "Baseline",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "Dragging",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "Loading",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      }
    ]
  },
  "Checkbox": {
    "subModeProperty": "Leitor de Tela",
    "variants": [
      {
        "name": "With Label",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "Only Checkbox",
        "hasNomeAcessivel": true,
        "activeToggles": [
          "Observações",
          "Nome Acessível"
        ]
      },
      {
        "name": "Indeterminate",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "Disabled",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      }
    ]
  },
  "Chips": {
    "subModeProperty": "Leitor de Tela",
    "variants": [
      {
        "name": "Baseline",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "Select Only",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "Multiselect",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "With Expansion",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "Removable",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "With Badge Notification",
        "hasNomeAcessivel": true,
        "activeToggles": [
          "Observações",
          "Nome Acessível"
        ]
      },
      {
        "name": "Leitor de Tela7",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      }
    ]
  },
  "Credit Card Button": {
    "subModeProperty": "Leitor de Tela",
    "variants": [
      {
        "name": "With Draggable",
        "hasNomeAcessivel": true,
        "activeToggles": [
          "Nome Acessível",
          "Observações"
        ]
      },
      {
        "name": "Disabled",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "Without Draggable",
        "hasNomeAcessivel": true,
        "activeToggles": [
          "Nome Acessível",
          "Observações"
        ]
      }
    ]
  },
  "Icon Button": {
    "subModeProperty": "Propriedade 1",
    "variants": [
      {
        "name": "Padrão",
        "hasNomeAcessivel": true,
        "activeToggles": [
          "Observações",
          "Nome Acessível"
        ]
      },
      {
        "name": "Variante 2",
        "hasNomeAcessivel": true,
        "activeToggles": [
          "Observações",
          "Nome Acessível"
        ]
      },
      {
        "name": "Variante 3",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      }
    ]
  },
  "Input Chat": {
    "subModeProperty": "Leitor de Tela",
    "variants": [
      {
        "name": "Default",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "Filled",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "Audio",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "Document Attachment",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      }
    ]
  },
  "Input / Text Field Single": {
    "subModeProperty": "Leitor de Tela",
    "variants": [
      {
        "name": "Baseline",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "Multiple Lines",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "On Error",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      }
    ]
  },
  "Input / Text Field Form": {
    "subModeProperty": "Leitor de Tela",
    "variants": [
      {
        "name": "Baseline",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "On Error",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "Read Only",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "Dropdown",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "Icon",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "Selector",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "Search",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "Show e Hide Password",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "Date Picker",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "Disabled",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "Info",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      }
    ]
  },
  "Input Money": {
    "subModeProperty": "Leitor de Tela",
    "variants": [
      {
        "name": "Default",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "Disabled",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "Read Only",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      }
    ]
  },
  "Input Pin": {
    "subModeProperty": "Leitor de Tela",
    "variants": [
      {
        "name": "Default",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "On Error",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      }
    ]
  },
  "List Accordion": {
    "subModeProperty": "Leitor de Tela",
    "variants": [
      {
        "name": "Default",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "Loading",
        "hasNomeAcessivel": true,
        "activeToggles": [
          "Nome Acessível",
          "Observações"
        ]
      },
      {
        "name": "Disabled",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      }
    ]
  },
  "List Item": {
    "subModeProperty": "Leitor de Tela",
    "variants": [
      {
        "name": "List Box",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "Icon / Chevron / Avatar / Image",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "Selectors",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "Input Stepper",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "Swipe Left / Right",
        "hasNomeAcessivel": true,
        "activeToggles": [
          "Observações",
          "Nome Acessível"
        ]
      },
      {
        "name": "Disabled",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "Selectable / Selected",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "Swipe Left / Right End",
        "hasNomeAcessivel": true,
        "activeToggles": [
          "Observações",
          "Nome Acessível"
        ]
      },
      {
        "name": "Left Slot - Chart Legend",
        "hasNomeAcessivel": true,
        "activeToggles": [
          "Observações",
          "Nome Acessível"
        ]
      },
      {
        "name": "Switch",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "Draggable",
        "hasNomeAcessivel": true,
        "activeToggles": [
          "Observações",
          "Nome Acessível"
        ]
      },
      {
        "name": "Action",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      }
    ]
  },
  "Radio": {
    "subModeProperty": "Leitor de Tela",
    "variants": [
      {
        "name": "Baseline",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "Radio Group",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      }
    ]
  },
  "Search Bar": {
    "subModeProperty": "Leitor de Tela",
    "variants": [
      {
        "name": "Baseline",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "Typing",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      }
    ]
  },
  "Selectable Media": {
    "subModeProperty": "Leitor de Tela",
    "variants": [
      {
        "name": "Group",
        "hasNomeAcessivel": true,
        "activeToggles": [
          "Nome Acessível",
          "Observações"
        ]
      },
      {
        "name": "Only",
        "hasNomeAcessivel": true,
        "activeToggles": [
          "Nome Acessível",
          "Observações"
        ]
      },
      {
        "name": "Disabled",
        "hasNomeAcessivel": true,
        "activeToggles": [
          "Nome Acessível",
          "Observações"
        ]
      },
      {
        "name": "Loading",
        "hasNomeAcessivel": true,
        "activeToggles": [
          "Nome Acessível",
          "Observações"
        ]
      }
    ]
  },
  "Slider": {
    "subModeProperty": "Leitor de Tela",
    "variants": [
      {
        "name": "Free",
        "hasNomeAcessivel": true,
        "activeToggles": [
          "Nome Acessível",
          "Observações"
        ]
      },
      {
        "name": "Steps",
        "hasNomeAcessivel": true,
        "activeToggles": [
          "Nome Acessível",
          "Observações"
        ]
      }
    ]
  },
  "Switch": {
    "subModeProperty": "Leitor de Tela",
    "variants": [
      {
        "name": "Baseline",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "Disabled",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      }
    ]
  },
  "Tabs": {
    "subModeProperty": "Leitor de Tela",
    "variants": [
      {
        "name": "Default",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "Badge Notification",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      }
    ]
  },
  "Snackbar": {
    "subModeProperty": "Leitor de Tela",
    "variants": [
      {
        "name": "Baseline Action",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "Baseline Text",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      }
    ]
  },
  "Top App Bar": {
    "subModeProperty": "Leitor de Tela",
    "variants": [
      {
        "name": "Baseline",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "Select",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "Show Media",
        "hasNomeAcessivel": true,
        "activeToggles": [
          "Observações",
          "Nome Acessível"
        ]
      },
      {
        "name": "Show Filters",
        "hasNomeAcessivel": true,
        "activeToggles": [
          "Nome Acessível"
        ]
      }
    ]
  },
  "Value Section": {
    "subModeProperty": "Leitor de Tela",
    "variants": [
      {
        "name": "Default",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "Display",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "Navigation",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      },
      {
        "name": "Error",
        "hasNomeAcessivel": false,
        "activeToggles": [
          "Observações"
        ]
      }
    ]
  },
  "Wheel Picker": {
    "subModeProperty": "Leitor de Tela",
    "variants": [
      {
        "name": "Single Columm",
        "hasNomeAcessivel": true,
        "activeToggles": [
          "Nome Acessível",
          "Observações"
        ]
      },
      {
        "name": "Double Columm",
        "hasNomeAcessivel": true,
        "activeToggles": [
          "Nome Acessível",
          "Observações"
        ]
      }
    ]
  }
};

const A11Y_MOBILE_COMPONENT_TOGGLES_GENERATED = {
  "Accordion": [
    "Observações"
  ],
  "Account Select": [
    "Observações"
  ],
  "Avatar": [
    "Nome Acessível",
    "Observações"
  ],
  "Avatar Hero": [
    "Observações",
    "Nome Acessível"
  ],
  "Alert Dialog": [
    "Observações"
  ],
  "Badge": [
    "Nome Acessível",
    "Observações"
  ],
  "Badge Notification": [
    "Observações",
    "Nome Acessível"
  ],
  "Badge Text": [
    "Observações"
  ],
  "Button": [
    "Observações",
    "Nome Acessível"
  ],
  "Card": [
    "Observações"
  ],
  "Card Account": [
    "Observações"
  ],
  "Card Alert": [
    "Observações"
  ],
  "Card Carousel Vertical": [
    "Observações"
  ],
  "Card Feed": [
    "Observações"
  ],
  "Card Notification": [
    "Observações"
  ],
  "Card Product Offer": [
    "Observações",
    "Nome Acessível"
  ],
  "Card Wallet": [
    "Observações",
    "Nome Acessível"
  ],
  "Card Widget": [
    "Observações"
  ],
  "Checkbox": [
    "Observações",
    "Nome Acessível"
  ],
  "Chips": [
    "Observações",
    "Nome Acessível"
  ],
  "Comparison Table": [
    "Nome Acessível",
    "Observações"
  ],
  "Credit Card Button": [
    "Nome Acessível",
    "Observações"
  ],
  "Date Picker": [
    "Observações"
  ],
  "Digital Wallet Button": [
    "Nome Acessível",
    "Observações"
  ],
  "Icon Button": [
    "Observações",
    "Nome Acessível"
  ],
  "Icon Button Text": [
    "Observações"
  ],
  "Input Chat": [
    "Observações"
  ],
  "Input / Text Field Single": [
    "Observações"
  ],
  "Input / Text Field Form": [
    "Observações"
  ],
  "Input Money": [
    "Observações"
  ],
  "Input Pin": [
    "Observações"
  ],
  "Input Slider": [
    "Observações"
  ],
  "Input Stepper": [
    "Nome Acessível",
    "Observações"
  ],
  "List Accordion": [
    "Observações",
    "Nome Acessível"
  ],
  "List Footer": [
    "Nome Acessível",
    "Observações"
  ],
  "List Item": [
    "Observações",
    "Nome Acessível"
  ],
  "List Item Funds": [
    "Observações",
    "Nome Acessível"
  ],
  "List Item Transaction": [
    "Observações"
  ],
  "Menu": [
    "Observações"
  ],
  "Page Controler": [
    "Observações"
  ],
  "Progress": [
    "Observações",
    "Nome Acessível"
  ],
  "Radio": [
    "Observações"
  ],
  "Search Bar": [
    "Observações"
  ],
  "Selectable Media": [
    "Nome Acessível",
    "Observações"
  ],
  "Segmented Button": [
    "Observações"
  ],
  "Sheet": [
    "Observações"
  ],
  "Shimmer": [
    "Observações",
    "Nome Acessível"
  ],
  "Slider": [
    "Nome Acessível",
    "Observações"
  ],
  "Spinner": [
    "Observações",
    "Nome Acessível"
  ],
  "Swap Preview": [
    "Observações"
  ],
  "Switch": [
    "Observações"
  ],
  "Tabs": [
    "Observações"
  ],
  "Tile Button": [
    "Observações"
  ],
  "Timeline": [
    "Observações"
  ],
  "Popover": [
    "Observações"
  ],
  "Tipkit Inline": [
    "Observações"
  ],
  "Tipkit Popover": [
    "Observações"
  ],
  "Snackbar": [
    "Observações"
  ],
  "Toolbar": [
    "Observações"
  ],
  "Tooltip": [
    "Observações"
  ],
  "Top App Bar": [
    "Observações",
    "Nome Acessível"
  ],
  "Value Section": [
    "Observações"
  ],
  "Wheel Picker": [
    "Nome Acessível",
    "Observações"
  ],
  "Product Card": [
    "Observações",
    "Nome Acessível"
  ],
  "Imagem": [
    "Observações"
  ]
};

const A11Y_SUPER_APP_FILE_KEY_GENERATED = "epCGtlKQxedDxQVlK3lNcN";
const A11Y_SUPER_APP_FILE_NAME_GENERATED = "DSC-Super-App";
