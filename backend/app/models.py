from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class PolicyScope(str, Enum):
    COMPUTER = "Computer"
    USER = "User"


class SettingType(str, Enum):
    REGISTRY = "Registry"
    SECURITY = "Security"
    ADMIN_TEMPLATE = "AdminTemplate"
    AUDIT = "Audit"
    PRIVILEGE = "Privilege"
    KERBEROS = "Kerberos"
    SYSTEM_ACCESS = "SystemAccess"
    OTHER = "Other"


class SettingState(str, Enum):
    ENABLED = "Enabled"
    DISABLED = "Disabled"
    NOT_CONFIGURED = "NotConfigured"


class PolicySetting(BaseModel):
    key_path: str = Field(description="Registry key path or policy path")
    value_name: str = Field(default="", description="Registry value name or setting name")
    display_name: str = Field(default="", description="Human-readable name from GPO report")
    value: Any = Field(default=None, description="Setting value")
    value_display: str = Field(default="", description="Human-readable value display")
    setting_type: SettingType = SettingType.REGISTRY
    scope: PolicyScope = PolicyScope.COMPUTER
    state: SettingState = SettingState.ENABLED
    category: str = Field(default="", description="Category path from GPO report")
    explain: str = Field(default="", description="Explanation text")
    supported: str = Field(default="", description="Supported-on text")
    raw_type: int = Field(default=0, description="Windows registry type (REG_SZ=1, REG_DWORD=4, etc.)")

    @property
    def normalized_path(self) -> str:
        """Normalized key for comparison: lowercase path + value name."""
        parts = self.key_path.replace("/", "\\").strip("\\").lower()
        if self.value_name:
            return f"{parts}\\{self.value_name.lower()}"
        return parts


class GPOInfo(BaseModel):
    id: str = Field(description="Backup folder GUID")
    gpo_guid: str = Field(default="", description="Actual GPO object GUID")
    display_name: str
    domain: str = Field(default="")
    domain_controller: str = Field(default="")
    created_time: str = Field(default="")
    modified_time: str = Field(default="")
    backup_time: str = Field(default="")
    computer_version: int = Field(default=0)
    user_version: int = Field(default=0)
    computer_enabled: bool = Field(default=True)
    user_enabled: bool = Field(default=True)
    setting_count: int = Field(default=0)
    sddl: str = Field(default="")


class GPODetail(BaseModel):
    info: GPOInfo
    settings: list[PolicySetting] = Field(default_factory=list)
    parse_warnings: list[str] = Field(default_factory=list)


class CompareRequest(BaseModel):
    gpo_ids: list[str] = Field(min_length=2, description="List of GPO IDs to compare")


class DiffEntry(BaseModel):
    key_path: str
    value_name: str
    display_name: str
    category: str
    scope: PolicyScope
    setting_type: SettingType
    values: dict[str, Any] = Field(description="GPO ID -> value mapping")
    states: dict[str, str] = Field(description="GPO ID -> state mapping")
    diff_type: str = Field(description="only_in_one | different_values | identical")


class ComparisonResult(BaseModel):
    gpo_ids: list[str]
    gpo_names: dict[str, str]
    differences: list[DiffEntry] = Field(default_factory=list)
    identical: list[DiffEntry] = Field(default_factory=list)
    total_unique_settings: int = 0
    diff_count: int = 0
    identical_count: int = 0


class ConflictSeverity(str, Enum):
    HIGH = "High"
    MEDIUM = "Medium"
    LOW = "Low"


class ConflictEntry(BaseModel):
    key_path: str
    value_name: str
    display_name: str
    category: str
    scope: PolicyScope
    setting_type: SettingType
    severity: ConflictSeverity
    involved_gpos: list[dict[str, Any]] = Field(
        description="List of {gpo_id, gpo_name, value, state}"
    )


class ConflictResult(BaseModel):
    total_conflicts: int = 0
    conflicts: list[ConflictEntry] = Field(default_factory=list)
    by_category: dict[str, int] = Field(default_factory=dict)
    by_severity: dict[str, int] = Field(default_factory=dict)


class ScanRequest(BaseModel):
    folder_path: str


class ScanByIdRequest(BaseModel):
    folder_id: str


class RegisterFolderResponse(BaseModel):
    folder_id: str


class UploadedFileItem(BaseModel):
    relative_path: str
    content_b64: str


class ScanStatus(BaseModel):
    folder_path: str = Field(default="")
    gpo_count: int = 0
    total_settings: int = 0
    parse_errors: list[dict[str, str]] = Field(default_factory=list)
    loaded: bool = False


# ── Security Baseline models ──────────────────────────────────────────────────

class BaselineViolationStatus(str, Enum):
    COMPLIANT = "compliant"
    WRONG_VALUE = "wrong_value"
    MISSING = "missing"


class GPOFinding(BaseModel):
    gpo_id: str
    gpo_name: str
    value: Any = None
    value_display: str = ""
    state: str = ""
    matches: bool = False


class BaselineViolation(BaseModel):
    key_path: str
    value_name: str
    display_name: str
    category: str
    scope: str
    expected_value: Any = None
    expected_value_display: str = ""
    expected_state: str = ""
    setting_type: str = ""
    status: BaselineViolationStatus
    gpo_findings: list[GPOFinding] = Field(default_factory=list)


class BaselineComplianceReport(BaseModel):
    baseline_id: str
    baseline_name: str
    total_baseline_settings: int = 0
    compliant_count: int = 0
    wrong_value_count: int = 0
    missing_count: int = 0
    violations: list[BaselineViolation] = Field(default_factory=list)
    compliant: list[BaselineViolation] = Field(default_factory=list)


class BundledBaseline(BaseModel):
    name: str
    gpo_count: int


class BaselineStatus(BaseModel):
    baseline_count: int = 0
    loaded: bool = False
    parse_errors: list[dict[str, str]] = Field(default_factory=list)
