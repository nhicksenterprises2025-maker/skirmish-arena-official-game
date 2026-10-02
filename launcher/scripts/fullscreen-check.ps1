param([string]$ExecutablePath = (Join-Path $PSScriptRoot '../dist/skirmish-launcher.exe'))
$ErrorActionPreference = 'Stop'
$taskExe = (Resolve-Path -LiteralPath $ExecutablePath).Path
if (Get-NetTCPConnection -State Listen -LocalPort 8803 -ErrorAction SilentlyContinue) { throw 'Port 8803 is occupied; this isolated check must not replace a running server.' }
if (Get-CimInstance Win32_Process -Filter "Name='skirmish-launcher.exe'" | Where-Object { $_.ExecutablePath -eq $taskExe }) { throw 'Close this test executable before running the isolated check.' }
$taskSettings = Join-Path $env:APPDATA 'com.skirmisharena.launcher/launcher-settings.json'
if ((Get-Content -LiteralPath $taskSettings -Raw | ConvertFrom-Json).serverOrigin -ne 'http://127.0.0.1:8803') { throw 'This check requires the existing default server origin; it does not change user settings.' }
$settingsDigest = (Get-FileHash -LiteralPath $taskSettings -Algorithm SHA256).Hash
$taskScratch = Join-Path $env:TEMP ('sar-native-fullscreen-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $taskScratch | Out-Null
$fixtureCode = @'
'use strict';
const http=require('node:http');let report=null;
const page='<!doctype html><html><head><meta charset="utf-8"><title>Native fullscreen verification</title></head><body style="margin:0;background:#e9ecde;color:#203329;font:18px system-ui;padding:30px"><h1>Native fullscreen verification</h1><p>The isolated test is checking the actual native game window.</p><script src="/check.js"></script></body></html>';
const script=`(async()=>{for(let i=0;i<40&&!window.__TAURI__?.core;i++)await new Promise(r=>setTimeout(r,100));const invoke=window.__TAURI__.core.invoke;const started=await invoke('game_fullscreen_state');const off=await invoke('set_game_fullscreen',{fullscreen:false});const on=await invoke('set_game_fullscreen',{fullscreen:true});let blocked=false;try{await invoke('launcher_settings')}catch{blocked=true}await fetch('/diagnostic',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({started:started.fullscreen,toggledOff:off.fullscreen===false,toggledOn:on.fullscreen,launcherCommandsBlocked:blocked,nativeMarker:window.__SAR_NATIVE_GAME__===true})});document.querySelector('p').textContent='Fullscreen native commands checked. The test will close this window.';})().catch(error=>fetch('/diagnostic',{method:'POST',body:JSON.stringify({error:String(error)})}));`;
http.createServer((req,res)=>{const pathname=new URL(req.url,'http://127.0.0.1').pathname;if(pathname==='/diagnostic'&&req.method==='POST'){let body='';req.on('data',c=>body+=c);req.on('end',()=>{report=JSON.parse(body);res.writeHead(200);res.end('{}')});return;}if(pathname==='/diagnostic'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(report));return;}if(pathname==='/api/launcher/update'){res.writeHead(204);res.end();return;}if(pathname==='/api/status'||pathname==='/api/version'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({ok:true,version:'1.5.2',channel:'isolated verification',notes:'Native fullscreen test'}));return;}if(pathname==='/check.js'){res.writeHead(200,{'content-type':'application/javascript'});res.end(script);return;}if(pathname==='/'){res.writeHead(200,{'content-type':'text/html','cache-control':'no-store'});res.end(page);return;}res.writeHead(404);res.end();}).listen(8803,'127.0.0.1');
'@
Set-Content -LiteralPath (Join-Path $taskScratch 'fixture.cjs') -Value $fixtureCode -Encoding utf8
Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes
Add-Type -TypeDefinition @'
using System;using System.Collections.Generic;using System.Runtime.InteropServices;
public static class SARFullscreenWindows {
public delegate bool Callback(IntPtr h,IntPtr p);
[StructLayout(LayoutKind.Sequential)] public struct RECT {public int left,top,right,bottom;}
[StructLayout(LayoutKind.Sequential)] public struct MONITORINFO {public int cbSize;public RECT monitor,work;public uint flags;}
[DllImport("user32.dll")] static extern bool EnumWindows(Callback callback,IntPtr p);
[DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
[DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
[DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out RECT rect);
[DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h,uint flags);
[DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr monitor,ref MONITORINFO info);
public static IntPtr[] Windows(uint wanted){var list=new List<IntPtr>();EnumWindows((h,p)=>{uint pid;GetWindowThreadProcessId(h,out pid);if(pid==wanted&&IsWindowVisible(h))list.Add(h);return true;},IntPtr.Zero);return list.ToArray();}
public static RECT WindowRect(IntPtr h){RECT rect;GetWindowRect(h,out rect);return rect;}
public static RECT MonitorRect(IntPtr h){var info=new MONITORINFO();info.cbSize=Marshal.SizeOf(info);GetMonitorInfo(MonitorFromWindow(h,2),ref info);return info.monitor;}
}
'@
$taskServer = $null
$taskApp = $null
try {
  $taskServer = Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList ('"' + (Join-Path $taskScratch 'fixture.cjs') + '"') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskScratch 'server.out') -RedirectStandardError (Join-Path $taskScratch 'server.err')
  for ($try = 0; $try -lt 30; $try++) { try { $ready = Invoke-RestMethod -Uri 'http://127.0.0.1:8803/api/status' -TimeoutSec 1; if ($ready.ok) { break } } catch {}; Start-Sleep -Milliseconds 200 }
  if (-not $ready.ok) { throw 'Isolated native fixture did not start.' }
  $previousWebViewData = $env:WEBVIEW2_USER_DATA_FOLDER
  try { $env:WEBVIEW2_USER_DATA_FOLDER = Join-Path $taskScratch 'webview-profile'; $taskApp = Start-Process -FilePath $taskExe -WindowStyle Hidden -PassThru }
  finally { $env:WEBVIEW2_USER_DATA_FOLDER = $previousWebViewData }
  $playButton = $null
  $buttonCondition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Button)
  for ($try = 0; $try -lt 60 -and -not $playButton; $try++) {
    foreach ($handle in [SARFullscreenWindows]::Windows([uint32]$taskApp.Id)) {
      $element = [System.Windows.Automation.AutomationElement]::FromHandle($handle)
      foreach ($button in $element.FindAll([System.Windows.Automation.TreeScope]::Descendants,$buttonCondition)) {
        if ($button.Current.Name -eq 'PLAY' -and $button.Current.IsEnabled) { $playButton = $button; break }
      }
    }
    if (-not $playButton) { Start-Sleep -Milliseconds 250 }
  }
  if (-not $playButton) { throw 'The native launcher Play control did not become available.' }
  $playButton.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
  $report = $null
  for ($try = 0; $try -lt 80 -and -not $report; $try++) { $report = Invoke-RestMethod -Uri 'http://127.0.0.1:8803/diagnostic' -TimeoutSec 1; if ($report -is [string] -and $report -eq 'null') { $report = $null }; if (-not $report) { Start-Sleep -Milliseconds 250 } }
  if (-not $report -or $report.error -or -not ($report.started -and $report.toggledOff -and $report.toggledOn -and $report.launcherCommandsBlocked -and $report.nativeMarker)) { throw ('Native fullscreen command checks failed: ' + ($report | ConvertTo-Json -Compress)) }
  $windows = @([SARFullscreenWindows]::Windows([uint32]$taskApp.Id) | ForEach-Object { $r=[SARFullscreenWindows]::WindowRect($_); [pscustomobject]@{handle=$_;rect=$r;area=($r.right-$r.left)*($r.bottom-$r.top)} })
  $gameWindow = $windows | Sort-Object area -Descending | Select-Object -First 1
  $monitorRect = [SARFullscreenWindows]::MonitorRect($gameWindow.handle)
  $gameRect = $gameWindow.rect
  if ($gameRect.left -ne $monitorRect.left -or $gameRect.top -ne $monitorRect.top -or $gameRect.right -ne $monitorRect.right -or $gameRect.bottom -ne $monitorRect.bottom) { throw 'The game window does not exactly cover its monitor.' }
  if ((Get-FileHash -LiteralPath $taskSettings -Algorithm SHA256).Hash -ne $settingsDigest) { throw 'The test unexpectedly changed launcher settings.' }
  $result = [pscustomobject]@{ok=$true;verifiedAt=[DateTime]::UtcNow.ToString('o');nativeApp=$taskExe;nativeAppSha256=(Get-FileHash -LiteralPath $taskExe -Algorithm SHA256).Hash.ToLower();checks=$report;windowRect=$gameRect;monitorRect=$monitorRect;launcherSettingsUnchanged=$true;fixtureAccounts=0;fixtureProgressWrites=0}
  [IO.File]::WriteAllText((Join-Path $PSScriptRoot '../fullscreen-results-1.5.2.json'),($result | ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
  Write-Host 'PASS actual native Play window, fullscreen state, enter/exit commands, exact monitor geometry, restricted launcher commands and unchanged settings.'
} catch { Write-Host $_.Exception.ToString(); throw } finally {
  if ($taskApp -and -not $taskApp.HasExited) { Stop-Process -Id $taskApp.Id; $taskApp.WaitForExit(2000) | Out-Null }
  if ($taskServer -and -not $taskServer.HasExited) { Stop-Process -Id $taskServer.Id; $taskServer.WaitForExit(2000) | Out-Null }
  $checkedScratch = [IO.Path]::GetFullPath($taskScratch)
  if ([IO.Path]::GetDirectoryName($checkedScratch) -eq [IO.Path]::GetFullPath($env:TEMP) -and [IO.Path]::GetFileName($checkedScratch).StartsWith('sar-native-fullscreen-')) {
    for ($cleanupTry = 0; $cleanupTry -lt 10 -and (Test-Path -LiteralPath $checkedScratch); $cleanupTry++) { try { Remove-Item -LiteralPath $checkedScratch -Recurse -Force } catch { Start-Sleep -Milliseconds 250 } }
    if (Test-Path -LiteralPath $checkedScratch) { Write-Warning ('The stopped fixture left temporary logs at ' + $checkedScratch) }
  }
}
