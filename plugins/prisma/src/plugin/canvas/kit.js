// ============================================================
// canvas/kit.js — Helpers compartilhados de construção de canvas (PRISMA)
// Usado por todos os builders em canvas/builders/*.js. Extraído de
// code.js — mesma implementação, só isolada em módulo próprio para
// que cada framework possa ser mantido/editado independentemente.
// ============================================================

const CAIXA_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 205.51265 46.553631"><g transform="translate(-284.78446,-475.51214)"><g transform="matrix(1.25,0,0,-1.25,15.493106,1024.9702)"><g transform="scale(0.24,0.24)"><path d="m 1107.19,1780.04 -17.74,-44.21 24.55,0 -6.73,44.39 -0.08,-0.18 z m -93.98,-101.49 72.77,149.83 55.02,0 30.68,-149.83 -48.3,0 -3.56,19.97 -46.86,0 -10.78,-19.97 -48.97,0 z m 181.34,0 21.08,149.83 48.67,0 -21.07,-149.83 -48.68,0 z m 323.71,101.67 -17.81,-44.39 24.54,0 -6.73,44.39 z m -94.06,-101.67 72.78,149.83 55.01,0 30.69,-149.83 -48.31,0 -3.55,19.97 -46.87,0 -10.78,-19.97 -48.97,0" style="fill:#0070af;fill-opacity:1;fill-rule:evenodd;stroke:none"/><path d="m 1316.6,1748.61 60.99,0 41.79,-69.21 -61,0 -41.78,69.21" style="fill:#0070af;fill-opacity:1;fill-rule:evenodd;stroke:none"/><path d="m 1322.94,1759.24 63.04,0 54.75,68.92 -63.04,0 -54.75,-68.92" style="fill:#f6822a;fill-opacity:1;fill-rule:evenodd;stroke:none"/><path d="m 1259.91,1678.98 63.03,0 54.75,69.76 -63.04,0 -54.74,-69.76" style="fill:#f6822a;fill-opacity:1;fill-rule:evenodd;stroke:none"/><path d="m 1282.64,1829 58.83,0 40.31,-69.76 -58.84,0 -40.3,69.76" style="fill:#0070af;fill-opacity:1;fill-rule:evenodd;stroke:none"/><path d="m 1014.65,1823.02 -4.68,-44.07 c -17.939,24.75 -59.517,7.67 -62.782,-23.16 -4.149,-39.13 35.867,-48.25 57.642,-25.21 l -4.69,-44.17 c -6.499,-3.19 -12.855,-5.67 -19.128,-7.34 -6.239,-1.68 -12.492,-2.57 -18.696,-2.7 -7.8,-0.17 -14.867,0.65 -21.234,2.44 -6.367,1.76 -12.129,4.56 -17.227,8.34 -9.832,7.19 -16.941,16.33 -21.32,27.45 -4.379,11.16 -5.82,23.75 -4.328,37.82 1.203,11.31 4.051,21.62 8.59,30.97 4.5,9.34 10.734,17.84 18.672,25.54 7.504,7.34 15.676,12.88 24.519,16.64 8.809,3.73 18.422,5.72 28.813,5.94 6.207,0.13 12.297,-0.49 18.207,-1.92 5.942,-1.42 11.802,-3.64 17.642,-6.57" style="fill:#0070af;fill-opacity:1;fill-rule:evenodd;stroke:none"/></g></g></g></svg>`;

const C = {
  blue:      { r: 0,     g: 0.439, b: 0.686 },
  blueDark:  { r: 0,     g: 0.247, b: 0.478 },
  blueLight: { r: 0.910, g: 0.957, b: 0.980 },
  orange:    { r: 0.965, g: 0.510, b: 0.165 },
  teal:      { r: 0.298, g: 0.745, b: 0.714 },
  tealLight: { r: 0.851, g: 0.961, b: 0.957 },
  lime:      { r: 0.831, g: 0.969, b: 0.188 },
  yellow:    { r: 1,     g: 0.949, b: 0.749 },
  white:     { r: 1,     g: 1,     b: 1     },
  bg:        { r: 0.941, g: 0.953, b: 0.969 },
  bgBlue:    { r: 0.910, g: 0.957, b: 0.980 },
  line:      { r: 0.882, g: 0.894, b: 0.910 },
  text:      { r: 0.118, g: 0.161, b: 0.231 },
  muted:     { r: 0.392, g: 0.455, b: 0.545 },
  light:     { r: 0.651, g: 0.706, b: 0.780 },
  green:     { r: 0.133, g: 0.694, b: 0.298 },
  greenLight:{ r: 0.941, g: 0.992, b: 0.949 },
  amber:     { r: 0.961, g: 0.769, b: 0.188 },
  red:       { r: 0.941, g: 0.263, b: 0.212 },
};

