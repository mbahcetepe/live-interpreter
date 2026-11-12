# Builds dist-installers\LiveInterpreterSpeech-Setup-<version>.exe with Inno Setup 6
# (https://jrsoftware.org/isinfo.php). The version is the speech server's (server.py).
#
#   powershell -ExecutionPolicy Bypass -File installer\windows\build-setup.ps1

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$server = Join-Path $here '..\..\speech-server\server.py'
$match = Select-String -Path $server -Pattern "^VERSION = '([^']+)'" | Select-Object -First 1
if (-not $match) { throw 'no VERSION in server.py' }
$version = $match.Matches[0].Groups[1].Value

$iscc = @(
  (Get-Command ISCC.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source),
  "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
  "$env:ProgramFiles\Inno Setup 6\ISCC.exe",
  "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $iscc) { throw 'Inno Setup 6 (ISCC.exe) not found: install it from https://jrsoftware.org/isdl.php' }

& $iscc "/DAppVersion=$version" (Join-Path $here 'setup.iss')
if ($LASTEXITCODE -ne 0) { throw "ISCC failed ($LASTEXITCODE)" }
Write-Host "Built dist-installers\LiveInterpreterSpeech-Setup-$version.exe"
