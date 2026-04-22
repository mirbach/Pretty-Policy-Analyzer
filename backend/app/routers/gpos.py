"""GPO listing and detail endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from typing import Optional

from ..models import GPODetail, GPOInfo, PolicyScope, ScanStatus, SettingType
from ..store import get_store

router = APIRouter(prefix="/api/gpos", tags=["gpos"])


@router.get("", response_model=list[GPOInfo])
def list_gpos(
    search: Optional[str] = Query(None, description="Search GPO names"),
):
    store = get_store()
    gpos = store.get_all_gpos()
    if search:
        q = search.lower()
        gpos = [g for g in gpos if q in g.info.display_name.lower()]
    return [g.info for g in gpos]


@router.get("/{gpo_id}", response_model=GPODetail)
def get_gpo(gpo_id: str):
    store = get_store()
    gpo = store.get_gpo(gpo_id)
    if gpo is None:
        raise HTTPException(status_code=404, detail=f"GPO '{gpo_id}' not found")
    return gpo


@router.delete("/{gpo_id}", response_model=ScanStatus)
def delete_gpo(gpo_id: str):
    store = get_store()
    if store.get_gpo(gpo_id) is None:
        raise HTTPException(status_code=404, detail=f"GPO '{gpo_id}' not found")
    return store.delete_gpo(gpo_id)


@router.get("/{gpo_id}/settings")
def get_gpo_settings(
    gpo_id: str,
    scope: Optional[PolicyScope] = Query(None),
    setting_type: Optional[SettingType] = Query(None),
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
):
    store = get_store()
    gpo = store.get_gpo(gpo_id)
    if gpo is None:
        raise HTTPException(status_code=404, detail=f"GPO '{gpo_id}' not found")

    settings = gpo.settings

    if scope:
        settings = [s for s in settings if s.scope == scope]
    if setting_type:
        settings = [s for s in settings if s.setting_type == setting_type]
    if category:
        cat_lower = category.lower()
        settings = [s for s in settings if cat_lower in s.category.lower()]
    if search:
        q = search.lower()
        settings = [
            s for s in settings
            if q in s.display_name.lower()
            or q in s.key_path.lower()
            or q in s.value_name.lower()
            or q in str(s.value).lower()
        ]

    return settings


@router.get("/search/all")
def search_all_settings(
    q: str = Query(..., description="Search query"),
):
    """Search across all GPOs for matching settings."""
    store = get_store()
    query = q.lower()
    results = []
    for gpo in store.get_all_gpos():
        for s in gpo.settings:
            if (
                query in s.display_name.lower()
                or query in s.key_path.lower()
                or query in s.value_name.lower()
                or query in str(s.value).lower()
            ):
                results.append({
                    "gpo_id": gpo.info.id,
                    "gpo_name": gpo.info.display_name,
                    "setting": s,
                })
    return results