// tx(text, size, weight, color, name?)
// name = 'field/<id>'  → editable data field
// name = '_label'       → static label (not extracted)
// Para nós field/<id>, o texto inicial é sempre o placeholder do builder
// (varia de campo pra campo, e builders diferentes usam cores diferentes
// pra ele — não há uma cor única e confiável pra reconhecer "ainda é
// placeholder" só olhando o fill do nó). Por isso gravamos o placeholder
// como plugin data no próprio nó: fill.js e scan.js comparam o texto atual
// contra essa marca pra decidir se o campo foi de fato preenchido, sem
// precisar manter uma lista separada de "qual é o placeholder de cada
// campo" sincronizada com os 21 builders.
const tx = (text, size, weight, color, name) => {
  const n = figma.createText();
  n.fontName = { family: "Inter", style: weight || "Regular" };
  n.characters = String(text || "");
  n.fontSize = size || 12;
  n.fills = [{ type: "SOLID", color: color || C.text }];
  n.textAutoResize = "WIDTH_AND_HEIGHT";
  if (name) n.name = name;
  if (name && name.startsWith('field/')) {
    n.setPluginData('prisma_placeholder', String(text || ""));
  }
  return n;
};

const vb = (w, pad, gap, fill, cr) => {
  const f = figma.createFrame();
  f.layoutMode = "VERTICAL";
  f.paddingLeft = f.paddingRight = pad;
  f.paddingTop = f.paddingBottom = pad;
  f.itemSpacing = gap;
  f.fills = fill ? [{ type: "SOLID", color: fill }] : [];
  if (cr) f.cornerRadius = cr;
  if (w !== null) {
    f.counterAxisSizingMode = "FIXED";
    f.resize(w, 10);
  } else {
    f.counterAxisSizingMode = "AUTO";
  }
  f.primaryAxisSizingMode = "AUTO";
  return f;
};

const hb = (pad, gap, fill, cr) => {
  const f = figma.createFrame();
  f.layoutMode = "HORIZONTAL";
  f.paddingLeft = f.paddingRight = pad;
  f.paddingTop = f.paddingBottom = pad;
  f.itemSpacing = gap;
  f.primaryAxisSizingMode = "AUTO";
  f.counterAxisSizingMode = "AUTO";
  f.counterAxisAlignItems = "CENTER";
  f.fills = fill ? [{ type: "SOLID", color: fill }] : [];
  if (cr) f.cornerRadius = cr;
  return f;
};

// addT(parent, text, size, weight, color, name?)
const addT = (parent, text, size, weight, color, name) => {
  const n = tx(text, size, weight, color, name);
  n.textAutoResize = "HEIGHT";
  n.layoutAlign = "STRETCH";
  parent.appendChild(n);
  return n;
};

// mkField(parent, id, placeholder, fontSize?, fill?, cr?)
// Creates: section/<id> frame  →  field/<id> text node
const mkField = (parent, id, placeholder, fontSize, fill, cr) => {
  const wrap = vb(null, 12, 0, fill !== undefined ? fill : C.bg, cr !== undefined ? cr : 8);
  wrap.name = 'section/' + id;
  wrap.paddingTop = wrap.paddingBottom = 10;
  wrap.layoutAlign = "STRETCH";
  const val = tx(placeholder, fontSize || 12, "Regular", C.light, 'field/' + id);
  val.textAutoResize = "HEIGHT";
  val.layoutAlign = "STRETCH";
  wrap.appendChild(val);
  if (parent) parent.appendChild(wrap);
  return wrap;
};

