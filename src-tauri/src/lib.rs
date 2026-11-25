use tauri::Manager;
use tauri_plugin_shell::ShellExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            #[cfg(desktop)]
            {
                let sidecar = app.shell().sidecar("quantlens-engine");
                if let Ok(cmd) = sidecar {
                    let _child = cmd.spawn();
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running QuantLens");
}