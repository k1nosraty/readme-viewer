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
    startup_paths_inner(app)
}

fn is_document(path: &Path) -> bool {
    let extension = path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    path.is_file()
        && matches!(
            extension.as_str(),
            "md" | "markdown" | "mdown" | "mdwn" | "mkd" | "txt"
        )
}

// A link clicked inside an open document may lead to another Markdown file or a
// folder's README. Only Markdown/text documents are ever granted, never other files.
#[tauri::command]
fn open_linked_document(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let path = PathBuf::from(path)
        .canonicalize()
        .map_err(|_| "The linked document does not exist".to_string())?;
    let path = if path.is_dir() {
        find_readme(&path, 0).ok_or("No README found in the linked folder")?
    } else {
        path
    };
    if !is_document(&path) {
        return Err("Expected a Markdown or text document".into());
    }
    app.fs_scope()
        .allow_file(&path)
        .map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

fn startup_paths_inner(app: tauri::AppHandle) -> Vec<String> {
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

#[cfg(desktop)]
fn write_browser_preview(directory: &Path, html: &str) -> Result<PathBuf, String> {
    use std::io::Write;
    if html.len() > 8 * 1024 * 1024 || !html.starts_with("<!DOCTYPE html>") || !html.contains("<head>") {
        return Err("Expected a standalone HTML preview smaller than 8 MiB".into());
    }
    std::fs::create_dir_all(directory).map_err(|e| e.to_string())?;
    let mut old: Vec<_> = std::fs::read_dir(directory).map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .filter(|entry| entry.file_name().to_string_lossy().starts_with("preview-")
            && entry.path().extension().and_then(|s| s.to_str()) == Some("html"))
        .collect();
    old.sort_by_key(|entry| entry.file_name());
    let remove = old.len().saturating_sub(7);
    for entry in old.into_iter().take(remove) { let _ = std::fs::remove_file(entry.path()); }
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?.as_nanos();
    let path = directory.join(format!("preview-{stamp}.html"));
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    { use std::os::unix::fs::OpenOptionsExt; options.mode(0o600); }
    let policy = "<head><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src https: http: file: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'\">";
    options.open(&path).map_err(|e| e.to_string())?
        .write_all(html.replacen("<head>", policy, 1).as_bytes()).map_err(|e| e.to_string())?;
    Ok(path)
}

#[tauri::command]
fn preview_in_browser(app: tauri::AppHandle, html: String) -> Result<(), String> {
    #[cfg(desktop)]
    {
        use tauri_plugin_opener::OpenerExt;
        let directory = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("browser-previews");
        let path = write_browser_preview(&directory, &html)?;
        app.opener().open_path(path.to_string_lossy().into_owned(), None::<&str>).map_err(|e| e.to_string())
    }
    #[cfg(mobile)]
    { let _ = (app, html); Err("Local browser previews require the desktop app".into()) }
}

#[cfg(all(test, desktop))]
mod browser_preview_tests {
    use super::*;
    #[test]
    fn browser_preview_is_bounded_and_disables_scripts() {
        let directory = std::env::temp_dir().join(format!("readme-preview-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&directory);
        assert!(write_browser_preview(&directory, "not html").is_err());
        for _ in 0..10 {
            let path = write_browser_preview(&directory, "<!DOCTYPE html><head></head><body>note</body>").unwrap();
            assert!(std::fs::read_to_string(path).unwrap().contains("default-src 'none'"));
        }
        assert!(std::fs::read_dir(&directory).unwrap().count() <= 8);
        std::fs::remove_dir_all(directory).unwrap();
    }
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
            resolve_document_path,
            open_linked_document,
            preview_in_browser
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
