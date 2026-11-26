# Build Python FastAPI engine as Tauri sidecar (Windows x64).
# Output: src-tauri/binaries/quantlens-engine-x86_64-pc-windows-msvc.exe

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root "backend"
$OutDir = Join-Path $Root "src-tauri\binaries"

if (-not (Test-Path (Join-Path $Backend ".venv\Scripts\python.exe"))) {
    Write-Error "Create backend venv first: cd backend; python -m venv .venv; pip install -r requirements.txt"
}

$python = Join-Path $Backend ".venv\Scripts\python.exe"
$pip = Join-Path $Backend ".venv\Scripts\pip.exe"

& $pip install pyinstaller --quiet
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

Push-Location $Backend
try {
    & $python -m PyInstaller --noconfirm --clean quantlens_engine.spec
    $built = Join-Path $Backend "dist\quantlens-engine-x86_64-pc-windows-msvc.exe"
    if (-not (Test-Path $built)) {
        Write-Error "PyInstaller output missing: $built"
    }
    Copy-Item -Force $built (Join-Path $OutDir "quantlens-engine-x86_64-pc-windows-msvc.exe")
    Write-Host "Sidecar copied to $OutDir"
} finally {
    Pop-Location
}