# 从 docs/产品说明书.md 生成 PDF（需 Node；首次会在 docs 下装 md-to-pdf）
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$docs = Join-Path $root "docs"
Push-Location $docs
try {
  if (-not (Test-Path "node_modules\md-to-pdf")) {
    npm install md-to-pdf --no-save --registry=https://registry.npmjs.org
  }
  npx md-to-pdf "产品说明书.md" --config-file "md-to-pdf.config.cjs"
  if (Test-Path "产品说明书.pdf") {
    Move-Item -Force "产品说明书.pdf" "QuantLens产品说明书.pdf"
  }
  pandoc "产品说明书.md" -o "QuantLens产品说明书.html" --standalone --toc --toc-depth=2 `
    --metadata title="QuantLens 产品说明书" -c "pdf-print.css" --resource-path=.
  Write-Host "OK: $(Join-Path $docs 'QuantLens产品说明书.pdf')"
} finally {
  Pop-Location
}