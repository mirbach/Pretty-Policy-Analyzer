import { useState, useRef } from 'react';
import {
  useBaselines,
  useUploadBaseline,
  useScanBaseline,
  useClearBaselines,
  useBaselineCompliance,
  useStatus,
} from '../hooks/useApi';
import type { UploadedFileItem } from '../lib/api';
import type { BaselineViolation } from '../types/gpo';
import {
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  FolderOpen,
  Loader,
  ChevronDown,
  ChevronRight,
  Trash2,
  Search,
  AlertTriangle,
} from 'lucide-react';

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

type FilterTab = 'all' | 'missing' | 'wrong_value' | 'compliant';

function ViolationRow({ v }: { v: BaselineViolation }) {
  const [open, setOpen] = useState(false);

  const statusColor =
    v.status === 'missing'
      ? 'text-red-600 dark:text-red-400'
      : v.status === 'wrong_value'
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-green-600 dark:text-green-400';

  const statusBg =
    v.status === 'missing'
      ? 'bg-red-50 dark:bg-red-900/20'
      : v.status === 'wrong_value'
      ? 'bg-amber-50 dark:bg-amber-900/20'
      : 'bg-green-50 dark:bg-green-900/20';

  const StatusIcon =
    v.status === 'missing' ? ShieldOff : v.status === 'wrong_value' ? ShieldAlert : ShieldCheck;

  return (
    <div className={`border-b border-surface-100 dark:border-surface-800 ${statusBg}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left px-4 py-2.5 flex items-start gap-3"
      >
        <StatusIcon size={14} className={`${statusColor} shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-0">
          <div className="text-sm text-surface-800 dark:text-surface-200 truncate font-medium">
            {v.display_name}
          </div>
          <div className="text-xs text-surface-500 truncate">
            {v.key_path}{v.value_name ? ` → ${v.value_name}` : ''}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {v.status !== 'compliant' && (
            <span className="text-xs text-surface-400">{v.category}</span>
          )}
          <span className={`text-xs font-medium ${statusColor}`}>
            {v.status === 'missing' ? 'Missing' : v.status === 'wrong_value' ? 'Wrong value' : 'Compliant'}
          </span>
          {open ? <ChevronDown size={14} className="text-surface-400" /> : <ChevronRight size={14} className="text-surface-400" />}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-3 pl-11 space-y-2 text-xs">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <div><span className="text-surface-400">Expected state:</span> <span className="font-medium">{v.expected_state}</span></div>
            <div><span className="text-surface-400">Expected value:</span> <span className="font-mono">{v.expected_value_display || String(v.expected_value ?? '')}</span></div>
            <div><span className="text-surface-400">Scope:</span> {v.scope}</div>
            <div><span className="text-surface-400">Category:</span> {v.category || '—'}</div>
          </div>

          {v.gpo_findings.length > 0 && (
            <div className="mt-2">
              <div className="text-surface-400 mb-1">GPO findings:</div>
              <div className="space-y-1">
                {v.gpo_findings.map((f) => (
                  <div
                    key={f.gpo_id}
                    className={`flex items-center gap-2 px-2 py-1 rounded ${
                      f.matches
                        ? 'bg-green-100 dark:bg-green-900/30'
                        : 'bg-amber-100 dark:bg-amber-900/30'
                    }`}
                  >
                    {f.matches
                      ? <ShieldCheck size={11} className="text-green-600 dark:text-green-400 shrink-0" />
                      : <ShieldAlert size={11} className="text-amber-600 dark:text-amber-400 shrink-0" />}
                    <span className="font-medium text-surface-700 dark:text-surface-300 truncate">{f.gpo_name}</span>
                    <span className="text-surface-500 ml-auto shrink-0">{f.state}: <span className="font-mono">{f.value_display || String(f.value ?? '')}</span></span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {v.status === 'missing' && (
            <div className="text-surface-400 italic">
              No uploaded GPO configures this setting.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function BaselineView() {
  const { data: baselines = [], isLoading: baselinesLoading } = useBaselines();
  const { data: status } = useStatus();
  const gpoCount = status?.gpo_count ?? 0;
  const uploadMutation = useUploadBaseline();
  const scanMutation = useScanBaseline();
  const clearMutation = useClearBaselines();

  const [selectedBaselineId, setSelectedBaselineId] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [showFolderInput, setShowFolderInput] = useState(false);
  const [folderPath, setFolderPath] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const folderInputRef = useRef<HTMLInputElement>(null);

  const effectiveBaselineId = selectedBaselineId ?? baselines[0]?.id ?? null;
  const { data: report, isLoading: reportLoading, error: reportError } = useBaselineCompliance(effectiveBaselineId, gpoCount);

  const isPending = uploadMutation.isPending || scanMutation.isPending || isReading;
  const uploadError =
    readError ||
    (uploadMutation.error as any)?.response?.data?.detail ||
    (scanMutation.error as any)?.response?.data?.detail;

  const handleLoadBaseline = async () => {
    setReadError(null);
    if ((window as any).__electronAPI?.selectFolder) {
      const path = await (window as any).__electronAPI.selectFolder();
      if (path) scanMutation.mutate(path);
      return;
    }
    if (typeof (window as any).showDirectoryPicker === 'function') {
      try {
        const dirHandle: FileSystemDirectoryHandle = await (window as any).showDirectoryPicker();
        setIsReading(true);
        const files = await collectFiles(dirHandle);
        setIsReading(false);
        uploadMutation.mutate(files);
      } catch (e: any) {
        setIsReading(false);
        if (e.name !== 'AbortError') setReadError('Could not read folder: ' + (e.message ?? String(e)));
      }
      return;
    }
    setShowFolderInput(true);
    setTimeout(() => folderInputRef.current?.focus(), 0);
  };

  const handleFolderSubmit = () => {
    if (folderPath.trim()) {
      scanMutation.mutate(folderPath.trim());
      setShowFolderInput(false);
    }
  };

  // Filter violations based on tab + search
  const allViolations = report ? [...report.violations] : [];
  const allCompliant = report ? [...report.compliant] : [];

  const filterItems = (items: BaselineViolation[]) => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter(
      (v) =>
        v.display_name.toLowerCase().includes(q) ||
        v.key_path.toLowerCase().includes(q) ||
        v.category.toLowerCase().includes(q)
    );
  };

  const displayItems: BaselineViolation[] = (() => {
    switch (activeTab) {
      case 'missing': return filterItems(allViolations.filter((v) => v.status === 'missing'));
      case 'wrong_value': return filterItems(allViolations.filter((v) => v.status === 'wrong_value'));
      case 'compliant': return filterItems(allCompliant);
      default: return filterItems([...allViolations, ...allCompliant]);
    }
  })();

  const compliancePct = report && report.total_baseline_settings > 0
    ? Math.round((report.compliant_count / report.total_baseline_settings) * 100)
    : 0;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold text-surface-800 dark:text-surface-200 flex items-center gap-2">
            <ShieldCheck size={20} className="text-blue-600" />
            Security Baseline Compliance
          </h2>
          <div className="flex items-center gap-2">
            {baselines.length > 0 && (
              <button
                onClick={() => clearMutation.mutate()}
                disabled={clearMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                title="Remove all baselines"
              >
                <Trash2 size={13} />
                Clear baselines
              </button>
            )}
            {!showFolderInput ? (
              <button
                onClick={handleLoadBaseline}
                disabled={isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-surface-400 text-white text-xs font-medium rounded-md transition-colors"
              >
                {isPending ? <Loader size={13} className="animate-spin" /> : <FolderOpen size={13} />}
                {isPending ? 'Loading…' : 'Load Baseline'}
              </button>
            ) : (
              <div className="flex gap-1.5">
                <input
                  ref={folderInputRef}
                  type="text"
                  value={folderPath}
                  onChange={(e) => setFolderPath(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleFolderSubmit()}
                  placeholder="C:\SecurityBaselines"
                  className="text-xs px-2 py-1.5 border border-surface-300 dark:border-surface-600 rounded bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 w-56 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button onClick={handleFolderSubmit} className="px-2 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded">Scan</button>
                <button onClick={() => setShowFolderInput(false)} className="px-2 py-1.5 text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800 text-xs rounded">✕</button>
              </div>
            )}
          </div>
        </div>

        {uploadError && (
          <div className="flex items-center gap-2 p-2 bg-red-50 dark:bg-red-900/20 rounded text-red-600 dark:text-red-400 text-xs mb-2">
            <AlertTriangle size={13} /> {uploadError}
          </div>
        )}

        {/* Baseline selector (if multiple) */}
        {baselines.length > 1 && (
          <div className="flex items-center gap-2">
            <label htmlFor="baseline-select" className="text-xs text-surface-500">Baseline:</label>
            <select
              id="baseline-select"
              value={effectiveBaselineId ?? ''}
              onChange={(e) => setSelectedBaselineId(e.target.value || null)}
              className="text-xs px-2 py-1 border border-surface-300 dark:border-surface-600 rounded bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {baselines.map((b) => (
                <option key={b.id} value={b.id}>{b.display_name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* No baselines loaded */}
      {!baselinesLoading && baselines.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm">
            <ShieldCheck size={48} className="text-surface-300 dark:text-surface-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-surface-700 dark:text-surface-300 mb-2">
              No Security Baseline Loaded
            </h3>
            <p className="text-sm text-surface-500 mb-4">
              Load a Microsoft Security Baseline (provided as a GPO backup) to check your policies for compliance gaps.
            </p>
            <p className="text-xs text-surface-400">
              Download baselines from{' '}
              <span className="font-mono text-blue-600 dark:text-blue-400">
                aka.ms/baselines
              </span>
              {' '}and extract the GPO Backup folder.
            </p>
          </div>
        </div>
      )}

      {/* No GPOs loaded warning */}
      {baselines.length > 0 && gpoCount === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm">
            <AlertTriangle size={48} className="text-amber-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-surface-700 dark:text-surface-300 mb-2">
              No GPOs Loaded
            </h3>
            <p className="text-sm text-surface-500">
              Load your GPO backups first (via the folder picker in the toolbar), then return here to run the compliance check.
            </p>
          </div>
        </div>
      )}

      {/* Loading report */}
      {reportLoading && baselines.length > 0 && gpoCount > 0 && (
        <div className="flex-1 flex items-center justify-center">
          <Loader size={24} className="animate-spin text-surface-400" />
        </div>
      )}

      {/* Report error */}
      {reportError && (
        <div className="p-4 text-red-500 text-sm flex items-center gap-2">
          <AlertTriangle size={16} />
          {(reportError as any)?.response?.data?.detail ?? 'Failed to run compliance check'}
        </div>
      )}

      {/* Compliance report */}
      {report && (
        <>
          {/* Stats bar */}
          <div className="px-4 py-3 border-b border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 shrink-0">
            <div className="flex items-center gap-1 mb-2">
              <span className="text-xs text-surface-500 dark:text-surface-400 mr-1">
                {report.baseline_name} — {report.total_baseline_settings} settings
              </span>
              <span
                className="ml-auto text-sm font-bold"
                style={{ color: compliancePct >= 80 ? '#4ade80' : compliancePct >= 50 ? '#fbbf24' : '#f87171' }}
              >
                {compliancePct}% compliant
              </span>
            </div>
            {/* Progress bar */}
            <div className="h-2 rounded-full bg-surface-200 dark:bg-surface-700 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${compliancePct}%`,
                  backgroundColor: compliancePct >= 80 ? '#16a34a' : compliancePct >= 50 ? '#d97706' : '#dc2626',
                }}
              />
            </div>
            {/* Counts */}
            <div className="flex gap-4 mt-2 text-xs">
              <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                <ShieldCheck size={12} /> {report.compliant_count} compliant
              </span>
              <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <ShieldAlert size={12} /> {report.wrong_value_count} wrong value
              </span>
              <span className="text-red-600 dark:text-red-400 flex items-center gap-1">
                <ShieldOff size={12} /> {report.missing_count} missing
              </span>
            </div>
          </div>

          {/* Filter tabs + search */}
          <div className="px-4 py-2 border-b border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 flex items-center gap-3 shrink-0">
            <div className="flex gap-1">
              {([
                { id: 'all', label: 'All', count: report.total_baseline_settings },
                { id: 'missing', label: 'Missing', count: report.missing_count },
                { id: 'wrong_value', label: 'Wrong Value', count: report.wrong_value_count },
                { id: 'compliant', label: 'Compliant', count: report.compliant_count },
              ] as const).map(({ id, label, count }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    activeTab === id
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                      : 'text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800'
                  }`}
                >
                  {label} <span className="opacity-60">({count})</span>
                </button>
              ))}
            </div>
            <div className="ml-auto relative">
              <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-surface-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter settings…"
                className="pl-7 pr-3 py-1 text-xs border border-surface-300 dark:border-surface-600 rounded bg-surface-50 dark:bg-surface-800 text-surface-900 dark:text-surface-100 w-48 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Violation list */}
          <div className="flex-1 overflow-y-auto">
            {displayItems.length === 0 ? (
              <div className="p-8 text-center text-surface-400 text-sm">
                {search ? 'No matching settings' : 'No items in this category'}
              </div>
            ) : (
              displayItems.map((v, i) => (
                <ViolationRow key={`${v.key_path}||${v.value_name}||${i}`} v={v} />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
