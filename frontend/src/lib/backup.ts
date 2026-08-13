import type { GPODetail } from '../types/gpo';
import type { MigrationStatusStore } from './migrationStatus';
import { AI_CACHE_STORAGE_KEY, MIGRATION_STATUS_STORAGE_KEY } from './storageKeys';
import { downloadTextFile } from './download';
import * as api from './api';

export const BACKUP_FORMAT_VERSION = 1;

export type AiCacheStore = Record<string, Record<string, string>>;

export interface BackupBundle {
  formatVersion: number;
  exportedAt: string;
  gpos: GPODetail[];
  aiCache: AiCacheStore;
  migrationStatus: MigrationStatusStore;
}

/** Builds a full-state backup bundle from the currently loaded GPOs plus in-memory AI cache / migration status. */
export async function buildBackupBundle(
  aiCache: AiCacheStore,
  migrationStatus: MigrationStatusStore
): Promise<BackupBundle> {
  const gpos = await api.exportGPOs();
  return {
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    gpos,
    aiCache,
    migrationStatus,
  };
}

/** Parses and validates a backup file's raw text content. Throws a descriptive error on malformed input. */
export function parseBackupBundle(raw: string): BackupBundle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Not a valid backup file: could not parse JSON.');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Not a valid backup file: unexpected content.');
  }
  const bundle = parsed as Partial<BackupBundle>;
  if (bundle.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new Error(
      `Unsupported backup format version (${bundle.formatVersion ?? 'missing'}). This file may be from a newer or incompatible version of Pretty Policy Analyzer.`
    );
  }
  if (!Array.isArray(bundle.gpos) || typeof bundle.aiCache !== 'object' || typeof bundle.migrationStatus !== 'object') {
    throw new Error('Not a valid backup file: missing expected data.');
  }
  return bundle as BackupBundle;
}

/**
 * Applies a backup bundle: replaces all backend-loaded GPOs and overwrites the
 * AI cache / migration status in localStorage. Callers should reload the app
 * afterward so React state re-initializes from the freshly-written storage.
 */
export async function applyBackupBundle(bundle: BackupBundle): Promise<void> {
  await api.importGPOs(bundle.gpos);
  localStorage.setItem(AI_CACHE_STORAGE_KEY, JSON.stringify(bundle.aiCache));
  localStorage.setItem(MIGRATION_STATUS_STORAGE_KEY, JSON.stringify(bundle.migrationStatus));
}

export function backupFilename(): string {
  const date = new Date().toISOString().slice(0, 10);
  return `PrettyPolicyAnalyzer_Backup_${date}.ppabackup`;
}

/** Saves backup file content via the native OS dialog in Electron, or a browser download otherwise. */
export async function saveBackupFile(content: string, filename: string): Promise<void> {
  const electronAPI = (window as any).__electronAPI;
  if (electronAPI?.saveBackupFile) {
    await electronAPI.saveBackupFile(content, filename);
    return;
  }
  downloadTextFile(content, filename, 'application/json;charset=utf-8');
}

/** Opens a backup file via the native OS dialog in Electron, or a browser file picker otherwise. Returns null if canceled. */
export async function openBackupFile(): Promise<string | null> {
  const electronAPI = (window as any).__electronAPI;
  if (electronAPI?.openBackupFile) {
    return await electronAPI.openBackupFile();
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ppabackup,.json';
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      document.body.removeChild(input);
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    });
    document.body.appendChild(input);
    input.click();
  });
}
