$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$tsxCli = Join-Path $projectRoot 'node_modules\tsx\dist\cli.mjs'
$bridgeCli = Join-Path $projectRoot 'packages\bridge\src\cli.ts'
$nodeExe = (Get-Command node.exe -ErrorAction Stop).Source
Set-Location -LiteralPath $projectRoot
& $nodeExe $tsxCli $bridgeCli serve
