$Root = Split-Path -Parent $PSScriptRoot
Set-Location "$Root\frontend"
if (-not (Test-Path "node_modules")) {
    npm install --registry https://registry.npmjs.org
}
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
}
npm run dev