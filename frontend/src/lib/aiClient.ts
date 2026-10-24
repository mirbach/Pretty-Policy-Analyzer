export type AIProvider = 'openai' | 'xai' | 'gemini' | 'anthropic' | 'github';

export interface ProviderCredentials {
  apiKey: string;
  model: string;
}

/** `provider`/`apiKey`/`model` describe the active provider; `profiles` holds every provider's own key + model. */
export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  model: string;
  profiles?: Partial<Record<AIProvider, ProviderCredentials>>;
}

export const PROVIDER_LABELS: Record<AIProvider, string> = {
  openai: 'ChatGPT (OpenAI)',
  xai: 'Grok (xAI)',
  gemini: 'Gemini (Google)',
  anthropic: 'Claude (Anthropic)',
  github: 'GitHub Copilot (GitHub Models)',
};

export const PROVIDER_SHORT_LABELS: Record<AIProvider, string> = {
  openai: 'ChatGPT',
  xai: 'Grok',
  gemini: 'Gemini',
  anthropic: 'Claude',
  github: 'Copilot',
};

const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1';
const GITHUB_MODELS_INFERENCE_URL = 'https://models.github.ai/inference';
const GITHUB_MODELS_CATALOG_URL = 'https://models.github.ai/catalog/models';

function anthropicHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    // Opt-in to CORS for browser-origin requests. The key is the user's own and stays on this machine.
    'anthropic-dangerous-direct-browser-access': 'true',
  };
}

function githubModelsHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${apiKey}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
}


const STORAGE_KEY = 'pretty_policy_analyzer_ai_config';

// In-memory cache populated by initAIConfig() at app startup.
// All call sites use loadAIConfig() synchronously against this cache.
let _cachedConfig: AIConfig | null = null;

type ElectronAPI = {
  selectFolder: () => Promise<string | null>;
  onApiPort: (cb: (port: number) => void) => void;
  saveAIConfig: (config: AIConfig) => Promise<void>;
  loadAIConfig: () => Promise<AIConfig | null>;
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
    _cachedConfig = raw;
  } else {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AIConfig;
        // API keys are stored encoded; decode them
        parsed.apiKey = atob(parsed.apiKey);
        for (const creds of Object.values(parsed.profiles ?? {})) {
          if (creds) creds.apiKey = atob(creds.apiKey);
        }
        _cachedConfig = parsed;
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
    const profiles = Object.fromEntries(
      Object.entries(config.profiles ?? {}).map(([p, c]) => [p, { ...c, apiKey: btoa(c.apiKey) }]),
    );
    const stored = { ...config, apiKey: btoa(config.apiKey), profiles };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  }
}

export async function callAI(prompt: string, config: AIConfig): Promise<string> {
  if (config.provider === 'gemini') {
    return callGemini(prompt, config);
  }
  if (config.provider === 'anthropic') {
    return callAnthropic(prompt, config);
  }
  return callOpenAICompat(prompt, config);
}

async function callOpenAICompat(prompt: string, config: AIConfig): Promise<string> {
  const baseUrl = config.provider === 'xai'
    ? 'https://api.x.ai/v1'
    : config.provider === 'github'
      ? GITHUB_MODELS_INFERENCE_URL
      : 'https://api.openai.com/v1';

  const headers: Record<string, string> = config.provider === 'github'
    ? githubModelsHeaders(config.apiKey)
    : {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      };

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
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

  if (provider === 'anthropic') {
    const resp = await fetch(`${ANTHROPIC_BASE_URL}/models?limit=1000`, {
      headers: anthropicHeaders(apiKey),
    });
    await assertModelsOk(resp);
    const data = await resp.json() as { data: { id: string }[] };
    return data.data.map(m => m.id).sort();
  }

  if (provider === 'github') {
    const resp = await fetch(GITHUB_MODELS_CATALOG_URL, {
      headers: githubModelsHeaders(apiKey),
    });
    await assertModelsOk(resp);
    const data = await resp.json() as { id: string; supported_output_modalities?: string[] }[];
    return data
      .filter(m => !m.supported_output_modalities || m.supported_output_modalities.includes('text'))
      .map(m => m.id)
      .sort();
  }

  const baseUrl = provider === 'xai' ? 'https://api.x.ai/v1' : 'https://api.openai.com/v1';
  const resp = await fetch(`${baseUrl}/models`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });
  await assertModelsOk(resp);
  const data = await resp.json() as { data: { id: string }[] };
  let ids = data.data.map(m => m.id).sort();
  if (provider === 'openai') {
    ids = ids.filter(id => id.startsWith('gpt-') || /^o\d/.test(id));
  }
  return ids;
}

async function assertModelsOk(resp: Response): Promise<void> {
  if (resp.ok) return;
  const body = await resp.text().catch(() => '');
  let detail = body;
  try {
    const parsed = JSON.parse(body) as { error?: string | { message?: string }; message?: string };
    const err = typeof parsed.error === 'string' ? parsed.error : parsed.error?.message;
    detail = err ?? parsed.message ?? body;
  } catch { /* not JSON, use raw body */ }
  throw new Error(`Failed to fetch models (${resp.status})${detail ? `: ${detail}` : ''}`);
}

async function callAnthropic(prompt: string, config: AIConfig): Promise<string> {
  const resp = await fetch(`${ANTHROPIC_BASE_URL}/messages`, {
    method: 'POST',
    headers: anthropicHeaders(config.apiKey),
    body: JSON.stringify({
      model: config.model,
      max_tokens: 8192,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Anthropic API error ${resp.status}: ${err}`);
  }

  const data = await resp.json() as { content?: { type: string; text?: string }[] };
  const text = (data.content ?? [])
    .filter(b => b.type === 'text' && b.text)
    .map(b => b.text)
    .join('');
  return text || '(No response)';
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
