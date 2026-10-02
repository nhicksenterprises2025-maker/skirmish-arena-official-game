param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
try {
    $releaseRoot = $PSScriptRoot
    $taskNode = (Get-Command node.exe -ErrorAction Stop).Source
    $taskNpm = (Get-Command npm.cmd -ErrorAction Stop).Source
    $runtimeVersion = [version]((& $taskNode --version).Trim().TrimStart('v'))
    if ($runtimeVersion.Major -lt 24 -or ($runtimeVersion.Major -eq 24 -and $runtimeVersion.Minor -lt 15)) {
        throw 'Install Node.js 24.15 or later, then open Start-Game.cmd again.'
    }
    if (-not (Test-Path -LiteralPath (Join-Path $releaseRoot 'node_modules/bcryptjs/package.json'))) {
        Push-Location $releaseRoot
        try { & $taskNpm ci --omit=dev; if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Reconnect and try again.' } }
        finally { Pop-Location }
    }
    $dataRoot = Join-Path $env:LOCALAPPDATA 'SkirmishArenaServer'
    New-Item -ItemType Directory -Path $dataRoot -Force | Out-Null
    if (-not $env:SAR_DB_PATH) { $env:SAR_DB_PATH = Join-Path $dataRoot 'skirmish.sqlite' }
    if (-not $env:SAR_PORT) { $env:SAR_PORT = '8803' }
    $env:SAR_HOST = '127.0.0.1'
    $gameOrigin = 'http://127.0.0.1:' + $env:SAR_PORT
    $expectedVersion = (Get-Content -LiteralPath (Join-Path $releaseRoot 'version.json') -Raw | ConvertFrom-Json).version
    $serviceStatus = $null
    try { $serviceStatus = Invoke-RestMethod -Uri ($gameOrigin + '/api/status') -TimeoutSec 2 } catch {}
    if ($serviceStatus -and $serviceStatus.version -ne $expectedVersion) {
        throw "A different release is running at $gameOrigin. Close its local server before starting this release; your database is retained."
    }
    if (-not $serviceStatus) {
        $outLog = Join-Path $dataRoot 'server.stdout.log'
        $errLog = Join-Path $dataRoot 'server.stderr.log'
        $serverEntry = Join-Path $releaseRoot 'server/index.cjs'
        Start-Process -FilePath $taskNode -ArgumentList @('"' + $serverEntry + '"') -WorkingDirectory $releaseRoot -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog | Out-Null
        for ($attempt = 0; $attempt -lt 40 -and -not $serviceStatus; $attempt++) {
            Start-Sleep -Milliseconds 250
            try { $serviceStatus = Invoke-RestMethod -Uri ($gameOrigin + '/api/status') -TimeoutSec 1 } catch {}
        }
        if (-not $serviceStatus) { throw "The server could not start. See $errLog. A different app may be using port $env:SAR_PORT." }
    }
    if (-not $NoBrowser) { Start-Process $gameOrigin }
    Write-Host "Game opened at $gameOrigin. Your database is $env:SAR_DB_PATH."
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
