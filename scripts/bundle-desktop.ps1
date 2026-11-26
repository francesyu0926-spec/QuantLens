# One-shot: build engine sidecar + Tauri desktop installer.

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

& (Join-Path $Root "scripts\build-engine-sidecar.ps1")

Push-Location (Join-Path $Root "frontend")
try {
    if (-not (Test-Path "node_modules")) {
        npm install
    }
    npm run tauri build
} finally {
    Pop-Location
}

Write-Host "Desktop bundle complete. Check frontend\src-tauri\target\release\bundle"