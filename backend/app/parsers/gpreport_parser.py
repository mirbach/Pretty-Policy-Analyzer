"""Parse gpreport.xml for structured policy settings."""

from __future__ import annotations

import os
import re
from typing import Optional

from lxml import etree

from ..models import GPOInfo, PolicyScope, PolicySetting, SettingState, SettingType

GPO_NS = "http://www.microsoft.com/GroupPolicy/Settings"
TYPES_NS = "http://www.microsoft.com/GroupPolicy/Types"
REGISTRY_NS = "http://www.microsoft.com/GroupPolicy/Settings/Registry"
SECURITY_NS = "http://www.microsoft.com/GroupPolicy/Settings/Security"

NS = {
    "g": GPO_NS,
    "t": TYPES_NS,
    "r": REGISTRY_NS,
    "s": SECURITY_NS,
}


def _text(el: Optional[etree._Element]) -> str:
    if el is None:
        return ""
    return (el.text or "").strip()


def _parse_state(state_str: str) -> SettingState:
    s = state_str.lower()
    if s == "enabled":
        return SettingState.ENABLED
    elif s == "disabled":
        return SettingState.DISABLED
    return SettingState.NOT_CONFIGURED


def _parse_registry_policies(extension: etree._Element, scope: PolicyScope) -> list[PolicySetting]:
    """Parse <q:Policy> elements under a Registry extension."""
    settings: list[PolicySetting] = []
    for policy in extension.findall(f"{{{REGISTRY_NS}}}Policy"):
        name = _text(policy.find(f"{{{REGISTRY_NS}}}Name"))
        state = _parse_state(_text(policy.find(f"{{{REGISTRY_NS}}}State")))
        category = _text(policy.find(f"{{{REGISTRY_NS}}}Category"))
        explain = _text(policy.find(f"{{{REGISTRY_NS}}}Explain"))
        supported = _text(policy.find(f"{{{REGISTRY_NS}}}Supported"))
        comment = _text(policy.find(f"{{{REGISTRY_NS}}}Comment"))

        # Extract sub-values (DropDownList, CheckBox, EditText, Numeric, ListBox, etc.)
        sub_values: dict[str, str] = {}
        for tag in ("DropDownList", "CheckBox", "EditText", "Numeric", "ListBox"):
            el = policy.find(f"{{{REGISTRY_NS}}}{tag}")
            if el is not None:
                sub_name = _text(el.find(f"{{{REGISTRY_NS}}}Name")) or tag
                val = _text(el.find(f"{{{REGISTRY_NS}}}Value")) or _text(el) or el.get("State", "")
                if not val:
                    # For CheckBox, the State attribute holds the value
                    val = _text(el.find(f"{{{REGISTRY_NS}}}State")) or ""
                sub_values[sub_name] = val

        value = sub_values if sub_values else state.value
        value_display = "; ".join(f"{k}: {v}" for k, v in sub_values.items()) if sub_values else state.value

        settings.append(PolicySetting(
            key_path=category.replace("/", "\\") if category else name,
            value_name=name,
            display_name=name,
            value=value,
            value_display=value_display,
            setting_type=SettingType.ADMIN_TEMPLATE,
            scope=scope,
            state=state,
            category=category,
            explain=explain,
            supported=supported,
        ))

    # Parse <q:RegistrySetting> elements (raw registry values in GPO report)
    for reg in extension.findall(f"{{{REGISTRY_NS}}}RegistrySetting"):
        key_path = _text(reg.find(f"{{{REGISTRY_NS}}}KeyPath"))
        val_el = reg.find(f"{{{REGISTRY_NS}}}Value")
        adm = reg.find(f"{{{REGISTRY_NS}}}AdmSetting")
        if adm is not None:
            name = _text(adm)
        else:
            name = _text(val_el.find(f"{{{REGISTRY_NS}}}Name")) if val_el is not None else ""

        settings.append(PolicySetting(
            key_path=key_path,
            value_name=name or os.path.basename(key_path),
            display_name=name or key_path,
            value=_text(val_el) if val_el is not None else "",
            value_display=_text(val_el) if val_el is not None else "",
            setting_type=SettingType.REGISTRY,
            scope=scope,
            state=SettingState.ENABLED,
            category="",
        ))

    return settings


