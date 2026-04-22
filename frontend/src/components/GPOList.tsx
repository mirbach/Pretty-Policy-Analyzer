import { useState } from 'react';
import { useGPOs } from '../hooks/useApi';
import { useDeleteGPO } from '../hooks/useApi';
import { Search, CheckSquare, Square, Shield, Monitor, User, Activity, ChevronDown, ChevronRight, X } from 'lucide-react';
import type { GPOInfo } from '../types/gpo';

interface GPOListProps {
  selectedId: string | null;
  compareIds: string[];
  onSelect: (id: string) => void;
  onCompareToggle: (id: string) => void;
  onSelectAll: (ids: string[]) => void;
}

export function GPOList({ selectedId, compareIds, onSelect, onCompareToggle, onSelectAll }: GPOListProps) {
  const [search, setSearch] = useState('');
  const [effectiveOpen, setEffectiveOpen] = useState(true);
  const [backupsOpen, setBackupsOpen] = useState(true);
  const { data: gpos, isLoading } = useGPOs(search || undefined);
  const deleteMutation = useDeleteGPO();

  const effectiveGpo = gpos?.find((g) => g.id === 'local-gpresult') ?? null;
  const backupGpos = gpos?.filter((g) => g.id !== 'local-gpresult') ?? [];

  const visibleBackupIds = backupGpos.map((g) => g.id);
  const allSelected = visibleBackupIds.length > 0 && visibleBackupIds.every((id) => compareIds.includes(id));

  const handleSelectAll = () => {
    if (allSelected) {
      onSelectAll(compareIds.filter((id) => !visibleBackupIds.includes(id)));
    } else {
      const merged = Array.from(new Set([...compareIds, ...visibleBackupIds]));
      onSelectAll(merged);
    }
  };

  const renderRow = (gpo: GPOInfo) => (
    <div
      key={gpo.id}
      className={`group flex items-start gap-2 px-3 py-2.5 border-b border-surface-100 dark:border-surface-800 cursor-pointer transition-colors ${
        selectedId === gpo.id
          ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-l-blue-500'
          : 'hover:bg-surface-50 dark:hover:bg-surface-800/50 border-l-2 border-l-transparent'
      }`}
    >
      {/* Compare checkbox */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onCompareToggle(gpo.id);
        }}
        className="mt-0.5 shrink-0 text-surface-400 hover:text-blue-500"
        title="Add to comparison"
      >
        {compareIds.includes(gpo.id) ? (
          <CheckSquare size={16} className="text-blue-500" />
        ) : (
          <Square size={16} className="opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </button>

      <div className="flex-1 min-w-0" onClick={() => onSelect(gpo.id)}>
        <div className="text-sm font-medium text-surface-800 dark:text-surface-200 truncate">
          {gpo.display_name}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-surface-400">
            {gpo.setting_count} settings
          </span>
          <div className="flex items-center gap-1">
            {gpo.computer_enabled && (
              <Monitor size={10} className="text-blue-400" />
            )}
            {gpo.user_enabled && (
              <User size={10} className="text-green-400" />
            )}
          </div>
        </div>
      </div>

      {/* Delete button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          deleteMutation.mutate(gpo.id);
        }}
        className="mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-surface-400 hover:text-red-500"
        title="Remove from list"
      >
        <X size={14} />
      </button>
    </div>
  );

  return (
    <aside className="w-72 border-r border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 flex flex-col shrink-0">
      {/* Search */}
      <div className="p-3 border-b border-surface-200 dark:border-surface-700">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search GPOs..."
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-surface-300 dark:border-surface-600 rounded-md bg-surface-50 dark:bg-surface-800 text-surface-900 dark:text-surface-100 placeholder-surface-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        {visibleBackupIds.length > 0 && (
          <button
            onClick={handleSelectAll}
            className="mt-2 w-full text-xs text-left text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1"
          >
            {allSelected ? (
              <><CheckSquare size={13} /> Deselect all</>
            ) : (
              <><Square size={13} /> Select all for compare</>
            )}
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="p-4 text-center text-surface-400 text-sm">Loading...</div>
        )}

        {/* ── Effective Policy section ────────────────────────────────── */}
        {effectiveGpo && (
          <>
            <button
              onClick={() => setEffectiveOpen((o) => !o)}
              className="w-full px-3 py-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-surface-500 dark:text-surface-400 bg-surface-50 dark:bg-surface-800/50 border-b border-surface-200 dark:border-surface-700 hover:bg-surface-100 dark:hover:bg-surface-700/50 transition-colors"
            >
              {effectiveOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              <Activity size={11} />
              Effective Policy
            </button>
            {effectiveOpen && renderRow(effectiveGpo)}
          </>
        )}

        {/* ── GPO Backups section ─────────────────────────────────────── */}
        {backupGpos.length > 0 && (
          <>
            <button
              onClick={() => setBackupsOpen((o) => !o)}
              className="w-full px-3 py-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-surface-500 dark:text-surface-400 bg-surface-50 dark:bg-surface-800/50 border-b border-surface-200 dark:border-surface-700 hover:bg-surface-100 dark:hover:bg-surface-700/50 transition-colors"
            >
              {backupsOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              <Shield size={11} />
              GPO Backups
            </button>
            {backupsOpen && backupGpos.map(renderRow)}
          </>
        )}

        {gpos && gpos.length === 0 && (
          <div className="p-4 text-center text-surface-400 text-sm">
            {search ? 'No matching GPOs' : 'No GPOs loaded'}
          </div>
        )}
      </div>
    </aside>
  );
}
