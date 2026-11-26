//! Some standalone repacks ship an empty or missing valve.rc, so GoldSrc never runs
//! command-line +commands. Temporarily supply only stuffcmds. Never touch
//! player profiles or replace a nonempty, unrecognized startup script.
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    path::Path,
};

const CONTENTS: &[u8] = b"// 16competitive temporary empty-startup bridge v1\nstuffcmds\n";
#[cfg(windows)]
const MISSING_CONTENTS: &[u8] =
    b"// 16competitive temporary missing-startup bridge v1\nstuffcmds\n";

#[derive(Default)]
pub struct Bridge(Option<File>, bool, Vec<u8>);

// A physical script can be absent while GoldSrc finds one in its fallback
// directory or a PAK. Do not shadow those installations. This repair is for
// the Windows standalone layout reproduced without either source of startup.
#[cfg(windows)]
fn missing_startup_is_unambiguous(game: &Path) -> Result<bool, String> {
    let Some(root) = game.parent() else {
        return Ok(false);
    };
    for directory in [game.to_path_buf(), root.to_path_buf(), root.join("valve")] {
        if directory != game
            && directory
                .join("valve.rc")
                .try_exists()
                .map_err(|e| e.to_string())?
        {
            return Ok(false);
        }
        let entries = match fs::read_dir(&directory) {
            Ok(entries) => entries,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => continue,
            Err(e) => return Err(e.to_string()),
        };
        for entry in entries {
            let entry = entry.map_err(|e| e.to_string())?;
            if entry
                .path()
                .extension()
                .is_some_and(|e| e.eq_ignore_ascii_case("pak"))
            {
                return Ok(false);
            }
        }
    }
    Ok(true)
}

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
        let missing = match fs::symlink_metadata(&path) {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                #[cfg(windows)]
                {
                    if !missing_startup_is_unambiguous(game)? {
                        return Ok(Self::default());
                    }
                    true
                }
                #[cfg(not(windows))]
                {
                    return Ok(Self::default());
                }
            }
            Err(e) => return Err(e.to_string()),
            Ok(_) => false,
        };
        if !missing && ordinary(&path, false)?.len() > 192 {
            return Ok(Self::default());
        }
        let mut options = OpenOptions::new();
        options.read(true).write(true).create_new(missing);
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
        let mut current = Vec::new();
        (&mut file).take(193).read_to_end(&mut current).map_err(|e| e.to_string())?;
        #[cfg(windows)]
        let remove_created = missing || current.starts_with(MISSING_CONTENTS);
        #[cfg(not(windows))]
        let remove_created = false;
        #[cfg(windows)]
        let contents = if remove_created { MISSING_CONTENTS } else { CONTENTS };
        #[cfg(not(windows))]
        let contents = CONTENTS;
        if !current.is_empty() && current != contents {
            // Recognize only the exact form written by handoff, including its generated ID.
            let interrupted = current.strip_prefix(contents)
                .and_then(|tail| std::str::from_utf8(tail).ok())
                .and_then(|tail| tail.strip_prefix("exec 16competitive_web_"))
                .and_then(|id| id.strip_suffix(".cfg\n"))
                .is_some_and(|id| id.len() == 16 && id.bytes().all(|b| b.is_ascii_hexdigit()));
            if !interrupted { return Ok(Self::default()); }
        }
        if current != contents {
            file.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
            file.write_all(contents).map_err(|e| e.to_string())?;
            file.set_len(contents.len() as u64).map_err(|e| e.to_string())?;
            file.sync_all().map_err(|e| e.to_string())?;
        }
        eprintln!("Standalone startup: temporary command bridge active");
        Ok(Self(Some(file), remove_created, contents.to_vec()))
    }

    #[cfg(windows)]
    pub fn handoff(&mut self, filename: &str) -> Result<(), String> {
        let id = filename.strip_prefix("16competitive_web_").and_then(|s| s.strip_suffix(".cfg"))
            .ok_or("Invalid wrapper startup file")?;
        if id.len() != 16 || !id.bytes().all(|b| b.is_ascii_hexdigit()) { return Err("Invalid wrapper startup file".into()); }
        let file = self.0.as_mut().ok_or("Partner wrapper needs an available startup script or must forward launch arguments")?;
        file.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
        let mut actual = vec![0; self.2.len()];
        file.read_exact(&mut actual).map_err(|e| e.to_string())?;
        if file.metadata().map_err(|e| e.to_string())?.len() != actual.len() as u64 || actual != self.2 {
            return Err("Startup script changed during preparation".into());
        }
        let command = format!("exec {filename}\n");
        file.write_all(command.as_bytes()).map_err(|e| e.to_string())?;
        self.2.extend_from_slice(command.as_bytes());
        file.sync_all().map_err(|e| e.to_string())
    }

    pub fn restore(&mut self) -> Result<(), String> {
        let Some(file) = self.0.as_mut() else {
            return Ok(());
        };
        // Keep the original handle: replacing or renaming the path must never
        // make cleanup truncate a different player-owned file.
        let contents = self.2.as_slice();
        if file.metadata().map_err(|e| e.to_string())?.len() == contents.len() as u64 {
            file.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
            let mut current = vec![0; contents.len()];
            file.read_exact(&mut current).map_err(|e| e.to_string())?;
            if current == contents {
                #[cfg(windows)]
                if self.1 {
                    use std::os::windows::io::AsRawHandle;
                    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
                    use windows_sys::Win32::Storage::FileSystem::{
                        FileDispositionInfo, ReOpenFile, SetFileInformationByHandle,
                        FILE_DISPOSITION_INFO, FILE_SHARE_DELETE, FILE_SHARE_READ,
                        FILE_SHARE_WRITE,
                    };
                    // GoldSrc's CRT readers do not share DELETE access. Acquire
                    // it only after the game exits, reopening the held file
                    // object rather than following its possibly replaced path.
                    let deletion = unsafe {
                        ReOpenFile(
                            file.as_raw_handle(),
                            0x00010000,
                            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                            0,
                        )
                    };
                    if deletion == INVALID_HANDLE_VALUE {
                        return Err(std::io::Error::last_os_error().to_string());
                    }
                    let disposition = FILE_DISPOSITION_INFO { DeleteFile: true };
                    // Delete the held file, never whichever file now occupies its path.
                    if unsafe {
                        SetFileInformationByHandle(
                            deletion,
                            FileDispositionInfo,
                            &disposition as *const _ as *const _,
                            std::mem::size_of_val(&disposition) as u32,
                        )
                    } == 0
                    {
                        let error = std::io::Error::last_os_error();
                        unsafe {
                            CloseHandle(deletion);
                        }
                        return Err(error.to_string());
                    }
                    unsafe {
                        CloseHandle(deletion);
                    }
                } else {
                    file.set_len(0).map_err(|e| e.to_string())?;
                    file.sync_all().map_err(|e| e.to_string())?;
                }
                #[cfg(not(windows))]
                {
                    file.set_len(0).map_err(|e| e.to_string())?;
                    file.sync_all().map_err(|e| e.to_string())?;
                }
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

    #[cfg(windows)]
    #[test]
    fn wrapper_handoff_recovers_without_reusing_previous_credentials() {
        let f = Fixture::new();
        fs::write(f.script(), [MISSING_CONTENTS, b"exec 16competitive_web_1234567890abcdef.cfg\n"].concat()).unwrap();
        let mut bridge = Bridge::prepare(&f.0, true).unwrap();
        assert!(bridge.handoff("../other.cfg").is_err());
        bridge.handoff("16competitive_web_0123456789abcdef.cfg").unwrap();
        assert_eq!(fs::read(f.script()).unwrap(), [MISSING_CONTENTS,b"exec 16competitive_web_0123456789abcdef.cfg\n"].concat());
        bridge.restore().unwrap();
        assert!(!f.script().exists());
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

    #[cfg(windows)]
    #[test]
    fn engine_can_read_bridge_without_sharing_delete_access() {
        use std::os::windows::fs::OpenOptionsExt;
        for initially_empty in [false, true] {
            let f = Fixture::new();
            if initially_empty {
                fs::write(f.script(), b"").unwrap();
            }
            let bridge = Bridge::prepare(&f.0, true).unwrap();
            let mut reader = OpenOptions::new()
                .read(true)
                .share_mode(3)
                .open(f.script())
                .unwrap();
            let mut contents = String::new();
            reader.read_to_string(&mut contents).unwrap();
            assert!(contents.ends_with("\nstuffcmds\n"));
            drop(reader);
            drop(bridge);
            assert_eq!(f.script().exists(), initially_empty);
        }
    }

    #[cfg(windows)]
    #[test]
    fn missing_script_is_temporary_and_interrupted_creation_recovers() {
        let f = Fixture::new();
        let mut bridge = Bridge::prepare(&f.0, true).unwrap();
        assert_eq!(fs::read(f.script()).unwrap(), MISSING_CONTENTS);
        bridge.restore().unwrap();
        assert!(!f.script().exists());
        fs::write(f.script(), MISSING_CONTENTS).unwrap();
        drop(Bridge::prepare(&f.0, true).unwrap());
        assert!(!f.script().exists());
    }

    #[cfg(windows)]
    #[test]
    fn missing_script_cleanup_never_deletes_a_replacement_or_edit() {
        let f = Fixture::new();
        let bridge = Bridge::prepare(&f.0, true).unwrap();
        let moved = f.0.join("moved.rc");
        fs::rename(f.script(), &moved).unwrap();
        fs::write(f.script(), b"replacement").unwrap();
        drop(bridge);
        assert_eq!(fs::read(f.script()).unwrap(), b"replacement");
        assert!(!moved.exists());
        fs::remove_file(f.script()).unwrap();
        let bridge = Bridge::prepare(&f.0, true).unwrap();
        fs::write(f.script(), b"player edit").unwrap();
        drop(bridge);
        assert_eq!(fs::read(f.script()).unwrap(), b"player edit");
    }

    #[cfg(windows)]
    #[test]
    fn missing_script_does_not_shadow_archive_or_fallback_startup() {
        let f = Fixture::new();
        let game = f.0.join("cstrike");
        fs::create_dir(&game).unwrap();
        fs::write(f.0.join("pak0.pak"), b"archive").unwrap();
        drop(Bridge::prepare(&game, true).unwrap());
        assert!(!game.join("valve.rc").exists());
        fs::remove_file(f.0.join("pak0.pak")).unwrap();
        fs::create_dir(f.0.join("valve")).unwrap();
        fs::write(f.0.join("valve/valve.rc"), b"fallback startup").unwrap();
        drop(Bridge::prepare(&game, true).unwrap());
        assert!(!game.join("valve.rc").exists());
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