// mkRatingRow(fieldId, selected?, max?) — linha de `max` caixas (1 a max,
// default 5) para campos tipo "scale". A caixa correspondente a `selected`
// recebe destaque visual (fundo azul). O número selecionado fica também
// num nó de texto field/<fieldId> (tamanho mínimo, mesmo padrão dos demais
// campos), para que fill.js/scan reaproveitem o mecanismo já existente sem
// mudança — escala vira só mais um "campo" de texto contendo "1".."max" ou
// "". `max` variável permite reaproveitar o mesmo helper para escalas 1–5
// (heurísticas de Nielsen) e 1–7 (SEQ), sem duplicar a lógica de pintura.
const mkRatingRow = (fieldId, selected, max) => {
  const row = hb(0, 6, null);
  row.name = '_rating';
  for (let s = 1; s <= (max || 5); s++) {
    const isSel = String(selected) === String(s);
    const box = vb(null, 6, 0, isSel ? C.blue : C.bg, 4);
    box.name = '_rating-box-' + s;
    box.paddingTop = box.paddingBottom = 6;
    box.paddingLeft = box.paddingRight = 8;
    const bT = tx(String(s), 10, "Bold", isSel ? C.white : C.muted);
    box.appendChild(bT);
    row.appendChild(box);
  }
  const valT = tx(selected ? String(selected) : "", 1, "Regular", C.bg, 'field/' + fieldId);
  valT.resize(1, 1);
  valT.opacity = 0.01;
  row.appendChild(valT);
  return row;
};

const sp = (h) => {
  const r = figma.createRectangle();
  r.resize(4, h); r.opacity = 0;
  return r;
};

const rct = (w, h, fill, cr, strokeC, strokeW, dash) => {
  const r = figma.createRectangle();
  r.resize(w, h);
  r.fills = fill ? [{ type: "SOLID", color: fill }] : [];
  if (cr) r.cornerRadius = cr;
  if (strokeC) {
    r.strokes = [{ type: "SOLID", color: strokeC }];
    r.strokeWeight = strokeW || 1;
    if (dash) r.dashPattern = dash;
  }
  return r;
};

const ell = (w, h, fill, strokeC, strokeW, dash) => {
  const e = figma.createEllipse();
  e.resize(w, h);
  e.fills = fill ? [{ type: "SOLID", color: fill }] : [];
  if (strokeC) {
    e.strokes = [{ type: "SOLID", color: strokeC }];
    e.strokeWeight = strokeW || 1;
    if (dash) e.dashPattern = dash;
  }
  return e;
};

const mkLogo = (h) => {
  try {
    const n = figma.createNodeFromSvg(CAIXA_SVG);
    n.name = "CAIXA Logo";
    n.resize(Math.round(h * 205.51 / 46.55), h);
    return n;
  } catch(e) {
    return tx("CAIXA", Math.round(h * 0.6), "Bold", C.blue);
  }
};

const mkHeader = (title) => {
  const bar = figma.createFrame();
  bar.name = '_header';
  bar.layoutMode = "HORIZONTAL";
  bar.paddingLeft = bar.paddingRight = 16;
  bar.paddingTop = bar.paddingBottom = 14;
  bar.itemSpacing = 12;
  bar.primaryAxisSizingMode = "AUTO";
  bar.counterAxisSizingMode = "AUTO";
  bar.layoutAlign = "STRETCH";
  bar.counterAxisAlignItems = "CENTER";
  bar.fills = [{ type: "SOLID", color: C.bgBlue }];
  bar.appendChild(mkLogo(20));
  bar.appendChild(tx("|", 14, "Regular", C.blueDark, '_sep'));
  const titleT = tx(title, 14, "Bold", C.blueDark, '_title');
  titleT.layoutGrow = 1;
  bar.appendChild(titleT);

  // Selo de versão — texto placeholder "v1", preenchido de verdade por
  // canvas/finalize.js quando a versão real é calculada (depende de
  // contar instâncias já existentes na página, que só se sabe depois
  // que o builder termina de montar o frame). Nome fixo '_version_badge'
  // para finalize.js localizar sem depender de um field/<id>.
  const badge = hb(0, 0, C.blue, 999);
  badge.name = '_version_badge';
  badge.paddingLeft = badge.paddingRight = 10;
  badge.paddingTop = badge.paddingBottom = 4;
  const badgeT = tx("v1", 10, "Bold", C.white, '_version_badge_text');
  badge.appendChild(badgeT);
  bar.appendChild(badge);

  return bar;
};

module.exports = { C, tx, vb, hb, addT, mkField, mkRatingRow, sp, rct, ell, mkLogo, mkHeader };
