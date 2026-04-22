import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../lib/api';
import type { UploadedFileItem } from '../lib/api';

export function useStatus() {
  return useQuery({
    queryKey: ['status'],
    queryFn: api.getStatus,
  });
}

export function useScanFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => api.scanFolder(path),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['status'] });
      qc.invalidateQueries({ queryKey: ['gpos'] });
    },
  });
}

export function useClear() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.clearData(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['status'] });
      qc.invalidateQueries({ queryKey: ['gpos'] });
    },
  });
}

export function useScanUpload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (files: UploadedFileItem[]) => api.scanUpload(files),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['status'] });
      qc.invalidateQueries({ queryKey: ['gpos'] });
    },
  });
}

export function useImportLocalPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.importLocalPolicy(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['status'] });
      qc.invalidateQueries({ queryKey: ['gpos'] });
    },
  });
}

export function useDeleteGPO() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteGPO(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['status'] });
      qc.invalidateQueries({ queryKey: ['gpos'] });
    },
  });
}

export function useGPOs(search?: string) {
  return useQuery({
    queryKey: ['gpos', search],
    queryFn: () => api.listGPOs(search),
  });
}

export function useGPO(id: string | null) {
  return useQuery({
    queryKey: ['gpo', id],
    queryFn: () => api.getGPO(id!),
    enabled: !!id,
  });
}

export function useGPOSettings(id: string | null, filters?: Record<string, string>) {
  return useQuery({
    queryKey: ['gpo-settings', id, filters],
    queryFn: () => api.getGPOSettings(id!, filters),
    enabled: !!id,
  });
}

export function useCompare(gpoIds: string[]) {
  return useQuery({
    queryKey: ['compare', ...gpoIds],
    queryFn: () => api.compareGPOs(gpoIds),
    enabled: gpoIds.length >= 2,
  });
}

export function useConflicts(filters?: { category?: string; severity?: string }) {
  return useQuery({
    queryKey: ['conflicts', filters],
    queryFn: () => api.getConflicts(filters),
  });
}

export function useSearchAll(query: string) {
  return useQuery({
    queryKey: ['search', query],
    queryFn: () => api.searchAllSettings(query),
    enabled: query.length >= 2,
  });
}

// ── Baseline hooks ────────────────────────────────────────────────────────────

export function useBaselines() {
  return useQuery({
    queryKey: ['baselines'],
    queryFn: api.listBaselines,
  });
}

export function useBundledBaselines() {
  return useQuery({
    queryKey: ['bundled-baselines'],
    queryFn: api.listBundledBaselines,
  });
}

export function useLoadBundledBaseline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.loadBundledBaseline(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['baselines'] });
      qc.invalidateQueries({ queryKey: ['baseline-compliance'] });
    },
  });
}

export function useUploadBaseline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (files: UploadedFileItem[]) => api.uploadBaseline(files),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['baselines'] }),
  });
}

export function useScanBaseline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (folderPath: string) => api.scanBaseline(folderPath),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['baselines'] }),
  });
}

export function useClearBaselines() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.clearBaselines(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['baselines'] });
      qc.invalidateQueries({ queryKey: ['baseline-compliance'] });
    },
  });
}

export function useBaselineCompliance(baselineId: string | null, gpoCount: number) {
  return useQuery({
    queryKey: ['baseline-compliance', baselineId],
    queryFn: () => api.getBaselineCompliance(baselineId!),
    enabled: !!baselineId && gpoCount > 0,
  });
}
