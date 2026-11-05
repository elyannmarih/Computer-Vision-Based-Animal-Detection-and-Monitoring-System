param([switch]$SetupOnly)
$ErrorActionPreference = 'Stop'
# A short environment path avoids Windows path limits in PyTorch dependencies.
$runtimeDirectory = Join-Path $env:LOCALAPPDATA 'Detectra/venv'
$pythonPath = Join-Path $runtimeDirectory 'Scripts/python.exe'
if (-not (Test-Path -LiteralPath $pythonPath)) {
    py -3.13 -m venv $runtimeDirectory
    if ($LASTEXITCODE -ne 0) { throw 'Could not create Python 3.13 environment' }
}
$requirementsPath = Join-Path $PSScriptRoot 'requirements.txt'
$stampPath = Join-Path $runtimeDirectory 'requirements.sha256'
$requirementsHash = (Get-FileHash -LiteralPath $requirementsPath -Algorithm SHA256).Hash
$installedHash = if (Test-Path -LiteralPath $stampPath) { (Get-Content -LiteralPath $stampPath -Raw).Trim() } else { '' }
if ($installedHash -ne $requirementsHash) {
    & $pythonPath -m pip install -r $requirementsPath
    if ($LASTEXITCODE -ne 0) { throw 'Could not install backend requirements' }
    & $pythonPath -c 'import torch, ultralytics, uvicorn, fastapi, psycopg'
    if ($LASTEXITCODE -ne 0) { throw 'Backend dependencies failed to load' }
    Set-Content -LiteralPath $stampPath -Value $requirementsHash
}
if (-not $SetupOnly) {
    Push-Location $PSScriptRoot
    try { & $pythonPath -m uvicorn app.main:app --reload --timeout-graceful-shutdown 3 }
    finally { Pop-Location }
}
