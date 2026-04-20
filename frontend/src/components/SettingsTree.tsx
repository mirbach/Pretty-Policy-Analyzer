import { useState, useMemo, useEffect } from 'react';
import type { PolicySetting } from '../types/gpo';
import { ChevronRight, ChevronDown, Sparkles } from 'lucide-react';
import { loadAIConfig, callAI } from '../lib/aiClient';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';

const MARKDOWN_COMPONENTS: Components = {
  h1: ({ children }) => <h1 className="text-sm font-bold text-surface-800 dark:text-surface-200 mt-3 mb-1">{children}</h1>,
  h2: ({ children }) => <h2 className="text-sm font-bold text-violet-700 dark:text-violet-400 mt-3 mb-1 border-b border-violet-200 dark:border-violet-800 pb-0.5">{children}</h2>,
  h3: ({ children }) => <h3 className="text-xs font-semibold text-surface-700 dark:text-surface-300 mt-2 mb-0.5">{children}</h3>,
  p: ({ children }) => <p className="text-xs text-surface-700 dark:text-surface-300 mb-1.5 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="text-xs text-surface-700 dark:text-surface-300 list-disc pl-4 mb-1.5 space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="text-xs text-surface-700 dark:text-surface-300 list-decimal pl-4 mb-1.5 space-y-0.5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  code: ({ children, className }) => {
    const isBlock = className?.includes('language-');
    return isBlock
      ? <code className="block bg-surface-900 dark:bg-surface-950 text-green-400 text-xs p-2 rounded my-1 overflow-x-auto whitespace-pre">{children}</code>
      : <code className="bg-surface-200 dark:bg-surface-700 text-surface-800 dark:text-surface-200 px-1 rounded text-xs font-mono">{children}</code>;
  },
  pre: ({ children }) => <pre className="my-1.5">{children}</pre>,
  strong: ({ children }) => <strong className="font-semibold text-surface-800 dark:text-surface-200">{children}</strong>,
  blockquote: ({ children }) => <blockquote className="border-l-2 border-violet-400 pl-3 italic text-surface-500 dark:text-surface-400 text-xs my-1">{children}</blockquote>,
};

const TREE_INDENT = [
  'pl-2', 'pl-6', 'pl-10', 'pl-14',
  'pl-[72px]', 'pl-[88px]', 'pl-[104px]', 'pl-[120px]',
] as const;
const SETTING_INDENT = [
  'pl-10', 'pl-[40px]', 'pl-[56px]', 'pl-[72px]',
  'pl-[88px]', 'pl-[104px]', 'pl-[120px]', 'pl-[136px]',
] as const;
function indentClass(table: readonly string[], depth: number) {
  return table[Math.min(depth, table.length - 1)];
}

interface TreeNode {
  name: string;
  path: string;
  children: Map<string, TreeNode>;
  settings: PolicySetting[];
}

function buildTree(settings: PolicySetting[]): TreeNode {
  const root: TreeNode = { name: 'Root', path: '', children: new Map(), settings: [] };

  for (const s of settings) {
    const scope = s.scope;
    const cat = s.category || 'Other';
    const parts = [scope, ...cat.split(/[/\\]/).map((p) => p.trim()).filter(Boolean)];

    let current = root;
    let pathSoFar = '';
    for (const part of parts) {
      pathSoFar += '/' + part;
      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          path: pathSoFar,
          children: new Map(),
          settings: [],
        });
      }
      current = current.children.get(part)!;
    }
    current.settings.push(s);
  }

  return root;
}

function stateColor(state: string): string {
  switch (state) {
    case 'Enabled':
      return 'text-green-600 dark:text-green-400';
    case 'Disabled':
      return 'text-red-500 dark:text-red-400';
    default:
      return 'text-surface-400';
  }
}

function stateBg(state: string): string {
  switch (state) {
    case 'Enabled':
      return 'bg-green-50 dark:bg-green-900/20';
    case 'Disabled':
      return 'bg-red-50 dark:bg-red-900/20';
    default:
      return 'bg-surface-50 dark:bg-surface-800';
  }
}

type AiCache = Record<string, string>;