def _parse_security_settings(extension: etree._Element, scope: PolicyScope) -> list[PolicySetting]:
    """Parse <q:SecurityOptions>, <q:Account>, etc. under a Security extension."""
    settings: list[PolicySetting] = []

    for sec_opt in extension.findall(f"{{{SECURITY_NS}}}SecurityOptions"):
        key_name = _text(sec_opt.find(f"{{{SECURITY_NS}}}KeyName"))
        setting_num = _text(sec_opt.find(f"{{{SECURITY_NS}}}SettingNumber"))
        display_el = sec_opt.find(f"{{{SECURITY_NS}}}Display")
        display_name = ""
        display_val = ""
        if display_el is not None:
            display_name = _text(display_el.find(f"{{{SECURITY_NS}}}Name"))
            display_val = (
                _text(display_el.find(f"{{{SECURITY_NS}}}DisplayString"))
                or _text(display_el.find(f"{{{SECURITY_NS}}}DisplayBoolean"))
                or setting_num
            )

        settings.append(PolicySetting(
            key_path=key_name,
            value_name=os.path.basename(key_name.replace("\\", "/")),
            display_name=display_name or key_name,
            value=setting_num,
            value_display=display_val or setting_num,
            setting_type=SettingType.SECURITY,
            scope=scope,
            state=SettingState.ENABLED,
            category="Security Options",
        ))

    for account in extension.findall(f"{{{SECURITY_NS}}}Account"):
        name = _text(account.find(f"{{{SECURITY_NS}}}Name"))
        setting_num = _text(account.find(f"{{{SECURITY_NS}}}SettingNumber"))
        setting_bool = _text(account.find(f"{{{SECURITY_NS}}}SettingBoolean"))
        display_el = account.find(f"{{{SECURITY_NS}}}Display")
        display_name = _text(display_el.find(f"{{{SECURITY_NS}}}Name")) if display_el is not None else name
        display_val = _text(display_el.find(f"{{{SECURITY_NS}}}DisplayString")) if display_el is not None else ""

        val = setting_bool if setting_bool else setting_num
        settings.append(PolicySetting(
            key_path=f"Account Policy\\{name}",
            value_name=name,
            display_name=display_name or name,
            value=val,
            value_display=display_val or val or "",
            setting_type=SettingType.SYSTEM_ACCESS,
            scope=scope,
            state=SettingState.ENABLED,
            category="Account Policy",
        ))

    blocked = _text(extension.find(f"{{{SECURITY_NS}}}Blocked"))
    if blocked:
        settings.append(PolicySetting(
            key_path="Security\\InheritanceBlocked",
            value_name="Blocked",
            display_name="Inheritance Blocked",
            value=blocked,
            value_display=blocked,
            setting_type=SettingType.SECURITY,
            scope=scope,
            state=SettingState.ENABLED,
            category="Security",
        ))

    return settings


