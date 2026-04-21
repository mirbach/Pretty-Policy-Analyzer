import { useState, useEffect } from 'react';
import { X, Eye, EyeOff } from 'lucide-react';
import {
  type AIConfig,
  type AIProvider,
  PROVIDER_LABELS,
  PROVIDER_MODELS,
  loadAIConfig,
  saveAIConfig,
} from '../lib/aiClient';

interface AISettingsModalProps {
  onClose: () => void;
}

const PROVIDERS: AIProvider[] = ['openai', 'xai', 'gemini'];

export function AISettingsModal({ onClose }: AISettingsModalProps) {
  const existing = loadAIConfig();
  const [provider, setProvider] = useState<AIProvider>(existing?.provider ?? 'openai');
  const [apiKey, setApiKey] = useState(existing?.apiKey ?? '');
  const [model, setModel] = useState(existing?.model ?? PROVIDER_MODELS['openai'][0]);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);

  // Reset model when provider changes
  useEffect(() => {
    const models = PROVIDER_MODELS[provider];
    if (!models.includes(model)) setModel(models[0]);
  }, [provider, model]);

  const handleSave = async () => {
    const config: AIConfig = { provider, apiKey: apiKey.trim(), model };
    await saveAIConfig(config);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 800);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-surface-900 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200 dark:border-surface-700">
          <h2 className="text-base font-semibold text-surface-800 dark:text-surface-200">AI Settings</h2>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-400">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Provider */}
          <div>
            <label className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-2">AI Provider</label>
            <div className="grid grid-cols-3 gap-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p}
                  onClick={() => setProvider(p)}
                  className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    provider === p
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                      : 'border-surface-200 dark:border-surface-700 text-surface-600 dark:text-surface-400 hover:bg-surface-50 dark:hover:bg-surface-800'
                  }`}
                >
                  {p === 'openai' ? 'ChatGPT' : p === 'xai' ? 'Grok' : 'Gemini'}
                </button>
              ))}
            </div>
            <p className="text-xs text-surface-400 mt-1">{PROVIDER_LABELS[provider]}</p>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1.5">API Key</label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={`Enter your ${PROVIDER_LABELS[provider]} API key`}
                className="w-full pr-9 pl-3 py-2 text-sm border border-surface-300 dark:border-surface-600 rounded-lg bg-surface-50 dark:bg-surface-800 text-surface-900 dark:text-surface-100 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                aria-label={showKey ? 'Hide API key' : 'Show API key'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600"
              >
                {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <p className="text-xs text-surface-400 mt-1">Stored locally in your browser — never sent to our servers.</p>
          </div>

          {/* Model */}
          <div>
            <label htmlFor="ai-model-select" className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1.5">Model</label>
            <select
              id="ai-model-select"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-surface-300 dark:border-surface-600 rounded-lg bg-surface-50 dark:bg-surface-800 text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {PROVIDER_MODELS[provider].map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-surface-200 dark:border-surface-700 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!apiKey.trim()}
            className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors"
          >
            {saved ? '✓ Saved' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
