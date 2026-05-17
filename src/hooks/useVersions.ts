import { useState, useEffect } from 'react';

export type PluginFiles = {
  'manifest.json': string;
  'code.js': string;
  'ui.html': string;
};

export type Version = {
  id: string;
  timestamp: number;
  files: PluginFiles;
};

const MAX_VERSIONS = 3;
const STORAGE_KEY = 'handex-plugin-versions';

export function useVersions(currentFiles: PluginFiles) {
  const [versions, setVersions] = useState<Version[]>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.error('Failed to parse versions from localStorage', e);
      }
    }
    return [];
  });

  useEffect(() => {
    const currentFilesString = JSON.stringify(currentFiles);

    setVersions(prevVersions => {
      const latestVersionString = prevVersions.length > 0 ? JSON.stringify(prevVersions[0].files) : null;

      if (currentFilesString !== latestVersionString) {
        const newVersion: Version = {
          id: Math.random().toString(36).substring(2, 9),
          timestamp: Date.now(),
          files: currentFiles,
        };
        
        const newVersions = [newVersion, ...prevVersions].slice(0, MAX_VERSIONS);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newVersions));
        return newVersions;
      }
      return prevVersions;
    });
  }, [currentFiles]);

  if (versions.length === 0) {
    return [{
      id: 'initial',
      timestamp: Date.now(),
      files: currentFiles,
    }];
  }

  return versions;
}
