import {
  UPDATE_CHECK_ENABLED_STORAGE_KEY,
  UPDATE_LAST_CHECK_STORAGE_KEY,
  UPDATE_DISMISSED_VERSION_STORAGE_KEY,
  UPDATE_LATEST_RELEASE_STORAGE_KEY,
} from './storageKeys';

export interface UpdateInfo {
  version: string;
  name: string;
  url: string;
}

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Parse "1.2.3" / "v1.2.3-beta" into [1, 2, 3]; returns null if not numeric. */
function parseVersion(v: string): number[] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/i.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** True when `latest` is a higher x.y.z than `current`. Unparseable input yields false. */
export function isNewerVersion(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

/** Update checks need Electron's main process (no CORS, no network from the renderer). */
export function updateCheckAvailable(): boolean {
  return typeof (window as any).__electronAPI?.checkForUpdate === 'function';
}

function readStorage(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeStorage(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

export function isUpdateCheckEnabled(): boolean {
  return readStorage(UPDATE_CHECK_ENABLED_STORAGE_KEY) !== 'false';
}

export function setUpdateCheckEnabled(enabled: boolean) {
  writeStorage(UPDATE_CHECK_ENABLED_STORAGE_KEY, String(enabled));
}

export function dismissUpdate(version: string) {
  writeStorage(UPDATE_DISMISSED_VERSION_STORAGE_KEY, version);
}

/** Ask GitHub (via Electron main) for the latest stable release. Null on any failure. */
export async function fetchLatestRelease(): Promise<UpdateInfo | null> {
  if (!updateCheckAvailable()) return null;
  try {
    return await (window as any).__electronAPI.checkForUpdate();
  } catch {
    return null;
  }
}

/** Only announce a release that is newer than this build and not yet dismissed. */
function announceable(release: UpdateInfo | null): UpdateInfo | null {
  if (!release) return null;
  if (!isNewerVersion(release.version, __APP_VERSION__)) return null;
  if (readStorage(UPDATE_DISMISSED_VERSION_STORAGE_KEY) === release.version) return null;
  return release;
}

function readCachedRelease(): UpdateInfo | null {
  try {
    const r = JSON.parse(readStorage(UPDATE_LATEST_RELEASE_STORAGE_KEY) ?? 'null');
    return r && typeof r.version === 'string' && typeof r.url === 'string' ? r : null;
  } catch {
    return null;
  }
}

/**
 * Startup check: honours the opt-out and a 24h throttle (within it, the last
 * result is reused so an ignored toast reappears on the next launch).
 * Returns the release to announce, or null.
 */
export async function checkForUpdateOnStartup(): Promise<UpdateInfo | null> {
  if (!updateCheckAvailable() || !isUpdateCheckEnabled()) return null;
  const last = Number(readStorage(UPDATE_LAST_CHECK_STORAGE_KEY) ?? 0);
  if (Date.now() - last < CHECK_INTERVAL_MS) return announceable(readCachedRelease());

  const release = await fetchLatestRelease();
  if (!release) return null; // don't throttle failed checks
  writeStorage(UPDATE_LAST_CHECK_STORAGE_KEY, String(Date.now()));
  writeStorage(UPDATE_LATEST_RELEASE_STORAGE_KEY, JSON.stringify(release));
  return announceable(release);
}

export function openReleasePage(url: string) {
  (window as any).__electronAPI?.openExternal?.(url);
}
