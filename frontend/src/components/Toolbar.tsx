import { useState } from 'react';
import { useScanFolder, useScanUpload, useClear } from '../hooks/useApi';
import type { UploadedFileItem } from '../lib/api';
import type { ScanStatus } from '../types/gpo';
import { exportSelectedGPOs } from '../lib/exportExcel';
import { AISettingsModal } from './AISettingsModal';
import {
  LayoutDashboard,
  GitCompare,
  AlertTriangle,
  Search,
  FolderOpen,
  RefreshCw,
  Sun,
  Moon,
  Trash2,
  FileDown,
  Settings,
} from 'lucide-react';

type View = 'detail' | 'compare' | 'conflicts' | 'search';

/** Recursively collect all files from a FileSystemDirectoryHandle. */
async function collectFiles(
  dirHandle: FileSystemDirectoryHandle,
  prefix = ''
): Promise<UploadedFileItem[]> {
  const files: UploadedFileItem[] = [];
  for await (const [name, handle] of dirHandle as any) {
    const relPath = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === 'file') {
      const file: File = await (handle as FileSystemFileHandle).getFile();
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      files.push({ relative_path: relPath, content_b64: btoa(binary) });
    } else if (handle.kind === 'directory') {
      files.push(...(await collectFiles(handle as FileSystemDirectoryHandle, relPath)));
    }
  }
  return files;
}

interface ToolbarProps {
  status: ScanStatus;
  currentView: View;
  onViewChange: (view: View) => void;
  compareCount: number;
  compareIds: string[];
  onStartCompare: () => void;
  onClearCompare: () => void;
  isDark: boolean;
  onToggleDark: () => void;
}

