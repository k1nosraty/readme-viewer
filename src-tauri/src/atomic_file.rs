use sha2::{Digest, Sha256};
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};

pub const CONFLICT: &str = "RV_FILE_CHANGED";

pub fn resolve_path(path: &Path) -> io::Result<PathBuf> {
    if !path.is_absolute() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Expected an absolute file path",
        ));
    }
    match path.canonicalize() {
        Ok(path) => Ok(path),
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            let parent = path
                .parent()
                .ok_or_else(|| io::Error::other("Missing parent directory"))?;
            let name = path
                .file_name()
                .ok_or_else(|| io::Error::other("Missing file name"))?;
            Ok(parent.canonicalize()?.join(name))
        }
        Err(error) => Err(error),
    }
}

fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn revision(path: &Path) -> io::Result<Option<String>> {
    match fs::read(path) {
        Ok(bytes) => Ok(Some(digest(&bytes))),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}

fn commit(
    path: &Path,
    staged: tempfile::NamedTempFile,
    before: Option<&str>,
) -> Result<(), String> {
    // Recheck after staging, immediately before replacing the directory entry.
    if revision(path).map_err(|e| e.to_string())?.as_deref() != before {
        return Err(CONFLICT.into());
    }
    if before.is_some() {
        staged.persist(path).map_err(|e| e.error.to_string())?;
    } else {
        staged.persist_noclobber(path).map_err(|e| {
            if e.error.kind() == io::ErrorKind::AlreadyExists {
                CONFLICT.into()
            } else {
                e.error.to_string()
            }
        })?;
    }
    // The replacement is committed; a directory-sync failure must not report a failed save.
    #[cfg(unix)]
    if let Some(parent) = path.parent() {
        if let Ok(directory) = fs::File::open(parent) {
            let _ = directory.sync_all();
        }
    }
    Ok(())
}

pub fn write(path: &Path, bytes: &[u8], expected: Option<&str>) -> Result<String, String> {
    let path = resolve_path(path).map_err(|e| e.to_string())?;
    let before = revision(&path).map_err(|e| e.to_string())?;
    if expected.is_some() && expected != before.as_deref() {
        return Err(CONFLICT.into());
    }
    let permissions = match fs::metadata(&path) {
        Ok(meta) => {
            if meta.permissions().readonly() {
                return Err("The destination is read-only".into());
            }
            Some(meta.permissions())
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => None,
        Err(error) => return Err(error.to_string()),
    };
    let parent = path.parent().ok_or("Missing parent directory")?;
    let mut staged = tempfile::Builder::new()
        .prefix(".readme-viewer-")
        .tempfile_in(parent)
        .map_err(|e| e.to_string())?;
    staged.write_all(bytes).map_err(|e| e.to_string())?;
    if let Some(permissions) = permissions {
        staged
            .as_file()
            .set_permissions(permissions)
            .map_err(|e| e.to_string())?;
    }
    staged.as_file().sync_all().map_err(|e| e.to_string())?;
    commit(&path, staged, before.as_deref())?;
    Ok(digest(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replaces_complete_bytes_and_cleans_staging_files() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("README.md");
        fs::write(&path, b"original").unwrap();
        let bytes = "\u{feff}# سلام\r\n".as_bytes();
        assert_eq!(
            write(&path, bytes, Some(&digest(b"original"))).unwrap(),
            digest(bytes)
        );
        assert_eq!(fs::read(&path).unwrap(), bytes);
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
        write(&dir.path().join("new.md"), b"new", None).unwrap();
    }

    #[test]
    fn conflicts_and_failed_replacements_preserve_the_destination() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("README.md");
        fs::write(&path, b"external edit").unwrap();
        assert_eq!(
            write(&path, b"ours", Some(&digest(b"old"))).unwrap_err(),
            CONFLICT
        );
        let mut staged = tempfile::NamedTempFile::new_in(dir.path()).unwrap();
        staged.write_all(b"ours").unwrap();
        assert_eq!(
            commit(&path, staged, Some(&digest(b"old"))).unwrap_err(),
            CONFLICT
        );
        assert_eq!(fs::read(&path).unwrap(), b"external edit");
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
        assert!(write(dir.path(), b"ours", None).is_err());
        fs::remove_file(&path).unwrap();
        assert_eq!(
            write(&path, b"ours", Some(&digest(b"old"))).unwrap_err(),
            CONFLICT
        );
        assert!(!path.exists());
    }

    #[cfg(unix)]
    #[test]
    fn preserves_permissions_and_symlink_targets() {
        use std::os::unix::fs::{symlink, PermissionsExt};
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("README.md");
        let link = dir.path().join("link.md");
        fs::write(&path, b"old").unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o640)).unwrap();
        symlink(&path, &link).unwrap();
        write(&link, b"new", None).unwrap();
        assert!(fs::symlink_metadata(&link)
            .unwrap()
            .file_type()
            .is_symlink());
        assert_eq!(fs::read(&path).unwrap(), b"new");
        assert_eq!(
            fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o640
        );
        fs::set_permissions(&path, fs::Permissions::from_mode(0o440)).unwrap();
        assert!(write(&path, b"bad", None).is_err());
        assert_eq!(fs::read(&path).unwrap(), b"new");
    }
}
