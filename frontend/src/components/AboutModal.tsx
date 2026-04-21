import { X, ExternalLink, Shield } from 'lucide-react';

interface AboutModalProps {
  onClose: () => void;
}

export function AboutModal({ onClose }: AboutModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-surface-900 rounded-xl shadow-2xl border border-surface-200 dark:border-surface-700 w-80 p-6 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Shield size={22} className="text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="font-semibold text-surface-900 dark:text-surface-100 text-base leading-tight">
                Pretty Policy Analyzer
              </h2>
              <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
                GPO Security Analysis Tool
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Version info */}
        <div className="bg-surface-50 dark:bg-surface-800 rounded-lg px-4 py-3 flex flex-col gap-2 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-surface-500 dark:text-surface-400">Version</span>
            <span className="font-mono font-medium text-surface-800 dark:text-surface-200">
              v{__APP_VERSION__}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-surface-500 dark:text-surface-400">Build</span>
            <span className="font-mono font-medium text-surface-800 dark:text-surface-200">
              {__APP_BUILD__}
            </span>
          </div>
        </div>

        {/* GitHub link */}
        <button
          onClick={() => {
            const url = 'https://github.com/mirbach/Pretty-Policy-Analyzer';
            if ((window as any).__electronAPI?.openExternal) {
              (window as any).__electronAPI.openExternal(url);
            } else {
              window.open(url, '_blank', 'noopener,noreferrer');
            }
          }}
          className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-surface-900 dark:bg-surface-100 text-white dark:text-surface-900 text-sm font-medium hover:bg-surface-700 dark:hover:bg-surface-200 transition-colors"
        >
          <ExternalLink size={16} />
          View on GitHub
        </button>
      </div>
    </div>
  );
}