function TreeBranch({
  node,
  depth = 0,
  forceExpand,
  aiCache,
  setAiCache,
}: {
  node: TreeNode;
  depth?: number;
  forceExpand?: { value: boolean; seq: number };
  aiCache: AiCache;
  setAiCache: (updater: (prev: AiCache) => AiCache) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);

  useEffect(() => {
    if (forceExpand !== undefined) setExpanded(forceExpand.value);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceExpand?.seq]);
  const childNodes = Array.from(node.children.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const totalSettings =
    node.settings.length +
    childNodes.reduce((sum, c) => sum + countSettings(c), 0);

  if (childNodes.length === 0 && node.settings.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className={`flex items-center gap-1 w-full text-left py-1 hover:bg-surface-100 dark:hover:bg-surface-800 rounded text-sm transition-colors ${indentClass(TREE_INDENT, depth)}`}
      >
        {childNodes.length > 0 || node.settings.length > 0 ? (
          expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
        ) : (
          <span className="w-3.5" />
        )}
        <span className="font-medium text-surface-700 dark:text-surface-300">{node.name}</span>
        <span className="text-xs text-surface-400 ml-1">({totalSettings})</span>
      </button>

      {expanded && (
        <>
          {/* Settings at this level */}
          {node.settings.map((s, i) => (
            <SettingRow key={`${s.key_path}-${s.value_name}-${i}`} setting={s} depth={depth + 1} forceExpand={forceExpand} aiCache={aiCache} setAiCache={setAiCache} />
          ))}
          {/* Child branches */}
          {childNodes.map((child) => (
            <TreeBranch key={child.path} node={child} depth={depth + 1} forceExpand={forceExpand} aiCache={aiCache} setAiCache={setAiCache} />
          ))}
        </>
      )}
    </div>
  );
}

function SettingRow({
  setting: s,
  depth,
  forceExpand,
  aiCache,
  setAiCache,
}: {
  setting: PolicySetting;
  depth: number;
  forceExpand?: { value: boolean; seq: number };
  aiCache: AiCache;
  setAiCache: (updater: (prev: AiCache) => AiCache) => void;
}) {
  const cacheKey = `${s.key_path}||${s.value_name}`;
  const [expanded, setExpanded] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const aiResponse = aiCache[cacheKey] ?? null;

  useEffect(() => {
    if (forceExpand !== undefined) setExpanded(forceExpand.value);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceExpand?.seq]);

  const handleAIExplain = async () => {
    const config = loadAIConfig();
    if (!config?.apiKey) {
      setAiError('No AI configured. Click the ⚙ Settings icon in the toolbar to add your API key.');
      return;
    }
    setAiLoading(true);
    setAiError(null);
    const prompt = `You are a Windows Group Policy and Microsoft Intune expert.

Analyze this Group Policy setting and provide:
1. A clear explanation of what this setting does and its security/operational impact.
2. Step-by-step instructions for migrating this exact setting to Microsoft Intune, referencing specific Intune configuration profile settings, OMA-URI paths, or Endpoint Security policies where applicable.

Group Policy Setting:
- Name: ${s.display_name || s.value_name || s.key_path}
- Registry Path: ${s.key_path}
- Value Name: ${s.value_name || '(none)'}
- Value: ${s.value_display || String(s.value ?? '')}
- State: ${s.state}
- Type: ${s.setting_type}
- Scope: ${s.scope}
- Category: ${s.category}

Be specific and practical.`;
    try {
      const result = await callAI(prompt, config);
      setAiCache((prev) => ({ ...prev, [cacheKey]: result }));
    } catch (err: any) {
      setAiError(err?.message ?? 'AI request failed');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div
      className={`border-b border-surface-100 dark:border-surface-800 ${stateBg(s.state)} ${indentClass(SETTING_INDENT, depth)}`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left py-1.5 pr-3 flex items-start gap-2"
      >
        <span className={`text-xs font-mono mt-0.5 shrink-0 ${stateColor(s.state)}`}>
          {s.state === 'Enabled' ? '●' : s.state === 'Disabled' ? '○' : '◌'}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-surface-800 dark:text-surface-200 truncate">
            {s.display_name || s.value_name || s.key_path}
          </div>
          <div className="text-xs text-surface-500 truncate">
            {s.value_display || String(s.value ?? '')}
          </div>
        </div>
        <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${stateColor(s.state)}`}>
          {s.state}
        </span>
      </button>

      {expanded && (
        <div className="pb-2 pr-3 pl-6 space-y-1 text-xs">
          <div><span className="text-surface-400">Path:</span> <span className="font-mono text-surface-600 dark:text-surface-400">{s.key_path}</span></div>
          {s.value_name && (
            <div>
              <span className="text-surface-400">Value Name:</span>{' '}
              <span className="font-mono">{s.value_name}</span>
              {s.value_name === '**delvals.' && (
                <span
                  className="ml-1.5 cursor-help text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 relative group"
                  title=""
                >
                  ⓘ
                  <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 w-72 rounded bg-surface-800 dark:bg-surface-700 text-surface-100 text-xs px-3 py-2 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-normal">
                    <strong>**delvals.</strong> is a Group Policy Preferences directive that deletes all existing registry values under this key before applying the policy's new values. This ensures the key is fully replaced rather than merged with any pre-existing entries.
                  </span>
                </span>
              )}
            </div>
          )}
          <div><span className="text-surface-400">Value:</span> <span className="font-mono">{JSON.stringify(s.value)}</span></div>
          <div><span className="text-surface-400">Type:</span> {s.setting_type}</div>
          {s.supported && <div><span className="text-surface-400">Supported:</span> {s.supported}</div>}
          {s.explain && (
            <div className="mt-1 p-2 bg-surface-100 dark:bg-surface-800 rounded text-surface-600 dark:text-surface-400 max-h-32 overflow-y-auto">
              {s.explain}
            </div>
          )}

          {/* AI Explain & Intune Migration */}
          <div className="mt-2 pt-2 border-t border-surface-200 dark:border-surface-700">
            <button
              onClick={handleAIExplain}
              disabled={aiLoading}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 hover:bg-violet-200 dark:hover:bg-violet-900/50 disabled:opacity-50 transition-colors"
            >
              <Sparkles size={12} />
              {aiLoading ? 'Asking AI…' : 'Explain & Intune Migration'}
            </button>
            {aiError && (
              <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded text-red-600 dark:text-red-400 text-xs">
                {aiError}
              </div>
            )}
            {aiResponse && (
              <div className="mt-2 p-3 bg-violet-50 dark:bg-violet-900/20 rounded max-h-[600px] overflow-y-auto">
                <ReactMarkdown components={MARKDOWN_COMPONENTS}>
                  {aiResponse}
                </ReactMarkdown>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function countSettings(node: TreeNode): number {
  return (
    node.settings.length +
    Array.from(node.children.values()).reduce((sum, c) => sum + countSettings(c), 0)
  );
}

interface SettingsTreeProps {
  settings: PolicySetting[];
  search?: string;
  forceExpand?: { value: boolean; seq: number };
  aiCache: AiCache;
  setAiCache: (updater: (prev: AiCache) => AiCache) => void;
}

export function SettingsTree({ settings, search, forceExpand, aiCache, setAiCache }: SettingsTreeProps) {
  const filtered = useMemo(() => {
    if (!search) return settings;
    const q = search.toLowerCase();
    return settings.filter(
      (s) =>
        s.display_name.toLowerCase().includes(q) ||
        s.key_path.toLowerCase().includes(q) ||
        s.value_name.toLowerCase().includes(q) ||
        String(s.value).toLowerCase().includes(q)
    );
  }, [settings, search]);

  const tree = useMemo(() => buildTree(filtered), [filtered]);

  if (filtered.length === 0) {
    return (
      <div className="p-4 text-center text-surface-400 text-sm">
        {search ? 'No matching settings' : 'No settings'}
      </div>
    );
  }

  return (
    <div className="text-sm">
      {Array.from(tree.children.values())
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((child) => (
          <TreeBranch key={child.path} node={child} depth={0} forceExpand={forceExpand} aiCache={aiCache} setAiCache={setAiCache} />
        ))}
    </div>
  );
}
