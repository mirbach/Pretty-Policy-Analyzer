/**
 * Types and validation for Microsoft Intune "windows10CustomConfiguration"
 * device configuration profiles (Custom OMA-URI), matching the Microsoft
 * Graph API schema (`/deviceManagement/deviceConfigurations`) used to
 * import configuration profiles into Intune.
 */

import type { PolicySetting } from '../types/gpo';

export type OmaSettingODataType =
  | '#microsoft.graph.omaSettingBoolean'
  | '#microsoft.graph.omaSettingDateTime'
  | '#microsoft.graph.omaSettingFloatingPoint'
  | '#microsoft.graph.omaSettingInteger'
  | '#microsoft.graph.omaSettingString'
  | '#microsoft.graph.omaSettingStringXml'
  | '#microsoft.graph.omaSettingBase64';

export interface IntuneOmaSetting {
  '@odata.type': OmaSettingODataType;
  displayName: string;
  description?: string;
  omaUri: string;
  value: string | number | boolean;
  fileName?: string;
}

export interface IntuneCustomConfiguration {
  '@odata.type': '#microsoft.graph.windows10CustomConfiguration';
  displayName: string;
  description?: string;
  omaSettings: IntuneOmaSetting[];
}

export interface UnmappedSetting {
  displayName?: string;
  keyPath?: string;
  valueName?: string;
  reason?: string;
}

export interface IntuneExportPayload {
  configurationProfiles: IntuneCustomConfiguration[];
  unmapped: UnmappedSetting[];
}

export interface IntuneValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  payload: IntuneExportPayload | null;
}

const OMA_SETTING_TYPES: ReadonlySet<string> = new Set([
  '#microsoft.graph.omaSettingBoolean',
  '#microsoft.graph.omaSettingDateTime',
  '#microsoft.graph.omaSettingFloatingPoint',
  '#microsoft.graph.omaSettingInteger',
  '#microsoft.graph.omaSettingString',
  '#microsoft.graph.omaSettingStringXml',
  '#microsoft.graph.omaSettingBase64',
]);

const OMA_URI_PREFIXES = ['./Device/Vendor/MSFT/', './User/Vendor/MSFT/'];

/** Intune's limit on the number of OMA-URI settings per custom configuration profile. */
const MAX_OMA_SETTINGS_PER_PROFILE = 1000;

