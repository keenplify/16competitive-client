//! Persistent module updates. Session shutdown never writes game DLLs.
use sha2::{Digest, Sha256};
use std::{fs, io::Read, path::Path};

fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn regular(path: &Path) -> Result<(), String> {
    let meta = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
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
        .map_err(|e| e.to_string())?
        .take(128 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
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
    use std::io::Write;
    regular(path)?;
    let before = hash(&fs::read(path).map_err(|e| e.to_string())?);
    let pending = path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&pending)
            .map_err(|e| e.to_string())?;
        file.write_all(bytes)
            .and_then(|_| file.sync_all())
            .map_err(|e| e.to_string())?;
        regular(path)?;
        if hash(&fs::read(path).map_err(|e| e.to_string())?) != before {
            return Err("Native file changed during update".into());
        }
        fs::rename(&pending, path).map_err(|e| e.to_string())
    })();
    if result.is_err() {
        let _ = fs::remove_file(pending);
    }
    result
}

pub fn replace_owned(path: &Path, expected: &str, bytes: &[u8]) -> Result<(), String> {
    verify_owned(path, expected, bytes)?;
    replace_metadata(path, bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
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
