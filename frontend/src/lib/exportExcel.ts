import ExcelJS from 'exceljs';
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
  return clean.substring(0, 31 - suffix.length - 1) + ' ' + suffix;
}

function uniqueSheetName(base: string, used: Set<string>, index: number): string {
  if (!used.has(base)) return base;
  const tag = `_${index}`;
  return base.substring(0, 31 - tag.length) + tag;
}

function addSheetFromRows(
  wb: ExcelJS.Workbook,
  name: string,
  rows: Record<string, unknown>[],
): void {
  const sheet = wb.addWorksheet(name);
  const nonEmpty = rows.filter((r) => Object.keys(r).length > 0);
  if (nonEmpty.length === 0) return;

  // Derive columns from the first non-empty row's keys
  const keys = Object.keys(nonEmpty[0]);
  sheet.columns = keys.map((key) => ({ header: key, key, width: 24 }));
  sheet.addRows(nonEmpty);

  // Apply auto-filter across the header row
  const dims = sheet.dimensions;
  if (dims) {
    sheet.autoFilter = typeof dims === 'string' ? dims : String(dims);
  }
}

export async function exportSelectedGPOs(gpoIds: string[]): Promise<void> {
  const wb = new ExcelJS.Workbook();

  // Fetch all GPOs in parallel
  const details = await Promise.all(gpoIds.map((id) => getGPO(id)));

  // Summary sheet
  addSheetFromRows(wb, 'Summary', details.map((d) => infoToRow(d.info)));

  // All Settings sheet — every setting from every GPO in one flat table
  const allSettingsRows = details.flatMap((d) =>
    d.settings.map((s) => settingToRow(s, d.info.display_name)),
  );
  addSheetFromRows(wb, 'All Settings', allSettingsRows);

  // One sheet per GPO
  const usedNames = new Set<string>(['Summary', 'All Settings']);
  details.forEach((d, i) => {
    const rows = d.settings.map((s) => settingToRow(s));
    const baseName = safeSheetName(d.info.display_name, i + 1);
    const sheetName = uniqueSheetName(baseName, usedNames, i + 1);
    usedNames.add(sheetName);
    addSheetFromRows(wb, sheetName, rows);
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
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
