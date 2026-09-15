// Declarações ambiente para identificadores injetados em build-time (esbuild
// `define`, ver scripts/bundle-code.cjs) — não existem como declaração real
// no código-fonte, só são substituídos por um literal no bundle final.
// Sem isto, `tsc --noEmit` (checkJs: true) reporta "Cannot find name".
declare const __HAC_VERSION__: string;

// `figma.ui.theme` é uma API real do runtime do Figma (tema atual do
// editor, 'light'|'dark') não coberta pelos tipos oficiais de
// @figma/plugin-typings^1.138.0 instalados — só expõem `themeColors` como
// opção de figma.showUI. Augmentation mínima para não perder a checagem
// real de tipos no resto do arquivo por causa de uma única propriedade.
interface UIAPI {
  readonly theme: 'light' | 'dark';
}
