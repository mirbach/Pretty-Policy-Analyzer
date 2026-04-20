export type PolicyScope = 'Computer' | 'User';
export type SettingType = 'Registry' | 'Security' | 'AdminTemplate' | 'Audit' | 'Privilege' | 'Kerberos' | 'SystemAccess' | 'Other';
export type SettingState = 'Enabled' | 'Disabled' | 'NotConfigured';
export type ConflictSeverity = 'High' | 'Medium' | 'Low';

export interface PolicySetting {
  key_path: string;
  value_name: string;
  display_name: string;
  value: unknown;
  value_display: string;
  setting_type: SettingType;
  scope: PolicyScope;
  state: SettingState;
  category: string;
  explain: string;
  supported: string;
  raw_type: number;
}

export interface GPOInfo {
  id: string;
  gpo_guid: string;
  display_name: string;
  domain: string;
  domain_controller: string;
  created_time: string;
  modified_time: string;
  backup_time: string;
  computer_version: number;
  user_version: number;
  computer_enabled: boolean;
  user_enabled: boolean;
  setting_count: number;
  sddl: string;
}

export interface GPODetail {
  info: GPOInfo;
  settings: PolicySetting[];
  parse_warnings: string[];
}

export interface DiffEntry {
  key_path: string;
  value_name: string;
  display_name: string;
  category: string;
  scope: PolicyScope;
  setting_type: SettingType;
  values: Record<string, unknown>;
  states: Record<string, string>;
  diff_type: 'only_in_one' | 'different_values' | 'identical';
}

export interface ComparisonResult {
  gpo_ids: string[];
  gpo_names: Record<string, string>;
  differences: DiffEntry[];
  identical: DiffEntry[];
  total_unique_settings: number;
  diff_count: number;
  identical_count: number;
}

export interface ConflictGPO {
  gpo_id: string;
  gpo_name: string;
  value: unknown;
  value_display: string;
  state: string;
}

export interface ConflictEntry {
  key_path: string;
  value_name: string;
  display_name: string;
  category: string;
  scope: PolicyScope;
  setting_type: SettingType;
  severity: ConflictSeverity;
  involved_gpos: ConflictGPO[];
}

export interface ConflictResult {
  total_conflicts: number;
  conflicts: ConflictEntry[];
  by_category: Record<string, number>;
  by_severity: Record<string, number>;
}

export interface ScanStatus {
  folder_path: string;
  gpo_count: number;
  total_settings: number;
  parse_errors: Array<{ folder: string; error: string }>;
  loaded: boolean;
}

export interface SearchResult {
  gpo_id: string;
  gpo_name: string;
  setting: PolicySetting;
}

// ── Security Baseline types ───────────────────────────────────────────────────

export type BaselineViolationStatus = 'compliant' | 'wrong_value' | 'missing';

export interface GPOFinding {
  gpo_id: string;
  gpo_name: string;
  value: unknown;
  value_display: string;
  state: string;
  matches: boolean;
}

export interface BaselineViolation {
  key_path: string;
  value_name: string;
  display_name: string;
  category: string;
  scope: string;
  expected_value: unknown;
  expected_value_display: string;
  expected_state: string;
  setting_type: string;
  status: BaselineViolationStatus;
  gpo_findings: GPOFinding[];
}

export interface BaselineComplianceReport {
  baseline_id: string;
  baseline_name: string;
  total_baseline_settings: number;
  compliant_count: number;
  wrong_value_count: number;
  missing_count: number;
  violations: BaselineViolation[];
  compliant: BaselineViolation[];
}

export interface BaselineStatus {
  baseline_count: number;
  loaded: boolean;
  parse_errors: Array<{ folder: string; error: string }>;
}
