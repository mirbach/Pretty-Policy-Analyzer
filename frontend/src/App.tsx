import { useState, useEffect } from 'react';
import { useStatus } from './hooks/useApi';
import { useDarkMode } from './hooks/useDarkMode';
import { GPOList } from './components/GPOList';
import { GPODetail } from './components/GPODetail';
import { GPOCompare } from './components/GPOCompare';
import { ConflictView } from './components/ConflictView';
import { WelcomeScreen } from './components/WelcomeScreen';
import { Toolbar } from './components/Toolbar';
import { GlobalSearch } from './components/GlobalSearch';
import { BaselineView } from './components/BaselineView';
import { MigrationReportView } from './components/MigrationReportView';
import { initAIConfig } from './lib/aiClient';
import { loadMigrationStatusStore, MIGRATION_STATUS_STORAGE_KEY, type MigrationStatusStore } from './lib/migrationStatus';
import { AI_CACHE_STORAGE_KEY } from './lib/storageKeys';

type View = 'detail' | 'compare' | 'conflicts' | 'search' | 'baseline' | 'migration';

type AiCache = Record<string, string>;

function loadPersistedAiCaches(): Record<string, AiCache> {
  try {
    const raw = localStorage.getItem(AI_CACHE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, AiCache>) : {};
  } catch {
    return {};
  }
}

export default function App() {
  const [isDark, toggleDark] = useDarkMode();
  const { data: status, isLoading } = useStatus();
  const [selectedGpoId, setSelectedGpoId] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [currentView, setCurrentView] = useState<View>('detail');
  const [allAiCaches, setAllAiCaches] = useState<Record<string, AiCache>>(loadPersistedAiCaches);
  const [migrationStatusStore, setMigrationStatusStore] = useState<MigrationStatusStore>(loadMigrationStatusStore);

  // Load AI config once (from safeStorage in Electron, localStorage in browser)
  useEffect(() => { void initAIConfig(); }, []);

  // Persist AI cache to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(AI_CACHE_STORAGE_KEY, JSON.stringify(allAiCaches));
    } catch {
      // quota exceeded or private browsing — silently skip
    }
  }, [allAiCaches]);

  // Persist migration status to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(MIGRATION_STATUS_STORAGE_KEY, JSON.stringify(migrationStatusStore));
    } catch {
      // quota exceeded or private browsing — silently skip
    }
  }, [migrationStatusStore]);

  const getAiCacheProps = (gpoId: string) => ({
    aiCache: allAiCaches[gpoId] ?? {} as AiCache,
    setAiCache: (updater: (prev: AiCache) => AiCache) =>
      setAllAiCaches((prev) => ({ ...prev, [gpoId]: updater(prev[gpoId] ?? {}) })),
  });

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-surface-50 dark:bg-surface-950">
        <div className="text-surface-500 text-lg">Loading...</div>
      </div>
    );
  }

  if (!status?.loaded) {
    return <WelcomeScreen />;
  }

  const handleCompareToggle = (id: string) => {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const startCompare = () => {
    if (compareIds.length >= 2) {
      setCurrentView('compare');
    }
  };

  return (
    <div className="h-screen flex flex-col bg-surface-50 dark:bg-surface-950">
      <Toolbar
        status={status}
        currentView={currentView}
        onViewChange={setCurrentView}
        compareCount={compareIds.length}
        compareIds={compareIds}
        onStartCompare={startCompare}
        onClearCompare={() => setCompareIds([])}
        isDark={isDark}
        onToggleDark={toggleDark}
        aiCache={allAiCaches}
        migrationStatusStore={migrationStatusStore}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <GPOList
          selectedId={selectedGpoId}
          compareIds={compareIds}
          onSelect={(id) => {
            setSelectedGpoId(id);
            setCurrentView('detail');
          }}
          onCompareToggle={handleCompareToggle}
          onSelectAll={setCompareIds}
          migrationStatusStore={migrationStatusStore}
        />

        {/* Main content */}
        <main className="flex-1 overflow-auto">
          {currentView === 'detail' && selectedGpoId && (
            <GPODetail
              key={selectedGpoId}
              gpoId={selectedGpoId}
              {...getAiCacheProps(selectedGpoId)}
              migrationStatusStore={migrationStatusStore}
              setMigrationStatusStore={setMigrationStatusStore}
            />
          )}
          {currentView === 'detail' && !selectedGpoId && (
            <div className="h-full flex items-center justify-center text-surface-400">
              <div className="text-center">
                <p className="text-xl mb-2">Select a GPO from the sidebar</p>
                <p className="text-sm">or use Compare / Conflicts views from the toolbar</p>
              </div>
            </div>
          )}
          {currentView === 'compare' && (
            <GPOCompare gpoIds={compareIds} />
          )}
          {currentView === 'conflicts' && <ConflictView />}
          {currentView === 'search' && <GlobalSearch />}
          {currentView === 'baseline' && <BaselineView />}
          {currentView === 'migration' && <MigrationReportView migrationStatusStore={migrationStatusStore} />}
        </main>
      </div>
    </div>
  );
}
