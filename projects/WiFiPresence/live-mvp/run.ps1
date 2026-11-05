[CmdletBinding()]
param([string]$DataDir='', [string]$EspectreRepo='', [string]$Python='', [int]$Port=18768, [switch]$NoBrowser)
$ErrorActionPreference='Stop'
$root=$PSScriptRoot
if ($DataDir) { $env:WIFIPRESENCE_DATA_DIR=(Resolve-Path -LiteralPath $DataDir).Path }
if ($EspectreRepo) { $env:WIFIPRESENCE_ESPECTRE_REPO=(Resolve-Path -LiteralPath $EspectreRepo).Path }
$existingCapture=Join-Path $env:USERPROFILE 'Documents\Codex\WiFiPresence-Capture'
if (-not $env:WIFIPRESENCE_ESPECTRE_REPO -and (Test-Path -LiteralPath $existingCapture)) { $env:WIFIPRESENCE_ESPECTRE_REPO=$existingCapture }
if (-not $Python) { $Python=$env:WIFIPRESENCE_PYTHON }
if (-not $Python) { $existingPython=Join-Path $existingCapture '.venv\Scripts\python.exe'; if (Test-Path -LiteralPath $existingPython) { $Python=$existingPython } else { $Python=(Get-Command python -ErrorAction Stop).Source } }
$url="http://127.0.0.1:$Port/"
$status=$null
try { $status=Invoke-RestMethod ($url+'api/live/status') -TimeoutSec 2 } catch {}
if ($status) {
    if ($status.app -ne 'WiFiPresence-live-MVP') { throw 'Port belongs to another app. Choose another Port.' }
    if (-not $NoBrowser) { Start-Process $url }
    Write-Output $url
    exit 0
}
$entry=Join-Path $root 'app.py'
$output=Join-Path $root 'local-output'
New-Item -ItemType Directory -Path $output -Force | Out-Null
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$arguments=@('-X','utf8',"`"$entry`"",'--port',"$Port",'--no-browser')
$process=Start-Process -FilePath $Python -ArgumentList $arguments -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $output "$stamp.log") -RedirectStandardError (Join-Path $output "$stamp.error.log")
for ($attempt=0; $attempt -lt 40; $attempt++) {
    try { $status=Invoke-RestMethod ($url+'api/live/status') -TimeoutSec 1 } catch {}
    if ($status -and $status.app -eq 'WiFiPresence-live-MVP') { break }
    if ($process.HasExited) { throw 'Server exited. Check local-output logs.' }
    Start-Sleep -Milliseconds 200
}
if (-not $status -or $status.app -ne 'WiFiPresence-live-MVP') { throw 'Local server did not become ready. Check local-output logs.' }
if (-not $NoBrowser) { Start-Process $url }
Write-Output $url
