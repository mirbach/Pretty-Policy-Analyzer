import { useState } from 'react';
import { useGPO } from '../hooks/useApi';
import { SettingsTree } from './SettingsTree';
import { GPOIntuneModal } from './GPOIntuneModal';
import { Search, Shield, Clock, Globe, Monitor, User, AlertCircle, ChevronsDownUp, ChevronsUpDown, Sparkles, CheckCircle2, XCircle, Circle } from 'lucide-react';
import { gpoStatusKey, settingStatusKey, type GpoMigrationStatusMap, type MigrationStatus, type MigrationStatusStore } from '../lib/migrationStatus';

type AiCache = Record<string, string>;

interface GPODetailProps {
  gpoId: string;
  aiCache: AiCache;
  setAiCache: (updater: (prev: AiCache) => AiCache) => void;
  migrationStatusStore: MigrationStatusStore;
  setMigrationStatusStore: (updater: (prev: MigrationStatusStore) => MigrationStatusStore) => void;
}

export function GPODetail({ gpoId, aiCache, setAiCache, migrationStatusStore, setMigrationStatusStore }: GPODetailProps) {
  const { data: gpo, isLoading, error } = useGPO(gpoId);
  const [search, setSearch] = useState('');
  const [forceExpand, setForceExpand] = useState<{ value: boolean; seq: number } | undefined>(undefined);
  const [showIntuneModal, setShowIntuneModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState<MigrationStatus | null>(null);
  const toggleStatusFilter = (status: MigrationStatus) =>
    setStatusFilter((prev) => (prev === status ? null : status));

  const handleExpandAll = () => setForceExpand((prev) => ({ value: true, seq: (prev?.seq ?? 0) + 1 }));
  const handleCollapseAll = () => setForceExpand((prev) => ({ value: false, seq: (prev?.seq ?? 0) + 1 }));

  if (isLoading) {
    return <div className="p-4 text-surface-400">Loading GPO...</div>;
  }

  if (error || !gpo) {
    return <div className="p-4 text-red-500">Failed to load GPO</div>;
  }

  const { info, settings, parse_warnings } = gpo;

  const gKey = gpoStatusKey(info);
  const statusMap = migrationStatusStore[gKey] ?? {};
  const setStatusMap = (updater: (prev: GpoMigrationStatusMap) => GpoMigrationStatusMap) =>
    setMigrationStatusStore((prev) => ({ ...prev, [gKey]: updater(prev[gKey] ?? {}) }));

  // statusMap can hold entries for settings that no longer exist under their old key
  // (e.g. a re-parse changed key_path/value_name) — only count ones matching a current setting.
  const currentSettingKeys = new Set(settings.map((s) => settingStatusKey(s)));
  const liveStatusEntries = Object.entries(statusMap)
    .filter(([key]) => currentSettingKeys.has(key))
    .map(([, entry]) => entry);
  const migratedCount = liveStatusEntries.filter((e) => e.status === 'migrated').length;
  const wontMigrateCount = liveStatusEntries.filter((e) => e.status === 'wont_migrate').length;
  const notMigratedCount = settings.length - migratedCount - wontMigrateCount;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 shrink-0">
        <h2 className="text-xl font-bold text-surface-800 dark:text-surface-200 mb-2">
          {info.display_name}
        </h2>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-surface-500">
          {info.domain && (
            <span className="flex items-center gap-1">
              <Globe size={12} /> {info.domain}
            </span>
          )}
          {info.created_time && (
            <span className="flex items-center gap-1">
              <Clock size={12} /> Created: {info.created_time}
            </span>
          )}
          {info.modified_time && (
            <span className="flex items-center gap-1">
              <Clock size={12} /> Modified: {info.modified_time}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Shield size={12} /> {info.setting_count} settings
          </span>
          <button
            type="button"
            onClick={() => toggleStatusFilter('migrated')}
            className={`flex items-center gap-1 rounded px-1 -mx-1 text-green-600 dark:text-green-400 transition-colors ${
              statusFilter === 'migrated' ? 'bg-green-100 dark:bg-green-900/40 ring-1 ring-green-400' : 'hover:bg-green-50 dark:hover:bg-green-900/20'
            }`}
            title="Show only migrated settings"
          >
            <CheckCircle2 size={12} /> {migratedCount} migrated
          </button>
          <button
            type="button"
            onClick={() => toggleStatusFilter('wont_migrate')}
            className={`flex items-center gap-1 rounded px-1 -mx-1 text-amber-600 dark:text-amber-400 transition-colors ${
              statusFilter === 'wont_migrate' ? 'bg-amber-100 dark:bg-amber-900/40 ring-1 ring-amber-400' : 'hover:bg-amber-50 dark:hover:bg-amber-900/20'
            }`}
            title="Show only settings that won't migrate"
          >
            <XCircle size={12} /> {wontMigrateCount} won't migrate
          </button>
          {notMigratedCount > 0 && (
            <button
              type="button"
              onClick={() => toggleStatusFilter('not_migrated')}
              className={`flex items-center gap-1 rounded px-1 -mx-1 text-red-600 dark:text-red-400 transition-colors ${
                statusFilter === 'not_migrated' ? 'bg-red-100 dark:bg-red-900/40 ring-1 ring-red-400' : 'hover:bg-red-50 dark:hover:bg-red-900/20'
              }`}
              title="Show only settings not yet migrated"
            >
              <Circle size={12} /> {notMigratedCount} not migrated
            </button>
          )}
          {statusFilter && (
            <button
              type="button"
              onClick={() => setStatusFilter(null)}
              className="flex items-center gap-1 text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 transition-colors"
            >
              × Clear filter
            </button>
          )}
          <span className="flex items-center gap-1">
            <Monitor size={12} /> Computer: {info.computer_enabled ? 'Enabled' : 'Disabled'}
            {info.computer_version > 0 && ` (v${info.computer_version})`}
          </span>
          <span className="flex items-center gap-1">
            <User size={12} /> User: {info.user_enabled ? 'Enabled' : 'Disabled'}
            {info.user_version > 0 && ` (v${info.user_version})`}
          </span>
          {info.gpo_guid && (
            <span className="font-mono" title="The GPO's object GUID in Active Directory">
              GPO GUID: {info.gpo_guid}
            </span>
          )}
          {info.id && info.id !== info.gpo_guid && (
            <span className="font-mono" title="The GUID of this specific backup snapshot (changes every time the GPO is backed up)">
              Backup GUID: {info.id}
            </span>
          )}
        </div>

        {parse_warnings.length > 0 && (
          <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-xs text-yellow-700 dark:text-yellow-400">
            <div className="flex items-center gap-1 font-medium mb-1">
              <AlertCircle size={12} /> Parse warnings
            </div>
            {parse_warnings.map((w, i) => (
              <div key={i}>• {w}</div>
            ))}
          </div>
        )}

        {/* Search within GPO */}
        <div className="mt-3 flex gap-2 items-center">
          <div className="relative flex-1 max-w-md">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            placeholder="Search settings..."
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-surface-300 dark:border-surface-600 rounded-md bg-surface-50 dark:bg-surface-800 text-surface-900 dark:text-surface-100 placeholder-surface-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={handleExpandAll}
            className="flex items-center gap-1 px-2 py-1.5 text-xs text-surface-500 hover:text-surface-800 dark:hover:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-800 rounded-md transition-colors"
            title="Expand all"
          >
            <ChevronsUpDown size={13} /> Expand all
          </button>
          <button
            onClick={handleCollapseAll}
            className="flex items-center gap-1 px-2 py-1.5 text-xs text-surface-500 hover:text-surface-800 dark:hover:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-800 rounded-md transition-colors"
            title="Collapse all"
          >
            <ChevronsDownUp size={13} /> Collapse all
          </button>
          <button
            onClick={() => setShowIntuneModal(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-violet-700 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 hover:bg-violet-100 dark:hover:bg-violet-900/40 rounded-md transition-colors border border-violet-200 dark:border-violet-800"
            title="Generate Intune settings list for this GPO"
          >
            <Sparkles size={12} /> Generate Intune Settings
          </button>
        </div>
      </div>

      {/* Settings tree */}
      <div className="flex-1 overflow-y-auto">
        <SettingsTree settings={settings} search={search} statusFilter={statusFilter} forceExpand={forceExpand} aiCache={aiCache} setAiCache={setAiCache} statusMap={statusMap} setStatusMap={setStatusMap} />
      </div>

      {showIntuneModal && (
        <GPOIntuneModal
          info={info}
          settings={settings}
          aiCache={aiCache}
          setAiCache={setAiCache}
          onClose={() => setShowIntuneModal(false)}
        />
      )}
    </div>
  );
}
