; Installer-Erweiterungen für Cargovia.
;
; Umbenennung (0.7.0): Das Spiel hieß bis 0.6.0 „Speditions-Simulator“ und lag in einem eigenen
; Installationsordner mit eigenem Startmenü-Eintrag. Vor der Installation wird diese alte Installation
; still deinstalliert. Spielstände und Einstellungen bleiben erhalten – sie liegen unter der
; unveränderten App-ID (de.spedsim.desktop), und die stille Deinstallation löscht keine App-Daten.

!define OLD_UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\Speditions-Simulator"

!macro NSIS_HOOK_PREINSTALL
  ReadRegStr $R1 HKCU "${OLD_UNINSTKEY}" "UninstallString"
  ReadRegStr $R2 HKCU "${OLD_UNINSTKEY}" "InstallLocation"
  ${If} $R1 != ""
  ${AndIf} $R2 != ""
    ; InstallLocation ist in Anführungszeichen gespeichert
    StrCpy $R2 $R2 -1 1
    DetailPrint "Entferne alte Installation „Speditions-Simulator“ ($R2)"
    ExecWait '$R1 /S _?=$R2'
    Delete "$R2\uninstall.exe"
    RMDir "$R2"
    DeleteRegKey HKCU "${OLD_UNINSTKEY}"
  ${EndIf}
!macroend
