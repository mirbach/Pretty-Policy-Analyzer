"""Parse gpreport.xml for structured policy settings."""

from __future__ import annotations

import os
import re
from typing import Optional

from lxml import etree

from ..models import GPOInfo, PolicyScope, PolicySetting, SettingState, SettingType
from ._path_utils import safe_resolve_dir

GPO_NS = "http://www.microsoft.com/GroupPolicy/Settings"
TYPES_NS = "http://www.microsoft.com/GroupPolicy/Types"
REGISTRY_NS = "http://www.microsoft.com/GroupPolicy/Settings/Registry"
SECURITY_NS = "http://www.microsoft.com/GroupPolicy/Settings/Security"
AUDIT_NS = "http://www.microsoft.com/GroupPolicy/Settings/Auditing"
SRPV2_NS = "http://www.microsoft.com/GroupPolicy/Settings/SRPV2"  # AppLocker

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
