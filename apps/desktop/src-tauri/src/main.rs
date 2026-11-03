// Native Windows-Hülle von Cargovia (früher „Speditions-Simulator“). Die gesamte Spiellogik läuft im eingebetteten
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

/// Cloudflare Quick Tunnel: macht den lokalen Server ohne Portfreigabe aus dem Internet erreichbar.
#[derive(Default)]
struct TunnelState {
    child: Mutex<Option<CommandChild>>,
    url: Arc<Mutex<Option<String>>>,
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

/// Tunnel zum lokalen Server öffnen und die öffentliche https-Adresse liefern
/// (wartet, bis die erste Tunnelverbindung registriert ist).
#[tauri::command]
async fn start_tunnel(app: tauri::AppHandle, state: State<'_, TunnelState>, port: u16) -> Result<String, String> {
    if let Some(url) = state.url.lock().unwrap().clone() {
        return Ok(url);
    }
    stop_tunnel_inner(&state);
    let (mut rx, child) = app
        .shell()
        .sidecar("cloudflared")
        .map_err(|e| e.to_string())?
        .args(["tunnel", "--no-autoupdate", "--url", &format!("http://127.0.0.1:{port}")])
        .spawn()
        .map_err(|e| format!("Tunnel konnte nicht gestartet werden: {e}"))?;
    *state.child.lock().unwrap() = Some(child);

    let (ready_tx, ready_rx) = std::sync::mpsc::channel::<Result<String, String>>();
    let shared_url = state.url.clone();
    tauri::async_runtime::spawn(async move {
        let mut ready_tx = Some(ready_tx);
        let mut found: Option<String> = None;
        while let Some(event) = rx.recv().await {
            match event {
                // cloudflared schreibt sein Protokoll auf stderr
                CommandEvent::Stderr(line) | CommandEvent::Stdout(line) => {
                    let text = String::from_utf8_lossy(&line);
                    if found.is_none() {
                        if let Some(start) = text.find("https://") {
                            let rest = &text[start..];
                            let end = rest.find(|c: char| !(c.is_ascii_alphanumeric() || c == '-' || c == '.' || c == ':' || c == '/')).unwrap_or(rest.len());
                            if rest[..end].ends_with(".trycloudflare.com") {
                                found = Some(rest[..end].to_string());
                            }
                        }
                    }
                    if text.contains("Registered tunnel connection") {
                        if let (Some(url), Some(tx)) = (found.clone(), ready_tx.take()) {
                            *shared_url.lock().unwrap() = Some(url.clone());
                            let _ = tx.send(Ok(url));
                        }
                    }
                }
                CommandEvent::Terminated(_) => {
                    *shared_url.lock().unwrap() = None;
                    if let Some(tx) = ready_tx.take() {
                        let _ = tx.send(Err("Tunnel wurde unerwartet beendet.".into()));
                    }
                    break;
                }
                _ => {}
            }
        }
    });

    let result = tauri::async_runtime::spawn_blocking(move || ready_rx.recv_timeout(Duration::from_secs(45)))
        .await
        .map_err(|e| e.to_string())?;
    match result {
        Ok(r) => r,
        Err(_) => {
            stop_tunnel_inner(&state);
            Err("Keine Verbindung zu Cloudflare (Internetverbindung oder Firewall prüfen).".into())
        }
    }
}

fn stop_tunnel_inner(state: &TunnelState) {
    if let Some(child) = state.child.lock().unwrap().take() {
        let _ = child.kill();
    }
    *state.url.lock().unwrap() = None;
}

#[tauri::command]
fn stop_tunnel(state: State<'_, TunnelState>) {
    stop_tunnel_inner(&state);
}

#[tauri::command]
fn tunnel_url(state: State<'_, TunnelState>) -> Option<String> {
    state.url.lock().unwrap().clone()
}

/// Lokale IP-Adresse im Netzwerk (für die Einladung von Mitspielern im LAN).
/// Der UDP-"connect" sendet keine Daten, er ermittelt nur die ausgehende Schnittstelle.
#[tauri::command]
fn local_address() -> Option<String> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    Some(socket.local_addr().ok()?.ip().to_string())
}

/// Updater: das Update immer in den Ordner des laufenden Programms installieren.
/// Ohne Vorgabe wählt der Installer im Update-Modus u. U. den Standardordner (%LOCALAPPDATA%\Cargovia),
/// dann laufen zwei Installationen nebeneinander und die alte Verknüpfung startet weiter die alte Version.
/// NSIS erwartet `/D=` als letztes Argument und ohne Anführungszeichen (auch bei Leerzeichen im Pfad).
fn updater_plugin() -> tauri::plugin::TauriPlugin<tauri::Wry, tauri_plugin_updater::Config> {
    let builder = tauri_plugin_updater::Builder::new();
    match std::env::current_exe().ok().and_then(|exe| exe.parent().map(|dir| dir.to_path_buf())) {
        Some(dir) => builder.installer_arg(format!("/D={}", dir.display())).build(),
        None => builder.build(),
    }
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(updater_plugin())
        .plugin(tauri_plugin_process::init())
        .manage(ServerState::default())
        .manage(TunnelState::default())
        .invoke_handler(tauri::generate_handler![
            start_server,
            stop_server,
            server_running,
            local_address,
            start_tunnel,
            stop_tunnel,
            tunnel_url
        ])
        .build(tauri::generate_context!())
        .expect("Cargovia konnte nicht gestartet werden");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            stop_tunnel_inner(&handle.state::<TunnelState>());
            shutdown_server(&handle.state::<ServerState>());
        }
    });
}
