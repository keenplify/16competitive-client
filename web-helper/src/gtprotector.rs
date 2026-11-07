//! Preserve the launcher's standalone GoldSrc compatibility workaround.
//! Call only while Startup owns the stopped installation.
use std::{fs, path::{Path, PathBuf}};

fn ordinary(path: &Path, directory: bool) -> Result<(), String> {
    let meta = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if meta.file_attributes() & 0x400 != 0 {
            return Err("GTProtector path contains a reparse point".into());
        }
    }
    if meta.file_type().is_symlink() || if directory { !meta.is_dir() } else { !meta.is_file() } {
        return Err("GTProtector path is not an ordinary file or directory".into());
    }
    Ok(())
}

fn directory(path: &Path) -> Result<(), String> {
    match fs::create_dir(path) {
        Ok(()) => {},
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {},
        Err(e) => return Err(e.to_string()),
    }
    ordinary(path, true)
}

pub fn disable_conflicting(root: &Path, steam: bool, next_client: bool) -> Result<usize, String> {
    if steam || next_client { return Ok(0); }
    ordinary(root, true)?;
    let mut modules: Vec<PathBuf> = Vec::new();
    for entry in fs::read_dir(root).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name();
        if name.to_str().is_some_and(|name| name.eq_ignore_ascii_case("gtlib.asi") || name.eq_ignore_ascii_case("gtprotector.asi")) {
            ordinary(&entry.path(), false)?;
            modules.push(entry.path());
        }
    }
    if modules.is_empty() { return Ok(0); }
    let managed = root.join("16competitive");
    directory(&managed)?;
    let backups = managed.join("disabled-gtprotector");
    directory(&backups)?;
    let destination = backups.join(format!("backup-{}", uuid::Uuid::new_v4()));
    fs::create_dir(&destination).map_err(|e| e.to_string())?;
    for source in &modules {
        ordinary(source, false)?;
        let mut name = source.file_name().ok_or("Invalid module filename")?.to_os_string();
        name.push(".disabled");
        fs::rename(source, destination.join(name)).map_err(|e| e.to_string())?;
    }
    Ok(modules.len())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preserves_modules_and_reinstalled_backups_without_touching_other_asi() {
        let root = std::env::temp_dir().join(format!("16c-gt-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        fs::write(root.join("GTlib.asi"), b"original").unwrap();
        fs::write(root.join("GTProtector.asi"), b"second").unwrap();
        fs::write(root.join("audio.asi"), b"untouched").unwrap();
        assert_eq!(disable_conflicting(&root, true, false).unwrap(), 0);
        assert_eq!(disable_conflicting(&root, false, true).unwrap(), 0);
        assert_eq!(disable_conflicting(&root, false, false).unwrap(), 2);
        assert_eq!(disable_conflicting(&root, false, false).unwrap(), 0);
        fs::write(root.join("GTlib.asi"), b"updated").unwrap();
        assert_eq!(disable_conflicting(&root, false, false).unwrap(), 1);
        let mut contents = Vec::new();
        for dir in fs::read_dir(root.join("16competitive/disabled-gtprotector")).unwrap() {
            for file in fs::read_dir(dir.unwrap().path()).unwrap() {
                contents.push(fs::read(file.unwrap().path()).unwrap());
            }
        }
        contents.sort();
        assert_eq!(contents, vec![b"original".to_vec(), b"second".to_vec(), b"updated".to_vec()]);
        assert_eq!(fs::read(root.join("audio.asi")).unwrap(), b"untouched");
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn refuses_symlinked_module_and_backup_directory() {
        use std::os::unix::fs::symlink;
        let root = std::env::temp_dir().join(format!("16c-gt-links-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        fs::write(root.join("outside"), b"keep").unwrap();
        symlink(root.join("outside"), root.join("GTlib.asi")).unwrap();
        assert!(disable_conflicting(&root, false, false).is_err());
        fs::remove_file(root.join("GTlib.asi")).unwrap();
        fs::write(root.join("GTlib.asi"), b"module").unwrap();
        fs::create_dir(root.join("elsewhere")).unwrap();
        symlink(root.join("elsewhere"), root.join("16competitive")).unwrap();
        assert!(disable_conflicting(&root, false, false).is_err());
        assert_eq!(fs::read(root.join("GTlib.asi")).unwrap(), b"module");
        assert_eq!(fs::read(root.join("outside")).unwrap(), b"keep");
        fs::remove_dir_all(root).unwrap();
    }
}
