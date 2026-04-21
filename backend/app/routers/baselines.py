"""Security Baseline endpoints."""

from __future__ import annotations

import base64
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException

from ..analysis.baseline_checker import check_compliance
from ..models import BaselineComplianceReport, BaselineStatus, BundledBaseline, GPOInfo, ScanRequest, UploadedFileItem
from ..parsers._path_utils import safe_resolve_dir
from ..store import get_store

router = APIRouter(prefix="/api/baselines", tags=["baselines"])

# In Electron (dev + packaged) the sidecar passes this env var.
# Fall back to the repo-relative path for plain `uvicorn` development.
_env_dir = os.environ.get("SECURITY_BASELINES_DIR")
if _env_dir:
    BUNDLED_BASELINES_DIR = Path(_env_dir)
else:
    BUNDLED_BASELINES_DIR = Path(__file__).resolve().parent.parent.parent.parent / "SecurityBaselines"


@router.get("/bundled", response_model=list[BundledBaseline])
def list_bundled_baselines():
    """List the OS baseline folders shipped with the solution."""
    if not BUNDLED_BASELINES_DIR.is_dir():
        return []
    result = []
    for entry in sorted(BUNDLED_BASELINES_DIR.iterdir()):
        if entry.is_dir():
            gpo_count = sum(
                1 for sub in entry.iterdir()
                if sub.is_dir() and sub.name.startswith('{')
            )
            result.append(BundledBaseline(name=entry.name, gpo_count=gpo_count))
    return result


@router.post("/bundled/{os_name}", response_model=BaselineStatus)
def load_bundled_baseline(os_name: str):
    """Load a shipped baseline by OS folder name, replacing any current baselines."""
    # Prevent path traversal: name must be a single component and resolve within the baselines dir
    parts = Path(os_name).parts
    if len(parts) != 1 or parts[0] in ('..', '.'):
        raise HTTPException(status_code=400, detail="Invalid baseline name")
    try:
        safe_target = safe_resolve_dir(
            str(BUNDLED_BASELINES_DIR / os_name),
            trusted_root=str(BUNDLED_BASELINES_DIR),
        )
    except ValueError:
        raise HTTPException(status_code=404, detail=f"Bundled baseline '{os_name}' not found")
    store = get_store()
    store.clear_baselines()
    return store.scan_baselines(safe_target)


@router.get("", response_model=list[GPOInfo])
def list_baselines():
    return [b.info for b in get_store().list_baselines()]


@router.post("/scan", response_model=BaselineStatus)
def scan_baselines(request: ScanRequest):
    if not request.folder_path:
        raise HTTPException(status_code=400, detail="folder_path required")
    try:
        safe_path = safe_resolve_dir(request.folder_path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return get_store().scan_baselines(safe_path)


@router.post("/upload", response_model=BaselineStatus)
async def upload_baseline(files: list[UploadedFileItem]):
    """Upload Security Baseline GPO backup files from browser (additive)."""
    baseline_dir = Path.home() / ".pretty-policy-analyzer" / "baselines_cache"
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
