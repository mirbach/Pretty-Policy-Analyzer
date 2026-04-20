import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { setApiPort } from './lib/api';
import './index.css';

// Synchronously set the API port from the URL query string (set by Electron's loadFile)
const _urlPort = new URLSearchParams(window.location.search).get('port');
if (_urlPort) setApiPort(parseInt(_urlPort, 10));

// Belt-and-suspenders: also listen for the IPC api-port event
if ((window as any).__electronAPI?.onApiPort) {
  (window as any).__electronAPI.onApiPort((port: number) => setApiPort(port));
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
