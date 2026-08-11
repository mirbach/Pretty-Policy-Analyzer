import { useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useGPOs } from '../hooks/useApi';
import { getGPO } from '../lib/api';
import { exportMigrationReport, type MigrationReportRow } from '../lib/exportExcel';
import type { PolicySetting } from '../types/gpo';
import {
  gpoStatusKey,
  settingStatusKey,
  MIGRATION_STATUS_LABELS,
  type MigrationStatus,
  type MigrationStatusStore,
} from '../lib/migrationStatus';
import { ListChecks, Search, Loader, CheckCircle2, XCircle, Circle, AlertTriangle, FileDown } from 'lucide-react';

type FilterTab = 'all' | MigrationStatus;

type ReportRow = MigrationReportRow;

const STATUS_BADGE: Record<MigrationStatus, { icon: typeof CheckCircle2; className: string }> = {
  not_migrated: { icon: Circle, className: 'text-surface-400' },
  migrated: { icon: CheckCircle2, className: 'text-green-600 dark:text-green-400' },
  wont_migrate: { icon: XCircle, className: 'text-amber-600 dark:text-amber-400' },
};

function settingRow(s: PolicySetting, gpoName: string, status: MigrationStatus, reason?: string): ReportRow {
  return {
    gpoName,
    scope: s.scope,
    category: s.category,
    displayName: s.display_name || s.value_name || s.key_path,
    keyPath: s.key_path,
    valueName: s.value_name,
    value: s.value_display || String(s.value ?? ''),
    state: s.state,
    status,
    reason,
  };
}

interface Props {
  migrationStatusStore: MigrationStatusStore;
}

