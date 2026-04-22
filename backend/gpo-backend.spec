# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for the Pretty Policy Analyzer backend sidecar."""

import sys
from pathlib import Path

block_cipher = None

a = Analysis(
    ['run.py'],
    pathex=[str(Path('.').resolve())],
    binaries=[],
    datas=[],
    hiddenimports=[
        # uvicorn
        'uvicorn',
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.loops.asyncio',
        'uvicorn.loops.uvloop',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.http.h11_impl',
        'uvicorn.protocols.http.httptools_impl',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.protocols.websockets.websockets_impl',
        'uvicorn.protocols.websockets.wsproto_impl',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'uvicorn.lifespan.off',
        # FastAPI / starlette
        'fastapi',
        'starlette',
        'starlette.routing',
        'starlette.middleware',
        'starlette.middleware.cors',
        'starlette.responses',
        'starlette.requests',
        'starlette.background',
        'starlette.concurrency',
        # pydantic
        'pydantic',
        'pydantic.v1',
        'pydantic_core',
        # lxml
        'lxml',
        'lxml.etree',
        # anyio
        'anyio',
        'anyio._backends._asyncio',
        'anyio._backends._trio',
        # h11
        'h11',
        # click
        'click',
        # email_validator (used by pydantic)
        'email_validator',
        # app modules
        'app',
        'app.main',
        'app.models',
        'app.store',
        'app.routers',
        'app.routers.gpos',
        'app.routers.compare',
        'app.routers.conflicts',
        'app.routers.baselines',
        'app.parsers',
        'app.parsers.gpo_parser',
        'app.parsers.gpreport_parser',
        'app.parsers.backup_parser',
        'app.parsers.registry_pol',
        'app.parsers.security_inf',
        'app.analysis',
        'app.analysis.categorizer',
        'app.analysis.conflict',
        'app.analysis.differ',
        'app.analysis.baseline_checker',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # chardet ships optional mypyc-compiled variants that are never present
        # in a standard pip install — exclude them to suppress PyInstaller warnings.
        'ascii__mypyc',
        'confusion__mypyc',
        'escape__mypyc',
        'magic__mypyc',
        'orchestrator__mypyc',
        'statistical__mypyc',
        'structural__mypyc',
        'utf1632__mypyc',
        'utf8__mypyc',
        'validity__mypyc',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='gpo-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='gpo-backend',
)
