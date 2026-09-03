// ============================================================
// GERADO AUTOMATICAMENTE por build-a11y-constants.cjs — não editar à mão.
// Fonte: refs/design-acessivel-properties.json (2026-09-01T18:11:41.479Z)
//      + refs/design-acessivel-mobile-properties.json (2026-09-01T18:12:50.373Z)
//      + refs/super-app.json (2026-09-02T13:36:47.497Z)
//      + refs/_manifest.json (fileKey da lib 'super-app')
// Regenerar via: node src/plugin/refs/build-a11y-constants.cjs
//            ou: npm run refs:a11y-constants
//
// Gerado em: 2026-09-03T01:32:00.586Z
//
// Consumido via alias em src/plugin/modules/accessibility.js:
//   const A11Y_COMPONENT_PROPERTIES = A11Y_COMPONENT_PROPERTIES_GENERATED;
//   const A11Y_MOBILE_LINK_COMPONENT_OPTIONS = A11Y_MOBILE_LINK_COMPONENT_OPTIONS_GENERATED;
//   const A11Y_MOBILE_COMPONENT_LINK_NODE_IDS = A11Y_MOBILE_COMPONENT_LINK_NODE_IDS_GENERATED;
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
  "Card Carousel Horizontal",
  "Card Carousel Vertical",
  "Card Notification",
  "Card Product Offer",
  "Card Wallet",
  "Card Widget",
  "Checkbox",
  "Chips",
  "Comparison Table",
  "Credit Card Button",
  "Date Picker",
  "Icon Button",
  "Icon Button Text",
  "Image Media",
  "Input/Text Field - Single",
  "Input/Text Field - Form",
  "Input Money",
  "Input Pin",
  "Input Stepper",
  "List Accordion",
  "List Heading",
  "List Item",
  "List Item Transaction",
  "Loading Animation",
  "Menu",
  "Navigation Bar",
  "Page Controller",
  "Page Header",
  "Popover",
  "Progress",
  "Radio",
  "Search Bar",
  "Selectable Media",
  "Segmented Button",
  "Separator/Divider",
  "Sheet",
  "Skeleton/Shimmer",
  "Slider",
  "Spinner",
  "Swap Preview",
  "Switch",
  "Tabs",
  "Tile Button",
  "Text",
  "Timeline",
  "Toast/Snackbar",
  "Toolbar",
  "Tooltip",
  "Top App Bar",
  "Value Section",
  "Wheel Picker",
  "Personalizado"
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
  "Card Carousel Horizontal": "7970:1686",
  "Card Carousel Vertical": "7073:8075",
  "Card Notification": "7732:2499",
  "Card Product Offer": "13179:2980",
  "Card Wallet": "13775:39234",
  "Card Widget": "7566:7691",
  "Checkbox": "6104:23727",
  "Credit Card Button": "6791:8528",
  "Date Picker": "23073:35340",
  "Icon Button": "7296:13338",
  "Icon Button Text": "6791:11812",
  "Image Media": "16574:3967",
  "Input Money": "7537:871",
  "Input Pin": "9208:4462",
  "Input Stepper": "8193:4840",
  "List Accordion": "9934:1290",
  "List Heading": "8969:23717",
  "List Item": "6791:16928",
  "Navigation Bar": "14250:6664",
  "Page Controller": "10364:7439",
  "Popover": "6092:1875",
  "Radio": "6104:24152",
  "Search Bar": "11934:5702",
  "Selectable Media": "35542:8202",
  "Segmented Button": "7970:1776",
  "Sheet": "6104:24349",
  "Slider": "37466:5383",
  "Spinner": "6115:2994",
  "Switch": "6115:3093",
  "Tabs": "17487:1671",
  "Tile Button": "10426:3257",
  "Text": "16691:26557",
  "Tooltip": "6090:1345",
  "Top App Bar": "14199:10124",
  "Value Section": "9169:8460",
  "Wheel Picker": "34624:20638"
};

const A11Y_SUPER_APP_FILE_KEY_GENERATED = "epCGtlKQxedDxQVlK3lNcN";
const A11Y_SUPER_APP_FILE_NAME_GENERATED = "DSC-Super-App";
