import re

with open('src/plugin/ui.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace view-annotations with view-design-data
design_data = """    <!-- VIEW: DESIGN DATA -->
    <main id="view-design-data" class="view flex flex-col" style="height:100%">
      <div class="flex-1 overflow-y-auto p-6 pb-24">
        <div class="mb-6 flex items-center gap-3">
          <button onclick="navigate('view-home')" aria-label="Voltar para a página inicial"
            class="p-2 bg-gray-100 dark:bg-slate-800 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors">
            <i data-lucide="arrow-left" class="w-4 h-4 text-gray-600 dark:text-gray-300" aria-hidden="true"></i>
          </button>
          <h2 class="text-[#1E293B] dark:text-white font-bold text-[18px]">Design Data</h2>
        </div>

        <p class="text-[12px] text-slate-500 dark:text-dark-muted mb-6 leading-relaxed">
          Coleta de dados detalhada voltada para variados tipos de projetos. 
        </p>

        <button onclick="exportDesignData('csv')" class="w-full py-3 mb-3 bg-white border border-[#0070af] text-[#0070af] font-bold rounded-xl hover:bg-blue-50 transition-all flex items-center justify-center gap-2">
          <i data-lucide="file-spreadsheet" class="w-4 h-4"></i> Exportar CSV
        </button>

        <button onclick="exportDesignData('xlsx')" class="w-full py-3 bg-[#0070af] text-white font-bold rounded-xl hover:bg-blue-700 transition-all flex items-center justify-center gap-2">
          <i data-lucide="download" class="w-4 h-4"></i> Exportar XLSX
        </button>

        <div class="mt-8 p-4 bg-slate-50 dark:bg-slate-900/30 rounded-2xl border border-slate-100 dark:border-dark-line">
          <h3 class="text-[13px] font-bold text-slate-800 dark:text-white mb-2">Dados coletados:</h3>
          <ul class="text-[12px] text-slate-500 dark:text-dark-muted list-disc pl-4 space-y-1">
            <li>Cores e Variáveis</li>
            <li>Tipografia</li>
            <li>Componentes</li>
            <li>Ícones e Assets</li>
            <li>Especificações e Anotações</li>
            <li>Regras de Negócio e Comportamento</li>
          </ul>
        </div>
      </div>
    </main>"""

content = re.sub(r'    <!-- VIEW: ANNOTATIONS -->\n    <main id="view-annotations".*?    </main>', design_data, content, flags=re.DOTALL)

with open('src/plugin/ui.html', 'w', encoding='utf-8') as f:
    f.write(content)
