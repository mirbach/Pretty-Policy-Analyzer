"""Security Baseline compliance checker."""

from __future__ import annotations

from ..models import (
    BaselineComplianceReport,
    BaselineViolation,
    BaselineViolationStatus,
    GPODetail,
    GPOFinding,
)


def check_compliance(baseline: GPODetail, gpos: list[GPODetail]) -> BaselineComplianceReport:
    """Compare every setting in *baseline* against all *gpos* and produce a report."""

    # Build lookup: normalized_path -> list[(gpo_id, gpo_name, setting)]
    uploaded: dict[str, list[tuple[str, str, object]]] = {}
    for gpo in gpos:
        for s in gpo.settings:
            norm = s.normalized_path
            uploaded.setdefault(norm, []).append((gpo.info.id, gpo.info.display_name, s))

    violations: list[BaselineViolation] = []
    compliant: list[BaselineViolation] = []

    for bs in baseline.settings:
        norm = bs.normalized_path
        findings_raw = uploaded.get(norm, [])

        gpo_findings: list[GPOFinding] = []
        any_match = False

        for gpo_id, gpo_name, s in findings_raw:
            matches = _values_match(bs, s)
            if matches:
                any_match = True
            gpo_findings.append(GPOFinding(
                gpo_id=gpo_id,
                gpo_name=gpo_name,
                value=s.value,
                value_display=s.value_display,
                state=s.state.value,
                matches=matches,
            ))

        if not findings_raw:
            status = BaselineViolationStatus.MISSING
        elif any_match:
            status = BaselineViolationStatus.COMPLIANT
        else:
            status = BaselineViolationStatus.WRONG_VALUE

        entry = BaselineViolation(
            key_path=bs.key_path,
            value_name=bs.value_name,
            display_name=bs.display_name or bs.value_name or bs.key_path,
            category=bs.category,
            scope=bs.scope.value,
            expected_value=bs.value,
            expected_value_display=bs.value_display,
            expected_state=bs.state.value,
            setting_type=bs.setting_type.value,
            status=status,
            gpo_findings=gpo_findings,
        )

        if status == BaselineViolationStatus.COMPLIANT:
            compliant.append(entry)
        else:
            violations.append(entry)

    # Sort: missing first, then wrong_value; within each group by category then name
    violations.sort(
        key=lambda v: (
            0 if v.status == BaselineViolationStatus.MISSING else 1,
            v.category.lower(),
            v.display_name.lower(),
        )
    )
    compliant.sort(key=lambda v: (v.category.lower(), v.display_name.lower()))

    return BaselineComplianceReport(
        baseline_id=baseline.info.id,
        baseline_name=baseline.info.display_name,
        total_baseline_settings=len(baseline.settings),
        compliant_count=len(compliant),
        wrong_value_count=sum(1 for v in violations if v.status == BaselineViolationStatus.WRONG_VALUE),
        missing_count=sum(1 for v in violations if v.status == BaselineViolationStatus.MISSING),
        violations=violations,
        compliant=compliant,
    )


def _values_match(baseline_setting, uploaded_setting) -> bool:
    """True if uploaded setting satisfies the baseline requirement."""
    if baseline_setting.state != uploaded_setting.state:
        return False
    return _values_equal(baseline_setting.value, uploaded_setting.value)


def _values_equal(a: object, b: object) -> bool:
    if a is None and b is None:
        return True
    if a is None or b is None:
        return False
    if isinstance(a, str) and isinstance(b, str):
        return a.strip().lower() == b.strip().lower()
    try:
        return int(a) == int(b)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        pass
    return str(a) == str(b)
