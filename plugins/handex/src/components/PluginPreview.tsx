import React from 'react';

interface PluginPreviewProps {
  uiHtmlContent: string;
}

export function PluginPreview({ uiHtmlContent }: PluginPreviewProps) {
  return (
    <div className="flex-1 bg-[#E5E5E5] dark:bg-[#1e1e1e] flex items-center justify-center p-8 overflow-auto transition-colors duration-300">
      <div className="w-[450px] h-[700px] bg-white dark:bg-dark-bg shadow-2xl rounded-lg overflow-hidden border border-gray-300 dark:border-gray-800 flex flex-col relative shrink-0 transition-all duration-300">
        <iframe 
          srcDoc={uiHtmlContent}
          className="w-full h-full border-none"
          title="Plugin Preview"
          sandbox="allow-scripts allow-same-origin"
        />
      </div>
    </div>
  );
}
