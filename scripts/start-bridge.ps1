$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$bridgeCli = Join-Path $projectRoot 'packages\bridge\src\cli.ts'
$nodeExe = (Get-Command node.exe -ErrorAction Stop).Source
Set-Location -LiteralPath $projectRoot
& $nodeExe --import tsx $bridgeCli serve
