use percent_encoding::percent_decode_str;
use std::{
    collections::VecDeque,
    fs::File,
    io::Read,
    path::{Component, Path, PathBuf},
    sync::{Arc, Mutex},
};
use tauri::{
    http::{header, Request, Response, StatusCode},
    Manager,
};
use tauri_plugin_fs::FsExt;

const MAX_HTML: usize = 4 * 1024 * 1024;
const MAX_ASSET: usize = 16 * 1024 * 1024;
const CSP: &str = "default-src 'none'; style-src 'unsafe-inline' rvpreview: http://rvpreview.localhost https://rvpreview.localhost; img-src data: rvpreview: http://rvpreview.localhost https://rvpreview.localhost; font-src data: rvpreview: http://rvpreview.localhost https://rvpreview.localhost; base-uri 'none'; form-action 'none'; sandbox";

#[derive(Default)]
pub struct Previews(Mutex<VecDeque<(String, Arc<Preview>)>>);

struct Preview {
    directory: Option<PathBuf>,
    html: String,
}

fn document_directory(path: &Path) -> Option<PathBuf> {
    let path = path.canonicalize().ok()?;
    if !path.is_file() {
        return None;
    }
    path.parent().map(Path::to_owned)
}

#[tauri::command]
pub async fn mount_visual_preview(
    app: tauri::AppHandle,
    path: Option<String>,
    html: String,
) -> Result<String, String> {
    if html.len() > MAX_HTML {
        return Err("HTML preview exceeds 4 MiB".into());
    }
    let directory = if let Some(path) = path {
        let app = app.clone();
        tauri::async_runtime::spawn_blocking(move || {
            let extension = Path::new(&path)
                .extension()
                .and_then(|ext| ext.to_str())
                .map(str::to_ascii_lowercase);
            if !matches!(extension.as_deref(), Some("html" | "htm" | "xhtml"))
                || !app.fs_scope().is_allowed(&path)
            {
                return Err("Open the HTML document first".to_string());
            }
            Ok(document_directory(Path::new(&path)))
        })
        .await
        .map_err(|err| err.to_string())??
    } else {
        None
    };
    let token = uuid::Uuid::new_v4().simple().to_string();
    let state = app.state::<Previews>();
    let mut previews = state.0.lock().map_err(|err| err.to_string())?;
    if previews.len() >= 8 {
        previews.pop_front();
    }
    previews.push_back((token.clone(), Arc::new(Preview { directory, html })));
    Ok(token)
}

#[tauri::command]
pub fn unmount_visual_preview(previews: tauri::State<'_, Previews>, token: String) {
    if let Ok(mut previews) = previews.0.lock() {
        previews.retain(|(key, _)| key != &token);
    }
}

fn asset(preview: &Preview, encoded: &str) -> Option<(&'static str, Vec<u8>)> {
    let decoded = percent_decode_str(encoded).decode_utf8().ok()?;
    if decoded.contains(['\\', ':', '\0']) {
        return None;
    }
    let relative = Path::new(decoded.as_ref());
    if !relative
        .components()
        .all(|part| matches!(part, Component::Normal(_)))
    {
        return None;
    }
    let directory = preview.directory.as_ref()?;
    let path = directory.join(relative).canonicalize().ok()?;
    if !path.starts_with(directory) || !path.is_file() {
        return None;
    }
    let mime = match path.extension()?.to_str()?.to_ascii_lowercase().as_str() {
        "css" => "text/css",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "ico" => "image/x-icon",
        "bmp" => "image/bmp",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        _ => return None,
    };
    let file = File::open(path).ok()?;
    let size = file.metadata().ok()?.len() as usize;
    if size > MAX_ASSET {
        return None;
    }
    let mut data = Vec::with_capacity(size);
    file.take(MAX_ASSET as u64 + 1)
        .read_to_end(&mut data)
        .ok()?;
    (data.len() <= MAX_ASSET).then_some((mime, data))
}

pub fn respond(previews: &Previews, req: Request<Vec<u8>>) -> Response<Vec<u8>> {
    let incoming = || {
        if req.method() != tauri::http::Method::GET {
            return None;
        }
        let (token, path) = req.uri().path().strip_prefix('/')?.split_once('/')?;
        let preview = previews
            .0
            .lock()
            .ok()?
            .iter()
            .find(|(key, _)| key == token)?
            .1
            .clone();
        if path == "_readme_viewer_preview_.html" {
            return Some(("text/html; charset=utf-8", preview.html.as_bytes().to_vec()));
        }
        asset(&preview, path)
    };
    let (status, mime, body) = match incoming() {
        Some((mime, body)) => (StatusCode::OK, mime, body),
        None => (StatusCode::NOT_FOUND, "text/plain", Vec::new()),
    };
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, mime)
        .header(header::CONTENT_SECURITY_POLICY, CSP)
        .header(header::X_CONTENT_TYPE_OPTIONS, "nosniff")
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(header::CACHE_CONTROL, "no-store")
        .header(header::REFERRER_POLICY, "no-referrer")
        .body(body)
        .expect("fixed preview response headers are valid")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn only_preview_resources_inside_the_document_folder_are_served() {
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path().join("project");
        fs::create_dir(&project).unwrap();
        fs::write(project.join("my style.css"), b"p {color: red}").unwrap();
        fs::write(project.join("private.json"), b"secret").unwrap();
        fs::write(dir.path().join("outside.css"), b"secret").unwrap();
        let previews = Previews::default();
        previews.0.lock().unwrap().push_back((
            "token".into(),
            Arc::new(Preview {
                directory: Some(project.clone()),
                html: "<h1>Preview</h1>".into(),
            }),
        ));
        let request = |path: &str| respond(&previews, Request::get(path).body(Vec::new()).unwrap());
        let html = request("/token/_readme_viewer_preview_.html");
        assert_eq!(html.status(), StatusCode::OK);
        assert!(html.headers()[header::CONTENT_SECURITY_POLICY]
            .to_str()
            .unwrap()
            .contains("sandbox"));
        let css = request("/token/my%20style.css");
        assert_eq!(css.headers()[header::CONTENT_TYPE], "text/css");
        assert_eq!(css.body(), b"p {color: red}");
        for path in [
            "/different/my%20style.css",
            "/token/private.json",
            "/token/%2e%2e/outside.css",
            "/token/%2Foutside.css",
            "/token/C%3a%5cfile.css",
        ] {
            assert_eq!(request(path).status(), StatusCode::NOT_FOUND);
        }
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(dir.path().join("outside.css"), project.join("link.css"))
                .unwrap();
            assert_eq!(request("/token/link.css").status(), StatusCode::NOT_FOUND);
        }
    }
}
