; Public branding is independent of the existing installation and registry key.
; Keep the historical productName so this remains an in-place upgrade.
Caption "Skirmish Arena Setup"
UninstallCaption "Uninstall Skirmish Arena"
Var SarInstalled
!define SAR_INSTALLER_HOOK_DIR "${__FILEDIR__}"

!macro NSIS_HOOK_PREINSTALL
  ; Run before replacing even the launcher: older builds kept node.exe alive
  ; and NSIS could otherwise stop with a mixture of two game releases.
  InitPluginsDir
  File /oname=$PLUGINSDIR\sar-installer-preflight.ps1 "${SAR_INSTALLER_HOOK_DIR}\installer-preflight.ps1"
  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "$PLUGINSDIR\sar-installer-preflight.ps1" -InstallDirectory "$INSTDIR"'
  Pop $0
  Pop $1
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "Skirmish could not release its local service for this update. No application files were replaced. Close other game windows and retry. Details: installer-startup.log in LocalAppData\\SkirmishArenaServer."
    Abort
  ${EndIf}
!macroend

!macro SarRenameOwnedShortcut directory
  !insertmacro IsShortcutTarget "${directory}\Skirmish Arena Reimagined.lnk" "$INSTDIR\skirmish-launcher.exe"
  Pop $0
  ${If} $0 = 1
    ${If} ${FileExists} "${directory}\Skirmish Arena.lnk"
      !insertmacro IsShortcutTarget "${directory}\Skirmish Arena.lnk" "$INSTDIR\skirmish-launcher.exe"
      Pop $0
      ${If} $0 = 1
        Delete "${directory}\Skirmish Arena Reimagined.lnk"
      ${EndIf}
    ${Else}
      Rename "${directory}\Skirmish Arena Reimagined.lnk" "${directory}\Skirmish Arena.lnk"
    ${EndIf}
  ${EndIf}
!macroend

!macro SarRemoveOwnedShortcut directory
  !insertmacro IsShortcutTarget "${directory}\Skirmish Arena.lnk" "$INSTDIR\skirmish-launcher.exe"
  Pop $0
  ${If} $0 = 1
    !insertmacro UnpinShortcut "${directory}\Skirmish Arena.lnk"
    Delete "${directory}\Skirmish Arena.lnk"
  ${EndIf}
!macroend

Function SarBrandShortcuts
  ; The preserved NSIS config places shortcuts directly in Programs/Desktop.
  !insertmacro SarRenameOwnedShortcut "$SMPROGRAMS"
  !insertmacro SarRenameOwnedShortcut "$DESKTOP"
FunctionEnd

Function .onGUIEnd
  ; Interactive setup can create its optional desktop shortcut on the final
  ; page, after POSTINSTALL. A cancelled setup must not change existing links.
  ${If} $SarInstalled = 1
    Call SarBrandShortcuts
  ${EndIf}
FunctionEnd

!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr SHCTX "${UNINSTKEY}" "DisplayName" "Skirmish Arena"
  StrCpy $SarInstalled 1
  Call SarBrandShortcuts
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; Update mode retains the existing shortcuts for the incoming installation.
  ${If} $UpdateMode != 1
    !insertmacro SarRemoveOwnedShortcut "$SMPROGRAMS"
    !insertmacro SarRemoveOwnedShortcut "$DESKTOP"
  ${EndIf}
!macroend
