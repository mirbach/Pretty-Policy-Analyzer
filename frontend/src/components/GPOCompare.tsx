import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useCompare } from '../hooks/useApi';
import type { DiffEntry } from '../types/gpo';
import { Filter, ArrowLeftRight } from 'lucide-react';

interface GPOCompareProps {
  gpoIds: string[];
}

type DiffFilter = 'all' | 'only_in_one' | 'different_values' | 'identical';

function measureTextWidth(text: string): number {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return 180;
    ctx.font = '500 14px ui-sans-serif, system-ui, -apple-system, sans-serif';
    return Math.ceil(ctx.measureText(text).width) + 32;
  } catch {
    return 180;
  }
}

export function GPOCompare({ gpoIds }: GPOCompareProps) {
  const { data: result, isLoading, error } = useCompare(gpoIds);
  const [filter, setFilter] = useState<DiffFilter>('all');
  const [search, setSearch] = useState('');

  // Column widths: [scope, setting, type, ...gpoIds]
  const defaultWidths = useCallback(
    () => [50, 300, 100, ...gpoIds.map(() => 180)],
    [gpoIds]
  );
  const [colWidths, setColWidths] = useState<number[]>(defaultWidths);
  const prevGpoCount = useRef(gpoIds.length);
  useEffect(() => {
    if (gpoIds.length !== prevGpoCount.current) {
      prevGpoCount.current = gpoIds.length;
      setColWidths(defaultWidths());
    }
  }, [gpoIds.length, defaultWidths]);

  // Once GPO names are available, resize GPO columns to fit their header text
  useEffect(() => {
    if (!result) return;
    setColWidths((prev) => {
      const next = [...prev];
      while (next.length < 3 + gpoIds.length) next.push(180);
      gpoIds.forEach((id, i) => {
        const name = result.gpo_names[id] ?? id;
        next[3 + i] = measureTextWidth(name);
      });
      return next;
    });
  }, [result, gpoIds]);

  const dragState = useRef<{ colIndex: number; startX: number; startWidth: number } | null>(null);

  const onResizeMouseDown = useCallback(
    (colIndex: number, e: React.MouseEvent) => {
      e.preventDefault();
      dragState.current = { colIndex, startX: e.clientX, startWidth: colWidths[colIndex] };

      const onMouseMove = (ev: MouseEvent) => {
        if (!dragState.current) return;
        const delta = ev.clientX - dragState.current.startX;
        const newWidth = Math.max(40, dragState.current.startWidth + delta);
        setColWidths((prev) => {
          const next = [...prev];
          next[dragState.current!.colIndex] = newWidth;
          return next;
        });
      };

      const onMouseUp = () => {
        dragState.current = null;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [colWidths]
  );

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
    { value: 'only_in_one', label: 'Only in one GPO', count: result.differences.filter((d) => d.diff_type === 'only_in_one').length },
    { value: 'different_values', label: 'Differ', count: result.differences.filter((d) => d.diff_type === 'different_values').length },
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
        <table className="text-sm table-fixed" style={{ width: colWidths.reduce((a, b) => a + b, 0) }}>
          <colgroup>
            {colWidths.map((w, i) => (
              <col key={i} style={{ width: w }} />
            ))}
          </colgroup>
          <thead className="sticky top-0 bg-surface-100 dark:bg-surface-800 z-10">
            <tr>
              {[
                { label: 'Scope' },
                { label: 'Setting' },
                { label: 'Type' },
                ...gpoIds.map((id) => ({ label: result.gpo_names[id], id })),
              ].map((col, i) => (
                <th
                  key={i}
                  className="text-left p-2 font-medium text-surface-600 dark:text-surface-400 relative select-none overflow-hidden"
                  style={{ width: colWidths[i] }}
                >
                  <span className="truncate block pr-2">
                    {'id' in col ? (
                      <span title={col.label}>{col.label}</span>
                    ) : (
                      col.label
                    )}
                  </span>
                  {/* Resize handle */}
                  <div
                    className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-400/60 active:bg-blue-500/80 transition-colors"
                    onMouseDown={(e) => onResizeMouseDown(i, e)}
                  />
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
      <td className="p-2 overflow-hidden">
        <div className="font-medium text-surface-800 dark:text-surface-200 truncate" title={entry.display_name || entry.value_name}>
          {entry.display_name || entry.value_name}
        </div>
        {expanded && (
          <div className="text-xs text-surface-400 font-mono mt-1 break-all">
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
                <div className="text-xs text-surface-600 dark:text-surface-400 font-mono truncate" title={String(val)}>
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