export function MigrationReportView({ migrationStatusStore }: Props) {
  const { data: gpoList, isLoading: gposLoading } = useGPOs();
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const gpoQueries = useQueries({
    queries: (gpoList ?? []).map((info) => ({
      queryKey: ['gpo', info.id],
      queryFn: () => getGPO(info.id),
    })),
  });

  const detailsLoading = gpoQueries.some((q) => q.isLoading);

  const rows: ReportRow[] = [];
  for (const q of gpoQueries) {
    const detail = q.data;
    if (!detail) continue;
    const gKey = gpoStatusKey(detail.info);
    const statusMap = migrationStatusStore[gKey] ?? {};
    for (const s of detail.settings) {
      const entry = statusMap[settingStatusKey(s)];
      rows.push(settingRow(s, detail.info.display_name, entry?.status ?? 'not_migrated', entry?.reason));
    }
  }

  const totalCount = rows.length;
  const migratedCount = rows.filter((r) => r.status === 'migrated').length;
  const wontMigrateRows = rows.filter((r) => r.status === 'wont_migrate');
  const wontMigrateCount = wontMigrateRows.length;
  const notMigratedCount = totalCount - migratedCount - wontMigrateCount;
  const reasonMissingCount = wontMigrateRows.filter((r) => !r.reason).length;
  const migratedPct = totalCount > 0 ? Math.round((migratedCount / totalCount) * 100) : 0;

  const filterItems = (items: ReportRow[]) => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter(
      (r) =>
        r.displayName.toLowerCase().includes(q) ||
        r.gpoName.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q)
    );
  };

  const displayRows = filterItems(activeTab === 'all' ? rows : rows.filter((r) => r.status === activeTab));

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: totalCount },
    { key: 'migrated', label: 'Migrated', count: migratedCount },
    { key: 'not_migrated', label: 'Not Migrated', count: notMigratedCount },
    { key: 'wont_migrate', label: "Won't Migrate", count: wontMigrateCount },
  ];

  const isLoading = gposLoading || detailsLoading;

  const handleExport = async () => {
    setIsExporting(true);
    setExportError(null);
    try {
      await exportMigrationReport(rows);
    } catch (err: any) {
      console.error('Migration report export failed:', err);
      setExportError(err?.message ?? 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold text-surface-800 dark:text-surface-200 flex items-center gap-2">
            <ListChecks size={20} className="text-blue-600" />
            Intune Migration Report
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              disabled={isExporting || totalCount === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors disabled:opacity-50"
              title="Export the full migration report to Excel"
            >
              <FileDown size={16} />
              {isExporting ? 'Exporting…' : 'Export'}
            </button>
            {exportError && (
              <span className="text-xs text-red-500" title={exportError}>Export failed</span>
            )}
          </div>
        </div>

        <div className="relative max-w-md">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search settings, GPOs, categories..."
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-surface-300 dark:border-surface-600 rounded-md bg-surface-50 dark:bg-surface-800 text-surface-900 dark:text-surface-100 placeholder-surface-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <Loader size={24} className="animate-spin text-surface-400" />
        </div>
      )}

      {!isLoading && totalCount === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm">
            <ListChecks size={48} className="text-surface-300 dark:text-surface-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-surface-700 dark:text-surface-300 mb-2">No Settings Loaded</h3>
            <p className="text-sm text-surface-500">
              Load GPO backups first (via the folder picker in the toolbar), then return here to track migration status.
            </p>
          </div>
        </div>
      )}

      {!isLoading && totalCount > 0 && (
        <>
          {/* Stats bar */}
          <div className="px-4 py-3 border-b border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 shrink-0">
            <div className="flex items-center gap-1 mb-2">
              <span className="text-xs text-surface-500 dark:text-surface-400 mr-1">
                {totalCount} settings across {gpoList?.length ?? 0} GPOs
              </span>
              <span
                className="ml-auto text-sm font-bold"
                style={{ color: migratedPct >= 80 ? '#4ade80' : migratedPct >= 50 ? '#fbbf24' : '#f87171' }}
              >
                {migratedPct}% migrated
              </span>
            </div>
            <div className="h-2 rounded-full bg-surface-200 dark:bg-surface-700 overflow-hidden">
              <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${migratedPct}%` }} />
            </div>
            {reasonMissingCount > 0 && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-red-500 dark:text-red-400">
                <AlertTriangle size={12} />
                {reasonMissingCount} "Won't Migrate" setting{reasonMissingCount !== 1 ? 's' : ''} missing a reason
              </div>
            )}
          </div>

          {/* Filter tabs */}
          <div className="flex items-center gap-1 px-4 py-2 border-b border-surface-200 dark:border-surface-700 shrink-0">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  activeTab === t.key
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                    : 'text-surface-500 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800'
                }`}
              >
                {t.label} ({t.count})
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-surface-100 dark:bg-surface-800">
                <tr className="border-b border-surface-200 dark:border-surface-700">
                  <th className="text-left px-3 py-2 font-semibold text-surface-600 dark:text-surface-400">GPO</th>
                  <th className="text-left px-3 py-2 font-semibold text-surface-600 dark:text-surface-400">Scope</th>
                  <th className="text-left px-3 py-2 font-semibold text-surface-600 dark:text-surface-400">Category</th>
                  <th className="text-left px-3 py-2 font-semibold text-surface-600 dark:text-surface-400">Setting</th>
                  <th className="text-left px-3 py-2 font-semibold text-surface-600 dark:text-surface-400">State</th>
                  <th className="text-left px-3 py-2 font-semibold text-surface-600 dark:text-surface-400">Migration Status</th>
                  <th className="text-left px-3 py-2 font-semibold text-surface-600 dark:text-surface-400">Reason</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((r, i) => {
                  const Badge = STATUS_BADGE[r.status];
                  return (
                    <tr key={i} className="border-b border-surface-100 dark:border-surface-800 hover:bg-surface-50 dark:hover:bg-surface-800/50">
                      <td className="px-3 py-1.5 text-surface-700 dark:text-surface-300">{r.gpoName}</td>
                      <td className="px-3 py-1.5 text-surface-500">{r.scope}</td>
                      <td className="px-3 py-1.5 text-surface-500">{r.category}</td>
                      <td className="px-3 py-1.5 text-surface-800 dark:text-surface-200">{r.displayName}</td>
                      <td className="px-3 py-1.5 text-surface-500">{r.state}</td>
                      <td className={`px-3 py-1.5 ${Badge.className}`}>
                        <span className="flex items-center gap-1">
                          <Badge.icon size={13} />
                          {MIGRATION_STATUS_LABELS[r.status]}
                        </span>
                      </td>
                      <td className={`px-3 py-1.5 ${r.status === 'wont_migrate' && !r.reason ? 'text-red-500 dark:text-red-400' : 'text-surface-500'}`}>
                        {r.status === 'wont_migrate' ? (r.reason || 'Reason needed') : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {displayRows.length === 0 && (
              <div className="p-4 text-center text-surface-400 text-sm">No matching settings</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
