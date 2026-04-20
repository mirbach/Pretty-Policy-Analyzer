import * as XLSX from 'xlsx';
import { getGPO } from './api';
import type { GPOInfo, PolicySetting } from '../types/gpo';

function settingToRow(s: PolicySetting, gpoName?: string) {
  return {
    ...(gpoName !== undefined ? { 'GPO Name': gpoName } : {}),
    Scope: s.scope,
    Category: s.category,
    'Display Name': s.display_name || s.value_name || '',
    'Key Path': s.key_path,
    'Value Name': s.value_name,
    Value: s.value_display || String(s.value ?? ''),
    State: s.state,
    Type: s.setting_type,
  };
}

function infoToRow(info: GPOInfo) {
  return {
    Name: info.display_name,
    Domain: info.domain,
    Created: info.created_time,
    Modified: info.modified_time,
    'Backup Time': info.backup_time,
    'Setting Count': info.setting_count,
    'Computer Enabled': info.computer_enabled ? 'Yes' : 'No',
    'User Enabled': info.user_enabled ? 'Yes' : 'No',
    GUID: info.gpo_guid,
  };
}

/** Truncate sheet name to 31 chars (Excel limit) and replace forbidden chars. */
function safeSheetName(name: string, index: number): string {
  const clean = name.replace(/[[\]:*?/\\]/g, '_');
  if (clean.length <= 31) return clean;
  const suffix = `(${index})`;
  // Reserve space for suffix + space separator
  return clean.substring(0, 31 - suffix.length - 1) + ' ' + suffix;
}

function uniqueSheetName(base: string, used: Set<string>, index: number): string {
  if (!used.has(base)) return base;
  // Append a disambiguating index, always staying ≤31 chars
  const tag = `_${index}`;
  return base.substring(0, 31 - tag.length) + tag;
}

/** Enable AutoFilter across the entire used range of a sheet. */
function addAutoFilter(sheet: XLSX.WorkSheet): void {
  const ref = sheet['!ref'];
  if (ref) sheet['!autofilter'] = { ref };
}

export async function exportSelectedGPOs(gpoIds: string[]): Promise<void> {
  const wb = XLSX.utils.book_new();

  // Fetch all GPOs in parallel
  const details = await Promise.all(gpoIds.map((id) => getGPO(id)));

  // Summary sheet
  const summaryRows = details.map((d) => infoToRow(d.info));
  const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
  addAutoFilter(summarySheet);
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

  // All Settings sheet — every setting from every GPO in one flat table
  const allSettingsRows = details.flatMap((d) =>
    d.settings.map((s) => settingToRow(s, d.info.display_name))
  );
  const allSheet = XLSX.utils.json_to_sheet(allSettingsRows.length > 0 ? allSettingsRows : [{}]);
  addAutoFilter(allSheet);
  XLSX.utils.book_append_sheet(wb, allSheet, 'All Settings');

  // One sheet per GPO
  const usedNames = new Set<string>(['Summary', 'All Settings']);
  details.forEach((d, i) => {
    const rows = d.settings.map((s) => settingToRow(s));
    const sheet = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{}]);
    addAutoFilter(sheet);

    const baseName = safeSheetName(d.info.display_name, i + 1);
    const sheetName = uniqueSheetName(baseName, usedNames, i + 1);
    usedNames.add(sheetName);
    XLSX.utils.book_append_sheet(wb, sheet, sheetName);
  });

  // Use Blob download — works in all browsers (writeFile relies on Node FS)
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `GPO_Export_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Delay revoke so the browser has time to start the download
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
