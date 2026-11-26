use std::sync::Mutex;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, State, WindowEvent,
};
use tauri_plugin_global_shortcut::ShortcutState;
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

struct EngineChild(pub Mutex<Option<CommandChild>>);

struct TrayHandle(pub Mutex<Option<TrayIcon>>);

fn toggle_main(app: &tauri::AppHandle) {
    let Some(win) = app.get_webview_window("main") else {
        return;
    };
    if win.is_visible().unwrap_or(true) {
        let _ = win.hide();
    } else {
        let _ = win.show();
        let _ = win.set_focus();
    }
}

fn stop_sidecar(app: &tauri::AppHandle) {
    if let Some(child_state) = app.try_state::<EngineChild>() {
        if let Ok(mut guard) = child_state.0.lock() {
            if let Some(child) = guard.take() {
                let _ = child.kill();
            }
        }
    }
}

#[tauri::command]
fn notify_signal(
    app: tauri::AppHandle,
    title: String,
    body: String,
    symbol: String,
) -> Result<(), String> {
    app.notification()
        .builder()
        .title(&title)
        .body(&body)
        .show()
        .map_err(|e| e.to_string())?;
    if !symbol.is_empty() {
        if let Some(win) = app.get_webview_window("main") {
            let _ = win.emit("navigate-symbol", symbol);
        }
    }
    Ok(())
}

#[tauri::command]
fn focus_main_window(app: tauri::AppHandle, symbol: String) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        win.show().map_err(|e| e.to_string())?;
        win.set_focus().map_err(|e| e.to_string())?;
        if !symbol.is_empty() {
            let _ = win.emit("navigate-symbol", symbol);
        }
    }
    if let Some(mini) = app.get_webview_window("mini-ticker") {
        let _ = mini.hide();
    }
    Ok(())
}

#[tauri::command]
fn toggle_mini_ticker(app: tauri::AppHandle, show: bool) -> Result<(), String> {
    let Some(mini) = app.get_webview_window("mini-ticker") else {
        return Ok(());
    };
    if show {
        mini.show().map_err(|e| e.to_string())?;
        let _ = mini.set_always_on_top(true);
        let _ = mini.set_focus();
    } else {
        mini.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn open_signals_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("signals") {
        win.show().map_err(|e| e.to_string())?;
        win.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }
    Err("signals window missing".into())
}

#[tauri::command]
fn update_tray_tooltip(
    tray_state: State<'_, TrayHandle>,
    tooltip: String,
) -> Result<(), String> {
    let guard = tray_state.0.lock().map_err(|e| e.to_string())?;
    if let Some(tray) = guard.as_ref() {
        tray.set_tooltip(Some(&tooltip))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcuts(["Alt+Q"])
                .expect("register Alt+Q")
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        toggle_main(app);
                    }
                })
                .build(),
        )
        .manage(EngineChild(Mutex::new(None)))
        .manage(TrayHandle(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            notify_signal,
            focus_main_window,
            toggle_mini_ticker,
            update_tray_tooltip,
            open_signals_window,
        ])
        .setup(|app| {
            #[cfg(desktop)]
            {
                let sidecar = app.shell().sidecar("quantlens-engine");
                if let Ok(cmd) = sidecar {
                    if let Ok((_rx, child)) = cmd.spawn() {
                        if let Some(state) = app.try_state::<EngineChild>() {
                            if let Ok(mut guard) = state.0.lock() {
                                *guard = Some(child);
                            }
                        }
                    }
                }
            }

            if let Some(win) = app.get_webview_window("main") {
                let handle = app.handle().clone();
                win.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        if let Some(w) = handle.get_webview_window("main") {
                            let _ = w.hide();
                        }
                    }
                });
            }

            #[cfg(desktop)]
            {
                let show_i = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
                let mini_i = MenuItem::with_id(app, "mini", "迷你看盘", true, None::<&str>)?;
                let quit_i = MenuItem::with_id(app, "quit", "退出 QuantLens", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&show_i, &mini_i, &quit_i])?;
                if let Some(icon) = app.default_window_icon().cloned() {
                    let handle = app.handle().clone();
                    let tray = TrayIconBuilder::new()
                        .icon(icon)
                        .menu(&menu)
                        .tooltip("QuantLens")
                        .on_menu_event(move |app, event| match event.id.as_ref() {
                            "show" => {
                                if let Some(w) = app.get_webview_window("main") {
                                    let _ = w.show();
                                    let _ = w.set_focus();
                                }
                            }
                            "mini" => {
                                let _ = toggle_mini_ticker(handle.clone(), true);
                            }
                            "quit" => {
                                stop_sidecar(&app);
                                app.exit(0);
                            }
                            _ => {}
                        })
                        .on_tray_icon_event(|tray, event| {
                            if let TrayIconEvent::Click {
                                button: MouseButton::Left,
                                button_state: MouseButtonState::Up,
                                ..
                            } = event
                            {
                                toggle_main(tray.app_handle());
                            }
                        })
                        .build(app)?;
                    if let Some(tray_state) = app.try_state::<TrayHandle>() {
                        if let Ok(mut guard) = tray_state.0.lock() {
                            *guard = Some(tray);
                        }
                    }
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running QuantLens");
}