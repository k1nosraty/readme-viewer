use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{Emitter, Manager};
use tauri_plugin_fs::FsExt;

#[derive(Default)]
struct DroppedDirectories(Mutex<Vec<PathBuf>>);

fn document_paths(args: impl Iterator<Item = String>, cwd: &Path) -> Vec<String> {
    args.filter(|arg| !arg.starts_with('-'))
        .filter_map(|arg| {
            let path = PathBuf::from(arg);
            let path = if path.is_absolute() {
                path
            } else {
                cwd.join(path)
            };
            let path = path.canonicalize().ok()?;
            let extension = path.extension()?.to_str()?.to_ascii_lowercase();
            (path.is_file()
                && matches!(
                    extension.as_str(),
                    "md" | "markdown" | "mdown" | "mdwn" | "mkd" | "txt"
                ))
            .then(|| path.to_string_lossy().into_owned())
        })
        .collect()
}

fn allow_documents(app: &tauri::AppHandle, paths: &[String]) {
    for path in paths {
        let _ = app.fs_scope().allow_file(path);
    }
}

fn record_dropped_directories(app: &tauri::AppHandle, paths: &[PathBuf]) {
    let state = app.state::<DroppedDirectories>();
    if let Ok(mut directories) = state.0.lock() {
        for path in paths {
            if let Ok(path) = path.canonicalize() {
                if path.is_dir() && !directories.contains(&path) {
                    directories.push(path);
                }
            }
        }
    };
}

fn find_readme(directory: &Path, depth: usize) -> Option<PathBuf> {
    let mut entries: Vec<_> = std::fs::read_dir(directory)
        .ok()?
        .filter_map(Result::ok)
        .collect();
    entries.sort_by_key(|entry| entry.file_name());
    for entry in &entries {
        let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
        let kind = entry.file_type().ok()?;
        if kind.is_file()
            && matches!(
                name.as_str(),
                "readme.md"
                    | "readme.markdown"
                    | "readme.mdown"
                    | "readme.mdwn"
                    | "readme.mkd"
                    | "readme.txt"
            )
        {
            return entry.path().canonicalize().ok();
        }
    }
    if depth > 0 {
        for entry in entries {
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') || name == "node_modules" {
                continue;
            }
            if entry.file_type().ok()?.is_dir() {
                if let Some(path) = find_readme(&entry.path(), depth - 1) {
                    return Some(path);
                }
            }
        }
    }
    None
}

#[tauri::command]
fn resolve_document_path(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let path = PathBuf::from(path)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let path = if path.is_dir() {
        let state = app.state::<DroppedDirectories>();
        let directories = state.0.lock().map_err(|e| e.to_string())?;
        if !directories.contains(&path) {
            return Err("Drop a folder to open its README".into());
        }
        find_readme(&path, 3).ok_or("No README found within three directory levels")?
    } else {
        if !app.fs_scope().is_allowed(&path) && !app.asset_protocol_scope().is_allowed(&path) {
            return Err("Select a document using Open first".into());
        }
        path
    };
    let extension = path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !path.is_file()
        || !matches!(
            extension.as_str(),
            "md" | "markdown" | "mdown" | "mdwn" | "mkd" | "txt"
        )
    {
        return Err("Expected a Markdown or text document".into());
    }
    app.fs_scope()
        .allow_file(&path)
        .map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
fn startup_paths(app: tauri::AppHandle) -> Vec<String> {
    #[cfg(desktop)]
    {
        let cwd = std::env::current_dir().unwrap_or_default();
        let paths = document_paths(std::env::args().skip(1), &cwd);
        allow_documents(&app, &paths);
        paths
    }
    #[cfg(mobile)]
    {
        let _ = app;
        Vec::new()
    }
}

// Only a document selected by the native picker, launch arguments or OS drop
// can authorize its parent for read-only asset protocol image access.
#[tauri::command]
fn authorize_document_directory(app: tauri::AppHandle, path: String) -> Result<(), String> {
    if !app.fs_scope().is_allowed(&path) {
        return Err("Select a document using Open first".into());
    }
    let path = PathBuf::from(path)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if !path.is_file() {
        return Err("Expected a document file".into());
    }
    if let Some(parent) = path.parent() {
        app.asset_protocol_scope()
            .allow_directory(parent, true)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
        let paths = document_paths(args.into_iter().skip(1), Path::new(&cwd));
        allow_documents(app, &paths);
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.set_focus();
        }
        let _ = app.emit_to("main", "native-open", paths);
    }));
    builder
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(DroppedDirectories::default())
        .invoke_handler(tauri::generate_handler![
            startup_paths,
            authorize_document_directory,
            resolve_document_path
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) = event {
                record_dropped_directories(window.app_handle(), paths);
                let paths = document_paths(
                    paths.iter().map(|p| p.to_string_lossy().into_owned()),
                    Path::new(""),
                );
                allow_documents(window.app_handle(), &paths);
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run README Viewer");
}
