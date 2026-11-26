# PyInstaller spec for Tauri sidecar (Windows x64).
# Usage: pyinstaller quantlens_engine.spec  (from backend/ with venv active)

import sys
from pathlib import Path

block_cipher = None
backend = Path(SPECPATH)

a = Analysis(
    [str(backend / "run.py")],
    pathex=[str(backend)],
    binaries=[],
    datas=[],
    hiddenimports=[
        "app.main",
        "app.collector",
        "app.akshare_a",
        "app.indicators",
        "app.universe_indicators",
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan",
        "uvicorn.lifespan.on",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="quantlens-engine-x86_64-pc-windows-msvc",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)