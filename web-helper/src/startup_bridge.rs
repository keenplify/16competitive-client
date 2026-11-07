//! Some standalone repacks ship an empty valve.rc, so GoldSrc never runs
//! command-line +commands. Temporarily supply only stuffcmds. Never touch
//! player profiles or replace a nonempty, unrecognized startup script.
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    path::Path,
};

const CONTENTS: &[u8] = b"// 16competitive temporary empty-startup bridge v1\nstuffcmds\n";

#[derive(Default)]
pub struct Bridge(Option<File>);

fn ordinary(path: &Path, directory: bool) -> Result<fs::Metadata, String> {
    let metadata = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & 0x400 != 0 {
            return Err("Startup script path is a reparse point".into());
        }
    }
    if metadata.file_type().is_symlink()
        || if directory {
            !metadata.is_dir()
        } else {
            !metadata.is_file()
        }
    {
        return Err("Startup script path is not ordinary".into());
    }
    Ok(metadata)
}

impl Bridge {
    pub fn prepare(game: &Path, enabled: bool) -> Result<Self, String> {
        if !enabled {
            return Ok(Self::default());
        }
        ordinary(game, true)?;
        let path = game.join("valve.rc");
        match fs::symlink_metadata(&path) {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Self::default()),
            Err(e) => return Err(e.to_string()),
            Ok(_) => {}
        }
        let metadata = ordinary(&path, false)?;
        if metadata.len() != 0 && metadata.len() != CONTENTS.len() as u64 {
            return Ok(Self::default());
        }
        let mut options = OpenOptions::new();
        options.read(true).write(true);
        #[cfg(windows)]
        {
            use std::os::windows::fs::OpenOptionsExt;
            options.custom_flags(0x00200000); // FILE_FLAG_OPEN_REPARSE_POINT
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.custom_flags(libc::O_NOFOLLOW);
        }
        let mut file = options.open(&path).map_err(|e| e.to_string())?;
        let metadata = file.metadata().map_err(|e| e.to_string())?;
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            if metadata.file_attributes() & 0x400 != 0 {
                return Err("Startup script handle is a reparse point".into());
            }
        }
        if !metadata.is_file() {
            return Err("Startup script is not a file".into());
        }
        if metadata.len() != 0 {
            // Recognize only our exact interrupted bridge, with bounded reads.
            if metadata.len() != CONTENTS.len() as u64 {
                return Ok(Self::default());
            }
            let mut current = vec![0; CONTENTS.len()];
            file.read_exact(&mut current).map_err(|e| e.to_string())?;
            if current != CONTENTS {
                return Ok(Self::default());
            }
        } else {
            file.write_all(CONTENTS).map_err(|e| e.to_string())?;
            file.sync_all().map_err(|e| e.to_string())?;
        }
        eprintln!("Standalone startup: temporary empty-script command bridge active");
        Ok(Self(Some(file)))
    }

    pub fn restore(&mut self) -> Result<(), String> {
        let Some(file) = self.0.as_mut() else {
            return Ok(());
        };
        // Keep the original handle: replacing or renaming the path must never
        // make cleanup truncate a different player-owned file.
        if file.metadata().map_err(|e| e.to_string())?.len() == CONTENTS.len() as u64 {
            file.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
            let mut current = vec![0; CONTENTS.len()];
            file.read_exact(&mut current).map_err(|e| e.to_string())?;
            if current == CONTENTS {
                file.set_len(0).map_err(|e| e.to_string())?;
                file.sync_all().map_err(|e| e.to_string())?;
            }
        }
        self.0 = None;
        Ok(())
    }
}

impl Drop for Bridge {
    fn drop(&mut self) {
        if self.restore().is_err() {
            eprintln!("Standalone startup: temporary bridge cleanup failed");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Fixture(std::path::PathBuf);
    impl Fixture {
        fn new() -> Self {
            let p = std::env::temp_dir().join(format!("16c-startup-{}", uuid::Uuid::new_v4()));
            fs::create_dir(&p).unwrap();
            Self(p)
        }
        fn script(&self) -> std::path::PathBuf {
            self.0.join("valve.rc")
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            fs::remove_dir_all(&self.0).unwrap();
        }
    }

    #[test]
    fn empty_script_processes_commands_and_restores_original() {
        let f = Fixture::new();
        fs::write(f.script(), b"").unwrap();
        let mut bridge = Bridge::prepare(&f.0, true).unwrap();
        assert_eq!(fs::read(f.script()).unwrap(), CONTENTS);
        assert_eq!(
            String::from_utf8_lossy(CONTENTS)
                .lines()
                .filter(|s| !s.starts_with("//"))
                .collect::<Vec<_>>(),
            vec!["stuffcmds"]
        );
        bridge.restore().unwrap();
        assert_eq!(fs::metadata(f.script()).unwrap().len(), 0);
    }

    #[test]
    fn preserves_missing_nonempty_and_disabled_scripts() {
        let f = Fixture::new();
        drop(Bridge::prepare(&f.0, true).unwrap());
        assert!(!f.script().exists());
        for bytes in [b"".as_slice(), b"player startup".as_slice()] {
            fs::write(f.script(), bytes).unwrap();
            drop(Bridge::prepare(&f.0, false).unwrap());
            assert_eq!(fs::read(f.script()).unwrap(), bytes);
        }
        drop(Bridge::prepare(&f.0, true).unwrap());
        assert_eq!(fs::read(f.script()).unwrap(), b"player startup");
        let same_size = vec![b'x'; CONTENTS.len()];
        fs::write(f.script(), &same_size).unwrap();
        drop(Bridge::prepare(&f.0, true).unwrap());
        assert_eq!(fs::read(f.script()).unwrap(), same_size);
    }

    #[test]
    fn recovers_interrupted_bridge_but_preserves_later_edits() {
        let f = Fixture::new();
        fs::write(f.script(), CONTENTS).unwrap();
        drop(Bridge::prepare(&f.0, true).unwrap());
        assert_eq!(fs::metadata(f.script()).unwrap().len(), 0);
        let bridge = Bridge::prepare(&f.0, true).unwrap();
        fs::write(f.script(), b"player changed this").unwrap();
        drop(bridge);
        assert_eq!(fs::read(f.script()).unwrap(), b"player changed this");
    }

    #[test]
    fn cleanup_retains_original_handle_after_path_replacement() {
        let f = Fixture::new();
        fs::write(f.script(), b"").unwrap();
        let bridge = Bridge::prepare(&f.0, true).unwrap();
        let moved = f.0.join("moved.rc");
        fs::rename(f.script(), &moved).unwrap();
        fs::write(f.script(), b"replacement").unwrap();
        drop(bridge);
        assert_eq!(fs::read(f.script()).unwrap(), b"replacement");
        assert_eq!(fs::metadata(moved).unwrap().len(), 0);
    }

    #[cfg(unix)]
    #[test]
    fn refuses_symlinks() {
        let f = Fixture::new();
        let target = f.0.join("target.rc");
        fs::write(&target, b"").unwrap();
        std::os::unix::fs::symlink(&target, f.script()).unwrap();
        assert!(Bridge::prepare(&f.0, true).is_err());
        assert_eq!(fs::metadata(target).unwrap().len(), 0);
    }
}
