"""Diff engine: compare settings across 2+ GPOs."""

from __future__ import annotations

from ..models import (
    ComparisonResult,
    DiffEntry,
    GPODetail,
    PolicyScope,
)


def compare_gpos(gpos: list[GPODetail]) -> ComparisonResult:
    """Compare 2+ GPOs and produce a detailed diff."""
    gpo_ids = [g.info.id for g in gpos]
    gpo_names = {g.info.id: g.info.display_name for g in gpos}

    # Build maps: normalized_path -> {gpo_id: setting}
    all_keys: dict[str, dict[str, object]] = {}  # norm_path -> {gpo_id: PolicySetting}

    for gpo in gpos:
        for s in gpo.settings:
            norm = s.normalized_path
            if norm not in all_keys:
                all_keys[norm] = {}
            all_keys[norm][gpo.info.id] = s

    differences: list[DiffEntry] = []
    identical: list[DiffEntry] = []

    for norm_path, gpo_map in sorted(all_keys.items()):
        # Pick a representative setting for metadata
        rep = next(iter(gpo_map.values()))

        values: dict[str, object] = {}
        states: dict[str, str] = {}
        for gid, setting in gpo_map.items():
            values[gid] = setting.value
            states[gid] = setting.state.value

        # Determine diff type
        present_count = len(gpo_map)

        if present_count == 1:
            # Only in a single GPO — no overlap at all
            diff_type = "only_in_one"
        else:
            # Appears in 2+ GPOs — check if values match
            value_list = list(values.values())
            all_same = all(_values_equal(value_list[0], v) for v in value_list[1:])
            state_list = list(states.values())
            states_same = len(set(state_list)) == 1

            if all_same and states_same:
                diff_type = "identical"
            else:
                diff_type = "different_values"

        entry = DiffEntry(
            key_path=rep.key_path,
            value_name=rep.value_name,
            display_name=rep.display_name,
            category=rep.category,
            scope=rep.scope,
            setting_type=rep.setting_type,
            values=values,
            states=states,
            diff_type=diff_type,
        )

        if diff_type == "identical":
            identical.append(entry)
        else:
            differences.append(entry)

    return ComparisonResult(
        gpo_ids=gpo_ids,
        gpo_names=gpo_names,
        differences=differences,
        identical=identical,
        total_unique_settings=len(all_keys),
        diff_count=len(differences),
        identical_count=len(identical),
    )


def _values_equal(a: object, b: object) -> bool:
    """Compare two setting values, handling type differences gracefully."""
    if a == b:
        return True
    # Compare string representations as fallback
    return str(a) == str(b)
