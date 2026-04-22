"""FastAPI application entry point."""

from __future__ import annotations

import argparse
import base64
import shutil
import sys
import uuid
from pathlib import Path

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from fastapi import HTTPException
from .models import ScanRequest, ScanByIdRequest, RegisterFolderResponse, ScanStatus, UploadedFileItem
from .parsers._path_utils import safe_resolve_dir
from .routers import compare, conflicts, gpos, baselines
from .store import get_store, register_folder, lookup_folder
from .parsers.gpresult_parser import parse_gpresult_xml, run_gpresult


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run startup tasks before the server begins accepting requests."""
    store = get_store()
    last = store.load_last_folder()
    if last:
        store.scan(last)
    store.load_effective_policy()
    yield


app = FastAPI(
    title="Pretty Policy Analyzer",
    description="Analyze, compare, and find conflicts in Active Directory GPO backups",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(gpos.router)
app.include_router(compare.router)
app.include_router(conflicts.router)
app.include_router(baselines.router)


@app.get("/api/status", response_model=ScanStatus)
def get_status():
    return get_store().get_status()


# Registry of validated folder paths: opaque UUID -> resolved absolute path.
# Paths are stored here after safe_resolve_dir validation; only the UUID is
# ever returned to the client, so no user-controlled string reaches a
# filesystem call in the scan endpoints.


@app.post("/api/register-folder", response_model=RegisterFolderResponse)
def register_folder_endpoint(request: ScanRequest):
    """Validate and register a user-supplied folder path; return an opaque ID."""
    try:
        safe_path = safe_resolve_dir(request.folder_path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    folder_id = str(uuid.uuid4())
    register_folder(folder_id, safe_path)
    return RegisterFolderResponse(folder_id=folder_id)


@app.post("/api/scan", response_model=ScanStatus)
def scan_folder(request: ScanByIdRequest):
    """Scan a previously registered folder by its opaque ID."""
    safe_path = lookup_folder(request.folder_id)
    if safe_path is None:
        raise HTTPException(status_code=400, detail="Unknown folder_id; call /api/register-folder first")
    return get_store().scan(safe_path)


@app.post("/api/scan-upload", response_model=ScanStatus)
async def scan_upload(files: list[UploadedFileItem]):
    """Accept uploaded GPO files from browser File System Access API."""
    upload_dir = Path.home() / ".pretty-policy-analyzer" / "upload_cache"
    if upload_dir.exists():
        shutil.rmtree(upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)

    for f in files:
        # Sanitize path to prevent path traversal
        parts = Path(f.relative_path.replace("\\", "/")).parts
        if any(p in ("..", ".") for p in parts) or Path(f.relative_path).is_absolute():
            continue
        file_path = upload_dir.joinpath(*parts)
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_bytes(base64.b64decode(f.content_b64))

    return get_store().scan(str(upload_dir))


@app.delete("/api/scan", response_model=ScanStatus)
def clear_data():
    """Clear all loaded GPO data and return to empty state."""
    return get_store().clear()


@app.post("/api/import-local-policy", response_model=ScanStatus)
async def import_local_policy():
    """Run gpresult /X and import the effective policy of this machine."""
    import asyncio
    import os
    xml_path: str | None = None
    try:
        xml_path = await asyncio.to_thread(run_gpresult, scope="both")
        gpo, _warnings = await asyncio.to_thread(parse_gpresult_xml, xml_path)
        return get_store().add_or_replace_gpo(gpo)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if xml_path and os.path.isfile(xml_path):
            try:
                os.unlink(xml_path)
            except OSError:
                pass


@app.get("/api/health")
def health():
    return {"status": "ok"}


def main() -> None:
    import uvicorn

    parser = argparse.ArgumentParser(description="Pretty Policy Analyzer Backend")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--host", type=str, default="127.0.0.1")
    parser.add_argument("--scan", type=str, default=None, help="Auto-scan a GPO folder on startup")
    args = parser.parse_args()

    if args.scan:
        get_store().scan(args.scan)

    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
