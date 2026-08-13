import { useEffect, useRef, useState } from 'react';
import { useScanFolder, useScanUpload, useClear, useImportLocalPolicy } from '../hooks/useApi';
import type { UploadedFileItem } from '../lib/api';
import type { ScanStatus } from '../types/gpo';
import { exportSelectedGPOs } from '../lib/exportExcel';
import { buildBackupBundle, parseBackupBundle, applyBackupBundle, backupFilename, saveBackupFile, openBackupFile, type AiCacheStore } from '../lib/backup';
import type { MigrationStatusStore } from '../lib/migrationStatus';
import { AISettingsModal } from './AISettingsModal';
import { AboutModal } from './AboutModal';
import logo from '../assets/PPALogo.png';
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
  ShieldCheck,
  Monitor,
  Info,
  ListChecks,
  Archive,
  ArchiveRestore,
  Menu,
  X,
} from 'lucide-react';

type View = 'detail' | 'compare' | 'conflicts' | 'search' | 'baseline' | 'migration';

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
  aiCache: AiCacheStore;
  migrationStatusStore: MigrationStatusStore;
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
  aiCache,
  migrationStatusStore,
}: ToolbarProps) {
  const [showFolderInput, setShowFolderInput] = useState(false);
  const [folderPath, setFolderPath] = useState(status.folder_path);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [showAISettings, setShowAISettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const scanMutation = useScanFolder();
  const uploadMutation = useScanUpload();
  const clearMutation = useClear();
  const importLocalMutation = useImportLocalPolicy();

  const isPending = scanMutation.isPending || uploadMutation.isPending || importLocalMutation.isPending;

  const handleBackup = async () => {
    setBackupError(null);
    setIsBackingUp(true);
    try {
      const bundle = await buildBackupBundle(aiCache, migrationStatusStore);
      await saveBackupFile(JSON.stringify(bundle), backupFilename());
    } catch (err: any) {
      setBackupError(err?.message ?? 'Backup failed');
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleRestore = async () => {
    setRestoreError(null);
    try {
      const raw = await openBackupFile();
      if (!raw) return;
      const bundle = parseBackupBundle(raw);
      const confirmed = window.confirm(
        `Restore backup from ${new Date(bundle.exportedAt).toLocaleString()}?\n\nThis replaces all currently loaded GPOs, AI-generated cache, and migration status with the backup's contents.`
      );
      if (!confirmed) return;
      setIsRestoring(true);
      await applyBackupBundle(bundle);
      window.location.reload();
    } catch (err: any) {
      setRestoreError(err?.message ?? 'Restore failed');
    } finally {
      setIsRestoring(false);
    }
  };

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

  useEffect(() => {
    if (!showMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  const hasPending = isPending || isBackingUp || isRestoring;
  const hasError = !!(importError || backupError || restoreError);

  const menuItemClass =
    'w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-surface-100 dark:hover:bg-surface-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors';

  const navItems: { view: View; icon: typeof LayoutDashboard; label: string }[] = [
    { view: 'detail', icon: LayoutDashboard, label: 'Browse' },
    { view: 'conflicts', icon: AlertTriangle, label: 'Conflicts' },
    { view: 'search', icon: Search, label: 'Search' },
    { view: 'baseline', icon: ShieldCheck, label: 'Baseline' },
    { view: 'migration', icon: ListChecks, label: 'Migration' },
  ];

  return (
    <header className="bg-white dark:bg-surface-900 border-b border-surface-200 dark:border-surface-700 px-4 py-2 flex items-center gap-4 shrink-0">
      <img src={logo} alt="Pretty Policy Analyzer" className="h-8 w-auto" />
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
          <span>{status.gpo_count} GPOs | {status.total_settings} settings</span>
        )}

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowMenu((v) => !v)}
            className="relative p-1 hover:bg-surface-100 dark:hover:bg-surface-800 rounded text-surface-500 dark:text-surface-400"
            title="Menu"
          >
            {showMenu ? <X size={16} /> : <Menu size={16} />}
            {!showMenu && (hasError || hasPending) && (
              <span
                className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${
                  hasError ? 'bg-red-500' : 'bg-blue-500 animate-pulse'
                }`}
              />
            )}
          </button>

          {showMenu && (
            <div className="absolute right-0 top-full mt-1 w-72 bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-lg shadow-lg z-50 py-1 text-surface-700 dark:text-surface-300">
              <button
                onClick={() => { setShowMenu(false); handleRescan(); }}
                disabled={isPending}
                className={menuItemClass}
              >
                <RefreshCw size={15} className={isPending ? 'animate-spin' : ''} />
                Rescan folder
              </button>
              <button
                onClick={() => { setShowMenu(false); handleChangeFolder(); }}
                disabled={isPending}
                className={menuItemClass}
              >
                <FolderOpen size={15} />
                Change folder
              </button>
              <button
                onClick={() => {
                  setShowMenu(false);
                  setImportError(null);
                  importLocalMutation.mutate(undefined, {
                    onError: (err: any) => {
                      setImportError(err?.response?.data?.detail ?? err?.message ?? 'Import failed');
                    },
                  });
                }}
                disabled={isPending}
                className={menuItemClass}
                title="Import effective policy from this machine (runs gpresult)"
              >
                <Monitor size={15} />
                Import from this machine
              </button>

              <div className="my-1 border-t border-surface-200 dark:border-surface-700" />

              <button onClick={() => { setShowMenu(false); handleBackup(); }} disabled={isBackingUp} className={menuItemClass}>
                <Archive size={15} className={isBackingUp ? 'animate-pulse' : ''} />
                Backup data
              </button>
              <button onClick={() => { setShowMenu(false); handleRestore(); }} disabled={isRestoring} className={menuItemClass}>
                <ArchiveRestore size={15} className={isRestoring ? 'animate-pulse' : ''} />
                Restore backup
              </button>

              <div className="my-1 border-t border-surface-200 dark:border-surface-700" />

              <button
                onClick={() => { setShowMenu(false); clearMutation.mutate(); }}
                disabled={clearMutation.isPending}
                className={`${menuItemClass} text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20`}
              >
                <Trash2 size={15} />
                Clear data / start over
              </button>

              <div className="my-1 border-t border-surface-200 dark:border-surface-700" />

              <button onClick={() => { setShowMenu(false); onToggleDark(); }} className={menuItemClass}>
                {isDark ? <Sun size={15} /> : <Moon size={15} />}
                {isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              </button>
              <button onClick={() => { setShowMenu(false); setShowAISettings(true); }} className={menuItemClass}>
                <Settings size={15} />
                AI settings
              </button>
              <button onClick={() => { setShowMenu(false); setShowAbout(true); }} className={menuItemClass}>
                <Info size={15} />
                About
              </button>

              {(importError || backupError || restoreError) && (
                <>
                  <div className="my-1 border-t border-surface-200 dark:border-surface-700" />
                  {importError && (
                    <div className="px-3 py-1 text-xs text-red-500 truncate" title={importError}>{importError}</div>
                  )}
                  {backupError && (
                    <div className="px-3 py-1 text-xs text-red-500 truncate" title={backupError}>{backupError}</div>
                  )}
                  {restoreError && (
                    <div className="px-3 py-1 text-xs text-red-500 truncate" title={restoreError}>{restoreError}</div>
                  )}
                </>
              )}
              {importLocalMutation.isPending && (
                <div className="px-3 py-1 text-xs text-blue-500 animate-pulse">Collecting policy…</div>
              )}
            </div>
          )}
        </div>
      </div>
      {showAISettings && <AISettingsModal onClose={() => setShowAISettings(false)} />}
      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
    </header>
  );
}
