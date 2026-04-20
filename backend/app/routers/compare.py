"""GPO comparison endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..analysis.differ import compare_gpos
from ..models import CompareRequest, ComparisonResult
from ..store import get_store

router = APIRouter(prefix="/api/compare", tags=["compare"])


@router.post("", response_model=ComparisonResult)
def compare(request: CompareRequest):
    store = get_store()
    gpos = []
    for gpo_id in request.gpo_ids:
        gpo = store.get_gpo(gpo_id)
        if gpo is None:
            raise HTTPException(status_code=404, detail=f"GPO '{gpo_id}' not found")
        gpos.append(gpo)
    return compare_gpos(gpos)
