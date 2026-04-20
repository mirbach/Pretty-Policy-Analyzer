"""Security Baseline endpoints."""

from __future__ import annotations

import base64
from pathlib import Path

from fastapi import APIRouter, HTTPException

from ..analysis.baseline_checker import check_compliance
from ..models import BaselineComplianceReport, BaselineStatus, GPOInfo, ScanRequest, UploadedFileItem
from ..store import get_store

router = APIRouter(prefix="/api/baselines", tags=["baselines"])


@router.get("", response_model=list[GPOInfo])
def list_baselines():
    return [b.info for b in get_store().list_baselines()]


@router.post("/scan", response_model=BaselineStatus)
def scan_baselines(request: ScanRequest):
    if not request.folder_path:
        raise HTTPException(status_code=400, detail="folder_path required")
    return get_store().scan_baselines(request.folder_path)


@router.post("/upload", response_model=BaselineStatus)
async def upload_baseline(files: list[UploadedFileItem]):
    """Upload Security Baseline GPO backup files from browser (additive)."""
    baseline_dir = Path.home() / ".gpoanalyzer" / "baselines_cache"
    baseline_dir.mkdir(parents=True, exist_ok=True)

    for f in files:
        parts = Path(f.relative_path.replace("\\", "/")).parts
        if any(p in ("..", ".") for p in parts) or Path(f.relative_path).is_absolute():
            continue
        file_path = baseline_dir.joinpath(*parts)
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_bytes(base64.b64decode(f.content_b64))

    return get_store().scan_baselines(str(baseline_dir))


@router.delete("", response_model=BaselineStatus)
def clear_baselines():
    return get_store().clear_baselines()


@router.get("/{baseline_id}/compliance", response_model=BaselineComplianceReport)
def get_compliance(baseline_id: str):
    store = get_store()
    baseline = store.get_baseline(baseline_id)
    if baseline is None:
        raise HTTPException(status_code=404, detail=f"Baseline '{baseline_id}' not found")
    gpos = store.get_all_gpos()
    if not gpos:
        raise HTTPException(status_code=400, detail="No GPOs loaded to compare against baseline")
    return check_compliance(baseline, gpos)
