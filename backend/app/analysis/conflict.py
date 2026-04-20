"""Detect conflicting settings across all GPOs."""

from __future__ import annotations

from collections import defaultdict

from ..models import (
    ConflictEntry,
    ConflictResult,
    ConflictSeverity,
    GPODetail,
)


def detect_conflicts(gpos: list[GPODetail]) -> ConflictResult:
    """Scan all GPOs for settings targeting the same path with different values."""
    # Build map: normalized_path -> [(gpo_id, gpo_name, setting)]
    path_map: dict[str, list[tuple[str, str, object]]] = defaultdict(list)

    for gpo in gpos:
        for s in gpo.settings:
            norm = s.normalized_path
            path_map[norm].append((gpo.info.id, gpo.info.display_name, s))

    conflicts: list[ConflictEntry] = []

    for norm_path, entries in sorted(path_map.items()):
        if len(entries) < 2:
            continue

        # Check if values differ
        values_set: set[str] = set()
        for _, _, setting in entries:
            values_set.add(str(setting.value))

        if len(values_set) <= 1:
            # Same value across all GPOs — not a conflict
            continue

        # We have a conflict
        rep = entries[0][2]  # representative setting

        involved = []
        for gpo_id, gpo_name, setting in entries:
            involved.append({
                "gpo_id": gpo_id,
                "gpo_name": gpo_name,
                "value": setting.value,
                "value_display": setting.value_display,
                "state": setting.state.value,
            })

        # Determine severity
        severity = _assess_severity(entries)

        conflicts.append(ConflictEntry(
            key_path=rep.key_path,
            value_name=rep.value_name,
            display_name=rep.display_name or rep.key_path,
            category=rep.category,
            scope=rep.scope,
            setting_type=rep.setting_type,
            severity=severity,
            involved_gpos=involved,
        ))

    # Aggregate stats
    by_category: dict[str, int] = defaultdict(int)
    by_severity: dict[str, int] = defaultdict(int)
    for c in conflicts:
        by_category[c.category or "Other"] += 1
        by_severity[c.severity.value] += 1

    return ConflictResult(
        total_conflicts=len(conflicts),
        conflicts=conflicts,
        by_category=dict(by_category),
        by_severity=dict(by_severity),
    )


def _assess_severity(entries: list[tuple[str, str, object]]) -> ConflictSeverity:
    """Assess conflict severity based on setting characteristics."""
    states = {e[2].state.value for e in entries}
    values = {str(e[2].value) for e in entries}

    # Enabled vs Disabled on the same setting = HIGH
    if "Enabled" in states and "Disabled" in states:
        return ConflictSeverity.HIGH

    # Direct value contradiction (e.g., 0 vs 1 for the same DWORD)
    if len(values) >= 2:
        # Check if it's a security-related setting
        key = entries[0][2].key_path.lower()
        if any(word in key for word in ("security", "firewall", "defender", "audit", "privilege")):
            return ConflictSeverity.HIGH
        return ConflictSeverity.MEDIUM

    return ConflictSeverity.LOW
