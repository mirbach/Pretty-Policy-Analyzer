import { useState } from 'react';
import { X, Sparkles, Copy, Check, RefreshCw } from 'lucide-react';
import { loadAIConfig, callAI } from '../lib/aiClient';
import type { PolicySetting, GPOInfo } from '../types/gpo';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

export const POLICY_INTUNE_CACHE_KEY = '__policy_intune_export__';

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
  table: ({ children }) => (
    <div className="overflow-x-auto my-2">
      <table className="w-full text-xs border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-violet-100 dark:bg-violet-900/30">{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr className="border-b border-surface-200 dark:border-surface-700">{children}</tr>,
  th: ({ children }) => <th className="text-left px-2 py-1 font-semibold text-surface-700 dark:text-surface-300">{children}</th>,
  td: ({ children }) => <td className="px-2 py-1 text-surface-700 dark:text-surface-300 align-top">{children}</td>,
};

interface Props {
  info: GPOInfo;
  settings: PolicySetting[];
  aiCache: Record<string, string>;
  setAiCache: (updater: (prev: Record<string, string>) => Record<string, string>) => void;
  onClose: () => void;
}

export function GPOIntuneModal({ info, settings, aiCache, setAiCache, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const cachedResult = aiCache[POLICY_INTUNE_CACHE_KEY] ?? null;

  const handleGenerate = async () => {
    const config = loadAIConfig();
    if (!config?.apiKey) {
      setError('No AI configured. Click the ⚙ Settings icon in the toolbar to add your API key.');
      return;
    }

    setLoading(true);
    setError(null);

    const settingLines = settings.map(s => {
      const name = s.display_name || s.value_name || s.key_path;
      const val = s.value_display || String(s.value ?? '');
      const valuePath = s.value_name ? `${s.key_path}\\${s.value_name}` : s.key_path;
      return `[${s.scope}] ${name}: ${val} (${s.state}) | ${valuePath} | ${s.setting_type}`;
    }).join('\n');

    const prompt = `You are a Windows Group Policy and Microsoft Intune expert.

Given the following Group Policy Object (GPO), generate a comprehensive list of equivalent Microsoft Intune settings and values that would replicate this policy.

GPO Name: ${info.display_name}
Domain: ${info.domain || 'N/A'}
Total Settings: ${settings.length}

GPO Settings:
${settingLines}

For each GPO setting, provide the equivalent Intune configuration. Format your response as:

## Computer Scope Settings

| GPO Setting | Intune Setting / OMA-URI | Value | Policy Type | Notes |
|---|---|---|---|---|
(one row per Computer-scope setting)

## User Scope Settings

| GPO Setting | Intune Setting / OMA-URI | Value | Policy Type | Notes |
|---|---|---|---|---|
(one row per User-scope setting)

## Migration Summary

After the tables, add a brief summary covering:
- Total settings mapped
- Settings that cannot be directly migrated to Intune and why (e.g., domain-specific features, unsupported on modern OS)
- Recommended Intune policy structure (which profile types to create)

For the Intune Setting column: use the Settings Catalog path when available (e.g., "Administrative Templates > Windows Components > BitLocker > ..."), otherwise provide the OMA-URI (e.g., "./Device/Vendor/MSFT/Policy/Config/...").
For Policy Type: use "Settings Catalog", "Endpoint Security", "Compliance Policy", or "Custom OMA-URI" as appropriate.
Be specific and practical.`;

    try {
      const result = await callAI(prompt, config);
      setAiCache(prev => ({ ...prev, [POLICY_INTUNE_CACHE_KEY]: result }));
    } catch (err: unknown) {
      setError((err as Error)?.message ?? 'AI request failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!cachedResult) return;
    await navigator.clipboard.writeText(cachedResult);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white dark:bg-surface-900 rounded-lg shadow-xl w-full max-w-5xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-200 dark:border-surface-700 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-surface-800 dark:text-surface-200 flex items-center gap-2">
              <Sparkles size={16} className="text-violet-500" />
              Generate Intune Settings List
            </h2>
            <p className="text-xs text-surface-500 mt-0.5">
              {info.display_name} — {settings.length} settings
            </p>
          </div>
          <div className="flex items-center gap-2">
            {cachedResult && !loading && (
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-400 hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors"
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-500 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {!cachedResult && !loading && !error && (
            <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
              <Sparkles size={32} className="text-violet-400" />
              <div>
                <p className="text-sm font-medium text-surface-700 dark:text-surface-300">
                  Generate an Intune settings list for this GPO
                </p>
                <p className="text-xs text-surface-400 mt-1 max-w-md">
                  The AI will analyze all {settings.length} settings in this policy and produce a table of equivalent Intune configuration settings with Settings Catalog paths or OMA-URI values.
                </p>
              </div>
              <button
                onClick={handleGenerate}
                className="flex items-center gap-2 px-4 py-2 rounded-md bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors"
              >
                <Sparkles size={14} />
                Generate
              </button>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
              <div className="w-8 h-8 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-surface-500">Analyzing {settings.length} settings…</p>
              <p className="text-xs text-surface-400">This may take 20–60 seconds for large GPOs</p>
            </div>
          )}

          {error && !loading && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded text-red-600 dark:text-red-400 text-sm mb-4">
              {error}
            </div>
          )}

          {cachedResult && !loading && (
            <div>
              <div className="flex justify-end mb-3">
                <button
                  onClick={handleGenerate}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
                >
                  <RefreshCw size={11} />
                  Regenerate
                </button>
              </div>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
                {cachedResult}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
