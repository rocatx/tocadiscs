use tauri::{AppHandle, LogicalSize, Manager, Size, WebviewWindow};
use std::sync::Mutex;

struct OriginalSize(Mutex<(f64, f64)>);

#[tauri::command]
fn enter_mini_mode(app: AppHandle, state: tauri::State<OriginalSize>) -> Result<(), String> {
    let window: WebviewWindow = app.get_webview_window("main").ok_or("No main window")?;

    if let Ok(size) = window.outer_size() {
        let mut original = state.0.lock().unwrap();
        *original = (size.width as f64, size.height as f64);
    }

    window.set_min_size(Some(Size::Logical(LogicalSize::new(340.0, 140.0)))).map_err(|e| e.to_string())?;
    window.set_size(Size::Logical(LogicalSize::new(340.0, 140.0))).map_err(|e| e.to_string())?;
    window.set_always_on_top(true).map_err(|e| e.to_string())?;
    window.set_resizable(false).map_err(|e| e.to_string())?;
    // Finestra sense decoracions per poder moure-la lliurement
    window.set_decorations(false).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn exit_mini_mode(app: tauri::AppHandle, state: tauri::State<OriginalSize>) -> Result<(), String> {
    let window: WebviewWindow = app.get_webview_window("main").ok_or("No main window")?;
    let original = state.0.lock().unwrap();

    // Restaurar decoracions de la finestra
    window.set_decorations(true).map_err(|e| e.to_string())?;
    window.set_always_on_top(false).map_err(|e| e.to_string())?;
    window.set_resizable(true).map_err(|e| e.to_string())?;
    window.set_min_size(Some(Size::Logical(LogicalSize::new(400.0, 600.0)))).map_err(|e| e.to_string())?;
    
    // Si la mida original és massa gran o no és vàlida (ex: 0), usem una mida per defecte
    let mut target_w = original.0;
    let mut target_h = original.1;
    
    if target_w < 400.0 || target_w > 1200.0 { target_w = 1000.0; }
    if target_h < 600.0 || target_h > 900.0 { target_h = 800.0; }

    window.set_size(Size::Logical(LogicalSize::new(target_w, target_h))).map_err(|e| e.to_string())?;
    
    // Centrar la finestra per evitar que quedi fora de pantalla
    window.center().map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn resize_mini_mode(app: AppHandle, expanded: bool) -> Result<(), String> {
    let window: WebviewWindow = app.get_webview_window("main").ok_or("No main window")?;
    let height = if expanded { 280.0 } else { 140.0 };
    window.set_size(Size::Logical(LogicalSize::new(340.0, height))).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(OriginalSize(Mutex::new((1000.0, 800.0))))
        .invoke_handler(tauri::generate_handler![enter_mini_mode, exit_mini_mode, resize_mini_mode])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
