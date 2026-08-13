import type { GPOInfo, PolicySetting } from '../types/gpo';
import { MIGRATION_STATUS_STORAGE_KEY } from './storageKeys';

export { MIGRATION_STATUS_STORAGE_KEY };

export type MigrationStatus = 'not_migrated' | 'migrated' | 'wont_migrate';

export interface MigrationStatusEntry {
  status: MigrationStatus;
  reason?: string;
  updatedAt: string;
}

/** Keyed by setting key (see settingStatusKey). */
export type GpoMigrationStatusMap = Record<string, MigrationStatusEntry>;

/** Keyed by GPO key (see gpoStatusKey). */
export type MigrationStatusStore = Record<string, GpoMigrationStatusMap>;

export const MIGRATION_STATUS_LABELS: Record<MigrationStatus, string> = {
  not_migrated: 'Not Migrated',
  migrated: 'Migrated',
  wont_migrate: "Won't Migrate",
};

/**
 * GPOInfo.id is the backup folder's GUID, regenerated on every re-export of the same
 * GPO from GPMC. gpo_guid is the stable AD object GUID, so status keyed by it survives
 * rescans. Fall back to id for the synthetic local-gpresult GPO, which has no gpo_guid.
 */
export function gpoStatusKey(info: Pick<GPOInfo, 'gpo_guid' | 'id'>): string {
  return info.gpo_guid || info.id;
}

export function settingStatusKey(s: Pick<PolicySetting, 'scope' | 'key_path' | 'value_name'>): string {
  return `${s.scope}::${s.key_path.toLowerCase()}::${s.value_name.toLowerCase()}`;
}

export function loadMigrationStatusStore(): MigrationStatusStore {
  try {
    const raw = localStorage.getItem(MIGRATION_STATUS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as MigrationStatusStore) : {};
  } catch {
    return {};
  }
}