def parse_gpreport(folder_path: str) -> tuple[GPOInfo | None, list[PolicySetting], list[str]]:
    """Parse gpreport.xml and return (GPOInfo, list of settings, warnings)."""
    safe_folder = os.path.realpath(folder_path)
    gpreport_path = os.path.join(safe_folder, "gpreport.xml")
    if not os.path.isfile(gpreport_path):
        return None, [], ["gpreport.xml not found"]

    warnings: list[str] = []

    # gpreport.xml is sometimes UTF-16 LE (with BOM) and sometimes UTF-8
    # but still carries an encoding="utf-16" declaration. Read as bytes,
    # decode correctly, then normalise the declaration before handing to lxml.
    with open(gpreport_path, "rb") as f:
        raw = f.read()

    if raw[:2] in (b"\xff\xfe", b"\xfe\xff"):
        # Genuine UTF-16 with BOM – Python's utf-16 codec handles both endians
        text = raw.decode("utf-16")
    else:
        # No BOM – file is UTF-8 despite what the declaration may say
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            return None, [], ["Failed to decode gpreport.xml"]

    # Rewrite any encoding declaration to utf-8 so lxml accepts the bytes
    text = re.sub(
        r'(<\?xml[^?]*?)encoding=["\'][^"\']*["\']',
        r'\1encoding="utf-8"',
        text,
        count=1,
        flags=re.IGNORECASE,
    )

    try:
        root = etree.fromstring(text.encode("utf-8"))
    except etree.XMLSyntaxError as e:
        return None, [], [f"XML parse error in gpreport.xml: {e}"]

    # Extract GPO info
    ns_map = {"g": GPO_NS, "t": TYPES_NS}
    identifier_el = root.find("g:Identifier", ns_map)
    gpo_guid = ""
    domain = ""
    if identifier_el is not None:
        gpo_guid = _text(identifier_el.find("t:Identifier", ns_map))
        domain = _text(identifier_el.find("t:Domain", ns_map))

    backup_id = os.path.basename(folder_path.rstrip("/\\"))
    name = _text(root.find("g:Name", ns_map))
    created = _text(root.find("g:CreatedTime", ns_map))
    modified = _text(root.find("g:ModifiedTime", ns_map))

    # Parse SecurityDescriptor for SDDL
    sddl_el = root.find("g:SecurityDescriptor", ns_map)
    sddl = ""
    if sddl_el is not None:
        sec_ns = "http://www.microsoft.com/GroupPolicy/Types/Security"
        sddl = _text(sddl_el.find(f"{{{sec_ns}}}SDDL"))

    info = GPOInfo(
        id=backup_id,
        gpo_guid=gpo_guid,
        display_name=name,
        domain=domain,
        created_time=created,
        modified_time=modified,
        sddl=sddl,
    )

    settings: list[PolicySetting] = []

    # Parse Computer and User configurations
    for scope_tag, scope in [("g:Computer", PolicyScope.COMPUTER), ("g:User", PolicyScope.USER)]:
        scope_el = root.find(scope_tag, ns_map)
        if scope_el is None:
            continue

        enabled_text = _text(scope_el.find("g:Enabled", ns_map))
        if scope == PolicyScope.COMPUTER:
            info.computer_enabled = enabled_text.lower() == "true"
            ver = _text(scope_el.find("g:VersionDirectory", ns_map))
            info.computer_version = int(ver) if ver.isdigit() else 0
        else:
            info.user_enabled = enabled_text.lower() == "true"
            ver = _text(scope_el.find("g:VersionDirectory", ns_map))
            info.user_version = int(ver) if ver.isdigit() else 0

        for ext_data in scope_el.findall("g:ExtensionData", ns_map):
            ext_el = ext_data.find("g:Extension", ns_map)
            if ext_el is None:
                continue

            xsi_type = ext_el.get(f"{{{NS['g']}}}type", "") or ext_el.get(
                "{http://www.w3.org/2001/XMLSchema-instance}type", ""
            )

            try:
                if "RegistrySettings" in xsi_type or ext_el.find(f"{{{REGISTRY_NS}}}Policy") is not None:
                    settings.extend(_parse_registry_policies(ext_el, scope))
                elif "SecuritySettings" in xsi_type or ext_el.find(f"{{{SECURITY_NS}}}SecurityOptions") is not None:
                    settings.extend(_parse_security_settings(ext_el, scope))
            except Exception as e:
                warnings.append(f"Error parsing extension ({xsi_type}) in {scope.value}: {e}")

            # Also get the extension name from the sibling <Name> element
            ext_name_el = ext_data.find("g:Name", ns_map)
            if ext_name_el is not None:
                ext_name = _text(ext_name_el)
                # Tag settings from this extension with the extension name if no category set
                for s in settings:
                    if not s.category and ext_name:
                        s.category = ext_name

    info.setting_count = len(settings)
    return info, settings, warnings
