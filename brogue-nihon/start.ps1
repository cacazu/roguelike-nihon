param([int]$Port = 4174, [switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
if (-not $SkipBuild) { & (Join-Path $PSScriptRoot 'build-web.ps1') }
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'build\game.wasm'))) { throw 'Run build-web.ps1 before starting the Web game.' }
& node (Join-Path (Split-Path -Parent $PSScriptRoot) 'tools\server.mjs') --root $PSScriptRoot $Port
