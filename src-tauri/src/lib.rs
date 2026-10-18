mod library;

use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, LogicalSize, Manager, Size, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

const MINI_WIDTH: f64 = 340.0;
const MINI_HEIGHT: f64 = 140.0;
const MINI_HEIGHT_EQ: f64 = 280.0;
const NORMAL_MIN_WIDTH: f64 = 400.0;
const NORMAL_MIN_HEIGHT: f64 = 600.0;

// Estat de la finestra abans d'entrar al mode mini, per poder-lo restaurar exactament.
#[derive(Default)]
struct SavedWindow(Mutex<Option<platform::Snapshot>>);

// A macOS no fem servir set_decorations() de tao: reconstrueix el styleMask des de zero
// i l'aplica de forma asíncrona, cosa que trencava la barra de títol, el redimensionat
// i la mida en tornar del mode mini. Desem i restaurem el styleMask i el frame natius.
#[cfg(target_os = "macos")]
mod platform {
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSWindow, NSWindowStyleMask};
    use objc2_foundation::NSRect;
    use tauri::WebviewWindow;

    pub struct Snapshot {
        style_mask: NSWindowStyleMask,
        frame: NSRect,
    }

    // Les ordres síncrones de Tauri s'executen al fil principal, on AppKit ho exigeix.
    fn with_ns_window<T>(window: &WebviewWindow, f: impl FnOnce(&NSWindow) -> T) -> Result<T, String> {
        MainThreadMarker::new().ok_or("Cal executar-ho al fil principal")?;
        let ptr = window.ns_window().map_err(|e| e.to_string())?;
        let ns_window = unsafe { &*(ptr as *const NSWindow) };
        Ok(f(ns_window))
    }

    pub fn snapshot(window: &WebviewWindow) -> Result<Snapshot, String> {
        with_ns_window(window, |w| Snapshot {
            style_mask: w.styleMask(),
            frame: w.frame(),
        })
    }

    pub fn make_borderless(window: &WebviewWindow) -> Result<(), String> {
        with_ns_window(window, |w| w.setStyleMask(NSWindowStyleMask::Borderless))
    }

    pub fn restore(window: &WebviewWindow, saved: &Snapshot) -> Result<(), String> {
        with_ns_window(window, |w| {
            w.setStyleMask(saved.style_mask);
            w.setFrame_display(saved.frame, true);
        })
    }
}

#[cfg(not(target_os = "macos"))]
mod platform {
    use tauri::{LogicalPosition, LogicalSize, Position, Size, WebviewWindow};

    pub struct Snapshot {
        size: LogicalSize<f64>,
        position: LogicalPosition<f64>,
        maximized: bool,
    }

    // inner_size()/outer_position() retornen píxels físics: es converteixen a lògics
    // perquè set_size()/set_position() els interpretin igual en pantalles amb escalat.
    // Si la finestra està maximitzada es desa la mida normal i es torna a maximitzar en sortir.
    pub fn snapshot(window: &WebviewWindow) -> Result<Snapshot, String> {
        let maximized = window.is_maximized().map_err(|e| e.to_string())?;
        if maximized {
            window.unmaximize().map_err(|e| e.to_string())?;
        }
        let scale = window.scale_factor().map_err(|e| e.to_string())?;
        let size = window.inner_size().map_err(|e| e.to_string())?.to_logical(scale);
        let position = window.outer_position().map_err(|e| e.to_string())?.to_logical(scale);
        Ok(Snapshot { size, position, maximized })
    }

    pub fn make_borderless(window: &WebviewWindow) -> Result<(), String> {
        window.set_decorations(false).map_err(|e| e.to_string())?;
        window.set_resizable(false).map_err(|e| e.to_string())
    }

