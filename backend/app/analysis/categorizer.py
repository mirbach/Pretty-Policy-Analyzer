"""Categorize policy settings by registry path patterns."""

from __future__ import annotations

import re

# Pattern -> category mapping. Order matters: first match wins.
_CATEGORY_RULES: list[tuple[re.Pattern, str]] = [
    # Browser policies
    (re.compile(r"Software\\Policies\\Google\\Chrome", re.I), "Browser / Chrome"),
    (re.compile(r"Software\\Policies\\Google\\Update", re.I), "Browser / Chrome Update"),
    (re.compile(r"Software\\Policies\\Microsoft\\Edge", re.I), "Browser / Edge"),
    (re.compile(r"Software\\Policies\\Microsoft\\Internet Explorer", re.I), "Browser / Internet Explorer"),
    (re.compile(r"Software\\Microsoft\\Internet Explorer", re.I), "Browser / Internet Explorer"),

    # Microsoft Office
    (re.compile(r"Software\\Policies\\Microsoft\\Office.*Outlook", re.I), "Office / Outlook"),
    (re.compile(r"Software\\Policies\\Microsoft\\Office", re.I), "Office"),
    (re.compile(r"Software\\Microsoft\\Office", re.I), "Office"),

    # OneDrive
    (re.compile(r"Software\\Policies\\Microsoft\\OneDrive", re.I), "OneDrive"),
    (re.compile(r"Software\\Microsoft\\OneDrive", re.I), "OneDrive"),

    # Windows Update
    (re.compile(r"Software\\Policies\\Microsoft\\Windows\\WindowsUpdate", re.I), "Windows Update"),

    # MDM / Intune
    (re.compile(r"Software\\Policies\\Microsoft\\Windows\\CurrentVersion\\MDM", re.I), "MDM / Intune"),

    # Security / Defender
    (re.compile(r"Software\\Policies\\Microsoft\\Windows Defender", re.I), "Security / Defender"),
    (re.compile(r"Software\\Microsoft\\Windows Defender", re.I), "Security / Defender"),
    (re.compile(r"MACHINE\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System", re.I), "Security / UAC"),

    # Remote Desktop
    (re.compile(r"Software\\Policies\\Microsoft\\Windows NT\\Terminal Services", re.I), "Remote Desktop"),
    (re.compile(r"Terminal Services", re.I), "Remote Desktop"),

    # Network
    (re.compile(r"Software\\Policies\\Microsoft\\Windows\\NetworkConnectivityStatusIndicator", re.I), "Network"),
    (re.compile(r"Software\\Policies\\Microsoft\\Windows\\Network Connections", re.I), "Network"),
    (re.compile(r"Software\\Policies\\Microsoft\\Windows\\WcmSvc", re.I), "Network / Wireless"),

    # Power management
    (re.compile(r"Software\\Policies\\Microsoft\\Power", re.I), "Power Management"),

    # BitLocker
    (re.compile(r"Software\\Policies\\Microsoft\\FVE", re.I), "Security / BitLocker"),

    # AppLocker
    (re.compile(r"Software\\Policies\\Microsoft\\Windows\\SrpV2", re.I), "Security / AppLocker"),

    # Firewall
    (re.compile(r"Software\\Policies\\Microsoft\\WindowsFirewall", re.I), "Security / Firewall"),

    # Windows features
    (re.compile(r"Software\\Policies\\Microsoft\\Windows\\Explorer", re.I), "Windows / Explorer"),
    (re.compile(r"Software\\Policies\\Microsoft\\Windows\\System", re.I), "Windows / System"),
    (re.compile(r"Software\\Policies\\Microsoft\\Windows\\Personalization", re.I), "Windows / Personalization"),
    (re.compile(r"Software\\Microsoft\\Windows\\CurrentVersion\\Policies", re.I), "Windows / Policies"),
    (re.compile(r"Software\\Policies\\Microsoft\\Windows", re.I), "Windows"),
    (re.compile(r"Software\\Policies\\Microsoft", re.I), "Microsoft Policies"),

    # Security template sections
    (re.compile(r"^System Access\\", re.I), "Security / Account Policy"),
    (re.compile(r"^Event Audit\\", re.I), "Security / Audit Policy"),
    (re.compile(r"^Privilege Rights\\", re.I), "Security / User Rights"),
    (re.compile(r"^Kerberos Policy\\", re.I), "Security / Kerberos"),
    (re.compile(r"^Account Policy\\", re.I), "Security / Account Policy"),
    (re.compile(r"^Security Options", re.I), "Security / Options"),
]


def categorize_setting(key_path: str, existing_category: str = "") -> str:
    """Return a human-readable category for a policy setting."""
    if existing_category:
        return existing_category

    for pattern, category in _CATEGORY_RULES:
        if pattern.search(key_path):
            return category

    return "Other"


def categorize_settings(settings: list) -> None:
    """Mutate a list of PolicySetting objects to fill in missing categories."""
    for s in settings:
        if not s.category:
            s.category = categorize_setting(s.key_path)
