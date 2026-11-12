param(
  [ValidateRange(1,65535)][int]$Port = 19223,
  [string]$FirefoxPath = 'C:\Program Files\Mozilla Firefox\firefox.exe',
  [string]$ProfilePath = ''
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path -LiteralPath $FirefoxPath -PathType Leaf)) { throw "Firefox not found: $FirefoxPath" }
if (-not $ProfilePath) {
  $ini = Join-Path $env:APPDATA 'Mozilla\Firefox\installs.ini'
  if (-not (Test-Path -LiteralPath $ini -PathType Leaf)) { throw 'Firefox default profile not found. Pass -ProfilePath.' }
  $line = Get-Content -LiteralPath $ini | Where-Object { $_ -match '^Default=' } | Select-Object -First 1
  if (-not $line) { throw 'Firefox default profile not found. Pass -ProfilePath.' }
  $relativeProfile = $line.Substring(8).Replace('/', [IO.Path]::DirectorySeparatorChar)
  $ProfilePath = Join-Path (Join-Path $env:APPDATA 'Mozilla\Firefox') $relativeProfile
}
$ProfilePath = (Resolve-Path -LiteralPath $ProfilePath).Path
$normal = Get-CimInstance Win32_Process -Filter "name='firefox.exe'" |
  Where-Object { $_.CommandLine -notmatch ' -contentproc ' -and $_.CommandLine -notmatch ' --headless' -and $_.CommandLine -notmatch ' -headless' }
$ready = $normal | Where-Object { $_.CommandLine -match "--remote-debugging-port[ =]$Port(\s|$)" -and $_.CommandLine -like "*$ProfilePath*" }
if ($normal -and -not $ready) { throw 'Close normal Firefox first, then rerun this script. Firefox must start with the BiDi port.' }
if (-not $ready) {
  Start-Process -FilePath $FirefoxPath -ArgumentList @('--remote-debugging-port', "$Port", '-profile', "`"$ProfilePath`"")
}
$connected = $false
for ($i = 0; $i -lt 40; $i++) {
  $client = [Net.Sockets.TcpClient]::new()
  try { $client.Connect('127.0.0.1', $Port); $connected = $true; break }
  catch { Start-Sleep -Milliseconds 500 }
  finally { $client.Dispose() }
}
if (-not $connected) { throw "Firefox BiDi did not open on 127.0.0.1:$Port" }
Push-Location $repo
try {
  corepack pnpm exec tsx packages/bridge/src/cli.ts bidi $Port
  if ($LASTEXITCODE -ne 0) { throw 'Saint BiDi configuration failed' }
  corepack pnpm exec tsx packages/bridge/src/cli.ts bidi-install $Port
  if ($LASTEXITCODE -ne 0) { throw 'Saint Firefox add-on installation failed' }
} finally { Pop-Location }
Write-Output 'Saint in Firefox advanced mode is ready. The saved pairing should reconnect.'
