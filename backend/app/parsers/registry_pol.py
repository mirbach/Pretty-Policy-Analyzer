"""Parse binary registry.pol files (PReg format)."""

from __future__ import annotations

import os
import struct
from typing import Any

from ..models import PolicyScope, PolicySetting, SettingState, SettingType
from ._path_utils import safe_resolve_file

# Registry value types
REG_NONE = 0
REG_SZ = 1
REG_EXPAND_SZ = 2
REG_BINARY = 3
REG_DWORD = 4
REG_DWORD_BIG_ENDIAN = 5
REG_MULTI_SZ = 7
REG_QWORD = 11

# PReg header: "PReg" + version (DWORD = 1)
PREG_HEADER = b"PReg"
PREG_VERSION = 1

# Entry delimiters
ENTRY_START = "["
ENTRY_END = "]"
FIELD_SEP = ";"


def _decode_utf16(data: bytes) -> str:
    """Decode UTF-16LE string, stripping null terminators."""
    try:
        text = data.decode("utf-16-le")
    except UnicodeDecodeError:
        return repr(data)
    return text.rstrip("\x00")


def _decode_value(reg_type: int, data: bytes) -> Any:
    """Decode a registry value based on its type."""
    if reg_type == REG_SZ or reg_type == REG_EXPAND_SZ:
        return _decode_utf16(data)
    elif reg_type == REG_DWORD:
        if len(data) >= 4:
            return struct.unpack("<I", data[:4])[0]
        return 0
    elif reg_type == REG_DWORD_BIG_ENDIAN:
        if len(data) >= 4:
            return struct.unpack(">I", data[:4])[0]
        return 0
    elif reg_type == REG_QWORD:
        if len(data) >= 8:
            return struct.unpack("<Q", data[:8])[0]
        return 0
    elif reg_type == REG_MULTI_SZ:
        text = _decode_utf16(data)
        return [s for s in text.split("\x00") if s]
    elif reg_type == REG_BINARY:
        return data.hex()
    elif reg_type == REG_NONE:
        return None
    else:
        return data.hex()


def parse_registry_pol(file_path: str, scope: PolicyScope) -> tuple[list[PolicySetting], list[str]]:
    """Parse a registry.pol file and return list of settings + warnings."""
    file_path = safe_resolve_file(file_path)
    if not os.path.isfile(file_path):  # lgtm[py/path-injection]
        return [], []

    warnings: list[str] = []

    with open(file_path, "rb") as f:  # lgtm[py/path-injection]
        data = f.read()

    if len(data) < 8:
        return [], [f"registry.pol too small ({len(data)} bytes)"]

    # Validate header
    header = data[:4]
    if header != PREG_HEADER:
        return [], [f"Invalid registry.pol header: {header!r}"]

    version = struct.unpack("<I", data[4:8])[0]
    if version != PREG_VERSION:
        warnings.append(f"Unexpected registry.pol version: {version}")

    settings: list[PolicySetting] = []
    pos = 8

    while pos < len(data):
        # Find entry start: [ as UTF-16LE = 0x5B 0x00
        if pos + 1 >= len(data):
            break
        if data[pos] != 0x5B or data[pos + 1] != 0x00:
            pos += 2
            continue
        pos += 2  # skip [

        # Read key name (null-terminated UTF-16LE)
        key_start = pos
        while pos + 1 < len(data):
            if data[pos] == 0x00 and data[pos + 1] == 0x00:
                break
            pos += 2
        key_name = data[key_start:pos].decode("utf-16-le", errors="replace")
        pos += 2  # skip null terminator

        # Expect ; separator
        if pos + 1 < len(data) and data[pos] == 0x3B and data[pos + 1] == 0x00:
            pos += 2
        else:
            continue

        # Read value name (null-terminated UTF-16LE)
        val_name_start = pos
        while pos + 1 < len(data):
            if data[pos] == 0x00 and data[pos + 1] == 0x00:
                break
            pos += 2
        value_name = data[val_name_start:pos].decode("utf-16-le", errors="replace")
        pos += 2  # skip null terminator

        # Expect ; separator
        if pos + 1 < len(data) and data[pos] == 0x3B and data[pos + 1] == 0x00:
            pos += 2
        else:
            continue

        # Read type (DWORD, 4 bytes)
        if pos + 4 > len(data):
            break
        reg_type = struct.unpack("<I", data[pos:pos + 4])[0]
        pos += 4

        # Expect ; separator
        if pos + 1 < len(data) and data[pos] == 0x3B and data[pos + 1] == 0x00:
            pos += 2
        else:
            continue

        # Read size (DWORD, 4 bytes)
        if pos + 4 > len(data):
            break
        size = struct.unpack("<I", data[pos:pos + 4])[0]
        pos += 4

        # Expect ; separator
        if pos + 1 < len(data) and data[pos] == 0x3B and data[pos + 1] == 0x00:
            pos += 2
        else:
            continue

        # Read data
        if pos + size > len(data):
            warnings.append(f"Truncated value data for {key_name}\\{value_name}")
            break
        value_data = data[pos:pos + size]
        pos += size

        # Expect ] closing
        if pos + 1 < len(data) and data[pos] == 0x5D and data[pos + 1] == 0x00:
            pos += 2

        # Decode value
        decoded = _decode_value(reg_type, value_data)

        # Determine state based on special delete markers
        state = SettingState.ENABLED
        if value_name.startswith("**del."):
            value_name = value_name[6:]
            state = SettingState.DISABLED
        elif value_name == "**DeleteValues":
            state = SettingState.DISABLED
        elif value_name.startswith("**delvals"):
            state = SettingState.DISABLED

        display_val = str(decoded) if decoded is not None else ""

        settings.append(PolicySetting(
            key_path=key_name,
            value_name=value_name,
            display_name=value_name or key_name.rsplit("\\", 1)[-1],
            value=decoded,
            value_display=display_val,
            setting_type=SettingType.REGISTRY,
            scope=scope,
            state=state,
            raw_type=reg_type,
        ))

    return settings, warnings
