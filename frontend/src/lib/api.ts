import axios from 'axios';
import type {
  GPOInfo,
  GPODetail,
  ComparisonResult,
  ConflictResult,
  ScanStatus,
  SearchResult,
  PolicySetting,
  BaselineStatus,
  BaselineComplianceReport,
  BundledBaseline,
} from '../types/gpo';

// In Electron, the port is passed via the preload script
const getBaseUrl = () => {
  if (typeof window !== 'undefined' && (window as any).__GPO_API_PORT__) {
    return `http://127.0.0.1:${(window as any).__GPO_API_PORT__}`;
  }
  return 'http://127.0.0.1:8000';
};

const api = axios.create({
  baseURL: getBaseUrl(),
  timeout: 30000,
});

// Update base URL when port becomes available
export function setApiPort(port: number) {
  api.defaults.baseURL = `http://127.0.0.1:${port}`;
}

export async function getStatus(): Promise<ScanStatus> {
  const { data } = await api.get('/api/status');
  return data;
}

export async function clearData(): Promise<ScanStatus> {
  const { data } = await api.delete('/api/scan');
  return data;
}

export async function scanFolder(folderPath: string): Promise<ScanStatus> {
  const { data: reg } = await api.post('/api/register-folder', { folder_path: folderPath });
  const { data } = await api.post('/api/scan', { folder_id: reg.folder_id });
  return data;
}

export interface UploadedFileItem {
  relative_path: string;
  content_b64: string;
}

export async function scanUpload(files: UploadedFileItem[]): Promise<ScanStatus> {
  const { data } = await api.post('/api/scan-upload', files);
  return data;
}

export async function importLocalPolicy(): Promise<ScanStatus> {
  const { data } = await api.post('/api/import-local-policy');
  return data;
}

export async function listGPOs(search?: string): Promise<GPOInfo[]> {
  const { data } = await api.get('/api/gpos', { params: { search } });
  return data;
}

export async function getGPO(id: string): Promise<GPODetail> {
  const { data } = await api.get(`/api/gpos/${encodeURIComponent(id)}`);
  return data;
}

export async function getGPOSettings(
  id: string,
  filters?: { scope?: string; setting_type?: string; category?: string; search?: string }
): Promise<PolicySetting[]> {
  const { data } = await api.get(`/api/gpos/${encodeURIComponent(id)}/settings`, { params: filters });
  return data;
}

export async function compareGPOs(gpoIds: string[]): Promise<ComparisonResult> {
  const { data } = await api.post('/api/compare', { gpo_ids: gpoIds });
  return data;
}

export async function getConflicts(filters?: { category?: string; severity?: string }): Promise<ConflictResult> {
  const { data } = await api.get('/api/conflicts', { params: filters });
  return data;
}

export async function searchAllSettings(query: string): Promise<SearchResult[]> {
  const { data } = await api.get('/api/gpos/search/all', { params: { q: query } });
  return data;
}

export async function healthCheck(): Promise<boolean> {
  try {
    await api.get('/api/health');
    return true;
  } catch {
    return false;
  }
}

// ── Baseline API ──────────────────────────────────────────────────────────────

export async function listBaselines(): Promise<GPOInfo[]> {
  const { data } = await api.get('/api/baselines');
  return data;
}

export async function listBundledBaselines(): Promise<BundledBaseline[]> {
  const { data } = await api.get('/api/baselines/bundled');
  return data;
}

export async function loadBundledBaseline(name: string): Promise<BaselineStatus> {
  const { data } = await api.post(`/api/baselines/bundled/${encodeURIComponent(name)}`);
  return data;
}

export async function uploadBaseline(files: UploadedFileItem[]): Promise<BaselineStatus> {
  const { data } = await api.post('/api/baselines/upload', files);
  return data;
}

export async function scanBaseline(folderPath: string): Promise<BaselineStatus> {
  const { data: reg } = await api.post('/api/baselines/register-folder', { folder_path: folderPath });
  const { data } = await api.post('/api/baselines/scan', { folder_id: reg.folder_id });
  return data;
}

export async function clearBaselines(): Promise<BaselineStatus> {
  const { data } = await api.delete('/api/baselines');
  return data;
}

export async function getBaselineCompliance(baselineId: string): Promise<BaselineComplianceReport> {
  const { data } = await api.get(`/api/baselines/${encodeURIComponent(baselineId)}/compliance`);
  return data;
}

export default api;
