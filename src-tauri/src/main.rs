// Voltline's desktop shell: a native window around the web build in ../dist.
// The game is a pure web app, so there are no plugins and no IPC commands.

// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Voltline");
}
