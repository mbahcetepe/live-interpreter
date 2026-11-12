# Installs the Live Interpreter speech server on Windows, for the current user (no
# administrator rights needed), and starts it at every sign-in.
#
#   powershell -ExecutionPolicy Bypass -File install-windows.ps1            # install or update
#   powershell -ExecutionPolicy Bypass -File install-windows.ps1 -LocalOnly # only this computer
#   powershell -ExecutionPolicy Bypass -File install-windows.ps1 -Uninstall
#
# With an NVIDIA graphics card Whisper runs on it (cuBLAS and cuDNN are installed, about
# 1.3 GB); without one it runs on the processor. Everything goes under
# %LOCALAPPDATA%\LiveInterpreterSpeech; the key the extension needs is in
# connection.txt there. Run it again to update: the key is kept.
# Fewer voices: -Langs "en tr de". Setup.exe (installer\windows) runs this script.

param(
  [switch]$LocalOnly,
  [switch]$Uninstall,
  [switch]$FromSetup,
  [string]$Langs = 'en tr de fr es it pt nl pl ru uk ar ro sv hi zh',
  [int]$Port = 8765
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$Here = $PSScriptRoot
$App = Join-Path $env:LOCALAPPDATA 'LiveInterpreterSpeech'
$Code = Join-Path $App 'app'
$Venv = Join-Path $App 'venv'
$Config = Join-Path $App 'speech.env'
$LogFile = Join-Path $App 'logs\server.log'
$Connection = Join-Path $App 'connection.txt'
$Shortcut = Join-Path ([Environment]::GetFolderPath('Startup')) 'Live Interpreter speech server.lnk'
$Utf8 = New-Object System.Text.UTF8Encoding($false)

function Step($text) { Write-Host "== $text" -ForegroundColor Cyan }

# Runs a program and returns its exit code. Windows PowerShell 5.1 turns a program's
# stderr (uv writes its progress there) into errors when the output is redirected, which
# 'Stop' would end the script on; the lines are shown instead.
function Run {
  $exe, $rest = $args
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & $exe @rest 2>&1 | ForEach-Object { Write-Host "  $_" }
    return $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previous
  }
}

