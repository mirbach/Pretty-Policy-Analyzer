import { useState } from 'react';
import { useGPO } from '../hooks/useApi';
import { SettingsTree } from './SettingsTree';
import { Search, Shield, Clock, Globe, Monitor, User, AlertCircle, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';

type AiCache = Record<string, string>;

interface GPODetailProps {
  gpoId: string;
  aiCache: AiCache;
  setAiCache: (updater: (prev: AiCache) => AiCache) => void;
}

export function GPODetail({ gpoId, aiCache, setAiCache }: GPODetailProps) {
  const { data: gpo, isLoading, error } = useGPO(gpoId);
  const [search, setSearch] = useState('');
  const [forceExpand, setForceExpand] = useState<{ value: boolean; seq: number } | undefined>(undefined);

  const handleExpandAll = () => setForceExpand((prev) => ({ value: true, seq: (prev?.seq ?? 0) + 1 }));
  const handleCollapseAll = () => setForceExpand((prev) => ({ value: false, seq: (prev?.seq ?? 0) + 1 }));

  if (isLoading) {
    return <div className="p-4 text-surface-400">Loading GPO...</div>;
  }

  if (error || !gpo) {
    return <div className="p-4 text-red-500">Failed to load GPO</div>;
  }

  const { info, settings, parse_warnings } = gpo;

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
          <span className="flex items-center gap-1">
            <Monitor size={12} /> Computer: {info.computer_enabled ? 'Enabled' : 'Disabled'}
            {info.computer_version > 0 && ` (v${info.computer_version})`}
          </span>
          <span className="flex items-center gap-1">
            <User size={12} /> User: {info.user_enabled ? 'Enabled' : 'Disabled'}
            {info.user_version > 0 && ` (v${info.user_version})`}
          </span>
          {info.gpo_guid && (
            <span className="font-mono">{info.gpo_guid}</span>
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
        </div>
      </div>

      {/* Settings tree */}
      <div className="flex-1 overflow-y-auto">
        <SettingsTree settings={settings} search={search} forceExpand={forceExpand} aiCache={aiCache} setAiCache={setAiCache} />
      </div>
    </div>
  );
}
