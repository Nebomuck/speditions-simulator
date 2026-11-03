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

!define OLD_PRODUCTNAME "Speditions-Simulator"
!define OLD_UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${OLD_PRODUCTNAME}"

Var OldStartMenuLnk
Var OldDesktopLnk

!macro NSIS_HOOK_PREINSTALL
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
