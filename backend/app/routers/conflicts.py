"""Conflict detection endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Query
from typing import Optional

from ..analysis.conflict import detect_conflicts
from ..models import ConflictResult
from ..store import get_store

router = APIRouter(prefix="/api/conflicts", tags=["conflicts"])


@router.get("", response_model=ConflictResult)
def get_conflicts(
    category: Optional[str] = Query(None, description="Filter by category"),
    severity: Optional[str] = Query(None, description="Filter by severity"),
):
    store = get_store()
    result = detect_conflicts(store.get_all_gpos())

    if category:
        cat_lower = category.lower()
        result.conflicts = [c for c in result.conflicts if cat_lower in c.category.lower()]
        result.total_conflicts = len(result.conflicts)

    if severity:
        sev_lower = severity.lower()
        result.conflicts = [c for c in result.conflicts if c.severity.value.lower() == sev_lower]
        result.total_conflicts = len(result.conflicts)

    return result
