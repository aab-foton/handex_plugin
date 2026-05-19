import re

with open('src/plugin/ui.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace executeAnnotation
execute_unified = """    function executeUnifiedSpec() {
      const g = id => document.getElementById(id);
      const chk = id => { const el = g(id); return el ? el.checked : false; };
      const opts = {
        category: g('ann-category').value,
        letter: g('spec-letter-input') ? g('spec-letter-input').value : "A",
        link: g('spec-link-input') ? g('spec-link-input').value : "",
        note: g('ann-note') ? g('ann-note').value : "",
        include: {
          height: chk('ann-height'),
          width: chk('ann-width'),
          minHeight: chk('ann-min-height'),
          maxHeight: chk('ann-max-height'),
          minWidth: chk('ann-min-width'),
          maxWidth: chk('ann-max-width'),
          direction: chk('ann-direction'),
          alignment: chk('ann-alignment'),
          gap: chk('ann-gap'),
          padding: chk('ann-padding'),
          radius: chk('ann-radius'),
          opacity: chk('ann-opacity'),
          fill: chk('ann-fill'),
          stroke: chk('ann-stroke'),
          strokeWidth: chk('ann-stroke-width'),
          effects: chk('ann-effects'),
          fontFamily: chk('ann-font-family'),
          fontSize: chk('ann-font-size'),
          fontWeight: chk('ann-font-weight'),
          fontStyle: chk('ann-font-style'),
          lineHeight: chk('ann-line-height'),
          letterSpacing: chk('ann-letter-spacing'),
          mainComponent: chk('ann-main-component'),
        }
      };
      parent.postMessage({ pluginMessage: { type: 'create-unified-spec', opts } }, '*');
    }

    function switchSpecTab(tabId) {
      document.getElementById('specs-form').classList.add('hidden');
      document.getElementById('specs-flow').classList.add('hidden');
      
      const tabForm = document.getElementById('tab-specs-form');
      const tabFlow = document.getElementById('tab-specs-flow');
      
      tabForm.classList.replace('border-[#0070af]', 'border-transparent');
      tabForm.classList.replace('text-[#0070af]', 'text-gray-500');
      tabForm.classList.remove('dark:text-blue-400', 'dark:border-blue-400');
      
      tabFlow.classList.replace('border-[#0070af]', 'border-transparent');
      tabFlow.classList.replace('text-[#0070af]', 'text-gray-500');
      tabFlow.classList.remove('dark:text-blue-400', 'dark:border-blue-400');

      document.getElementById(tabId).classList.remove('hidden');
      
      const activeTab = document.getElementById('tab-' + tabId);
      activeTab.classList.replace('border-transparent', 'border-[#0070af]');
      activeTab.classList.replace('text-gray-500', 'text-[#0070af]');
      activeTab.classList.add('dark:text-blue-400', 'dark:border-blue-400');
    }
    
    function exportDesignData(format) {
      parent.postMessage({ pluginMessage: { type: 'export-design-data', format } }, '*');
    }"""

content = re.sub(r'    function executeAnnotation\(\) \{.*?\n    \}', execute_unified, content, flags=re.DOTALL)

# remove createAdvancedSpec
content = re.sub(r'    function createAdvancedSpec\(\) \{.*?\n    \}', '', content, flags=re.DOTALL)

with open('src/plugin/ui.html', 'w', encoding='utf-8') as f:
    f.write(content)
