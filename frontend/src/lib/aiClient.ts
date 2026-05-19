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
      if (raw) {
        const parsed = JSON.parse(raw) as { provider: AIProvider; model: string; apiKey: string };
        // apiKey is stored encoded; decode it
        parsed.apiKey = atob(parsed.apiKey);
        _cachedConfig = parsed as AIConfig;
      } else {
        _cachedConfig = null;
      }
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
    // Encode the API key before persisting to localStorage to avoid storing it as clear text
    const stored = { ...config, apiKey: btoa(config.apiKey) };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
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

export async function fetchAvailableModels(provider: AIProvider, apiKey: string): Promise<string[]> {
  if (provider === 'gemini') {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
    );
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`Failed to fetch models (${resp.status})${body ? `: ${body}` : ''}`);
    }
    const data = await resp.json() as { models: { name: string; supportedGenerationMethods: string[] }[] };
    return data.models
      .filter(m => m.supportedGenerationMethods.includes('generateContent'))
      .map(m => m.name.replace('models/', ''))
      .sort();
  }

  const baseUrl = provider === 'xai' ? 'https://api.x.ai/v1' : 'https://api.openai.com/v1';
  const resp = await fetch(`${baseUrl}/models`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    let detail = body;
    try {
      const parsed = JSON.parse(body) as { error?: string; message?: string };
      detail = parsed.error ?? parsed.message ?? body;
    } catch { /* not JSON, use raw body */ }
    throw new Error(`Failed to fetch models (${resp.status})${detail ? `: ${detail}` : ''}`);
  }
  const data = await resp.json() as { data: { id: string }[] };
  let ids = data.data.map(m => m.id).sort();
  if (provider === 'openai') {
    ids = ids.filter(id => id.startsWith('gpt-') || /^o\d/.test(id));
  }
  return ids;
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
