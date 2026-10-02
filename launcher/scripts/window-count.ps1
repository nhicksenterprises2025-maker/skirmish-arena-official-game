param([Parameter(Mandatory=$true)][string]$ExecutablePath)
$ErrorActionPreference='Stop'
$taskPath=(Resolve-Path -LiteralPath $ExecutablePath).Path
$taskProcess=Get-CimInstance Win32_Process -Filter "Name='skirmish-launcher.exe'" | Where-Object { $_.ExecutablePath -eq $taskPath }
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class SkirmishTestWindows {
  public delegate bool WindowCallback(IntPtr handle, IntPtr extra);
  [DllImport("user32.dll")] static extern bool EnumWindows(WindowCallback callback, IntPtr extra);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr handle, out uint process);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr handle);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowTextLength(IntPtr handle);
  public static int Count(uint process) {
    int count=0;
    EnumWindows((handle, extra)=>{uint owner;GetWindowThreadProcessId(handle,out owner);if(owner==process&&IsWindowVisible(handle)&&GetWindowTextLength(handle)>0)count++;return true;},IntPtr.Zero);
    return count;
  }
}
'@
$rows=@($taskProcess | ForEach-Object { @{id=$_.ProcessId;windows=[SkirmishTestWindows]::Count([uint32]$_.ProcessId)} })
ConvertTo-Json -InputObject $rows -Compress
