// Native Windows-Hülle des Speditions-Simulators. Die gesamte Spiellogik läuft im eingebetteten
// Web-Frontend (Simulation im Web Worker); Tauri stellt Fenster, Installation und Dateizugriff bereit.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("Speditions-Simulator konnte nicht gestartet werden");
}
