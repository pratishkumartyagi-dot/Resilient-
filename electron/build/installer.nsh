; Resilient Research App - NSIS Installer Customization
; This script runs during installation to customize the installer behavior

!include "MUI2.nsh"

; Custom pages
!define MUI_PAGE_CUSTOMFUNCTION_PRE WelcomePagePre
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE DirectoryPageLeave

; Variables
Var PreviousDirectory

; Welcome page - show additional info
Function WelcomePagePre
  ; Set window title
  !insertmacro MUI_SETWINDOWTITLE "Welcome to Resilient Research App Setup"
FunctionEnd

; Directory page - validate directory
Function DirectoryPageLeave
  ; Store the selected directory for later use
  Push $INSTDIR
  Pop $PreviousDirectory
FunctionEnd

; Custom installation section
Section "AdditionalTasks" SecAdditionalTasks
  ; This section runs after main installation
  DetailPrint "Configuring Resilient Research App..."

  ; Create start menu folder
  CreateDirectory "$SMPROGRAMS\Resilient Research App"

  ; Create uninstaller shortcut
  CreateShortCut "$SMPROGRAMS\Resilient Research App\Uninstall.lnk" "$INSTDIR\uninstall.exe" "" "$INSTDIR\uninstall.exe" 0

  ; Create application shortcut
  CreateShortCut "$SMPROGRAMS\Resilient Research App\Resilient Research App.lnk" "$INSTDIR\Resilient Research App.exe" "" "$INSTDIR\Resilient Research App.exe" 0

  ; Create desktop shortcut if requested
  ReadINIStr $0 "$INSTDIR\settings.ini" "Shortcuts" "Desktop"
  StrCmp $0 "1" CreateDesktopShortcut NoDesktopShortcut
CreateDesktopShortcut:
  CreateShortCut "$DESKTOP\Resilient Research App.lnk" "$INSTDIR\Resilient Research App.exe" "" "$INSTDIR\Resilient Research App.exe" 0
NoDesktopShortcut:

SectionEnd

; Function to check if app is running
Function IsAppRunning
  Push $0
  Push $1
  FindWindow $0 "Resilient Research App" $1
  StrCmp $0 0 NotRunning
  ; App is running
  Push "1"
  Pop $0
  Goto Done
NotRunning:
  Push "0"
  Pop $0
Done:
  Exch $1
FunctionEnd

; Pre-uninstall: check if app is running
Function un.onInit
  Call IsAppRunning
  Pop $0
  StrCmp $0 "1" AppRunning NotRunning
AppRunning:
  MessageBox MB_OK|MB_ICONEXCLAMATION "Resilient Research App is currently running. Please close it before uninstalling." IDOK
  Abort
NotRunning:
FunctionEnd

; Post-uninstall: clean up
Function un.onUninstSuccess
  ; Remove start menu folder
  RMDir /r "$SMPROGRAMS\Resilient Research App"
  
  ; Remove desktop shortcut
  Delete "$DESKTOP\Resilient Research App.lnk"
  
  ; Remove installation directory if empty
  RMDir "$INSTDIR"
FunctionEnd