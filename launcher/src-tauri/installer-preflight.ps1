param([Parameter(Mandatory=$true)][string]$InstallDirectory)
$ErrorActionPreference='Stop'
# This also protects upgrades from older launchers which did not stop their
# shared backend. Never kill arbitrary Node processes or touch account storage.
$root=[IO.Path]::GetFullPath($InstallDirectory)
$runtime=Join-Path $root 'backend\node.exe'
$entry=Join-Path $root 'backend\server\desktop-service.cjs'
$log=Join-Path $env:LOCALAPPDATA 'SkirmishArenaServer\installer-startup.log'
function SamePath($a,$b){return [IO.Path]::GetFullPath($a).TrimEnd('\') -ieq [IO.Path]::GetFullPath($b).TrimEnd('\')}
function Control($record,$action){
  if($record.controlPipe -notmatch '^\\\\\.\\pipe\\skirmish-arena-[a-z0-9-]+$' -or $record.controlToken -notmatch '^[0-9a-f]{64}$'){throw 'Invalid private lifecycle endpoint.'}
  $pipe=New-Object IO.Pipes.NamedPipeClientStream('.', $record.controlPipe.Substring(9), [IO.Pipes.PipeDirection]::InOut, [IO.Pipes.PipeOptions]::Asynchronous)
  try{
    $pipe.Connect(4000)
    $writer=New-Object IO.StreamWriter($pipe);$writer.AutoFlush=$true
    $reader=New-Object IO.StreamReader($pipe)
    $writer.WriteLine((@{token=$record.controlToken;action=$action}|ConvertTo-Json -Compress))
    $read=$reader.ReadLineAsync();if(-not $read.Wait(4000)){throw 'Private lifecycle response timed out.'}
    $reply=$read.Result|ConvertFrom-Json
    if(-not $reply.ok){throw 'Private lifecycle request was rejected.'}
    return $reply
  }finally{$pipe.Dispose()}
}
try{
  if(Test-Path -LiteralPath $runtime){
    $owners=@(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {$_.ExecutablePath -and (SamePath $_.ExecutablePath $runtime)})
    # Resolve only the launcher's established pinned locations; never discover
    # unrelated databases or read account contents.
    $configs=@((Join-Path $env:APPDATA 'com.skirmisharena.launcher'))
    $packages=Join-Path $env:LOCALAPPDATA 'Packages'
    if(Test-Path -LiteralPath $packages){$configs+=@(Get-ChildItem -LiteralPath $packages -Directory -Filter 'OpenAI.Codex_*'|ForEach-Object {Join-Path $_.FullName 'LocalCache\Roaming\com.skirmisharena.launcher'})}
    if($env:SAR_LAUNCHER_DATA_ROOT){$configs=@($env:SAR_LAUNCHER_DATA_ROOT)}
    foreach($owner in $owners){
      $record=$null
      foreach($config in $configs){
        $pin=Join-Path $config 'desktop-local-paths.json';if(-not(Test-Path -LiteralPath $pin)){continue}
        $paths=Get-Content -LiteralPath $pin -Raw|ConvertFrom-Json
        $marker=Join-Path $paths.serviceRoot 'desktop-service.json';if(-not(Test-Path -LiteralPath $marker)){continue}
        $candidate=Get-Content -LiteralPath $marker -Raw|ConvertFrom-Json
        if($candidate.pid -eq $owner.ProcessId -and (SamePath $candidate.nodeExecutable $runtime) -and (SamePath $candidate.entryPath $entry) -and (SamePath $candidate.databasePath $paths.databasePath)){$record=$candidate;break}
      }
      if(-not $record){throw 'An unverified process is using the installed runtime. Close the other game window and retry the update.'}
      $health=Control $record 'health'
      if($health.pid -ne $record.pid -or -not(SamePath $health.databasePath $record.databasePath) -or $health.version -ne $record.version){throw 'Local service identity changed. Update stopped before replacing files.'}
      $process=Get-Process -Id $owner.ProcessId -ErrorAction Stop
      $null=Control $record 'shutdown'
      if(-not $process.WaitForExit(10000)){throw 'The local service has not released its files. Retry the update.'}
    }
    # Test the exact Windows lock that previously interrupted resource copying.
    $handle=[IO.File]::Open($runtime,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
    $handle.Dispose()
  }
  New-Item -ItemType Directory -Path (Split-Path -Parent $log) -Force|Out-Null
  Add-Content -LiteralPath $log -Value ((Get-Date -Format o)+' Update preflight passed; installed runtime released.')
  exit 0
}catch{
  New-Item -ItemType Directory -Path (Split-Path -Parent $log) -Force|Out-Null
  Add-Content -LiteralPath $log -Value ((Get-Date -Format o)+' Update preflight failed: '+$_.Exception.Message)
  exit 1
}