/** Strip ```json fences and surrounding whitespace that AI models sometimes add despite instructions. */
export function extractJson(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

/**
 * Validates an AI-generated Intune export against the Microsoft Graph
 * `windows10CustomConfiguration` schema. Returns parse/schema errors plus
 * non-fatal warnings (e.g. unusual OMA-URI prefixes, profile size limits).
 */
export function validateIntuneExport(raw: string): IntuneValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let data: unknown;
  try {
    data = JSON.parse(extractJson(raw));
  } catch (err) {
    return { valid: false, errors: [`Invalid JSON: ${(err as Error).message}`], warnings, payload: null };
  }

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return {
      valid: false,
      errors: ['Top-level value must be a JSON object with a "configurationProfiles" array.'],
      warnings,
      payload: null,
    };
  }

  const root = data as Record<string, unknown>;
  const profilesRaw = root.configurationProfiles;
  if (!Array.isArray(profilesRaw) || profilesRaw.length === 0) {
    return {
      valid: false,
      errors: ['"configurationProfiles" must be a non-empty array.'],
      warnings,
      payload: null,
    };
  }

  const seenUris = new Set<string>();
  const profiles: IntuneCustomConfiguration[] = [];

  profilesRaw.forEach((rawProfile, profileIndex) => {
    const path = `configurationProfiles[${profileIndex}]`;
    if (typeof rawProfile !== 'object' || rawProfile === null || Array.isArray(rawProfile)) {
      errors.push(`${path}: must be an object.`);
      return;
    }
    const profile = rawProfile as Record<string, unknown>;

    if (profile['@odata.type'] !== '#microsoft.graph.windows10CustomConfiguration') {
      errors.push(`${path}: "@odata.type" must be "#microsoft.graph.windows10CustomConfiguration".`);
    }
    if (typeof profile.displayName !== 'string' || !profile.displayName.trim()) {
      errors.push(`${path}: "displayName" is required and must be a non-empty string.`);
    }
    if (profile.description !== undefined && typeof profile.description !== 'string') {
      errors.push(`${path}: "description" must be a string.`);
    }

    const settingsRaw = profile.omaSettings;
    if (!Array.isArray(settingsRaw) || settingsRaw.length === 0) {
      errors.push(`${path}: "omaSettings" must be a non-empty array.`);
      return;
    }
    if (settingsRaw.length > MAX_OMA_SETTINGS_PER_PROFILE) {
      warnings.push(`${path}: ${settingsRaw.length} omaSettings exceeds Intune's limit of ${MAX_OMA_SETTINGS_PER_PROFILE} per profile.`);
    }

    settingsRaw.forEach((rawSetting, settingIndex) => {
      const settingPath = `${path}.omaSettings[${settingIndex}]`;
      if (typeof rawSetting !== 'object' || rawSetting === null || Array.isArray(rawSetting)) {
        errors.push(`${settingPath}: must be an object.`);
        return;
      }
      const setting = rawSetting as Record<string, unknown>;
      const type = setting['@odata.type'];

      if (typeof type !== 'string' || !OMA_SETTING_TYPES.has(type)) {
        errors.push(`${settingPath}: "@odata.type" must be one of ${[...OMA_SETTING_TYPES].join(', ')}.`);
      }
      if (typeof setting.displayName !== 'string' || !setting.displayName.trim()) {
        errors.push(`${settingPath}: "displayName" is required and must be a non-empty string.`);
      }

      const omaUri = setting.omaUri;
      if (typeof omaUri !== 'string' || !omaUri.trim()) {
        errors.push(`${settingPath}: "omaUri" is required and must be a non-empty string.`);
      } else {
        if (!OMA_URI_PREFIXES.some((prefix) => omaUri.startsWith(prefix))) {
          warnings.push(`${settingPath}: "omaUri" "${omaUri}" does not start with ${OMA_URI_PREFIXES.join(' or ')}.`);
        }
        if (seenUris.has(omaUri)) {
          errors.push(`${settingPath}: duplicate "omaUri" "${omaUri}" — each OMA-URI must be unique.`);
        }
        seenUris.add(omaUri);
      }

      if (!('value' in setting) || setting.value === undefined) {
        errors.push(`${settingPath}: "value" is required.`);
      } else if (typeof type === 'string') {
        const value = setting.value;
        switch (type) {
          case '#microsoft.graph.omaSettingBoolean':
            if (typeof value !== 'boolean') errors.push(`${settingPath}: "value" must be a boolean for omaSettingBoolean.`);
            break;
          case '#microsoft.graph.omaSettingInteger':
            if (typeof value !== 'number' || !Number.isInteger(value)) errors.push(`${settingPath}: "value" must be an integer for omaSettingInteger.`);
            break;
          case '#microsoft.graph.omaSettingFloatingPoint':
            if (typeof value !== 'number') errors.push(`${settingPath}: "value" must be a number for omaSettingFloatingPoint.`);
            break;
          case '#microsoft.graph.omaSettingDateTime':
            if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) errors.push(`${settingPath}: "value" must be an ISO 8601 date-time string for omaSettingDateTime.`);
            break;
          case '#microsoft.graph.omaSettingString':
          case '#microsoft.graph.omaSettingStringXml':
          case '#microsoft.graph.omaSettingBase64':
            if (typeof value !== 'string') errors.push(`${settingPath}: "value" must be a string for ${type}.`);
            break;
        }
      }
    });

    profiles.push(profile as unknown as IntuneCustomConfiguration);
  });

  let unmapped: UnmappedSetting[] = [];
  if (root.unmapped !== undefined) {
    if (Array.isArray(root.unmapped)) {
      unmapped = root.unmapped as UnmappedSetting[];
    } else {
      warnings.push('"unmapped" should be an array.');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    payload: { configurationProfiles: profiles, unmapped },
  };
}

/**
 * Sanity-checks that every GPO setting ended up represented in either
 * "omaSettings" or "unmapped", so settings can't silently vanish from the
 * AI-generated export (e.g. an entire policy group like "IE Tab").
 * Returns warning messages describing any discrepancy in counts.
 */
export function checkCoverage(settings: PolicySetting[], payload: IntuneExportPayload): string[] {
  const relevant = settings.filter((s) => !(s.value_name || '').startsWith('**delvals.'));
  const mappedCount = payload.configurationProfiles.reduce((sum, p) => sum + p.omaSettings.length, 0);
  const accountedFor = mappedCount + payload.unmapped.length;

  if (accountedFor < relevant.length) {
    const missing = relevant.length - accountedFor;
    return [
      `${missing} of ${relevant.length} GPO setting(s) are not accounted for in either "omaSettings" or "unmapped" — they may have been silently dropped by the AI. Try "Regenerate".`,
    ];
  }
  return [];
}
