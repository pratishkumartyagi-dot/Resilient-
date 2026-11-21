; Resilient Research App - NSIS Installer Customization
; This script runs during installation to customize the installer behavior

!include "MUI2.nsh"

; Custom pages
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE DirectoryPageLeave

; Variables
Var PreviousDirectory

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
