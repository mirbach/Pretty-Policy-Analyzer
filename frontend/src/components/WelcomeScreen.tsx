import { useState, useRef } from 'react';
import { useScanFolder, useScanUpload, useImportLocalPolicy } from '../hooks/useApi';
import type { UploadedFileItem } from '../lib/api';
import logo from '../assets/PPALogo.png';
import { FolderOpen, AlertCircle, ArrowRight, Loader, Monitor } from 'lucide-react';

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
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      files.push({ relative_path: relPath, content_b64: btoa(binary) });
    } else if (handle.kind === 'directory') {
      const sub = await collectFiles(handle as FileSystemDirectoryHandle, relPath);
      files.push(...sub);
    }
  }
  return files;
}

export function WelcomeScreen() {
  const [isReading, setIsReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [showInput, setShowInput] = useState(false);
  const [folderPath, setFolderPath] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scanMutation = useScanFolder();
  const uploadMutation = useScanUpload();
  const localMutation = useImportLocalPolicy();

  const isPending = scanMutation.isPending || uploadMutation.isPending || isReading || localMutation.isPending;
  const isError = scanMutation.isError || uploadMutation.isError || !!readError;
  const errorMsg =
    readError ||
    (scanMutation.error as any)?.response?.data?.detail ||
    (uploadMutation.error as any)?.response?.data?.detail ||
    'Failed to scan folder';
  const data = scanMutation.data ?? uploadMutation.data;

  const handleSelectFolder = async () => {
    setReadError(null);

    // Electron: native OS dialog → backend reads from local path
    if ((window as any).__electronAPI?.selectFolder) {
      const path = await (window as any).__electronAPI.selectFolder();
      if (path) scanMutation.mutate(path);
      return;
    }

    // Modern browser: File System Access API – real OS folder picker
    if (typeof (window as any).showDirectoryPicker === 'function') {
      try {
        const dirHandle: FileSystemDirectoryHandle = await (window as any).showDirectoryPicker();
        setIsReading(true);
        const files = await collectFiles(dirHandle);
        setIsReading(false);
        uploadMutation.mutate(files);
      } catch (e: any) {
        setIsReading(false);
        if (e.name !== 'AbortError') {
          setReadError('Could not read folder: ' + (e.message ?? String(e)));
        }
      }
      return;
    }

    // Fallback (Firefox / older browsers): inline text input
    setShowInput(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleSubmit = () => {
    if (folderPath.trim()) scanMutation.mutate(folderPath.trim());
  };

  return (
    <div className="h-screen flex items-center justify-center bg-surface-50 dark:bg-surface-950">
      <div className="max-w-lg w-full mx-4">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <img
              src={logo}
              alt="Pretty Policy Analyzer logo"
              className="h-24 w-auto drop-shadow-sm"
            />
          </div>
          <h1 className="text-3xl font-bold text-surface-900 dark:text-surface-100 mb-2">
            Pretty Policy Analyzer
          </h1>
          <p className="text-surface-500">
            Analyze, compare, and find conflicts in Active Directory Group Policy backups
          </p>
        </div>

        <div className="bg-white dark:bg-surface-800 rounded-lg shadow-lg p-6">
          <h2 className="text-lg font-semibold mb-4 text-surface-800 dark:text-surface-200">
            Select GPO Backup Folder
          </h2>

          <div className="space-y-3">
            {!showInput ? (
              <button
                onClick={handleSelectFolder}
                disabled={isPending}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-surface-400 text-white rounded-lg transition-colors"
              >
                {(scanMutation.isPending || uploadMutation.isPending || isReading) ? <Loader size={20} className="animate-spin" /> : <FolderOpen size={20} />}
                {isReading ? 'Reading files…' : (scanMutation.isPending || uploadMutation.isPending) ? 'Scanning…' : 'Browse for GPO Backup Folder'}
              </button>
            ) : (
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={folderPath}
                  onChange={(e) => setFolderPath(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                  placeholder="C:\GPOBackups"
                  className="flex-1 px-3 py-2 border border-surface-300 dark:border-surface-600 rounded-lg bg-surface-50 dark:bg-surface-900 text-surface-900 dark:text-surface-100 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleSubmit}
                  disabled={!folderPath.trim() || isPending}
                  aria-label="Submit folder path"
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-surface-400 text-white rounded-lg transition-colors"
                >
                  <ArrowRight size={18} />
                </button>
              </div>
            )}

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-surface-200 dark:border-surface-700" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-2 bg-white dark:bg-surface-800 text-surface-400">or</span>
              </div>
            </div>

            <button
              onClick={() => {
                setLocalError(null);
                localMutation.mutate(undefined, {
                  onError: (err: any) => {
                    setLocalError(err?.response?.data?.detail ?? err?.message ?? 'Local policy scan failed');
                  },
                });
              }}
              disabled={isPending}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-surface-700 hover:bg-surface-600 dark:bg-surface-700 dark:hover:bg-surface-600 disabled:bg-surface-400 text-white rounded-lg transition-colors"
            >
              {localMutation.isPending ? <Loader size={20} className="animate-spin" /> : <Monitor size={20} />}
              {localMutation.isPending ? 'Collecting policy…' : "Scan This Machine's Policies"}
            </button>

            {isError && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
                <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
                <span className="text-sm text-red-700 dark:text-red-400">{errorMsg}</span>
              </div>
            )}

            {localError && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
                <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
                <span className="text-sm text-red-700 dark:text-red-400">{localError}</span>
              </div>
            )}
          </div>

          {data && data.gpo_count === 0 && (
            <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <span className="text-sm text-yellow-700 dark:text-yellow-400">
                No GPO backups found in this folder. Expected GUID-named subfolders with Backup.xml / bkupInfo.xml / gpreport.xml files.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