export function Toolbar({
  status,
  currentView,
  onViewChange,
  compareCount,
  compareIds,
  onStartCompare,
  onClearCompare,
  isDark,
  onToggleDark,
}: ToolbarProps) {
  const [showFolderInput, setShowFolderInput] = useState(false);
  const [folderPath, setFolderPath] = useState(status.folder_path);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [showAISettings, setShowAISettings] = useState(false);
  const scanMutation = useScanFolder();
  const uploadMutation = useScanUpload();
  const clearMutation = useClear();

  const isPending = scanMutation.isPending || uploadMutation.isPending;

  const handleRescan = () => {
    if (status.folder_path) {
      scanMutation.mutate(status.folder_path);
    }
  };

  const handleChangeFolder = async () => {
    // Electron: native OS dialog
    if ((window as any).__electronAPI?.selectFolder) {
      const path = await (window as any).__electronAPI.selectFolder();
      if (path) scanMutation.mutate(path);
      return;
    }
    // Modern browser: real OS folder picker
    if (typeof (window as any).showDirectoryPicker === 'function') {
      try {
        const dirHandle: FileSystemDirectoryHandle = await (window as any).showDirectoryPicker();
        const files = await collectFiles(dirHandle);
        uploadMutation.mutate(files);
      } catch (e: any) {
        if (e.name !== 'AbortError') console.error('Folder picker error', e);
      }
      return;
    }
    // Fallback: inline text input
    setShowFolderInput(true);
  };

  const handleFolderSubmit = () => {
    if (folderPath.trim()) {
      scanMutation.mutate(folderPath.trim());
      setShowFolderInput(false);
    }
  };

  const navItems: { view: View; icon: typeof LayoutDashboard; label: string }[] = [
    { view: 'detail', icon: LayoutDashboard, label: 'Browse' },
    { view: 'conflicts', icon: AlertTriangle, label: 'Conflicts' },
    { view: 'search', icon: Search, label: 'Search' },
  ];

  return (
    <header className="bg-white dark:bg-surface-900 border-b border-surface-200 dark:border-surface-700 px-4 py-2 flex items-center gap-4 shrink-0">
      <h1 className="font-bold text-lg text-surface-800 dark:text-surface-200 mr-2">
        Pretty Policy Analyzer
      </h1>

      <nav className="flex items-center gap-1">
        {navItems.map(({ view, icon: Icon, label }) => (
          <button
            key={view}
            onClick={() => onViewChange(view)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
              currentView === view
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                : 'text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800'
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </nav>

      {/* Compare controls */}
      <div className="flex items-center gap-2 ml-2">
        <button
          onClick={onStartCompare}
          disabled={compareCount < 2}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
            currentView === 'compare'
              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
              : compareCount >= 2
              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50'
              : 'text-surface-400 dark:text-surface-600'
          }`}
        >
          <GitCompare size={16} />
          Compare{compareCount > 0 ? ` (${compareCount})` : ''}
        </button>
        {compareCount > 0 && (
          <button
            onClick={onClearCompare}
            className="text-xs text-surface-400 hover:text-surface-600 dark:hover:text-surface-300"
          >
            Clear
          </button>
        )}
        {compareCount > 0 && (
          <button
            onClick={async () => {
              setIsExporting(true);
              setExportError(null);
              try {
                await exportSelectedGPOs(compareIds);
              } catch (err: any) {
                console.error('Export failed:', err);
                setExportError(err?.message ?? 'Export failed');
              } finally {
                setIsExporting(false);
              }
            }}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors disabled:opacity-50"
            title={`Export ${compareCount} GPO${compareCount !== 1 ? 's' : ''} to Excel`}
          >
            <FileDown size={16} />
            {isExporting ? 'Exporting…' : 'Export'}
          </button>
        )}
        {exportError && (
          <span className="text-xs text-red-500" title={exportError}>Export failed</span>
        )}
      </div>

      <div className="flex-1" />

      {/* Status & folder controls */}
      <div className="flex items-center gap-3 text-sm text-surface-500">
        {showFolderInput ? (
          <div className="flex gap-1">
            <input
              type="text"
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleFolderSubmit()}
              className="px-2 py-1 text-xs border border-surface-300 dark:border-surface-600 rounded bg-surface-50 dark:bg-surface-800 text-surface-900 dark:text-surface-100 w-64"
              placeholder="Enter GPO backup folder path"
              autoFocus
            />
            <button onClick={handleFolderSubmit} className="px-2 py-1 text-xs bg-blue-600 text-white rounded">Go</button>
            <button onClick={() => setShowFolderInput(false)} className="px-2 py-1 text-xs text-surface-400 hover:text-surface-600">Cancel</button>
          </div>
        ) : (
          <>
            <span>{status.gpo_count} GPOs | {status.total_settings} settings</span>
            <button onClick={handleRescan} disabled={isPending} className="p-1 hover:bg-surface-100 dark:hover:bg-surface-800 rounded" title="Rescan folder">
              <RefreshCw size={14} className={isPending ? 'animate-spin' : ''} />
            </button>
            <button onClick={handleChangeFolder} disabled={isPending} className="p-1 hover:bg-surface-100 dark:hover:bg-surface-800 rounded" title="Change folder">
              <FolderOpen size={14} />
            </button>
            <button
              onClick={() => clearMutation.mutate()}
              disabled={clearMutation.isPending}
              className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-surface-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
              title="Clear data / Start over"
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
        <button
          onClick={onToggleDark}
          className="p-1 hover:bg-surface-100 dark:hover:bg-surface-800 rounded text-surface-500 dark:text-surface-400"
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? <Sun size={14} /> : <Moon size={14} />}
        </button>
        <button
          onClick={() => setShowAISettings(true)}
          className="p-1 hover:bg-surface-100 dark:hover:bg-surface-800 rounded text-surface-500 dark:text-surface-400"
          title="AI Settings"
        >
          <Settings size={14} />
        </button>
      </div>
      {showAISettings && <AISettingsModal onClose={() => setShowAISettings(false)} />}
    </header>
  );
}
