#!/usr/bin/env node
'use strict';

/**
 * Gera um inventário auditável dos textos do hac.
 *
 * O catálogo é deliberadamente derivado dos arquivos-fonte, nunca dos
 * bundles ui.html/code.bundle.js. Isso evita duplicatas e mantém cada texto
 * apontando para o lugar em que deve ser alterado.
 *
 * Saídas:
 *   docs/text-catalog/text-catalog.json
 *   docs/text-catalog/text-catalog.csv   (UTF-8 BOM + ";", abre no Excel)
 *   docs/text-catalog/text-groups.csv    (textos repetidos agrupados)
 *   docs/text-catalog/google-sheets-revisao-design.tsv
 *   docs/text-catalog/google-sheets-triagem-tecnica.tsv
 *   docs/text-catalog/google-sheets-repeticoes.tsv
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'docs', 'text-catalog');

const HTML_FILES = [
  'src/plugin/views/home.html',
  'src/plugin/views/specifications.html',
  'src/plugin/views/modals.html',
];

const JS_FILES = [
  'src/plugin/code.js',
  'src/plugin/backend/platform-profiles.js',
  'src/plugin/backend/dsc-matching.js',
  'src/plugin/backend/onmessage.js',
  'src/plugin/modules/core.js',
  'src/plugin/modules/accessibility.js',
  'src/plugin/modules/tab-order.js',
  'src/plugin/modules/swipe-path.js',
  'src/plugin/modules/handoff-ficha.js',
  'src/plugin/modules/onboarding.js',
  'src/plugin/modules/messages.js',
];

const JSON_FILES = [
  {
    file: 'src/plugin/manifest.json',
    include: (jsonPath) => jsonPath.length === 1 && jsonPath[0] === 'name',
    scope: 'metadado-plugin',
    generated: false,
  },
  {
    file: 'src/plugin/refs/ficha-instruction-content.json',
    include: (jsonPath) => !jsonPath.some((part) => part === '_meta' || part === '_source'),
    scope: 'conteudo-instrucional',
    generated: false,
  },
  {
    file: 'src/plugin/refs/design-acessivel-web-wrapper.generated.json',
    include: (jsonPath) => jsonPath[0] !== '_meta' && !jsonPath.some((part) => /key|nodeid/i.test(part)),
    scope: 'vocabulario-lib-web',
    generated: true,
  },
  {
    file: 'src/plugin/refs/design-acessivel-mobile-wrapper.generated.json',
    include: (jsonPath) => jsonPath[0] !== '_meta' && !jsonPath.some((part) => /key|nodeid/i.test(part)),
    scope: 'vocabulario-lib-mobile',
    generated: true,
  },
];

const VISIBLE_ATTRIBUTES = new Set([
  'aria-label',
  'alt',
  'data-tooltip',
  'placeholder',
  'title',
]);

const CONTENT_PROPERTY_NAMES = /^(?:ariaLabel|body|caption|copy|description|descricao|empty|error|help|hint|instructionsBody|instructionsHeading|label|message|nomeAcessivel|notaCodigo|notasCodigo|observacoes|placeholder|status|step|stepsHeading|subtitle|text|title|tooltip|warning)$/i;
const CONTENT_CONTAINER_NAMES = /(?:A11Y|COMPONENT|CONTENT|COPY|EMPTY|ERROR|HELP|INSTRUCTION|LABEL|MESSAGE|NARRATION|ONBOARD|PLACEHOLDER|STATUS|TEXT|TOAST|WARNING)/i;
const TECHNICAL_CALL_NAMES = /^(?:addEventListener|closest|createElement|getAttribute|getElementById|includes|matches|postMessage|querySelector|querySelectorAll|removeAttribute|setItem)$/;
const USER_CALL_NAMES = /(?:alert|confirm|message|notify|toast)/i;
const TECHNICAL_VALUE = /^(?:#[\w-]+|\.[\w-]+|--[\w-]+|[a-z][a-z0-9]*(?:-[a-z0-9]+)+|[A-Z_][A-Z0-9_]*|[\w./-]+\.(?:c?js|css|html|json|md|png|svg)|https?:\/\/\S+)$/;

const entries = [];
const seenLocations = new Set();

function rel(absOrRel) {
  return path.relative(ROOT, path.resolve(ROOT, absOrRel)).replace(/\\/g, '/');
}

function hash(value, length = 10) {
  return crypto.createHash('sha1').update(String(value)).digest('hex').slice(0, length);
}

function slug(value, max = 42) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, max) || 'texto';
}

function lineColumn(source, offset) {
  const before = source.slice(0, Math.max(0, offset));
  const lines = before.split(/\r?\n/);
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

function decodeHtml(value) {
  const entities = {
    '&amp;': '&',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&lt;': '<',
    '&gt;': '>',
    '&nbsp;': ' ',
  };
  return value
    .replace(/&(amp|quot|#39|apos|lt|gt|nbsp);/g, (match) => entities[match] || match)
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function cleanText(value) {
  return String(value)
    .replace(/\r\n/g, '\n')
    .replace(/[\t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}

function hasReadableText(value) {
  const text = cleanText(value);
  if (text.length < 2 || !/[A-Za-zÀ-ɏ]/.test(text)) return false;
  if (/^\$\{[^}]+\}$/.test(text)) return false;
  return true;
}

function canonicalize(value) {
  return cleanText(value)
    .normalize('NFC')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ');
}

function addEntry({
  file,
  source,
  offset = 0,
  value,
  kind,
  context = '',
  locator = '',
  classification = 'texto-interface',
  editable = true,
  generated = false,
}) {
  const text = cleanText(decodeHtml(value));
  if (!hasReadableText(text)) return;

  const location = lineColumn(source, offset);
  const locationKey = `${file}:${location.line}:${location.column}:${kind}:${text}`;
  if (seenLocations.has(locationKey)) return;
  seenLocations.add(locationKey);

  const structuralLocator = locator || `${kind}.l${location.line}c${location.column}`;
  const sourceSlug = slug(file.replace(/^src\/plugin\//, '').replace(/\.[^.]+$/, ''), 54);
  // Linha/coluna entram no sufixo para distinguir estruturas repetidas em
  // templates diferentes (vários `<button>` sem id, por exemplo). O locator
  // legível continua separado para permitir a futura migração para chaves
  // semânticas permanentes.
  const id = `hac.${sourceSlug}.${slug(structuralLocator, 56)}.${hash(`${file}|${structuralLocator}|${kind}|${location.line}|${location.column}`, 8)}`;
  const canonicalId = `txt.${hash(canonicalize(text), 12)}`;

  entries.push({
    field_id: id,
    canonical_id: canonicalId,
    text,
    proposed_text: '',
    classification,
    kind,
    context,
    source_file: file,
    source_line: location.line,
    source_column: location.column,
    locator: structuralLocator,
    editable: editable ? 'yes' : 'no',
    generated: generated ? 'yes' : 'no',
    review_status: 'not-reviewed',
    notes: generated ? 'Gerado: altere a fonte indicada pelo pipeline, não este arquivo.' : '',
  });
}

function nearestHtmlTag(source, offset) {
  const start = source.lastIndexOf('<', offset);
  const end = source.indexOf('>', start);
  if (start < 0 || end < start || end >= offset + 2000) return { tag: 'html', id: '' };
  const raw = source.slice(start, end + 1);
  const tag = (raw.match(/^<\s*([\w-]+)/) || [])[1] || 'html';
  const id = (raw.match(/\bid\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
  return { tag, id };
}

function scanHtml(source, file, baseOffset = 0, options = {}) {
  const ignoredRanges = [];
  const ignoredPattern = /<(style|svg)(?:\s[^>]*)?>[\s\S]*?<\/\1\s*>/gi;
  let ignored;
  while ((ignored = ignoredPattern.exec(source))) {
    ignoredRanges.push([ignored.index, ignored.index + ignored[0].length]);
  }
  const isIgnored = (index) => ignoredRanges.some(([start, end]) => index >= start && index < end);

  const tagPattern = /<([a-z][\w:-]*)(\s[^<>]*?)?>/gi;
  let tagMatch;
  const tagOccurrences = new Map();
  while ((tagMatch = tagPattern.exec(source))) {
    if (isIgnored(tagMatch.index) || tagMatch[0].startsWith('</')) continue;
    const tag = tagMatch[1].toLowerCase();
    const attrs = tagMatch[2] || '';
    const id = (attrs.match(/\bid\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
    const tagCount = (tagOccurrences.get(tag) || 0) + 1;
    tagOccurrences.set(tag, tagCount);

    const attrPattern = /\b(aria-label|alt|data-tooltip|placeholder|title)\s*=\s*(["'])([\s\S]*?)\2/gi;
    let attr;
    while ((attr = attrPattern.exec(attrs))) {
      if (!VISIBLE_ATTRIBUTES.has(attr[1].toLowerCase())) continue;
      const valueOffset = tagMatch.index + tagMatch[0].indexOf(attrs) + attr.index + attr[0].indexOf(attr[3]);
      const anchor = id || `${tag}.${tagCount}`;
      addEntry({
        file,
        source: options.fullSource || source,
        offset: baseOffset + valueOffset,
        value: attr[3],
        kind: `html-attribute:${attr[1].toLowerCase()}`,
        context: anchor,
        locator: `${anchor}.${attr[1].toLowerCase()}`,
        classification: attr[1].toLowerCase() === 'aria-label' ? 'acessibilidade' : 'texto-interface',
        editable: !/\$\{/.test(attr[3]),
        generated: Boolean(options.generated),
      });
    }
  }

  const textPattern = />([^<>]+)</g;
  const textOccurrences = new Map();
  let textMatch;
  while ((textMatch = textPattern.exec(source))) {
    if (isIgnored(textMatch.index)) continue;
    const raw = textMatch[1];
    if (!hasReadableText(raw) || /^\s*(?:\/\/|\/\*|\*|const |let |var |function )/.test(raw)) continue;
    const info = nearestHtmlTag(source, textMatch.index);
    const anchorBase = info.id || info.tag;
    const countKey = `${anchorBase}.text`;
    const count = (textOccurrences.get(countKey) || 0) + 1;
    textOccurrences.set(countKey, count);
    const anchor = info.id ? `${info.id}.text` : `${info.tag}.text.${count}`;
    addEntry({
      file,
      source: options.fullSource || source,
      offset: baseOffset + textMatch.index + 1,
      value: raw,
      kind: 'html-text',
      context: info.id || info.tag,
      locator: anchor,
      classification: 'texto-interface',
      editable: !/\$\{/.test(raw),
      generated: Boolean(options.generated),
    });
  }
}

function propertyName(node) {
  if (!node) return '';
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) return node.text;
  return '';
}

function callName(node) {
  if (!node || !ts.isCallExpression(node)) return '';
  const expression = node.expression;
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return '';
}

function callOwner(node) {
  if (!node || !ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return '';
  const owner = node.expression.expression;
  return ts.isIdentifier(owner) ? owner.text : '';
}

function ancestorInfo(node) {
  let current = node.parent;
  let functionName = '';
  let containerName = '';
  let visible = false;
  let classification = 'revisar';
  let context = '';

  for (let depth = 0; current && depth < 9; depth += 1, current = current.parent) {
    if (!functionName && ts.isFunctionDeclaration(current) && current.name) functionName = current.name.text;
    if (!functionName && (ts.isFunctionExpression(current) || ts.isArrowFunction(current))) {
      if (current.parent && ts.isVariableDeclaration(current.parent) && ts.isIdentifier(current.parent.name)) {
        functionName = current.parent.name.text;
      }
    }
    if (!containerName && ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) {
      containerName = current.name.text;
    }
    if (ts.isPropertyAssignment(current) && current.initializer === node) {
      const prop = propertyName(current.name);
      context = prop || context;
      if (CONTENT_PROPERTY_NAMES.test(prop)) {
        visible = true;
        classification = /aria|accessible|acessivel/i.test(prop) ? 'acessibilidade' : 'texto-interface';
      }
    }
    if (ts.isBinaryExpression(current) && current.right === node && ts.isPropertyAccessExpression(current.left)) {
      const prop = current.left.name.text;
      context = prop;
      if (/^(?:innerHTML|textContent|innerText|title|placeholder|ariaLabel)$/i.test(prop)) {
        visible = true;
        classification = prop === 'ariaLabel' ? 'acessibilidade' : 'texto-interface';
      }
    }
    if (ts.isCallExpression(current)) {
      const name = callName(current);
      context = name || context;
      if (callOwner(current) === 'console') {
        visible = true;
        classification = 'diagnostico-tecnico';
      }
      if (/^(?:loadFontAsync|createNodeFromSvg)$/i.test(name)) {
        visible = true;
        classification = 'configuracao-tecnica';
      }
      if (name !== 'postMessage' && USER_CALL_NAMES.test(name)) {
        visible = true;
        classification = /notify|toast|alert/i.test(name) ? 'mensagem-sistema' : 'texto-interface';
      }
      if (name === 'setAttribute' && current.arguments.includes(node)) {
        const first = current.arguments[0];
        if (first && ts.isStringLiteralLike(first) && VISIBLE_ATTRIBUTES.has(first.text)) {
          visible = true;
          classification = first.text === 'aria-label' ? 'acessibilidade' : 'texto-interface';
        }
      }
    }
  }

  if (!visible && CONTENT_CONTAINER_NAMES.test(containerName)) {
    visible = true;
    classification = /NARRATION|ARIA|A11Y/i.test(containerName) ? 'vocabulario-dominio' : 'texto-interface';
    context = containerName;
  }

  return { visible, classification, context: [functionName, context || containerName].filter(Boolean).join(' > ') };
}

function classifyLooseJsText(text, node) {
  if (!hasReadableText(text)) return null;
  if (TECHNICAL_VALUE.test(text)) return null;
  if (/^(?:GET|POST|PUT|DELETE)\s+\//.test(text)) return null;
  if (/^(?:[a-z]+:)?[\w-]+(?:\.[\w-]+){1,}$/.test(text) && !/\s/.test(text)) return null;

  if (node.parent && ts.isCallExpression(node.parent) && TECHNICAL_CALL_NAMES.test(callName(node.parent))) return null;
  if (node.parent && ts.isImportDeclaration(node.parent)) return null;

  const words = text.match(/[A-Za-zÀ-ɏ]+/g) || [];
  const likelySentence = words.length >= 2 || /[.!?;:…]/.test(text) || /[A-ZÀ-Þ]/.test(text.charAt(0));
  return likelySentence ? 'revisar' : null;
}

function scanJs(source, file) {
  const scriptKind = file.endsWith('.cjs') ? ts.ScriptKind.JS : ts.ScriptKind.JS;
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind);

  function visit(node) {
    if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const text = node.text;
      if (/<[a-z][\s\S]*>/i.test(text)) {
        const rawStart = node.getStart(sourceFile) + 1;
        scanHtml(text, file, rawStart, { fullSource: source });
      } else {
        const info = ancestorInfo(node);
        const loose = info.visible ? info.classification : classifyLooseJsText(text, node);
        if (loose) {
          const loc = lineColumn(source, node.getStart(sourceFile));
          addEntry({
            file,
            source,
            offset: node.getStart(sourceFile) + 1,
            value: text,
            kind: 'javascript-string',
            context: info.context,
            locator: `${info.context || 'literal'}.l${loc.line}c${loc.column}`,
            classification: loose,
            editable: true,
          });
        }
      }
    } else if (ts.isTemplateExpression(node)) {
      const raw = node.getText(sourceFile);
      if (/<[a-z][\s\S]*>/i.test(raw)) {
        scanHtml(raw.slice(1, -1), file, node.getStart(sourceFile) + 1, { fullSource: source });
      } else {
        const info = ancestorInfo(node);
        if (info.visible || classifyLooseJsText(raw, node)) {
          const loc = lineColumn(source, node.getStart(sourceFile));
          addEntry({
            file,
            source,
            offset: node.getStart(sourceFile) + 1,
            value: raw.slice(1, -1),
            kind: 'javascript-template',
            context: info.context,
            locator: `${info.context || 'template'}.l${loc.line}c${loc.column}`,
            classification: info.visible ? info.classification : 'revisar',
            editable: false,
          });
        }
      }
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

function scanBuildShell() {
  const file = 'src/plugin/build.cjs';
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const marker = 'const html = `';
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Não foi possível localizar "${marker}" em ${file}`);
  const bodyStart = start + marker.length;
  const end = source.lastIndexOf('`;');
  if (end <= bodyStart) throw new Error(`Não foi possível localizar o fim do template HTML em ${file}`);
  scanHtml(source.slice(bodyStart, end), file, bodyStart, { fullSource: source });
}

function scanJson(config) {
  const absolute = path.join(ROOT, config.file);
  const source = fs.readFileSync(absolute, 'utf8');
  const data = JSON.parse(source);
  const occurrenceByValue = new Map();

  function walk(value, jsonPath) {
    if (typeof value === 'string') {
      if (!config.include(jsonPath, value) || !hasReadableText(value)) return;
      const seen = occurrenceByValue.get(value) || 0;
      occurrenceByValue.set(value, seen + 1);
      let from = 0;
      let found = -1;
      for (let i = 0; i <= seen; i += 1) {
        found = source.indexOf(JSON.stringify(value), from);
        if (found < 0) break;
        from = found + 1;
      }
      addEntry({
        file: config.file,
        source,
        offset: Math.max(0, found + 1),
        value,
        kind: 'json-value',
        context: jsonPath.join('.'),
        locator: jsonPath.join('.'),
        classification: config.scope,
        editable: !config.generated,
        generated: config.generated,
      });
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, jsonPath.concat(String(index))));
      return;
    }
    if (value && typeof value === 'object') {
      Object.entries(value).forEach(([key, item]) => walk(item, jsonPath.concat(key)));
    }
  }

  walk(data, []);
}

function csvCell(value) {
  const string = String(value == null ? '' : value).replace(/\r?\n/g, '\\n');
  return `"${string.replace(/"/g, '""')}"`;
}

function toCsv(rows, columns) {
  const header = columns.map(csvCell).join(';');
  const body = rows.map((row) => columns.map((column) => csvCell(row[column])).join(';')).join('\r\n');
  return `\uFEFF${header}\r\n${body}\r\n`;
}

function sheetCell(value) {
  let string = String(value == null ? '' : value)
    .replace(/\r\n|\r|\n/g, ' ⏎ ')
    .replace(/\t/g, ' ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Impede que uma redação iniciada por estes caracteres seja executada
  // como fórmula ao entrar no Google Sheets/Excel.
  if (/^[=+\-@]/.test(string)) string = `'${string}`;
  return string;
}

function toTsv(rows, columns) {
  const header = columns.map((column) => sheetCell(column.label)).join('\t');
  const body = rows.map((row, rowIndex) => columns.map((column) => sheetCell(
    typeof column.value === 'function' ? column.value(row, rowIndex) : row[column.value]
  )).join('\t')).join('\n');
  return `\uFEFF${header}\n${body}\n`;
}

function writeOutput(filename, content, { optional = false } = {}) {
  const target = path.join(OUT_DIR, filename);
  try {
    fs.writeFileSync(target, content, 'utf8');
    return true;
  } catch (error) {
    if (optional && (error.code === 'EBUSY' || error.code === 'EPERM')) {
      console.warn(`Aviso: ${rel(target)} está aberto/bloqueado e não foi atualizado.`);
      return false;
    }
    throw error;
  }
}

function classificationLabel(classification) {
  return ({
    'texto-interface': 'Texto da interface',
    acessibilidade: 'Nome ou instrução de acessibilidade',
    'mensagem-sistema': 'Mensagem de retorno do sistema',
    'conteudo-instrucional': 'Conteúdo instrucional',
    'vocabulario-dominio': 'Termo do domínio de acessibilidade',
    'vocabulario-lib-mobile': 'Vocabulário da biblioteca Mobile',
    'vocabulario-lib-web': 'Vocabulário da biblioteca Web',
    'metadado-plugin': 'Nome do plugin',
    revisar: 'Precisa de triagem técnica',
    'diagnostico-tecnico': 'Mensagem de diagnóstico',
    'configuracao-tecnica': 'Configuração técnica',
  })[classification] || classification;
}

function usageContext(entry) {
  if (entry.kind === 'html-text') return 'Texto visível diretamente na tela';
  if (entry.kind === 'html-attribute:aria-label') return 'Nome anunciado por tecnologia assistiva';
  if (entry.kind === 'html-attribute:placeholder') return 'Exemplo ou orientação dentro de um campo';
  if (entry.kind === 'html-attribute:title' || entry.kind === 'html-attribute:data-tooltip') return 'Ajuda exibida ao passar o cursor';
  if (entry.kind === 'html-attribute:alt') return 'Texto alternativo de imagem';
  if (entry.kind === 'json-value') return 'Conteúdo estruturado ou termo vindo da biblioteca';
  if (entry.classification === 'mensagem-sistema') return 'Retorno apresentado após uma ação';
  if (entry.source_file.includes('/backend/') || entry.source_file.endsWith('/code.js')) return 'Texto usado no canvas ou em retorno do Figma';
  return 'Texto montado dinamicamente pela interface';
}

function applicationGuidance(entry) {
  if (entry.generated === 'yes') return 'Propor aqui; desenvolvimento atualiza a biblioteca/fonte e regenera o plugin';
  if (entry.editable === 'no') return 'Propor aqui; desenvolvimento valida as partes dinâmicas antes de aplicar';
  return 'Propor aqui; desenvolvimento aplica no banco textual/código';
}

function surfaceForFile(file) {
  if (file.endsWith('/manifest.json')) return 'Metadados do plugin';
  if (file.includes('/refs/')) return 'Conteúdo das bibliotecas';
  if (file.includes('/backend/') || file.endsWith('/code.js')) return 'Canvas / backend Figma';
  if (file.includes('/views/modals')) return 'Modais';
  if (file.includes('/views/home')) return 'Início';
  if (file.includes('/views/specifications')) return 'Especificações';
  if (file.includes('/onboarding')) return 'Onboarding';
  if (file.includes('/tab-order')) return 'Ordem de tabulação';
  if (file.includes('/swipe-path')) return 'Ordem de leitura / Swipe';
  if (file.includes('/handoff-ficha')) return 'Ficha de handoff';
  if (file.includes('/accessibility')) return 'Acessibilidade';
  if (file.includes('/messages')) return 'Mensagens da interface';
  if (file.includes('/core') || file.endsWith('/build.cjs')) return 'Estrutura global';
  return 'Outros';
}

function writeOutputs() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  entries.sort((a, b) => a.source_file.localeCompare(b.source_file) || a.source_line - b.source_line || a.source_column - b.source_column);

  const groups = new Map();
  for (const entry of entries) {
    if (!groups.has(entry.canonical_id)) groups.set(entry.canonical_id, []);
    groups.get(entry.canonical_id).push(entry);
  }

  const groupRows = Array.from(groups, ([canonicalId, group]) => ({
    canonical_id: canonicalId,
    text: group[0].text,
    occurrences: group.length,
    classifications: Array.from(new Set(group.map((item) => item.classification))).join(' | '),
    field_ids: group.map((item) => item.field_id).join(' | '),
    locations: group.map((item) => `${item.source_file}:${item.source_line}`).join(' | '),
  })).sort((a, b) => b.occurrences - a.occurrences || a.text.localeCompare(b.text, 'pt-BR'));
  const repeatedGroupRows = groupRows.filter((row) => row.occurrences > 1);

  const classificationOrder = new Map([
    ['texto-interface', 1],
    ['acessibilidade', 2],
    ['mensagem-sistema', 3],
    ['conteudo-instrucional', 4],
    ['vocabulario-dominio', 5],
    ['vocabulario-lib-mobile', 6],
    ['vocabulario-lib-web', 7],
    ['metadado-plugin', 8],
    ['revisar', 9],
    ['diagnostico-tecnico', 10],
    ['configuracao-tecnica', 11],
  ]);
  const editorialEntries = entries
    .filter((entry) => !['revisar', 'diagnostico-tecnico', 'configuracao-tecnica'].includes(entry.classification))
    .sort((a, b) =>
      (classificationOrder.get(a.classification) || 99) - (classificationOrder.get(b.classification) || 99)
      || surfaceForFile(a.source_file).localeCompare(surfaceForFile(b.source_file), 'pt-BR')
      || a.source_file.localeCompare(b.source_file)
      || a.source_line - b.source_line
    );
  const technicalEntries = entries
    .filter((entry) => ['revisar', 'diagnostico-tecnico', 'configuracao-tecnica'].includes(entry.classification))
    .sort((a, b) => a.classification.localeCompare(b.classification) || a.source_file.localeCompare(b.source_file) || a.source_line - b.source_line);

  const byClassification = {};
  const byFile = {};
  for (const entry of entries) {
    byClassification[entry.classification] = (byClassification[entry.classification] || 0) + 1;
    byFile[entry.source_file] = (byFile[entry.source_file] || 0) + 1;
  }

  const payload = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    source_policy: 'Arquivos-fonte; bundles ui.html/code.bundle.js excluídos.',
    totals: {
      fields: entries.length,
      unique_texts: groups.size,
      editable_fields: entries.filter((entry) => entry.editable === 'yes').length,
      generated_fields: entries.filter((entry) => entry.generated === 'yes').length,
    },
    by_classification: Object.fromEntries(Object.entries(byClassification).sort()),
    by_file: Object.fromEntries(Object.entries(byFile).sort()),
    fields: entries,
  };

  const catalogColumns = [
    'field_id',
    'canonical_id',
    'text',
    'proposed_text',
    'classification',
    'kind',
    'context',
    'source_file',
    'source_line',
    'source_column',
    'locator',
    'editable',
    'generated',
    'review_status',
    'notes',
  ];
  const groupColumns = ['canonical_id', 'text', 'occurrences', 'classifications', 'field_ids', 'locations'];
  const sheetsCatalogColumns = [
    { label: 'Item', value: (_row, index) => index + 1 },
    { label: 'Área do plugin', value: (row) => surfaceForFile(row.source_file) },
    { label: 'Tipo de conteúdo', value: (row) => classificationLabel(row.classification) },
    { label: 'Texto atual', value: 'text' },
    { label: 'Texto proposto', value: 'proposed_text' },
    { label: 'Status da revisão', value: () => 'A revisar' },
    { label: 'Onde aparece', value: (row) => usageContext(row) },
    { label: 'Quantidade de usos do mesmo texto', value: (row) => (groups.get(row.canonical_id) || []).length },
    { label: 'Como a alteração será aplicada', value: (row) => applicationGuidance(row) },
    { label: 'Observações do designer', value: '' },
    { label: 'ID do campo', value: 'field_id' },
    { label: 'ID do texto repetido', value: 'canonical_id' },
    { label: 'Arquivo de referência', value: 'source_file' },
    { label: 'Linha', value: 'source_line' },
    { label: 'Contexto técnico', value: 'context' },
  ];
  const sheetsGroupColumns = [
    { label: 'ID do texto repetido', value: 'canonical_id' },
    { label: 'Texto atual', value: 'text' },
    { label: 'Quantidade de usos', value: 'occurrences' },
    { label: 'Tipos de conteúdo', value: 'classifications' },
    { label: 'IDs dos campos', value: 'field_ids' },
    { label: 'Locais no código', value: 'locations' },
  ];

  writeOutput('text-catalog.json', `${JSON.stringify(payload, null, 2)}\n`);
  // As saídas para o Google Sheets vêm antes dos CSVs legados. Assim, um
  // CSV aberto no Excel não impede a geração das planilhas de revisão.
  writeOutput('google-sheets-revisao-design.tsv', toTsv(editorialEntries, sheetsCatalogColumns));
  writeOutput('google-sheets-triagem-tecnica.tsv', toTsv(technicalEntries, sheetsCatalogColumns));
  writeOutput('google-sheets-repeticoes.tsv', toTsv(repeatedGroupRows, sheetsGroupColumns));
  writeOutput('text-catalog.csv', toCsv(entries, catalogColumns), { optional: true });
  writeOutput('text-groups.csv', toCsv(groupRows, groupColumns), { optional: true });

  console.log(`Catálogo gerado: ${entries.length} campos, ${groups.size} textos únicos.`);
  console.log(rel(path.join(OUT_DIR, 'text-catalog.csv')));
  console.log(rel(path.join(OUT_DIR, 'text-catalog.json')));
  console.log(rel(path.join(OUT_DIR, 'text-groups.csv')));
  console.log(rel(path.join(OUT_DIR, 'google-sheets-revisao-design.tsv')));
  console.log(rel(path.join(OUT_DIR, 'google-sheets-triagem-tecnica.tsv')));
  console.log(rel(path.join(OUT_DIR, 'google-sheets-repeticoes.tsv')));
}

for (const file of HTML_FILES) {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  scanHtml(source, file);
}

scanBuildShell();

for (const file of JS_FILES) {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  scanJs(source, file);
}

for (const config of JSON_FILES) scanJson(config);

writeOutputs();
