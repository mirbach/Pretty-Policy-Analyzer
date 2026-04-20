export type AIProvider = 'openai' | 'xai' | 'gemini';

export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  model: string;
}

export const PROVIDER_LABELS: Record<AIProvider, string> = {
  openai: 'ChatGPT (OpenAI)',
  xai: 'Grok (xAI)',
  gemini: 'Gemini (Google)',
};

export const PROVIDER_MODELS: Record<AIProvider, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  xai: ['grok-4-1-fast-non-reasoning', 'grok-4-1-fast-reasoning', 'grok-3', 'grok-3-mini', 'grok-2'],
  gemini: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
};

const STORAGE_KEY = 'pretty_policy_analyzer_ai_config';

// In-memory cache populated by initAIConfig() at app startup.
// All call sites use loadAIConfig() synchronously against this cache.
let _cachedConfig: AIConfig | null = null;

type ElectronAPI = {
  selectFolder: () => Promise<string | null>;
  onApiPort: (cb: (port: number) => void) => void;
  saveAIConfig: (config: { provider: string; model: string; apiKey: string }) => Promise<void>;
  loadAIConfig: () => Promise<{ provider: string; model: string; apiKey: string } | null>;
};

function electronAPI(): ElectronAPI | undefined {
  return (window as unknown as { __electronAPI?: ElectronAPI }).__electronAPI;
}

/**
 * Must be called once at app startup (before any modal opens).
 * In Electron, loads from the encrypted OS credential store.
 * In browser, loads from localStorage.
 */
export async function initAIConfig(): Promise<void> {
  const api = electronAPI();
  if (api?.loadAIConfig) {
    const raw = await api.loadAIConfig();
    _cachedConfig = raw ? (raw as AIConfig) : null;
  } else {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      _cachedConfig = raw ? (JSON.parse(raw) as AIConfig) : null;
    } catch {
      _cachedConfig = null;
    }
  }
}

/** Synchronous — returns the in-memory cache populated by initAIConfig(). */
export function loadAIConfig(): AIConfig | null {
  return _cachedConfig;
}

/**
 * Persists the config.
 * In Electron: encrypts the API key with OS safeStorage, writes to userData.
 * In browser: stores as JSON in localStorage.
 */
export async function saveAIConfig(config: AIConfig): Promise<void> {
  _cachedConfig = config;
  const api = electronAPI();
  if (api?.saveAIConfig) {
    await api.saveAIConfig(config);
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }
}

export async function callAI(prompt: string, config: AIConfig): Promise<string> {
  if (config.provider === 'gemini') {
    return callGemini(prompt, config);
  }
  return callOpenAICompat(prompt, config);
}

async function callOpenAICompat(prompt: string, config: AIConfig): Promise<string> {
  const baseUrl = config.provider === 'xai'
    ? 'https://api.x.ai/v1'
    : 'https://api.openai.com/v1';

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`API error ${resp.status}: ${err}`);
  }

  const data = await resp.json() as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? '(No response)';
}

async function callGemini(prompt: string, config: AIConfig): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': config.apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Gemini API error ${resp.status}: ${err}`);
  }

  const data = await resp.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '(No response)';
}
