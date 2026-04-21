"""Orchestrate parsing of a single GPO backup folder."""

from __future__ import annotations

import os
import re

from ..models import GPODetail, GPOInfo, PolicyScope, PolicySetting, SettingType
from .backup_parser import parse_bkupinfo
from .gpreport_parser import parse_gpreport
from .registry_pol import parse_registry_pol
from .security_inf import parse_security_inf

GUID_PATTERN = re.compile(r"^\{[0-9a-fA-F\-]{36}\}$")


def is_gpo_folder(path: str) -> bool:
    """Check if a directory looks like a GPO backup folder."""
    path = os.path.realpath(path)
    if not os.path.isdir(path):
        return False
    dirname = os.path.basename(path.rstrip("/\\"))
    if not GUID_PATTERN.match(dirname):
        return False
    # Must have at least bkupInfo.xml or gpreport.xml
    return (
        os.path.isfile(os.path.join(path, "bkupInfo.xml"))
        or os.path.isfile(os.path.join(path, "gpreport.xml"))
    )


def parse_gpo_folder(folder_path: str) -> GPODetail:
    """Parse a single GPO backup folder and return structured data."""
    folder_path = os.path.realpath(folder_path)
    warnings: list[str] = []
    all_settings: list[PolicySetting] = []

    # 1. Parse bkupInfo.xml for basic metadata
    info = parse_bkupinfo(folder_path)

    # 2. Parse gpreport.xml for detailed settings and enriched metadata
    gpr_info, gpr_settings, gpr_warnings = parse_gpreport(folder_path)
    warnings.extend(gpr_warnings)
    all_settings.extend(gpr_settings)

    # Merge info from both sources
    if info is None and gpr_info is not None:
        info = gpr_info
    elif info is not None and gpr_info is not None:
        # Enrich bkupInfo data with gpreport data
        if gpr_info.created_time:
            info.created_time = gpr_info.created_time
        if gpr_info.modified_time:
            info.modified_time = gpr_info.modified_time
        if gpr_info.computer_version:
            info.computer_version = gpr_info.computer_version
        if gpr_info.user_version:
            info.user_version = gpr_info.user_version
        info.computer_enabled = gpr_info.computer_enabled
        info.user_enabled = gpr_info.user_enabled
        if gpr_info.sddl:
            info.sddl = gpr_info.sddl

    if info is None:
        backup_id = os.path.basename(folder_path.rstrip("/\\"))
        info = GPOInfo(id=backup_id, display_name=backup_id)
        warnings.append("Could not parse GPO metadata from bkupInfo.xml or gpreport.xml")

    # 3. Parse registry.pol files for detailed registry settings
    sysvol_base = os.path.join(folder_path, "DomainSysvol", "GPO")

    machine_pol = os.path.join(sysvol_base, "Machine", "registry.pol")
    pol_settings, pol_warnings = parse_registry_pol(machine_pol, PolicyScope.COMPUTER)
    all_settings.extend(pol_settings)
    warnings.extend(pol_warnings)

    user_pol = os.path.join(sysvol_base, "User", "registry.pol")
    pol_settings, pol_warnings = parse_registry_pol(user_pol, PolicyScope.USER)
    all_settings.extend(pol_settings)
    warnings.extend(pol_warnings)

    # 4. Parse GptTmpl.inf for security settings
    inf_path = os.path.join(sysvol_base, "Machine", "microsoft", "windows nt", "SecEdit", "GptTmpl.inf")
    inf_settings, inf_warnings = parse_security_inf(inf_path)
    all_settings.extend(inf_settings)
    warnings.extend(inf_warnings)

    # Deduplicate settings: prefer gpreport.xml (richer) over registry.pol for the same path
    seen: dict[str, int] = {}
    deduped: list[PolicySetting] = []
    for s in all_settings:
        norm = s.normalized_path
        if norm in seen:
            existing = deduped[seen[norm]]
            # Prefer the one with more metadata (display_name, category, explain)
            if existing.display_name and not s.display_name:
                continue
            if s.explain and not existing.explain:
                deduped[seen[norm]] = s
                continue
            # If from gpreport (AdminTemplate) vs registry.pol (Registry), prefer gpreport
            if existing.setting_type == SettingType.ADMIN_TEMPLATE:
                continue
            if s.setting_type == SettingType.ADMIN_TEMPLATE:
                deduped[seen[norm]] = s
                continue
            # Otherwise keep first
            continue
        else:
            seen[norm] = len(deduped)
            deduped.append(s)

    # Need SettingType in scope for dedup logic (imported at top)

    info.setting_count = len(deduped)
    return GPODetail(info=info, settings=deduped, parse_warnings=warnings)


def scan_gpo_folder(root_path: str) -> tuple[list[GPODetail], list[dict[str, str]]]:
    """Scan a directory for GPO backup folders and parse them all."""
    root_path = os.path.realpath(root_path)
    if not os.path.isdir(root_path):
        return [], [{"folder": root_path, "error": "Directory does not exist"}]

    gpos: list[GPODetail] = []
    errors: list[dict[str, str]] = []

    for entry in sorted(os.listdir(root_path)):
        sub_path = os.path.realpath(os.path.join(root_path, entry))
        # Ensure each sub-path stays within the root (guards against symlink escapes)
        if not sub_path.startswith(root_path + os.sep) and sub_path != root_path:
            continue
        if not is_gpo_folder(sub_path):
            continue

        try:
            detail = parse_gpo_folder(sub_path)
            gpos.append(detail)
        except Exception as e:
            errors.append({"folder": entry, "error": str(e)})

    return gpos, errors
