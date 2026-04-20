import { useState } from 'react';
import { useSearchAll } from '../hooks/useApi';
import { Search as SearchIcon } from 'lucide-react';

export function GlobalSearch() {
  const [query, setQuery] = useState('');
  const { data: results, isLoading } = useSearchAll(query);

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 shrink-0">
        <h2 className="text-lg font-bold text-surface-800 dark:text-surface-200 mb-3">
          Search All GPOs
        </h2>
        <div className="relative max-w-lg">
          <SearchIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by setting name, registry path, or value..."
            className="w-full pl-9 pr-3 py-2 border border-surface-300 dark:border-surface-600 rounded-lg bg-surface-50 dark:bg-surface-800 text-surface-900 dark:text-surface-100 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
        </div>
        {results && (
          <p className="text-xs text-surface-400 mt-2">{results.length} results</p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && query.length >= 2 && (
          <div className="p-4 text-surface-400 text-sm">Searching...</div>
        )}
        {query.length < 2 && (
          <div className="p-8 text-center text-surface-400 text-sm">Type at least 2 characters to search</div>
        )}
        {results && results.length === 0 && query.length >= 2 && (
          <div className="p-8 text-center text-surface-400 text-sm">No results found</div>
        )}
        {results && results.length > 0 && (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-100 dark:bg-surface-800 z-10">
              <tr>
                <th className="text-left p-2 font-medium text-surface-600 dark:text-surface-400">GPO</th>
                <th className="text-left p-2 font-medium text-surface-600 dark:text-surface-400">Setting</th>
                <th className="text-left p-2 font-medium text-surface-600 dark:text-surface-400">Value</th>
                <th className="text-left p-2 font-medium text-surface-600 dark:text-surface-400">State</th>
                <th className="text-left p-2 font-medium text-surface-600 dark:text-surface-400">Scope</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr
                  key={i}
                  className="border-b border-surface-100 dark:border-surface-800 hover:bg-surface-50 dark:hover:bg-surface-800/50"
                >
                  <td className="p-2 text-surface-700 dark:text-surface-300 whitespace-nowrap">
                    {r.gpo_name}
                  </td>
                  <td className="p-2">
                    <div className="text-surface-800 dark:text-surface-200">{r.setting.display_name}</div>
                    <div className="text-xs text-surface-400 font-mono truncate max-w-xs">{r.setting.key_path}</div>
                  </td>
                  <td className="p-2 text-xs font-mono text-surface-600 dark:text-surface-400 max-w-[200px] truncate">
                    {r.setting.value_display || String(r.setting.value)}
                  </td>
                  <td className={`p-2 text-xs ${r.setting.state === 'Enabled' ? 'text-green-600' : r.setting.state === 'Disabled' ? 'text-red-500' : 'text-surface-400'}`}>
                    {r.setting.state}
                  </td>
                  <td className="p-2 text-xs text-surface-400">{r.setting.scope}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
