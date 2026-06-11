/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Eye, Code2 } from 'lucide-react';
import { PluginPreview } from './components/PluginPreview';
import { CodeViewer } from './components/CodeViewer';
import { useVersions, PluginFiles } from './hooks/useVersions';

// @ts-ignore
import manifestJson from './plugin/manifest.json?raw';
// @ts-ignore
import codeJs from './plugin/code.js?raw';
// @ts-ignore
import uiHtml from './plugin/ui.html?raw';

export default function App() {
  const [viewMode, setViewMode] = useState<'preview' | 'code'>(() => {
    const saved = localStorage.getItem('handex-view-mode');
    return (saved as 'preview' | 'code') || 'preview';
  });

  const currentFiles: PluginFiles = React.useMemo(() => ({
    'manifest.json': manifestJson,
    'code.js': codeJs,
    'ui.html': uiHtml,
  }), [manifestJson, codeJs, uiHtml]);

  const versions = useVersions(currentFiles);

  const handleViewModeChange = (mode: 'preview' | 'code') => {
    setViewMode(mode);
    localStorage.setItem('handex-view-mode', mode);
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Navigation Bar */}
      <div className="bg-white border-b border-gray-200 p-4 flex items-center justify-center gap-4 shadow-sm z-10">
        <button
          onClick={() => handleViewModeChange('preview')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-colors ${
            viewMode === 'preview' 
              ? 'bg-blue-50 text-blue-600 border border-blue-200' 
              : 'text-gray-600 hover:bg-gray-100 border border-transparent'
          }`}
        >
          <Eye className="w-4 h-4" />
          Preview do Plugin
        </button>
        <button
          onClick={() => handleViewModeChange('code')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-colors ${
            viewMode === 'code' 
              ? 'bg-gray-900 text-white border border-gray-900' 
              : 'text-gray-600 hover:bg-gray-100 border border-transparent'
          }`}
        >
          <Code2 className="w-4 h-4" />
          Ver Código
        </button>
      </div>

      {/* Main Content Area */}
      {viewMode === 'preview' ? (
        <PluginPreview uiHtmlContent={uiHtml} />
      ) : (
        <CodeViewer versions={versions} />
      )}
    </div>
  );
}
