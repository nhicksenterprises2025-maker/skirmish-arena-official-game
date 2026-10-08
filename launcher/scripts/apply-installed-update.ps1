param(
  [switch]$VerifyOnly,
  [string]$PreviousVersion,
  [string]$CandidateDirectory,
  [string]$ManifestPath,
  [string]$InstallerPath,
  [string]$PortableExePath,
  [string]$ReportPath,
  [switch]$ValidateArtifactsOnly
)
$ErrorActionPreference = 'Stop'
$taskLauncherRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ($VerifyOnly -and $ValidateArtifactsOnly) { throw 'Choose VerifyOnly or ValidateArtifactsOnly, not both.' }
$taskCandidateRoot = if ($CandidateDirectory) { [IO.Path]::GetFullPath($CandidateDirectory) } else { $null }
$taskManifestPath = if ($ManifestPath) { [IO.Path]::GetFullPath($ManifestPath) } elseif ($taskCandidateRoot) { Join-Path $taskCandidateRoot 'update.json' } else { Join-Path $taskLauncherRoot '../server/releases/update.json' }
$taskManifest = Get-Content -LiteralPath $taskManifestPath -Raw | ConvertFrom-Json
$taskVersion = $taskManifest.version
$taskInstallerName = [Uri]::UnescapeDataString(([Uri]$taskManifest.platforms.'windows-x86_64'.url).Segments[-1])
if (-not $taskVersion -or -not $taskInstallerName -or [IO.Path]::GetFileName($taskInstallerName) -ne $taskInstallerName -or $taskInstallerName.Contains('/') -or $taskInstallerName.Contains('\')) { throw 'The release manifest has an invalid version or artifact filename.' }
$taskInstaller = if ($InstallerPath) { [IO.Path]::GetFullPath($InstallerPath) } elseif ($taskCandidateRoot) { Join-Path $taskCandidateRoot $taskInstallerName } else { Join-Path $taskLauncherRoot ('dist/' + $taskInstallerName) }
$taskPortableExe = if ($PortableExePath) { [IO.Path]::GetFullPath($PortableExePath) } elseif ($taskCandidateRoot) { Join-Path $taskCandidateRoot 'skirmish-launcher.exe' } else { Join-Path $taskLauncherRoot 'dist/skirmish-launcher.exe' }
$taskReportPath = if ($ReportPath) { [IO.Path]::GetFullPath($ReportPath) } elseif ($taskCandidateRoot) { Join-Path $taskCandidateRoot 'installed-update-results.json' } else { Join-Path $taskLauncherRoot 'installed-update-results-1.5.2.json' }
function Write-UpdateReport($Value) {
  [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($taskReportPath)) | Out-Null
  [IO.File]::WriteAllText($taskReportPath,($Value | ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
}
$taskInstalledExe = Join-Path $env:LOCALAPPDATA 'Skirmish Arena Reimagined/skirmish-launcher.exe'
$taskSettingsFile = Join-Path $env:APPDATA 'com.skirmisharena.launcher/launcher-settings.json'
if ((Get-FileHash -LiteralPath $taskInstaller -Algorithm SHA256).Hash.ToLower() -ne $taskManifest.platforms.'windows-x86_64'.sha256) { throw 'The installer does not match the verified release checksum.' }
if ((Get-Item -LiteralPath $taskInstaller).Length -ne $taskManifest.platforms.'windows-x86_64'.size) { throw 'The installer does not match the verified release byte count.' }
if (-not (Test-Path -LiteralPath $taskPortableExe -PathType Leaf)) { throw 'The tested portable executable is missing. Supply PortableExePath for a private candidate.' }
if ($ValidateArtifactsOnly) {
  Write-UpdateReport ([pscustomobject]@{ok=$true;artifactValidationOnly=$true;verifiedAt=[DateTime]::UtcNow.ToString('o');version=$taskVersion;manifest=$taskManifestPath;installer=$taskInstaller;portableExe=$taskPortableExe;installerSha256=$taskManifest.platforms.'windows-x86_64'.sha256;installerBytes=$taskManifest.platforms.'windows-x86_64'.size;installedGameAccessed=$false;installationChanged=$false;gameDatabaseAccessed=$false})
  Write-Host ('PASS candidate artifact paths, installer checksum and byte count for ' + $taskVersion + '. Installation was not accessed.')
  return
}
if (Get-CimInstance Win32_Process -Filter "Name='skirmish-launcher.exe'") { throw 'A launcher is running. Close it before applying this installed update.' }
$taskBeforeVersion = (Get-Item -LiteralPath $taskInstalledExe).VersionInfo.ProductVersion
if ($VerifyOnly -and $PreviousVersion) { $taskBeforeVersion = $PreviousVersion }
$taskBeforeSettingsHash = (Get-FileHash -LiteralPath $taskSettingsFile -Algorithm SHA256).Hash
$taskShortcutShell = New-Object -ComObject WScript.Shell
function Get-LauncherShortcuts {
  $taskDirectories = @([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('Programs'))
  $taskFiles = foreach ($taskDirectory in $taskDirectories) { & rg --files --hidden -g '*Skirmish*.lnk' $taskDirectory }
  foreach ($taskFile in $taskFiles) {
    $taskLink = $taskShortcutShell.CreateShortcut($taskFile)
    [pscustomobject]@{path=$taskFile;target=$taskLink.TargetPath;arguments=$taskLink.Arguments;targetExists=(Test-Path -LiteralPath $taskLink.TargetPath)}
  }
}
$taskBeforeShortcuts = @(Get-LauncherShortcuts)
$taskInstallProcess = $null
if (-not $VerifyOnly) { $taskInstallProcess = Start-Process -FilePath $taskInstaller -ArgumentList '/S' -WindowStyle Hidden -Wait -PassThru; if ($taskInstallProcess.ExitCode -ne 0) { throw ('The installer exited with code ' + $taskInstallProcess.ExitCode) } }
$taskAfterVersion = (Get-Item -LiteralPath $taskInstalledExe).VersionInfo.ProductVersion
if ($taskAfterVersion -ne $taskVersion) { throw ('Installed version is ' + $taskAfterVersion + ', expected ' + $taskVersion) }
$taskAfterSettingsHash = (Get-FileHash -LiteralPath $taskSettingsFile -Algorithm SHA256).Hash
if ($taskAfterSettingsHash -ne $taskBeforeSettingsHash) { throw 'The installer changed launcher connection settings.' }
$taskInstalledHash = (Get-FileHash -LiteralPath $taskInstalledExe -Algorithm SHA256).Hash.ToLower()
$taskBinaryCheck = & node (Join-Path $PSScriptRoot 'check-installed-binary.cjs') $taskInstalledExe $taskPortableExe
if ($LASTEXITCODE -ne 0) { throw 'Installed executable differs from the tested code beyond Tauri NSIS packaging.' }
$taskBinaryResult = $taskBinaryCheck | ConvertFrom-Json
$taskAfterShortcuts = @(Get-LauncherShortcuts)
foreach ($taskBeforeShortcut in $taskBeforeShortcuts) {
  $taskAfterShortcut = $taskAfterShortcuts | Where-Object { $_.path -eq $taskBeforeShortcut.path } | Select-Object -First 1
  if (-not $taskAfterShortcut -or -not $taskAfterShortcut.targetExists -or $taskAfterShortcut.target -ne $taskBeforeShortcut.target -or $taskAfterShortcut.arguments -ne $taskBeforeShortcut.arguments) { throw ('The existing shortcut changed or no longer works: ' + $taskBeforeShortcut.path) }
}
$taskResult = [pscustomobject]@{ok=$true;verifiedAt=[DateTime]::UtcNow.ToString('o');fromVersion=$taskBeforeVersion;toVersion=$taskAfterVersion;manifest=$taskManifestPath;installer=$taskInstaller;portableExe=$taskPortableExe;installedExe=$taskInstalledExe;installedExeSha256=$taskInstalledHash;postInstallVerificationOnly=[bool]$VerifyOnly;installerExitCode=if($taskInstallProcess){$taskInstallProcess.ExitCode}else{$null};binaryVerification=$taskBinaryResult;settingsSha256=$taskAfterSettingsHash.ToLower();launcherSettingsUnchanged=$true;beforeShortcuts=$taskBeforeShortcuts;afterShortcuts=$taskAfterShortcuts;gameDatabaseAccessed=$false;gameServerChanged=$false}
Write-UpdateReport $taskResult
Write-Host ('PASS installed launcher update ' + $taskBeforeVersion + ' -> ' + $taskAfterVersion + ', executable checksum, unchanged settings and preserved shortcut targets.')
