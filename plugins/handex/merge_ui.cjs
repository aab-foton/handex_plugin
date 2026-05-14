const fs = require('fs');

try {
  let html = fs.readFileSync('src/plugin/ui.html', 'utf8');

  const annStartStr = '<!-- VIEW: ANNOTATIONS -->';
  const annStart = html.indexOf(annStartStr);
  
  if (annStart === -1) {
    console.log('Annotation view not found.');
    process.exit(1);
  }

  const annEndStr = '    </main>\n\n    <!-- MODAL: HANDOFF SETUP -->';
  let annEnd = html.indexOf(annEndStr, annStart);
  if (annEnd === -1) {
    // try different line ending
    annEnd = html.indexOf('</main>\n    <!-- MODAL: HANDOFF SETUP -->', annStart);
    if (annEnd === -1) {
      // Just find the next main closing tag
      const nextMainClose = html.indexOf('</main>', annStart);
      annEnd = nextMainClose + '</main>'.length;
    } else {
      annEnd += '</main>\n'.length;
    }
  } else {
    annEnd += '    </main>\n'.length;
  }

  const annBlock = html.substring(annStart, annEnd);
  
  // Strip out the annotations block from original HTML
  html = html.substring(0, annStart) + html.substring(annEnd);

  // Extract useful content from annBlock
  const catStart = annBlock.indexOf('<!-- ── Category Manager');
  const btnEndStr = 'Criar Anotações\n        </button>';
  const btnEnd = annBlock.indexOf(btnEndStr) + btnEndStr.length;
  
  let annContent = annBlock.substring(catStart, btnEnd);

  let newContent = `
        <!-- Anotações Automáticas (Antigo Annotations) -->
        <div class="mb-8 p-4 bg-slate-50 dark:bg-slate-900/30 rounded-2xl border border-slate-100 dark:border-dark-line">
          <h3 class="text-[14px] font-bold text-slate-800 dark:text-white mb-2 flex items-center gap-2">
            <i data-lucide="clipboard-pen" class="w-4 h-4 text-[#0070af]"></i>
            Anotação Visual Automática
          </h3>
          <p class="text-[11px] text-slate-500 dark:text-dark-muted mb-4">Selecione um elemento no canvas, ajuste as propriedades e clique para gerar as anotações visuais (pins).</p>
          ${annContent}
        </div>
`;

  // Insert into view-specifications
  const insertTarget = '<!-- Notas de especificação -->';
  html = html.replace(insertTarget, newContent + '\n\n        ' + insertTarget);

  fs.writeFileSync('src/plugin/ui.html', html);
  console.log('Merge complete!');
} catch (e) {
  console.error(e);
}
