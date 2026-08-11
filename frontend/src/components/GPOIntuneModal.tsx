import { useState, useRef } from 'react';
import { X, Sparkles, RefreshCw, Download, CheckCircle2, CircleX, AlertTriangle } from 'lucide-react';
import { loadAIConfig, callAI } from '../lib/aiClient';
import type { PolicySetting, GPOInfo } from '../types/gpo';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { downloadJsonFile, downloadTextFile } from '../lib/download';
import { CopyExportToolbar } from './CopyExportToolbar';
import {
  validateIntuneExport,
  checkCoverage,
  type IntuneValidationResult,
  type IntuneCustomConfiguration,
  type IntuneOmaSetting,
  type IntuneExportPayload,
} from '../lib/intuneExport';

export const POLICY_INTUNE_CACHE_KEY = '__policy_intune_export__';
export const POLICY_INTUNE_JSON_CACHE_KEY = '__policy_intune_json__';

/** Settings per AI request when exporting Intune JSON — small batches keep the AI from silently dropping settings in large GPOs. */
const JSON_EXPORT_BATCH_SIZE = 20;

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
  const [jsonLoading, setJsonLoading] = useState(false);
  const [jsonProgress, setJsonProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jsonValidation, setJsonValidation] = useState<IntuneValidationResult | null>(null);
  const aiResultRef = useRef<HTMLDivElement>(null);

  const cachedResult = aiCache[POLICY_INTUNE_CACHE_KEY] ?? null;

  const buildSettingLines = (subset: PolicySetting[] = settings) =>
    subset.map(s => {
      const name = s.display_name || s.value_name || s.key_path;
      const val = s.value_display || String(s.value ?? '');
      const valuePath = s.value_name ? `${s.key_path}\\${s.value_name}` : s.key_path;
      return `[${s.scope}] ${name}: ${val} (${s.state}) | ${valuePath} | ${s.setting_type}`;
    }).join('\n');

  /**
   * registry.pol mirrors Chrome/IE Tab ADMX policies as raw Registry-type
   * settings (per-index list fragments, English value names, no ADMX
   * category) whenever gpreport.xml already captured the same policies as
   * AdminTemplate settings with a proper category and full list values.
   * Sending both to the AI produces duplicate/inconsistent omaUri guesses
   * for the same underlying setting, so once AdminTemplate coverage for a
   * vendor namespace is confirmed, drop its redundant Registry mirror.
   */
  const filterRedundantRegistryEntries = (all: PolicySetting[]): PolicySetting[] => {
    const hasAdminTemplateCategory = (prefix: string) =>
      all.some(s => s.setting_type === 'AdminTemplate' && s.category.toLowerCase().startsWith(prefix));

    const chromeCovered = hasAdminTemplateCategory('google/google chrome');
    const ieTabCovered = hasAdminTemplateCategory('ie tab');

    return all.filter(s => {
      if (s.setting_type !== 'Registry') return true;
      const kp = s.key_path.toLowerCase();
      if (chromeCovered && kp.startsWith('software\\policies\\google\\chrome')) return false;
      if (ieTabCovered && kp.startsWith('software\\policies\\ie tab')) return false;
      return true;
    });
  };

  /** Settings actually sent to the AI for the Intune JSON export (see filterRedundantRegistryEntries). */
  const jsonExportSettings = filterRedundantRegistryEntries(settings);

  /**
   * Extracts scalar (non-list-fragment, non-delete-marker) Registry-type entries for
   * Chrome and IE Tab namespaces from the raw settings list (which includes registry.pol
   * entries that filterRedundantRegistryEntries removes from jsonExportSettings).
   * These provide exact English registry value names — the ground truth for PolicyName
   * segments in OMA-URIs — which gpreport.xml does not expose (it only has German display names).
   */
  const buildPolicyNameReference = (all: PolicySetting[]): string => {
    const hasAdminTemplateCategory = (prefix: string) =>
      all.some(s => s.setting_type === 'AdminTemplate' && s.category.toLowerCase().startsWith(prefix));

    const chromeCovered = hasAdminTemplateCategory('google/google chrome');
    const ieTabCovered = hasAdminTemplateCategory('ie tab');

    const isFragmentOrDelete = (s: PolicySetting) =>
      /^\d+$/.test(s.value_name) || s.value_name.toLowerCase().startsWith('**del');

    const entries = all.filter(s => {
      if (s.setting_type !== 'Registry' || isFragmentOrDelete(s)) return false;
      const kp = s.key_path.toLowerCase();
      if (chromeCovered && kp.startsWith('software\\policies\\google\\chrome')) return true;
      if (ieTabCovered && kp.startsWith('software\\policies\\ie tab')) return true;
      return false;
    });

    return entries
      .map(s => `[${s.scope}] ${s.key_path}\\${s.value_name} = ${s.value_display || String(s.value ?? '')}`)
      .join('\n');
  };

  const policyNameReference = buildPolicyNameReference(settings);

  const handleGenerate = async () => {
    const config = loadAIConfig();
    if (!config?.apiKey) {
      setError('No AI configured. Click the ⚙ Settings icon in the toolbar to add your API key.');
      return;
    }

    setLoading(true);
    setError(null);

    const settingLines = buildSettingLines();

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

  const exportFilenameBase = () => {
    const date = new Date().toISOString().slice(0, 10);
    const safeName = info.display_name.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `Intune_${safeName}_${date}`;
  };

  /** Builds the JSON-export prompt for a single batch of GPO settings. */
  const buildJsonExportPrompt = (batchSettings: PolicySetting[], batchIndex: number, batchCount: number) => `You are a Windows Group Policy and Microsoft Intune expert.

Convert the following GPO settings into Microsoft Graph API "windows10CustomConfiguration" device configuration profiles (Custom OMA-URI profiles) ready to be imported into Intune.
${batchCount > 1 ? `\nThis is batch ${batchIndex + 1} of ${batchCount} for the same GPO. Process ONLY the ${batchSettings.length} settings listed below — the other settings are handled in separate batches and the results will be merged afterwards. Output the same JSON structure as if this were the only batch.\n` : ''}
Output ONLY a single valid JSON object — no markdown, no code fences, no comments, no explanations. The response must be parseable by JSON.parse() without any modification.

Use exactly this structure:

{
  "configurationProfiles": [
    {
      "@odata.type": "#microsoft.graph.windows10CustomConfiguration",
      "displayName": "<profile name>",
      "description": "<short description mentioning the source GPO>",
      "omaSettings": [
        {
          "@odata.type": "#microsoft.graph.omaSettingString | #microsoft.graph.omaSettingInteger | #microsoft.graph.omaSettingBoolean | #microsoft.graph.omaSettingBase64",
          "displayName": "<descriptive Intune setting name>",
          "description": "<original GPO setting display name>",
          "omaUri": "<./Device/... or ./User/... OMA-URI path>",
          "value": "<value, JSON type matching @odata.type>"
        }
      ]
    }
  ],
  "unmapped": [
    {
      "displayName": "<setting name>",
      "keyPath": "<registry key path>",
      "valueName": "<value name>",
      "reason": "<why no direct Intune equivalent exists>"
    }
  ]
}

Rules:
- Group the omaSettings from this batch into up to two profile objects: one containing all Computer-scope settings (omaUri starting with "./Device/...") named "${info.display_name} - Device", and one containing all User-scope settings (omaUri starting with "./User/...") named "${info.display_name} - User". Omit either profile entirely if this batch has no settings of that scope.
- Process EVERY setting listed below individually — never summarize, group, or combine multiple settings into a single row, a single omaSetting, or a single "unmapped" entry. This applies to ALL categories, including ADMX-ingested third-party policies (e.g. "Chrome~Policy~googlechrome~IETab/*" "IE Tab" settings) — each one gets its own omaSettings entry (or its own "unmapped" entry with a setting-specific reason), using the exact same OMA-URI and value-type rules as any other Chrome policy. Do not write a combined/"various settings" entry.
- Choose "@odata.type" based on the GPO value type:
  - Integer values -> "#microsoft.graph.omaSettingInteger" with "value" as a JSON number (no quotes).
  - True/false toggles -> "#microsoft.graph.omaSettingBoolean" with "value" as true or false (no quotes), unless the policy node expects a 0/1 integer.
  - String / XML list values (e.g. "<enabled/><data .../>") -> "#microsoft.graph.omaSettingString" with "value" as a JSON string. Escape every " as \\" and every \\ as \\\\ inside the string.
  - List-type ADMX policies: the line will look like "<SubName>: item1, item2, item3 (Enabled)". Convert this to "#microsoft.graph.omaSettingString" with value = "<enabled/><data id=\\"<SubName>\\" value=\\"1\\uF000item1\\uF0002\\uF000item2\\uF0003\\uF000item3\\"/>" — i.e. number each item starting at 1 and join "index" + "item" pairs with the literal Unicode character U+F000 (write it using the JSON escape \\uF000, not the text "&#xF000;"). Example: the input line
    "[Computer] CookiesAllowedForUrls: CookiesAllowedForUrlsDesc: [*.]contoso.com, [*.]contoso.net (Enabled) | Software\\Policies\\Google\\Chrome\\ContentSettings\\CookiesAllowedForUrls | AdminTemplate"
    becomes
    { "@odata.type": "#microsoft.graph.omaSettingString", "displayName": "Chrome - CookiesAllowedForUrls", "description": "CookiesAllowedForUrls", "omaUri": "./Device/Vendor/MSFT/Policy/Config/Chrome~Policy~googlechrome~ContentSettings/CookiesAllowedForUrls", "value": "<enabled/><data id=\\"CookiesAllowedForUrlsDesc\\" value=\\"1\\uF000[*.]contoso.com\\uF0002\\uF000[*.]contoso.net\\"/>" }
    Apply this same pattern to every list-type setting (including IE Tab's AutoURLs and NeverOpenExceptions lists).
- Some Chrome policies appear TWICE under different categories: once under the policy's normal ADMX category (e.g. "Google Chrome\\<Category>\\<PolicyName>"), and once under "Google Chrome - Standardeinstellungen (können vom Nutzer überschrieben werden)\\<Category>\\<PolicyName>" / "Google Chrome - Default Settings (users can override)\\<Category>\\<PolicyName>" — Chrome's "Recommended" policies, which set a default the user can later change. These are TWO DIFFERENT settings and BOTH must be included with DIFFERENT omaUris:
  - Normal category -> "./<Device|User>/Vendor/MSFT/Policy/Config/Chrome~Policy~googlechrome~<Category>/<PolicyName>" (or "Chrome~Policy~googlechrome/<PolicyName>" if the GPO category is the bare "Google Chrome" with no subcategory).
  - "Standardeinstellungen (können vom Nutzer überschrieben werden)" / "Default Settings (users can override)" -> "./<Device|User>/Vendor/MSFT/Policy/Config/Chrome~Policy~googlechrome~Recommended/<PolicyName>" (flat "~Recommended" category, no further subcategory), and append " (Recommended)" to the "displayName" so it's distinguishable. Never reuse the normal category's omaUri for this variant.
- The following Chrome policies are easy to misname — use EXACTLY these "PolicyName" values in the omaUri (case-sensitive), never a paraphrased or guessed variant:
  - GPO description "Unsichere Inhalte auf diesen Websites zulassen" / "Allow insecure content on these sites" (Category "ContentSettings") -> PolicyName is "InsecureContentAllowedForUrls" — NOT "AutomaticallyAllowInsecureContentForUrls".
  - GPO description "Auf diesen Websites das alte "SameSite"-Verhalten für Cookies wiederherstellen" / "Restore Legacy SameSite cookie behavior for cookies on these sites" (Category "ContentSettings") -> PolicyName is "LegacySameSiteCookieBehaviorEnabledForDomainList" — NOT "...ForHost" or "...ForDomain".
${policyNameReference ? `- CRITICAL — Chrome and IE Tab PolicyNames MUST come from the "Policy name reference" section below. For every Chrome (googlechrome) or IE Tab setting, find the matching reference entry by semantic meaning and use its exact registry value name as the omaUri's <PolicyName>. If you cannot find a matching reference entry, put the setting in "unmapped" with reason "PolicyName not confirmed in registry.pol — manual verification required". NEVER invent or guess a Chrome or IE Tab PolicyName. A reference entry whose path contains "\\\\Recommended" means that PolicyName belongs under "~Recommended/" (per the Recommended-category rule above). Reference entries are for name lookup only — never generate extra omaSettings or unmapped entries for reference lines that have no corresponding setting in the Settings list below.` : `- Use only verified Chrome ADMX PolicyNames in OMA-URIs. If the correct PolicyName for a Chrome or IE Tab policy cannot be determined from the setting description and registry path, put the setting in "unmapped" rather than guessing a name.`}
- Settings whose value name starts with "**delvals." are internal GPO "delete this value" markers, not real policies — skip them entirely (do not add to omaSettings or unmapped).
- If a setting's state is "Disabled" and it has no list/numeric value shown, represent it using that policy's own disabled semantics instead of marking it unmapped: for boolean/integer policies use value 0 (or false); for list-type policies use "<disabled/>" as the omaSettingString value. Only use "unmapped" when the policy genuinely has no Intune/OMA-URI node at all.
- Every "omaUri" must be unique across all profiles.
- If a setting has no direct Intune/OMA-URI equivalent, put it in "unmapped" with a clear "reason" instead of inventing an omaUri.
- Double-check the final output is syntactically valid JSON before responding — pay special attention to escaping inside long "value" strings.

GPO Name: ${info.display_name}
Domain: ${info.domain || 'N/A'}
GPO GUID: ${info.gpo_guid}
Settings in this batch: ${batchSettings.length}
${policyNameReference ? `\nPolicy name reference (exact registry value names from registry.pol — use for Chrome/IE Tab PolicyName lookups, see CRITICAL rule above):\n${policyNameReference}\n` : ''}
Settings:
${buildSettingLines(batchSettings)}`;

  /** Merges per-batch AI responses into a single Intune export, validates it, and downloads it if usable. */
  const validateAndDownload = (rawResponses: string[]) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const seenUris = new Set<string>();
    const deviceSettings: IntuneOmaSetting[] = [];
    const userSettings: IntuneOmaSetting[] = [];
    const unmapped: IntuneExportPayload['unmapped'] = [];

    rawResponses.forEach((raw, i) => {
      const batchLabel = rawResponses.length > 1 ? `Batch ${i + 1}: ` : '';
      const result = validateIntuneExport(raw);
      result.errors.forEach((e) => errors.push(`${batchLabel}${e}`));
      result.warnings.forEach((w) => warnings.push(`${batchLabel}${w}`));
      if (!result.payload) return;

      for (const profile of result.payload.configurationProfiles) {
        for (const setting of profile.omaSettings) {
          if (seenUris.has(setting.omaUri)) {
            warnings.push(`${batchLabel}duplicate omaUri "${setting.omaUri}" ("${setting.displayName}") was dropped — an earlier batch already produced this OMA-URI.`);
            continue;
          }
          seenUris.add(setting.omaUri);
          if (setting.omaUri.startsWith('./Device/')) deviceSettings.push(setting);
          else if (setting.omaUri.startsWith('./User/')) userSettings.push(setting);
          else warnings.push(`${batchLabel}omaUri "${setting.omaUri}" does not start with ./Device/ or ./User/ — skipped.`);
        }
      }
      unmapped.push(...result.payload.unmapped);
    });

    const profiles: IntuneCustomConfiguration[] = [];
    if (deviceSettings.length > 0) {
      profiles.push({
        '@odata.type': '#microsoft.graph.windows10CustomConfiguration',
        displayName: `${info.display_name} - Device`,
        description: `Imported from GPO ${info.gpo_guid} (${info.domain || info.display_name})`,
        omaSettings: deviceSettings,
      });
    }
    if (userSettings.length > 0) {
      profiles.push({
        '@odata.type': '#microsoft.graph.windows10CustomConfiguration',
        displayName: `${info.display_name} - User`,
        description: `Imported from GPO ${info.gpo_guid} (${info.domain || info.display_name})`,
        omaSettings: userSettings,
      });
    }

    const payload: IntuneExportPayload = { configurationProfiles: profiles, unmapped };
    warnings.push(...checkCoverage(jsonExportSettings, payload));

    // Prepend ADMX ingestion prerequisite profiles for Chrome and IE Tab.
    // These must be deployed to Intune BEFORE the Device/User settings profiles so the
    // Policy CSP recognises Chrome~Policy~googlechrome/* and ~IETab/* OMA-URIs.
    const prerequisiteProfiles: IntuneCustomConfiguration[] = [];
    const hasChrome = jsonExportSettings.some(
      s => s.setting_type === 'AdminTemplate' && s.category.toLowerCase().startsWith('google/google chrome')
    );
    const hasIeTab = jsonExportSettings.some(
      s => s.setting_type === 'AdminTemplate' && s.category.toLowerCase().startsWith('ie tab')
    );

    if (hasChrome) {
      prerequisiteProfiles.push({
        '@odata.type': '#microsoft.graph.windows10CustomConfiguration',
        displayName: `${info.display_name} - Chrome ADMX Ingestion [Deploy First]`,
        description: 'PREREQUISITE — deploy this profile before the Device/User settings profiles. In Intune, edit this profile and replace the placeholder value with the full XML content of chrome.admx (available in the Google Chrome Enterprise Bundle from Google). Without this ingestion, Chrome~Policy~googlechrome/* OMA-URIs will not be applied by the Windows Policy CSP.',
        omaSettings: [{
          '@odata.type': '#microsoft.graph.omaSettingString',
          displayName: 'Chrome ADMX Policy Ingestion',
          description: 'Ingests chrome.admx into the Windows Policy CSP so Chrome~Policy~googlechrome/* OMA-URIs are recognised.',
          omaUri: './Device/Vendor/MSFT/Policy/ConfigOperations/ADMXInstall/Chrome/Policy/ChromeAdmx',
          value: 'REPLACE_WITH_CHROME_ADMX_XML_CONTENT',
        }],
      });
      warnings.push('ADMX prerequisite profile added: deploy "…Chrome ADMX Ingestion [Deploy First]" in Intune first and replace its placeholder value with the full content of chrome.admx before deploying the Device settings profile.');
    }
    if (hasIeTab) {
      prerequisiteProfiles.push({
        '@odata.type': '#microsoft.graph.windows10CustomConfiguration',
        displayName: `${info.display_name} - IE Tab ADMX Ingestion [Deploy First]`,
        description: 'PREREQUISITE — deploy this profile before the Device/User settings profiles. In Intune, edit this profile and replace the placeholder value with the full XML content of the IE Tab ADMX file. Without this ingestion, Chrome~Policy~googlechrome~IETab/* OMA-URIs will not be applied.',
        omaSettings: [{
          '@odata.type': '#microsoft.graph.omaSettingString',
          displayName: 'IE Tab ADMX Policy Ingestion',
          description: 'Ingests the IE Tab ADMX into the Windows Policy CSP so Chrome~Policy~googlechrome~IETab/* OMA-URIs are recognised.',
          omaUri: './Device/Vendor/MSFT/Policy/ConfigOperations/ADMXInstall/IETab/Policy/IETabAdmx',
          value: 'REPLACE_WITH_IETAB_ADMX_XML_CONTENT',
        }],
      });
      warnings.push('ADMX prerequisite profile added: deploy "…IE Tab ADMX Ingestion [Deploy First]" in Intune first and replace its placeholder value with the full content of the IE Tab ADMX file before deploying the Device settings profile.');
    }

    const result: IntuneValidationResult = { valid: errors.length === 0, errors, warnings, payload };
    setJsonValidation(result);
    const downloadProfiles = [...prerequisiteProfiles, ...profiles];
    if (downloadProfiles.length > 0) {
      downloadJsonFile(JSON.stringify(downloadProfiles, null, 2), `${exportFilenameBase()}.json`);
    }
    return result;
  };

  const handleExportIntuneJson = async (force = false) => {
    const cachedRaw = !force ? aiCache[POLICY_INTUNE_JSON_CACHE_KEY] : undefined;
    if (cachedRaw) {
      let rawResponses: string[];
      try {
        const parsed = JSON.parse(cachedRaw);
        rawResponses = Array.isArray(parsed) && parsed.every((p) => typeof p === 'string') ? parsed : [cachedRaw];
      } catch {
        rawResponses = [cachedRaw];
      }
      validateAndDownload(rawResponses);
      return;
    }

    const config = loadAIConfig();
    if (!config?.apiKey) {
      setError('No AI configured. Click the ⚙ Settings icon in the toolbar to add your API key.');
      return;
    }

    setJsonLoading(true);
    setError(null);
    setJsonValidation(null);
    setJsonProgress(null);

    const batches: PolicySetting[][] = [];
    for (let i = 0; i < jsonExportSettings.length; i += JSON_EXPORT_BATCH_SIZE) {
      batches.push(jsonExportSettings.slice(i, i + JSON_EXPORT_BATCH_SIZE));
    }

    const rawResponses: string[] = [];
    try {
      for (let i = 0; i < batches.length; i++) {
        if (batches.length > 1) setJsonProgress(`Processing batch ${i + 1} of ${batches.length}…`);
        const prompt = buildJsonExportPrompt(batches[i], i, batches.length);
        rawResponses.push(await callAI(prompt, config));
      }
      setAiCache(prev => ({ ...prev, [POLICY_INTUNE_JSON_CACHE_KEY]: JSON.stringify(rawResponses) }));
      validateAndDownload(rawResponses);
    } catch (err: unknown) {
      setError((err as Error)?.message ?? 'AI request failed');
    } finally {
      setJsonLoading(false);
      setJsonProgress(null);
    }
  };

  const handleDownloadRawJsonResponse = () => {
    const cached = aiCache[POLICY_INTUNE_JSON_CACHE_KEY];
    if (!cached) return;
    let raw: string;
    try {
      const parsed = JSON.parse(cached);
      raw = Array.isArray(parsed) && parsed.every((p) => typeof p === 'string')
        ? parsed.map((r, i) => `--- Batch ${i + 1} ---\n${r}`).join('\n\n')
        : cached;
    } catch {
      raw = cached;
    }
    downloadTextFile(raw, `${exportFilenameBase()}_raw.txt`, 'text/plain;charset=utf-8');
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
              <CopyExportToolbar
                markdown={cachedResult}
                targetRef={aiResultRef}
                filenameBase={exportFilenameBase()}
              />
            )}
            <button
              type="button"
              onClick={() => handleExportIntuneJson()}
              disabled={jsonLoading}
              title="Export an Intune-importable JSON file (Custom OMA-URI device configuration profiles)"
              className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-400 hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors disabled:opacity-50"
            >
              {jsonLoading
                ? <span className="w-3 h-3 border border-surface-400 border-t-transparent rounded-full animate-spin" />
                : <Download size={12} />}
              {jsonLoading ? (jsonProgress ?? 'Generating…') : 'Export Intune JSON'}
            </button>
            <button
              type="button"
              title="Close"
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
                type="button"
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

          {jsonValidation && !jsonLoading && (
            <div className={`p-3 rounded text-xs mb-4 ${jsonValidation.valid ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : (jsonValidation.payload?.configurationProfiles.length ?? 0) > 0 ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400' : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 font-medium">
                  {jsonValidation.valid
                    ? <CheckCircle2 size={14} />
                    : (jsonValidation.payload?.configurationProfiles.length ?? 0) > 0
                      ? <AlertTriangle size={14} />
                      : <CircleX size={14} />}
                  {jsonValidation.valid
                    ? `Valid Intune JSON — ${jsonValidation.payload?.configurationProfiles.length} profile(s) downloaded.`
                    : (jsonValidation.payload?.configurationProfiles.length ?? 0) > 0
                      ? `Intune JSON downloaded with ${jsonValidation.errors.length} error(s) — some settings may be missing.`
                      : `Invalid Intune JSON — ${jsonValidation.errors.length} error(s), download skipped.`}
                </div>
                <button
                  type="button"
                  onClick={() => handleExportIntuneJson(true)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors shrink-0"
                >
                  <RefreshCw size={11} />
                  Regenerate
                </button>
              </div>

              {jsonValidation.errors.length > 0 && (
                <ul className="list-disc pl-5 mt-1.5 space-y-0.5">
                  {jsonValidation.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              )}

              {jsonValidation.warnings.length > 0 && (
                <div className="mt-1.5">
                  <div className="flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400">
                    <AlertTriangle size={12} /> Warnings
                  </div>
                  <ul className="list-disc pl-5 space-y-0.5 text-amber-600 dark:text-amber-400">
                    {jsonValidation.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}

              {jsonValidation.payload && jsonValidation.payload.unmapped.length > 0 && (
                <div className="mt-1.5">
                  <div className="font-medium text-surface-600 dark:text-surface-400">
                    Unmapped settings ({jsonValidation.payload.unmapped.length}) — not included in the JSON export
                  </div>
                  <ul className="list-disc pl-5 space-y-0.5 text-surface-500 dark:text-surface-400">
                    {jsonValidation.payload.unmapped.map((u, i) => (
                      <li key={i}><strong>{u.displayName}</strong>{u.reason ? `: ${u.reason}` : ''}</li>
                    ))}
                  </ul>
                </div>
              )}

              {(!jsonValidation.valid || jsonValidation.warnings.length > 0) && (
                <button
                  type="button"
                  onClick={handleDownloadRawJsonResponse}
                  className="mt-2 flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-400 hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors"
                >
                  <Download size={11} />
                  Download raw response for debugging
                </button>
              )}
            </div>
          )}

          {cachedResult && !loading && (
            <div>
              <div className="flex justify-end mb-3">
                <button
                  type="button"
                  onClick={handleGenerate}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
                >
                  <RefreshCw size={11} />
                  Regenerate
                </button>
              </div>
              <div ref={aiResultRef}>
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
                  {cachedResult}
                </ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
