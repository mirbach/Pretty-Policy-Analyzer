import { useState, useMemo } from 'react';
import { useCompare } from '../hooks/useApi';
import type { DiffEntry } from '../types/gpo';
import { Filter, ArrowLeftRight } from 'lucide-react';

interface GPOCompareProps {
  gpoIds: string[];
}

type DiffFilter = 'all' | 'only_in_one' | 'different_values' | 'identical';

export function GPOCompare({ gpoIds }: GPOCompareProps) {
  const { data: result, isLoading, error } = useCompare(gpoIds);
  const [filter, setFilter] = useState<DiffFilter>('all');
  const [search, setSearch] = useState('');

  const entries = useMemo(() => {
    if (!result) return [];
    let items: DiffEntry[] = [];
    if (filter === 'all') {
      items = [...result.differences, ...result.identical];
    } else if (filter === 'identical') {
      items = result.identical;
    } else {
      items = result.differences.filter((d) => d.diff_type === filter);
    }

    if (search) {
      const q = search.toLowerCase();
      items = items.filter(
        (e) =>
          e.display_name.toLowerCase().includes(q) ||
          e.key_path.toLowerCase().includes(q) ||
          e.value_name.toLowerCase().includes(q)
      );
    }

    return items.sort((a, b) => a.key_path.localeCompare(b.key_path));
  }, [result, filter, search]);

  if (gpoIds.length < 2) {
    return (
      <div className="h-full flex items-center justify-center text-surface-400">
        <div className="text-center">
          <ArrowLeftRight size={48} className="mx-auto mb-3 opacity-30" />
          <p>Select 2 or more GPOs to compare</p>
          <p className="text-sm mt-1">Use the checkboxes in the sidebar</p>
        </div>
      </div>
    );
  }

  if (isLoading) return <div className="p-4 text-surface-400">Comparing GPOs...</div>;
  if (error || !result) return <div className="p-4 text-red-500">Failed to compare GPOs</div>;

  const filterOptions: { value: DiffFilter; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: result.total_unique_settings },
    { value: 'only_in_one', label: 'Unique', count: result.differences.filter((d) => d.diff_type === 'only_in_one').length },
    { value: 'different_values', label: 'Different', count: result.differences.filter((d) => d.diff_type === 'different_values').length },
    { value: 'identical', label: 'Identical', count: result.identical_count },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 shrink-0">
        <h2 className="text-lg font-bold text-surface-800 dark:text-surface-200 mb-2">
          Comparing {gpoIds.length} GPOs
        </h2>
        <div className="flex flex-wrap gap-1 mb-3 text-xs">
          {Object.entries(result.gpo_names).map(([id, name]) => (
            <span
              key={id}
              className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded"
            >
              {name}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Filter size={14} className="text-surface-400" />
            {filterOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFilter(opt.value)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  filter === opt.value
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                    : 'text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800'
                }`}
              >
                {opt.label} ({opt.count})
              </button>
            ))}
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter..."
            className="px-2 py-1 text-sm border border-surface-300 dark:border-surface-600 rounded bg-surface-50 dark:bg-surface-800 text-surface-900 dark:text-surface-100 placeholder-surface-400 w-48"
          />
        </div>
      </div>

      {/* Comparison table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface-100 dark:bg-surface-800 z-10">
            <tr>
              <th className="text-left p-2 font-medium text-surface-600 dark:text-surface-400 w-8">Scope</th>
              <th className="text-left p-2 font-medium text-surface-600 dark:text-surface-400">Setting</th>
              <th className="text-left p-2 font-medium text-surface-600 dark:text-surface-400 w-20">Type</th>
              {gpoIds.map((id) => (
                <th key={id} className="text-left p-2 font-medium text-surface-600 dark:text-surface-400 min-w-[150px]">
                  <span className="truncate block" title={result.gpo_names[id]}>
                    {result.gpo_names[id]}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => (
              <CompareRow key={`${entry.key_path}-${entry.value_name}-${i}`} entry={entry} gpoIds={gpoIds} />
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={3 + gpoIds.length} className="p-4 text-center text-surface-400">
                  No settings match the current filter
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CompareRow({ entry, gpoIds }: { entry: DiffEntry; gpoIds: string[] }) {
  const [expanded, setExpanded] = useState(false);

  const rowBg =
    entry.diff_type === 'different_values'
      ? 'bg-yellow-50/50 dark:bg-yellow-900/10'
      : entry.diff_type === 'only_in_one'
      ? 'bg-blue-50/50 dark:bg-blue-900/10'
      : '';

  return (
    <tr
      className={`border-b border-surface-100 dark:border-surface-800 hover:bg-surface-50 dark:hover:bg-surface-800/50 cursor-pointer ${rowBg}`}
      onClick={() => setExpanded(!expanded)}
    >
      <td className="p-2 text-xs">
        <span
          className={`px-1 py-0.5 rounded ${
            entry.scope === 'Computer'
              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
              : 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
          }`}
        >
          {entry.scope === 'Computer' ? 'C' : 'U'}
        </span>
      </td>
      <td className="p-2">
        <div className="font-medium text-surface-800 dark:text-surface-200 truncate max-w-xs">
          {entry.display_name || entry.value_name}
        </div>
        {expanded && (
          <div className="text-xs text-surface-400 font-mono mt-1">
            {entry.key_path}
          </div>
        )}
      </td>
      <td className="p-2 text-xs text-surface-400">{entry.diff_type.replace('_', ' ')}</td>
      {gpoIds.map((id) => {
        const val = entry.values[id];
        const state = entry.states[id];
        const hasValue = val !== undefined;
        return (
          <td key={id} className="p-2">
            {hasValue ? (
              <div>
                <span className={`text-xs ${state === 'Enabled' ? 'text-green-600 dark:text-green-400' : state === 'Disabled' ? 'text-red-500 dark:text-red-400' : 'text-surface-400'}`}>
                  {state}
                </span>
                <div className="text-xs text-surface-600 dark:text-surface-400 font-mono truncate max-w-[200px]" title={String(val)}>
                  {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                </div>
              </div>
            ) : (
              <span className="text-xs text-surface-300 dark:text-surface-600 italic">—</span>
            )}
          </td>
        );
      })}
    </tr>
  );
}