    pub fn restore(window: &WebviewWindow, saved: &Snapshot) -> Result<(), String> {
        window.set_decorations(true).map_err(|e| e.to_string())?;
        window.set_resizable(true).map_err(|e| e.to_string())?;
        window.set_size(Size::Logical(saved.size)).map_err(|e| e.to_string())?;
        window.set_position(Position::Logical(saved.position)).map_err(|e| e.to_string())?;
        if saved.maximized {
            window.maximize().map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}

fn main_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window("main").ok_or_else(|| "No main window".to_string())
}

// Canviar el styleMask reconstrueix la jerarquia de vistes a macOS i el webview perd el
// focus de teclat: sense això les dreceres (Espai, M...) deixen de funcionar.
fn focus_webview(window: &WebviewWindow) -> Result<(), String> {
    let webview: &tauri::Webview = window.as_ref();
    webview.set_focus().map_err(|e| e.to_string())
}

fn set_mini_size(window: &WebviewWindow, height: f64) -> Result<(), String> {
    let size = Size::Logical(LogicalSize::new(MINI_WIDTH, height));
    window.set_min_size(Some(size.clone())).map_err(|e| e.to_string())?;
    window.set_size(size).map_err(|e| e.to_string())
}

#[tauri::command]
fn enter_mini_mode(app: AppHandle, state: tauri::State<SavedWindow>) -> Result<(), String> {
    let window = main_window(&app)?;
    let mut saved = state.0.lock().unwrap();

    if window.is_fullscreen().map_err(|e| e.to_string())? {
        return Err("Surt de la pantalla completa abans d'activar el mode mini".into());
    }

    // Si ja estem en mode mini no sobreescrivim l'estat desat de la finestra normal
    if saved.is_none() {
        *saved = Some(platform::snapshot(&window)?);
    }

    // Finestra sense decoracions per poder moure-la lliurement
    platform::make_borderless(&window)?;
    set_mini_size(&window, MINI_HEIGHT)?;
    window.set_always_on_top(true).map_err(|e| e.to_string())?;
    focus_webview(&window)
}

#[tauri::command]
fn exit_mini_mode(app: AppHandle, state: tauri::State<SavedWindow>) -> Result<(), String> {
    let window = main_window(&app)?;
    let mut saved = state.0.lock().unwrap();

    window.set_always_on_top(false).map_err(|e| e.to_string())?;
    window
        .set_min_size(Some(Size::Logical(LogicalSize::new(NORMAL_MIN_WIDTH, NORMAL_MIN_HEIGHT))))
        .map_err(|e| e.to_string())?;

    match saved.take() {
        Some(snapshot) => {
            // Si la restauració falla conservem l'estat per poder-ho tornar a intentar
            if let Err(e) = platform::restore(&window, &snapshot) {
                *saved = Some(snapshot);
                return Err(e);
            }
        }
        // Sense estat desat la finestra no ha arribat a entrar al mode mini: res a restaurar
        None => {}
    }

    focus_webview(&window)
}

#[tauri::command]
fn resize_mini_mode(app: AppHandle, expanded: bool) -> Result<(), String> {
    let window = main_window(&app)?;
    set_mini_size(&window, if expanded { MINI_HEIGHT_EQ } else { MINI_HEIGHT })
}

// Selector natiu de fitxers o carpeta; retorna les rutes triades (buit si es cancel·la).
// L'escaneig es fa després amb scan_paths perquè la interfície pugui mostrar el progrés.
#[tauri::command]
async fn pick_audio(app: AppHandle, folder: bool) -> Result<Vec<String>, String> {
    let dialog = app.dialog().file();
    let picked = if folder {
        dialog.blocking_pick_folder().into_iter().collect()
    } else {
        dialog
            .add_filter("Àudio", library::AUDIO_EXTENSIONS)
            .blocking_pick_files()
            .unwrap_or_default()
    };

    Ok(picked
        .into_iter()
        .filter_map(|p| p.into_path().ok())
        .map(|p| p.to_string_lossy().into_owned())
        .collect())
}

// Rutes arrossegades a la finestra o restaurades de la sessió anterior
#[tauri::command]
async fn scan_paths(app: AppHandle, paths: Vec<String>) -> Result<Vec<library::ScannedTrack>, String> {
    scan_blocking(app, paths.into_iter().map(PathBuf::from).collect()).await
}

async fn scan_blocking(app: AppHandle, paths: Vec<PathBuf>) -> Result<Vec<library::ScannedTrack>, String> {
    tauri::async_runtime::spawn_blocking(move || library::scan(&app, paths))
        .await
        .map_err(|e| e.to_string())
}

// Caràtula incrustada com a bytes en brut (sense passar per JSON)
#[tauri::command]
async fn get_artwork(path: String) -> Result<tauri::ipc::Response, String> {
    let bytes = tauri::async_runtime::spawn_blocking(move || library::read_artwork(&PathBuf::from(path)))
        .await
        .map_err(|e| e.to_string())?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(SavedWindow::default())
        .invoke_handler(tauri::generate_handler![
            enter_mini_mode,
            exit_mini_mode,
            resize_mini_mode,
            pick_audio,
            scan_paths,
            get_artwork
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
