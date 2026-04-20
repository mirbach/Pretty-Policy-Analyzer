import { useState, useMemo } from 'react';
import { useConflicts } from '../hooks/useApi';
import type { ConflictEntry, ConflictSeverity } from '../types/gpo';
import { AlertTriangle, AlertCircle, Info, Filter } from 'lucide-react';

const severityConfig: Record<ConflictSeverity, { icon: typeof AlertTriangle; color: string; bg: string }> = {
  High: { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/20' },
  Medium: { icon: AlertTriangle, color: 'text-yellow-500', bg: 'bg-yellow-50 dark:bg-yellow-900/20' },
  Low: { icon: Info, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20' },
};

export function ConflictView() {
  const { data: result, isLoading, error } = useConflicts();
  const [severityFilter, setSeverityFilter] = useState<ConflictSeverity | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!result) return [];
    let items = result.conflicts;
    if (severityFilter !== 'all') {
      items = items.filter((c) => c.severity === severityFilter);
    }
    if (categoryFilter !== 'all') {
      items = items.filter((c) => c.category === categoryFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(
        (c) =>
          c.display_name.toLowerCase().includes(q) ||
          c.key_path.toLowerCase().includes(q) ||
          c.involved_gpos.some((g) => g.gpo_name.toLowerCase().includes(q))
      );
    }
    return items;
  }, [result, severityFilter, categoryFilter, search]);

  if (isLoading) return <div className="p-4 text-surface-400">Detecting conflicts...</div>;
  if (error || !result) return <div className="p-4 text-red-500">Failed to detect conflicts</div>;

  const categories = Object.keys(result.by_category).sort();

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 shrink-0">
        <h2 className="text-lg font-bold text-surface-800 dark:text-surface-200 mb-2">
          Conflict Detection
        </h2>

        {/* Summary badges */}
        <div className="flex gap-3 mb-3">
          <span className="text-sm text-surface-600 dark:text-surface-400">
            {result.total_conflicts} conflicts found
          </span>
          {Object.entries(result.by_severity).map(([sev, count]) => {
            const config = severityConfig[sev as ConflictSeverity];
            return (
              <span key={sev} className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded ${config.bg} ${config.color}`}>
                {sev}: {count}
              </span>
            );
          })}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1">
            <Filter size={14} className="text-surface-400" />
            <span className="text-xs text-surface-400">Severity:</span>
            {(['all', 'High', 'Medium', 'Low'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSeverityFilter(s)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  severityFilter === s
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                    : 'text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter by category"
            className="px-2 py-1 text-xs border border-surface-300 dark:border-surface-600 rounded bg-surface-50 dark:bg-surface-800 text-surface-700 dark:text-surface-300"
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c} ({result.by_category[c]})
              </option>
            ))}
          </select>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter conflicts..."
            className="px-2 py-1 text-sm border border-surface-300 dark:border-surface-600 rounded bg-surface-50 dark:bg-surface-800 text-surface-900 dark:text-surface-100 placeholder-surface-400 w-48"
          />
        </div>
      </div>

      {/* Conflict list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {filtered.length === 0 && (
          <div className="text-center text-surface-400 py-8">
            {result.total_conflicts === 0
              ? 'No conflicts detected — all GPO settings are consistent!'
              : 'No conflicts match the current filter'}
          </div>
        )}

        {filtered.map((conflict, i) => (
          <ConflictCard key={`${conflict.key_path}-${conflict.value_name}-${i}`} conflict={conflict} />
        ))}
      </div>
    </div>
  );
}

function ConflictCard({ conflict }: { conflict: ConflictEntry }) {
  const [expanded, setExpanded] = useState(false);
  const config = severityConfig[conflict.severity];
  const Icon = config.icon;

  return (
    <div
      className={`border rounded-lg ${config.bg} border-surface-200 dark:border-surface-700 cursor-pointer transition-all`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="p-3 flex items-start gap-3">
        <Icon size={18} className={`${config.color} shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-surface-800 dark:text-surface-200 truncate">
              {conflict.display_name || conflict.value_name}
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded ${config.color} ${config.bg}`}>
              {conflict.severity}
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-surface-100 dark:bg-surface-800 text-surface-500">
              {conflict.scope}
            </span>
          </div>
          <div className="text-xs text-surface-500 mt-0.5 font-mono truncate">{conflict.key_path}</div>
          <div className="text-xs text-surface-400 mt-0.5">
            {conflict.involved_gpos.length} GPOs • {conflict.category || 'Uncategorized'}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-3 border-t border-surface-200 dark:border-surface-700 mt-1 pt-2">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-surface-400">
                <th className="text-left py-1 pr-3">GPO</th>
                <th className="text-left py-1 pr-3">State</th>
                <th className="text-left py-1">Value</th>
              </tr>
            </thead>
            <tbody>
              {conflict.involved_gpos.map((g) => (
                <tr key={g.gpo_id} className="border-t border-surface-100 dark:border-surface-800">
                  <td className="py-1.5 pr-3 font-medium text-surface-700 dark:text-surface-300">
                    {g.gpo_name}
                  </td>
                  <td className={`py-1.5 pr-3 ${g.state === 'Enabled' ? 'text-green-600' : g.state === 'Disabled' ? 'text-red-500' : 'text-surface-400'}`}>
                    {g.state}
                  </td>
                  <td className="py-1.5 font-mono text-surface-600 dark:text-surface-400">
                    {g.value_display || String(g.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
