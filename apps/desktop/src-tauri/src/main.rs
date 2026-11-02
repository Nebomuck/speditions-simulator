// Native Windows-Hülle des Speditions-Simulators. Die gesamte Spiellogik läuft im eingebetteten
// Web-Frontend (Simulation im Web Worker). Zusätzlich verwaltet die App den mitgelieferten
// Multiplayer-Server (Sidecar): Er wird beim Hosten einer Multiplayer-Firma automatisch gestartet
// und beim Beenden der App sauber gespeichert und gestoppt.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::{TcpListener, UdpSocket};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use tauri::{Manager, RunEvent, State};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

#[derive(Default)]
struct ServerState {
    child: Mutex<Option<CommandChild>>,
    port: Mutex<u16>,
    running: Arc<AtomicBool>,
}

#[derive(Serialize)]
struct ServerInfo {
    port: u16,
    /// "started" = gerade gestartet, "running" = lief bereits, "external" = Port von anderem Prozess belegt
    status: &'static str,
}

#[tauri::command]
async fn start_server(app: tauri::AppHandle, state: State<'_, ServerState>, port: u16) -> Result<ServerInfo, String> {
    if state.running.load(Ordering::SeqCst) {
        return Ok(ServerInfo { port: *state.port.lock().unwrap(), status: "running" });
    }
    // Port prüfen – ist er belegt, läuft dort vermutlich bereits ein Server (z. B. npm run server)
    if TcpListener::bind(("0.0.0.0", port)).is_err() {
        return Ok(ServerInfo { port, status: "external" });
    }
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("server");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let db = dir.join("spedsim.db");

    let (mut rx, child) = app
        .shell()
        .sidecar("spedsim-server")
        .map_err(|e| e.to_string())?
        .args(["--port", &port.to_string(), "--db", &db.to_string_lossy(), "--parent-stdin"])
        .spawn()
        .map_err(|e| format!("Server konnte nicht gestartet werden: {e}"))?;

    let (ready_tx, ready_rx) = std::sync::mpsc::channel::<Result<(), String>>();
    let running = state.running.clone();
    running.store(true, Ordering::SeqCst);
    tauri::async_runtime::spawn(async move {
        let mut ready_tx = Some(ready_tx);
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let text = String::from_utf8_lossy(&line);
                    if text.contains("server_started") {
                        if let Some(tx) = ready_tx.take() {
                            let _ = tx.send(Ok(()));
                        }
                    }
                }
                CommandEvent::Stderr(line) => {
                    let text = String::from_utf8_lossy(&line).to_string();
                    if text.contains("start_failed") {
                        if let Some(tx) = ready_tx.take() {
                            let _ = tx.send(Err(text));
                        }
                    }
                }
                CommandEvent::Terminated(_) => {
                    running.store(false, Ordering::SeqCst);
                    if let Some(tx) = ready_tx.take() {
                        let _ = tx.send(Err("Server wurde unerwartet beendet.".into()));
                    }
                    break;
                }
                _ => {}
            }
        }
    });

    *state.child.lock().unwrap() = Some(child);
    *state.port.lock().unwrap() = port;

    let result = tauri::async_runtime::spawn_blocking(move || ready_rx.recv_timeout(Duration::from_secs(15)))
        .await
        .map_err(|e| e.to_string())?;
    match result {
        Ok(Ok(())) => Ok(ServerInfo { port, status: "started" }),
        Ok(Err(e)) => Err(e),
        Err(_) => Err("Server hat nicht rechtzeitig geantwortet.".into()),
    }
}

/// Server speichern lassen und beenden; wartet bis zu 5 s auf das saubere Ende.
fn shutdown_server(state: &ServerState) {
    let child = state.child.lock().unwrap().take();
    if let Some(mut child) = child {
        let _ = child.write(b"quit\n");
        for _ in 0..50 {
            if !state.running.load(Ordering::SeqCst) {
                return;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        let _ = child.kill();
        state.running.store(false, Ordering::SeqCst);
    }
}

#[tauri::command]
fn stop_server(state: State<'_, ServerState>) {
    shutdown_server(&state);
}

#[tauri::command]
fn server_running(state: State<'_, ServerState>) -> bool {
    state.running.load(Ordering::SeqCst)
}

/// Lokale IP-Adresse im Netzwerk (für die Einladung von Mitspielern im LAN).
/// Der UDP-"connect" sendet keine Daten, er ermittelt nur die ausgehende Schnittstelle.
#[tauri::command]
fn local_address() -> Option<String> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    Some(socket.local_addr().ok()?.ip().to_string())
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(ServerState::default())
        .invoke_handler(tauri::generate_handler![start_server, stop_server, server_running, local_address])
        .build(tauri::generate_context!())
        .expect("Speditions-Simulator konnte nicht gestartet werden");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            shutdown_server(&handle.state::<ServerState>());
        }
    });
}