function Stop-Server {
  Get-CimInstance Win32_Process -Filter "Name='pythonw.exe' OR Name='python.exe'" |
    Where-Object { $_.CommandLine -and $_.CommandLine.Contains($App) } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

function Finish($code) {
  if ($FromSetup -and $code -ne 0) { Read-Host 'Press Enter to close' | Out-Null }
  exit $code
}

if ($Uninstall) {
  Step 'stopping the server'
  Stop-Server
  Start-Sleep -Seconds 1
  Remove-Item $Shortcut -Force -ErrorAction SilentlyContinue
  if (-not $FromSetup) {
    Step "removing $App"
    Remove-Item $App -Recurse -Force -ErrorAction SilentlyContinue
  }
  Write-Host 'The speech server is removed.'
  exit 0
}

try {
  Step 'folders'
  foreach ($dir in @($App, $Code, (Join-Path $App 'voices'), (Join-Path $App 'cache'), (Join-Path $App 'logs'))) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
  }
  Stop-Server
  foreach ($file in @('server.py', 'engines.py', 'segmenter.py', 'fetch_voices.py', 'requirements.txt', 'requirements-cuda-windows.txt')) {
    Copy-Item (Join-Path $Here $file) $Code -Force
  }

  Step 'uv (Python and packages)'
  $UvDir = Join-Path $App 'uv'
  $Uv = Join-Path $UvDir 'uv.exe'
  if (-not (Test-Path $Uv)) {
    $zip = Join-Path $env:TEMP 'live-interpreter-uv.zip'
    Invoke-WebRequest 'https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-pc-windows-msvc.zip' -OutFile $zip -UseBasicParsing
    Expand-Archive $zip -DestinationPath $UvDir -Force
    Remove-Item $zip -Force
  }
  $env:UV_PYTHON_INSTALL_DIR = Join-Path $App 'python'
  $env:UV_CACHE_DIR = Join-Path $App 'uv-cache'
  $env:UV_LINK_MODE = 'copy'

  Step 'Python environment (a few minutes the first time)'
  if (-not (Test-Path (Join-Path $Venv 'Scripts\python.exe'))) {
    if ((Run $Uv venv --python 3.12 $Venv) -ne 0) { throw 'could not make the Python environment' }
  }
  $Python = Join-Path $Venv 'Scripts\python.exe'
  $Pythonw = Join-Path $Venv 'Scripts\pythonw.exe'
  $requirements = @('-r', (Join-Path $Code 'requirements.txt'))
  $nvidia = @(Get-CimInstance Win32_VideoController | Where-Object { $_.Name -match 'NVIDIA' })
  if ($nvidia.Count -gt 0) {
    Write-Host "  NVIDIA card found: $($nvidia[0].Name); installing cuBLAS and cuDNN (about 1.3 GB)"
    $requirements += @('-r', (Join-Path $Code 'requirements-cuda-windows.txt'))
  } else {
    Write-Host '  no NVIDIA card: Whisper runs on the processor'
  }
  if ((Run $Uv pip install --python $Python @requirements) -ne 0) { throw 'could not install the packages' }
  Run $Uv cache clean | Out-Null

  Step 'Piper voices'
  if ((Run $Python (Join-Path $Code 'fetch_voices.py') --dir (Join-Path $App 'voices') --langs $Langs) -ne 0) { throw 'could not download the voices' }

  Step 'settings'
  $listen = if ($LocalOnly) { '127.0.0.1' } else { '0.0.0.0' }
  if (-not (Test-Path $Config)) {
    $bytes = New-Object byte[] 24
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $key = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
    $lines = @(
      "SPEECH_KEY=$key",
      "SPEECH_HOST=$listen",
      "SPEECH_PORT=$Port",
      'WHISPER_MODEL=large-v3-turbo',
      'WHISPER_DEVICE=auto',
      'WHISPER_COMPUTE=auto',
      "PIPER_VOICES=$(Join-Path $App 'voices\voices.json')",
      "HF_HOME=$(Join-Path $App 'cache')"
    )
    [IO.File]::WriteAllText($Config, (($lines -join "`r`n") + "`r`n"), $Utf8)
  } else {
    $text = [IO.File]::ReadAllText($Config)
    $text = [Text.RegularExpressions.Regex]::Replace($text, '(?m)^SPEECH_HOST=.*$', "SPEECH_HOST=$listen")
    [IO.File]::WriteAllText($Config, $text, $Utf8)
  }
  $settings = @{}
  foreach ($line in [IO.File]::ReadAllLines($Config)) {
    if ($line -match '^\s*([A-Z_]+)\s*=\s*(.*)$') { $settings[$Matches[1]] = $Matches[2].Trim() }
  }
  $Port = [int]$settings['SPEECH_PORT']

  Step 'start at sign-in'
  $arguments = "`"$(Join-Path $Code 'server.py')`" --config `"$Config`" --log `"$LogFile`""
  $shell = New-Object -ComObject WScript.Shell
  $link = $shell.CreateShortcut($Shortcut)
  $link.TargetPath = $Pythonw
  $link.Arguments = $arguments
  $link.WorkingDirectory = $Code
  $link.Description = 'Live Interpreter speech server'
  $link.Save()

  Step 'starting the server (the first start downloads the Whisper model, about 1.6 GB)'
  Start-Process -FilePath $Pythonw -ArgumentList $arguments -WorkingDirectory $Code -WindowStyle Hidden
  $health = $null
  for ($i = 0; $i -lt 300; $i++) {
    try {
      $health = Invoke-RestMethod "http://127.0.0.1:$Port/health" -TimeoutSec 2
      break
    } catch {
      Start-Sleep -Seconds 2
      Write-Host -NoNewline '.'
    }
  }
  Write-Host ''

  $addresses = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
      Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' } |
      Sort-Object { if ($_.IPAddress -like '100.*') { 0 } else { 1 } } |
      Select-Object -ExpandProperty IPAddress)
  $report = @(
    'Live Interpreter speech server',
    '',
    'In the extension: Settings > Speech recognition and voices > Service: "My own speech server".',
    '',
    "  Address on this computer: localhost:$Port"
  )
  if (-not $LocalOnly) {
    foreach ($address in $addresses) { $report += "  Address from another computer: ${address}:$Port" }
  }
  $report += @(
    "  Key: $($settings['SPEECH_KEY'])",
    '',
    "Settings: $Config",
    "Log: $LogFile",
    'It starts by itself at every sign-in.'
  )
  if (-not $LocalOnly) {
    $report += 'Windows may ask once whether Python may accept connections: allow it on private networks for other computers to reach it.'
  }
  [IO.File]::WriteAllText($Connection, (($report -join "`r`n") + "`r`n"), $Utf8)

  if ($health) {
    Write-Host ("Ready: speech server {0}, Whisper on {1}." -f $health.version, $(if ($health.device) { $health.device } else { 'the processor' })) -ForegroundColor Green
  } else {
    Write-Host "The server has not answered yet; it may still be downloading the Whisper model. See $LogFile" -ForegroundColor Yellow
  }
  $report | ForEach-Object { Write-Host $_ }
  Finish 0
} catch {
  Write-Host "Install failed: $($_.Exception.Message)" -ForegroundColor Red
  Finish 1
}
