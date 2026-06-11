import React, { useState } from 'react';
import { Copy, Check, FileJson, FileCode, FileType2, Download, History } from 'lucide-react';
import { Version, PluginFiles } from '../hooks/useVersions';
import { downloadPluginZip } from '../utils/downloadPlugin';

const fileIcons = {
  'manifest.json': FileJson,
  'code.js': FileCode,
  'ui.html': FileType2,
};

const fileLanguages = {
  'manifest.json': 'json',
  'code.js': 'javascript',
  'ui.html': 'html',
};

interface CodeViewerProps {
  versions: Version[];
}

export function CodeViewer({ versions }: CodeViewerProps) {
  const [activeFile, setActiveFile] = useState<keyof PluginFiles>('ui.html');
  const [activeVersionIndex, setActiveVersionIndex] = useState<number>(0);
  const [copied, setCopied] = useState(false);

  const activeVersion = versions[activeVersionIndex];
  const content = activeVersion ? activeVersion.files[activeFile] : '';

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const element = document.createElement("a");
    const file = new Blob([content], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = activeFile;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="flex-1 bg-[#0E1117] text-gray-300 flex flex-col font-sans overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 bg-[#161B22] border-r border-gray-800 flex flex-col">
          <div className="p-4 border-b border-gray-800">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Projeto
            </div>
            <div className="text-sm font-bold text-white flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              HANDEX Plugin
            </div>
          </div>
          
          {/* Version Selector */}
          <div className="p-4 border-b border-gray-800">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <History className="w-3.5 h-3.5" /> Histórico de Versões
            </div>
            <div className="space-y-2">
              {versions.map((v, idx) => {
                const isCurrent = idx === 0;
                const label = isCurrent ? 'Versão Atual' : `Versão Anterior ${idx}`;
                const date = new Date(v.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                return (
                  <button
                    key={v.id}
                    onClick={() => setActiveVersionIndex(idx)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                      activeVersionIndex === idx 
                        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' 
                        : 'bg-gray-800/50 text-gray-400 hover:bg-gray-800 hover:text-gray-200 border border-transparent'
                    }`}
                  >
                    <div className="font-medium">{label}</div>
                    <div className="text-[10px] opacity-70 mt-0.5">{date}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mt-2">
            Arquivos do Plugin
          </div>
          <nav className="flex-1">
            {(Object.keys(fileIcons) as Array<keyof PluginFiles>).map((filename) => {
              const Icon = fileIcons[filename];
              const isActive = activeFile === filename;
              return (
                <button
                  key={filename}
                  onClick={() => setActiveFile(filename)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-all ${
                    isActive 
                      ? 'bg-blue-500/10 text-blue-400 border-r-2 border-blue-500' 
                      : 'hover:bg-gray-800/50 text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-blue-400' : 'text-gray-500'}`} />
                  {filename}
                </button>
              );
            })}
          </nav>
          <div className="p-4 border-t border-gray-800 bg-[#0D1117] flex flex-col gap-3">
            <p className="text-[10px] text-gray-500 leading-tight">
              Baixe a estrutura completa do plugin configurada com Vite, pronta para desenvolvimento.
            </p>
            <button
              onClick={() => downloadPluginZip(activeVersion.files)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-md transition-all shadow-lg shadow-blue-900/20"
            >
              <Download className="w-4 h-4" />
              Baixar Projeto (ZIP)
            </button>
          </div>
        </aside>

        <main className="flex-1 flex flex-col bg-[#0D1117] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-[#161B22] border-b border-gray-800">
            <div className="flex items-center gap-3 text-sm text-gray-400">
              {(() => {
                const ActiveIcon = fileIcons[activeFile];
                return <ActiveIcon className="w-4 h-4 text-blue-400" />;
              })()}
              <span className="font-medium text-gray-200">{activeFile}</span>
              <span className="text-[10px] bg-gray-800 px-1.5 py-0.5 rounded text-gray-500 uppercase">
                {fileLanguages[activeFile]}
              </span>
              {activeVersionIndex > 0 && (
                <span className="ml-2 text-[10px] bg-yellow-500/20 text-yellow-500 px-2 py-0.5 rounded border border-yellow-500/30">
                  Visualizando Versão Antiga
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDownload}
                title="Baixar arquivo"
                className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-md transition-colors"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={handleCopy}
                className={`flex items-center gap-2 px-4 py-1.5 text-xs font-bold rounded-md transition-all ${
                  copied 
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                    : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-900/20'
                }`}
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copiado!' : 'Copiar Código'}
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-6 bg-[#0D1117] selection:bg-blue-500/30">
            <pre className="text-sm font-mono leading-relaxed text-gray-300 whitespace-pre">
              <code>{content}</code>
            </pre>
          </div>
        </main>
      </div>
    </div>
  );
}
