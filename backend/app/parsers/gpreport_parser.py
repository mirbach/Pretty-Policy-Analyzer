"""Parse gpreport.xml for structured policy settings."""

from __future__ import annotations

import base64
import os
import re
from typing import Optional

from lxml import etree
from Crypto.Cipher import AES

from ..models import GPOInfo, PolicyScope, PolicySetting, SettingState, SettingType
from ._path_utils import safe_resolve_dir

GPO_NS = "http://www.microsoft.com/GroupPolicy/Settings"
TYPES_NS = "http://www.microsoft.com/GroupPolicy/Types"
REGISTRY_NS = "http://www.microsoft.com/GroupPolicy/Settings/Registry"
SECURITY_NS = "http://www.microsoft.com/GroupPolicy/Settings/Security"
AUDIT_NS = "http://www.microsoft.com/GroupPolicy/Settings/Auditing"
SRPV2_NS = "http://www.microsoft.com/GroupPolicy/Settings/SRPV2"  # AppLocker

# Group Policy Preferences (GPP) extension namespaces.
SCRIPTS_NS = "http://www.microsoft.com/GroupPolicy/Settings/Scripts"
SHORTCUTS_NS = "http://www.microsoft.com/GroupPolicy/Settings/Shortcuts"
FILES_NS = "http://www.microsoft.com/GroupPolicy/Settings/Files"
FOLDERS_NS = "http://www.microsoft.com/GroupPolicy/Settings/Folders"
FOLDER_OPTIONS_NS = "http://www.microsoft.com/GroupPolicy/Settings/FolderOptions"
LUGS_NS = "http://www.microsoft.com/GroupPolicy/Settings/Lugs"
ENVIRONMENT_NS = "http://www.microsoft.com/GroupPolicy/Settings/Environment"
DRIVE_MAPS_NS = "http://www.microsoft.com/GroupPolicy/Settings/DriveMaps"
SERVICES_NS = "http://www.microsoft.com/GroupPolicy/Settings/Services"
SCHEDULED_TASKS_NS = "http://www.microsoft.com/GroupPolicy/Settings/ScheduledTasks"

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
                if tag == "ListBox":
                    # ListBox values are a list of <Element><Data>...</Data></Element> entries
                    # rather than a single text node.
                    value_el = el.find(f"{{{REGISTRY_NS}}}Value")
                    items: list[str] = []
                    if value_el is not None:
                        for item in value_el:
                            data_el = item.find(f"{{{REGISTRY_NS}}}Data")
                            text_val = _text(data_el) if data_el is not None else _text(item)
                            if text_val:
                                items.append(text_val)
                    val = ", ".join(items)
                else:
                    val = _text(el.find(f"{{{REGISTRY_NS}}}Value")) or _text(el) or el.get("State", "")
                if not val:
                    # For CheckBox/empty ListBox, the State attribute holds the value
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
        name = _text(val_el.find(f"{{{REGISTRY_NS}}}Name")) if val_el is not None else ""
        value_text = ""
        if val_el is not None:
            value_text = (
                _text(val_el.find(f"{{{REGISTRY_NS}}}String"))
                or _text(val_el.find(f"{{{REGISTRY_NS}}}Number"))
            )

        settings.append(PolicySetting(
            key_path=key_path,
            value_name=name or os.path.basename(key_path),
            display_name=name or os.path.basename(key_path),
            value=value_text,
            value_display=value_text,
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
    if blocked.lower() == "true":
        settings.append(PolicySetting(
            key_path="Security\\ExtensionBlocked",
            value_name="Blocked",
            display_name="Security Extension Blocked",
            value=blocked,
            value_display=blocked,
            setting_type=SettingType.SECURITY,
            scope=scope,
            state=SettingState.ENABLED,
            category="Security",
        ))

    return settings


# ── Advanced Audit Policy Configuration ────────────────────────────────────────

_AUDIT_VALUE_LABELS = {
    "0": "No Auditing",
    "1": "Success",
    "2": "Failure",
    "3": "Success and Failure",
}


def _parse_audit_settings(extension: etree._Element, scope: PolicyScope) -> list[PolicySetting]:
    """Parse <q:AuditSetting> entries (Security Settings > Advanced Audit Policy Configuration)."""
    settings: list[PolicySetting] = []
    for audit in extension.findall(f"{{{AUDIT_NS}}}AuditSetting"):
        target = _text(audit.find(f"{{{AUDIT_NS}}}PolicyTarget"))
        name = _text(audit.find(f"{{{AUDIT_NS}}}SubcategoryName"))
        guid = _text(audit.find(f"{{{AUDIT_NS}}}SubcategoryGuid"))
        raw_value = _text(audit.find(f"{{{AUDIT_NS}}}SettingValue"))
        value_display = _AUDIT_VALUE_LABELS.get(raw_value, raw_value)

        settings.append(PolicySetting(
            key_path=f"Advanced Audit Policy Configuration\\{target}" if target else "Advanced Audit Policy Configuration",
            value_name=name or guid,
            display_name=name or guid,
            value=value_display,
            value_display=value_display,
            setting_type=SettingType.AUDIT,
            scope=scope,
            state=SettingState.ENABLED,
            category="Advanced Audit Policy Configuration",
        ))
    return settings


# ── AppLocker (Application Control Policies) ───────────────────────────────────

_APPLOCKER_RULE_TAGS = ("FilePublisherRule", "FilePathRule", "FileHashRule")


def _applocker_condition_summary(rule: etree._Element) -> str:
    conditions = rule.find(f"{{{SRPV2_NS}}}Conditions")
    if conditions is None:
        return ""
    parts = []
    for cond in conditions:
        if not isinstance(cond.tag, str):
            continue
        cond_name = _local_name(cond.tag)
        attrs = " ".join(f"{k}={v}" for k, v in cond.attrib.items() if v and v != "*")
        parts.append(f"{cond_name}({attrs})" if attrs else cond_name)
    return "; ".join(parts)


def _parse_applocker(extension: etree._Element, scope: PolicyScope) -> list[PolicySetting]:
    """Parse the SRPV2 (AppLocker) extension: per-collection enforcement mode and rules."""
    settings: list[PolicySetting] = []
    for collection in extension.findall(f"{{{SRPV2_NS}}}RuleCollection"):
        coll_type = collection.get("Type", "")
        key_path = f"AppLocker\\{coll_type}" if coll_type else "AppLocker"

        mode_el = collection.find(f"{{{SRPV2_NS}}}EnforcementMode")
        mode = _text(mode_el.find(f"{{{SRPV2_NS}}}Mode")) if mode_el is not None else ""
        if mode:
            settings.append(PolicySetting(
                key_path=key_path,
                value_name="EnforcementMode",
                display_name=f"{coll_type} Rules Enforcement" if coll_type else "Enforcement",
                value=mode,
                value_display=mode,
                setting_type=SettingType.SOFTWARE_RESTRICTION,
                scope=scope,
                state=SettingState.ENABLED,
                category="AppLocker",
            ))

        for rule_tag in _APPLOCKER_RULE_TAGS:
            for rule in collection.findall(f"{{{SRPV2_NS}}}{rule_tag}"):
                name = rule.get("Name") or rule.get("Id", "")
                action = rule.get("Action", "")
                sid = rule.get("UserOrGroupSid", "")
                condition = _applocker_condition_summary(rule)
                value_display = f"{action} ({sid})" if sid else action
                if condition:
                    value_display = f"{value_display} — {condition}"

                settings.append(PolicySetting(
                    key_path=key_path,
                    value_name=name,
                    display_name=name,
                    value=value_display,
                    value_display=value_display,
                    setting_type=SettingType.SOFTWARE_RESTRICTION,
                    scope=scope,
                    state=SettingState.ENABLED,
                    category="AppLocker",
                    explain=rule.get("Description", ""),
                ))
    return settings


# ── Group Policy Preferences (GPP) items ───────────────────────────────────────
#
# GPP extensions (Drive Maps, Local Users and Groups, Files, Folders, Shortcuts,
# Environment Variables, Folder Options, Services) all share one shape: a
# container element wrapping "item" elements (tag name varies: Drive, File,
# Group, User, ...) that each carry a <Properties> element describing the
# action to take. _gpp_items() walks that shape generically; each extension
# gets a small bespoke formatter so the resulting rows read naturally.

# The static AES-256 key Microsoft published for encrypting GPP "cpassword"
# values (MS-GPPREF / MS14-025). It has been public since 2012, so any
# cpassword found in a GPO backup is a de-facto plaintext, recoverable
# credential -- surfacing and decrypting it here is the point of an audit tool.
_GPP_AES_KEY = bytes([
    0x4e, 0x99, 0x06, 0xe8, 0xfc, 0xb6, 0x6c, 0xc9, 0xfa, 0xf4, 0x93, 0x10, 0x62, 0x0f, 0xfe, 0xe8,
    0xf4, 0x96, 0xe8, 0x06, 0xcc, 0x05, 0x79, 0x90, 0x20, 0x9b, 0x09, 0xa4, 0x33, 0xb6, 0x6c, 0x1b,
])


def _decrypt_gpp_cpassword(cpassword: str) -> Optional[str]:
    """Decrypt a GPP cpassword. Returns None if it isn't validly formed."""
    try:
        padded = cpassword
        mod = len(padded) % 4
        if mod == 1:
            padded = padded[:-1]
        elif mod:
            padded += "=" * (4 - mod)
        data = base64.b64decode(padded)
        if not data or len(data) % 16:
            return None
        raw = AES.new(_GPP_AES_KEY, AES.MODE_CBC, iv=b"\x00" * 16).decrypt(data)
        pad_len = raw[-1]
        if 1 <= pad_len <= 16:
            raw = raw[:-pad_len]
        return raw.decode("utf-16le")
    except Exception:
        return None


_GPP_ACTION_LABELS = {"C": "Create", "R": "Replace", "U": "Update", "D": "Delete", "T": "Replace"}


def _gpp_action(props: dict[str, str]) -> str:
    action = props.get("action", "")
    return _GPP_ACTION_LABELS.get(action, action)


def _gpp_filters_summary(item: etree._Element) -> str:
    """Best-effort summary of item-level targeting (Filters) -- who/what this
    preference item is scoped to, e.g. a security-group filter on a drive map."""
    filters_el = None
    for child in item:
        if isinstance(child.tag, str) and _local_name(child.tag) == "Filters":
            filters_el = child
            break
    if filters_el is None:
        return ""
    parts = []
    for f in filters_el:
        if not isinstance(f.tag, str):
            continue
        tag = _local_name(f.tag)
        if tag == "FilterRunOnce":
            continue  # internal bookkeeping, not meaningful targeting
        attrs = f.attrib
        label = attrs.get("name") or attrs.get("class")
        neg = "NOT " if attrs.get("not") == "1" else ""
        parts.append(f"{neg}{tag}({label})" if label else f"{neg}{tag}")
    return ", ".join(parts)


def _gpp_items(extension: etree._Element):
    """Yield (item_element, item_attrs, props_attrs, props_element) for every
    GPP preference item in an extension: any element with a direct
    <Properties> child, regardless of its own tag name (Drive, File, Group,
    User, GlobalFolderOptionsVista, ... all vary by extension)."""
    for item in extension.iter():
        if not isinstance(item.tag, str):
            continue
        props_el = None
        for child in item:
            if isinstance(child.tag, str) and _local_name(child.tag) == "Properties":
                props_el = child
                break
        if props_el is None:
            continue
        yield item, dict(item.attrib), dict(props_el.attrib), props_el


def _emit_gpp(
    out: list[PolicySetting],
    scope: PolicyScope,
    category: str,
    key_path: str,
    name: str,
    value: str,
    explain: str = "",
) -> None:
    out.append(PolicySetting(
        key_path=key_path,
        value_name=name,
        display_name=name,
        value=value,
        value_display=value,
        setting_type=SettingType.PREFERENCE,
        scope=scope,
        state=SettingState.ENABLED,
        category=category,
        explain=explain,
    ))


def _flag_cpassword(value: str, cpassword: str, warnings: list[str], scope: PolicyScope, what: str) -> str:
    """Append a decrypted (or flagged) credential to a value string and record
    a top-level warning. `what` describes the credential, e.g. "Drive Map 'M:'"."""
    plain = _decrypt_gpp_cpassword(cpassword)
    if plain is not None:
        value += f" — \U0001F534 CREDENTIAL RECOVERABLE: '{plain}'"
    else:
        value += " — \U0001F534 CREDENTIAL RECOVERABLE (cpassword present, could not decode)"
    warnings.append(
        f"CRITICAL: {what} stores a recoverable password in {scope.value} Configuration "
        f"(GPP cpassword, decryptable with Microsoft's long-public MS14-025 key) "
        f"— treat as compromised and rotate immediately."
    )
    return value


_SCRIPT_TYPE_LABELS = {
    "Logon": "Logon Script",
    "Logoff": "Logoff Script",
    "Startup": "Startup Script",
    "Shutdown": "Shutdown Script",
}


def _parse_scripts(extension: etree._Element, scope: PolicyScope) -> list[PolicySetting]:
    """Parse the classic (non-GPP) Scripts extension: logon/logoff scripts
    under User, startup/shutdown scripts under Computer."""
    settings: list[PolicySetting] = []
    for script in extension.findall(f"{{{SCRIPTS_NS}}}Script"):
        command = _text(script.find(f"{{{SCRIPTS_NS}}}Command"))
        parameters = _text(script.find(f"{{{SCRIPTS_NS}}}Parameters"))
        script_type = _text(script.find(f"{{{SCRIPTS_NS}}}Type")) or "Logon"
        order = _text(script.find(f"{{{SCRIPTS_NS}}}Order"))

        value = f"{command} {parameters}".strip() if parameters else command
        settings.append(PolicySetting(
            key_path=f"Scripts\\{script_type}",
            value_name=command,
            display_name=_SCRIPT_TYPE_LABELS.get(script_type, script_type),
            value=value,
            value_display=value,
            setting_type=SettingType.OTHER,
            scope=scope,
            state=SettingState.ENABLED,
            category="Scripts",
            explain=f"Run order: {order}" if order else "",
        ))
    return settings


def _parse_shortcuts(extension: etree._Element, scope: PolicyScope) -> list[PolicySetting]:
    settings: list[PolicySetting] = []
    for item, item_attrs, props, _ in _gpp_items(extension):
        action = _gpp_action(props)
        dest = props.get("shortcutPath") or item_attrs.get("name", "")
        target = props.get("targetPath", "")
        args = props.get("arguments", "")
        value = f"{action}: {dest}"
        if target:
            value += f" → {target}"
        if args:
            value += f" {args}"
        filt = _gpp_filters_summary(item)
        if filt:
            value += f" [{filt}]"
        name = item_attrs.get("name") or dest
        _emit_gpp(settings, scope, "Preferences / Shortcuts", f"Preferences\\Shortcuts\\{name}", name, value)
    return settings


def _parse_files(extension: etree._Element, scope: PolicyScope) -> list[PolicySetting]:
    settings: list[PolicySetting] = []
    for item, item_attrs, props, _ in _gpp_items(extension):
        action = _gpp_action(props)
        src = props.get("fromPath", "")
        dst = props.get("targetPath", "")
        value = f"{action}: {src} → {dst}" if (src or dst) else action
        filt = _gpp_filters_summary(item)
        if filt:
            value += f" [{filt}]"
        name = item_attrs.get("name") or dst
        _emit_gpp(settings, scope, "Preferences / Files", f"Preferences\\Files\\{name}", name, value)
    return settings


def _parse_folders(extension: etree._Element, scope: PolicyScope) -> list[PolicySetting]:
    settings: list[PolicySetting] = []
    for item, item_attrs, props, _ in _gpp_items(extension):
        action = _gpp_action(props)
        path = props.get("path", "")
        value = f"{action}: {path}"
        filt = _gpp_filters_summary(item)
        if filt:
            value += f" [{filt}]"
        name = item_attrs.get("name") or path
        _emit_gpp(settings, scope, "Preferences / Folders", f"Preferences\\Folders\\{name}", name, value)
    return settings


_FOLDER_OPTIONS_NOTABLE = {
    "hidden": "Show hidden files/folders",
    "hideFileExt": "Hide known file extensions",
    "showSuperHidden": "Show protected OS files",
}


def _parse_folder_options(extension: etree._Element, scope: PolicyScope) -> list[PolicySetting]:
    settings: list[PolicySetting] = []
    for item, item_attrs, props, _ in _gpp_items(extension):
        parts = [f"{label}: {props[attr]}" for attr, label in _FOLDER_OPTIONS_NOTABLE.items() if attr in props]
        if not parts:
            parts = [f"{k}: {v}" for k, v in props.items() if k != "action" and v]
        value = "; ".join(parts)
        name = item_attrs.get("name") or _local_name(item.tag)
        _emit_gpp(settings, scope, "Preferences / Folder Options", f"Preferences\\Folder Options\\{name}", name, value)
    return settings


def _parse_environment_vars(extension: etree._Element, scope: PolicyScope) -> list[PolicySetting]:
    settings: list[PolicySetting] = []
    for item, item_attrs, props, _ in _gpp_items(extension):
        action = _gpp_action(props)
        name = props.get("name") or item_attrs.get("name", "")
        val = props.get("value", "")
        var_scope = "User" if props.get("user") == "1" else "System"
        value = f"{action}: {name} = {val} ({var_scope})"
        filt = _gpp_filters_summary(item)
        if filt:
            value += f" [{filt}]"
        _emit_gpp(settings, scope, "Preferences / Environment Variables", f"Preferences\\Environment Variables\\{name}", name, value)
    return settings


def _parse_drive_maps(extension: etree._Element, scope: PolicyScope, warnings: list[str]) -> list[PolicySetting]:
    settings: list[PolicySetting] = []
    for item, item_attrs, props, _ in _gpp_items(extension):
        action = _gpp_action(props)
        letter = props.get("letter") or item_attrs.get("name", "")
        path = props.get("path", "")
        label = props.get("label", "")
        user = props.get("userName", "")
        value = f"{action}: {letter}: → {path}"
        if label:
            value += f" (label: {label})"
        if user:
            value += f" as {user}"
        cpw = props.get("cpassword")
        if cpw:
            value = _flag_cpassword(value, cpw, warnings, scope, f"Drive Map '{letter}:'")
        filt = _gpp_filters_summary(item)
        if filt:
            value += f" [{filt}]"
        _emit_gpp(settings, scope, "Preferences / Drive Maps", f"Preferences\\Drive Maps\\{letter}", f"Drive {letter}:", value)
    return settings


def _parse_lugs(extension: etree._Element, scope: PolicyScope, warnings: list[str]) -> list[PolicySetting]:
    """Parse the Local Users and Groups GPP extension: local group membership
    changes and local user creation/password resets."""
    settings: list[PolicySetting] = []
    for item, item_attrs, props, props_el in _gpp_items(extension):
        tag = _local_name(item.tag)
        action = _gpp_action(props)
        filt = _gpp_filters_summary(item)

        if tag == "Group":
            name = props.get("groupName") or item_attrs.get("name", "")
            members = []
            for members_el in props_el.findall(f"{{{LUGS_NS}}}Members"):
                for member in members_el.findall(f"{{{LUGS_NS}}}Member"):
                    members.append(f"{member.get('action', '')} {member.get('name', '')}".strip())
            value = f"{action}: {name}"
            if members:
                value += " — " + "; ".join(members)
            if filt:
                value += f" [{filt}]"
            _emit_gpp(settings, scope, "Preferences / Local Users and Groups",
                      f"Preferences\\Local Users and Groups\\{name}", f"Local Group: {name}", value)
        else:  # User
            username = props.get("userName") or item_attrs.get("name", "")
            flags = []
            if props.get("acctDisabled") == "1":
                flags.append("account disabled")
            if props.get("neverExpires") == "1":
                flags.append("password never expires")
            if props.get("noChange") == "1":
                flags.append("user cannot change password")
            value = f"{action}: {username}"
            if flags:
                value += " (" + ", ".join(flags) + ")"
            cpw = props.get("cpassword")
            if cpw:
                value = _flag_cpassword(value, cpw, warnings, scope, f"Local user '{username}'")
            if filt:
                value += f" [{filt}]"
            _emit_gpp(settings, scope, "Preferences / Local Users and Groups",
                      f"Preferences\\Local Users and Groups\\{username}", f"Local User: {username}", value)
    return settings


def _parse_services(extension: etree._Element, scope: PolicyScope, warnings: list[str]) -> list[PolicySetting]:
    settings: list[PolicySetting] = []
    for item, item_attrs, props, _ in _gpp_items(extension):
        service = props.get("serviceName") or item_attrs.get("name", "")
        startup = props.get("startupType", "")
        value = f"Startup: {startup}" if startup else "(no startup type change)"
        account = props.get("accountName")
        if account:
            value += f"; Log on as: {account}"
        cpw = props.get("cpassword")
        if cpw:
            value = _flag_cpassword(value, cpw, warnings, scope, f"Service '{service}'")
        filt = _gpp_filters_summary(item)
        if filt:
            value += f" [{filt}]"
        _emit_gpp(settings, scope, "Preferences / Services", f"Preferences\\Services\\{service}", f"Service: {service}", value)
    return settings


_TASK_DURATION_RE = re.compile(
    r"^P(?:(?P<days>\d+)D)?(?:T(?:(?P<hours>\d+)H)?(?:(?P<minutes>\d+)M)?(?:(?P<seconds>\d+)S)?)?$"
)


def _format_task_duration(value: str) -> str:
    """Best-effort human-readable rendering of an ISO-8601 duration (e.g. PT1H30M)."""
    if not value:
        return ""
    m = _TASK_DURATION_RE.match(value)
    if not m:
        return value
    parts = []
    for unit, label in (("days", "d"), ("hours", "h"), ("minutes", "m"), ("seconds", "s")):
        v = m.group(unit)
        if v and v != "0":
            parts.append(f"{v}{label}")
    return " ".join(parts) if parts else value


_TASK_TRIGGER_LABELS = {
    "TimeTrigger": "Time trigger",
    "CalendarTrigger": "Calendar trigger",
    "LogonTrigger": "At log on",
    "BootTrigger": "At startup",
    "IdleTrigger": "On idle",
    "EventTrigger": "On event",
    "RegistrationTrigger": "At task creation/modification",
    "SessionStateChangeTrigger": "On session state change",
    "WnfStateChangeTrigger": "On WNF state change",
}


def _task_trigger_line(trig: etree._Element) -> str:
    """Summarize one <Triggers> child (Task Scheduler 2.0 XML) into one line."""
    label = _TASK_TRIGGER_LABELS.get(_local_name(trig.tag), _local_name(trig.tag))
    bits: list[str] = []

    enabled = _text(trig.find(f"{{{SCHEDULED_TASKS_NS}}}Enabled"))
    if enabled.lower() == "false":
        bits.append("disabled")
    start = _text(trig.find(f"{{{SCHEDULED_TASKS_NS}}}StartBoundary"))
    if start:
        bits.append(f"start {start}")
    end = _text(trig.find(f"{{{SCHEDULED_TASKS_NS}}}EndBoundary"))
    if end:
        bits.append(f"end {end}")
    delay = _text(trig.find(f"{{{SCHEDULED_TASKS_NS}}}RandomDelay")) or _text(trig.find(f"{{{SCHEDULED_TASKS_NS}}}Delay"))
    if delay:
        bits.append(f"random delay {_format_task_duration(delay)}")

    repetition = trig.find(f"{{{SCHEDULED_TASKS_NS}}}Repetition")
    if repetition is not None:
        interval = _text(repetition.find(f"{{{SCHEDULED_TASKS_NS}}}Interval"))
        if interval:
            rep = f"repeat every {_format_task_duration(interval)}"
            duration = _text(repetition.find(f"{{{SCHEDULED_TASKS_NS}}}Duration"))
            if duration:
                rep += f" for {_format_task_duration(duration)}"
            bits.append(rep)

    subscription = _text(trig.find(f"{{{SCHEDULED_TASKS_NS}}}Subscription"))
    if subscription:
        bits.append(f"event: {subscription}")
    user_id = _text(trig.find(f"{{{SCHEDULED_TASKS_NS}}}UserId"))
    if user_id:
        bits.append(f"user: {user_id}")

    return f"{label} ({'; '.join(bits)})" if bits else label


def _task_action_line(action: etree._Element) -> str:
    """Summarize one <Actions> child (Task Scheduler 2.0 XML) into one line."""
    tag = _local_name(action.tag)
    if tag == "Exec":
        cmd = _text(action.find(f"{{{SCHEDULED_TASKS_NS}}}Command"))
        args = _text(action.find(f"{{{SCHEDULED_TASKS_NS}}}Arguments"))
        working_dir = _text(action.find(f"{{{SCHEDULED_TASKS_NS}}}WorkingDirectory"))
        line = f"Run: {cmd} {args}".strip()
        if working_dir:
            line += f" (in {working_dir})"
        return line
    if tag == "ComHandler":
        class_id = _text(action.find(f"{{{SCHEDULED_TASKS_NS}}}ClassId"))
        return f"COM handler: {class_id}"
    if tag == "SendEmail":
        to = _text(action.find(f"{{{SCHEDULED_TASKS_NS}}}To"))
        subject = _text(action.find(f"{{{SCHEDULED_TASKS_NS}}}Subject"))
        return f"Send email to {to}: {subject}"
    if tag == "ShowMessage":
        title = _text(action.find(f"{{{SCHEDULED_TASKS_NS}}}Title"))
        body = _text(action.find(f"{{{SCHEDULED_TASKS_NS}}}Body"))
        return f"Show message '{title}': {body}"
    return tag


def _parse_scheduled_task_item(
    item: etree._Element,
    item_attrs: dict[str, str],
    props: dict[str, str],
    props_el: etree._Element,
    scope: PolicyScope,
    warnings: list[str],
) -> list[PolicySetting]:
    """Parse one Task/TaskV2/ImmediateTask/ImmediateTaskV2 item from the
    Scheduled Tasks GPP extension. TaskV2/ImmediateTaskV2 embed a full Task
    Scheduler 2.0 XML document under Properties; the legacy (pre-Vista)
    Task/ImmediateTask items instead carry flat GPP-native fields there."""
    settings: list[PolicySetting] = []
    name = item_attrs.get("name") or _local_name(item.tag)
    action = _gpp_action(props)
    run_as = props.get("runAs", "")
    logon_type = props.get("logonType", "")
    key_path = f"Preferences\\Scheduled Tasks\\{name}"

    header = action
    if run_as:
        header += f" — run as {run_as}"
    if logon_type:
        header += f" ({logon_type})"

    cpw = props.get("cpassword")
    if cpw:
        header = _flag_cpassword(header, cpw, warnings, scope, f"Scheduled task '{name}'")

    task_el = props_el.find(f"{{{SCHEDULED_TASKS_NS}}}Task")
    description = ""
    if task_el is not None:
        reg_info = task_el.find(f"{{{SCHEDULED_TASKS_NS}}}RegistrationInfo")
        if reg_info is not None:
            author = _text(reg_info.find(f"{{{SCHEDULED_TASKS_NS}}}Author"))
            description = _text(reg_info.find(f"{{{SCHEDULED_TASKS_NS}}}Description"))
            if author:
                header += f"; author {author}"

    _emit_gpp(settings, scope, "Preferences / Scheduled Tasks", key_path, name, header, explain=description)

    if task_el is not None:
        triggers_el = task_el.find(f"{{{SCHEDULED_TASKS_NS}}}Triggers")
        if triggers_el is not None:
            lines = [_task_trigger_line(t) for t in triggers_el if isinstance(t.tag, str)]
            if lines:
                _emit_gpp(settings, scope, "Preferences / Scheduled Tasks", key_path,
                          f"{name} — Triggers", "; ".join(lines))

        actions_el = task_el.find(f"{{{SCHEDULED_TASKS_NS}}}Actions")
        if actions_el is not None:
            lines = [_task_action_line(a) for a in actions_el if isinstance(a.tag, str)]
            if lines:
                _emit_gpp(settings, scope, "Preferences / Scheduled Tasks", key_path,
                          f"{name} — Actions", "; ".join(lines))
    else:
        # Legacy Task/ImmediateTask: no Task Scheduler XML to walk, just
        # whatever flat fields Properties carries -- flatten them generically.
        for child in props_el:
            if isinstance(child.tag, str):
                _flatten_extension(child, [name, _local_name(child.tag)], scope, SettingType.PREFERENCE, settings)

    filt = _gpp_filters_summary(item)
    if filt:
        _emit_gpp(settings, scope, "Preferences / Scheduled Tasks", key_path, f"{name} — Filters", filt)

    return settings


def _parse_scheduled_tasks(extension: etree._Element, scope: PolicyScope, warnings: list[str]) -> list[PolicySetting]:
    settings: list[PolicySetting] = []
    for item, item_attrs, props, props_el in _gpp_items(extension):
        settings.extend(_parse_scheduled_task_item(item, item_attrs, props, props_el, scope, warnings))
    return settings


# ── Generic flattener for extension types without a bespoke parser ────────────
#
# Several GPO report extensions (network profiles, certificates, firewall,
# Group Policy Preferences items, ...) each define their own deeply-nested XML
# schema. Rather than hand-writing a parser per schema, walk the tree generically
# and turn every leaf value (element text, or an attribute on a leaf/GPP-style
# element) into a PolicySetting, using a few pattern special-cases so the
# result reads naturally instead of as a raw XML dump.

_NOISE_ATTRS = {"clsid", "uid", "changed", "image", "nil", "hidden", "not", "bool"}
_NAME_HINT_ATTRS = ("name", "Name", "networkName", "SSID", "id")


def _local_name(tag: str) -> str:
    if not isinstance(tag, str):
        return ""
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def _attrs_local(el: etree._Element) -> dict[str, str]:
    return {
        _local_name(k): v
        for k, v in el.attrib.items()
        if _local_name(k) not in _NOISE_ATTRS and v
    }


def _is_binary_blob(text: str) -> bool:
    """Heuristic: long hex-only strings are certificate/binary blobs, not human data."""
    if len(text) < 120:
        return False
    sample = text[:300].replace(" ", "").replace("\n", "")
    return bool(re.fullmatch(r"[0-9a-fA-F]+", sample))


def _member_label(el: etree._Element, tag_name: str, idx: int) -> str:
    """Best-effort distinguishing label for one of several same-tag siblings."""
    attrs = _attrs_local(el)
    for key in _NAME_HINT_ATTRS:
        if attrs.get(key):
            return f"{tag_name}({attrs[key]})"
    for child in el:
        if isinstance(child.tag, str) and _local_name(child.tag).lower() == "name" and not list(child):
            text = (child.text or "").strip()
            if text:
                return f"{tag_name}({text})"
    return f"{tag_name}[{idx}]"


def _format_field_value(text: str) -> str:
    text = (text or "").strip()
    if _is_binary_blob(text):
        return f"<binary data, {len(text) // 2} bytes>"
    return text


def _flatten_extension(
    el: etree._Element,
    path: list[str],
    scope: PolicyScope,
    setting_type: SettingType,
    out: list[PolicySetting],
) -> None:
    def emit(key_path: str, value_name: str, value_text: str) -> None:
        value_text = _format_field_value(value_text)
        if not value_text:
            return
        out.append(PolicySetting(
            key_path=key_path or value_name,
            value_name=value_name,
            display_name=value_name,
            value=value_text,
            value_display=value_text,
            setting_type=setting_type,
            scope=scope,
            state=SettingState.ENABLED,
        ))

    children = [c for c in el if isinstance(c.tag, str)]
    attrs = _attrs_local(el)

    if not children:
        # Leaf element: its text, or (Group Policy Preferences style) its attributes.
        text = (el.text or "").strip()
        text_emitted = False
        if text:
            emit("\\".join(path[:-1]), path[-1] if path else _local_name(el.tag), text)
            text_emitted = True

        lower_attrs = {k.lower(): v for k, v in attrs.items()}
        if "key" in lower_attrs and "value" in lower_attrs:
            # GPP registry-preference item, e.g. <Reg hive="..." key="..." name="..." value="..." />
            hive = lower_attrs.get("hive", "")
            key = lower_attrs.get("key", "")
            reg_path = f"{hive}\\{key}" if hive else key
            emit(reg_path, lower_attrs.get("name") or _local_name(el.tag), lower_attrs.get("value", ""))
        elif attrs:
            # Several attributes on one element describe one object (e.g. a GPP
            # preference item's Properties) -> one row, not one row per attribute.
            combined = "; ".join(f"{k}: {_format_field_value(v)}" for k, v in attrs.items())
            base_label = path[-1] if path else _local_name(el.tag)
            label = f"{base_label} (attributes)" if text_emitted else base_label
            emit("\\".join(path[:-1]), label, combined)
        return

    # <Name>x</Name><Value>y</Value> pair -> a single "x = y" row.
    child_by_lower = {_local_name(c.tag).lower(): c for c in children}
    if len(children) == 2 and "name" in child_by_lower and "value" in child_by_lower:
        name_el, value_el = child_by_lower["name"], child_by_lower["value"]
        if not list(name_el) and not list(value_el):
            emit("\\".join(path), (name_el.text or "").strip() or _local_name(el.tag), (value_el.text or "").strip())
            return

    # <Setting><Value>x</Value></Setting> wrapper -> collapse into the parent's row.
    if len(children) == 1 and _local_name(children[0].tag).lower() == "value" and not list(children[0]):
        emit("\\".join(path[:-1]), path[-1] if path else _local_name(el.tag), (children[0].text or "").strip())
        return

    # A record of differently-named leaf fields (e.g. one certificate's IssuedTo/
    # IssuedBy/ExpirationDate/Data) describes one object -> one row, not one per
    # field. A homogeneous repeated list (all children share one tag) is handled
    # below instead, joined as a list rather than a "field: value" record.
    if all(not list(c) for c in children) and len({_local_name(c.tag) for c in children}) > 1:
        fields = [
            f"{_local_name(c.tag)}: {_format_field_value(c.text or '')}"
            for c in children
            if _format_field_value(c.text or "")
        ]
        if fields:
            emit("\\".join(path[:-1]), path[-1] if path else _local_name(el.tag), "; ".join(fields))
            return

    # Group same-tag siblings: simple repeated leaves collapse to one comma-joined
    # row (mirrors how ListBox/MULTI_SZ values are already displayed elsewhere);
    # structured repeats (e.g. multiple certificates/profiles) recurse individually.
    groups: dict[str, list[etree._Element]] = {}
    for c in children:
        groups.setdefault(_local_name(c.tag), []).append(c)

    for tag_name, members in groups.items():
        if len(members) >= 2 and all(not list(m) for m in members):
            texts = [t for t in ((m.text or "").strip() for m in members) if t]
            if texts:
                emit("\\".join(path), tag_name, ", ".join(texts))
            continue
        for idx, m in enumerate(members, start=1):
            label = tag_name if len(members) == 1 else _member_label(m, tag_name, idx)
            _flatten_extension(m, path + [label], scope, setting_type, out)


def _parse_generic_extension(
    extension: etree._Element, scope: PolicyScope, setting_type: SettingType
) -> list[PolicySetting]:
    settings: list[PolicySetting] = []
    _flatten_extension(extension, [], scope, setting_type, settings)
    return settings


# xsi:type substring -> SettingType, for extensions without a bespoke parser.
GENERIC_EXTENSION_TYPES: list[tuple[str, SettingType]] = [
    ("WLanSvcSettings", SettingType.NETWORK),
    ("Dot3SvcSettings", SettingType.NETWORK),
    ("WindowsFirewallSettings", SettingType.FIREWALL),
    ("PublicKeySettings", SettingType.CERTIFICATE),
    ("InternetExplorerSettings", SettingType.INTERNET_EXPLORER),
    ("SoftwareRestrictionSettings", SettingType.SOFTWARE_RESTRICTION),
    ("SoftwareInstallationSettings", SettingType.SOFTWARE_INSTALLATION),
    ("NrptSettings", SettingType.DNS_POLICY),
    ("RemoteInstallationSettings", SettingType.REMOTE_INSTALLATION),
    ("InternetSettings", SettingType.PREFERENCE),
    ("PowerOptionsSettings", SettingType.PREFERENCE),
]


def parse_gpreport(folder_path: str) -> tuple[GPOInfo | None, list[PolicySetting], list[str]]:
    """Parse gpreport.xml and return (GPOInfo, list of settings, warnings)."""
    try:
        safe_folder = safe_resolve_dir(folder_path)
    except ValueError:
        return None, [], [f"Invalid folder path: {folder_path!r}"]
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
            ext_name_el = ext_data.find("g:Name", ns_map)
            ext_name = _text(ext_name_el) if ext_name_el is not None else ""

            xsi_prefix = xsi_type.split(":", 1)[0] if ":" in xsi_type else ""
            xsi_ns = ext_el.nsmap.get(xsi_prefix, "") if xsi_prefix else ""

            try:
                if "RegistrySettings" in xsi_type or ext_el.find(f"{{{REGISTRY_NS}}}Policy") is not None:
                    settings.extend(_parse_registry_policies(ext_el, scope))
                elif "SecuritySettings" in xsi_type or ext_el.find(f"{{{SECURITY_NS}}}SecurityOptions") is not None:
                    settings.extend(_parse_security_settings(ext_el, scope))
                elif "AuditSettings" in xsi_type or xsi_ns == AUDIT_NS:
                    settings.extend(_parse_audit_settings(ext_el, scope))
                elif xsi_ns == SRPV2_NS:
                    settings.extend(_parse_applocker(ext_el, scope))
                elif xsi_ns == SCRIPTS_NS:
                    settings.extend(_parse_scripts(ext_el, scope))
                elif xsi_ns == SHORTCUTS_NS:
                    settings.extend(_parse_shortcuts(ext_el, scope))
                elif xsi_ns == FILES_NS:
                    settings.extend(_parse_files(ext_el, scope))
                elif xsi_ns == FOLDERS_NS:
                    settings.extend(_parse_folders(ext_el, scope))
                elif xsi_ns == FOLDER_OPTIONS_NS:
                    settings.extend(_parse_folder_options(ext_el, scope))
                elif xsi_ns == LUGS_NS:
                    settings.extend(_parse_lugs(ext_el, scope, warnings))
                elif xsi_ns == ENVIRONMENT_NS:
                    settings.extend(_parse_environment_vars(ext_el, scope))
                elif xsi_ns == DRIVE_MAPS_NS:
                    settings.extend(_parse_drive_maps(ext_el, scope, warnings))
                elif xsi_ns == SERVICES_NS:
                    settings.extend(_parse_services(ext_el, scope, warnings))
                elif xsi_ns == SCHEDULED_TASKS_NS:
                    settings.extend(_parse_scheduled_tasks(ext_el, scope, warnings))
                else:
                    for type_substr, mapped_type in GENERIC_EXTENSION_TYPES:
                        if type_substr in xsi_type:
                            settings.extend(_parse_generic_extension(ext_el, scope, mapped_type))
                            break
                    else:
                        # No parser recognizes this extension type at all — surface it
                        # rather than silently showing fewer settings than the GPO has.
                        raw_size = len(etree.tostring(ext_el))
                        label = ext_name or xsi_type or "unknown extension"
                        warnings.append(
                            f"No parser for '{label}' extension ({xsi_type or 'no xsi:type'}) "
                            f"in {scope.value} — {raw_size} bytes of settings not shown."
                        )
            except Exception as e:
                warnings.append(f"Error parsing extension ({xsi_type}) in {scope.value}: {e}")

            # Tag settings from this extension with the extension name if no category set
            if ext_name:
                for s in settings:
                    if not s.category:
                        s.category = ext_name

    info.setting_count = len(settings)
    return info, settings, warnings
