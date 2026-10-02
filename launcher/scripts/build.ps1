param([string]$SigningKey = "$env:USERPROFILE/.tauri/skirmish/updater.key")
$ErrorActionPreference = 'Stop'
$sarLauncherRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $sarLauncherRoot
if (-not (Test-Path -LiteralPath $SigningKey -PathType Leaf)) { throw 'The updater signing key was not found. Create or restore it outside the release folder.' }
$env:TAURI_SIGNING_PRIVATE_KEY_PATH = (Resolve-Path -LiteralPath $SigningKey).Path
$env:TAURI_SIGNING_PRIVATE_KEY = $env:TAURI_SIGNING_PRIVATE_KEY_PATH
if (-not (Test-Path -LiteralPath 'node_modules/@tauri-apps/cli/tauri.js')) { npm.cmd ci; if ($LASTEXITCODE) { exit $LASTEXITCODE } }
npm.cmd run build
exit $LASTEXITCODE
