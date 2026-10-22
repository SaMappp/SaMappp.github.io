[CmdletBinding()]
param([string]$Python = 'python')
$ErrorActionPreference = 'Stop'
$captureRepo = Join-Path $PSScriptRoot 'WiFiPresence-Capture'
$expectedCommit = '12fce9354d3506290e70a853a4f22866f0e987ef'
if (-not (Test-Path -LiteralPath $captureRepo)) {
    git clone --depth 1 --branch 3.0.0 https://github.com/francescopace/espectre.git $captureRepo
    if ($LASTEXITCODE -ne 0) { throw 'ESPectre clone failed.' }
}
$actualCommit = git -C $captureRepo rev-parse HEAD
if ($LASTEXITCODE -ne 0 -or $actualCommit -ne $expectedCommit) { throw 'Unexpected dependency checkout; preserve it and review manually.' }
$capturePython = Join-Path $captureRepo '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $capturePython)) {
    & $Python -m venv (Join-Path $captureRepo '.venv')
    if ($LASTEXITCODE -ne 0) { throw 'Virtual environment creation failed.' }
}
& $capturePython -m pip install -r (Join-Path $captureRepo 'requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
& $capturePython (Join-Path $PSScriptRoot 'WiFiPresence-Capture-Start.py') --check
if ($LASTEXITCODE -ne 0) { throw 'Launcher check failed.' }
