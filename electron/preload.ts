import { contextBridge, ipcRenderer } from 'electron';

// Receive API port from main process
ipcRenderer.on('api-port', (_event, port: number) => {
  (window as any).__GPO_API_PORT__ = port;
});

contextBridge.exposeInMainWorld('__electronAPI', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  onApiPort: (callback: (port: number) => void) => {
    ipcRenderer.on('api-port', (_event, port) => callback(port));
  },
  saveAIConfig: (config: unknown) =>
    ipcRenderer.invoke('ai-config-save', config),
  loadAIConfig: (): Promise<unknown | null> =>
    ipcRenderer.invoke('ai-config-load'),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  checkForUpdate: (): Promise<{ version: string; name: string; url: string } | null> =>
    ipcRenderer.invoke('check-for-update'),
  saveBackupFile: (content: string, suggestedName: string): Promise<string | null> =>
    ipcRenderer.invoke('save-backup-file', content, suggestedName),
  openBackupFile: (): Promise<string | null> => ipcRenderer.invoke('open-backup-file'),
});
