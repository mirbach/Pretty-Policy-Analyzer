"""FastAPI application entry point."""

from __future__ import annotations

import argparse
import base64
import shutil
import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .models import ScanRequest, ScanStatus, UploadedFileItem
from .routers import compare, conflicts, gpos, baselines
from .store import get_store

app = FastAPI(
    title="Pretty Policy Analyzer",
    description="Analyze, compare, and find conflicts in Active Directory GPO backups",
    version="1.0.0",
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


@app.post("/api/scan", response_model=ScanStatus)
def scan_folder(request: ScanRequest):
    return get_store().scan(request.folder_path)


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
    else:
        # Try to load last used folder
        last = get_store().load_last_folder()
        if last:
            get_store().scan(last)

    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
