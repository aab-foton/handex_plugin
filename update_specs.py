import re

with open('src/plugin/ui.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace view-specifications
specs_data = """    <!-- VIEW: SPECIFICATIONS -->
    <main id="view-specifications" class="view flex p-0 flex-col h-full overflow-hidden">
      <!-- Header -->
      <div class="px-6 pt-6 pb-0 border-b border-gray-100 dark:border-dark-line flex flex-col shrink-0">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            <button onclick="navigate('view-home')" aria-label="Voltar para a página inicial" class="p-2 bg-gray-100 dark:bg-slate-800 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors">
              <i data-lucide="arrow-left" class="w-4 h-4 text-gray-600 dark:text-gray-300" aria-hidden="true"></i>
            </button>
            <h2 class="text-[#1E293B] dark:text-white font-bold text-[18px]">Especificações</h2>
          </div>
        </div>

        <!-- Tabs -->
        <div class="flex gap-4">
          <button onclick="switchSpecTab('specs-form')" id="tab-specs-form" class="py-2 border-b-2 border-[#0070af] text-[#0070af] dark:text-blue-400 dark:border-blue-400 font-bold text-[13px] transition-colors">Especificações/Anotações</button>
          <button onclick="switchSpecTab('specs-flow')" id="tab-specs-flow" class="py-2 border-b-2 border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 font-bold text-[13px] transition-colors">Linhas de Fluxo/Pontos de Decisão</button>
        </div>
      </div>

      <!-- Scrollable content -->
      <div class="flex-1 overflow-y-auto p-6 pb-24" id="spec-scroll-container">
        
        <!-- TAB 1: FORM -->
        <div id="specs-form">
          <p class="text-[12px] text-slate-500 dark:text-dark-muted mb-5 leading-relaxed">
            Selecione um elemento no canvas e crie suas notas ou especificações avançadas.
          </p>

          <!-- Row for Letter & Category -->
          <div class="grid grid-cols-4 gap-3 mb-5">
            <!-- Letter Input -->
            <div class="col-span-1">
              <label class="block text-[11px] font-bold text-gray-400 uppercase mb-1.5">Letra</label>
              <input type="text" id="spec-letter-input" maxlength="2" value="A" class="w-full bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-line rounded-xl px-3 py-2.5 text-[12px] text-center font-bold text-slate-700 dark:text-white focus:ring-2 focus:ring-blue-100 outline-none" />
            </div>

            <!-- Category Manager -->
            <div class="col-span-3">
              <div class="flex items-center justify-between mb-1.5">
                <label class="text-[11px] font-bold text-gray-400 uppercase">Categoria</label>
                <div class="flex items-center gap-2">
                  <button onclick="openModal('spec-types-help-modal')" class="text-orange-500 hover:text-orange-600 transition-colors">
                    <i data-lucide="help-circle" class="w-3.5 h-3.5"></i>
                  </button>
                  <button onclick="toggleCategoryManager()" id="btn-manage-cats"
                    class="text-[10px] text-[#0070af] hover:underline flex items-center gap-1">
                    <i data-lucide="settings-2" class="w-3 h-3"></i> Gerenciar
                  </button>
                </div>
              </div>
              <select id="ann-category"
                class="w-full px-3 py-2.5 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-line rounded-xl text-[12px] text-slate-700 dark:text-dark-text focus:ring-2 focus:ring-blue-100 outline-none appearance-none cursor-pointer">
                <option value="">Sem categoria</option>
              </select>
            </div>
          </div>

          <!-- Category manager panel (hidden by default) -->
          <div id="category-manager"
            class="hidden mb-5 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-line rounded-xl overflow-hidden">
            <div class="px-4 py-2 bg-gray-50 dark:bg-slate-800 border-b border-gray-100 dark:border-dark-line">
              <p class="text-[11px] font-bold text-slate-500 dark:text-dark-muted uppercase">Gerenciar categorias</p>
            </div>
            <div id="cat-list" class="divide-y divide-gray-50 dark:divide-dark-line max-h-40 overflow-y-auto">
              <!-- Filled by JS -->
            </div>
            <!-- Add new category -->
            <div class="flex items-center gap-2 p-3 border-t border-gray-100 dark:border-dark-line">
              <input id="cat-new-input" type="text" placeholder="Nova categoria..."
                class="flex-1 px-3 py-1.5 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-line rounded-lg text-[12px] text-slate-700 dark:text-dark-text outline-none focus:ring-2 focus:ring-blue-100"
                onkeydown="if(event.key==='Enter') addCategory()" />
              <button onclick="addCategory()"
                class="px-3 py-1.5 bg-[#0070af] text-white text-[11px] font-bold rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1">
                <i data-lucide="plus" class="w-3 h-3"></i> Add
              </button>
            </div>
          </div>

          <!-- Link Input -->
          <div class="mb-5">
            <label class="block text-[11px] font-bold text-gray-400 uppercase mb-1.5">Link (opcional)</label>
            <input type="text" id="spec-link-input" placeholder="https://..." class="w-full bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-line rounded-xl px-3 py-2 text-[12px] text-slate-700 dark:text-white focus:ring-2 focus:ring-blue-100 outline-none" />
          </div>

          <!-- Custom note -->
          <div class="mb-5">
            <label class="block text-[11px] font-bold text-gray-400 uppercase mb-1.5">Nota personalizada</label>
            <textarea id="ann-note" rows="2" placeholder="Ex: Usar variável color-primary-500..."
              class="w-full px-3 py-2 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-line rounded-xl text-[12px] text-slate-700 dark:text-dark-text placeholder:text-gray-300 outline-none focus:ring-2 focus:ring-blue-100 resize-none"></textarea>
          </div>

          <!-- ── Property toggles ───────────────────────────────────── -->
          <div class="mb-5">
            <div class="px-4 py-3 bg-gray-50 dark:bg-slate-800 flex items-center justify-between rounded-xl mb-4 border border-gray-100 dark:border-dark-line">
              <div>
                <p class="text-[12px] font-bold text-slate-600 dark:text-dark-text">Propriedades incluídas</p>
                <p class="text-[10px] text-gray-400 mt-0.5">Desmarque para omitir da anotação visual</p>
              </div>
              <button onclick="toggleAllAnnotationProps(this)" class="text-[10px] text-[#0070af] hover:underline">Desmarcar tudo</button>
            </div>

            <div class="grid grid-cols-1 gap-3">
              <!-- Dimensões -->
              <div class="bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-line rounded-xl overflow-hidden">
                <button type="button" onclick="togglePropGroup(this)" class="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-slate-800/60 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">
                  <span class="text-[11px] font-bold text-slate-500 dark:text-dark-muted uppercase tracking-wide">Dimensões & Layout</span>
                  <i data-lucide="chevron-down" class="w-3.5 h-3.5 text-gray-400 transition-transform rotate-180"></i>
                </button>
                <div data-prop-group>
                  <div class="p-3 grid grid-cols-2 gap-2">
                    <label class="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-dark-bg/50 rounded-lg cursor-pointer transition-colors"><span class="text-[11px] text-slate-600 dark:text-dark-text mr-1">Altura</span><input type="checkbox" id="ann-height" checked class="w-3.5 h-3.5 rounded border-gray-300 text-[#0070af] focus:ring-[#0070af]" /></label>
                    <label class="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-dark-bg/50 rounded-lg cursor-pointer transition-colors"><span class="text-[11px] text-slate-600 dark:text-dark-text mr-1">Largura</span><input type="checkbox" id="ann-width" checked class="w-3.5 h-3.5 rounded border-gray-300 text-[#0070af] focus:ring-[#0070af]" /></label>
                    <label class="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-dark-bg/50 rounded-lg cursor-pointer transition-colors"><span class="text-[11px] text-slate-600 dark:text-dark-text mr-1">Alt. Mín</span><input type="checkbox" id="ann-min-height" class="w-3.5 h-3.5 rounded border-gray-300 text-[#0070af] focus:ring-[#0070af]" /></label>
                    <label class="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-dark-bg/50 rounded-lg cursor-pointer transition-colors"><span class="text-[11px] text-slate-600 dark:text-dark-text mr-1">Alt. Máx</span><input type="checkbox" id="ann-max-height" class="w-3.5 h-3.5 rounded border-gray-300 text-[#0070af] focus:ring-[#0070af]" /></label>
                    <label class="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-dark-bg/50 rounded-lg cursor-pointer transition-colors"><span class="text-[11px] text-slate-600 dark:text-dark-text mr-1">Larg. Mín</span><input type="checkbox" id="ann-min-width" class="w-3.5 h-3.5 rounded border-gray-300 text-[#0070af] focus:ring-[#0070af]" /></label>
                    <label class="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-dark-bg/50 rounded-lg cursor-pointer transition-colors"><span class="text-[11px] text-slate-600 dark:text-dark-text mr-1">Larg. Máx</span><input type="checkbox" id="ann-max-width" class="w-3.5 h-3.5 rounded border-gray-300 text-[#0070af] focus:ring-[#0070af]" /></label>
                    <label class="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-dark-bg/50 rounded-lg cursor-pointer transition-colors"><span class="text-[11px] text-slate-600 dark:text-dark-text mr-1">Direção</span><input type="checkbox" id="ann-direction" checked class="w-3.5 h-3.5 rounded border-gray-300 text-[#0070af] focus:ring-[#0070af]" /></label>
                    <label class="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-dark-bg/50 rounded-lg cursor-pointer transition-colors"><span class="text-[11px] text-slate-600 dark:text-dark-text mr-1">Alinham.</span><input type="checkbox" id="ann-alignment" checked class="w-3.5 h-3.5 rounded border-gray-300 text-[#0070af] focus:ring-[#0070af]" /></label>
                    <label class="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-dark-bg/50 rounded-lg cursor-pointer transition-colors"><span class="text-[11px] text-slate-600 dark:text-dark-text mr-1">Gap</span><input type="checkbox" id="ann-gap" checked class="w-3.5 h-3.5 rounded border-gray-300 text-[#0070af] focus:ring-[#0070af]" /></label>
                    <label class="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-dark-bg/50 rounded-lg cursor-pointer transition-colors"><span class="text-[11px] text-slate-600 dark:text-dark-text mr-1">Padding</span><input type="checkbox" id="ann-padding" checked class="w-3.5 h-3.5 rounded border-gray-300 text-[#0070af] focus:ring-[#0070af]" /></label>
                  </div>
                </div>
              </div>

              <!-- Outros -->
              <div class="bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-line rounded-xl overflow-hidden">
                <button type="button" onclick="togglePropGroup(this)" class="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-slate-800/60 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">
                  <span class="text-[11px] font-bold text-slate-500 dark:text-dark-muted uppercase tracking-wide">Aparência & Tipografia</span>
                  <i data-lucide="chevron-down" class="w-3.5 h-3.5 text-gray-400 transition-transform rotate-180"></i>
                </button>
                <div data-prop-group class="hidden">
                  <div class="p-3 grid grid-cols-2 gap-2">
                    <label class="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-dark-bg/50 rounded-lg cursor-pointer transition-colors"><span class="text-[11px] text-slate-600 dark:text-dark-text mr-1">Raio</span><input type="checkbox" id="ann-radius" checked class="w-3.5 h-3.5 rounded border-gray-300 text-[#0070af] focus:ring-[#0070af]" /></label>
                    <label class="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-dark-bg/50 rounded-lg cursor-pointer transition-colors"><span class="text-[11px] text-slate-600 dark:text-dark-text mr-1">Opacid.</span><input type="checkbox" id="ann-opacity" class="w-3.5 h-3.5 rounded border-gray-300 text-[#0070af] focus:ring-[#0070af]" /></label>
                    <label class="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-dark-bg/50 rounded-lg cursor-pointer transition-colors"><span class="text-[11px] text-slate-600 dark:text-dark-text mr-1">Fill</span><input type="checkbox" id="ann-fill" checked class="w-3.5 h-3.5 rounded border-gray-300 text-[#0070af] focus:ring-[#0070af]" /></label>
                    <label class="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-dark-bg/50 rounded-lg cursor-pointer transition-colors"><span class="text-[11px] text-slate-600 dark:text-dark-text mr-1">Stroke</span><input type="checkbox" id="ann-stroke" checked class="w-3.5 h-3.5 rounded border-gray-300 text-[#0070af] focus:ring-[#0070af]" /></label>
                    <label class="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-dark-bg/50 rounded-lg cursor-pointer transition-colors"><span class="text-[11px] text-slate-600 dark:text-dark-text mr-1">Espes.</span><input type="checkbox" id="ann-stroke-width" checked class="w-3.5 h-3.5 rounded border-gray-300 text-[#0070af] focus:ring-[#0070af]" /></label>
                    <label class="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-dark-bg/50 rounded-lg cursor-pointer transition-colors"><span class="text-[11px] text-slate-600 dark:text-dark-text mr-1">Efeitos</span><input type="checkbox" id="ann-effects" checked class="w-3.5 h-3.5 rounded border-gray-300 text-[#0070af] focus:ring-[#0070af]" /></label>
                    <label class="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-dark-bg/50 rounded-lg cursor-pointer transition-colors"><span class="text-[11px] text-slate-600 dark:text-dark-text mr-1">Fonte</span><input type="checkbox" id="ann-font-family" checked class="w-3.5 h-3.5 rounded border-gray-300 text-[#0070af] focus:ring-[#0070af]" /></label>
                    <label class="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-dark-bg/50 rounded-lg cursor-pointer transition-colors"><span class="text-[11px] text-slate-600 dark:text-dark-text mr-1">Tamanho</span><input type="checkbox" id="ann-font-size" checked class="w-3.5 h-3.5 rounded border-gray-300 text-[#0070af] focus:ring-[#0070af]" /></label>
                    <label class="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-dark-bg/50 rounded-lg cursor-pointer transition-colors"><span class="text-[11px] text-slate-600 dark:text-dark-text mr-1">Peso</span><input type="checkbox" id="ann-font-weight" checked class="w-3.5 h-3.5 rounded border-gray-300 text-[#0070af] focus:ring-[#0070af]" /></label>
                    <label class="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-dark-bg/50 rounded-lg cursor-pointer transition-colors"><span class="text-[11px] text-slate-600 dark:text-dark-text mr-1">Estilo</span><input type="checkbox" id="ann-font-style" class="w-3.5 h-3.5 rounded border-gray-300 text-[#0070af] focus:ring-[#0070af]" /></label>
                    <label class="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-dark-bg/50 rounded-lg cursor-pointer transition-colors"><span class="text-[11px] text-slate-600 dark:text-dark-text mr-1">Alt. Linha</span><input type="checkbox" id="ann-line-height" checked class="w-3.5 h-3.5 rounded border-gray-300 text-[#0070af] focus:ring-[#0070af]" /></label>
                    <label class="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-dark-bg/50 rounded-lg cursor-pointer transition-colors"><span class="text-[11px] text-slate-600 dark:text-dark-text mr-1">Espaçam.</span><input type="checkbox" id="ann-letter-spacing" class="w-3.5 h-3.5 rounded border-gray-300 text-[#0070af] focus:ring-[#0070af]" /></label>
                    <label class="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-dark-bg/50 rounded-lg cursor-pointer transition-colors col-span-2"><span class="text-[11px] text-slate-600 dark:text-dark-text mr-1">Comp. Principal</span><input type="checkbox" id="ann-main-component" checked class="w-3.5 h-3.5 rounded border-gray-300 text-[#0070af] focus:ring-[#0070af]" /></label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <button onclick="executeUnifiedSpec()"
            class="w-full py-3.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl transition-all shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2 mt-4 active:scale-[0.98]">
            <i data-lucide="plus-circle" class="w-4 h-4"></i>
            Criar Nota / Especificação
          </button>
          
          <button id="btn-export-specs" onclick="exportSpecsToMd()"
            class="hidden mt-4 w-full py-2.5 bg-gray-50 dark:bg-dark-surface border border-gray-200 dark:border-dark-line text-slate-600 dark:text-dark-text font-semibold rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 transition-all flex items-center justify-center gap-2 text-[12px]">
            <i data-lucide="download" class="w-4 h-4"></i>
            Exportar Notas Técnicas (.md)
          </button>
          <div id="specs-results" class="mt-4 flex flex-col gap-2"></div>
        </div>

        <!-- TAB 2: FLOW -->
        <div id="specs-flow" class="hidden">
          <p class="text-[12px] text-slate-500 dark:text-dark-muted mb-4">
            Insira elementos de fluxo para documentar a jornada do usuário e criar fluxogramas visuais.
          </p>

          <div class="space-y-6">
            <div class="grid grid-cols-2 gap-3">
              <button onclick="createFlow('line_solid')" class="flex flex-col items-center justify-center p-4 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-line rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800 transition-all group">
                <i data-lucide="arrow-right" class="w-6 h-6 text-slate-400 mb-2 group-hover:text-[#0070af]"></i>
                <span class="text-[11px] font-bold text-slate-600 dark:text-white">Linha Sólida</span>
              </button>
              <button onclick="createFlow('line_dashed')" class="flex flex-col items-center justify-center p-4 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-line rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800 transition-all group">
                <i data-lucide="move-right" class="w-6 h-6 text-slate-400 mb-2 group-hover:text-[#0070af]"></i>
                <span class="text-[11px] font-bold text-slate-600 dark:text-white">Linha Tracejada</span>
              </button>
            </div>

            <div class="p-4 bg-slate-50 dark:bg-slate-900/30 rounded-2xl border border-slate-100 dark:border-dark-line">
              <h4 class="text-[11px] font-bold text-slate-400 uppercase mb-3">Elementos Adicionais</h4>
              <button onclick="createFlow('diamond')" class="w-full flex items-center gap-3 p-3 bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-line rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800 transition-all group">
                <div class="w-8 h-8 rotate-45 border border-slate-300 dark:border-dark-line flex items-center justify-center shrink-0 group-hover:border-[#0070af]">
                  <span class="text-[10px] font-bold -rotate-45 text-slate-400 group-hover:text-[#0070af]">IF</span>
                </div>
                <div class="text-left">
                  <span class="text-[12px] font-bold text-slate-700 dark:text-white block">Ponto de Decisão</span>
                  <span class="text-[10px] text-slate-400">Insere um diamante de lógica</span>
                </div>
              </button>
            </div>

            <div class="pt-4 border-t border-gray-100 dark:border-dark-line">
              <h3 class="text-[13px] font-bold text-slate-800 dark:text-white mb-3">Legendas e Indicadores</h3>
              <button onclick="createLegend()" class="w-full py-3 bg-white dark:bg-dark-surface border border-[#0070af] text-[#0070af] font-bold rounded-xl hover:bg-blue-50 transition-all flex items-center justify-center gap-2">
                <i data-lucide="list" class="w-4 h-4"></i> Gerar Legenda Padrão
              </button>
            </div>
          </div>
        </div>

      </div>
    </main>"""

content = re.sub(r'    <!-- VIEW: SPECIFICATIONS -->\n    <main id="view-specifications".*?    </main>', specs_data, content, flags=re.DOTALL)

with open('src/plugin/ui.html', 'w', encoding='utf-8') as f:
    f.write(content)
