// Only paths already granted by the native file scope are eligible for the next launch.
use std::path::{Path, PathBuf};
use tauri::Manager;
use tauri_plugin_fs::FsExt;

fn manifest(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("session-files.json"))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn remember_session_files(
    app: tauri::AppHandle,
    paths: Vec<String>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = manifest(&app)?;
        if paths.is_empty() {
            return match std::fs::remove_file(path) {
                Err(err) if err.kind() != std::io::ErrorKind::NotFound => Err(err.to_string()),
                _ => Ok(()),
            };
        }
        let known: Vec<_> = paths
            .iter()
            .filter_map(|original| {
                let path = Path::new(original).canonicalize().ok()?;
                (path.is_file() && app.fs_scope().is_allowed(&path)).then_some((original, path))
            })
            .collect();
        let bytes = serde_json::to_vec(&known).map_err(|err| err.to_string())?;
        if std::fs::read(&path).ok().as_deref() != Some(bytes.as_slice()) {
            std::fs::create_dir_all(path.parent().ok_or("Missing session directory")?)
                .map_err(|err| err.to_string())?;
            crate::atomic_file::write(&path, &bytes, None)?;
        }
        Ok(())
    })
    .await
    .map_err(|err| err.to_string())?
}

#[tauri::command]
pub async fn restore_session_files(app: tauri::AppHandle) -> Vec<(String, PathBuf)> {
    tauri::async_runtime::spawn_blocking(move || {
        let Ok(path) = manifest(&app) else {
            return Vec::new();
        };
        let paths = std::fs::read(path)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<Vec<(String, PathBuf)>>(&bytes).ok())
            .unwrap_or_default();
        paths
            .into_iter()
            // A path redirected by a symlink since it was granted needs a fresh selection.
            .filter(|(_, path)| path.canonicalize().as_ref().ok() == Some(path) && path.is_file())
            .filter(|(_, path)| app.fs_scope().allow_file(path).is_ok())
            .collect()
    })
    .await
    .unwrap_or_default()
}
