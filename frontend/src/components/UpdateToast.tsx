import { X, Download } from 'lucide-react';
import type { UpdateInfo } from '../lib/updateCheck';

interface UpdateToastProps {
  release: UpdateInfo;
  onView: () => void;
  onDismiss: () => void;
}

export function UpdateToast({ release, onView, onDismiss }: UpdateToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 w-80 bg-white dark:bg-surface-900 rounded-xl shadow-2xl border border-surface-200 dark:border-surface-700 p-4 flex flex-col gap-3"
    >
      <div className="flex items-start gap-3">
        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg shrink-0">
          <Download size={18} className="text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-surface-900 dark:text-surface-100">Update available</p>
          <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
            Version {release.version} is available (you have v{__APP_VERSION__}).
          </p>
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="p-1 rounded-sm hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 transition-colors"
        >
          <X size={14} />
        </button>
      </div>
      <div className="flex justify-end gap-2">
        <button
          onClick={onDismiss}
          className="px-3 py-1.5 text-xs rounded-lg text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800"
        >
          Dismiss
        </button>
        <button
          onClick={onView}
          className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium"
        >
          View release
        </button>
      </div>
    </div>
  );
}
