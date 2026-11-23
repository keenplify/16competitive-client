//! Persistent module updates. Session shutdown never writes game DLLs.
use sha2::{Digest, Sha256};
use std::{fs, io::Read, path::Path};

pub(crate) fn repair_io_error(error: std::io::Error) -> String {
    #[cfg(windows)]
    if matches!(error.raw_os_error(), Some(5 | 32 | 33 | 740)) {
        return "NATIVE_REPAIR_ELEVATION_REQUIRED".into();
    }
    error.to_string()
}

pub(crate) fn clear_verified_readonly(path: &Path, expected: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::os::windows::fs::{MetadataExt, OpenOptionsExt};
        regular(path)?;
        if fs::metadata(path).map_err(repair_io_error)?.permissions().readonly() {
            let mut file = fs::OpenOptions::new().read(true).access_mode(0x80000000 | 0x100)
                .custom_flags(0x00200000).open(path).map_err(repair_io_error)?;
            let meta = file.metadata().map_err(repair_io_error)?;
            if !meta.is_file() || meta.file_attributes() & 0x400 != 0 || meta.len() > 128*1024*1024 {
                return Err("Invalid managed native file".into());
            }
            let mut bytes = Vec::new();
            (&mut file).take(128*1024*1024 + 1).read_to_end(&mut bytes).map_err(repair_io_error)?;
            if hash(&bytes) != expected { return Err("Native file changed before permission repair".into()); }
            let mut permissions = meta.permissions();
            permissions.set_readonly(false);
            file.set_permissions(permissions).map_err(repair_io_error)?;
        }
    }
    #[cfg(not(windows))]
    let _ = (path, expected);
    Ok(())
}

fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn regular(path: &Path) -> Result<(), String> {
    let meta = fs::symlink_metadata(path).map_err(repair_io_error)?;
    if !meta.is_file() || meta.file_type().is_symlink() || meta.len() > 128 * 1024 * 1024 {
        return Err("Invalid managed native file".into());
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if meta.file_attributes() & 0x400 != 0 {
            return Err("Linked native file rejected".into());
        }
    }
    Ok(())
}

pub fn verify_owned(path: &Path, expected: &str, desired: &[u8]) -> Result<(), String> {
    regular(path)?;
    let mut bytes = Vec::new();
    fs::File::open(path)
        .map_err(repair_io_error)?
        .take(128 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(repair_io_error)?;
    if bytes.len() > 128 * 1024 * 1024 {
        return Err("Native file grew during verification".into());
    }
    // The desired digest permits retrying an interrupted update before its
    // installation journal was committed. Unknown changes are never replaced.
    let current = hash(&bytes);
    if current != expected && current != hash(desired) {
        return Err("Native file changed outside the launcher; preserve it for inspection".into());
    }
    Ok(())
}

pub fn replace_metadata(path: &Path, bytes: &[u8]) -> Result<(), String> {
    regular(path)?;
    let before = fs::read(path).map_err(repair_io_error)?;
    if before == bytes { return Ok(()); }
    replace_checked(path, &hash(&before), bytes)
}

fn replace_checked(path: &Path, before: &str, bytes: &[u8]) -> Result<(), String> {
    use std::io::Write;
    let pending = path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&pending)
            .map_err(repair_io_error)?;
        file.write_all(bytes)
            .and_then(|_| file.sync_all())
            .map_err(repair_io_error)?;
        regular(path)?;
        if hash(&fs::read(path).map_err(repair_io_error)?) != before {
            return Err("Native file changed during update".into());
        }
        clear_verified_readonly(path, before)?;
        fs::rename(&pending, path).map_err(repair_io_error)
    })();
    if result.is_err() {
        let _ = fs::remove_file(pending);
    }
    result
}

pub fn replace_owned(path: &Path, expected: &str, bytes: &[u8]) -> Result<(), String> {
    regular(path)?;
    let current = fs::read(path).map_err(repair_io_error)?;
    if current == bytes { return Ok(()); }
    if hash(&current) != expected {
        return Err("Native file changed outside the launcher; preserve it for inspection".into());
    }
    replace_checked(path, expected, bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(windows)]
    #[test]
    fn readonly_owned_files_are_repaired_but_unknown_files_are_preserved() {
        let dir = std::env::temp_dir().join(format!("16c-readonly-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&dir).unwrap();
        let path = dir.join("module.dll");
        fs::write(&path, b"approved old").unwrap();
        let mut permissions = fs::metadata(&path).unwrap().permissions();
        permissions.set_readonly(true); fs::set_permissions(&path, permissions).unwrap();
        replace_owned(&path, &hash(b"approved old"), b"approved new").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"approved new");
        fs::write(&path, b"unknown change").unwrap();
        let mut permissions = fs::metadata(&path).unwrap().permissions();
        permissions.set_readonly(true); fs::set_permissions(&path, permissions).unwrap();
        assert!(replace_owned(&path, &hash(b"approved old"), b"approved new").is_err());
        assert!(fs::metadata(&path).unwrap().permissions().readonly());
        assert_eq!(fs::read(&path).unwrap(), b"unknown change");
    }
    #[test]
    fn updates_retry_and_unknown_changes_are_preserved() {
        let dir = std::env::temp_dir().join(format!("16c-persistent-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&dir).unwrap();
        let path = dir.join("module.dll");
        fs::write(&path, b"approved old").unwrap();
        let old = hash(b"approved old");
        replace_owned(&path, &old, b"approved new").unwrap();
        replace_owned(&path, &old, b"approved new").unwrap();
        fs::write(&path, b"player changed").unwrap();
        assert!(replace_owned(&path, &old, b"approved new").is_err());
        assert_eq!(fs::read(&path).unwrap(), b"player changed");
        assert!(verify_owned(&dir, &old, b"approved new").is_err());
        #[cfg(unix)]
        {
            let link = dir.join("link.dll");
            std::os::unix::fs::symlink(&path, &link).unwrap();
            assert!(replace_owned(&link, &old, b"approved new").is_err());
        }
        fs::remove_dir_all(dir).unwrap();
    }
}
