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
});
