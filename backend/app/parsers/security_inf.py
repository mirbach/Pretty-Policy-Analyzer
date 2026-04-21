"""Parse GptTmpl.inf security template files."""

from __future__ import annotations

import os
import re
from typing import Any

from ..models import PolicyScope, PolicySetting, SettingState, SettingType
from ._path_utils import safe_resolve_file

# Section name -> SettingType mapping
SECTION_TYPE_MAP = {
    "System Access": SettingType.SYSTEM_ACCESS,
    "Event Audit": SettingType.AUDIT,
    "Privilege Rights": SettingType.PRIVILEGE,
    "Kerberos Policy": SettingType.KERBEROS,
    "Registry Values": SettingType.REGISTRY,
}


def parse_security_inf(file_path: str) -> tuple[list[PolicySetting], list[str]]:
    """Parse a GptTmpl.inf file and return list of settings + warnings."""
    file_path = safe_resolve_file(file_path)
    if not os.path.isfile(file_path):  # lgtm[py/path-injection]
        return [], []

    warnings: list[str] = []

    # Try different encodings
    content = None
    for encoding in ("utf-16", "utf-16-le", "utf-8-sig", "utf-8", "latin-1"):
        try:
            with open(file_path, "r", encoding=encoding) as f:  # lgtm[py/path-injection]
                content = f.read()
            break
        except (UnicodeDecodeError, UnicodeError):
            continue

    if content is None:
        return [], [f"Failed to read {file_path}"]

    settings: list[PolicySetting] = []
    current_section = ""

    for line in content.splitlines():
        line = line.strip()
        if not line or line.startswith(";"):
            continue

        # Section header
        section_match = re.match(r"^\[(.+)\]$", line)
        if section_match:
            current_section = section_match.group(1)
            continue

        # Skip non-data sections
        if current_section in ("Unicode", "Version"):
            continue

        # Parse key = value
        eq_pos = line.find("=")
        if eq_pos < 0:
            continue

        key = line[:eq_pos].strip()
        value_str = line[eq_pos + 1:].strip()

        setting_type = SECTION_TYPE_MAP.get(current_section, SettingType.SECURITY)

        # Parse Registry Values specially: MACHINE\path = type,value
        if current_section == "Registry Values":
            parts = value_str.split(",", 1)
            reg_type_num = 0
            val: Any = value_str
            if len(parts) == 2:
                try:
                    reg_type_num = int(parts[0])
                except ValueError:
                    pass
                val = parts[1]

            settings.append(PolicySetting(
                key_path=key,
                value_name=key.rsplit("\\", 1)[-1] if "\\" in key else key,
                display_name=key,
                value=val,
                value_display=str(val),
                setting_type=setting_type,
                scope=PolicyScope.COMPUTER,
                state=SettingState.ENABLED,
                category=current_section,
                raw_type=reg_type_num,
            ))
        elif current_section == "Privilege Rights":
            # value is comma-separated SIDs
            sids = [s.strip() for s in value_str.split(",") if s.strip()]
            settings.append(PolicySetting(
                key_path=f"Privilege Rights\\{key}",
                value_name=key,
                display_name=key,
                value=sids,
                value_display=", ".join(sids),
                setting_type=setting_type,
                scope=PolicyScope.COMPUTER,
                state=SettingState.ENABLED,
                category=current_section,
            ))
        else:
            settings.append(PolicySetting(
                key_path=f"{current_section}\\{key}",
                value_name=key,
                display_name=key,
                value=value_str,
                value_display=value_str,
                setting_type=setting_type,
                scope=PolicyScope.COMPUTER,
                state=SettingState.ENABLED,
                category=current_section,
            ))

    return settings, warnings
