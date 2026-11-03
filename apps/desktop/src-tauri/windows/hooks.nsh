; Installer-Erweiterungen für Cargovia.
;
; Umbenennung (0.7.0): Das Spiel hieß bis 0.6.0 „Speditions-Simulator“ und lag in einem eigenen
; Installationsordner mit eigenem Startmenü-Eintrag. Vor der Installation wird diese alte Installation
; still deinstalliert. Spielstände und Einstellungen bleiben erhalten – sie liegen unter der
; unveränderten App-ID (de.spedsim.desktop), und die stille Deinstallation löscht keine App-Daten.
;
; Beim Update (ohne Verzeichnisauswahl) landet Cargovia neben dem alten Ordner, z. B.
; E:\Spiele\Speditions-Simulator → E:\Spiele\Cargovia, statt im Standardordner unter %LOCALAPPDATA%.
; Im Update-Modus legt der Tauri-Installer keine neuen Verknüpfungen an; vorhandene alte
; Verknüpfungen (Startmenü, Desktop) werden deshalb hier als „Cargovia“ neu angelegt.

;
; Update-Ziel (0.13.2): Bis 0.11.0 übergab die laufende App dem Installer keinen Zielordner. Der
; Installer fiel dann teils auf %LOCALAPPDATA%\Cargovia zurück, während Verknüpfungen weiter die alte
; Version (z. B. E:\Spiele\Cargovia) starteten. Diese alten Versionen installieren auch jedes weitere
; Update falsch. Deshalb prüft der Installer selbst: Im Update-Modus gilt der Ordner, auf den die
; Desktop- oder Startmenü-Verknüpfung zeigt. Eine Fehlinstallation im Standardordner wird entfernt.

!define OLD_PRODUCTNAME "Speditions-Simulator"
!define OLD_UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${OLD_PRODUCTNAME}"

Var OldStartMenuLnk
Var OldDesktopLnk

; Ziel einer Verknüpfung nach $R9 ("" wenn nicht vorhanden oder nicht lesbar); verändert $0–$2
!macro CargoviaShortcutTarget shortcut
  StrCpy $R9 ""
  ${If} ${FileExists} "${shortcut}"
    !insertmacro ComHlpr_CreateInProcInstance ${CLSID_ShellLink} ${IID_IShellLink} r0 ""
    ${If} $0 P<> 0
      ${IUnknown::QueryInterface} $0 '("${IID_IPersistFile}", .r1)'
      ${If} $1 P<> 0
        ${IPersistFile::Load} $1 '("${shortcut}", ${STGM_READ})'
        ${IShellLink::GetPath} $0 '(.r2, ${MAX_PATH}, 0, ${SLGP_RAWPATH})'
        StrCpy $R9 $2
        ${IUnknown::Release} $1 ""
      ${EndIf}
      ${IUnknown::Release} $0 ""
    ${EndIf}
  ${EndIf}
!macroend

!macro CargoviaUpdateTarget
  ${If} $UpdateMode = 1
    Push $0
    Push $1
    Push $2
    StrCpy $R8 ""
    !insertmacro CargoviaShortcutTarget "$DESKTOP\${PRODUCTNAME}.lnk"
    ${If} $R9 == ""
      !insertmacro CargoviaShortcutTarget "$SMPROGRAMS\${PRODUCTNAME}.lnk"
    ${EndIf}
    ${If} $R9 != ""
      ${GetFileName} $R9 $R7
      ${If} $R7 == "${MAINBINARYNAME}.exe"
      ${AndIf} ${FileExists} $R9
        ${GetParent} $R9 $R8
      ${EndIf}
    ${EndIf}
    ${If} $R8 != ""
    ${AndIf} $R8 != $INSTDIR
      StrCpy $R6 $INSTDIR
      StrCpy $INSTDIR $R8
      SetOutPath $INSTDIR
      DetailPrint "Update in den Ordner der Verknüpfung: $INSTDIR"
      ; Fehlinstallation früherer Updates im Standardordner entfernen
      ${If} $R6 == "$LOCALAPPDATA\${PRODUCTNAME}"
        Delete "$R6\${MAINBINARYNAME}.exe"
        Delete "$R6\spedsim-server.exe"
        Delete "$R6\cloudflared.exe"
        Delete "$R6\uninstall.exe"
        RMDir "$R6"
      ${EndIf}
    ${EndIf}
    Pop $2
    Pop $1
    Pop $0
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro CargoviaUpdateTarget
  StrCpy $OldStartMenuLnk 0
  StrCpy $OldDesktopLnk 0
  ReadRegStr $R1 HKCU "${OLD_UNINSTKEY}" "UninstallString"
  ReadRegStr $R2 HKCU "${OLD_UNINSTKEY}" "InstallLocation"
  ${If} $R1 != ""
  ${AndIf} $R2 != ""
    ; InstallLocation ist in Anführungszeichen gespeichert
    StrCpy $R2 $R2 -1 1
    ; Update/stille Installation: bisherigen Speicherort übernehmen (nur, wenn Cargovia noch nicht installiert ist)
    ReadRegStr $R3 SHCTX "${MANUPRODUCTKEY}" ""
    ${If} $R3 == ""
      ${If} $UpdateMode = 1
      ${OrIf} $PassiveMode = 1
      ${OrIf} ${Silent}
        ${GetParent} $R2 $R4
        ${If} $R4 != ""
          StrCpy $R5 $INSTDIR
          StrCpy $INSTDIR "$R4\${PRODUCTNAME}"
          SetOutPath $INSTDIR
          ; leeren Standardordner wieder entfernen (RMDir ohne /r löscht nur leere Ordner)
          RMDir $R5
        ${EndIf}
      ${EndIf}
    ${EndIf}
    ${If} ${FileExists} "$SMPROGRAMS\${OLD_PRODUCTNAME}.lnk"
      StrCpy $OldStartMenuLnk 1
    ${EndIf}
    ${If} ${FileExists} "$DESKTOP\${OLD_PRODUCTNAME}.lnk"
      StrCpy $OldDesktopLnk 1
    ${EndIf}
    DetailPrint "Entferne alte Installation „${OLD_PRODUCTNAME}“ ($R2)"
    ExecWait '$R1 /S _?=$R2'
    Delete "$R2\uninstall.exe"
    RMDir "$R2"
    DeleteRegKey HKCU "${OLD_UNINSTKEY}"
    ; falls die Deinstallation Verknüpfungen übrig gelassen hat
    Delete "$SMPROGRAMS\${OLD_PRODUCTNAME}.lnk"
    Delete "$DESKTOP\${OLD_PRODUCTNAME}.lnk"
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ${If} $OldStartMenuLnk = 1
  ${AndIfNot} ${FileExists} "$SMPROGRAMS\${PRODUCTNAME}.lnk"
    CreateShortcut "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    !insertmacro SetLnkAppUserModelId "$SMPROGRAMS\${PRODUCTNAME}.lnk"
  ${EndIf}
  ${If} $OldDesktopLnk = 1
  ${AndIfNot} ${FileExists} "$DESKTOP\${PRODUCTNAME}.lnk"
    CreateShortcut "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    !insertmacro SetLnkAppUserModelId "$DESKTOP\${PRODUCTNAME}.lnk"
  ${EndIf}
!macroend
